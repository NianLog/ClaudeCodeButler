/**
 * @file tests/unit/preload/performance-api.spec.ts
 * @description 验证 preload 将 bounded renderer timing summary 原样转发到性能导出 IPC。
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ElectronAPI } from '../../../src/preload/index'

const { exposeInMainWorld, invoke } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => ({ success: true, data: 'C:\\test\\snapshot.json' }))
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke,
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn()
  }
}))

let electronAPI: ElectronAPI

describe('preload performance API', () => {
  beforeAll(async () => {
    await import('../../../src/preload/index')
    const exposeCall = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI')
    electronAPI = exposeCall?.[1] as ElectronAPI
  })

  it('将 renderer timings 作为唯一 payload 转发给 main', async () => {
    const rendererTimings = [{
      name: 'ccb-app-init-duration' as const,
      entryType: 'MEASURE' as const,
      startTimeMs: 12,
      durationMs: 248.5
    }]

    await electronAPI.performance.exportSnapshot(rendererTimings)

    expect(invoke).toHaveBeenCalledWith('performance:exportSnapshot', rendererTimings)
  })

  it('允许 renderer timings 缺失', async () => {
    await electronAPI.performance.exportSnapshot()

    expect(invoke).toHaveBeenCalledWith('performance:exportSnapshot', undefined)
  })
})
