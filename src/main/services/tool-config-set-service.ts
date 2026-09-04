/**
 * @file src/main/services/tool-config-set-service.ts
 * @description Registry 驱动的多工具"配置集"服务：对 configSet 分组 artifacts 做命名快照、
 * 编辑与整体切换。快照存储在 CCB 数据目录（config-sets/<toolId>/<setId>/），激活时逐文件
 * 复用既有 per-artifact 授权/校验/备份/原子写链路，不引入新的写路径。
 */

import { randomUUID } from 'crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import path from 'path'
import type {
  ConfigArtifactDefinition,
  ToolConfigSetContent,
  ToolConfigSetFileSummary,
  ToolConfigSetSummary
} from '@shared/tool-registry'
import type { ToolRegistryService } from './tool-registry-service'
import { toolRegistryService } from './tool-registry-service'
import type { ToolArtifactDiscoveryService } from './tool-artifact-discovery-service'
import { toolArtifactDiscoveryService } from './tool-artifact-discovery-service'
import type { ToolArtifactManagementService } from './tool-artifact-management-service'
import { toolArtifactManagementService } from './tool-artifact-management-service'
import { pathManager } from '../utils/path-manager'
import { ensurePathWithinBase } from '../utils/path-security'
import { logger } from '../utils/logger'

/** 单个配置集文件内容上限（与 artifact 读取限制对齐） */
const CONFIG_SET_MAX_FILE_BYTES = 1024 * 1024
/** 配置集显示名最大长度 */
const CONFIG_SET_NAME_MAX_LENGTH = 48
/** 显示名合法字符：中英文、数字、空格、连字符、下划线、点 */
const CONFIG_SET_NAME_PATTERN = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 .-]*$/

/** 配置集持久化元数据 */
interface StoredConfigSetMetadata {
  setId: string
  name: string
  createdAt: string
  lastModifiedAt: string
  artifacts: string[]
}

export interface ToolConfigSetServiceOptions {
  registryService?: ToolRegistryService
  discoveryService?: ToolArtifactDiscoveryService
  managementService?: ToolArtifactManagementService
  /** 配置集根目录（默认 <ccb>/config-sets） */
  baseDirectory?: string
}

/**
 * 多工具配置集 service。
 * @description 工具与分组完全来自 effective registry 的 configSet 声明；快照目录按 setId（随机 UUID
 * 派生）寻址，显示名仅存于元数据，杜绝名字到路径的注入面。
 */
export class ToolConfigSetService {
  private readonly registryService: ToolRegistryService
  private readonly discoveryService: ToolArtifactDiscoveryService
  private readonly managementService: ToolArtifactManagementService
  private readonly baseDirectory: string

  constructor(options: ToolConfigSetServiceOptions = {}) {
    this.registryService = options.registryService ?? toolRegistryService
    this.discoveryService = options.discoveryService ?? toolArtifactDiscoveryService
    this.managementService = options.managementService ?? toolArtifactManagementService
    this.baseDirectory = options.baseDirectory ?? path.join(pathManager.appDataDir, 'config-sets')
  }

  /**
   * 列出工具的全部配置集（含 isInUse 比对结果）。
   */
  public async listConfigSets(toolId: string): Promise<ToolConfigSetSummary[]> {
    const members = await this.requireConfigSetMembers(toolId)
    const toolDirectory = this.getToolDirectory(toolId)
    let entries: string[]
    try {
      entries = await readdir(toolDirectory)
    } catch {
      return []
    }

    const summaries: ToolConfigSetSummary[] = []
    for (const entry of entries) {
      const metadata = await this.readSetMetadata(toolId, entry)
      if (!metadata) continue
      const files: ToolConfigSetFileSummary[] = []
      let allFilesPresent = true
      for (const artifactId of metadata.artifacts) {
        const member = members.find((candidate) => candidate.artifactId === artifactId)
        const filePath = this.getSetFilePath(toolId, entry, artifactId)
        try {
          const fileStat = await stat(filePath)
          files.push({ artifactId, format: member?.format ?? 'TEXT', size: fileStat.size })
        } catch {
          allFilesPresent = false
        }
      }
      if (!allFilesPresent) continue
      const isInUse = await this.computeInUse(toolId, entry, members)
      summaries.push({
        toolId,
        setId: metadata.setId,
        name: metadata.name,
        createdAt: metadata.createdAt,
        lastModifiedAt: metadata.lastModifiedAt,
        files,
        isInUse
      })
    }
    summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return summaries
  }

