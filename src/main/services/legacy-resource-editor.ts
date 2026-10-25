import os from 'os'
import path from 'path'
import { dump, JSON_SCHEMA, load } from 'js-yaml'
import type { AgentFormData, AgentImportOptions } from '@shared/types/agents'
import type { SkillFormData } from '@shared/types/skills'
import type { AgentResourceContent } from '@shared/agent-resources'
import { agentResourceService, type AgentResourceService } from './agent-resource-service'
import { bounded, parseRole, record } from './agent-resource-codecs'
import { readBounded, RESOURCE_MAX_BYTES, safeResourceName, utf8 } from './agent-resource-files'
import { ensureSafePathSegment, normalizePathForComparison } from '../utils/path-security'

type DirectoryKind = 'SKILL' | 'SUBAGENT'

/** 只替换表单明确编辑的顶层字段；未知权限字段和原文保持不变。 */
export function updateLegacyDefinition(original: string, form: SkillFormData | AgentFormData, kind: DirectoryKind): string {
  if (!record(form) || typeof form.name !== 'string' || !form.name.trim() || typeof form.description !== 'string' || typeof form.content !== 'string') throw new Error('名称、描述和正文格式无效')
  bounded(form)
  if (Buffer.byteLength(JSON.stringify(form)) > RESOURCE_MAX_BYTES) throw new Error('资源定义不能超过 1 MiB')
  const match = original.match(/^((?:\uFEFF)?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))([\s\S]*)$/)
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const metadata: unknown = match ? load(match[2], { schema: JSON_SCHEMA }) : {}
  if (!record(metadata)) throw new Error('原生 frontmatter 必须是对象，请使用原文编辑')
  bounded(metadata)
  const updates: Record<string, unknown> = { name: form.name, description: form.description }
  if (kind === 'SUBAGENT') {
    const role = form as AgentFormData
    if (role.tools !== undefined && (!Array.isArray(role.tools) || role.tools.some(tool => typeof tool !== 'string'))) throw new Error('工具权限必须是字符串列表')
    if (role.model !== undefined && typeof role.model !== 'string' || role.color !== undefined && typeof role.color !== 'string') throw new Error('模型和颜色必须是字符串')
    if (Object.hasOwn(form, 'tools')) updates.tools = role.tools?.length ? role.tools : undefined
    if (Object.hasOwn(form, 'model')) updates.model = role.model?.trim() || undefined
    if (Object.hasOwn(form, 'color')) updates.color = role.color?.trim() || undefined
  }
  let yaml = match?.[2] ?? ''
  const edits: Array<{ start: number; end: number; text: string }> = []
  const keys: Array<{ key: string; start: number }> = []
  const changed = Object.entries(updates).filter(([key, value]) => JSON.stringify(metadata[key]) !== JSON.stringify(value))
  for (const entry of changed.length ? yaml.matchAll(/^(\S[^\r\n]*?):(?:[ \t]|$)/gm) : []) {
    let parsed: unknown
    try { parsed = load(`${entry[1]}: null`, { schema: JSON_SCHEMA }) }
    catch { throw new Error('此 frontmatter 布局需要原文编辑，未修改原件') }
    if (!record(parsed) || Object.keys(parsed).length !== 1) throw new Error('此 frontmatter 布局需要原文编辑，未修改原件')
    keys.push({ key: Object.keys(parsed)[0], start: entry.index ?? 0 })
  }
  if (changed.length && Object.keys(metadata).some(key => !keys.some(entry => entry.key === key))) throw new Error('此 frontmatter 布局需要原文编辑，未修改原件')
  for (const [key, value] of changed) {
    const index = keys.findIndex(entry => entry.key === key)
    const text = value === undefined ? '' : dump({ [key]: value }, { schema: JSON_SCHEMA, lineWidth: -1 }).replaceAll('\n', newline)
    if (index >= 0) edits.push({ start: keys[index].start, end: keys[index + 1]?.start ?? yaml.length, text })
    else edits.push({ start: yaml.length, end: yaml.length, text: `${yaml && !yaml.endsWith('\n') ? newline : ''}${text}` })
  }
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) yaml = yaml.slice(0, edit.start) + edit.text + yaml.slice(edit.end)
  if (yaml.endsWith(newline)) yaml = yaml.slice(0, -newline.length)
  return match ? `${match[1]}${yaml}${match[3]}${form.content}` : `---${newline}${yaml}${newline}---${newline}${form.content}`
}

/** 旧表单只负责字段映射；真正写入、备份和版本检查统一交给资源服务。 */
export class LegacyResourceEditor {
  constructor(private readonly resources: AgentResourceService = agentResourceService, private readonly home = os.homedir()) {}

