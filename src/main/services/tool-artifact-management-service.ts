/**
 * @file src/main/services/tool-artifact-management-service.ts
 * @description 以 registry capabilities 驱动配置资产 validation、atomic edit、backup 与 restore。
 */

import { randomUUID } from 'crypto'
import { constants as fsConstants } from 'fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, stat } from 'fs/promises'
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
import { ensurePathWithinBase } from '../utils/path-security'

/** 持久化 backup metadata */
interface StoredArtifactBackup extends ConfigArtifactBackup {
  /** 受控 backup directory 内的内容文件名 */
  contentFileName: string
}

const BACKUP_METADATA_MAX_BYTES = 16 * 1024
const DEFAULT_MAX_BACKUPS_PER_ARTIFACT = 20

/** Artifact management service 可替换依赖 */
export interface ToolArtifactManagementServiceOptions {
  /** Registry authorization 与 read service */
  discoveryService?: ToolArtifactDiscoveryService
  /** 内置 format codec service */
  codecService?: ToolArtifactCodecService
  /** 受控 backup directory */
  backupDirectory?: string
  /** 单个 artifact/path 保留的最大备份数 */
  maxBackupsPerArtifact?: number
}

/**
 * 通用配置资产管理 service。
 * @description 所有写操作都要求 registry capability，并在目标旁使用随机 temp file 原子替换。
 */
export class ToolArtifactManagementService {
  private readonly discoveryService: ToolArtifactDiscoveryService
  private readonly codecService: ToolArtifactCodecService
  private readonly backupDirectory: string
  private readonly maxBackupsPerArtifact: number
  private backupMutationQueue: Promise<void> = Promise.resolve()
  private lastBackupCreatedAtMs = 0

  /**
   * 创建通用 artifact management service。
   * @param options 可替换依赖与 backup directory
   */
  constructor(options: ToolArtifactManagementServiceOptions = {}) {
    this.discoveryService = options.discoveryService ?? toolArtifactDiscoveryService
    this.codecService = options.codecService ?? toolArtifactCodecService
    this.backupDirectory = options.backupDirectory ?? pathManager.toolArtifactBackupDir
    this.maxBackupsPerArtifact = options.maxBackupsPerArtifact ?? DEFAULT_MAX_BACKUPS_PER_ARTIFACT
    if (!Number.isInteger(this.maxBackupsPerArtifact) || this.maxBackupsPerArtifact < 1) {
      throw new Error('maxBackupsPerArtifact 必须是正整数')
    }
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
    return this.enqueueBackupMutation(() => this.createBackupInternal(toolId, artifactId, requestedPath))
  }

  /**
   * 创建备份并执行 retention cleanup。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath registry candidate path
   * @returns backup metadata
   */
  private async createBackupInternal(
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
    const contentPath = ensurePathWithinBase(
      path.join(this.backupDirectory, contentFileName),
      this.backupDirectory,
      '配置备份内容文件'
    )
    const metadataPath = ensurePathWithinBase(
      path.join(this.backupDirectory, `${backupId}.json`),
      this.backupDirectory,
      '配置备份元数据文件'
    )
    const backup: StoredArtifactBackup = {
      backupId,
      toolId,
      artifactId,
      originalPath: resolvedPath,
      size: sourceMetadata.size,
      createdAt: this.createMonotonicBackupTimestamp(),
      contentFileName
    }
    await copyFile(resolvedPath, contentPath, fsConstants.COPYFILE_EXCL)
    try {
      await this.writeTextAtomic(metadataPath, JSON.stringify(backup, null, 2))
    } catch (error) {
      await rm(contentPath, { force: true })
      throw error
    }
    await this.pruneBackups(backup)
    return this.toPublicBackup(backup)
  }

