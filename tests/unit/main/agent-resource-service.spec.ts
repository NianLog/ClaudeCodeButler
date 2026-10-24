import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import builtin from '../../../src/shared/builtin-tool-registry.json'
import type { ManagedAgentId, AgentResourceKind } from '../../../src/shared/agent-resources'
import type { ToolDefinition } from '../../../src/shared/tool-registry'

vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

import { AgentResourceService } from '../../../src/main/services/agent-resource-service'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'
import { withAgentResourceMutation } from '../../../src/main/utils/agent-resource-queue'
import { mergeToolRegistryBundles } from '../../../src/main/services/tool-registry-service'
import * as resourceFiles from '../../../src/main/services/agent-resource-files'

let root: string
let definitions: ToolDefinition[]
let service: AgentResourceService
const content = (name: string) => `---\nname: ${name}\ndescription: Test resource\n---\nReview changes.\n`

async function put(relative: string, value: string | Buffer): Promise<void> {
  const file = path.join(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, value)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'ccb-resource-'))
  definitions = structuredClone(builtin.tools) as ToolDefinition[]
  service = new AgentResourceService({
    home: root,
    backupDirectory: path.join(root, '.ccb', 'resource-backups'),
    registryService: { getTool: async (id: string) => definitions.find(tool => tool.toolId === id) } as ToolRegistryService,
    detectionService: new ToolDetectionService({ pathVariables: { HOME: root, CCB_DATA: path.join(root, '.ccb') } })
  })
})

afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function preview(toolId: string, targetToolId: ManagedAgentId, kind: AgentResourceKind = 'MCP', owner = 5) {
  const sources = await service.discoverImportSources({}, owner)
  const source = sources.find(item => item.toolId === toolId && item.kinds.includes(kind))!
  expect(source).toBeTruthy()
  const list = await service.listImportResources({ sourceId: source.sourceId, kind }, owner)
  const value = await service.previewResourceImport({ sourceId: source.sourceId, targetToolId, kind, resourceIds: list.resources.map(item => item.resourceId) }, owner)
  return value
}

