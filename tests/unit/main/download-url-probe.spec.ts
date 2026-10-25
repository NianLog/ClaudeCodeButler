import http from 'http'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { probeDownloadUrl } from '../../../src/main/utils/upstream-http-client'

const servers: http.Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

async function listen(handler: http.RequestListener): Promise<URL> {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/asset`)
}

describe('download HEAD probe', () => {
  it('destroys a stalled request after a five-second total deadline', async () => {
    let received!: () => void
    const requestReceived = new Promise<void>(resolve => { received = resolve })
    let closed = false
    const target = await listen((req) => {
      req.socket.once('close', () => { closed = true })
      received()
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const pending = expect(probeDownloadUrl(target)).rejects.toThrow('URL测试超时')
      await requestReceived
      await vi.advanceTimersByTimeAsync(5000)
      await pending
    } finally {
      vi.useRealTimers()
    }
    await vi.waitFor(() => expect(closed).toBe(true))
  })

  it('closes every connection after reading headers instead of keeping a socket occupied or reusable', async () => {
    const connections = new Set<unknown>()
    const closed = new Set<unknown>()
    const connectionHeaders: Array<string | undefined> = []
    const target = await listen((req, res) => {
      connections.add(req.socket)
      req.socket.once('close', () => closed.add(req.socket))
      connectionHeaders.push(req.headers.connection)
      expect(req.method).toBe('HEAD')
      res.writeHead(200, { 'Content-Length': '0' })
      res.end()
    })
    for (let index = 0; index < 2; index++) expect(await probeDownloadUrl(target)).toBe(200)
    expect(connectionHeaders).toEqual(['close', 'close'])
    expect(connections.size).toBe(2)
    await vi.waitFor(() => expect(closed.size).toBe(2))
  })

  it.each([200, 204, 301, 302, 307, 399])('preserves status %i without following redirects', async status => {
    const target = await listen((_req, res) => {
      res.writeHead(status, { Location: 'http://127.0.0.1:1/must-not-follow', 'Content-Length': '0' })
      res.end()
    })
    expect(await probeDownloadUrl(target)).toBe(status)
  })

  it.each([400, 403, 405, 500])('rejects HTTP %i and releases the response', async status => {
    let closed = false
    const target = await listen((req, res) => {
      req.socket.once('close', () => { closed = true })
      res.writeHead(status, { 'Content-Length': '0' })
      res.end()
    })
    await expect(probeDownloadUrl(target)).rejects.toThrow(`HTTP ${status}`)
    await vi.waitFor(() => expect(closed).toBe(true))
  })
})
