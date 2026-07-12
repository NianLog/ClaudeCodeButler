/**
 * @file tests/unit/main/tool-artifact-management-service.spec.ts
 * @description 验证 capability-driven artifact validation、atomic edit、backup 与 restore。
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolRegistrySnapshot } from '../../../src/shared/tool-registry'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import { ToolArtifactDiscoveryService } from '../../../src/main/services/tool-artifact-discovery-service'
import { ToolArtifactManagementService } from '../../../src/main/services/tool-artifact-management-service'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'

let tempDirectory: string
let configPath: string
let backupDirectory: string

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
function createService(tool: ToolDefinition): ToolArtifactManagementService {
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
  return new ToolArtifactManagementService({ discoveryService, backupDirectory })
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-artifact-management-'))
  configPath = path.join(tempDirectory, '.example', 'settings.json')
  backupDirectory = path.join(tempDirectory, 'backups')
  await mkdir(path.dirname(configPath))
  await writeFile(configPath, '{"value":"original"}', 'utf8')
})

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ToolArtifactManagementService', () => {
  it('应拒绝 invalid JSON 且不修改原文件', async () => {
    const service = createService(createTool(['READ', 'VALIDATE', 'EDIT']))

    await expect(service.editArtifact('example-tool', 'settings', configPath, '{broken'))
      .rejects.toThrow('配置校验失败')
    await expect(readFile(configPath, 'utf8')).resolves.toBe('{"value":"original"}')
  })

  it('应按 capability 拒绝未授权 edit', async () => {
    const service = createService(createTool(['READ']))
    await expect(service.editArtifact('example-tool', 'settings', configPath, '{}'))
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
      '{"value":"edited"}'
    )
    const metadataFiles = (await import('fs/promises').then(({ readdir }) => readdir(backupDirectory)))
      .filter((file) => file.endsWith('.json'))
    const backupId = path.basename(metadataFiles[0], '.json')
    const restored = await service.restoreBackup(backupId)

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

    await expect(service.restoreBackup(backup.backupId)).rejects.toThrow('未声明')
  })
})
