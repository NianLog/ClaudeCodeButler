import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isIP } from 'net'
import type { PeerCertificate } from 'tls'
import type { RequestOptions } from 'https'

const captured = vi.hoisted(() => ({ options: undefined as RequestOptions | undefined }))
vi.mock('https', async () => {
  const actual = await vi.importActual<typeof import('https')>('https')
  const { EventEmitter } = await import('events')
  return { ...actual, request: (_target: URL, options: RequestOptions) => {
    captured.options = options
    const request = new EventEmitter()
    return Object.assign(request, {
      end: () => queueMicrotask(() => request.emit('error', new Error('captured transport'))),
      destroy: vi.fn()
    })
  } }
})

import { postUpstream } from '../../../src/main/utils/upstream-http-client'

beforeEach(() => { captured.options = undefined })

describe('TLS target identity', () => {
  it.each(['127.0.0.1', '0177.0.0.1', '0x7f.0.0.1', '2130706433', '127.1', '１２７.0.0.1', '127。0.0.1', '[::1]', 'localhost', 'example.invalid', 'ｅxample.invalid'])(
    'binds the certificate to URL target %s instead of proxy or Host', async host => {
      const url = new URL(`https://${host}/v1/messages`)
      await expect(postUpstream({ url: url.href, headers: { host: 'proxy.example.invalid' }, body: {}, timeoutMs: 1000, proxyUrl: 'http://127.0.0.1:8080' })).rejects.toThrow('captured transport')
      const check = captured.options?.checkServerIdentity
      expect(check).toBeTypeOf('function')
      const target = url.hostname.replace(/^\[|\]$/g, '')
      const correct = { subjectaltname: `${isIP(target) ? 'IP Address' : 'DNS'}:${target}` } as PeerCertificate
      const wrong = { subjectaltname: 'DNS:proxy.example.invalid' } as PeerCertificate
      expect(check?.('proxy.example.invalid', wrong)).toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
      expect(check?.('proxy.example.invalid', correct)).toBeUndefined()
      expect(captured.options?.rejectUnauthorized).not.toBe(false)
    }
  )
})
