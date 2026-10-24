/**
 * 原子 JSON 读写工具
 * @file src/main/utils/atomic-json-writer.ts
 * @description 提供原子写入（temp + rename）与容错读取，作为 v1.4.0 基础设施层的一部分，
 *              消除各 service 中重复的手写「临时文件→rename→失败回滚」与「readFile+parse+ENOENT 容错」逻辑。
 *
 * 设计目标：
 *  - 写入中断不损坏原文件（先写 .tmp 再 rename）
 *  - 读取失败返回默认值而非抛错（调用方按需判断）
 *  - 自动确保目标目录存在
 */

import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const pendingWrites = new Map<string, Promise<void>>()

/** 同路径按调用顺序替换；失败不阻塞后续保存。 */
export function writeTextAtomic(filePath: string, content: string | Buffer): Promise<void> {
  const resolvedPath = path.resolve(filePath)
  const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  const previous = pendingWrites.get(key) ?? Promise.resolve()
  const result = previous.then(() => replaceFile(resolvedPath, content))
  const settled = result.then(() => undefined, () => undefined)
  pendingWrites.set(key, settled)
  void settled.then(() => {
    if (pendingWrites.get(key) === settled) pendingWrites.delete(key)
  })
  return result
}

async function replaceFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const existing = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (existing?.isSymbolicLink()) throw new Error(`拒绝替换符号链接: ${filePath}`)
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`)
  let created = false
  try {
    const handle = await fs.open(tempPath, 'wx', existing ? existing.mode & 0o777 : 0o600)
    created = true
    try {
      if (existing && process.platform !== 'win32') await handle.chmod(existing.mode & 0o777)
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(tempPath, filePath)
  } catch (error) {
    if (created) await fs.unlink(tempPath).catch(() => undefined)
    throw error
  }
}

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
  if (content === undefined) throw new Error('配置内容不能序列化为 JSON')
  await writeTextAtomic(filePath, content)
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
