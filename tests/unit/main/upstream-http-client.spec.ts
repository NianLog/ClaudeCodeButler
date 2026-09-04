/**
 * upstream-http-client 单元测试
 * @description 托管模式上游转发客户端（取代 axios）：本地起 http server
 * 验证 JSON 转发、流式响应、非 2xx 透传、超时映射、网络错误 code、响应体大小上限。
 */

import { describe, it, expect, afterAll } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'
import {
  postUpstream,
  readBodyStream,
  UpstreamHttpError,
  UpstreamTimeoutError
} from '../../../src/main/utils/upstream-http-client'

/** JSON echo server：回显请求体并记录 content-length 校验 */
function startEchoServer(): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('X-Test-Header', 'abc')
      res.end(
        JSON.stringify({
          echo: body.toString('utf8'),
          contentLength: req.headers['content-length'] ?? null,
          accept: req.headers['x-test-accept'] ?? null
        })
      )
    })
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

/** SSE 流式 server：分两块发送事件 */
function startStreamServer(): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write('data: chunk-1\n\n')
    setTimeout(() => {
      res.write('data: chunk-2\n\n')
      res.end()
    }, 30)
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

const servers: http.Server[] = []

afterAll(() => {
  for (const server of servers) {
    server.close()
  }
})

describe('postUpstream', () => {
  it('转发 POST 并返回状态/响应头/流（JSON 请求体自动序列化并设置 content-length）', async () => {
    const { server, url } = await startEchoServer()
    servers.push(server)

    const upstream = await postUpstream({
      url: `${url}/v1/messages`,
      headers: { 'x-test-accept': 'application/json' },
      body: { model: 'test-model', stream: false },
      timeoutMs: 3000
    })

    expect(upstream.status).toBe(200)
    expect(upstream.headers['content-type']).toContain('application/json')
    expect(upstream.headers['x-test-header']).toBe('abc')

    const raw = await readBodyStream(upstream.stream, 1024 * 1024)
    const parsed = JSON.parse(raw.toString('utf8'))
    expect(parsed.echo).toBe(JSON.stringify({ model: 'test-model', stream: false }))
    expect(parsed.contentLength).toBe(String(Buffer.byteLength(JSON.stringify({ model: 'test-model', stream: false }))))
    expect(parsed.accept).toBe('application/json')
  })

  it('上游非 2xx 不抛错：状态透传，由调用方构造 UpstreamHttpError', async () => {
    const server = http.createServer((_req, res) => {
      res.statusCode = 429
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error' } }))
    })
    servers.push(server)
    const url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
      })
    })

    const upstream = await postUpstream({
      url: `${url}/v1/messages`,
      headers: {},
      body: {},
      timeoutMs: 3000
    })

    expect(upstream.status).toBe(429)
    const raw = await readBodyStream(upstream.stream, 1024 * 1024)
    const errorData = JSON.parse(raw.toString('utf8'))
    const error = new UpstreamHttpError({ status: upstream.status, headers: upstream.headers, data: errorData })
    expect(error.response.status).toBe(429)
    expect(error.response.data).toEqual({ type: 'error', error: { type: 'rate_limit_error' } })
    expect(error.code).toBe('ERR_UPSTREAM_HTTP')
  })

  it('流式响应按序转发（SSE 事件顺序保持）', async () => {
    const { server, url } = await startStreamServer()
    servers.push(server)

    const upstream = await postUpstream({
      url: `${url}/v1/messages`,
      headers: {},
      body: { stream: true },
      timeoutMs: 3000
    })

    expect(upstream.status).toBe(200)
    const raw = await readBodyStream(upstream.stream, 1024 * 1024)
    expect(raw.toString('utf8')).toBe('data: chunk-1\n\ndata: chunk-2\n\n')
  })

  it('响应头返回前的空闲超时映射为 ECONNABORTED（UpstreamTimeoutError）', async () => {
    // 接受请求但永不响应的 server
    const server = http.createServer(() => {
      /* 故意不响应 */
    })
    servers.push(server)
    const url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
      })
    })

    const error = await postUpstream({
      url: `${url}/v1/messages`,
      headers: {},
      body: {},
      timeoutMs: 200
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(UpstreamTimeoutError)
    expect((error as UpstreamTimeoutError).code).toBe('ECONNABORTED')
  })

  it('连接失败保留 Node 原生错误 code（ECONNREFUSED）', async () => {
    // 先占用再释放端口，确保连接被拒绝
    const holder = http.createServer(() => undefined)
    const port = await new Promise<number>((resolve) => {
      holder.listen(0, '127.0.0.1', () => resolve((holder.address() as AddressInfo).port))
    })
    await new Promise<void>((resolve) => holder.close(() => resolve()))

    const error = await postUpstream({
      url: `http://127.0.0.1:${port}/v1/messages`,
      headers: {},
      body: {},
      timeoutMs: 2000
    }).catch((e: unknown) => e)

    expect((error as NodeJS.ErrnoException).code).toBe('ECONNREFUSED')
  })

  it('无效 URL 直接拒绝', async () => {
    const error = await postUpstream({
      url: 'not-a-valid-url',
      headers: {},
      body: {},
      timeoutMs: 1000
    }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('无效的上游 URL')
  })
})

describe('readBodyStream', () => {
  it('超过 maxBytes 时中断下载并抛错', async () => {
    const server = http.createServer((_req, res) => {
      res.end('x'.repeat(10_000))
    })
    servers.push(server)
    const url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
      })
    })

    const upstream = await postUpstream({
      url,
      headers: {},
      body: {},
      timeoutMs: 3000
    })

    const error = await readBodyStream(upstream.stream, 100).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('超过 100 bytes')
  })
})
