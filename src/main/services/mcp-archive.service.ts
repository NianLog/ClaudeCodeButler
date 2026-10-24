/** 禁用的 MCP 先持久化到归档；恢复在 native 保存成功后才确认移除。 */
import path from 'path'
import { app } from 'electron'
import type { MCPServerConfig } from '@shared/types/mcp'
import { logger } from '../utils/logger'
import { writeTextAtomic } from '../utils/atomic-json-writer'
import { assertSafeMcpKeys, createMcpDictionary } from '../utils/mcp-data'
import { assertNoLinks, digest, readBounded, utf8 } from './agent-resource-files'
import { editJsonSubtree, editRawJsonSubtree, extractJsonSubtree, jsonEqual, parseJson, record } from './agent-resource-codecs'

export interface MCPArchiveEntry {
  config: MCPServerConfig
  archivedAt: number
  rawConfig?: string
  revision?: string
}
interface MCPArchiveFile {
  global: Record<string, MCPArchiveEntry>
  projects: Record<string, Record<string, MCPArchiveEntry>>
}
interface ArchiveResult { success: boolean; error?: string }
interface ArchiveSnapshot { content: string; bytes?: Buffer; archive: MCPArchiveFile }
const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024

export class MCPArchiveService {
  private readonly archivePath = path.join(app.getPath('userData'), 'mcp-archive.json')
  private pending: Promise<void> = Promise.resolve()

