/**
 * 托管模式日志轮转服务
 * @description 负责托管模式日志的持久化、轮转和清理
 * @features
 * - 自动持久化内存日志到文件
 * - 按大小或条目数轮转日志文件
 * - 自动清理过期日志
 * - 提供历史日志查询接口
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { logger } from '../utils/logger'

/**
 * 日志条目接口（与 managed-mode-log-store.ts 保持一致）
 */
export interface LogEntry {
  id: string
  timestamp: number
  level: 'debug' | 'info' | 'warn' | 'error'
  type: 'request' | 'response' | 'system' | 'error'
  message: string
  data?: {
    method?: string
    url?: string
    statusCode?: number
    duration?: number
    headers?: Record<string, string>
    body?: any
    error?: string
  }
  source?: string
}

/**
 * 日志轮转配置
 */
export interface LogRotationConfig {
  /** 单个日志文件最大条目数（默认500） */
  maxEntriesPerFile: number
  /** 单个日志文件最大大小（字节，默认5MB） */
  maxFileSizeBytes: number
  /** 保留日志的天数（默认7天） */
  retentionDays: number
  /** 日志文件存储目录 */
  logDirectory: string
  /** 是否启用压缩（暂不实现，预留接口） */
  enableCompression: boolean
}

/**
 * 日志文件元数据
 */
interface LogFileMetadata {
  filename: string
  filepath: string
  timestamp: number
  entryCount: number
  sizeBytes: number
  createdAt: number
}

/**
 * 托管模式日志轮转服务类
 */
export class ManagedModeLogRotationService {
  private config: LogRotationConfig
  private currentLogFile: string
  private isRotating: boolean = false

  /**
   * 默认配置
   */
  private static readonly DEFAULT_CONFIG: LogRotationConfig = {
    maxEntriesPerFile: 500,
    maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
    retentionDays: 7,
    logDirectory: path.join(os.homedir(), '.ccb', 'logs', 'managed-mode'),
    enableCompression: false
  }

  constructor(config?: Partial<LogRotationConfig>) {
    this.config = {
      ...ManagedModeLogRotationService.DEFAULT_CONFIG,
      ...config
    }
    this.currentLogFile = path.join(this.config.logDirectory, 'managed-mode-current.log')
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    console.log('[ManagedModeLogRotation] ===== 开始初始化日志轮转服务 =====')
    try {
      // 确保日志目录存在
      await fs.mkdir(this.config.logDirectory, { recursive: true })
      console.log(`[ManagedModeLogRotation] 日志目录已创建: ${this.config.logDirectory}`)
      logger.info(`[ManagedModeLogRotation] 日志目录已创建: ${this.config.logDirectory}`)

      // 检查当前日志文件是否需要轮转
      await this.checkAndRotateIfNeeded()

      console.log('[ManagedModeLogRotation] 服务初始化完成')
      logger.info('[ManagedModeLogRotation] 服务初始化完成')
    } catch (error: any) {
      console.error('[ManagedModeLogRotation] 初始化失败:', error)
      logger.error('[ManagedModeLogRotation] 初始化失败:', error.message)
      throw error
    }
  }

  /**
   * 持久化日志到文件
   * @param logs 日志条目数组
   * @param clearMemory 是否清空内存（由调用方决定）
   */
  async persistLogs(logs: LogEntry[]): Promise<{ success: boolean; rotated: boolean; error?: string }> {
    if (logs.length === 0) {
      return { success: true, rotated: false }
    }

    try {
      // 检查是否需要轮转
      const shouldRotate = await this.shouldRotate(logs.length)

      if (shouldRotate && !this.isRotating) {
        await this.rotateLogFile()
      }

      // 追加日志到当前文件
      await this.appendLogsToFile(this.currentLogFile, logs)

      logger.info(`[ManagedModeLogRotation] 成功持久化 ${logs.length} 条日志`)

      return { success: true, rotated: shouldRotate }
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 持久化日志失败:', error.message)
      return { success: false, rotated: false, error: error.message }
    }
  }

