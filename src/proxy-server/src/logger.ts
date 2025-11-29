/**
 * CCB托管模式代理服务 - 日志模块
 * @description 基于Winston的日志系统
 */

import winston from 'winston'
import path from 'path'
import os from 'os'
import fs from 'fs'
import type { LogLevel } from './types.js'

/**
 * 日志目录
 */
const LOG_DIR = path.join(os.homedir(), '.ccb', 'logs')

/**
 * 确保日志目录存在
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  }
}

/**
 * 创建日志记录器
 * @param level 日志级别
 * @param enabled 是否启用日志
 * @returns Winston日志记录器
 */
export function createLogger(level: LogLevel = 'info', enabled: boolean = true): winston.Logger {
  ensureLogDir()

  const logger = winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports: [
      // 控制台输出
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, stack }) => {
            if (stack) {
              return `${timestamp} [${level}]: ${message}\n${stack}`
            }
            return `${timestamp} [${level}]: ${message}`
          })
        )
      })
    ]
  })

  // 如果启用日志,添加文件输出
  if (enabled) {
    // 普通日志
    logger.add(new winston.transports.File({
      filename: path.join(LOG_DIR, 'proxy-server.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }))

    // 错误日志
    logger.add(new winston.transports.File({
      filename: path.join(LOG_DIR, 'proxy-server-error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }))
  }

  return logger
}

/**
 * 全局日志记录器实例
 */
let logger: winston.Logger

/**
 * 初始化日志记录器
 * @param level 日志级别
 * @param enabled 是否启用日志
 */
export function initLogger(level: LogLevel = 'info', enabled: boolean = true): void {
  logger = createLogger(level, enabled)
}

/**
 * 获取日志记录器
 * @returns Winston日志记录器
 */
export function getLogger(): winston.Logger {
  if (!logger) {
    logger = createLogger()
  }
  return logger
}