  private async find(kind: DirectoryKind, id: string, expectedRevision: string): Promise<AgentResourceContent> {
    const safeId = ensureSafePathSegment(id, '资源 ID')
    if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw new Error('缺少原始版本，请刷新列表后再修改')
    await this.resources.authorizeLegacyWrite(kind)
    const native = kind === 'SKILL' ? path.join(this.home, '.claude', 'skills', safeId, 'SKILL.md') : path.join(this.home, '.claude', 'agents', `${safeId}.md`)
    const query = { toolId: 'claude-code' as const, kind }
    const list = await this.resources.listResources(query)
    const resource = list.resources.find(item => normalizePathForComparison(item.location) === normalizePathForComparison(native))
    if (!resource || resource.writable === false || resource.revision !== expectedRevision) throw new Error('原件已变化或不可写，保留草稿并刷新后重试')
    const content = await this.resources.readResource({ ...query, resourceId: resource.resourceId })
    if (content.revision !== expectedRevision) throw new Error('原件已变化，保留草稿并刷新后重试')
    return content
  }

  async updateSkill(id: string, form: SkillFormData, expectedRevision: string): Promise<AgentResourceContent> {
    return this.update('SKILL', id, form, expectedRevision)
  }

  async updateAgent(id: string, form: AgentFormData, expectedRevision: string): Promise<AgentResourceContent> {
    return this.update('SUBAGENT', id, form, expectedRevision)
  }

  private async update(kind: DirectoryKind, id: string, form: SkillFormData | AgentFormData, expectedRevision: string): Promise<AgentResourceContent> {
    const original = await this.find(kind, id, expectedRevision)
    const content = updateLegacyDefinition(original.content, form, kind)
    return this.resources.saveResource({ toolId: 'claude-code', kind, name: original.name, resourceId: original.resourceId, expectedRevision, content })
  }

  async create(kind: DirectoryKind, form: SkillFormData | AgentFormData): Promise<AgentResourceContent> {
    await this.resources.authorizeLegacyWrite(kind)
    if (!record(form) || typeof form.name !== 'string') throw new Error('资源名称无效')
    const name = safeResourceName(form.name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    const content = updateLegacyDefinition('', form, kind)
    return this.resources.saveResource({ toolId: 'claude-code', kind, name, content })
  }

  async delete(kind: DirectoryKind, id: string, expectedRevision: string): Promise<void> {
    const original = await this.find(kind, id, expectedRevision)
    await this.resources.deleteResource({ toolId: 'claude-code', kind, resourceId: original.resourceId, expectedRevision })
  }

  async importAgentContent(content: string, options: AgentImportOptions = {}): Promise<string> {
    await this.resources.authorizeLegacyWrite('SUBAGENT')
    if (typeof content !== 'string' || Buffer.byteLength(content) > RESOURCE_MAX_BYTES || !record(options) || options.overwrite !== undefined && typeof options.overwrite !== 'boolean') throw new Error('角色导入参数无效或超过 1 MiB')
    const { metadata } = parseRole(content, 'claude-code')
    const name = safeResourceName(String(metadata.name).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    const query = { toolId: 'claude-code' as const, kind: 'SUBAGENT' as const }
    const original = (await this.resources.listResources(query)).resources.find(item => normalizePathForComparison(item.location) === normalizePathForComparison(path.join(this.home, '.claude', 'agents', `${name}.md`)))
    if (original && !options.overwrite) throw new Error(`Agent "${name}" 已存在，请选择覆盖或重命名`)
    await this.resources.saveResource({ ...query, name, content, resourceId: original?.resourceId, expectedRevision: original?.revision })
    return name
  }

  async importAgentFile(file: string, options: AgentImportOptions = {}): Promise<string> {
    const bytes = await readBounded(file)
    if (!bytes) throw new Error('角色来源文件不存在')
    return this.importAgentContent(utf8(bytes), options)
  }

  async importAgents(items: Array<{ path: string; content?: string }>, options: AgentImportOptions = {}): Promise<{ imported: string[]; errors: Array<{ path: string; error: string }> }> {
    if (!Array.isArray(items) || items.length > 50) throw new Error('每次最多导入 50 个角色')
    const result: { imported: string[]; errors: Array<{ path: string; error: string }> } = { imported: [], errors: [] }
    for (const item of items) {
      try { result.imported.push(item.content === undefined ? await this.importAgentFile(item.path, options) : await this.importAgentContent(item.content, options)) }
      catch (error) { result.errors.push({ path: item.path, error: error instanceof Error ? error.message : '角色导入失败' }) }
    }
    return result
  }
}

export const legacyResourceEditor = new LegacyResourceEditor()
