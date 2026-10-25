import { randomUUID } from 'crypto'
import { chmod, mkdir, readdir, lstat, rename } from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
  AgentResource, AgentResourceContent, AgentResourceKind, AgentResourceList, AgentResourceQuery,
  ApplyResourceImportInput, DeleteAgentResourceInput, ImportSource, ImportToolId, ManagedAgentId,
  PreviewResourceImportInput, ReadAgentResourceInput, ResourceImportPreview, ResourceImportReceipt, SaveAgentResourceInput
} from '@shared/agent-resources'
import { AGENT_RESOURCE_KINDS, IMPORT_AGENT_IDS, MANAGED_AGENT_IDS } from '@shared/agent-resources'
import type { ConfigArtifactDefinition, ToolDefinition } from '@shared/tool-registry'
import { ToolArtifactDiscoveryService } from './tool-artifact-discovery-service'
import { ToolDetectionService } from './tool-detection-service'
import { ToolRegistryService, toolRegistryService } from './tool-registry-service'
import { ToolArtifactManagementService } from './tool-artifact-management-service'
import { discoverResourceBackups as findResourceBackups, type ResourceBackup } from './agent-resource-backups'
import { SkillsManagementService } from './skills-management-service'
import { pathManager } from '../utils/path-manager'
import { writeJsonAtomic, writeTextAtomic } from '../utils/atomic-json-writer'
import { withAgentResourceMutation } from '../utils/agent-resource-queue'
import { normalizePathForComparison } from '../utils/path-security'
import { assertNoLinks, digest, exists, MISSING_REVISION, readBounded, readSkillPackage, RESOURCE_MAX_BYTES, safeResourceName, skillRevision, utf8 } from './agent-resource-files'
import { bounded, convertMcp, convertRole, editJsonSubtree, editMcpDocument, emitMcpItem, emitRole, extractMcpItem, extractMcpItems, jsonEqual, normalizeMcp, parseJson, parseMcpDocument, parseMcpItem, parseRole, record, redactPreview, validateSkill } from './agent-resource-codecs'

const SOURCE_TOOLS = IMPORT_AGENT_IDS
const MCP_ARTIFACTS = { 'claude-code': 'mcp-registry', 'codex-cli': 'user-config', 'gemini-cli': 'user-settings', antigravity: 'global-mcp' }
const SOURCE_LABELS: Record<ImportToolId, string> = { 'claude-code': 'Claude Code', 'codex-cli': 'Codex CLI', 'gemini-cli': 'Gemini CLI', antigravity: 'Antigravity', cursor: 'Cursor', qoder: 'Qoder CLI', workbuddy: 'WorkBuddy / CodeBuddy', trae: 'TRAE', pi: 'Pi (pi.dev compatible)', opencode: 'OpenCode' }
const SESSION_MS = 30 * 60 * 1000

interface ResourceEntry extends AgentResourceContent { nativePath: string; nativeName: string; packagePath?: string; mcpDisabled?: boolean; policyError?: string }
interface Location { paths: string[]; primary: string; tool?: ToolDefinition; artifact?: ConfigArtifactDefinition; singlePackage?: boolean }
interface SourceSession { owner: number; expires: number; public: ImportSource; locations: Partial<Record<AgentResourceKind, string[]>>; backup?: ResourceBackup; artifactBackup?: { backupId: string; revision: string } }
interface PreviewSession {
  owner: number; expires: number; public: ResourceImportPreview; source: SourceSession; sourceRevisions: Map<string, string>;
  targetRevision: string; registryRevision: string; converted: Map<string, string>;
  apply?: { fingerprint: string; promise: Promise<ResourceImportReceipt>; completed?: boolean }
}

export interface AgentResourceServiceOptions {
  registryService?: ToolRegistryService
  detectionService?: ToolDetectionService
  home?: string
  backupDirectory?: string
}

/** 三类资源的本地管理与确定性转换；路径只由 main 的 registry 或本机选择器提供。 */
export class AgentResourceService {
  private readonly registry: ToolRegistryService
  private readonly detection: ToolDetectionService
  private readonly discovery: ToolArtifactDiscoveryService
  private readonly artifactManagement: ToolArtifactManagementService
  private readonly home: string
  private readonly backupDirectory: string
  private readonly sources = new Map<string, SourceSession>()
  private readonly projects = new Map<string, { owner: number; directory: string; expires: number }>()
  private readonly previews = new Map<string, PreviewSession>()

  constructor(options: AgentResourceServiceOptions = {}) {
    this.registry = options.registryService ?? toolRegistryService
    this.detection = options.detectionService ?? new ToolDetectionService()
    this.discovery = new ToolArtifactDiscoveryService({ registryService: this.registry, detectionService: this.detection })
    this.home = options.home ?? os.homedir()
    this.backupDirectory = options.backupDirectory ?? path.join(pathManager.appDataDir, 'resource-backups')
    this.artifactManagement = new ToolArtifactManagementService({ discoveryService: this.discovery, ...(options.backupDirectory ? { backupDirectory: path.join(this.backupDirectory, 'artifacts') } : {}) })
  }

  private validateQuery(input: AgentResourceQuery): void {
    if (!record(input) || !MANAGED_AGENT_IDS.includes(input.toolId) || !AGENT_RESOURCE_KINDS.includes(input.kind)) throw new Error('未知管理对象或资源类型')
  }

  private validateName(value: unknown, kind: AgentResourceKind): string {
    if (kind !== 'MCP') return safeResourceName(value)
    if (typeof value !== 'string' || !value || value.length > 128 || /[\0\r\n]/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) throw new Error('MCP 名称无效')
    return value
  }

  private validateResourceId(value: unknown): void {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('资源标识无效，请刷新')
  }

  private validateTargetName(value: unknown, kind: AgentResourceKind, tool: ManagedAgentId): string {
    const name = this.validateName(value, kind)
    if (kind === 'MCP' && tool === 'claude-code' && (!/^[A-Za-z0-9_-]+$/.test(name) || ['workspace', 'claude-in-chrome', 'computer-use', 'claude preview', 'claude browser'].includes(name.toLowerCase()))) throw new Error('Claude MCP 名称只允许字母、数字、下划线和连字符，且不能占用内置服务器名；请选择另名')
    if (kind === 'MCP' && tool === 'gemini-cli' && name.includes('_')) throw new Error('Gemini 名称中的下划线会影响原生权限规则，请显式另名为连字符形式')
    return name
  }

  private async location(input: AgentResourceQuery, write = false): Promise<Location> {
    this.validateQuery(input)
    const tool = await this.registry.getTool(input.toolId)
    if (!tool) throw new Error('当前规则库没有该工具')
    const id = input.kind === 'MCP' ? MCP_ARTIFACTS[input.toolId] : input.kind === 'SKILL' ? 'skills' : 'subagents'
    const artifact = tool.artifacts.find(item => item.artifactId === id)
    if (!artifact) throw new Error('当前规则库未声明该资源；请更新规则库，不会改写旧路径')
    if (input.kind === 'MCP' && (input.toolId === 'codex-cli' ? artifact.format !== 'TOML' || artifact.handler !== 'TOML_FILE_V1' : !['JSON', 'JSONC'].includes(artifact.format) || artifact.handler !== 'JSON_FILE_V1')) throw new Error('MCP 文件 format/handler 与当前工具不匹配')
    if (input.kind !== 'MCP' && artifact.handler !== (input.kind === 'SKILL' ? 'SKILL_DIRECTORY_V1' : 'SUBAGENT_DIRECTORY_V1')) throw new Error('资源目录 handler 不匹配')
    if (input.kind !== 'MCP' && artifact.format !== (input.toolId === 'codex-cli' && input.kind === 'SUBAGENT' ? 'TOML' : 'MARKDOWN')) throw new Error('资源目录 format 不匹配')
    const paths = (artifact.paths[this.detection.getPlatform()] ?? []).map(template => this.detection.resolvePath(template))
    for (const candidate of paths) await this.discovery.authorizeArtifact(input.toolId, id, candidate, write ? input.kind === 'MCP' ? 'MANAGE_MCP' : 'MANAGE_DIRECTORY' : 'READ')
    if (!paths.length) throw new Error('当前平台没有已授权的资源路径')
    const existing = []
    for (const candidate of paths) if (await exists(candidate)) existing.push(candidate)
    return { paths, primary: existing[0] ?? paths[0], tool, artifact }
  }

