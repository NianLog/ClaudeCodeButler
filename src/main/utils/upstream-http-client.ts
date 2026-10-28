/**
 * 受控 Node HTTP 客户端（托管转发与下载 HEAD 预检）
 *
 * 取代 axios 转发路径（v1.5.0 移除 axios 依赖）：
 * - 返回 IncomingMessage 原始流，与 axios responseType:'stream' 等价，
 *   流式分支可直接 pipe，语义不变。
 * - 不跟随重定向：托管代理对上游 3xx 透明转发，不替客户端决定重定向目标。
 * - 普通请求使用覆盖建连和正文的总时限；成功 SSE 在响应头后解除时限。
 * - 调用方断连通过 AbortSignal 取消上游，不自动重试。
 * - 网络错误保留 Node 原生 code（ECONNREFUSED/ENOTFOUND 等），超时统一 ECONNABORTED，
 *   与既有错误映射（504/500 分支）保持一致。
 * - 网络代理走 https-proxy-agent 的 CONNECT 隧道（显式 root 依赖，不再依赖 axios 传递解析）。
 */
import { type ClientRequest, type IncomingMessage, request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { checkServerIdentity, type PeerCertificate } from 'tls'
import { HttpsProxyAgent } from 'https-proxy-agent'

export interface UpstreamRequestOptions {
  url: string
  headers: Record<string, string>
  /** 请求体对象（JSON 序列化后发送，自动设置 content-length） */
  body: unknown
  /** 普通请求总时限；stream=true 时仅限制响应头阶段（毫秒） */
  timeoutMs: number
  stream?: boolean
  signal?: AbortSignal
  /** 形如 http://host:port 的 CONNECT 代理地址 */
  proxyUrl?: string
}

export interface UpstreamResponse {
  status: number
  headers: IncomingMessage['headers']
  stream: IncomingMessage
}

/**
 * 上游返回非 2xx 时由调用方抛出。
 * 形状对齐既有错误处理结构（error.response.status/data/headers），无需改写 catch 分支。
 */
export class UpstreamHttpError extends Error {
  public readonly response: {
    status: number
    headers: IncomingMessage['headers']
    data: unknown
  }
  public readonly code = 'ERR_UPSTREAM_HTTP'

  constructor(response: UpstreamHttpError['response']) {
    super(`上游返回 HTTP ${response.status}`)
    this.response = response
  }
}

/** 请求超时：code 与 axios ECONNABORTED 对齐，由调用方映射为 504 */
export class UpstreamTimeoutError extends Error {
  public readonly code = 'ECONNABORTED'

  constructor(timeoutMs: number) {
    super(`请求超时（超过 ${timeoutMs}ms）`)
  }
}

/** 下载预检只取状态；保留既有 2xx/3xx 判定，不跟随重定向。 */
export function probeDownloadUrl(target: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
    // shortcut: 保留 Node HEAD 的 2xx/3xx 行为；2026-11-01 复核 Chromium 替代路径。
    const request = transport(target, { method: 'HEAD', agent: false }, (response) => {
      clearTimeout(deadline)
      const status = response.statusCode ?? 0
      response.once('error', reject)
      response.destroy()
      if (status >= 200 && status < 400) resolve(status)
      else reject(new Error(`HTTP ${status}`))
    })
    const deadline = setTimeout(() => request.destroy(new Error('URL测试超时')), 5000)
    request.once('error', (error) => {
      clearTimeout(deadline)
      reject(error)
    })
    request.end()
  })
}

/**
 * 发起上游 POST，返回原始响应流。
 * 非 2xx 不抛错（由调用方读取错误体后构造 UpstreamHttpError，对齐 axios 非 2xx 抛错语义）。
 */
export function postUpstream(opts: UpstreamRequestOptions): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    let target: URL
    try {
      target = new URL(opts.url)
    } catch {
      reject(new Error(`无效的上游 URL: ${opts.url}`))
      return
    }

    const bodyJson = JSON.stringify(opts.body)
    const headers: Record<string, string> = {
      ...opts.headers,
      'content-length': String(Buffer.byteLength(bodyJson, 'utf8'))
    }

    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
    const options = {
      method: 'POST' as const,
      headers,
      signal: opts.signal,
      // CONNECT 隧道可能丢失目标 host；校验始终绑定规范化后的目标，而非代理或 Host。
      checkServerIdentity: (_hostname: string, cert: PeerCertificate) =>
        checkServerIdentity(target.hostname.replace(/^\[|\]$/g, ''), cert),
      // shortcut: 暂不复用连接；Electron 回补后的连接池专项回归通过后再恢复。
      agent: opts.proxyUrl ? new HttpsProxyAgent(opts.proxyUrl) : false
    }

    let request: ClientRequest
    try {
      request = transport(target, options)
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    let response: IncomingMessage | undefined
    const deadline = setTimeout(() => {
      const error = new UpstreamTimeoutError(opts.timeoutMs)
      response?.destroy(error)
      request.destroy(error)
    }, opts.timeoutMs)

    request.on('error', (error: Error & { code?: string }) => {
      clearTimeout(deadline)
      response?.destroy(error)
      reject(error)
    })

    request.on('response', (incoming: IncomingMessage) => {
      response = incoming
      incoming.on('error', () => clearTimeout(deadline))
      incoming.once('end', () => clearTimeout(deadline))
      incoming.once('close', () => clearTimeout(deadline))
      if (opts.stream && (incoming.statusCode ?? 0) < 400) clearTimeout(deadline)
      resolve({
        status: incoming.statusCode ?? 0,
        headers: incoming.headers,
        stream: incoming
      })
    })

    request.end(bodyJson)
  })
}

/**
 * 读取响应体并限制最大字节数，超限立即中断下载（避免缓冲超大响应占满内存）
 */
export function readBodyStream(stream: IncomingMessage, maxBytes: number, timeoutMs = 120_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false
    const deadline = setTimeout(() => fail(new UpstreamTimeoutError(timeoutMs)), timeoutMs)

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      stream.destroy()
      reject(error)
    }

    stream.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        fail(new Error(`上游响应超过 ${maxBytes} bytes 限制`))
        return
      }
      chunks.push(chunk)
    })
    stream.on('end', () => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve(Buffer.concat(chunks))
    })
    stream.on('error', (error: Error) => fail(error))
    stream.on('close', () => {
      if (!stream.complete) fail(new Error('上游响应未完整接收'))
    })
    if (stream.destroyed && !stream.complete) fail(new Error('上游响应已中断'))
  })
}