  /**
   * 检查是否需要轮转日志
   */
  private async shouldRotate(newEntriesCount: number): Promise<boolean> {
    try {
      // 检查文件是否存在
      try {
        await fs.access(this.currentLogFile)
      } catch {
        // 文件不存在，不需要轮转
        return false
      }

      const stats = await fs.stat(this.currentLogFile)

      // 检查文件大小
      if (stats.size + newEntriesCount * 1000 >= this.config.maxFileSizeBytes) {
        logger.info(`[ManagedModeLogRotation] 文件大小达到阈值，需要轮转`)
        return true
      }

      // 检查条目数（读取文件内容）
      const content = await fs.readFile(this.currentLogFile, 'utf-8')
      const existingLogs: LogEntry[] = content.trim() ? JSON.parse(content) : []

      if (existingLogs.length + newEntriesCount >= this.config.maxEntriesPerFile) {
        logger.info(`[ManagedModeLogRotation] 日志条目数达到阈值，需要轮转`)
        return true
      }

      return false
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 检查轮转条件失败:', error.message)
      return false
    }
  }

  /**
   * 轮转日志文件
   * @description 将当前日志文件重命名为带时间戳的归档文件
   */
  private async rotateLogFile(): Promise<void> {
    this.isRotating = true

    try {
      // 检查当前日志文件是否存在
      try {
        await fs.access(this.currentLogFile)
      } catch {
        // 文件不存在，无需轮转
        this.isRotating = false
        return
      }

      // 生成归档文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const archiveFilename = `managed-mode-${timestamp}.log`
      const archiveFilepath = path.join(this.config.logDirectory, archiveFilename)

      // 重命名当前文件为归档文件
      await fs.rename(this.currentLogFile, archiveFilepath)

      logger.info(`[ManagedModeLogRotation] 日志文件已轮转: ${archiveFilename}`)

      // 异步清理过期日志（不阻塞）
      this.cleanupOldLogs().catch(error => {
        logger.error('[ManagedModeLogRotation] 清理过期日志失败:', error.message)
      })
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 轮转日志文件失败:', error.message)
      throw error
    } finally {
      this.isRotating = false
    }
  }

  /**
   * 追加日志到文件
   */
  private async appendLogsToFile(filepath: string, logs: LogEntry[]): Promise<void> {
    try {
      let existingLogs: LogEntry[] = []

      // 读取现有日志（如果文件存在）
      try {
        const content = await fs.readFile(filepath, 'utf-8')
        existingLogs = content.trim() ? JSON.parse(content) : []
      } catch {
        // 文件不存在或为空，使用空数组
      }

      // 合并新日志
      const mergedLogs = [...existingLogs, ...logs]

      // 写入文件
      await fs.writeFile(filepath, JSON.stringify(mergedLogs, null, 2), 'utf-8')
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 追加日志到文件失败:', error.message)
      throw error
    }
  }

  /**
   * 清理过期日志
   * @description 删除超过保留天数的日志文件
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.logDirectory)

      // 过滤出日志文件（排除current文件）
      const logFiles = files.filter(file =>
        file.startsWith('managed-mode-') &&
        file.endsWith('.log') &&
        file !== 'managed-mode-current.log'
      )

      const now = Date.now()
      const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000

      for (const file of logFiles) {
        const filepath = path.join(this.config.logDirectory, file)
        const stats = await fs.stat(filepath)

        // 检查文件修改时间
        if (now - stats.mtimeMs > retentionMs) {
          await fs.unlink(filepath)
          logger.info(`[ManagedModeLogRotation] 已删除过期日志: ${file}`)
        }
      }
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 清理过期日志失败:', error.message)
      throw error
    }
  }

  /**
   * 检查并轮转（如果需要）
   * @description 启动时调用，检查当前日志文件是否需要轮转
   */
  private async checkAndRotateIfNeeded(): Promise<void> {
    try {
      // 检查文件是否存在
      try {
        await fs.access(this.currentLogFile)
      } catch {
        // 文件不存在，无需轮转
        return
      }

      const stats = await fs.stat(this.currentLogFile)

      // 检查文件大小
      if (stats.size >= this.config.maxFileSizeBytes) {
        await this.rotateLogFile()
      }
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 检查轮转失败:', error.message)
    }
  }

