/**
 * 原子 JSON 读写工具
 * @file src/main/utils/atomic-json-writer.ts
 * @description 提供原子写入（temp + rename）与容错读取，作为 v2.0 基础设施层的一部分，
 *              消除各 service 中重复的手写「临时文件→rename→失败回滚」与「readFile+parse+ENOENT 容错」逻辑。
 *
 * 设计目标：
 *  - 写入中断不损坏原文件（先写 .tmp 再 rename）
 *  - 读取失败返回默认值而非抛错（调用方按需判断）
 *  - 自动确保目标目录存在
 */

import { promises as fs } from 'fs'
import path from 'path'

/** 写入选项 */
export interface WriteJsonOptions {
  /** JSON 缩进空格数，默认 2 */
  indent?: number
}

/**
 * 原子写入 JSON 文件（temp + rename）
 * @param filePath 目标文件绝对路径
 * @param value 待写入的值（将被 JSON.stringify）
 * @param options 写入选项
 * @throws 若写入或 rename 失败（临时文件会被清理）
 */
export async function writeJsonAtomic(
  filePath: string,
  value: unknown,
  options?: WriteJsonOptions
): Promise<void> {
  const indent = options?.indent ?? 2
  const content = JSON.stringify(value, null, indent)
  const tempPath = `${filePath}.tmp`

  try {
    // 确保目标目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    // 先写临时文件
    await fs.writeFile(tempPath, content, 'utf8')
    // 原子替换
    await fs.rename(tempPath, filePath)
  } catch (error) {
    // 失败时清理残留临时文件
    try {
      await fs.unlink(tempPath)
    } catch {
      // 临时文件不存在，忽略
    }
    throw error
  }
}

/**
 * 安全读取 JSON 文件
 * @param filePath 文件路径
 * @param defaultValue 文件不存在或解析失败时返回的默认值
 * @returns 解析后的值或默认值
 */
export async function readJsonSafe<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch {
    return defaultValue
  }
}

/**
 * 判断文件是否存在（不抛错）
 * @param filePath 文件路径
 * @returns true 表示存在
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
