/**
 * 上游 HTTP 转发客户端（托管模式专用）
 *
 * 取代 axios 转发路径（v1.5.0 移除 axios 依赖）：
 * - 返回 IncomingMessage 原始流，与 axios responseType:'stream' 等价，
 *   流式分支可直接 pipe，语义不变。
 * - 不跟随重定向：托管代理对上游 3xx 透明转发，不替客户端决定重定向目标。
 * - 超时语义与 axios 对齐：仅在「建连到响应头返回」阶段计时（socket 空闲超时），
 *   响应开始后清除计时器，SSE 长流不会被静默期误杀。
 * - 网络错误保留 Node 原生 code（ECONNREFUSED/ENOTFOUND 等），超时统一 ECONNABORTED，
 *   与既有错误映射（504/500 分支）保持一致。
 * - 网络代理走 https-proxy-agent 的 CONNECT 隧道（显式 root 依赖，不再依赖 axios 传递解析）。
 */
import { type ClientRequest, type IncomingMessage, request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { HttpsProxyAgent } from 'https-proxy-agent'

export interface UpstreamRequestOptions {
  url: string
  headers: Record<string, string>
  /** 请求体对象（JSON 序列化后发送，自动设置 content-length） */
  body: unknown
  /** 响应头返回前的超时（毫秒） */
  timeoutMs: number
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
    super(`请求超时（${timeoutMs}ms 内未收到上游响应）`)
  }
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
      ...(opts.proxyUrl ? { agent: new HttpsProxyAgent(opts.proxyUrl) } : {})
    }

    let request: ClientRequest
    try {
      request = transport(target, options)
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    request.setTimeout(opts.timeoutMs, () => {
      request.destroy(new UpstreamTimeoutError(opts.timeoutMs))
    })

    request.on('error', (error: Error & { code?: string }) => {
      reject(error)
    })

    request.on('response', (incoming: IncomingMessage) => {
      // 响应头已返回，停止建连阶段计时；流式长响应由调用方自行管理生命周期
      request.setTimeout(0)
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
export function readBodyStream(stream: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let settled = false

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
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
      resolve(Buffer.concat(chunks))
    })
    stream.on('error', (error: Error) => fail(error))
  })
}