  async authorizeLegacyWrite(kind: AgentResourceKind): Promise<void> {
    const location = await this.location({ toolId: 'claude-code', kind }, true)
    const expected = kind === 'MCP' ? path.join(this.home, '.claude.json') : path.join(this.home, '.claude', kind === 'SKILL' ? 'skills' : 'agents')
    if (!location.paths.some(candidate => normalizePathForComparison(candidate) === normalizePathForComparison(expected))) throw new Error('旧 Claude 入口的固定路径不在当前规则库允许范围内')
  }

  /** 兼容旧 MCP JSON 编辑器；MANAGE_MCP 仅授权 MCP 子树，不授予整份 Claude 数据的 EDIT。 */
  async saveLegacyMcpConfig(input: unknown): Promise<void> {
    return withAgentResourceMutation(async () => {
      if (!record(input)) throw new Error('Claude 配置必须是对象')
      bounded(input)
      const serialized = JSON.stringify(input)
      this.assertContent(serialized)
      const incoming = parseJson(serialized)
      const query = { toolId: 'claude-code' as const, kind: 'MCP' as const }
      await this.authorizeLegacyWrite('MCP')
      const location = await this.location(query, true)
      const initial = await readBounded(location.primary)
      const original = initial ? utf8(initial) : '{}\n'
      const current = parseJson(original)
      const protectedFields = (value: Record<string, unknown>) => {
        const result = { ...value }
        delete result.mcpServers
        if (record(result.projects)) result.projects = Object.fromEntries(Object.entries(result.projects).map(([key, project]) => {
          if (!record(project)) return [key, project]
          const metadata = { ...project }
          delete metadata.mcpServers
          return [key, metadata]
        }))
        return result
      }
      if (!jsonEqual(protectedFields(current), protectedFields(incoming))) throw new Error('此入口仅允许修改 MCP 服务器；其他 Claude 字段与项目元数据受保护')
      const checkServers = (value: unknown) => {
        if (value === undefined) return
        if (!record(value)) throw new Error('mcpServers 必须是对象')
        for (const [name, definition] of Object.entries(value)) {
          this.validateName(name, 'MCP')
          if (!record(definition)) throw new Error('MCP 定义必须是对象')
          parseMcpItem(JSON.stringify(definition), 'claude-code')
        }
      }
      checkServers(incoming.mcpServers)
      let next = editJsonSubtree(original, ['mcpServers'], current.mcpServers, incoming.mcpServers)
      if (record(incoming.projects) && record(current.projects)) {
        for (const [projectName, project] of Object.entries(incoming.projects)) {
          const before = current.projects[projectName]
          if (!record(project) || !record(before)) continue
          checkServers(project.mcpServers)
          next = editJsonSubtree(next, ['projects', projectName, 'mcpServers'], before.mcpServers, project.mcpServers)
        }
      }
      if (next === original) return
      this.assertContent(next)
      parseJson(next)
      if (initial) await this.backupMcpSnapshot(query, location, initial)
      const latest = await readBounded(location.primary)
      if ((latest ? digest(latest) : MISSING_REVISION) !== (initial ? digest(initial) : MISSING_REVISION)) throw new Error('Claude 配置在备份期间发生变化，未覆盖')
      await this.reauthorize(query, location)
      await writeTextAtomic(location.primary, next)
    })
  }

  private async reauthorize(input: AgentResourceQuery, original: Location): Promise<void> {
    const current = await this.location(input, true)
    if (digest(JSON.stringify(current.tool)) !== digest(JSON.stringify(original.tool))) throw new Error('规则库在写入期间发生变化，未覆盖旧路径')
    await this.discovery.authorizeArtifact(input.toolId, original.artifact!.artifactId, original.primary, input.kind === 'MCP' ? 'MANAGE_MCP' : 'MANAGE_DIRECTORY')
  }

  private async backupMcpSnapshot(input: AgentResourceQuery, location: Location, snapshot: Buffer): Promise<void> {
    const backup = await this.artifactManagement.createBackup(input.toolId, location.artifact!.artifactId, location.primary)
    if (backup.sha256 !== digest(snapshot)) throw new Error('配置备份快照与待修改原件不一致，未写入')
  }

  private assertMcpRevision(document: string, input: AgentResourceQuery, name: string, current?: ResourceEntry): void {
    const value = parseMcpDocument(document, input.toolId)
    if (Object.hasOwn(value, name)) {
      if (!current || !record(value[name]) || digest(extractMcpItem(document, input.toolId, name, value[name])) !== current.revision) throw new Error('MCP 定义在读取期间发生变化，未覆盖')
    } else if (current) throw new Error('MCP 定义在读取期间消失，未覆盖')
  }

