import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ElectronAPI } from '../../../src/preload/index'

const { exposeInMainWorld, invoke } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async () => ({ success: true }))
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on: vi.fn(), off: vi.fn(), removeListener: vi.fn() }
}))

let electronAPI: ElectronAPI

describe('preload toolRegistry revision contract', () => {
  beforeAll(async () => {
    await import('../../../src/preload/index')
    electronAPI = exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI')?.[1] as ElectronAPI
  })

  it('应将编辑时读取的 revision 原样交给 main', async () => {
    const revision = 'a'.repeat(64)
    await electronAPI.toolRegistry.editArtifact('codex-cli', 'user-config', 'C:\\config.toml', 'model="example"', revision)
    expect(invoke).toHaveBeenCalledWith('toolRegistry:editArtifact', 'codex-cli', 'user-config', 'C:\\config.toml', 'model="example"', revision)
  })

  it('应将缺失目标和预览摘要传给恢复入口', async () => {
    const backupRevision = 'b'.repeat(64)
    await electronAPI.toolRegistry.restoreArtifactBackup('backup-id', 'MISSING', backupRevision)
    expect(invoke).toHaveBeenCalledWith('toolRegistry:restoreArtifactBackup', 'backup-id', 'MISSING', backupRevision)
  })

  it('应只用受控 ID 请求历史内容，不提交读取路径', async () => {
    await electronAPI.toolRegistry.readArtifactBackup('backup-id')
    expect(invoke).toHaveBeenCalledWith('toolRegistry:readArtifactBackup', 'backup-id')
  })
})
