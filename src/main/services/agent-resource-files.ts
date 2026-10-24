import { createHash } from 'crypto'
import { lstat, open, readdir } from 'fs/promises'
import path from 'path'
import { normalizePathForComparison, sanitizeFileName } from '../utils/path-security'

export const RESOURCE_MAX_BYTES = 1024 * 1024
export const MISSING_REVISION = 'MISSING'
export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')

export function safeResourceName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128 || Buffer.byteLength(value) > 200 || value !== value.trim() || value.startsWith('.') || ['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase()) || sanitizeFileName(value, '') !== value || /[\0\r\n\\/]/.test(value) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) throw new Error('资源名称必须是 1～128 字符的安全文件名')
  return value
}

export async function assertNoLinks(target: string): Promise<void> {
  if (!path.isAbsolute(target) || /^[\\/]{2}/.test(target) || target.includes('\0')) throw new Error('只允许本机绝对路径')
  let current = path.resolve(target)
  for (;;) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('拒绝访问符号链接或目录联接') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}

export async function readBounded(file: string, maximum = RESOURCE_MAX_BYTES): Promise<Buffer | undefined> {
  await assertNoLinks(file)
  try {
    const metadata = await lstat(file)
    if (!metadata.isFile() || metadata.size > maximum || metadata.nlink > 1) throw new Error('资源不是允许大小的普通文件')
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  let handle
  try { handle = await open(file, 'r') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > maximum || info.nlink > 1) throw new Error('资源必须是大小限制以内的普通文件，不能是硬链接')
    const buffer = Buffer.alloc(Math.min(maximum + 1, info.size + 1))
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      const read = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
      if (!read.bytesRead) break
      bytesRead += read.bytesRead
    }
    const after = await handle.stat()
    if (bytesRead > maximum || after.size !== info.size || after.mtimeMs !== info.mtimeMs || bytesRead !== after.size) throw new Error('资源超过上限或在读取期间发生变化')
    await assertNoLinks(file)
    return buffer.subarray(0, bytesRead)
  } finally { await handle.close() }
}

export function utf8(value: Buffer): string { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(value) }

export async function exists(target: string): Promise<boolean> {
  await assertNoLinks(target)
  try { await lstat(target); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

export interface SkillPackageFile { relativePath: string; content: Buffer; executable?: boolean }

export async function readSkillPackage(root: string): Promise<SkillPackageFile[]> {
  await assertNoLinks(root)
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Skill 包必须是普通目录')
  const result: SkillPackageFile[] = []
  const seen = new Set<string>()
  let bytes = 0
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 32) throw new Error('Skill 目录超过 32 层')
    await assertNoLinks(directory)
    const entries = await readdir(directory, { withFileTypes: true })
    if (entries.length > 2000) throw new Error('Skill 包最多 2000 个文件')
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) throw new Error('Skill 包不能包含链接')
      if (entry.name === '.' || entry.name === '..' || sanitizeFileName(entry.name, '') !== entry.name) throw new Error('Skill 包包含不安全文件名')
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(target, depth + 1)
      else {
        if (!entry.isFile() || result.length >= 2000) throw new Error('Skill 包包含非普通文件或超过 2000 个文件')
        const content = await readBounded(target, 10 * 1024 * 1024)
        if (!content) throw new Error('Skill 包在读取期间发生变化')
        bytes += content.length
        if (bytes > 50 * 1024 * 1024) throw new Error('Skill 包超过 50 MiB')
        const relativePath = path.relative(root, target)
        const key = normalizePathForComparison(path.join(root, relativePath))
        if (seen.has(key)) throw new Error('Skill 包包含重复文件')
        seen.add(key)
        const metadata = await lstat(target)
        result.push({ relativePath, content, executable: (metadata.mode & 0o100) !== 0 })
      }
    }
  }
  await walk(root, 0)
  if (!result.some(file => file.relativePath === 'SKILL.md')) throw new Error('Skill 包缺少 SKILL.md')
  return result
}

export const skillRevision = (files: SkillPackageFile[]): string => digest(files.map(file => `${file.relativePath}\0${digest(file.content)}\0${Boolean(file.executable)}`).join('\n'))
