/**
 * @file tests/unit/main/tool-artifact-management-service.spec.ts
 * @description 验证 capability-driven artifact validation、atomic edit、backup 与 restore。
 */

import { createHash } from 'crypto'
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRegistrySnapshot } from '../../../src/shared/tool-registry'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import { ToolArtifactDiscoveryService } from '../../../src/main/services/tool-artifact-discovery-service'
import { ToolArtifactManagementService } from '../../../src/main/services/tool-artifact-management-service'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'
import * as atomicWriter from '../../../src/main/utils/atomic-json-writer'

let tempDirectory: string
let configPath: string
let backupDirectory: string
const revisionOf = (content: string | Buffer): string => createHash('sha256').update(content).digest('hex')

/**
 * 创建指定 capabilities 的 JSON artifact definition。
 * @param capabilities artifact capabilities
 * @returns 测试工具定义
 */
function createTool(capabilities: ToolDefinition['artifacts'][number]['capabilities']): ToolDefinition {
  return {
    toolId: 'example-tool',
    definitionVersion: '1.0.0',
    displayName: { 'zh-CN': '示例', 'en-US': 'Example' },
    platforms: ['WINDOWS'],
    detectors: [{ type: 'PATH_EXISTS', path: '${HOME}/.example/settings.json' }],
    artifacts: [{
      artifactId: 'settings',
      displayName: { 'zh-CN': '设置', 'en-US': 'Settings' },
      format: 'JSON',
      scope: 'USER',
      paths: { WINDOWS: ['${HOME}/.example/settings.json'] },
      capabilities,
      handler: 'JSON_FILE_V1'
    }]
  }
}

/**
 * 创建真实文件系统测试 service。
 * @param tool registry 工具定义
 * @returns 通用 artifact management service
 */