  /**
   * 获取历史日志文件列表
   * @returns 日志文件元数据列表（按时间倒序）
   */
  async getLogFileList(): Promise<LogFileMetadata[]> {
    try {
      const files = await fs.readdir(this.config.logDirectory)

      // 过滤日志文件
      const logFiles = files.filter(file =>
        file.startsWith('managed-mode-') && file.endsWith('.log')
      )

      const metadata: LogFileMetadata[] = []

      for (const file of logFiles) {
        const filepath = path.join(this.config.logDirectory, file)
        const stats = await fs.stat(filepath)

        // 读取文件获取条目数
        let entryCount = 0
        try {
          const content = await fs.readFile(filepath, 'utf-8')
          const logs: LogEntry[] = content.trim() ? JSON.parse(content) : []
          entryCount = logs.length
        } catch {
          entryCount = 0
        }

        // 从文件名提取时间戳
        const timestampMatch = file.match(/managed-mode-(.+)\.log/)
        const timestamp = timestampMatch
          ? new Date(timestampMatch[1].replace(/-/g, ':')).getTime()
          : stats.mtimeMs

        metadata.push({
          filename: file,
          filepath,
          timestamp,
          entryCount,
          sizeBytes: stats.size,
          createdAt: stats.birthtimeMs
        })
      }

      // 按时间倒序排列
      return metadata.sort((a, b) => b.timestamp - a.timestamp)
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 获取日志文件列表失败:', error.message)
      return []
    }
  }

  /**
   * 读取指定日志文件的内容
   * @param filename 日志文件名
   * @returns 日志条目数组
   */
  async readLogFile(filename: string): Promise<LogEntry[]> {
    try {
      const filepath = path.join(this.config.logDirectory, filename)
      const content = await fs.readFile(filepath, 'utf-8')
      return content.trim() ? JSON.parse(content) : []
    } catch (error: any) {
      logger.error(`[ManagedModeLogRotation] 读取日志文件失败: ${filename}`, error.message)
      return []
    }
  }

  /**
   * 按时间范围查询日志
   * @param startTime 开始时间（时间戳）
   * @param endTime 结束时间（时间戳）
   * @returns 日志条目数组
   */
  async queryLogsByTimeRange(startTime: number, endTime: number): Promise<LogEntry[]> {
    try {
      const fileList = await this.getLogFileList()
      const result: LogEntry[] = []

      for (const file of fileList) {
        // 检查文件时间戳是否在范围内
        if (file.timestamp >= startTime && file.timestamp <= endTime) {
          const logs = await this.readLogFile(file.filename)
          // 过滤日志条目
          const filteredLogs = logs.filter(log =>
            log.timestamp >= startTime && log.timestamp <= endTime
          )
          result.push(...filteredLogs)
        }
      }

      // 按时间排序
      return result.sort((a, b) => b.timestamp - a.timestamp)
    } catch (error: any) {
      logger.error('[ManagedModeLogRotation] 按时间范围查询日志失败:', error.message)
      return []
    }
  }

  /**
   * 获取配置
   */
  getConfig(): LogRotationConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  async updateConfig(config: Partial<LogRotationConfig>): Promise<void> {
    this.config = {
      ...this.config,
      ...config
    }
    logger.info('[ManagedModeLogRotation] 配置已更新', config)
  }
}

// 导出单例实例
export const managedModeLogRotationService = new ManagedModeLogRotationService()