  private async entries(tool: ImportToolId, kind: AgentResourceKind, location: Location): Promise<ResourceEntry[]> {
    const results: ResourceEntry[] = []
    let definitionBytes = 0
    let packageMembers = 0
    const make = async (nativePath: string, nativeName: string, packagePath?: string): Promise<void> => {
      const data = await readBounded(nativePath)
      if (!data) return
      const content = utf8(data)
      definitionBytes += data.length
      if (definitionBytes > 16 * 1024 * 1024 || results.length >= 1000) throw new Error('资源发现超过 1000 个定义或总计 16 MiB，请缩小导入目录')
      let description = ''
      const warnings: string[] = []
      try { description = String(parseRole(content, kind === 'SKILL' ? 'claude-code' : tool).metadata.description) }
      catch (error) { warnings.push(error instanceof Error ? error.message : '定义格式有误') }
      let revision = digest(data)
      let files: Array<{ name: string; bytes: number }> | undefined
      if (packagePath) {
        const members = await readSkillPackage(packagePath)
        revision = skillRevision(members)
        files = members.map(file => ({ name: file.relativePath, bytes: file.content.length }))
        if ((packageMembers += files.length) > 20_000) throw new Error('资源发现包含过多 Skill 附件，请缩小导入目录')
      }
      results.push({ resourceId: digest(`${kind}\0${nativePath}\0${nativeName}`), name: nativeName, nativeName, nativePath, packagePath, kind, description, location: nativePath, format: tool === 'codex-cli' && kind === 'SUBAGENT' ? 'TOML' : 'MARKDOWN', revision, content, files, fileCount: files?.length, warnings })
    }
    if (kind === 'MCP') {
      const data = await readBounded(location.primary)
      return data ? this.mcpEntries(tool, location.primary, utf8(data)) : []
    }
    let visited = 0
    const walk = async (directory: string, depth: number): Promise<void> => {
      if (depth > 8) throw new Error('资源分类目录超过 8 层')
      await assertNoLinks(directory)
      if (kind === 'SKILL' && (depth > 0 || location.singlePackage) && await exists(path.join(directory, 'SKILL.md'))) {
        await make(path.join(directory, 'SKILL.md'), path.basename(directory), directory)
        return
      }
      let children
      try { children = await readdir(directory, { withFileTypes: true }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
      if ((visited += children.length) > 5000) throw new Error('资源发现超过 5000 个目录项')
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (child.name.startsWith('.')) continue
        if (child.isSymbolicLink()) throw new Error('资源目录不能包含链接')
        const file = path.join(directory, child.name)
        if (child.isDirectory()) await walk(file, depth + 1)
        else if (kind === 'SUBAGENT' && child.isFile() && child.name.endsWith(tool === 'codex-cli' ? '.toml' : '.md')) await make(file, child.name.replace(/\.(md|toml)$/, ''))
      }
    }
    const unique = new Set<string>()
    for (const root of location.paths) {
      const key = normalizePathForComparison(root)
      if (!unique.has(key)) { unique.add(key); await walk(root, 0) }
    }
    return results
  }

  private mcpEntries(tool: ImportToolId, nativePath: string, content: string): ResourceEntry[] {
    const results: ResourceEntry[] = []
    const document = parseMcpDocument(content, tool)
    const contents = extractMcpItems(content, tool, document)
    for (const [name, value] of Object.entries(document)) {
      if (!record(value)) throw new Error('MCP 定义必须是对象')
      const definition = contents.get(name)
      if (definition === undefined) throw new Error('无法定位 MCP 定义')
      const warnings: string[] = []
      if (MANAGED_AGENT_IDS.includes(tool as ManagedAgentId)) {
        try { this.validateTargetName(name, 'MCP', tool as ManagedAgentId) }
        catch (error) { warnings.push(error instanceof Error ? error.message : '现有名称不符合原生规则，保留原文件并等待明确另名') }
      }
      results.push({ resourceId: digest(`MCP\0${nativePath}\0${name}`), nativePath, nativeName: name, name, kind: 'MCP', description: typeof value.description === 'string' ? value.description : '', location: nativePath, format: tool === 'codex-cli' ? 'TOML' : 'JSON', revision: digest(definition), content: definition, warnings })
    }
    return results
  }

  private summary(entry: ResourceEntry): AgentResource {
    return { resourceId: entry.resourceId, name: entry.name, kind: entry.kind, description: entry.description, location: entry.location, format: entry.format, revision: entry.revision, fileCount: entry.fileCount, warnings: entry.warnings }
  }

  private publicEntry(entry: ResourceEntry): AgentResourceContent {
    return { ...this.summary(entry), content: entry.content, files: entry.files }
  }

  async listResources(input: AgentResourceQuery): Promise<AgentResourceList> {
    const location = await this.location(input)
    const resources = (await this.entries(input.toolId, input.kind, location)).map(entry => this.summary(entry))
    return { ...input, location: location.paths.join('\n'), resources, writable: Boolean(location.artifact?.capabilities.includes(input.kind === 'MCP' ? 'MANAGE_MCP' : 'MANAGE_DIRECTORY')), warnings: location.paths.some(p => /[\\/]\.agents[\\/]skills$/.test(p)) ? ['共享 Skills 目录也可能被其他工具读取；修改会影响其使用者。'] : [] }
  }

  async readResource(input: ReadAgentResourceInput): Promise<AgentResourceContent> {
    this.validateResourceId(input?.resourceId)
    const entries = await this.entries(input.toolId, input.kind, await this.location(input))
    const found = entries.find(entry => entry.resourceId === input.resourceId)
    if (!found) throw new Error('资源不存在或已经变化，请刷新')
    return this.publicEntry(found)
  }

  private assertContent(content: unknown): asserts content is string {
    if (typeof content !== 'string' || Buffer.byteLength(content) > RESOURCE_MAX_BYTES) throw new Error('定义必须是 1 MiB 以内的 UTF-8 文本')
  }

  private async backupNative(entry: ResourceEntry | undefined, toolId: ManagedAgentId): Promise<void> {
    if (!entry) return
    await assertNoLinks(this.backupDirectory)
    const directory = path.join(this.backupDirectory, randomUUID())
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (entry.packagePath) {
      const members = await readSkillPackage(entry.packagePath)
      if (skillRevision(members) !== entry.revision) throw new Error('Skill 在生成备份快照期间发生变化，未修改原件')
      for (const member of members) {
        const target = path.join(directory, 'content', member.relativePath)
        await writeTextAtomic(target, member.content)
        if (member.executable && process.platform !== 'win32') await chmod(target, 0o700)
      }
    } else {
      const bytes = await readBounded(entry.nativePath)
      if (!bytes) throw new Error('备份源在写入前消失')
      if (digest(bytes) !== entry.revision) throw new Error('角色在生成备份快照期间发生变化，未修改原件')
      await writeTextAtomic(path.join(directory, 'content'), bytes)
    }
    await writeJsonAtomic(path.join(directory, 'metadata.json'), { toolId, name: entry.name, originalPath: entry.packagePath ?? entry.nativePath, createdAt: new Date().toISOString(), revision: entry.revision, kind: entry.kind })
  }

  async saveResource(input: SaveAgentResourceInput): Promise<AgentResourceContent> {
    this.validateQuery(input)
    return withAgentResourceMutation(() => this.saveInternal(input))
  }

  private async saveInternal(input: SaveAgentResourceInput, packageFiles?: Awaited<ReturnType<typeof readSkillPackage>>): Promise<AgentResourceContent> {
    const location = await this.location(input, true)
    this.assertContent(input.content)
    this.validateTargetName(input.name, input.kind, input.toolId)
    if (input.resourceId !== undefined) this.validateResourceId(input.resourceId)
    const before = await this.entries(input.toolId, input.kind, location)
    const current = input.resourceId ? before.find(entry => entry.resourceId === input.resourceId) : undefined
    if (input.resourceId && !current) throw new Error('资源不存在，请刷新')
    if (current && (current.revision !== input.expectedRevision || current.name !== input.name)) throw new Error('资源已变化或改名，保留草稿并刷新后重试')
    const key = (name: string) => process.platform === 'win32' ? name.toLowerCase() : name
    if (!current && before.some(entry => key(entry.name) === key(input.name))) throw new Error('同名资源已存在，请保留或另名')
    const expectedPath = current?.nativePath ?? (input.kind === 'MCP' ? location.primary : input.kind === 'SKILL' ? path.join(location.primary, input.name, 'SKILL.md') : path.join(location.primary, `${input.name}.${input.toolId === 'codex-cli' ? 'toml' : 'md'}`))
    const expectedId = current?.resourceId ?? digest(`${input.kind}\0${expectedPath}\0${input.name}`)
    if (input.kind === 'MCP') {
      const definition = parseMcpItem(input.content, input.toolId)
      if (normalizeMcp(definition, input.toolId).disabled && (input.toolId === 'gemini-cli' || input.toolId === 'claude-code')) throw new Error('此工具的原生停用状态不在 server.disabled；请使用其原生启停或 Claude 兼容归档入口')
      const initial = await readBounded(location.primary)
      const document = initial ? utf8(initial) : input.toolId === 'codex-cli' ? '' : '{}\n'
      this.assertMcpRevision(document, input, input.name, current)
      const next = editMcpDocument(document, input.toolId, input.name, definition, input.toolId === 'codex-cli' ? undefined : input.content)
      if (initial) await this.backupMcpSnapshot(input, location, initial)
      const latest = await readBounded(location.primary)
      if ((latest ? digest(latest) : MISSING_REVISION) !== (initial ? digest(initial) : MISSING_REVISION)) throw new Error('配置在备份期间发生变化，未覆盖')
      await this.reauthorize(input, location)
      await writeTextAtomic(location.primary, next)
    } else if (input.kind === 'SKILL') {
      validateSkill(input.content, input.toolId, input.toolId)
      const members = packageFiles ?? (current?.packagePath ? await readSkillPackage(current.packagePath) : [])
      if (current?.packagePath && !packageFiles && skillRevision(members) !== current.revision) throw new Error('Skill 在读取期间发生变化，未覆盖')
      const nextFiles = members.filter(file => file.relativePath !== 'SKILL.md')
      nextFiles.push({ relativePath: 'SKILL.md', content: Buffer.from(input.content), executable: members.find(file => file.relativePath === 'SKILL.md')?.executable })
      await this.backupNative(current, input.toolId)
      if (current?.packagePath && skillRevision(await readSkillPackage(current.packagePath)) !== current.revision) throw new Error('Skill 在备份期间发生变化，未覆盖')
      await this.reauthorize(input, location)
      const targetRoot = current?.packagePath ? path.dirname(current.packagePath) : location.primary
      await new SkillsManagementService(targetRoot).importSkillFiles({ rootDirName: input.name, files: nextFiles.map(file => ({ relativePath: file.relativePath, contentBase64: file.content.toString('base64'), executable: file.executable })) }, { overwrite: Boolean(current) })
    } else {
      parseRole(input.content, input.toolId)
      const file = current?.nativePath ?? path.join(location.primary, `${input.name}.${input.toolId === 'codex-cli' ? 'toml' : 'md'}`)
      await this.backupNative(current, input.toolId)
      const bytes = await readBounded(file)
      if ((bytes ? digest(bytes) : MISSING_REVISION) !== (current?.revision ?? MISSING_REVISION)) throw new Error('角色文件在备份期间发生变化，未覆盖')
      await this.reauthorize(input, location)
      await assertNoLinks(file)
      await writeTextAtomic(file, input.content)
    }
    const updated = (await this.entries(input.toolId, input.kind, await this.location(input))).find(entry => entry.resourceId === expectedId)
    if (!updated) throw new Error('写入已完成但结果读取失败，请刷新核实，勿重复创建')
    return this.publicEntry(updated)
  }

  async deleteResource(input: DeleteAgentResourceInput): Promise<void> {
    this.validateQuery(input)
    this.validateResourceId(input.resourceId)
    return withAgentResourceMutation(async () => {
      const location = await this.location(input, true)
      const current = (await this.entries(input.toolId, input.kind, location)).find(entry => entry.resourceId === input.resourceId)
      if (!current || current.revision !== input.expectedRevision) throw new Error('资源不存在或已经变化，未删除')
      if (input.kind === 'MCP') {
        const initial = await readBounded(location.primary)
        if (!initial) throw new Error('配置文件已消失')
        this.assertMcpRevision(utf8(initial), input, current.name, current)
        const next = editMcpDocument(utf8(initial), input.toolId, current.name)
        await this.backupMcpSnapshot(input, location, initial)
        const latest = await readBounded(location.primary)
        if (!latest || digest(latest) !== digest(initial)) throw new Error('配置在备份期间发生变化，未删除')
        await this.reauthorize(input, location)
        await writeTextAtomic(location.primary, next)
      } else {
        await this.backupNative(current, input.toolId)
        const latest = input.kind === 'SKILL' ? skillRevision(await readSkillPackage(current.packagePath!)) : digest((await readBounded(current.nativePath)) ?? '')
        if (latest !== current.revision) throw new Error('资源在备份期间发生变化，未删除')
        await this.reauthorize(input, location)
        const original = current.packagePath ?? current.nativePath
        await assertNoLinks(original)
        const deleted = path.join(this.backupDirectory, randomUUID())
        await mkdir(deleted, { recursive: true, mode: 0o700 })
        await writeJsonAtomic(path.join(deleted, 'metadata.json'), { originalPath: original, createdAt: new Date().toISOString(), revision: current.revision, kind: input.kind })
        await rename(original, path.join(deleted, input.kind === 'SKILL' ? 'skill' : 'agent'))
      }
    })
  }

  private purge(): void {
    const now = Date.now()
    for (const [id, value] of this.sources) if (value.expires < now) this.sources.delete(id)
    for (const [id, value] of this.projects) if (value.expires < now) this.projects.delete(id)
    for (const [id, value] of this.previews) if (value.expires < now && (!value.apply || value.apply.completed)) this.previews.delete(id)
  }

  releaseOwner(owner: number): void {
    for (const [id, value] of this.sources) if (value.owner === owner) this.sources.delete(id)
    for (const [id, value] of this.projects) if (value.owner === owner) this.projects.delete(id)
    for (const [id, value] of this.previews) if (value.owner === owner) this.previews.delete(id)
  }

  /** directory 只由 IPC 的本机对话框传入，renderer 没有这个方法。 */
  async registerProject(directory: string, owner: number): Promise<{ sourceContextId: string }> {
    this.purge()
    await assertNoLinks(directory)
    if (!(await lstat(directory)).isDirectory()) throw new Error('请选择普通本机项目目录')
    if (this.projects.size > 100) throw new Error('导入项目会话过多，请重新打开应用')
    const sourceContextId = randomUUID()
    this.projects.set(sourceContextId, { owner, directory, expires: Date.now() + SESSION_MS })
    return { sourceContextId }
  }

  private addSource(tool: ImportToolId, scope: ImportSource['scope'], locations: SourceSession['locations'], owner: number, label?: string, warnings: string[] = [], diagnostic?: { location: string; status: ImportSource['status'] }): ImportSource {
    const location = diagnostic?.location ?? Object.values(locations).flat().join('\n')
    const previous = [...this.sources.values()].find(source => source.owner === owner && source.public.toolId === tool && source.public.scope === scope && source.public.location === location && source.public.status === (diagnostic?.status ?? 'FOUND') && JSON.stringify(source.locations) === JSON.stringify(locations))
    if (previous) {
      previous.expires = Date.now() + SESSION_MS
      previous.public.label = label ?? SOURCE_LABELS[tool]
      previous.public.warnings = warnings
      return previous.public
    }
    if (this.sources.size > 500) throw new Error('导入来源会话过多，请重新打开资源页')
    const sourceId = randomUUID()
    const value: ImportSource = { sourceId, toolId: tool, label: label ?? SOURCE_LABELS[tool], scope, location, kinds: Object.keys(locations) as AgentResourceKind[], warnings, status: diagnostic?.status ?? 'FOUND' }
    this.sources.set(sourceId, { owner, public: value, locations, expires: Date.now() + SESSION_MS })
    return value
  }

  private sourcePaths(tool: ImportToolId, project?: string): Partial<Record<AgentResourceKind, string[]>> {
    const root = project ?? this.home
    const p = (...segments: string[]) => path.join(root, ...segments)
    const user = !project
    switch (tool) {
      case 'claude-code': return { MCP: [user ? p('.claude.json') : p('.mcp.json')], SKILL: [p('.claude', 'skills')], SUBAGENT: [p('.claude', 'agents')] }
      case 'codex-cli': return { MCP: [p('.codex', 'config.toml')], SKILL: [p('.agents', 'skills'), p('.codex', 'skills')], SUBAGENT: [p('.codex', 'agents')] }
      case 'gemini-cli': return { MCP: [p('.gemini', 'settings.json')], SKILL: [p('.gemini', 'skills')], SUBAGENT: [p('.gemini', 'agents')] }
      case 'antigravity': return { MCP: [user ? p('.gemini', 'config', 'mcp_config.json') : p('.agents', 'mcp_config.json')], SKILL: user ? [p('.gemini', 'config', 'skills'), p('.gemini', 'antigravity-cli', 'skills')] : [p('.agents', 'skills'), p('.agent', 'skills')], SUBAGENT: [user ? p('.gemini', 'config', 'agents') : p('.agents', 'agents')] }
      case 'cursor': return { MCP: [p('.cursor', 'mcp.json')], SKILL: [p('.cursor', 'skills'), p('.agents', 'skills')], SUBAGENT: [p('.cursor', 'agents')] }
      case 'qoder': return { MCP: [...(user ? [] : [p('.qoder', 'settings.local.json')]), p('.qoder', 'settings.json')], SKILL: [p('.qoder', 'skills')], SUBAGENT: [p('.qoder', 'agents')] }
      case 'workbuddy': return { MCP: user ? [p('.codebuddy', '.mcp.json'), p('.codebuddy', 'mcp.json'), p('.codebuddy.json')] : [p('.mcp.json'), p('.codebuddy', 'mcp.json')], SKILL: [p('.codebuddy', 'skills')], SUBAGENT: [p('.codebuddy', 'agents')] }
      case 'trae': return { ...(user ? {} : { MCP: [p('.trae', 'mcp.json')] }), SKILL: [p('.trae', 'skills')] }
      case 'pi': return { MCP: [user ? p('.pi', 'agent', 'mcp.json') : p('.pi', 'mcp.json')], SKILL: [user ? p('.pi', 'agent', 'skills') : p('.pi', 'skills')] }
      case 'opencode': {
        const config = user ? path.join(process.env.XDG_CONFIG_HOME ?? path.join(root, '.config'), 'opencode') : root
        return { MCP: [path.join(config, 'opencode.jsonc'), path.join(config, 'opencode.json')], SKILL: [user ? path.join(config, 'skills') : p('.opencode', 'skills')], SUBAGENT: [user ? path.join(config, 'agents') : p('.opencode', 'agents')] }
      }
    }
  }

  async discoverImportSources(input: { sourceContextId?: string } = {}, owner = 0): Promise<ImportSource[]> {
    this.purge()
    if (!record(input)) throw new Error('无效来源请求')
    let project: string | undefined
    if (input.sourceContextId !== undefined) {
      const session = this.projects.get(input.sourceContextId)
      if (!session || session.owner !== owner) throw new Error('项目授权已过期，请重新选择')
      project = session.directory
      await assertNoLinks(project)
    }
    const results: ImportSource[] = []
    const shared = new Set<string>()
    for (const tool of SOURCE_TOOLS) {
      const candidates = this.sourcePaths(tool, project)
      const locations: SourceSession['locations'] = {}
      const warnings: string[] = []
      for (const kind of AGENT_RESOURCE_KINDS) {
        const found = []
        for (const candidate of candidates[kind] ?? []) {
          if (!(await exists(candidate))) continue
          if (kind === 'SKILL' && /[\\/]\.agents[\\/]skills$/.test(candidate)) {
            warnings.push('共享 Skills 目录可能被多个工具读取；来源名称表示兼容 profile。')
            const key = normalizePathForComparison(candidate)
            if (shared.has(key)) continue
            shared.add(key)
          }
          found.push(candidate)
        }
        if (found.length) locations[kind] = kind === 'MCP' ? found.slice(0, 1) : found
        if (kind === 'MCP' && found.length > 1) warnings.push('同类配置存在多个候选，当前读取优先路径；其余可通过本机文件选择器单独导入。')
      }
      if (tool === 'trae') warnings.push('全局 MCP 请手选 Raw Config 文件；未确认通用子 Agent 文件规范。')
      if (tool === 'pi') warnings.push('此为 pi.dev 内置 MCP profile；旧发行与子 Agent 扩展需要单独确认。')
      if (Object.keys(locations).length) results.push(this.addSource(tool, project ? 'PROJECT' : 'USER', locations, owner, undefined, warnings))
    }
    return results
  }

  async registerFile(tool: ImportToolId, kind: AgentResourceKind, file: string, owner: number): Promise<ImportSource> {
    if (!SOURCE_TOOLS.includes(tool) || !AGENT_RESOURCE_KINDS.includes(kind)) throw new Error('未知导入 profile')
    if (kind === 'SUBAGENT' && (tool === 'trae' || tool === 'pi')) throw new Error('尚无已确认的通用子 Agent 文件规范')
    await assertNoLinks(file)
    const info = await lstat(file)
    if (kind === 'SKILL' ? !info.isDirectory() : !info.isFile()) throw new Error('所选资源类型不匹配')
    if (kind !== 'SKILL') await readBounded(file)
    return this.addSource(tool, 'FILE', { [kind]: [file] }, owner, `${SOURCE_LABELS[tool]} · ${path.basename(file)}`, ['手选文件使用明确选择的兼容 profile，不以同形 JSON 猜测来源。'])
  }

  async discoverResourceBackups(input: AgentResourceQuery, owner = 0): Promise<ImportSource[]> {
    this.purge()
    const location = await this.location(input)
    if (input.kind === 'MCP') {
      const backups = await this.artifactManagement.listBackups(input.toolId, location.artifact!.artifactId)
      const sources: ImportSource[] = []
      for (const backup of backups) {
        try {
          const snapshot = await this.artifactManagement.readBackup(backup.backupId)
          const warnings = ['只恢复选中的 MCP 服务器；其他服务器、Agent 设置和独立启停文件保持当前状态。']
          if (snapshot.backup.integrity === 'LEGACY_UNVERIFIED') warnings.push('此旧备份没有历史摘要；本次读取校验不能证明历史内容未损坏，请核对差异后恢复。')
          const source = this.addSource(input.toolId, 'BACKUP', { MCP: [snapshot.backup.originalPath] }, owner, `${SOURCE_LABELS[input.toolId]} · MCP · ${backup.createdAt}`, warnings, { location: `${backup.originalPath} · ${backup.backupId}`, status: 'FOUND' })
          source.createdAt = backup.createdAt
          this.sources.get(source.sourceId)!.artifactBackup = { backupId: backup.backupId, revision: snapshot.revision }
          sources.push(source)
        } catch (error) {
          sources.push(this.addSource(input.toolId, 'BACKUP', {}, owner, `${SOURCE_LABELS[input.toolId]} · MCP 备份不可用`, [error instanceof Error ? error.message : '备份无法读取'], { location: `${backup.originalPath} · ${backup.backupId}`, status: 'INVALID' }))
        }
      }
      return sources
    }
    const backups = await findResourceBackups(this.backupDirectory, input, location.paths)
    return backups.map(backup => {
      if ('error' in backup) return this.addSource(input.toolId, 'BACKUP', {}, owner, `${SOURCE_LABELS[input.toolId]} · 备份不可用`, [backup.error], { location: backup.directory, status: 'INVALID' })
      const source = this.addSource(input.toolId, 'BACKUP', { [input.kind]: [path.join(backup.directory, 'content')] }, owner, `${SOURCE_LABELS[input.toolId]} · ${input.kind} · ${backup.createdAt} · ${backup.name}`, ['恢复会重新预览并按当前规则库写入；不会按备份原路径覆盖。'])
      source.createdAt = backup.createdAt
      this.sources.get(source.sourceId)!.backup = backup
      return source
    })
  }

  private requireSource(sourceId: string, kind: AgentResourceKind, owner: number): SourceSession {
    this.purge()
    const source = this.sources.get(sourceId)
    if (!source || source.owner !== owner || !source.locations[kind]) throw new Error('来源授权已过期或资源类型不支持')
    return source
  }

  private async sourceEntries(source: SourceSession, kind: AgentResourceKind): Promise<ResourceEntry[]> {
    const paths = source.locations[kind]!
    if (source.artifactBackup) {
      await this.location({ toolId: source.public.toolId as ManagedAgentId, kind })
      const snapshot = await this.artifactManagement.readBackup(source.artifactBackup.backupId)
      if (snapshot.backup.toolId !== source.public.toolId || snapshot.backup.artifactId !== MCP_ARTIFACTS[source.public.toolId as ManagedAgentId] || snapshot.revision !== source.artifactBackup.revision) throw new Error('MCP 备份内容或授权已变化，请重新选择')
      const entries = this.mcpEntries(source.public.toolId, snapshot.backup.originalPath, snapshot.content)
      await this.protectSourceMcpState(source, entries, snapshot.content)
      for (const entry of entries) entry.revision = digest(`${entry.revision}\0${snapshot.revision}`)
      return entries
    }
    if (source.backup) {
      await this.location({ toolId: source.public.toolId as ManagedAgentId, kind })
      const metadata = await readBounded(path.join(source.backup.directory, 'metadata.json'), 16 * 1024)
      if (!metadata || digest(metadata) !== source.backup.metadataRevision) throw new Error('备份元数据已经变化，请重新选择')
      const files = kind === 'SKILL' ? await readSkillPackage(paths[0]) : undefined
      const bytes = await readBounded(kind === 'SKILL' ? path.join(paths[0], 'SKILL.md') : paths[0])
      if (!bytes) throw new Error('备份内容已消失')
      const revision = files ? skillRevision(files) : digest(bytes)
      if (revision !== source.backup.revision) throw new Error('备份内容校验失败，未恢复')
      return [{ resourceId: digest(`${kind}\0${source.backup.directory}\0${source.backup.name}`), name: source.backup.name, nativeName: source.backup.name, nativePath: kind === 'SKILL' ? path.join(paths[0], 'SKILL.md') : paths[0], packagePath: files ? paths[0] : undefined, kind, content: utf8(bytes), description: '', location: paths[0], format: source.public.toolId === 'codex-cli' && kind === 'SUBAGENT' ? 'TOML' : 'MARKDOWN', revision, files: files?.map(file => ({ name: file.relativePath, bytes: file.content.length })), fileCount: files?.length, warnings: [] }]
    }
    if (source.public.scope === 'FILE' && kind === 'SUBAGENT') {
      const content = utf8((await readBounded(paths[0]))!)
      return [{ resourceId: digest(paths[0]), name: path.basename(paths[0]).replace(/\.(md|toml)$/, ''), nativeName: path.basename(paths[0]), nativePath: paths[0], kind, content, description: '', location: paths[0], format: source.public.toolId === 'codex-cli' ? 'TOML' : 'MARKDOWN', revision: digest(content), warnings: [] }]
    }
    const entries = await this.entries(source.public.toolId, kind, { paths, primary: paths[0], singlePackage: source.public.scope === 'FILE' && kind === 'SKILL' })
    if (kind === 'MCP') await this.protectSourceMcpState(source, entries)
    return entries
  }

  private async protectSourceMcpState(source: SourceSession, entries: ResourceEntry[], snapshot?: string): Promise<void> {
    const tool = source.public.toolId
    if (tool !== 'gemini-cli' && tool !== 'claude-code' && tool !== 'qoder') return
    const primary = source.locations.MCP![0]
    const configBytes = snapshot !== undefined ? Buffer.from(snapshot) : await readBounded(primary)
    if (!configBytes) throw new Error('来源配置在读取期间消失')
    const config = parseJson(utf8(configBytes))
    const asList = (value: unknown): string[] | undefined => {
      if (value === undefined) return undefined
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error('来源 MCP 策略列表格式无效，不能视为全部启用')
      return value as string[]
    }
    const matches = (list: string[] | undefined, name: string) => list?.some(item => tool === 'qoder' ? item === name : item.toLowerCase().trim() === name.toLowerCase().trim()) ?? false
    if (tool === 'gemini-cli' || tool === 'qoder') {
      const roots = [config]
      if (source.public.scope === 'PROJECT') {
        const global = await readBounded(path.join(this.home, tool === 'qoder' ? '.qoder' : '.gemini', 'settings.json'))
        if (global) roots.push(parseJson(utf8(global)))
        if (tool === 'qoder') {
          const project = path.basename(path.dirname(primary)) === '.qoder' ? path.dirname(path.dirname(primary)) : path.dirname(primary)
          for (const candidate of [path.join(project, '.qoder', 'settings.json'), path.join(project, '.mcp.json'), path.join(project, '.qoder', 'settings.local.json')]) {
            if (normalizePathForComparison(candidate) === normalizePathForComparison(primary)) continue
            const layer = await readBounded(candidate)
            if (layer) roots.push(parseJson(utf8(layer)))
          }
        }
      }
      const policies = roots.map(root => {
        if (root.mcp !== undefined && !record(root.mcp)) throw new Error('来源全局 MCP 策略损坏')
        const policy = record(root.mcp) ? root.mcp : {}
        if (tool === 'qoder' && policy.enableAllProjectMcpServers !== undefined && typeof policy.enableAllProjectMcpServers !== 'boolean') throw new Error('Qoder 项目 MCP 审批策略损坏')
        return { allowed: asList(policy.allowed), excluded: asList(policy.excluded), serverCommand: policy.serverCommand, projectAll: policy.enableAllProjectMcpServers, projectNames: tool === 'qoder' ? asList(policy.enabledProjectMcpServers) : undefined }
      })
      const enablementBytes = tool === 'gemini-cli' ? await readBounded(path.join(this.home, '.gemini', 'mcp-server-enablement.json')) : undefined
      let enablement: Record<string, unknown> = {}
      if (enablementBytes) {
        try { JSON.parse(utf8(enablementBytes)) } catch { throw new Error('Gemini 启停状态损坏，不能假定服务器全部启用') }
        enablement = parseJson(utf8(enablementBytes))
        for (const value of Object.values(enablement)) if (!record(value) || typeof value.enabled !== 'boolean' || Object.keys(value).some(key => key !== 'enabled')) throw new Error('Gemini 启停状态格式未知，不能假定服务器全部启用')
      }
      const stateHash = digest(JSON.stringify({ policies, enablement }))
      for (const entry of entries) {
        const state = enablement[entry.name.toLowerCase().trim()]
        entry.mcpDisabled = record(state) && state.enabled === false || policies.some(policy => policy.allowed !== undefined && !matches(policy.allowed, entry.name) || matches(policy.excluded, entry.name))
        if (policies.some(policy => policy.serverCommand !== undefined)) entry.policyError = '来源使用全局 mcp.serverCommand，不能假装成等价的单项启动配置'
        if (tool === 'qoder') {
          if (policies.some(policy => [...(policy.allowed ?? []), ...(policy.excluded ?? []), ...(policy.projectNames ?? [])].some(name => name !== entry.name && name.toLowerCase().trim() === entry.name.toLowerCase().trim()))) entry.policyError = 'Qoder 策略名称大小写或空白存在歧义，不能确认等价权限'
          const approvals = policies.filter(policy => policy.projectAll !== undefined || policy.projectNames !== undefined)
          if (source.public.scope === 'PROJECT' && (!approvals.length || approvals.some(policy => policy.projectAll !== true && !matches(policy.projectNames, entry.name)))) entry.policyError = 'Qoder 项目 MCP 需要原生逐项审批；未读取私有审批状态，不能将未知授权转换成启用'
          if (source.public.scope === 'PROJECT') entry.warnings.push('此来源按文件层列出；已知用户/项目/本地层限制按保守交集保持，不声称读取原生会话审批或合成最终配置。')
        }
        if (entry.mcpDisabled) entry.warnings.push(`来源被 ${SOURCE_LABELS[tool]} 持久化启停状态或 allowed/excluded 策略停用；导入必须保持停用。`)
        entry.revision = digest(`${entry.revision}\0${stateHash}`)
      }
    } else {
      let homeConfig = config
      if (snapshot === undefined && normalizePathForComparison(primary) !== normalizePathForComparison(path.join(this.home, '.claude.json'))) {
        const homeBytes = await readBounded(path.join(this.home, '.claude.json'))
        homeConfig = homeBytes ? parseJson(utf8(homeBytes)) : {}
      }
      if (homeConfig.projects !== undefined && !record(homeConfig.projects)) throw new Error('Claude 项目启停状态格式无效')
      const projectPolicies = Object.entries(record(homeConfig.projects) ? homeConfig.projects : {}).map(([directory, project]) => {
        if (!record(project)) throw new Error('Claude 项目配置格式无效')
        return { directory, disabled: asList(project.disabledMcpServers), denied: asList(project.disabledMcpjsonServers) }
      })
      for (const entry of entries) {
        const disabled = projectPolicies.filter(policy => matches(policy.disabled, entry.name) || matches(policy.denied, entry.name))
        if (source.public.scope === 'PROJECT') {
          const directory = path.dirname(primary)
          entry.mcpDisabled = disabled.some(policy => normalizePathForComparison(policy.directory) === normalizePathForComparison(directory))
        } else if (disabled.length) entry.policyError = '来源具有按项目启停差异；用户级目标不能无损保留，请明确项目来源或使用原生配置'
        entry.revision = digest(`${entry.revision}\0${JSON.stringify(projectPolicies)}`)
      }
    }
    if (source.public.scope === 'FILE') for (const entry of entries) entry.warnings.push('手选文件只提供可见定义；离线副本的企业策略、会话和工作区信任状态无法推断。')
  }

  async listImportResources(input: { sourceId: string; kind: AgentResourceKind }, owner = 0): Promise<AgentResourceList> {
    const source = this.requireSource(input.sourceId, input.kind, owner)
    const entries = await this.sourceEntries(source, input.kind)
    return { toolId: source.public.toolId, kind: input.kind, location: source.public.location, warnings: source.public.warnings, writable: false, resources: entries.map(entry => this.summary(entry)) }
  }

  private async targetRevision(input: AgentResourceQuery, location: Location): Promise<string> {
    if (input.kind === 'MCP') { const bytes = await readBounded(location.primary); return bytes ? digest(bytes) : MISSING_REVISION }
    return digest((await this.entries(input.toolId, input.kind, location)).map(entry => `${entry.resourceId}:${entry.revision}`).sort().join('\n'))
  }

  async previewResourceImport(input: PreviewResourceImportInput, owner = 0): Promise<ResourceImportPreview> {
    this.validateQuery({ toolId: input.targetToolId, kind: input.kind })
    if (!Array.isArray(input.resourceIds) || input.resourceIds.length === 0 || input.resourceIds.length > 50 || input.resourceIds.some(id => typeof id !== 'string') || new Set(input.resourceIds).size !== input.resourceIds.length) throw new Error('每次请选择 1～50 个不同资源')
    const source = this.requireSource(input.sourceId, input.kind, owner)
    const query = { toolId: input.targetToolId, kind: input.kind }
    const location = await this.location(query, true)
    const targetRevision = await this.targetRevision(query, location)
    const current = await this.entries(query.toolId, input.kind, location)
    const candidates = await this.sourceEntries(source, input.kind)
    const selected = input.resourceIds.map(id => { const entry = candidates.find(candidate => candidate.resourceId === id); if (!entry) throw new Error('来源资源已变化，请重新选择'); return entry })
    const converted = new Map<string, string>()
    const items = selected.map(entry => {
      const target = current.find(existing => existing.name.toLowerCase() === entry.name.toLowerCase())
      let content = ''
      const errors: string[] = []
      const warnings = [...entry.warnings]
      let requiresRename = false
      try {
        this.validateName(entry.name, input.kind)
        if (input.kind === 'MCP') {
          if (entry.policyError) throw new Error(entry.policyError)
          const definition = parseMcpItem(entry.content, source.public.toolId)
          const convertedDefinition = convertMcp(definition, source.public.toolId, query.toolId, entry.mcpDisabled)
          content = source.public.toolId === query.toolId ? entry.content : emitMcpItem(convertedDefinition, query.toolId)
          if (query.toolId === 'claude-code' && source.public.toolId !== query.toolId && /\$\{[^}]+\}/.test(content)) warnings.push('Claude 官方变量展开说明集中于项目 .mcp.json；此处为用户级 ~/.claude.json，引用保留但展开行为需本机核实，不能视作无损兼容。')
          if (query.toolId === 'antigravity' && source.public.toolId !== query.toolId && /\$\{[^}]+\}/.test(content)) warnings.push('Antigravity 当前公开配置说明未确认这些位置的变量展开；符号引用保留，需在原生工具核实，不能视作已生效。')
          if (query.toolId === 'gemini-cli' && source.public.toolId !== query.toolId && /\$\{[^}]+\}/.test(JSON.stringify([convertedDefinition.command, convertedDefinition.args, convertedDefinition.url, convertedDefinition.httpUrl, convertedDefinition.headers]))) warnings.push('Gemini 官方明确支持 env 块变量展开；command/args/URL/headers 中的引用需在原生工具核实。')
          if (definition.command !== undefined) warnings.push('命令、参数与相对路径保持原样；目标工具的工作目录和环境可能不同，请确认后再启用。')
          if (source.public.toolId !== query.toolId && (definition.description !== undefined || definition.name !== undefined)) warnings.push('来源内嵌 name/description 是显示元数据；目标用注册表键命名，不复制这些显示字段。')
        }
        else if (input.kind === 'SUBAGENT') {
          content = convertRole(entry.content, source.public.toolId, query.toolId)
          const metadata = parseRole(entry.content, source.public.toolId).metadata
          if (metadata.color !== undefined && query.toolId !== 'claude-code' && source.public.toolId !== query.toolId) warnings.push('目标没有等价角色颜色字段；导入时仅省略显示颜色。')
          if (metadata.name !== entry.name) warnings.push('原生 name 与文件名不同；保留原生 name，目标按预览文件名落盘。')
          if (source.public.toolId !== query.toolId) warnings.push('提示词正文原样保留；原工具专属命令、路径与术语需要人工核对。')
        }
        else { validateSkill(entry.content, source.public.toolId, query.toolId); content = entry.content }
        converted.set(entry.resourceId, content)
      } catch (error) { errors.push(error instanceof Error ? error.message : '无法转换') }
      if (!errors.length) {
        try { this.validateTargetName(entry.name, input.kind, query.toolId) }
        catch (error) { requiresRename = true; errors.push(error instanceof Error ? error.message : '目标名称无效，请另名') }
      }
      const identical = target && (input.kind === 'SKILL' ? target.revision === entry.revision : target.content === content)
      return { resourceId: entry.resourceId, name: entry.name, targetName: entry.name, conflict: Boolean(target), status: errors.length ? 'BLOCKED' as const : identical ? 'IDENTICAL' as const : 'READY' as const, sourceContent: redactPreview(entry.content), proposedContent: redactPreview(content), targetContent: target ? redactPreview(target.content) : undefined, warnings, errors, requiresRename, files: entry.files }
    })
    this.purge()
    if (items.reduce((total, item) => total + Buffer.byteLength(item.sourceContent) + Buffer.byteLength(item.proposedContent) + Buffer.byteLength(item.targetContent ?? ''), 0) > 2 * 1024 * 1024) throw new Error('单次预览超过 2 MiB，请减少所选条目')
    if ([...converted.values()].reduce((total, content) => total + Buffer.byteLength(content), 0) > 2 * 1024 * 1024) throw new Error('待写入定义超过单次 2 MiB 限制，请减少所选条目')
    if ([...this.previews.values()].filter(session => !session.apply).length >= 16) {
      const previous = [...this.previews].find(([, session]) => session.owner === owner && !session.apply)
      if (previous) this.previews.delete(previous[0])
      else throw new Error('预览会话过多，请稍后重试')
    }
    if (this.previews.size >= 256) {
      const oldest = [...this.previews].find(([, session]) => session.apply?.completed)
      if (oldest) this.previews.delete(oldest[0])
      else throw new Error('正在处理的导入过多，请稍后重试')
    }
    const previewId = randomUUID()
    const value: ResourceImportPreview = { previewId, source: source.public, targetToolId: query.toolId, kind: input.kind, targetLocation: location.primary, items, warnings: ['预览不运行资源命令；写入后目标工具可能按自己的发现与执行规则加载。', '重名默认保留；权限或格式无法映射的条目不能应用。', '只转换已确认的文件定义；企业策略、会话状态和工作区信任需要在目标工具重新核对。'] }
    this.previews.set(previewId, { owner, expires: Date.now() + SESSION_MS, public: value, source, targetRevision, registryRevision: digest(JSON.stringify(location.tool)), sourceRevisions: new Map(selected.map(entry => [entry.resourceId, entry.revision])), converted })
    return value
  }

  async applyResourceImport(input: ApplyResourceImportInput, owner = 0): Promise<ResourceImportReceipt> {
    this.purge()
    const preview = this.previews.get(input.previewId)
    if (!preview || preview.owner !== owner) throw new Error('导入预览已过期，请重新读取')
    if (!Array.isArray(input.decisions) || input.decisions.length > 50 || new Set(input.decisions.map(item => item.resourceId)).size !== input.decisions.length) throw new Error('导入决策无效')
    const fingerprint = digest(JSON.stringify(input.decisions))
    if (preview.apply) {
      if (preview.apply.fingerprint !== fingerprint) throw new Error('本预览已经使用另一组决策，请先核查原结果')
      return preview.apply.promise
    }
    for (const decision of input.decisions) {
      const item = preview.public.items.find(candidate => candidate.resourceId === decision.resourceId)
      if (!item || !['SKIP', 'IMPORT', 'REPLACE', 'RENAME'].includes(decision.action)) throw new Error('导入决策不属于本次预览')
      if (decision.action !== 'SKIP' && (item.status === 'BLOCKED' && !(item.requiresRename && decision.action === 'RENAME') || item.status === 'IDENTICAL')) throw new Error('无法应用被阻止或完全相同的条目')
      if (decision.action === 'IMPORT' && item.conflict) throw new Error('重名条目必须明确选择覆盖或另名')
      if (decision.action === 'RENAME') this.validateTargetName(decision.name, preview.public.kind, preview.public.targetToolId)
    }
    const promise = withAgentResourceMutation(() => this.applyInternal(preview, input))
    preview.apply = { fingerprint, promise }
    const finish = () => {
      if (preview.apply) preview.apply.completed = true
      preview.converted.clear()
      preview.sourceRevisions.clear()
      preview.public = { ...preview.public, items: [] }
    }
    void promise.then(finish, finish)
    return promise
  }

  private async applyInternal(preview: PreviewSession, input: ApplyResourceImportInput): Promise<ResourceImportReceipt> {
    const query = { toolId: preview.public.targetToolId, kind: preview.public.kind }
    const location = await this.location(query, true)
    if (digest(JSON.stringify(location.tool)) !== preview.registryRevision || await this.targetRevision(query, location) !== preview.targetRevision) throw new Error('目标配置或规则库已变化，请重新预览')
    const source = this.requireSource(preview.source.public.sourceId, query.kind, preview.owner)
    const sources = await this.sourceEntries(source, query.kind)
    for (const item of preview.public.items) {
      if (sources.find(entry => entry.resourceId === item.resourceId)?.revision !== preview.sourceRevisions.get(item.resourceId)) throw new Error('来源在预览后发生变化，请重新读取')
    }
    const results: ResourceImportReceipt['results'] = []
    let expectedTarget = preview.targetRevision
    for (const item of preview.public.items) {
      const decision = input.decisions.find(entry => entry.resourceId === item.resourceId)
      if (!decision || decision.action === 'SKIP') { results.push({ name: item.name, status: 'SKIPPED' }); continue }
      try {
        if (await this.targetRevision(query, await this.location(query, true)) !== expectedTarget) throw new Error('目标在导入期间发生变化，停止覆盖')
        const sourceEntry = sources.find(entry => entry.resourceId === item.resourceId)!
        const name = decision.action === 'RENAME' ? decision.name! : item.targetName
        const current = (await this.entries(query.toolId, query.kind, await this.location(query))).find(entry => entry.name.toLowerCase() === name.toLowerCase())
        if (current && decision.action !== 'REPLACE') throw new Error('目标名称已存在，未覆盖')
        let content = preview.converted.get(item.resourceId)!
        const files = sourceEntry.packagePath ? await readSkillPackage(sourceEntry.packagePath) : undefined
        if (files && skillRevision(files) !== sourceEntry.revision) throw new Error('来源 Skill 在导入期间发生变化')
        if (query.kind !== 'MCP' && decision.action === 'RENAME') {
          const parsed = parseRole(content, query.kind === 'SKILL' ? 'claude-code' : query.toolId)
          content = emitRole({ ...parsed.metadata, name }, parsed.prompt, query.kind === 'SKILL' ? 'claude-code' : query.toolId)
        }
        if (current && !source.artifactBackup && normalizePathForComparison(current.packagePath ?? current.nativePath) === normalizePathForComparison(sourceEntry.packagePath ?? sourceEntry.nativePath)) { results.push({ name, status: 'SKIPPED' }); continue }
        await this.saveInternal({ ...query, name: current?.name ?? name, content, resourceId: current?.resourceId, expectedRevision: current?.revision }, files)
        expectedTarget = await this.targetRevision(query, await this.location(query))
        results.push({ name, status: 'IMPORTED' })
      } catch (error) { results.push({ name: item.name, status: 'FAILED', error: error instanceof Error ? error.message : '导入失败' }) }
    }
    return { previewId: input.previewId, results }
  }
}

export const agentResourceService = new AgentResourceService()