function createService(tool: ToolDefinition, maxBackupsPerArtifact?: number): ToolArtifactManagementService {
  const snapshot: ToolRegistrySnapshot = {
    embeddedVersion: '1.0.0',
    tools: [tool],
    recoveredFromLastKnownGood: false
  }
  const registryService = {
    getSnapshot: async () => snapshot,
    getTool: async (toolId: string) => toolId === tool.toolId ? tool : undefined
  } as ToolRegistryService
  const discoveryService = new ToolArtifactDiscoveryService({
    registryService,
    detectionService: new ToolDetectionService({
      platform: 'win32',
      pathVariables: { HOME: tempDirectory }
    })
  })
  return new ToolArtifactManagementService({ discoveryService, backupDirectory, maxBackupsPerArtifact })
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-artifact-management-'))
  configPath = path.join(tempDirectory, '.example', 'settings.json')
  backupDirectory = path.join(tempDirectory, 'backups')
  await mkdir(path.dirname(configPath))
  await writeFile(configPath, '{"value":"original"}', 'utf8')
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ToolArtifactManagementService', () => {
  it('应拒绝备份根目录 junction，且不读写被重定向的目录', async () => {
    const externalDirectory = path.join(tempDirectory, 'external-backups')
    await mkdir(externalDirectory)
    await symlink(externalDirectory, backupDirectory, 'junction')
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))

    await expect(service.createBackup('example-tool', 'settings', configPath)).rejects.toThrow('目录联接')
    await expect(service.listBackups('example-tool', 'settings')).rejects.toThrow('目录联接')
    await expect(readdir(externalDirectory)).resolves.toEqual([])
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应拒绝备份内容 hardlink，恢复失败保留当前配置', async () => {
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    await link(path.join(backupDirectory, `${backup.backupId}.backup`), path.join(tempDirectory, 'linked-backup'))
    await writeFile(configPath, '{"value":"current"}')

    await expect(service.readBackup(backup.backupId)).rejects.toThrow(/普通文件|硬链接/)
    await expect(service.restoreBackup(backup.backupId, revisionOf('{"value":"current"}')))
      .rejects.toThrow(/普通文件|硬链接/)
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"current"}')
  })

  it('应在写入成功但结果读取失败时明确告知完成状态，不自动重试', async () => {
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))
    const reader = vi.spyOn(ToolArtifactDiscoveryService.prototype, 'readArtifact').mockRejectedValueOnce(new Error('readback failed'))

    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revisionOf('{"value":"original"}')))
      .rejects.toThrow('写入已完成但结果读取失败，请核对原文件勿重复提交')
    expect(reader).toHaveBeenCalledTimes(1)
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{}')
    const backups = await service.listBackups('example-tool', 'settings')
    expect(backups).toHaveLength(1)
    await expect(readFile(path.join(backupDirectory, `${backups[0].backupId}.backup`), 'utf8'))
      .resolves.toBe('{"value":"original"}')
  })

  it('应拒绝旧 revision 覆盖外部修改', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const revision = createHash('sha256').update(await readFile(configPath)).digest('hex')
    await writeFile(configPath, '{"value":"external"}')

    await expect(service.editArtifact('example-tool', 'settings', configPath, '{"value":"draft"}', revision))
      .rejects.toThrow('配置已变化')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"external"}')
  })

  it('应在恢复前保留当前版本作为回退点', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    await writeFile(configPath, '{"value":"current"}')
    const revision = createHash('sha256').update(await readFile(configPath)).digest('hex')

    await service.restoreBackup(backup.backupId, revision)

    const backups = await service.listBackups('example-tool', 'settings', configPath)
    const contents = await Promise.all(backups.map((entry) => readFile(path.join(backupDirectory, `${entry.backupId}.backup`), 'utf8')))
    expect(contents).toContain('{"value":"current"}')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应拒绝备份被改成同大小的其他有效 JSON', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const revision = createHash('sha256').update(await readFile(configPath)).digest('hex')
    await writeFile(path.join(backupDirectory, `${backup.backupId}.backup`), '{"value":"tampered"}')

    await expect(service.restoreBackup(backup.backupId, revision)).rejects.toThrow('备份内容摘要不匹配')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应创建尚不存在且声明 BACKUP 的文件和父目录', async () => {
    await rm(path.dirname(configPath), { recursive: true, force: true })
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const created = await service.editArtifact('example-tool', 'settings', '', '{}', 'MISSING')
    expect(created.content).toBe('{}')
    expect(created.revision).toBe(revisionOf('{}'))
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{}')
  })

  it('应拒绝 invalid JSON 且不修改原文件', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT']))

    await expect(service.editArtifact('example-tool', 'settings', configPath, '{broken', revisionOf('{"value":"original"}')))
      .rejects.toThrow('配置校验失败')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应按 capability 拒绝未授权 edit', async () => {
    const service = createService(createTool(['READ']))
    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revisionOf('{"value":"original"}')))
      .rejects.toThrow('EDIT capability')
  })

  it('应在 edit 前创建备份并支持恢复', async () => {
    const service = createService(createTool([
      'READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE'
    ]))

    const edited = await service.editArtifact(
      'example-tool',
      'settings',
      configPath,
      '{"value":"edited"}',
      revisionOf('{"value":"original"}')
    )
    const metadataFiles = (await import('fs/promises').then(({ readdir }) => readdir(backupDirectory)))
      .filter((file) => file.endsWith('.json'))
    const backupId = path.basename(metadataFiles[0], '.json')
    const restored = await service.restoreBackup(backupId, edited.revision)

    expect(edited.content).toBe('{"value":"edited"}')
    expect(restored.content).toBe('{"value":"original"}')
  })

  it('应只列出当前 artifact 的有效可恢复备份', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const first = await service.createBackup('example-tool', 'settings', configPath)
    await writeFile(path.join(backupDirectory, 'broken.json'), '{broken', 'utf8')

    const backups = await service.listBackups('example-tool', 'settings', configPath)

    expect(backups).toHaveLength(1)
    expect(backups[0].backupId).toBe(first.backupId)
    expect(backups[0]).not.toHaveProperty('contentFileName')
  })

  it('应拒绝 backup metadata 篡改目标路径', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const metadataPath = path.join(backupDirectory, `${backup.backupId}.json`)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
    metadata.originalPath = path.join(tempDirectory, 'outside.json')
    await writeFile(metadataPath, JSON.stringify(metadata), 'utf8')

    await expect(service.restoreBackup(backup.backupId, revisionOf('{"value":"original"}'))).rejects.toThrow('未声明')
  })

  it('应串行创建并清理超出 retention 的旧备份', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']), 2)

    await Promise.all([
      service.createBackup('example-tool', 'settings', configPath),
      service.createBackup('example-tool', 'settings', configPath),
      service.createBackup('example-tool', 'settings', configPath)
    ])
    const backups = await service.listBackups('example-tool', 'settings', configPath)
    const files = await import('fs/promises').then(({ readdir }) => readdir(backupDirectory))

    expect(backups).toHaveLength(2)
    expect(files.filter((file) => file.endsWith('.json'))).toHaveLength(2)
    expect(files.filter((file) => file.endsWith('.backup'))).toHaveLength(2)
  })

  it('应对缺少 revision 或错误 MISSING 拒绝写入', async () => {
    const service = createService(createTool(['READ', 'EDIT']))
    for (const revision of ['MISSING', '', undefined as unknown as string]) {
      await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revision)).rejects.toThrow()
    }
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应将新备份的摘要和大小绑定到实际快照 bytes', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const bytes = Buffer.from('\ufeff{"value":"中文"}\r\n')
    await writeFile(configPath, bytes)
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const stored = JSON.parse(await readFile(path.join(backupDirectory, `${backup.backupId}.json`), 'utf8'))

    expect(backup).toMatchObject({ size: bytes.length, metadataVersion: 1, sha256: revisionOf(bytes), integrity: 'SHA256' })
    expect(stored.sha256).toBe(revisionOf(bytes))
    await expect(readFile(path.join(backupDirectory, `${backup.backupId}.backup`))).resolves.toEqual(bytes)
    expect((await service.readBackup(backup.backupId)).revision).toBe(revisionOf(bytes))
    await writeFile(configPath, '{}')
    await service.restoreBackup(backup.backupId, revisionOf('{}'))
    await expect(readFile(configPath)).resolves.toEqual(bytes)
  })

  it('应保留旧备份并标明没有历史摘要，不回写或伪造元数据', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const metadataPath = path.join(backupDirectory, `${backup.backupId}.json`)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    delete metadata.sha256
    delete metadata.metadataVersion
    const legacyMetadata = JSON.stringify(metadata)
    await writeFile(metadataPath, legacyMetadata)

    const loaded = await service.readBackup(backup.backupId)
    expect(loaded.backup).toMatchObject({ integrity: 'LEGACY_UNVERIFIED' })
    expect(loaded.backup.sha256).toBeUndefined()
    expect(loaded.revision).toBe(revisionOf('{"value":"original"}'))
    expect((await service.listBackups('example-tool', 'settings'))[0].integrity).toBe('LEGACY_UNVERIFIED')
    await expect(readFile(metadataPath, 'utf8')).resolves.toBe(legacyMetadata)
  })

  it('应拒绝旧备份在预览后被改成其他内容', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const metadataPath = path.join(backupDirectory, `${backup.backupId}.json`)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    delete metadata.sha256
    delete metadata.metadataVersion
    await writeFile(metadataPath, JSON.stringify(metadata))
    const preview = await service.readBackup(backup.backupId)
    await writeFile(path.join(backupDirectory, `${backup.backupId}.backup`), '{"value":"tampered"}')

    await expect(service.restoreBackup(backup.backupId, revisionOf('{"value":"original"}'), preview.revision))
      .rejects.toThrow('备份已变化')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应拒绝大小不匹配或缺少摘要的新备份', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    const contentPath = path.join(backupDirectory, `${backup.backupId}.backup`)
    await writeFile(contentPath, '{}')
    await expect(service.readBackup(backup.backupId)).rejects.toThrow('大小不匹配')
    await writeFile(contentPath, '{"value":"original"}')
    const metadataPath = path.join(backupDirectory, `${backup.backupId}.json`)
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
    delete metadata.sha256
    await writeFile(metadataPath, JSON.stringify(metadata))
    await expect(service.readBackup(backup.backupId)).rejects.toThrow('metadata 无效')
  })

  it('应在原生文件及父目录缺失时列出并恢复受控备份', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    await rm(path.dirname(configPath), { recursive: true, force: true })

    expect((await service.listBackups('example-tool', 'settings'))[0].backupId).toBe(backup.backupId)
    await expect(service.restoreBackup(backup.backupId, revisionOf('{"value":"original"}'))).rejects.toThrow('配置已变化')
    await expect(service.restoreBackup(backup.backupId, 'MISSING')).resolves.toMatchObject({ content: '{"value":"original"}' })
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应在缺失目标没有 EDIT 创建权限时拒绝恢复', async () => {
    const service = createService(createTool(['READ', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    await rm(configPath)
    await expect(service.restoreBackup(backup.backupId, 'MISSING')).rejects.toThrow('EDIT capability')
    await expect(readFile(configPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('应在恢复前重新授权备份，规则撤销后不可列出或读取', async () => {
    const tool = createTool(['READ', 'BACKUP', 'RESTORE'])
    const service = createService(tool)
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    tool.artifacts[0].capabilities = ['READ']
    await expect(service.listBackups('example-tool', 'settings')).resolves.toEqual([])
    await expect(service.readBackup(backup.backupId)).rejects.toThrow('RESTORE capability')
    await expect(readFile(path.join(backupDirectory, `${backup.backupId}.backup`), 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应在当前 READ 被撤销时拒绝历史预览、编辑和恢复且不写入', async () => {
    const tool = createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE'])
    const service = createService(tool)
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    tool.artifacts[0].capabilities = ['EDIT', 'BACKUP', 'RESTORE']
    await expect(service.readBackup(backup.backupId)).rejects.toThrow('READ capability')
    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revisionOf('{"value":"original"}')))
      .rejects.toThrow('READ capability')
    await expect(service.restoreBackup(backup.backupId, revisionOf('{"value":"original"}')))
      .rejects.toThrow('READ capability')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应串行检查并发编辑，旧 revision 只有一次成功', async () => {
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))
    const revision = revisionOf('{"value":"original"}')
    const results = await Promise.allSettled([
      service.editArtifact('example-tool', 'settings', configPath, '{"value":"first"}', revision),
      service.editArtifact('example-tool', 'settings', configPath, '{"value":"second"}', revision)
    ])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"first"}')
  })

  it('应在备份失败时停止编辑并保留原文件', async () => {
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))
    await writeFile(backupDirectory, 'blocked')
    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revisionOf('{"value":"original"}'))).rejects.toThrow()
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应在恢复写入失败时保留原文件与回退备份，并允许后续重试', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']))
    const backup = await service.createBackup('example-tool', 'settings', configPath)
    await writeFile(configPath, '{"value":"current"}')
    const revision = revisionOf('{"value":"current"}')
    const writeAtomic = atomicWriter.writeTextAtomic
    vi.spyOn(atomicWriter, 'writeTextAtomic').mockImplementation(async (filePath, content) => {
      if (filePath === configPath) throw new Error('injected write failure')
      return writeAtomic(filePath, content)
    })
    await expect(service.restoreBackup(backup.backupId, revision)).rejects.toThrow('injected write failure')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"current"}')
    const snapshots = await Promise.all((await readdir(backupDirectory)).filter((name) => name.endsWith('.backup'))
      .map((name) => readFile(path.join(backupDirectory, name), 'utf8')))
    expect(snapshots).toContain('{"value":"current"}')
    vi.restoreAllMocks()
    await expect(service.restoreBackup(backup.backupId, revision)).resolves.toMatchObject({ content: '{"value":"original"}' })
  })

  it('应在备份期间目标被外部修改时拒绝覆盖', async () => {
    const service = createService(createTool(['READ', 'EDIT', 'BACKUP', 'RESTORE']))
    const writeAtomic = atomicWriter.writeTextAtomic
    vi.spyOn(atomicWriter, 'writeTextAtomic').mockImplementation(async (filePath, content) => {
      await writeAtomic(filePath, content)
      if (filePath.endsWith('.backup')) await writeFile(configPath, '{"value":"external"}')
    })
    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}', revisionOf('{"value":"original"}')))
      .rejects.toThrow('配置已变化')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"external"}')
  })
})