  /**
   * 从当前生效配置创建命名配置集快照。
   * @param toolId stable tool identifier
   * @param name 显示名
   * @returns 新配置集摘要
   */
  public async createConfigSet(toolId: string, name: string): Promise<ToolConfigSetSummary> {
    const members = await this.requireConfigSetMembers(toolId)
    this.assertValidName(name)
    await this.assertNameAvailable(toolId, name)

    const contents: Array<{ artifactId: string; content: string }> = []
    for (const member of members) {
      contents.push({
        artifactId: member.artifactId,
        content: await this.readLiveContentOrTemplate(toolId, member)
      })
    }
    return this.writeConfigSet(toolId, name, members, contents)
  }

  /**
   * 从外部提供的内容创建命名配置集（云模板导入链路）。
   * @description 仅接受 configSet 成员的 artifactId；模板未覆盖的成员回退到当前生效内容或
   *              registry 默认模板。全部内容先校验后写入，任何失败不留半成品快照。
   * @param toolId stable tool identifier
   * @param name 显示名
   * @param files 模板提供的文件内容（artifactId → content，可覆盖部分成员）
   * @returns 新配置集摘要
   */
  public async createConfigSetFromContents(
    toolId: string,
    name: string,
    files: Array<{ artifactId: string; content: string }>
  ): Promise<ToolConfigSetSummary> {
    const members = await this.requireConfigSetMembers(toolId)
    this.assertValidName(name)
    await this.assertNameAvailable(toolId, name)

    const memberByArtifact = new Map(members.map((member) => [member.artifactId, member]))
    const providedByArtifact = new Map<string, string>()
    for (const file of files) {
      const member = memberByArtifact.get(file.artifactId)
      if (!member) throw new Error(`配置集不包含该文件: ${file.artifactId}`)
      if (providedByArtifact.has(file.artifactId)) {
        throw new Error(`配置集文件重复提供: ${file.artifactId}`)
      }
      this.assertContentSize(file.content)
      providedByArtifact.set(file.artifactId, file.content)
    }
    if (providedByArtifact.size === 0) throw new Error('配置集导入内容为空')

    const contents: Array<{ artifactId: string; content: string }> = []
    for (const member of members) {
      const provided = providedByArtifact.get(member.artifactId)
      contents.push({
        artifactId: member.artifactId,
        content: provided !== undefined
          ? provided
          : await this.readLiveContentOrTemplate(toolId, member)
      })
    }
    return this.writeConfigSet(toolId, name, members, contents)
  }

  /**
   * 写入新配置集目录（全部校验通过后逐文件原子写 + 元数据；失败清理半成品）。
   */
  private async writeConfigSet(
    toolId: string,
    name: string,
    members: ConfigArtifactDefinition[],
    contents: Array<{ artifactId: string; content: string }>
  ): Promise<ToolConfigSetSummary> {
    const setId = `set-${randomUUID().slice(0, 12)}`
    const setDirectory = this.getSetDirectory(toolId, setId)
    await mkdir(setDirectory, { recursive: true })

    const now = new Date().toISOString()
    try {
      for (const file of contents) {
        this.assertContentSize(file.content)
        await this.writeSetFileAtomic(toolId, setId, file.artifactId, file.content)
      }
      if (contents.length === 0) throw new Error('配置集没有任何可快照的文件')

      const metadata: StoredConfigSetMetadata = {
        setId,
        name,
        createdAt: now,
        lastModifiedAt: now,
        artifacts: members.map((member) => member.artifactId)
      }
      await this.writeSetMetadataAtomic(toolId, setId, metadata)
    } catch (error) {
      await rm(setDirectory, { recursive: true, force: true })
      throw error
    }

    logger.info(`配置集已创建: ${toolId}/${setId} (${name})`)
    const summaries = await this.listConfigSets(toolId)
    const created = summaries.find((summary) => summary.setId === setId)
    if (!created) throw new Error('配置集创建后无法读取')
    return created
  }

  /**
   * 读取配置集内容（编辑/预览）。
   */
  public async readConfigSet(toolId: string, setId: string): Promise<ToolConfigSetContent> {
    const members = await this.requireConfigSetMembers(toolId)
    const metadata = await this.requireSetMetadata(toolId, setId)
    const files: ToolConfigSetContent['files'] = []
    for (const artifactId of metadata.artifacts) {
      const member = members.find((candidate) => candidate.artifactId === artifactId)
      if (!member) continue
      const content = await this.readSetFile(toolId, setId, artifactId)
      files.push({ artifactId, format: member.format, content })
    }
    return { toolId, setId, name: metadata.name, files }
  }

