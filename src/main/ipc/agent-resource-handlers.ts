import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { AgentResourcesAPI, AgentResourceKind, ImportToolId } from '@shared/agent-resources'
import { AGENT_RESOURCE_KINDS, IMPORT_AGENT_IDS } from '@shared/agent-resources'
import { agentResourceService } from '../services/agent-resource-service'

const owners = new Set<number>()

export function setupAgentResourceHandlers(): void {
  const register = (method: keyof AgentResourcesAPI | 'mcp:save-claude-config', handler: (payload: never, owner: number, event: Electron.IpcMainInvokeEvent) => Promise<unknown>) => {
    ipcMain.handle(method === 'mcp:save-claude-config' ? method : `agentResources:${method}`, async (event, payload) => {
      const owner = event.sender.id
      if (!owners.has(owner)) {
        owners.add(owner)
        event.sender.once('destroyed', () => { owners.delete(owner); agentResourceService.releaseOwner(owner) })
      }
      try {
        if (event.sender.isDestroyed()) throw new Error('窗口已关闭')
        return { success: true, data: await handler(payload as never, owner, event) }
      } catch (error) { return { success: false, error: error instanceof Error ? error.message : '资源操作失败' } }
    })
  }
  register('mcp:save-claude-config', input => agentResourceService.saveLegacyMcpConfig(input))
  register('listResources', input => agentResourceService.listResources(input))
  register('readResource', input => agentResourceService.readResource(input))
  register('saveResource', input => agentResourceService.saveResource(input))
  register('deleteResource', input => agentResourceService.deleteResource(input))
  register('discoverImportSources', (input, owner) => agentResourceService.discoverImportSources(input, owner))
  register('discoverResourceBackups', (input, owner) => agentResourceService.discoverResourceBackups(input, owner))
  register('listImportResources', (input, owner) => agentResourceService.listImportResources(input, owner))
  register('previewResourceImport', (input, owner) => agentResourceService.previewResourceImport(input, owner))
  register('applyResourceImport', (input, owner) => agentResourceService.applyResourceImport(input, owner))
  register('chooseImportProject', async (_input, owner, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('无法确认请求窗口')
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    if (event.sender.isDestroyed()) throw new Error('窗口已关闭')
    return agentResourceService.registerProject(result.filePaths[0], owner)
  })
  register('chooseImportFile', async (input: { toolId: ImportToolId; kind: AgentResourceKind }, owner, event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !input || !IMPORT_AGENT_IDS.includes(input.toolId) || !AGENT_RESOURCE_KINDS.includes(input.kind)) throw new Error('无法确认请求窗口或导入类型')
    const result = await dialog.showOpenDialog(window, { properties: [input.kind === 'SKILL' ? 'openDirectory' : 'openFile'] })
    if (result.canceled || !result.filePaths[0]) return null
    if (event.sender.isDestroyed()) throw new Error('窗口已关闭')
    return agentResourceService.registerFile(input.toolId, input.kind, result.filePaths[0], owner)
  })
}
