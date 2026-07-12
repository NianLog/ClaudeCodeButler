/**
 * @file src/main/services/tool-artifact-management-service.ts
 * @description 以 registry capabilities 驱动配置资产 validation、atomic edit、backup 与 restore。
 */

import { randomUUID } from 'crypto'
import { constants as fsConstants } from 'fs'
import { copyFile, lstat, mkdir, open, readFile, rename, rm, stat } from 'fs/promises'
import path from 'path'
import type {
  ConfigArtifactBackup,
  ConfigArtifactContent,
  ConfigArtifactValidationResult
} from '@shared/tool-registry'
import {
  CONFIG_ARTIFACT_MAX_BYTES,
  toolArtifactDiscoveryService,
  type ToolArtifactDiscoveryService
} from './tool-artifact-discovery-service'
import {
  toolArtifactCodecService,
  type ToolArtifactCodecService
} from './tool-artifact-codec-service'
import { pathManager } from '../utils/path-manager'

/** 持久化 backup metadata */
interface StoredArtifactBackup extends ConfigArtifactBackup {
  /** 受控 backup directory 内的内容文件名 */
  contentFileName: string
}

const BACKUP_METADATA_MAX_BYTES = 16 * 1024

/** Artifact management service 可替换依赖 */
export interface ToolArtifactManagementServiceOptions {
  /** Registry authorization 与 read service */
  discoveryService?: ToolArtifactDiscoveryService
  /** 内置 format codec service */
  codecService?: ToolArtifactCodecService
  /** 受控 backup directory */
  backupDirectory?: string
}

/**
 * 通用配置资产管理 service。
 * @description 所有写操作都要求 registry capability，并在目标旁使用随机 temp file 原子替换。
 */
export class ToolArtifactManagementService {
  private readonly discoveryService: ToolArtifactDiscoveryService
  private readonly codecService: ToolArtifactCodecService
  private readonly backupDirectory: string

  /**
   * 创建通用 artifact management service。
   * @param options 可替换依赖与 backup directory
   */
  constructor(options: ToolArtifactManagementServiceOptions = {}) {
    this.discoveryService = options.discoveryService ?? toolArtifactDiscoveryService
    this.codecService = options.codecService ?? toolArtifactCodecService
    this.backupDirectory = options.backupDirectory ?? pathManager.toolArtifactBackupDir
  }

  /**
   * 按 registry format 验证配置文本。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath registry candidate path
   * @param content 待验证文本
   * @returns codec validation 结果
   */
  public async validateArtifact(
    toolId: string,
    artifactId: string,
    requestedPath: string,
    content: string
  ): Promise<ConfigArtifactValidationResult> {
    this.assertContentSize(content)
    const { artifact } = await this.discoveryService.authorizeArtifact(
      toolId,
      artifactId,
      requestedPath,
      'VALIDATE'
    )
    return this.codecService.validate(artifact.format, content)
  }

  /**
   * 校验并原子更新 registry 授权的配置文件。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath registry candidate path
   * @param content 新 UTF-8 文本
   * @returns 更新后的只读 artifact snapshot
   */
  public async editArtifact(
    toolId: string,
    artifactId: string,
    requestedPath: string,
    content: string
  ): Promise<ConfigArtifactContent> {
    this.assertContentSize(content)
    const authorization = await this.discoveryService.authorizeArtifact(
      toolId,
      artifactId,
      requestedPath,
      'EDIT'
    )
    if (authorization.artifact.capabilities.includes('VALIDATE')) {
      const validation = this.codecService.validate(authorization.artifact.format, content)
      if (!validation.valid) throw new Error(`配置校验失败: ${validation.errors.join('; ')}`)
    }
    if (authorization.artifact.capabilities.includes('BACKUP')) {
      await this.createBackup(toolId, artifactId, authorization.resolvedPath)
    }
    await this.writeTextAtomic(authorization.resolvedPath, content)
    return this.discoveryService.readArtifact(toolId, artifactId, authorization.resolvedPath)
  }