  /**
   * 保存配置集内容（仅写入 CCB 快照目录，不触碰任何生效配置文件）。
   */
  public async saveConfigSetContent(
    toolId: string,
    setId: string,
    files: Array<{ artifactId: string; content: string }>
  ): Promise<void> {
    const members = await this.requireConfigSetMembers(toolId)
    const metadata = await this.requireSetMetadata(toolId, setId)
    const memberByArtifact = new Map(members.map((member) => [member.artifactId, member]))
    const requested = new Set(files.map((file) => file.artifactId))
    for (const artifactId of metadata.artifacts) {
      if (!requested.has(artifactId)) {
        throw new Error(`缺少配置集文件内容: ${artifactId}`)
      }
    }

    // 先全部校验，后写入，避免半更新的快照
    for (const file of files) {
      const member = memberByArtifact.get(file.artifactId)
      if (!member) throw new Error(`配置集不包含该文件: ${file.artifactId}`)
      this.assertContentSize(file.content)
      if (member.capabilities.includes('VALIDATE')) {
        await this.managementService.validateArtifact(toolId, file.artifactId, '', file.content)
      }
    }
    for (const file of files) {
      await this.writeSetFileAtomic(toolId, setId, file.artifactId, file.content)
    }
    metadata.lastModifiedAt = new Date().toISOString()
    await this.writeSetMetadataAtomic(toolId, setId, metadata)
    logger.info(`配置集内容已保存: ${toolId}/${setId}`)
  }

  /**
   * 激活配置集：全组校验通过后，逐文件将快照内容写入生效配置（复用既有授权/备份/原子写链）。
   */
  public async activateConfigSet(toolId: string, setId: string): Promise<void> {
    const metadata = await this.requireSetMetadata(toolId, setId)
    const content = await this.readConfigSet(toolId, setId)
    if (content.files.length === 0) throw new Error('配置集为空，无法激活')

    // 先全部校验，再逐文件写；任何一步失败中止（已写文件保留各自备份可恢复）
    for (const file of content.files) {
      await this.managementService.validateArtifact(toolId, file.artifactId, '', file.content)
    }
    for (const file of content.files) {
      await this.managementService.editArtifact(toolId, file.artifactId, '', file.content)
    }
    logger.info(`配置集已激活: ${toolId}/${setId} (${metadata.name})`)
  }

  /**
   * 删除配置集。
   */
  public async deleteConfigSet(toolId: string, setId: string): Promise<void> {
    const setDirectory = this.getSetDirectory(toolId, setId)
    ensurePathWithinBase(setDirectory, this.getToolDirectory(toolId), '配置集目录')
    await rm(setDirectory, { recursive: true, force: true })
    logger.info(`配置集已删除: ${toolId}/${setId}`)
  }

  /**
   * 获取工具的 configSet 成员定义（声明顺序）。
   */
  private async requireConfigSetMembers(toolId: string): Promise<ConfigArtifactDefinition[]> {
    const tool = await this.registryService.getTool(toolId)
    if (!tool) throw new Error(`工具定义不存在: ${toolId}`)
    const members = tool.artifacts.filter((artifact) => artifact.configSet !== undefined)
    if (members.length === 0) {
      throw new Error(`工具未声明任何 configSet artifact: ${toolId}`)
    }
    return members
  }