  /**
   * 列出指定 registry artifact 当前可恢复的备份。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath registry candidate path
   * @returns 按创建时间倒序的有效 backup metadata
   */
  public async listBackups(
    toolId: string,
    artifactId: string,
    requestedPath: string
  ): Promise<ConfigArtifactBackup[]> {
    const authorization = await this.discoveryService.authorizeArtifact(
      toolId,
      artifactId,
      requestedPath,
      'RESTORE'
    )
    let fileNames: string[]
    try {
      fileNames = await readdir(this.backupDirectory)
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') return []
      throw error
    }
    const backups = await Promise.all(fileNames
      .filter((fileName) => /^[0-9a-f-]{36}\.json$/i.test(fileName))
      .map((fileName) => this.readStoredBackup(ensurePathWithinBase(
        path.join(this.backupDirectory, fileName),
        this.backupDirectory,
        '配置备份元数据文件'
      ))))
    return backups
      .filter((backup): backup is StoredArtifactBackup => Boolean(
        backup
        && backup.toolId === toolId
        && backup.artifactId === artifactId
        && backup.originalPath === authorization.resolvedPath
      ))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((backup) => this.toPublicBackup(backup))
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
    const metadataPath = ensurePathWithinBase(
      path.join(this.backupDirectory, `${backupId}.json`),
      this.backupDirectory,
      '配置备份元数据文件'
    )
    const backup = await this.readStoredBackup(metadataPath)
    if (!backup || backup.backupId !== backupId) throw new Error('备份 metadata 无效')
    // readStoredBackup 已校验 contentFileName === `${backupId}.backup`；此处再显式断言一次，
    // 保证 join 的动态片段被限制为受控 backup directory 内的固定模式文件名
    if (backup.contentFileName !== `${backupId}.backup`) throw new Error('备份内容文件名无效')
    const authorization = await this.discoveryService.authorizeArtifact(
      backup.toolId,
      backup.artifactId,
      backup.originalPath,
      'RESTORE'
    )
    const contentPath = ensurePathWithinBase(
      path.join(this.backupDirectory, backup.contentFileName),
      this.backupDirectory,
      '配置备份内容文件'
    )
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
   * Fail-closed 读取单个 backup metadata 与对应内容文件边界。
   * @param metadataPath 受控 backup directory 内 metadata path
   * @returns 有效 metadata；损坏或过期记录返回 undefined
   */
  private async readStoredBackup(metadataPath: string): Promise<StoredArtifactBackup | undefined> {
    try {
      const backupId = path.basename(metadataPath, '.json')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backupId)) {
        return undefined
      }
      const metadataFile = await lstat(metadataPath)
      if (metadataFile.isSymbolicLink() || !metadataFile.isFile() || metadataFile.size > BACKUP_METADATA_MAX_BYTES) {
        return undefined
      }
      const backup = JSON.parse(await readFile(metadataPath, 'utf8')) as StoredArtifactBackup
      if (
        backup.backupId !== backupId
        || backup.contentFileName !== `${backupId}.backup`
        || typeof backup.toolId !== 'string'
        || typeof backup.artifactId !== 'string'
        || typeof backup.originalPath !== 'string'
        || typeof backup.createdAt !== 'string'
        || typeof backup.size !== 'number'
      ) return undefined
      const contentFile = await lstat(ensurePathWithinBase(
        path.join(this.backupDirectory, backup.contentFileName),
        this.backupDirectory,
        '配置备份内容文件'
      ))
      if (contentFile.isSymbolicLink() || !contentFile.isFile() || contentFile.size > CONFIG_ARTIFACT_MAX_BYTES) {
        return undefined
      }
      return backup
    } catch {
      return undefined
    }
  }

  /**
   * 串行执行 backup create/prune，避免并发请求突破 retention 上限。
   * @param operation backup mutation
   * @returns operation result
   */
  private enqueueBackupMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.backupMutationQueue.then(operation)
    this.backupMutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * 创建 service instance 内严格递增的 ISO timestamp。
   * @returns ISO-8601 timestamp
   */
  private createMonotonicBackupTimestamp(): string {
    const timestamp = Math.max(Date.now(), this.lastBackupCreatedAtMs + 1)
    this.lastBackupCreatedAtMs = timestamp
    return new Date(timestamp).toISOString()
  }

  /**
   * 清理同一 artifact/path 超出上限的最旧备份。
   * @param currentBackup 刚创建并校验通过的 backup
   */
  private async pruneBackups(currentBackup: StoredArtifactBackup): Promise<void> {
    const fileNames = await readdir(this.backupDirectory)
    const backups = await Promise.all(fileNames
      .filter((fileName) => /^[0-9a-f-]{36}\.json$/i.test(fileName))
      .map((fileName) => this.readStoredBackup(ensurePathWithinBase(
        path.join(this.backupDirectory, fileName),
        this.backupDirectory,
        '配置备份元数据文件'
      ))))
    const matchingBackups = backups
      .filter((backup): backup is StoredArtifactBackup => Boolean(
        backup
        && backup.toolId === currentBackup.toolId
        && backup.artifactId === currentBackup.artifactId
        && backup.originalPath === currentBackup.originalPath
      ))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const expiredBackups = matchingBackups.slice(this.maxBackupsPerArtifact)
    await Promise.all(expiredBackups.flatMap((backup) => [
      rm(ensurePathWithinBase(
        path.join(this.backupDirectory, `${backup.backupId}.json`),
        this.backupDirectory,
        '配置备份元数据文件'
      ), { force: true }),
      rm(ensurePathWithinBase(
        path.join(this.backupDirectory, backup.contentFileName),
        this.backupDirectory,
        '配置备份内容文件'
      ), { force: true })
    ]))
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
