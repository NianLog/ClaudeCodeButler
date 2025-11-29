/**
 * JSONL文件读取工具
 * 提供流式读取、安全处理文件锁定等通用功能
 */

import * as fs from 'fs'
import * as readline from 'readline'
import { logger } from './logger'

/**
 * JSONL行处理回调
 */
export type JsonlLineHandler<T> = (parsedLine: T, lineNumber: number) => void | Promise<void>

/**
 * JSONL读取选项
 */
export interface JsonlReadOptions {
  encoding?: BufferEncoding  // 编码格式,默认utf8
  limit?: number             // 最大读取行数
  skipErrors?: boolean       // 是否跳过解析错误的行
  onProgress?: (linesRead: number) => void  // 进度回调
}

/**
 * JSONL读取结果
 */
export interface JsonlReadResult<T> {
  success: boolean
  data: T[]
  totalLines: number
  errorLines: number
  error?: Error
}

/**
 * 流式读取JSONL文件
 *
 * @param filePath JSONL文件路径
 * @param handler 每行处理函数
 * @param options 读取选项
 * @returns Promise<JsonlReadResult>
 */
export async function readJsonlFile<T = any>(
  filePath: string,
  handler?: JsonlLineHandler<T>,
  options: JsonlReadOptions = {}
): Promise<JsonlReadResult<T>> {
  const {
    encoding = 'utf8',
    limit,
    skipErrors = true,
    onProgress
  } = options

  return new Promise((resolve) => {
    const data: T[] = []
    let totalLines = 0
    let errorLines = 0
    let fileStream: fs.ReadStream | null = null

    try {
      // 创建只读文件流
      fileStream = fs.createReadStream(filePath, {
        encoding,
        flags: 'r',
        autoClose: true
      })

      // 创建逐行读取器
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      })

      // 逐行处理
      rl.on('line', async (line) => {
        try {
          // 检查是否达到限制
          if (limit && totalLines >= limit) {
            rl.close()
            return
          }

          totalLines++

          // 跳过空行
          if (!line.trim()) {
            return
          }

          // 解析JSON
          const parsed = JSON.parse(line) as T
          data.push(parsed)

          // 调用处理函数
          if (handler) {
            await handler(parsed, totalLines)
          }

          // 进度回调
          if (onProgress && totalLines % 100 === 0) {
            onProgress(totalLines)
          }
        } catch (error) {
          errorLines++
          if (!skipErrors) {
            logger.error(`JSONL解析错误 (行${totalLines}): ${filePath}`, error)
          } else {
            logger.debug(`跳过无效JSON行 (行${totalLines})`)
          }
        }
      })

      rl.on('close', () => {
        logger.debug(`JSONL读取完成: ${filePath} (${totalLines}行, ${errorLines}错误)`)
        resolve({
          success: true,
          data,
          totalLines,
          errorLines
        })
      })

      rl.on('error', (error) => {
        logger.error(`JSONL读取失败: ${filePath}`, error)
        resolve({
          success: false,
          data,
          totalLines,
          errorLines,
          error: error as Error
        })
      })

      // 处理文件流错误 - 优雅处理文件锁定
      fileStream.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EBUSY') {
          logger.warn(`文件被占用,跳过: ${filePath}`)
          resolve({
            success: false,
            data,
            totalLines,
            errorLines,
            error: new Error('文件被占用')
          })
        } else if (error.code === 'ENOENT') {
          logger.warn(`文件不存在: ${filePath}`)
          resolve({
            success: false,
            data,
            totalLines,
            errorLines,
            error: new Error('文件不存在')
          })
        } else {
          logger.error(`文件流错误: ${filePath}`, error)
          resolve({
            success: false,
            data,
            totalLines,
            errorLines,
            error: error as Error
          })
        }
      })

    } catch (error) {
      logger.error(`创建文件流失败: ${filePath}`, error)
      resolve({
        success: false,
        data,
        totalLines,
        errorLines,
        error: error as Error
      })
    }
  })
}

/**
 * 快速统计JSONL文件信息(不完整解析)
 *
 * @param filePath JSONL文件路径
 * @param extractor 信息提取函数
 * @returns Promise<统计结果>
 */
export async function getJsonlStats<T = any, R = any>(
  filePath: string,
  extractor: (line: T, stats: R) => R,
  initialStats: R
): Promise<R> {
  return new Promise((resolve) => {
    let stats = initialStats

    const fileStream = fs.createReadStream(filePath, {
      encoding: 'utf8',
      flags: 'r',
      autoClose: true
    })

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    rl.on('line', (line) => {
      try {
        const parsed = JSON.parse(line) as T
        stats = extractor(parsed, stats)
      } catch (error) {
        // 跳过无效行
      }
    })

    rl.on('close', () => {
      resolve(stats)
    })

    rl.on('error', () => {
      resolve(stats)
    })

    fileStream.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EBUSY' || error.code === 'ENOENT') {
        logger.warn(`文件不可访问: ${filePath}`)
      }
      resolve(stats)
    })
  })
}

/**
 * 读取JSONL文件的第一行
 *
 * @param filePath JSONL文件路径
 * @returns Promise<T | null>
 */
export async function readFirstJsonlLine<T = any>(filePath: string): Promise<T | null> {
  return new Promise((resolve) => {
    const fileStream = fs.createReadStream(filePath, {
      encoding: 'utf8',
      flags: 'r',
      autoClose: true
    })

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    })

    rl.on('line', (line) => {
      try {
        const parsed = JSON.parse(line) as T
        rl.close()
        resolve(parsed)
      } catch (error) {
        // 继续读取下一行
      }
    })

    rl.on('close', () => {
      resolve(null)
    })

    rl.on('error', () => {
      resolve(null)
    })

    fileStream.on('error', () => {
      resolve(null)
    })
  })
}