  /**
   * 读取生效文件内容；文件不存在时回退 registry 声明的默认模板。
   */
  private async readLiveContentOrTemplate(
    toolId: string,
    member: ConfigArtifactDefinition
  ): Promise<string> {
    if (!member.capabilities.includes('READ')) {
      throw new Error(`配置集成员未声明 READ capability: ${member.artifactId}`)
    }
    try {
      const content = await this.discoveryService.readArtifact(toolId, member.artifactId, '')
      return content.content
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT' && !this.isMissingFileError(error)) {
        throw error
      }
      return member.defaultTemplate ?? ''
    }
  }

  /**
   * 判断错误是否为"文件不存在"（readArtifact 对缺失文件抛出 Error，需按消息或 code 识别）。
   */
  private isMissingFileError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('ENOENT')
  }

  /**
   * 比对快照内容与当前生效内容，判断配置集是否在用。
   */
  private async computeInUse(
    toolId: string,
    setId: string,
    members: ConfigArtifactDefinition[]
  ): Promise<boolean> {
    const metadata = await this.readSetMetadata(toolId, setId)
    if (!metadata) return false
    for (const artifactId of metadata.artifacts) {
      const member = members.find((candidate) => candidate.artifactId === artifactId)
      if (!member) continue
      let liveContent: string
      try {
        liveContent = (await this.discoveryService.readArtifact(toolId, artifactId, '')).content
      } catch {
        return false
      }
      const snapshotContent = await this.readSetFile(toolId, setId, artifactId)
      if (liveContent !== snapshotContent) return false
    }
    return true
  }

  /**
   * 校验配置集显示名。
   */
  private assertValidName(name: string): void {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.length > CONFIG_SET_NAME_MAX_LENGTH ||
      !CONFIG_SET_NAME_PATTERN.test(name) ||
      name.includes('..')
    ) {
      throw new Error(`配置集名称不合法（1-${CONFIG_SET_NAME_MAX_LENGTH} 位中英文/数字/空格/._-）`)
    }
  }

  /**
   * 确保显示名不重复（大小写不敏感）。
   */
  private async assertNameAvailable(toolId: string, name: string): Promise<void> {
    const existing = await this.listConfigSets(toolId)
    if (existing.some((summary) => summary.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`配置集名称已存在: ${name}`)
    }
  }

  private getToolDirectory(toolId: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(toolId)) {
      throw new Error(`非法 toolId: ${toolId}`)
    }
    return path.join(this.baseDirectory, toolId)
  }

  private getSetDirectory(toolId: string, setId: string): string {
    if (!/^set-[a-f0-9-]+$/.test(setId)) {
      throw new Error(`非法 setId: ${setId}`)
    }
    return path.join(this.getToolDirectory(toolId), setId)
  }

  private getSetFilePath(toolId: string, setId: string, artifactId: string): string {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifactId)) {
      throw new Error(`非法 artifactId: ${artifactId}`)
    }
    return path.join(this.getSetDirectory(toolId, setId), `${artifactId}.txt`)
  }

  private getSetMetadataPath(toolId: string, setId: string): string {
    return path.join(this.getSetDirectory(toolId, setId), 'set.json')
  }

  private async readSetMetadata(
    toolId: string,
    setId: string
  ): Promise<StoredConfigSetMetadata | null> {
    try {
      const raw = await readFile(this.getSetMetadataPath(toolId, setId), 'utf8')
      const parsed = JSON.parse(raw) as StoredConfigSetMetadata
      if (parsed.setId !== setId || !Array.isArray(parsed.artifacts)) return null
      return parsed
    } catch {
      return null
    }
  }

  private async requireSetMetadata(toolId: string, setId: string): Promise<StoredConfigSetMetadata> {
    const metadata = await this.readSetMetadata(toolId, setId)
    if (!metadata) throw new Error(`配置集不存在: ${toolId}/${setId}`)
    return metadata
  }

  private async readSetFile(toolId: string, setId: string, artifactId: string): Promise<string> {
    const filePath = this.getSetFilePath(toolId, setId, artifactId)
    const fileStat = await stat(filePath)
    if (!fileStat.isFile() || fileStat.size > CONFIG_SET_MAX_FILE_BYTES) {
      throw new Error('配置集文件不是允许大小的普通文件')
    }
    return readFile(filePath, 'utf8')
  }

  /**
   * 原子写入配置集文件（同目录 temp + rename）。
   */
  private async writeSetFileAtomic(
    toolId: string,
    setId: string,
    artifactId: string,
    content: string
  ): Promise<void> {
    this.assertContentSize(content)
    const targetPath = this.getSetFilePath(toolId, setId, artifactId)
    const tempPath = `${targetPath}.${randomUUID().slice(0, 8)}.tmp`
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, targetPath)
  }

  private async writeSetMetadataAtomic(
    toolId: string,
    setId: string,
    metadata: StoredConfigSetMetadata
  ): Promise<void> {
    const targetPath = this.getSetMetadataPath(toolId, setId)
    const tempPath = `${targetPath}.${randomUUID().slice(0, 8)}.tmp`
    await writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf8')
    await rename(tempPath, targetPath)
  }

  private assertContentSize(content: string): void {
    if (Buffer.byteLength(content, 'utf8') > CONFIG_SET_MAX_FILE_BYTES) {
      throw new Error(`配置集文件超过 ${CONFIG_SET_MAX_FILE_BYTES} bytes 限制`)
    }
  }
}

/** 默认共享实例 */
export const toolConfigSetService = new ToolConfigSetService()
