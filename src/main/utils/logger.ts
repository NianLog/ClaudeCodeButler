/**
 * 日志工具
 * 提供统一的日志记录功能
 */

import { join } from 'path'
import { execFileSync } from 'child_process'
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
  readFileSync
} from 'fs'
import { PATHS } from '@shared/constants'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private logLevel: LogLevel = LogLevel.INFO
  private logFile: string
  private logEncoding: 'utf8'

  constructor() {
    this.logFile = join(PATHS.LOG_DIR, 'ccb.log')
    this.logEncoding = this.resolveLogEncoding()
    this.ensureLogDirectory()
    this.setupLogRotation()
    this.setupWindowsConsoleEncoding()
    this.setupStdEncoding()
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
        const stats = statSync(this.logFile)

        // 如果日志文件超过 10MB，进行轮转
        if (stats.size > 10 * 1024 * 1024) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const archiveFile = join(PATHS.LOG_DIR, `ccb-${timestamp}.log`)
          renameSync(this.logFile, archiveFile)
        }
      }
    } catch (error) {
      console.error(this.formatMessage('ERROR', '日志轮转失败', error))
    }
  }

  /**
   * 安全地序列化数据
   * 处理循环引用、BigInt、特殊对象等
   */
  private safeStringify(data: any): string {
    const seen = new WeakSet()

    const stringify = (obj: any): string => {
      try {
        // 处理Error对象
        if (obj instanceof Error) {
          return JSON.stringify({
            name: obj.name,
            message: obj.message,
            stack: obj.stack
          })
        }

        // 处理null/undefined
        if (obj === null || obj === undefined) {
          return ''
        }

        // 处理基本类型
        if (typeof obj !== 'object') {
          return String(obj)
        }

        // 处理对象，使用reducer处理循环引用
        return JSON.stringify(obj, (_key, value) => {
          // 处理BigInt
          if (typeof value === 'bigint') {
            return value.toString()
          }
          // 处理循环引用
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]'
            }
            seen.add(value)
          }
          return value
        })
      } catch (error) {
        // 序列化完全失败，返回对象toString
        return String(obj)
      }
    }

    return stringify(data)
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString()
    const hasData = data !== undefined && data !== null && data !== ''
    const dataStr = hasData ? ` ${this.safeStringify(data)}` : ''
    return `[${timestamp}] [${level}] ${message}${dataStr}`
  }

  /**
   * 写入日志到文件
   */
  private writeToFile(level: string, message: string, data?: any): void {
    try {
      const formattedMessage = `${this.formatMessage(level, message, data)}\n`
      writeFileSync(this.logFile, formattedMessage, {
        flag: 'a',
        encoding: this.logEncoding
      })
    } catch (error) {
      console.error(this.formatMessage('ERROR', '写入日志文件失败', error))
    }
  }

  /**
   * 通用日志方法
   */
  private log(level: LogLevel, levelName: string, message: string, data?: any): void {
    if (level < this.logLevel) {
      return
    }

    // 控制台输出（Windows下使用英文级别标识避免乱码）
    const consoleLevelName = process.platform === 'win32'
      ? this.getEnglishLevelName(levelName)
      : levelName

    const consoleMessage = this.formatMessage(consoleLevelName, message, data)

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(consoleMessage)
        break
      case LogLevel.INFO:
        console.info(consoleMessage)
        break
      case LogLevel.WARN:
        console.warn(consoleMessage)
        break
      case LogLevel.ERROR:
        console.error(consoleMessage)
        break
    }

    // 文件输出（保持中文）
    this.writeToFile(levelName, message, data)
  }

  /**
   * 获取英文日志级别名称（Windows控制台使用）
   */
  private getEnglishLevelName(levelName: string): string {
    const levelMap: Record<string, string> = {
      'DEBUG': 'DEBUG',
      'INFO': 'INFO',
      'WARN': 'WARNING',
      'ERROR': 'ERROR'
    }
    return levelMap[levelName] || levelName
  }

  /**
   * 判断是否需要输出为 GBK 编码（避免 Windows 终端中文乱码）
   */
  private resolveLogEncoding(): 'utf8' {
    return 'utf8'
  }

  /**
   * 统一设置 Windows 控制台为 UTF-8 代码页
   * @description 主进程日志文件已按 UTF-8 写入，但若控制台仍停留在本地代码页，终端中会把 UTF-8 日志误解码成乱码。
   */
  private setupWindowsConsoleEncoding(): void {
    if (process.platform !== 'win32') return

    try {
      // 打包后的 GUI 启动通常没有附着控制台，此时执行 chcp 只会额外启动同步子进程并拖慢冷启动。
      const hasInteractiveConsole = Boolean(process.stdout?.isTTY || process.stderr?.isTTY)
      if (!hasInteractiveConsole) {
        return
      }

      process.env.LANG = 'zh_CN.UTF-8'
      process.env.LC_ALL = 'zh_CN.UTF-8'
      process.env.PYTHONIOENCODING = 'utf-8'
      execFileSync('chcp.com', ['65001'], {
        stdio: 'ignore',
        windowsHide: true
      })
    } catch {
      // 控制台代码页设置失败时继续降级使用现有输出链路，避免阻塞主进程启动
    }
  }

  private setupStdEncoding(): void {
    if (process.platform !== 'win32') return
    if (this.logEncoding !== 'utf8') return
    try {
      process.stdout?.setDefaultEncoding?.('utf8')
      process.stderr?.setDefaultEncoding?.('utf8')
    } catch (error) {
      // 忽略设置失败
    }
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
      const files = readdirSync(PATHS.LOG_DIR)
        .filter((file: string) => file.startsWith('ccb-') && file.endsWith('.log'))
        .sort((a: string, b: string) => b.localeCompare(a)) // 按时间倒序

      // 保留最新的 keepCount 个文件，删除其余的
      if (files.length > keepCount) {
        files.slice(keepCount).forEach((file: string) => {
          const filePath = join(PATHS.LOG_DIR, file)
          unlinkSync(filePath)
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
      if (!existsSync(this.logFile)) {
        return []
      }

      const content = readFileSync(this.logFile, 'utf8')
      const allLines = content.split('\n').filter((line: string) => line.trim())
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
