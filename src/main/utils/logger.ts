/**
 * 日志工具
 * 提供统一的日志记录功能
 */

import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { PATHS, LOG_LEVELS } from '@shared/constants'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private logLevel: LogLevel = LogLevel.INFO
  private logFile: string

  constructor() {
    this.logFile = join(PATHS.LOG_DIR, 'ccb.log')
    this.ensureLogDirectory()
    this.setupLogRotation()
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!existsSync(PATHS.LOG_DIR)) {
      mkdirSync(PATHS.LOG_DIR, { recursive: true })
    }
  }

  /**
   * 设置日志轮转
   */
  private setupLogRotation(): void {
    // 简单的日志轮转：每次启动检查日志文件大小
    try {
      if (existsSync(this.logFile)) {
        const fs = require('fs')
        const stats = fs.statSync(this.logFile)

        // 如果日志文件超过 10MB，进行轮转
        if (stats.size > 10 * 1024 * 1024) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const archiveFile = join(PATHS.LOG_DIR, `ccb-${timestamp}.log`)
          fs.renameSync(this.logFile, archiveFile)
        }
      }
    } catch (error) {
      console.error('日志轮转失败:', error)
    }
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const dataStr = data ? ` ${JSON.stringify(data)}` : ''
    return `[${timestamp}] [${level}] ${message}${dataStr}`
  }

  /**
   * 写入日志到文件
   */
  private writeToFile(level: string, message: string, data?: any): void {
    try {
      const formattedMessage = this.formatMessage(level, message, data) + '\n'
      writeFileSync(this.logFile, formattedMessage, { flag: 'a' })
    } catch (error) {
      console.error('写入日志文件失败:', error)
    }
  }

  /**
   * 通用日志方法
   */
  private log(level: LogLevel, levelName: string, message: string, data?: any): void {
    if (level < this.logLevel) {
      return
    }

    const formattedMessage = this.formatMessage(levelName, message, data)

    // 控制台输出
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, data || '')
        break
      case LogLevel.INFO:
        console.info(formattedMessage, data || '')
        break
      case LogLevel.WARN:
        console.warn(formattedMessage, data || '')
        break
      case LogLevel.ERROR:
        console.error(formattedMessage, data || '')
        break
    }

    // 文件输出
    this.writeToFile(levelName, message, data)
  }

  /**
   * 设置日志级别
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * 调试日志
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data)
  }

  /**
   * 信息日志
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, data)
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, data)
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | any): void {
    let errorData = error
    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    }
    this.log(LogLevel.ERROR, 'ERROR', message, errorData)
  }

  /**
   * 性能日志
   */
  performance(operation: string, startTime: number): void {
    const duration = Date.now() - startTime
    this.info(`Performance: ${operation}`, { duration: `${duration}ms` })
  }

  /**
   * 创建子日志器
   */
  child(context: string): ChildLogger {
    return new ChildLogger(this, context)
  }

  /**
   * 清理旧日志文件
   */
  cleanupOldLogs(keepCount: number = 5): void {
    try {
      const fs = require('fs')
      const files = fs.readdirSync(PATHS.LOG_DIR)
        .filter((file: string) => file.startsWith('ccb-') && file.endsWith('.log'))
        .sort((a: string, b: string) => b.localeCompare(a)) // 按时间倒序

      // 保留最新的 keepCount 个文件，删除其余的
      if (files.length > keepCount) {
        files.slice(keepCount).forEach((file: string) => {
          const filePath = join(PATHS.LOG_DIR, file)
          fs.unlinkSync(filePath)
          this.info('删除旧日志文件', { file })
        })
      }
    } catch (error) {
      this.error('清理旧日志文件失败', error)
    }
  }

  /**
   * 获取日志内容
   */
  getLogs(lines: number = 100): string[] {
    try {
      const fs = require('fs')
      if (!existsSync(this.logFile)) {
        return []
      }

      const content = fs.readFileSync(this.logFile, 'utf8')
      const allLines = content.split('\n').filter(line => line.trim())
      return allLines.slice(-lines)
    } catch (error) {
      this.error('读取日志文件失败', error)
      return []
    }
  }
}

/**
 * 子日志器，带有上下文信息
 */
class ChildLogger {
  constructor(
    private parent: Logger,
    private context: string
  ) {}

  private formatMessage(message: string): string {
    return `[${this.context}] ${message}`
  }

  debug(message: string, data?: any): void {
    this.parent.debug(this.formatMessage(message), data)
  }

  info(message: string, data?: any): void {
    this.parent.info(this.formatMessage(message), data)
  }

  warn(message: string, data?: any): void {
    this.parent.warn(this.formatMessage(message), data)
  }

  error(message: string, error?: Error | any): void {
    this.parent.error(this.formatMessage(message), error)
  }

  performance(operation: string, startTime: number): void {
    this.parent.performance(`${this.context}: ${operation}`, startTime)
  }

  child(context: string): ChildLogger {
    return new ChildLogger(this.parent, `${this.context}:${context}`)
  }
}

// 导出单例实例
export const logger = new Logger()

// 开发环境设置为 DEBUG 级别
if (process.env.NODE_ENV === 'development') {
  logger.setLogLevel(LogLevel.DEBUG)
} else {
  logger.setLogLevel(LogLevel.INFO)
}

export { Logger, ChildLogger }