import http from 'http'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProxyServerConfig } from '../../../src/proxy-server/src/types'

vi.mock('../../../src/proxy-server/src/logger', () => ({
  getLogger: () => ({ log: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
import { createProxyServer } from '../../../src/proxy-server/src/server'

const servers: http.Server[] = []
async function listen(server: http.Server): Promise<string> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
function config(url: string, transformer = 'anthropic'): ProxyServerConfig {
  return {
    host: '127.0.0.1', port: 0,
    managedMode: {
      enabled: true, port: 0, accessToken: 'fixture-caller-token', currentProvider: 'fixture',
      providers: [{ id: 'fixture', name: 'fixture', type: transformer, transformer, apiBaseUrl: url,
        apiKey: 'fixture-upstream-key', models: [], enabled: true, createdAt: 0, updatedAt: 0 }]
    }
  } as ProxyServerConfig
}
const body = { model: 'fixture-model', messages: [{ role: 'user', content: 'hello' }], max_tokens: 100 }
async function post(url: string, headers: Record<string, string> = {}, payload: unknown = body): Promise<Response> {
  return fetch(`${url}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) })
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

describe('standalone proxy boundary', () => {
  it('rejects missing or conflicting credentials before reading an invalid body or reaching upstream', async () => {
    let calls = 0
    const upstream = await listen(http.createServer((_req, res) => { calls++; res.end('{}') }))
    const proxy = await listen(http.createServer(createProxyServer(config(upstream))))
    expect((await post(proxy)).status).toBe(401)
    expect((await post(proxy, { Authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await post(proxy, { Authorization: 'Bearer fixture-caller-token', 'x-api-key': 'wrong' })).status).toBe(401)
    const invalid = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    expect(invalid.status).toBe(401)
    expect(calls).toBe(0)
    expect((await fetch(`${proxy}/health`)).status).toBe(200)
  })

  it('refuses startup without an existing accessToken', () => {
    const settings = config('https://fixture.example')
    delete (settings.managedMode as unknown as { accessToken?: string }).accessToken
    expect(() => createProxyServer(settings)).toThrow(/accessToken/)
  })
  it('refuses binding outside loopback and rejects duplicate Authorization headers', async () => {
    const settings = config('https://fixture.example')
    settings.host = '0.0.0.0'
    expect(() => createProxyServer(settings)).toThrow(/回环/)
    settings.host = '127.0.0.1'
    const proxy = await listen(http.createServer(createProxyServer(settings)))
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const request = http.request(`${proxy}/v1/messages`, { method: 'POST', headers: {
        Authorization: ['Bearer fixture-caller-token', 'Bearer fixture-caller-token'], 'Content-Type': 'application/json'
      } }, response => { response.resume(); resolve(response.statusCode) })
      request.on('error', reject)
      request.end(JSON.stringify(body))
    })
    expect(status).toBe(401)
    const invalid = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'x-api-key': 'fixture-caller-token', 'Content-Type': 'application/json' }, body: '{' })
    expect(invalid.status).toBe(400)
  })

  it.each(['deepseek', 'openrouter'])('uses %s Chat Completions and a provider Bearer key', async transformer => {
    let received: { url?: string; auth?: string; key?: string; body?: Record<string, unknown> } = {}
    const upstream = await listen(http.createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      received = { url: req.url, auth: req.headers.authorization, key: req.headers['x-api-key'] as string, body: JSON.parse(Buffer.concat(chunks).toString()) }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: 'chat-1', model: 'fixture-model', choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }))
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(`${upstream}/v1/`, transformer))))
    const response = await post(proxy, { Authorization: 'Bearer fixture-caller-token' }, { ...body, system: [{ type: 'text', text: 'system' }], temperature: 0.4, stop_sequences: ['END'] })
    expect(response.status).toBe(200)
    expect(received.url).toBe('/v1/chat/completions')
    expect(received.auth).toBe('Bearer fixture-upstream-key')
    expect(received.key).toBeUndefined()
    expect(received.body?.messages).toEqual([{ role: 'system', content: 'system' }, ...body.messages])
    expect(received.body).toMatchObject({ stop: ['END'], temperature: 0.4 })
    expect(await response.json()).toMatchObject({ type: 'message', content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn' })
  })
  it('preserves Anthropic-compatible gateways, beta headers, x-api-key callers and binary-safe SSE passthrough', async () => {
    let received: http.IncomingHttpHeaders = {}
    let receivedPath: string | undefined
    const source = 'event: message_stop\ndata: {"type":"message_stop","text":"中文"}\n\n'
    const upstream = await listen(http.createServer((req, res) => {
      received = req.headers
      receivedPath = req.url
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end(source)
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(`${upstream}/gateway/v1/`))))
    const response = await post(proxy, { 'x-api-key': 'fixture-caller-token', 'anthropic-beta': 'fixture-beta' }, { ...body, stream: true })
    expect(receivedPath).toBe('/gateway/v1/messages')
    expect(received['x-api-key']).toBe('fixture-upstream-key')
    expect(received.authorization).toBeUndefined()
    expect(received['anthropic-beta']).toBe('fixture-beta')
    expect(await response.text()).toBe(source)
  })
  it('uses Gemini native model endpoints, header authentication, systemInstruction and actual STOP reasons', async () => {
    let received: { url?: string; headers?: http.IncomingHttpHeaders; body?: Record<string, unknown> } = {}
    const upstream = await listen(http.createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      received = { url: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ modelVersion: 'gemini-fixture', candidates: [{ content: { parts: [{ text: 'reply' }] }, finishReason: 'STOP' }] }))
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(`${upstream}/v1beta/`, 'gemini'))))
    const response = await post(proxy, { Authorization: 'Bearer fixture-caller-token' }, { ...body, model: 'gemini-fixture', system: 'system' })
    expect(response.status).toBe(200)
    expect(received.url).toBe('/v1beta/models/gemini-fixture:generateContent')
    expect(received.headers?.['x-goog-api-key']).toBe('fixture-upstream-key')
    expect(received.headers?.authorization).toBeUndefined()
    expect(received.body?.model).toBeUndefined()
    expect(received.body?.systemInstruction).toEqual({ parts: [{ text: 'system' }] })
    expect(await response.json()).toMatchObject({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'reply' }] })
  })
  it('uses the Gemini streaming action and alt=sse without leaking its key into the URL', async () => {
    let receivedUrl: string | undefined
    const upstream = await listen(http.createServer((req, res) => {
      receivedUrl = req.url
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end('data: {"candidates":[{"content":{"parts":[{"text":"reply"}]},"finishReason":"STOP"}]}\n\n')
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(`${upstream}/v1beta`, 'gemini'))))
    const response = await post(proxy, { 'x-api-key': 'fixture-caller-token' }, { ...body, model: 'gemini-fixture', stream: true })
    expect(receivedUrl).toBe('/v1beta/models/gemini-fixture:streamGenerateContent?alt=sse')
    expect(await response.text()).toContain('event: message_stop')
  })
  it('decodes split UTF-8 bytes, SSE frames and a late usage event into Anthropic events', async () => {
    const upstream = await listen(http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"中文"},"finish_reason":"stop"}]}\r\n\r\ndata: {"choices":[],"usage":{"completion_tokens":2}}\r\n\r\ndata: [DONE]\r\n\r\n')
      let index = 0
      const timer = setInterval(() => {
        if (index < bytes.length) res.write(bytes.subarray(index, ++index))
        else { clearInterval(timer); res.end() }
      }, 1)
      res.once('close', () => clearInterval(timer))
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(`${upstream}/v1`, 'deepseek'))))
    const response = await post(proxy, { Authorization: 'Bearer fixture-caller-token' }, { ...body, stream: true })
    const text = await response.text()
    expect(text).toContain('"text":"中文"')
    expect(text).not.toContain('\uFFFD')
    expect(text).toContain('event: message_start')
    expect(text).toContain('event: message_stop')
    expect(text).toContain('"output_tokens":2')
    expect(text).not.toContain('[DONE]')
  })
  it('returns an SSE error and no success completion after malformed upstream data', async () => {
    const upstream = await listen(http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.end('data: {invalid\n\n')
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(upstream, 'openrouter'))))
    const response = await post(proxy, { Authorization: 'Bearer fixture-caller-token' }, { ...body, stream: true })
    const text = await response.text()
    expect(text).toContain('event: error')
    expect(text).not.toContain('event: message_stop')
    expect(text).not.toContain('{invalid')
  })
  it('does not follow redirects or send credentials to a second endpoint', async () => {
    let leaked = false
    const destination = await listen(http.createServer((_req, res) => { leaked = true; res.end('{}') }))
    const upstream = await listen(http.createServer((_req, res) => { res.writeHead(307, { Location: destination }); res.end() }))
    const proxy = await listen(http.createServer(createProxyServer(config(upstream))))
    expect((await post(proxy, { 'x-api-key': 'fixture-caller-token' })).status).toBe(502)
    expect(leaked).toBe(false)
  })
  it('preserves upstream status and useful JSON errors while redacting both credentials', async () => {
    const upstream = await listen(http.createServer((_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'quota reached fixture-upstream-key fixture-caller-token' } }))
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(upstream))))
    const response = await post(proxy, { 'x-api-key': 'fixture-caller-token' })
    expect(response.status).toBe(429)
    const text = await response.text()
    expect(text).toContain('quota reached')
    expect(text).not.toContain('fixture-upstream-key')
    expect(text).not.toContain('fixture-caller-token')
  })
  it('times out a stalled ordinary response without retrying and closes upstream', async () => {
    let calls = 0
    let closed = false
    const upstream = await listen(http.createServer((_req, res) => {
      calls++
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.write('{')
      res.once('close', () => { closed = true })
    }))
    const settings = config(upstream)
    settings.managedMode.providers[0].timeout = 150
    const proxy = await listen(http.createServer(createProxyServer(settings)))
    expect((await post(proxy, { 'x-api-key': 'fixture-caller-token' })).status).toBe(504)
    await vi.waitFor(() => expect(closed).toBe(true))
    expect(calls).toBe(1)
  })
  it('cancels a long upstream stream when the caller disconnects', async () => {
    let closed = false
    const upstream = await listen(http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(': keepalive\n\n')
      res.once('close', () => { closed = true })
    }))
    const proxy = await listen(http.createServer(createProxyServer(config(upstream))))
    const controller = new AbortController()
    const response = await fetch(`${proxy}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'fixture-caller-token' }, body: JSON.stringify({ ...body, stream: true }), signal: controller.signal })
    await response.body!.getReader().read()
    controller.abort()
    await vi.waitFor(() => expect(closed).toBe(true))
  })
  it('allows successful SSE to remain idle beyond the response-header deadline', async () => {
    let closed = false
    const upstream = await listen(http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(': keepalive\n\n')
      res.once('close', () => { closed = true })
    }))
    const settings = config(upstream)
    settings.managedMode.providers[0].timeout = 150
    const proxy = await listen(http.createServer(createProxyServer(settings)))
    const response = await post(proxy, { 'x-api-key': 'fixture-caller-token' }, { ...body, stream: true })
    const reader = response.body!.getReader()
    await reader.read()
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(closed).toBe(false)
    await reader.cancel()
    await vi.waitFor(() => expect(closed).toBe(true))
  })
  it('fails before upstream for invalid requests, unsupported native features and unknown protocols', async () => {
    let calls = 0
    const upstream = await listen(http.createServer((_req, res) => { calls++; res.end('{}') }))
    const gemini = await listen(http.createServer(createProxyServer(config(upstream, 'gemini'))))
    expect((await post(gemini, { 'x-api-key': 'fixture-caller-token' }, { ...body, model: 'gemini-fixture', tools: [] })).status).toBe(400)
    const chat = await listen(http.createServer(createProxyServer(config(upstream, 'deepseek'))))
    expect((await post(chat, { 'x-api-key': 'fixture-caller-token' }, { ...body, thinking: { type: 'enabled' } })).status).toBe(400)
    expect((await post(chat, { 'x-api-key': 'fixture-caller-token' }, { ...body, max_tokens: 0 })).status).toBe(400)
    const unknown = await listen(http.createServer(createProxyServer(config(upstream, 'unregistered'))))
    expect((await post(unknown, { 'x-api-key': 'fixture-caller-token' })).status).toBe(502)
    expect(calls).toBe(0)
  })
})