  // 不能嵌套资源公共队列：调用者已持有该队列；这里只串行化归档自身的读改写。
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.then(() => undefined, () => undefined)
    return result
  }

  private async snapshot(): Promise<ArchiveSnapshot> {
    const bytes = await readBounded(this.archivePath, MAX_ARCHIVE_BYTES)
    const content = bytes ? utf8(bytes) : '{"global":{},"projects":{}}\n'
    const value = parseJson(content)
    if (value.global !== undefined && !record(value.global) || value.projects !== undefined && !record(value.projects)) throw new Error('MCP 归档的 global/projects 必须是对象，未覆盖原文件')
    const global = (value.global ?? createMcpDictionary<MCPArchiveEntry>()) as Record<string, MCPArchiveEntry>
    const projects = (value.projects ?? createMcpDictionary<Record<string, MCPArchiveEntry>>()) as Record<string, Record<string, MCPArchiveEntry>>
    const validate = (entries: Record<string, MCPArchiveEntry>, scope: string) => {
      assertSafeMcpKeys(scope)
      for (const [id, entry] of Object.entries(entries)) {
        assertSafeMcpKeys(id)
        if (!record(entry) || !record(entry.config) || typeof entry.archivedAt !== 'number' || !Number.isFinite(entry.archivedAt) || (entry.rawConfig !== undefined && typeof entry.rawConfig !== 'string')) throw new Error('MCP 归档条目损坏，未覆盖原文件')
        if (entry.rawConfig !== undefined) {
          if (!jsonEqual(parseJson(entry.rawConfig), entry.config)) throw new Error('MCP 归档原始定义与 config 不一致，保留原文件供核查')
        }
      }
    }
    validate(global, 'global')
    for (const [project, entries] of Object.entries(projects)) {
      if (!record(entries)) throw new Error('MCP 项目归档必须是对象')
      validate(entries as Record<string, MCPArchiveEntry>, project)
    }
    return { content, bytes, archive: { global, projects } }
  }

  private keyPath(serverId: string, scope: string): string[] {
    assertSafeMcpKeys(serverId, scope)
    return scope === 'global' ? ['global', serverId] : ['projects', scope, serverId]
  }

  private entry(snapshot: ArchiveSnapshot, serverId: string, scope: string): MCPArchiveEntry | null {
    const keys = this.keyPath(serverId, scope)
    const collection = scope === 'global' ? snapshot.archive.global : snapshot.archive.projects[scope]
    if (!collection || !Object.hasOwn(collection, serverId)) return null
    const source = extractJsonSubtree(snapshot.content, keys)
    const rawConfig = extractJsonSubtree(snapshot.content, [...keys, 'config'])
    if (!source || !rawConfig) throw new Error('无法定位 MCP 归档原文')
    if (collection[serverId].rawConfig !== undefined && collection[serverId].rawConfig !== rawConfig) throw new Error('MCP 归档原始定义与 config 不一致，保留原文件供核查')
    return { ...collection[serverId], rawConfig, revision: digest(source) }
  }

  private async persist(snapshot: ArchiveSnapshot, next: string): Promise<void> {
    if (Buffer.byteLength(next) > MAX_ARCHIVE_BYTES) throw new Error('MCP 归档超过 16 MiB，原文件未更改')
    parseJson(next)
    if (snapshot.bytes) {
      await assertNoLinks(`${this.archivePath}.backup`)
      await writeTextAtomic(`${this.archivePath}.backup`, snapshot.bytes)
    }
    const current = await readBounded(this.archivePath, MAX_ARCHIVE_BYTES)
    if ((current ? digest(current) : undefined) !== (snapshot.bytes ? digest(snapshot.bytes) : undefined)) throw new Error('MCP 归档在备份期间发生变化，未覆盖')
    await assertNoLinks(this.archivePath)
    await writeTextAtomic(this.archivePath, next)
  }

  async readArchive(): Promise<MCPArchiveFile> { return (await this.snapshot()).archive }

  private async archiveServer(serverId: string, scope: string, config: MCPServerConfig, rawConfig?: string): Promise<ArchiveResult> {
    try {
      return await this.enqueue(async () => {
        const keys = this.keyPath(serverId, scope)
        const raw = extractJsonSubtree(rawConfig ?? JSON.stringify(config), [])
        if (!raw || !record(config) || !jsonEqual(parseJson(raw), config)) throw new Error('MCP 归档定义与原文不一致')
        const snapshot = await this.snapshot()
        const old = this.entry(snapshot, serverId, scope)
        if (old) {
          if (old.rawConfig !== raw) throw new Error('同名归档已有不同定义，请先核查，未覆盖安全副本')
          return { success: true }
        }
        let next = editJsonSubtree(snapshot.content, keys, undefined, { config, archivedAt: Date.now(), rawConfig: raw })
        next = editRawJsonSubtree(next, [...keys, 'config'], raw)
        await this.persist(snapshot, next)
        return { success: true }
      })
    } catch (error) {
      const message = `归档 MCP 服务失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(message)
      return { success: false, error: message }
    }
  }

  archiveGlobalServer(serverId: string, config: MCPServerConfig, rawConfig?: string): Promise<ArchiveResult> {
    return this.archiveServer(serverId, 'global', config, rawConfig)
  }

  archiveProjectServer(serverId: string, projectPath: string, config: MCPServerConfig, rawConfig?: string): Promise<ArchiveResult> {
    return this.archiveServer(serverId, projectPath, config, rawConfig)
  }

  async peekServer(serverId: string, scope: string): Promise<MCPArchiveEntry | null> {
    this.keyPath(serverId, scope)
    return this.entry(await this.snapshot(), serverId, scope)
  }

  /** 兼容旧内部调用的读取结果；此方法不再提前删除归档。 */
  async restoreGlobalServer(serverId: string): Promise<MCPServerConfig | null> {
    return (await this.peekServer(serverId, 'global'))?.config ?? null
  }

  async restoreProjectServer(serverId: string, projectPath: string): Promise<MCPServerConfig | null> {
    return (await this.peekServer(serverId, projectPath))?.config ?? null
  }

  async getArchivedGlobalServers(): Promise<Record<string, MCPArchiveEntry>> { return (await this.readArchive()).global }

  async getArchivedProjectServers(projectPath: string): Promise<Record<string, MCPArchiveEntry>> {
    assertSafeMcpKeys(projectPath)
    return (await this.readArchive()).projects[projectPath] ?? createMcpDictionary<MCPArchiveEntry>()
  }

  async isArchived(serverId: string, scope: string): Promise<boolean> { return (await this.peekServer(serverId, scope)) !== null }

  private async remove(serverId: string, scope: string, expectedRevision?: string): Promise<ArchiveResult> {
    try {
      return await this.enqueue(async () => {
        const keys = this.keyPath(serverId, scope)
        const snapshot = await this.snapshot()
        const old = this.entry(snapshot, serverId, scope)
        if (!old) throw new Error('MCP 服务不在归档中')
        if (expectedRevision !== undefined && old.revision !== expectedRevision) throw new Error('MCP 归档条目在恢复期间发生变化，保留安全副本')
        const collection = scope === 'global' ? snapshot.archive.global : snapshot.archive.projects[scope]
        const next = scope !== 'global' && Object.keys(collection).length === 1
          ? editJsonSubtree(snapshot.content, ['projects', scope], collection, undefined)
          : editJsonSubtree(snapshot.content, keys, collection[serverId], undefined)
        await this.persist(snapshot, next)
        return { success: true }
      })
    } catch (error) {
      const message = `移除 MCP 归档失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(message)
      return { success: false, error: message }
    }
  }

  confirmRestore(serverId: string, scope: string, expectedRevision: string): Promise<ArchiveResult> {
    if (!/^[a-f0-9]{64}$/.test(expectedRevision)) return Promise.resolve({ success: false, error: '缺少有效归档版本，保留安全副本' })
    return this.remove(serverId, scope, expectedRevision)
  }

  deleteArchivedServer(serverId: string, scope: string): Promise<ArchiveResult> { return this.remove(serverId, scope) }

  getArchivePath(): string { return this.archivePath }
}

export const mcpArchiveService = new MCPArchiveService()
