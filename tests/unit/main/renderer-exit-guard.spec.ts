import { describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
import { prepareRendererExit } from '../../../src/main/utils/renderer-exit-guard'

describe('renderer exit handshake', () => {
  it('asks about drafts before shutdown and leaves the document usable when exit is denied', async () => {
    const dispatchEvent = vi.fn()
    const body = { inert: false }
    const contents = { isDestroyed: () => false, executeJavaScript: vi.fn(async (code: string) =>
      runInNewContext(code, { window: { __CCB_HAS_PENDING_CHANGES__: true, dispatchEvent }, document: { body }, Event: class { constructor(public type: string) {} } })) }
    expect(await prepareRendererExit(contents)).toBe(false)
    expect(dispatchEvent).toHaveBeenCalledOnce()
    expect(dispatchEvent.mock.calls[0][0].type).toBe('ccb:request-exit')
    expect(body.inert).toBe(false)
  })
  it('prevents new interactions only after a clean renderer permits shutdown', async () => {
    const body = { inert: false }
    expect(await prepareRendererExit({ isDestroyed: () => false, executeJavaScript: async (code: string) =>
      runInNewContext(code, { window: {}, document: { body } }) })).toBe(true)
    expect(body.inert).toBe(true)
  })
  it('does not start shutdown when checking live renderer state fails or stalls', async () => {
    expect(await prepareRendererExit({ isDestroyed: () => false, executeJavaScript: async () => { throw new Error('renderer busy') } })).toBe(false)
    vi.useFakeTimers()
    try {
      const checking = prepareRendererExit({ isDestroyed: () => false, executeJavaScript: () => new Promise(() => {}) })
      await vi.advanceTimersByTimeAsync(1500)
      expect(await checking).toBe(false)
    } finally { vi.useRealTimers() }
  })
  it('allows shutdown when no renderer remains', async () => {
    expect(await prepareRendererExit(undefined)).toBe(true)
    const executeJavaScript = vi.fn()
    expect(await prepareRendererExit({ isDestroyed: () => true, executeJavaScript })).toBe(true)
    expect(executeJavaScript).not.toHaveBeenCalled()
  })
})