describe('AgentResourceService', () => {
  it('constructing and switching all managed targets does not create native directories', async () => {
    for (const toolId of ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity'] as const) {
      for (const kind of ['MCP', 'SKILL', 'SUBAGENT'] as const) {
        expect((await service.listResources({ toolId, kind })).resources).toEqual([])
        expect(await service.discoverResourceBackups({ toolId, kind }, 6)).toEqual([])
      }
    }
    expect(await readdir(root)).toEqual([])
  })

  it('an installed explicit directory restriction remains enforced after definition merge', async () => {
    const installed = structuredClone(builtin) as unknown as import('../../../src/shared/tool-registry').ToolRegistryBundle
    installed.tools[0].definitionVersion = '1.5.0'
    installed.tools[0].artifacts.find(artifact => artifact.artifactId === 'skills')!.capabilities = ['DISCOVER', 'READ']
    definitions = mergeToolRegistryBundles(builtin as unknown as import('../../../src/shared/tool-registry').ToolRegistryBundle, installed)
    expect((await service.listResources({ toolId: 'claude-code', kind: 'SKILL' })).writable).toBe(false)
    await expect(service.saveResource({ toolId: 'claude-code', kind: 'SKILL', name: 'reviewer', content: content('reviewer') })).rejects.toThrow('MANAGE_DIRECTORY')
    expect(await readdir(root)).toEqual([])
  })

  it.each(['claude-code', 'codex-cli', 'gemini-cli', 'antigravity'] as const)('%s supports native MCP, Skill and role create/read/edit/delete', async toolId => {
    for (const kind of ['MCP', 'SKILL', 'SUBAGENT'] as const) {
      const original = kind === 'MCP' ? toolId === 'codex-cli' ? 'command="node"\nargs=["server.js"]\n' : '{"command":"node","args":["server.js"]}' : toolId === 'codex-cli' && kind === 'SUBAGENT' ? 'name="reviewer"\ndescription="Test resource"\ndeveloper_instructions="Review changes."\n' : content('reviewer')
      const saved = await service.saveResource({ toolId, kind, name: 'reviewer', content: original })
      const read = await service.readResource({ toolId, kind, resourceId: saved.resourceId })
      expect(read.content).toContain(kind === 'MCP' ? 'node' : 'Review changes.')
      const changed = await service.saveResource({ toolId, kind, name: 'reviewer', content: original.replace(kind === 'MCP' ? 'server.js' : 'Review changes.', kind === 'MCP' ? 'new.js' : 'Review carefully.'), resourceId: read.resourceId, expectedRevision: read.revision })
      expect(changed.revision).not.toBe(read.revision)
      await expect(service.saveResource({ toolId, kind, name: 'reviewer', content: original, resourceId: read.resourceId, expectedRevision: read.revision })).rejects.toThrow('变化')
      await service.deleteResource({ toolId, kind, resourceId: changed.resourceId, expectedRevision: changed.revision })
      expect((await service.listResources({ toolId, kind })).resources).toEqual([])
    }
  })

  it('preserves legacy native directories when canonical alternatives are absent', async () => {
    await put('.codex/skills/old/SKILL.md', content('old'))
    const item = await service.saveResource({ toolId: 'codex-cli', kind: 'SKILL', name: 'new', content: content('new') })
    expect(item.location).toBe(path.join(root, '.codex', 'skills', 'new', 'SKILL.md'))
    await expect(readFile(path.join(root, '.agents', 'skills', 'new', 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never treats a collection root as a removable Skill package', async () => {
    await put('.claude/skills/SKILL.md', content('stray'))
    await put('.claude/skills/valid/SKILL.md', content('valid'))
    const listed = await service.listResources({ toolId: 'claude-code', kind: 'SKILL' })
    expect(listed.resources.map(item => item.name)).toEqual(['valid'])
    await service.deleteResource({ toolId: 'claude-code', kind: 'SKILL', resourceId: listed.resources[0].resourceId, expectedRevision: listed.resources[0].revision })
    expect(await readFile(path.join(root, '.claude/skills/SKILL.md'), 'utf8')).toBe(content('stray'))
  })

  it('keeps existing native data untouched when backup cannot be created', async () => {
    const saved = await service.saveResource({ toolId: 'claude-code', kind: 'SUBAGENT', name: 'reviewer', content: content('reviewer') })
    await put('.ccb/resource-backups', 'blocked backup directory')
    await expect(service.saveResource({ toolId: 'claude-code', kind: 'SUBAGENT', resourceId: saved.resourceId, expectedRevision: saved.revision, name: saved.name, content: content('reviewer').replace('Review changes.', 'Updated.') })).rejects.toThrow()
    expect(await readFile(saved.location, 'utf8')).toBe(content('reviewer'))
  })

  it.each(['claude-code', 'codex-cli', 'gemini-cli', 'antigravity'] as const)('%s recovers deleted roles and overwritten complete Skill packages through the existing import transaction', async toolId => {
    for (const kind of ['SUBAGENT', 'SKILL'] as const) {
      const query = { toolId, kind }
      const original = toolId === 'codex-cli' && kind === 'SUBAGENT' ? 'name="reviewer"\ndescription="Test resource"\ndeveloper_instructions="Review changes."\n' : content('reviewer')
      const initial = await service.saveResource({ ...query, name: 'reviewer', content: original })
      if (kind === 'SKILL') {
        await writeFile(path.join(path.dirname(initial.location), 'binary.bin'), Buffer.from([0, 255, 127]))
        const current = (await service.listResources(query)).resources[0]
        await service.saveResource({ ...query, name: initial.name, content: original.replace('Review changes.', 'Changed.'), resourceId: current.resourceId, expectedRevision: current.revision })
      } else await service.deleteResource({ ...query, resourceId: initial.resourceId, expectedRevision: initial.revision })
      const sources = await service.discoverResourceBackups(query, 30)
      expect(sources).toHaveLength(1)
      expect(sources[0]).toMatchObject({ scope: 'BACKUP', toolId, kinds: [kind], createdAt: expect.any(String) })
      expect(sources[0].label).toContain('reviewer')
      await expect(service.listImportResources({ sourceId: sources[0].sourceId, kind }, 31)).rejects.toThrow('过期')
      const backup = (await service.listImportResources({ sourceId: sources[0].sourceId, kind }, 30)).resources[0]
      const plan = await service.previewResourceImport({ sourceId: sources[0].sourceId, targetToolId: toolId, kind, resourceIds: [backup.resourceId] }, 30)
      const receipt = await service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: backup.resourceId, action: kind === 'SKILL' ? 'REPLACE' : 'IMPORT' }] }, 30)
      expect(receipt.results).toEqual([{ name: 'reviewer', status: 'IMPORTED' }])
      expect((await service.readResource({ ...query, resourceId: initial.resourceId })).content).toBe(original)
      if (kind === 'SKILL') expect(await readFile(path.join(path.dirname(initial.location), 'binary.bin'))).toEqual(Buffer.from([0, 255, 127]))
    }
  })

  it.each([
    { kind: 'SUBAGENT', operation: 'save' }, { kind: 'SUBAGENT', operation: 'delete' },
    { kind: 'SKILL', operation: 'save' }, { kind: 'SKILL', operation: 'delete' }
  ] as const)('refuses $operation when the $kind backup captures a transient external edit', async ({ kind, operation }) => {
    const query = { toolId: 'claude-code' as const, kind }
    const original = content('reviewer')
    const initial = await service.saveResource({ ...query, name: 'reviewer', content: original })
    let reads = 0
    let spy: { mockRestore(): void }
    if (kind === 'SUBAGENT') {
      const read = resourceFiles.readBounded
      spy = vi.spyOn(resourceFiles, 'readBounded').mockImplementation(async (file, maximum) => {
        if (file !== initial.location || ++reads !== 2) return read(file, maximum)
        await writeFile(file, original.replace('Review changes.', 'Transient external edit.'))
        const bytes = await read(file, maximum)
        await writeFile(file, original)
        return bytes
      })
    } else {
      const read = resourceFiles.readSkillPackage
      spy = vi.spyOn(resourceFiles, 'readSkillPackage').mockImplementation(async directory => {
        if (directory !== path.dirname(initial.location) || ++reads !== (operation === 'save' ? 3 : 2)) return read(directory)
        await writeFile(initial.location, original.replace('Review changes.', 'Transient external edit.'))
        const members = await read(directory)
        await writeFile(initial.location, original)
        return members
      })
    }
    try {
      const mutation = operation === 'save' ? service.saveResource({ ...query, name: initial.name, content: original.replace('Review changes.', 'CCB replacement.'), resourceId: initial.resourceId, expectedRevision: initial.revision }) : service.deleteResource({ ...query, resourceId: initial.resourceId, expectedRevision: initial.revision })
      await expect(mutation).rejects.toThrow('备份快照')
      expect(await readFile(initial.location, 'utf8')).toBe(original)
      expect(await service.discoverResourceBackups(query, 39)).toEqual([])
    } finally { spy.mockRestore() }
  })

  it('does not trust backup original paths and rejects changed metadata, corrupted content and linked backup entries', async () => {
    const query = { toolId: 'claude-code' as const, kind: 'SUBAGENT' as const }
    const initial = await service.saveResource({ ...query, name: 'reviewer', content: content('reviewer') })
    await service.deleteResource({ ...query, resourceId: initial.resourceId, expectedRevision: initial.revision })
    const source = (await service.discoverResourceBackups(query, 32))[0]
    const directory = path.dirname(source.location)
    const metadataFile = path.join(directory, 'metadata.json')
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
    metadata.originalPath = path.join(root, 'outside-secret.md')
    await put('outside-secret.md', 'must not read or overwrite')
    await writeFile(metadataFile, JSON.stringify(metadata))
    await expect(service.listImportResources({ sourceId: source.sourceId, kind: query.kind }, 32)).rejects.toThrow('元数据')
    const refreshed = (await service.discoverResourceBackups(query, 32))[0]
    const backedUp = (await service.listImportResources({ sourceId: refreshed.sourceId, kind: query.kind }, 32)).resources[0]
    const pending = await service.previewResourceImport({ sourceId: refreshed.sourceId, targetToolId: query.toolId, kind: query.kind, resourceIds: [backedUp.resourceId] }, 32)
    await writeFile(source.location, 'tampered')
    await expect(service.applyResourceImport({ previewId: pending.previewId, decisions: [{ resourceId: backedUp.resourceId, action: 'IMPORT' }] }, 32)).rejects.toThrow('校验失败')
    expect(await readFile(path.join(root, 'outside-secret.md'), 'utf8')).toBe('must not read or overwrite')
    await expect(readFile(initial.location)).rejects.toMatchObject({ code: 'ENOENT' })
    await rm(source.location)
    await mkdir(path.join(root, 'linked-backup'))
    await symlink(path.join(root, 'linked-backup'), source.location, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(service.discoverResourceBackups(query, 32)).rejects.toThrow('链接')
  })

  it('restores safely labelled legacy backups and rechecks current registry write permissions before recovery', async () => {
    const query = { toolId: 'claude-code' as const, kind: 'SUBAGENT' as const }
    const initial = await service.saveResource({ ...query, name: 'reviewer', content: content('reviewer') })
    await service.deleteResource({ ...query, resourceId: initial.resourceId, expectedRevision: initial.revision })
    const source = (await service.discoverResourceBackups(query, 34))[0]
    const metadataFile = path.join(path.dirname(source.location), 'metadata.json')
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
    delete metadata.toolId
    delete metadata.name
    await writeFile(metadataFile, JSON.stringify(metadata))
    const legacy = (await service.discoverResourceBackups(query, 34))[0]
    const backup = (await service.listImportResources({ sourceId: legacy.sourceId, kind: query.kind }, 34)).resources[0]
    const plan = await service.previewResourceImport({ sourceId: legacy.sourceId, targetToolId: query.toolId, kind: query.kind, resourceIds: [backup.resourceId] }, 34)
    definitions[0].artifacts.find(artifact => artifact.artifactId === 'subagents')!.capabilities = ['DISCOVER', 'READ']
    await expect(service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: backup.resourceId, action: 'IMPORT' }] }, 34)).rejects.toThrow('MANAGE_DIRECTORY')
    await expect(readFile(initial.location)).rejects.toMatchObject({ code: 'ENOENT' })
    metadata.originalPath = path.join(root, 'outside.md')
    await writeFile(metadataFile, JSON.stringify(metadata))
    expect(await service.discoverResourceBackups(query, 34)).toEqual([])
  })

  it('native managed pairs mutually import all three resources with source paths and attachments intact', async () => {
    const tools = ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity'] as const
    for (const toolId of tools) {
      await service.saveResource({ toolId, kind: 'MCP', name: toolId, content: toolId === 'codex-cli' ? 'command="node"\nargs=["server.js"]\n' : '{"command":"node","args":["server.js"]}' })
      await service.saveResource({ toolId, kind: 'SKILL', name: toolId, content: content(toolId) })
      await service.saveResource({ toolId, kind: 'SUBAGENT', name: toolId, content: toolId === 'codex-cli' ? `name="${toolId}"\ndescription="Test resource"\ndeveloper_instructions="Review changes."\n` : content(toolId) })
    }
    for (const sourceTool of tools) for (const targetToolId of tools) {
      if (sourceTool === targetToolId) continue
      const sources = await service.discoverImportSources({}, 9)
      const source = sources.find(item => item.toolId === sourceTool)!
      for (const kind of ['MCP', 'SKILL', 'SUBAGENT'] as const) {
        const resource = (await service.listImportResources({ sourceId: source.sourceId, kind }, 9)).resources.find(item => item.name === sourceTool)!
        const plan = await service.previewResourceImport({ sourceId: source.sourceId, targetToolId, kind, resourceIds: [resource.resourceId] }, 9)
        expect(plan.items[0].status).toBe('READY')
        const receipt = await service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: resource.resourceId, action: 'IMPORT' }] }, 9)
        expect(receipt.results[0]).toMatchObject({ name: sourceTool, status: 'IMPORTED' })
      }
    }
  }, 60_000)

  it('imports MCP with masked preview but actual bytes, preserves unrelated JSONC and returns an idempotent receipt', async () => {
    await put('.cursor/mcp.json', '{"mcpServers":{"docs":{"command":"node","args":["server.js"],"env":{"TOKEN":"private-value"}}}}')
    await put('.claude.json', '{\n// user comment\n"unknown":9007199254740993123,"mcpServers":{},"projects":{"keep":{}},\n}\n')
    const plan = await preview('cursor', 'claude-code')
    expect(plan.items[0].proposedContent).not.toContain('private-value')
    const input = { previewId: plan.previewId, decisions: [{ resourceId: plan.items[0].resourceId, action: 'IMPORT' as const }] }
    const receipt = await service.applyResourceImport(input, 5)
    expect(receipt.results[0].status).toBe('IMPORTED')
    expect(await service.applyResourceImport(input, 5)).toEqual(receipt)
    await expect(service.applyResourceImport({ ...input, decisions: [] }, 5)).rejects.toThrow('另一组决策')
    const written = await readFile(path.join(root, '.claude.json'), 'utf8')
    expect(written).toContain('private-value')
    expect(written).toContain('// user comment')
    expect(written).toContain('9007199254740993123')
    expect(written).toContain('"projects":{"keep":{}}')
    expect(await readFile(path.join(root, '.cursor', 'mcp.json'), 'utf8')).toContain('private-value')
  })

  it('keeps same-file imports and conflicts skipped unless explicitly resolved', async () => {
    await put('.claude.json', '{"mcpServers":{"same":{"command":"node"}}}')
    const same = await preview('claude-code', 'claude-code')
    expect(same.items[0].status).toBe('IDENTICAL')
    expect((await service.applyResourceImport({ previewId: same.previewId, decisions: [] }, 5)).results[0].status).toBe('SKIPPED')
    await put('.cursor/mcp.json', '{"mcpServers":{"same":{"command":"different"}}}')
    const conflict = await preview('cursor', 'claude-code')
    await expect(service.applyResourceImport({ previewId: conflict.previewId, decisions: [{ resourceId: conflict.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('重名')
    const imported = await service.applyResourceImport({ previewId: conflict.previewId, decisions: [{ resourceId: conflict.items[0].resourceId, action: 'RENAME', name: 'copy' }] }, 5)
    expect(imported.results[0].status).toBe('IMPORTED')
    expect((await service.listResources({ toolId: 'claude-code', kind: 'MCP' })).resources.map(item => item.name)).toEqual(['same', 'copy'])
  })

  it('rejects changed sources, targets, rule permissions and foreign window ids before writes', async () => {
    await put('.cursor/mcp.json', '{"mcpServers":{"docs":{"command":"node"}}}')
    const sourcePlan = await preview('cursor', 'claude-code')
    const request = (id: string) => ({ previewId: id, decisions: [{ resourceId: sourcePlan.items[0].resourceId, action: 'IMPORT' as const }] })
    await expect(service.applyResourceImport(request(sourcePlan.previewId), 8)).rejects.toThrow('过期')
    await put('.cursor/mcp.json', '{"mcpServers":{"docs":{"command":"changed"}}}')
    await expect(service.applyResourceImport(request(sourcePlan.previewId), 5)).rejects.toThrow('来源')
    const targetPlan = await preview('cursor', 'claude-code')
    await put('.claude.json', '{"mcpServers":{},"external":true}')
    await expect(service.applyResourceImport({ ...request(targetPlan.previewId), decisions: [{ resourceId: targetPlan.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('目标配置')
    const rulePlan = await preview('cursor', 'claude-code')
    definitions.find(tool => tool.toolId === 'claude-code')!.artifacts.find(item => item.artifactId === 'mcp-registry')!.capabilities = ['READ']
    await expect(service.applyResourceImport({ ...request(rulePlan.previewId), decisions: [{ resourceId: rulePlan.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('MANAGE_MCP')
    expect(await readFile(path.join(root, '.claude.json'), 'utf8')).toBe('{"mcpServers":{},"external":true}')
  })

  it('imports complete Skill packages and editing only SKILL.md retains binary attachments', async () => {
    await put('.cursor/skills/reviewer/SKILL.md', content('reviewer'))
    const binary = Buffer.from([0, 255, 128, 17])
    await put('.cursor/skills/reviewer/references/image.bin', binary)
    await put('.cursor/skills/reviewer/scripts/never-run.js', 'throw new Error("must not execute")')
    if (process.platform !== 'win32') await chmod(path.join(root, '.cursor/skills/reviewer/scripts/never-run.js'), 0o700)
    const plan = await preview('cursor', 'gemini-cli', 'SKILL')
    expect(plan.items[0].files).toHaveLength(3)
    const receipt = await service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: plan.items[0].resourceId, action: 'IMPORT' }] }, 5)
    expect(receipt.results[0].status).toBe('IMPORTED')
    const query = { toolId: 'gemini-cli' as const, kind: 'SKILL' as const }
    const item = (await service.listResources(query)).resources[0]
    await service.saveResource({ ...query, name: item.name, resourceId: item.resourceId, expectedRevision: item.revision, content: content('reviewer').replace('Review changes.', 'Updated.') })
    expect(await readFile(path.join(root, '.gemini/skills/reviewer/references/image.bin'))).toEqual(binary)
    expect(await readFile(path.join(root, '.gemini/skills/reviewer/scripts/never-run.js'), 'utf8')).toContain('must not execute')
    if (process.platform !== 'win32') expect((await stat(path.join(root, '.gemini/skills/reviewer/scripts/never-run.js'))).mode & 0o100).toBe(0o100)
  })

  it('previews unsupported role permissions as blocked and refuses applying them', async () => {
    await put('.cursor/agents/reviewer.md', content('reviewer').replace('description:', 'readonly: true\ndescription:'))
    const plan = await preview('cursor', 'codex-cli', 'SUBAGENT')
    expect(plan.items[0].status).toBe('BLOCKED')
    await expect(service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: plan.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('阻止')
    await expect(readFile(path.join(root, '.codex/agents/reviewer.toml'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('requires native project authorization, recognizes project TRAE and Pi MCP, and does not expose target paths as input', async () => {
    await put('project/.trae/mcp.json', '{"mcpServers":{}}')
    await put('project/.pi/mcp.json', '{"mcpServers":{"docs":{"url":"https://example.com/mcp"}}}')
    await expect(service.discoverImportSources({ sourceContextId: 'made-up' }, 1)).rejects.toThrow('过期')
    const project = await service.registerProject(path.join(root, 'project'), 1)
    await expect(service.discoverImportSources(project, 2)).rejects.toThrow('过期')
    const found = await service.discoverImportSources(project, 1)
    expect(found.map(source => source.toolId)).toContain('trae')
    expect(found.map(source => source.toolId)).toContain('pi')
    service.releaseOwner(1)
    await expect(service.discoverImportSources(project, 1)).rejects.toThrow('过期')
  })

  it('rejects traversal, linked source trees, oversized files, invalid UTF-8 and malformed target files', async () => {
    await expect(service.saveResource({ toolId: 'claude-code', kind: 'SUBAGENT', name: '../escape', content: content('bad') })).rejects.toThrow('安全文件名')
    await put('.cursor/mcp.json', Buffer.from([0xff, 0xfe]))
    await expect(preview('cursor', 'claude-code')).rejects.toThrow()
    await put('.cursor/mcp.json', ' '.repeat(1024 * 1024 + 1))
    await expect(preview('cursor', 'claude-code')).rejects.toThrow('大小')
    await put('.claude.json', '{broken')
    await expect(service.saveResource({ toolId: 'claude-code', kind: 'MCP', name: 'docs', content: '{"command":"node"}' })).rejects.toThrow('JSON')
    expect(await readFile(path.join(root, '.claude.json'), 'utf8')).toBe('{broken')
    await mkdir(path.join(root, 'real'), { recursive: true })
    await symlink(path.join(root, 'real'), path.join(root, '.linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(service.registerProject(path.join(root, '.linked'), 1)).rejects.toThrow('链接')
  })

  it('bounds MCP item discovery and refuses poisoned source definitions without writing', async () => {
    await put('.cursor/mcp.json', JSON.stringify({ mcpServers: Object.fromEntries(Array.from({ length: 1001 }, (_, index) => [`server-${index}`, { command: 'node' }])) }))
    await expect(preview('cursor', 'claude-code')).rejects.toThrow('1000')
    await put('.cursor/mcp.json', '{"mcpServers":{"bad":{"__proto__":{"command":"node"}}}}')
    await expect(preview('cursor', 'claude-code')).rejects.toThrow('__proto__')
    await expect(readFile(path.join(root, '.claude.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves Gemini native sidecar restrictions and blocks unsupported disable mappings', async () => {
    await put('.gemini/settings.json', '{"mcpServers":{"docs":{"command":"node"}}}')
    await put('.gemini/mcp-server-enablement.json', '{"docs":{"enabled":false}}')
    const disabled = await preview('gemini-cli', 'codex-cli')
    expect(disabled.items[0].status).toBe('READY')
    expect(disabled.items[0].proposedContent).toContain('enabled = false')
    const receipt = await service.applyResourceImport({ previewId: disabled.previewId, decisions: [{ resourceId: disabled.items[0].resourceId, action: 'IMPORT' }] }, 5)
    expect(receipt.results[0].status).toBe('IMPORTED')
    const blocked = await preview('gemini-cli', 'claude-code')
    expect(blocked.items[0].status).toBe('BLOCKED')
    await expect(readFile(path.join(root, '.claude.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await put('.gemini/mcp-server-enablement.json', '// invalid native sidecar\n{}')
    await expect(preview('gemini-cli', 'antigravity')).rejects.toThrow('启停状态损坏')
  })

  it('Gemini policy changes expire an import preview instead of activating a disabled source', async () => {
    await put('.gemini/settings.json', '{"mcpServers":{"docs":{"command":"node"}}}')
    const pending = await preview('gemini-cli', 'codex-cli')
    await put('.gemini/mcp-server-enablement.json', '{"docs":{"enabled":false}}')
    await expect(service.applyResourceImport({ previewId: pending.previewId, decisions: [{ resourceId: pending.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('来源')
    await expect(readFile(path.join(root, '.codex/config.toml'))).rejects.toMatchObject({ code: 'ENOENT' })
    await put('.gemini/settings.json', '{"mcp":{"allowed":[]},"mcpServers":{"docs":{"command":"node"}}}')
    await put('.gemini/mcp-server-enablement.json', '{}')
    expect((await preview('gemini-cli', 'antigravity')).items[0].proposedContent).toContain('"disabled": true')
  })

  it('Claude per-project disable state cannot be silently flattened into a user-wide active server', async () => {
    await put('.claude.json', JSON.stringify({ mcpServers: { docs: { command: 'node' } }, projects: { [path.join(root, 'workspace')]: { disabledMcpServers: ['docs'] } } }))
    const global = await preview('claude-code', 'codex-cli')
    expect(global.items[0].status).toBe('BLOCKED')
    await put('workspace/.mcp.json', '{"mcpServers":{"docs":{"command":"node"}}}')
    const context = await service.registerProject(path.join(root, 'workspace'), 21)
    const source = (await service.discoverImportSources(context, 21)).find(item => item.toolId === 'claude-code')!
    const resource = (await service.listImportResources({ sourceId: source.sourceId, kind: 'MCP' }, 21)).resources[0]
    const project = await service.previewResourceImport({ sourceId: source.sourceId, targetToolId: 'codex-cli', kind: 'MCP', resourceIds: [resource.resourceId] }, 21)
    expect(project.items[0].proposedContent).toContain('enabled = false')
  })

  it('requires explicit valid renaming for target-native names without bypassing permission blocks', async () => {
    await put('.cursor/mcp.json', '{"mcpServers":{"my_server.with-space":{"command":"node"}}}')
    for (const targetToolId of ['claude-code', 'gemini-cli'] as const) {
      const plan = await preview('cursor', targetToolId)
      expect(plan.items[0]).toMatchObject({ status: 'BLOCKED', requiresRename: true })
      await expect(service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: plan.items[0].resourceId, action: 'IMPORT' }] }, 5)).rejects.toThrow('阻止')
      const receipt = await service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: plan.items[0].resourceId, action: 'RENAME', name: 'my-server' }] }, 5)
      expect(receipt.results[0].status).toBe('IMPORTED')
    }
  })

  it('serializes simultaneous creates and legacy mutation jobs without losing either definition', async () => {
    const one = service.saveResource({ toolId: 'gemini-cli', kind: 'MCP', name: 'one', content: '{"command":"node"}' })
    const order: string[] = []
    const legacy = withAgentResourceMutation(async () => { order.push('legacy'); expect((await service.listResources({ toolId: 'gemini-cli', kind: 'MCP' })).resources).toHaveLength(1) })
    const two = service.saveResource({ toolId: 'gemini-cli', kind: 'MCP', name: 'two', content: '{"command":"node"}' })
    await Promise.all([one, legacy, two])
    expect(order).toEqual(['legacy'])
    expect((await service.listResources({ toolId: 'gemini-cli', kind: 'MCP' })).resources.map(item => item.name)).toEqual(['one', 'two'])
  })

  it.each([
    { tool: 'cursor' as const, base: '.cursor', mcp: '.cursor/mcp.json' },
    { tool: 'qoder' as const, base: '.qoder', mcp: '.qoder/settings.json' },
    { tool: 'workbuddy' as const, base: '.codebuddy', mcp: '.codebuddy/.mcp.json' },
    { tool: 'trae' as const, base: 'workspace/.trae', mcp: 'workspace/.trae/mcp.json' },
    { tool: 'pi' as const, base: '.pi/agent', mcp: '.pi/agent/mcp.json' },
    { tool: 'opencode' as const, base: '.config/opencode', mcp: '.config/opencode/opencode.jsonc' }
  ])('$tool native fixtures support automatic discovery, file selection and safe native imports', async profile => {
    const name = `from-${profile.tool}`
    const definition = profile.tool === 'opencode' ? { mcp: { [name]: { type: 'local', command: ['node', 'server.js'], environment: { MODE: 'test' } } } } : { mcpServers: { [name]: { command: 'node', args: ['server.js'], env: { MODE: 'test' } } } }
    await put(profile.mcp, `// source config\n${JSON.stringify(definition)}`)
    await put(`${profile.base}/skills/${name}/SKILL.md`, content(name))
    await put(`${profile.base}/skills/${name}/references/data.bin`, Buffer.from([0, 250, 11]))
    const rolesSupported = profile.tool !== 'pi' && profile.tool !== 'trae'
    if (rolesSupported) await put(`${profile.base}/agents/${name}.md`, profile.tool === 'opencode' ? content(name).replace('description:', 'mode: subagent\ndescription:') : content(name))
    const context = profile.tool === 'trae' ? await service.registerProject(path.join(root, 'workspace'), 12) : {}
    const source = (await service.discoverImportSources(context, 12)).find(item => item.toolId === profile.tool)!
    expect(source.kinds.includes('SUBAGENT')).toBe(rolesSupported)
    for (const kind of ['MCP', 'SKILL', ...(rolesSupported ? ['SUBAGENT'] as const : [])] as const) {
      const resource = (await service.listImportResources({ sourceId: source.sourceId, kind }, 12)).resources[0]
      const targetToolId = kind === 'MCP' ? 'codex-cli' : kind === 'SKILL' ? 'antigravity' : 'gemini-cli'
      const plan = await service.previewResourceImport({ sourceId: source.sourceId, targetToolId, kind, resourceIds: [resource.resourceId] }, 12)
      expect(plan.items[0].status).toBe('READY')
      const receipt = await service.applyResourceImport({ previewId: plan.previewId, decisions: [{ resourceId: resource.resourceId, action: 'IMPORT' }] }, 12)
      expect(receipt.results[0].status).toBe('IMPORTED')
    }
    const manual = await service.registerFile(profile.tool, 'MCP', path.join(root, profile.mcp), 12)
    const manualResource = (await service.listImportResources({ sourceId: manual.sourceId, kind: 'MCP' }, 12)).resources[0]
    const manualPlan = await service.previewResourceImport({ sourceId: manual.sourceId, targetToolId: 'claude-code', kind: 'MCP', resourceIds: [manualResource.resourceId] }, 12)
    expect((await service.applyResourceImport({ previewId: manualPlan.previewId, decisions: [{ resourceId: manualResource.resourceId, action: 'IMPORT' }] }, 12)).results[0].status).toBe('IMPORTED')
    const manualSkill = await service.registerFile(profile.tool, 'SKILL', path.join(root, profile.base, 'skills', name), 12)
    const single = await service.listImportResources({ sourceId: manualSkill.sourceId, kind: 'SKILL' }, 12)
    expect(single.resources).toHaveLength(1)
    expect(await readFile(path.join(root, '.gemini/config/skills', name, 'references/data.bin'))).toEqual(Buffer.from([0, 250, 11]))
    if (!rolesSupported) await expect(service.registerFile(profile.tool, 'SUBAGENT', path.join(root, 'not-read.md'), 12)).rejects.toThrow('通用子 Agent')
  })
})
