import { readdir, lstat } from 'fs/promises'
import path from 'path'
import type { AgentResourceQuery } from '@shared/agent-resources'
import { normalizePathForComparison } from '../utils/path-security'
import { assertNoLinks, digest, exists, readBounded, safeResourceName, utf8 } from './agent-resource-files'
import { parseJson } from './agent-resource-codecs'

export interface ResourceBackup {
  directory: string
  name: string
  createdAt: string
  revision: string
  metadataRevision: string
}

export interface ResourceBackupDiagnostic { directory: string; error: string }

/** 只读取固定 content 子项；metadata 中的原路径不授予文件访问权限。 */
export async function discoverResourceBackups(root: string, query: AgentResourceQuery, nativeRoots: string[]): Promise<Array<ResourceBackup | ResourceBackupDiagnostic>> {
  if (query.kind === 'MCP') return []
  await assertNoLinks(root)
  let directories
  try { directories = await readdir(root, { withFileTypes: true }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  if (directories.length > 5000) throw new Error('资源备份目录超过 5000 项，请先归档旧备份')
  const backups: ResourceBackup[] = []
  const diagnostics: ResourceBackupDiagnostic[] = []
  for (const item of directories) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.name)) continue
    const directory = path.join(root, item.name)
    try {
      await assertNoLinks(directory)
      if (!item.isDirectory()) continue
      const bytes = await readBounded(path.join(directory, 'metadata.json'), 16 * 1024)
      if (!bytes) continue
      const metadata = parseJson(utf8(bytes))
      if (metadata.kind !== query.kind) continue
      let name: string
      if (metadata.toolId !== undefined) {
        if (metadata.toolId !== query.toolId) continue
        name = safeResourceName(metadata.name)
      } else {
        if (typeof metadata.originalPath !== 'string' || !path.isAbsolute(metadata.originalPath)) throw new Error('旧资源备份缺少有效来源标签')
        const original = path.resolve(metadata.originalPath)
        if (!nativeRoots.some(nativeRoot => {
          const relative = path.relative(normalizePathForComparison(nativeRoot), normalizePathForComparison(original))
          return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
        })) continue
        name = safeResourceName(query.kind === 'SKILL' ? path.basename(original) : path.basename(original).replace(/\.(md|toml)$/, ''))
      }
      if (typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt)) || typeof metadata.revision !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.revision)) throw new Error('资源备份时间或校验值损坏，未读取其内容')
      const content = path.join(directory, 'content')
      if (!(await exists(content))) continue
      const info = await lstat(content)
      if (query.kind === 'SKILL' ? !info.isDirectory() : !info.isFile()) throw new Error('资源备份内容类型无效')
      backups.push({ directory, name, createdAt: new Date(metadata.createdAt).toISOString(), revision: metadata.revision, metadataRevision: digest(bytes) })
    } catch (error) { diagnostics.push({ directory, error: error instanceof Error ? error.message : '资源备份无法读取' }) }
  }
  if (backups.length > 400) throw new Error('此类资源备份超过 400 项，请先归档旧备份')
  return [...backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), ...diagnostics]
}
