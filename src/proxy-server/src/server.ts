import express from 'express'
import axios from 'axios'
import { createHash, timingSafeEqual } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { StringDecoder } from 'string_decoder'
import { once } from 'events'
import type { Readable } from 'stream'
import type { Request, Response, NextFunction } from 'express'
import type { ProxyServerConfig, ClaudeRequest } from './types.js'
import { getLogger } from './logger.js'
import { getTransformer } from './transformers/index.js'
import { RequestValidationError } from './transformers/chat-completions.js'
import { sseEvent } from './transformers/stream.js'
import { upstreamTransport } from './transport.js'

const packageJson = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'))
const MAX_BODY_BYTES = 50 * 1024 * 1024

function apiError(status: number, message: string): { type: string; error: { type: string; message: string } } {
  const type = status === 401 ? 'authentication_error' : status === 403 ? 'permission_error' : status === 429 ? 'rate_limit_error' : status < 500 ? 'invalid_request_error' : 'api_error'
  return { type: 'error', error: { type, message } }
}

function validateRequest(body: unknown): asserts body is ClaudeRequest {
  const value = body as Partial<ClaudeRequest> | null
  if (!value || typeof value !== 'object' || typeof value.model !== 'string' || !value.model.trim() ||
    !Array.isArray(value.messages) || !value.messages.length || !Number.isSafeInteger(value.max_tokens) || (value.max_tokens ?? 0) <= 0 ||
    (value.stream !== undefined && typeof value.stream !== 'boolean')) {
    throw new RequestValidationError('请求必须包含 model、非空 messages 和正整数 max_tokens')
  }
  if (value.messages.some(message => !message || !['user', 'assistant'].includes(message.role) ||
    (typeof message.content !== 'string' && (!Array.isArray(message.content) || !message.content.length || message.content.some(block => !block || typeof block.type !== 'string'))))) {
    throw new RequestValidationError('messages 中的角色或内容格式无效')
  }
  if ((value.temperature !== undefined && (typeof value.temperature !== 'number' || !Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) ||
    (value.top_p !== undefined && (typeof value.top_p !== 'number' || !Number.isFinite(value.top_p) || value.top_p < 0 || value.top_p > 1)) ||
    (value.stop_sequences !== undefined && (!Array.isArray(value.stop_sequences) || value.stop_sequences.some(sequence => typeof sequence !== 'string')))) {
    throw new RequestValidationError('采样参数或 stop_sequences 格式无效')
  }
}

async function readBody(stream: Readable, maxBytes: number): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    size += chunk.length
    if (size > maxBytes) throw new Error('上游响应超过大小限制')
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createProxyServer(config: ProxyServerConfig): express.Application {
  const token = config.managedMode.accessToken
  if (typeof token !== 'string' || !token.trim() || token !== token.trim()) {
    throw new Error('缺少有效 accessToken；请先在 CCB 中打开托管模式生成凭据，再启动独立代理')
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(config.host)) throw new Error('独立代理只允许监听本机回环地址')
  const expected = createHash('sha256').update(token).digest()
  const app = express()
  const logger = getLogger()
  app.disable('x-powered-by')
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: packageJson.version, timestamp: new Date().toISOString() }))
  app.use('/v1', (req, res, next) => {
    const authorization = req.get('authorization')
    const apiKey = req.get('x-api-key')
    const bearer = authorization?.match(/^Bearer ([^\s,]+)$/i)?.[1]
    const duplicates = ['authorization', 'x-api-key'].some(name => req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length > 1)
    const supplied = bearer || apiKey
    if (duplicates || !supplied || (authorization && !bearer) || (bearer && apiKey && bearer !== apiKey) ||
      !timingSafeEqual(expected, createHash('sha256').update(supplied).digest())) {
      res.status(401).json(apiError(401, '缺少或无效的本地代理访问凭据'))
      return
    }
    next()
  })
  app.use(express.json({ limit: MAX_BODY_BYTES }))
  app.post('/v1/messages', async (req: Request, res: Response) => {
    const controller = new AbortController()
    let upstream: Readable | undefined
    let timedOut = false
    let timer: NodeJS.Timeout | undefined
    const disconnect = (): void => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', disconnect)
    res.once('close', disconnect)
    try {
      validateRequest(req.body)
      const provider = config.managedMode.providers.find(value => value.id === config.managedMode.currentProvider)
      if (!provider?.enabled || !provider.apiKey) throw new Error('当前服务商未配置或未启用')
      const transformer = getTransformer(provider.transformer || (provider.type === 'custom' ? 'anthropic' : provider.type))
      const transformed = await transformer.transformRequest(req.body, provider) as Record<string, unknown>
      const transport = upstreamTransport(provider, transformer.name, req.body, transformed.model)
      if (transformer.name === 'anthropic') {
        transport.headers['anthropic-version'] = req.get('anthropic-version') || '2023-06-01'
        const beta = req.get('anthropic-beta')
        if (beta) transport.headers['anthropic-beta'] = beta
      }
      const requestBody = { ...transformed }
      if (transformer.name === 'gemini') delete requestBody.model
      const timeout = typeof provider.timeout === 'number' && provider.timeout > 0 ? Math.min(provider.timeout, 600_000) : 300_000
      timer = setTimeout(() => { timedOut = true; controller.abort() }, timeout)
      if (req.aborted || res.destroyed) controller.abort()
      const response = await axios({ method: 'POST', url: transport.url, headers: transport.headers,
        data: requestBody, responseType: 'stream', signal: controller.signal, timeout: 0,
        maxRedirects: 0, maxBodyLength: MAX_BODY_BYTES, maxContentLength: MAX_BODY_BYTES, validateStatus: () => true })
      upstream = response.data as Readable
      if (response.status < 200 || response.status >= 300) {
        let detail = ''
        try {
          const body = await readBody(upstream, 64 * 1024) as { error?: { message?: unknown }; message?: unknown }
          const message = body?.error?.message ?? body?.message
          if (typeof message === 'string') detail = `: ${message.split(provider.apiKey).join('[redacted]').split(token).join('[redacted]').slice(0, 1024)}`
        } catch (error) {
          if (timedOut) throw error
          // 非 JSON 或过大的错误体只返回状态，不回显原始页面和请求数据。
        }
        upstream.destroy()
        res.status(response.status >= 400 ? response.status : 502).json(apiError(response.status >= 400 ? response.status : 502, `上游请求失败（HTTP ${response.status}）${detail}`))
        return
      }
      logger.info('处理代理请求', { provider: provider.id, protocol: transformer.name, stream: !!req.body.stream })
      if (!req.body.stream) {
        const result = await transformer.transformResponse(await readBody(upstream, MAX_BODY_BYTES), provider)
        if (!result.model) result.model = String(transformed.model || req.body.model)
        if (!res.destroyed) res.json(result)
        return
      }
      if (!String(response.headers['content-type']).toLowerCase().includes('text/event-stream')) throw new Error('上游未返回 SSE 流')
      clearTimeout(timer)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache')
      res.flushHeaders()
      const stream = transformer.createStreamTransformer?.(String(transformed.model || req.body.model))
      const decoder = new StringDecoder('utf8')
      const write = async (chunk: string | Buffer): Promise<void> => {
        if (chunk.length && !res.write(chunk)) await once(res, 'drain', { signal: controller.signal })
      }
      for await (const chunk of upstream) {
        await write(stream ? stream.push(decoder.write(Buffer.from(chunk))) : chunk)
      }
      if (stream) {
        await write(stream.push(decoder.end()))
        await write(stream.end())
      }
      res.end()
    } catch (error) {
      if (res.destroyed || (controller.signal.aborted && !timedOut)) return
      const status = error instanceof RequestValidationError ? 400 : timedOut ? 504 : 502
      const message = error instanceof RequestValidationError ? error.message : timedOut ? '上游请求超时；请核对执行结果后再决定是否重试' : '上游请求或协议转换失败；请检查服务商协议、模型与连接'
      logger.warn('代理请求失败', { status, code: axios.isAxiosError(error) ? error.code : error instanceof Error ? error.name : 'unknown' })
      if (res.headersSent) res.end(sseEvent('error', { error: apiError(status, message).error }))
      else res.status(status).json(apiError(status, message))
    } finally {
      clearTimeout(timer)
      upstream?.destroy()
      req.off('aborted', disconnect)
      res.off('close', disconnect)
    }
  })
  app.use((_req, res) => res.status(404).json(apiError(404, '请求路径不存在')))
  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500
    res.status(status).json(apiError(status, status === 413 ? '请求正文超过 50 MiB' : status === 400 ? '请求正文不是有效 JSON' : '内部服务器错误'))
  })
  return app
}

export async function startProxyServer(config: ProxyServerConfig): Promise<void> {
  assertSupportedNodeRuntime()
  const app = createProxyServer(config)
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(config.port, config.host, () => {
      getLogger().info('代理服务器已启动', { host: config.host, port: config.port })
      resolve()
    })
    server.on('error', reject)
  })
}

export function assertSupportedNodeRuntime(version = process.versions.node): void {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match || Number(match[1]) !== 24 || Number(match[2]) < 22 || (Number(match[2]) === 22 && Number(match[3]) < 1)) {
    throw new Error('独立代理需要 Node.js 24.22.1 或更新的 24.x 安全版本')
  }
}