  /**
   * 创建 registry 授权的配置资产备份。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath registry candidate path
   * @returns backup metadata
   */
  public async createBackup(
    toolId: string,
    artifactId: string,
    requestedPath: string
  ): Promise<ConfigArtifactBackup> {
    const { resolvedPath } = await this.discoveryService.authorizeArtifact(
      toolId,
      artifactId,
      requestedPath,
      'BACKUP'
    )
    const sourceMetadata = await stat(resolvedPath)
    if (!sourceMetadata.isFile() || sourceMetadata.size > CONFIG_ARTIFACT_MAX_BYTES) {
      throw new Error('备份源不是允许大小的普通文件')
    }
    await mkdir(this.backupDirectory, { recursive: true })
    const backupId = randomUUID()
    const contentFileName = `${backupId}.backup`
    const contentPath = path.join(this.backupDirectory, contentFileName)
    const metadataPath = path.join(this.backupDirectory, `${backupId}.json`)
    const backup: StoredArtifactBackup = {
      backupId,
      toolId,
      artifactId,
      originalPath: resolvedPath,
      size: sourceMetadata.size,
      createdAt: new Date().toISOString(),
      contentFileName
    }
    await copyFile(resolvedPath, contentPath, fsConstants.COPYFILE_EXCL)
    try {
      await this.writeTextAtomic(metadataPath, JSON.stringify(backup, null, 2))
    } catch (error) {
      await rm(contentPath, { force: true })
      throw error
    }
    return this.toPublicBackup(backup)
  }

  /**
   * 从受控 metadata 恢复 registry 仍授权的备份。
   * @param backupId UUID backup identifier
   * @returns 恢复后的 artifact snapshot
   */
  public async restoreBackup(backupId: string): Promise<ConfigArtifactContent> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backupId)) {
      throw new Error('backupId 格式无效')
    }
    const metadataPath = path.join(this.backupDirectory, `${backupId}.json`)
    const metadataFile = await lstat(metadataPath)
    if (metadataFile.isSymbolicLink() || !metadataFile.isFile() || metadataFile.size > BACKUP_METADATA_MAX_BYTES) {
      throw new Error('备份 metadata 不是允许大小的普通文件')
    }
    const backup = JSON.parse(await readFile(metadataPath, 'utf8')) as StoredArtifactBackup
    if (
      backup.backupId !== backupId
      || backup.contentFileName !== `${backupId}.backup`
      || typeof backup.originalPath !== 'string'
    ) {
      throw new Error('备份 metadata 无效')
    }
    const authorization = await this.discoveryService.authorizeArtifact(
      backup.toolId,
      backup.artifactId,
      backup.originalPath,
      'RESTORE'
    )
    const contentPath = path.join(this.backupDirectory, backup.contentFileName)
    const backupMetadata = await lstat(contentPath)
    if (
      backupMetadata.isSymbolicLink()
      || !backupMetadata.isFile()
      || backupMetadata.size > CONFIG_ARTIFACT_MAX_BYTES
    ) {
      throw new Error('备份内容不是允许大小的普通文件')
    }
    const contentBuffer = await readFile(contentPath)
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(contentBuffer)
    } catch {
      throw new Error('备份内容不是有效的 UTF-8 文本')
    }
    if (authorization.artifact.capabilities.includes('VALIDATE')) {
      const validation = this.codecService.validate(authorization.artifact.format, content)
      if (!validation.valid) throw new Error(`备份配置校验失败: ${validation.errors.join('; ')}`)
    }
    await this.writeTextAtomic(authorization.resolvedPath, content)
    return this.discoveryService.readArtifact(
      backup.toolId,
      backup.artifactId,
      authorization.resolvedPath
    )
  }

  /**
   * 限制 renderer 提交的 UTF-8 内容大小。
   * @param content 配置文本
   */
  private assertContentSize(content: string): void {
    if (typeof content !== 'string') throw new Error('配置内容必须是 string')
    if (Buffer.byteLength(content, 'utf8') > CONFIG_ARTIFACT_MAX_BYTES) {
      throw new Error(`配置内容超过限制: ${CONFIG_ARTIFACT_MAX_BYTES} bytes`)
    }
  }

  /**
   * 在目标目录内写入随机 temp file 并原子替换。
   * @param targetPath 目标绝对路径
   * @param content UTF-8 文本
   */
  private async writeTextAtomic(targetPath: string, content: string): Promise<void> {
    const tempPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${randomUUID()}.tmp`)
    const fileHandle = await open(tempPath, 'wx')
    try {
      await fileHandle.writeFile(content, 'utf8')
      await fileHandle.sync()
    } finally {
      await fileHandle.close()
    }
    try {
      await rename(tempPath, targetPath)
    } catch (error) {
      await rm(tempPath, { force: true })
      throw error
    }
  }

  /**
   * 移除内部 backup content filename。
   * @param backup 持久化 metadata
   * @returns renderer-safe backup metadata
   */
  private toPublicBackup(backup: StoredArtifactBackup): ConfigArtifactBackup {
    return {
      backupId: backup.backupId,
      toolId: backup.toolId,
      artifactId: backup.artifactId,
      originalPath: backup.originalPath,
      size: backup.size,
      createdAt: backup.createdAt
    }
  }
}

/** 默认通用 artifact management service */
export const toolArtifactManagementService = new ToolArtifactManagementService()
