import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import builtin from '../../../src/shared/builtin-tool-registry.json'
import type { ToolDefinition } from '../../../src/shared/tool-registry'

const bindings = vi.hoisted(() => new Map<string, (event: unknown, payload?: unknown) => Promise<{ success: boolean; error?: string }>>())
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: unknown, payload?: unknown) => Promise<{ success: boolean; error?: string }>) => bindings.set(name, handler) }, BrowserWindow: { fromWebContents: vi.fn() }, dialog: { showOpenDialog: vi.fn() } }))
vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { AgentResourceService, agentResourceService } from '../../../src/main/services/agent-resource-service'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'
import { setupAgentResourceHandlers } from '../../../src/main/ipc/agent-resource-handlers'
import { withAgentResourceMutation } from '../../../src/main/utils/agent-resource-queue'

let root: string
let definitions: ToolDefinition[]
const event = { sender: { id: 171, once: vi.fn(), isDestroyed: () => false } }
const raw = '{"userId":"private-user","large":9007199254740993123,"mcpServers":{"docs":{"command":"old","unknown":9007199254740993999}},"projects":{"project":{"trust":false,"mcpServers":{"local":{"command":"old"}}}}}'

beforeEach(async () => {
  root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'ccb-resource-ipc-')))
  definitions = structuredClone(builtin.tools) as ToolDefinition[]
  const isolated = new AgentResourceService({ home: root, backupDirectory: path.join(root, '.ccb', 'resource-backups'), registryService: { getTool: async (id: string) => definitions.find(tool => tool.toolId === id) } as ToolRegistryService, detectionService: new ToolDetectionService({ pathVariables: { HOME: root, CCB_DATA: path.join(root, '.ccb') } }) })
  vi.spyOn(agentResourceService, 'saveLegacyMcpConfig').mockImplementation(input => isolated.saveLegacyMcpConfig(input))
  await writeFile(path.join(root, '.claude.json'), raw)
  bindings.clear()
  setupAgentResourceHandlers()
})

afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })

describe('legacy MCP raw IPC authorization', () => {
  const invoke = (value: unknown) => bindings.get('mcp:save-claude-config')!(event, value)

  it('READ-only and customized paths cannot write the fixed Claude file', async () => {
    const mcp = definitions.find(tool => tool.toolId === 'claude-code')!.artifacts.find(item => item.artifactId === 'mcp-registry')!
    mcp.capabilities = ['READ']
    expect((await invoke(JSON.parse(raw))).success).toBe(false)
    mcp.capabilities = ['READ', 'BACKUP', 'MANAGE_MCP']
    mcp.paths = { WINDOWS: ['${HOME}/.custom/claude.json'], MACOS: ['${HOME}/.custom/claude.json'], LINUX: ['${HOME}/.custom/claude.json'] }
    expect((await invoke(JSON.parse(raw))).success).toBe(false)
    expect(await readFile(path.join(root, '.claude.json'), 'utf8')).toBe(raw)
  })

  it('MANAGE_MCP can patch servers but cannot edit other Claude data or project trust', async () => {
    const modified = JSON.parse(raw)
    modified.userId = 'attacker'
    expect(await invoke(modified)).toMatchObject({ success: false, error: expect.stringContaining('受保护') })
    const untrusted = JSON.parse(raw)
    untrusted.projects.project.trust = true
    expect((await invoke(untrusted)).success).toBe(false)
    const valid = JSON.parse(raw)
    valid.mcpServers.docs.command = 'node'
    valid.projects.project.mcpServers.local.command = 'node'
    expect((await invoke(valid)).success).toBe(true)
    const output = await readFile(path.join(root, '.claude.json'), 'utf8')
    expect(output).toContain('9007199254740993123')
    expect(output).toContain('9007199254740993999')
    expect(JSON.parse(output)).toMatchObject({ userId: 'private-user', mcpServers: { docs: { command: 'node' } }, projects: { project: { trust: false, mcpServers: { local: { command: 'node' } } } } })
  })

  it('raw saves use the same queue as native resource mutations and fail if backup fails', async () => {
    let release: () => void = () => undefined
    const barrier = new Promise<void>(resolve => { release = resolve })
    const earlier = withAgentResourceMutation(() => barrier)
    const valid = JSON.parse(raw)
    valid.mcpServers.docs.command = 'node'
    const pending = invoke(valid)
    await Promise.resolve()
    expect(await readFile(path.join(root, '.claude.json'), 'utf8')).toBe(raw)
    await mkdir(path.join(root, '.ccb'), { recursive: true })
    await writeFile(path.join(root, '.ccb', 'resource-backups'), 'not a directory')
    release()
    await earlier
    expect((await pending).success).toBe(false)
    expect(await readFile(path.join(root, '.claude.json'), 'utf8')).toBe(raw)
  })
})
