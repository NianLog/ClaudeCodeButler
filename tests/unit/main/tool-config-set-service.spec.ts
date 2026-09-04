/**
 * @file tests/unit/main/tool-config-set-service.spec.ts
 * @description 验证 registry 驱动配置集的快照/编辑/激活/删除链路与安全边界
 *              （名称校验、路径注入防护、先全组校验后写入）。
 */

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type {
  ToolDefinition,
  ToolRegistrySnapshot
} from '../../../src/shared/tool-registry'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import { ToolArtifactDiscoveryService } from '../../../src/main/services/tool-artifact-discovery-service'
import type { ToolArtifactManagementService } from '../../../src/main/services/tool-artifact-management-service'
import { ToolConfigSetService } from '../../../src/main/services/tool-config-set-service'

let tempDirectory: string
let baseDirectory: string
let service: ToolConfigSetService

/** management 层调用记录（验证"先全部校验、后逐文件写入"的顺序契约） */
interface ManagementCall {
  kind: 'validate' | 'edit'
  artifactId: string
  content: string
}
let calls: ManagementCall[]

/** 生效配置文件实际路径（management stub 写入目标） */
const liveAlphaPath = (): string => path.join(tempDirectory, '.demo', 'config.json')
const liveBetaPath = (): string => path.join(tempDirectory, '.demo', 'notes.txt')

/**
 * 创建带 configSet 分组的测试工具：alpha-config（JSON + VALIDATE）、beta-notes（TEXT + 默认模板）。
 * getTool 对任意 toolId 均返回定义，以便测试 service 层自身的路径注入防护。
 */
function createRegistryService(): ToolRegistryService {
  const tool: ToolDefinition = {
    toolId: 'demo-tool',
    definitionVersion: '1.0.0',
    displayName: { 'zh-CN': 'Demo 工具', 'en-US': 'Demo Tool' },
    platforms: ['WINDOWS'],
    detectors: [{ type: 'PATH_EXISTS', path: '${HOME}/.demo/config.json' }],
    artifacts: [
      {
        artifactId: 'alpha-config',
        displayName: { 'zh-CN': '主配置', 'en-US': 'Main Config' },
        format: 'JSON',
        scope: 'USER',
        paths: { WINDOWS: ['${HOME}/.demo/config.json'] },
        capabilities: ['DISCOVER', 'READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE'],
        handler: 'JSON_FILE_V1',
        configSet: 'core'
      },
      {
        artifactId: 'beta-notes',
        displayName: { 'zh-CN': '备注', 'en-US': 'Notes' },
        format: 'TEXT',
        scope: 'USER',
        paths: { WINDOWS: ['${HOME}/.demo/notes.txt'] },
        capabilities: ['DISCOVER', 'READ', 'VALIDATE', 'EDIT'],
        handler: 'TEXT_FILE_V1',
        configSet: 'core',
        defaultTemplate: '# notes\n'
      }
    ]
  }
  const snapshot: ToolRegistrySnapshot = {
    embeddedVersion: '1.0.0',
    tools: [tool],
    recoveredFromLastKnownGood: false
  }
  return {
    getSnapshot: async () => snapshot,
    getTool: async () => tool
  } as ToolRegistryService
}

/**
 * management stub：validateArtifact 对 JSON 成员做真实解析；editArtifact 写入生效文件并记录调用。
 */
function createManagementService(): ToolArtifactManagementService {
  return {
    validateArtifact: async (_toolId: string, artifactId: string, _path: string, content: string) => {
      calls.push({ kind: 'validate', artifactId, content })
      if (artifactId === 'alpha-config') {
        JSON.parse(content)
      }
      return { valid: true, errors: [] }
    },
    editArtifact: async (toolId: string, artifactId: string, _path: string, content: string) => {
      calls.push({ kind: 'edit', artifactId, content })
      await writeFile(
        artifactId === 'alpha-config' ? liveAlphaPath() : liveBetaPath(),
        content,
        'utf8'
      )
      return { toolId, artifactId, path: '', format: 'TEXT', content }
    }
  } as unknown as ToolArtifactManagementService
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-config-set-'))
  baseDirectory = path.join(tempDirectory, 'ccb-config-sets')
  calls = []
  const registryService = createRegistryService()
  service = new ToolConfigSetService({
    registryService,
    discoveryService: new ToolArtifactDiscoveryService({
      registryService,
      detectionService: new ToolDetectionService({
        platform: 'win32',
        pathVariables: { HOME: tempDirectory },
        commandExists: async () => false
      })
    }),
    managementService: createManagementService(),
    baseDirectory
  })
})

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ToolConfigSetService', () => {
  it('应从生效配置创建快照并对缺失文件回退默认模板', async () => {
    const demoDirectory = path.join(tempDirectory, '.demo')
    await mkdir(demoDirectory, { recursive: true })
    await writeFile(liveAlphaPath(), '{"model":"gpt"}', 'utf8')

    const created = await service.createConfigSet('demo-tool', '工作配置')

    expect(created.name).toBe('工作配置')
    expect(created.setId).toMatch(/^set-[a-f0-9-]{12}$/)
    expect(created.files.map((file) => file.artifactId)).toEqual(['alpha-config', 'beta-notes'])

    const content = await service.readConfigSet('demo-tool', created.setId)
    expect(content.files[0].content).toBe('{"model":"gpt"}')
    expect(content.files[1].content).toBe('# notes\n')
  })

  it('应拒绝非法名称、重复名称与路径注入 toolId', async () => {
    await expect(service.createConfigSet('demo-tool', '')).rejects.toThrow('名称不合法')
    await expect(service.createConfigSet('demo-tool', '../evil')).rejects.toThrow('名称不合法')
    await expect(service.createConfigSet('demo-tool', 'x'.repeat(49))).rejects.toThrow('名称不合法')
    await expect(service.createConfigSet('../evil', '合法名')).rejects.toThrow('非法 toolId')

    await service.createConfigSet('demo-tool', 'Profile A')
    await expect(service.createConfigSet('demo-tool', 'profile a')).rejects.toThrow('已存在')
  })

  it('应按生效内容比对 isInUse', async () => {
    const demoDirectory = path.join(tempDirectory, '.demo')
    await mkdir(demoDirectory, { recursive: true })
    await writeFile(liveAlphaPath(), '{"model":"live"}', 'utf8')
    await writeFile(liveBetaPath(), '# notes\n', 'utf8')

    const created = await service.createConfigSet('demo-tool', '完全一致')
    let summaries = await service.listConfigSets('demo-tool')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].setId).toBe(created.setId)
    expect(summaries[0].isInUse).toBe(true)

    await writeFile(liveBetaPath(), '# changed\n', 'utf8')
    summaries = await service.listConfigSets('demo-tool')
    expect(summaries[0].isInUse).toBe(false)
  })

  it('应先全部校验再写入快照内容', async () => {
    const created = await service.createConfigSet('demo-tool', '编辑集')
    const content = await service.readConfigSet('demo-tool', created.setId)
    const invalidFiles = content.files.map((file) => file.artifactId === 'alpha-config'
      ? { artifactId: file.artifactId, content: '{invalid' }
      : { artifactId: file.artifactId, content: file.content })

    await expect(service.saveConfigSetContent('demo-tool', created.setId, invalidFiles)).rejects.toThrow()

    const unchanged = await service.readConfigSet('demo-tool', created.setId)
    expect(unchanged.files[0].content).toBe(content.files[0].content)

    const validFiles = content.files.map((file) => file.artifactId === 'alpha-config'
      ? { artifactId: file.artifactId, content: '{"model":"edited"}' }
      : { artifactId: file.artifactId, content: file.content })
    await service.saveConfigSetContent('demo-tool', created.setId, validFiles)

    const updated = await service.readConfigSet('demo-tool', created.setId)
    expect(updated.files[0].content).toBe('{"model":"edited"}')
  })

  it('应激活前全组校验，校验失败时不写入生效配置', async () => {
    const demoDirectory = path.join(tempDirectory, '.demo')
    await mkdir(demoDirectory, { recursive: true })
    await writeFile(liveAlphaPath(), '{"model":"live"}', 'utf8')
    const created = await service.createConfigSet('demo-tool', '激活集')

    calls = []
    await service.activateConfigSet('demo-tool', created.setId)
    expect(calls.filter((call) => call.kind === 'validate')).toHaveLength(2)
    expect(calls.filter((call) => call.kind === 'edit').map((call) => call.artifactId))
      .toEqual(['alpha-config', 'beta-notes'])
    expect(created.isInUse).toBe(false)

    // 白盒破坏快照内容（绕过 API 校验），激活应在校验阶段失败且不触发任何写入
    const snapshotAlphaPath = path.join(baseDirectory, 'demo-tool', created.setId, 'alpha-config.txt')
    await writeFile(snapshotAlphaPath, '{broken', 'utf8')
    calls = []
    await expect(service.activateConfigSet('demo-tool', created.setId)).rejects.toThrow()
    expect(calls.filter((call) => call.kind === 'edit')).toHaveLength(0)
  })

  it('应从显式内容创建导入配置集，未覆盖成员回退生效内容或默认模板', async () => {
    const demoDirectory = path.join(tempDirectory, '.demo')
    await mkdir(demoDirectory, { recursive: true })
    await writeFile(liveAlphaPath(), '{"model":"live"}', 'utf8')

    const created = await service.createConfigSetFromContents('demo-tool', '云端导入', [
      { artifactId: 'beta-notes', content: '# cloud notes\n' }
    ])

    expect(created.name).toBe('云端导入')
    const content = await service.readConfigSet('demo-tool', created.setId)
    expect(content.files[0].content).toBe('{"model":"live"}')
    expect(content.files[1].content).toBe('# cloud notes\n')
  })

  it('应拒绝导入内容中的未知成员、重复成员与空输入', async () => {
    await expect(service.createConfigSetFromContents('demo-tool', '云端', [])).rejects.toThrow('配置集导入内容为空')
    await expect(
      service.createConfigSetFromContents('demo-tool', '云端', [{ artifactId: 'unknown-file', content: '{}' }])
    ).rejects.toThrow('配置集不包含该文件')
    await expect(
      service.createConfigSetFromContents('demo-tool', '云端', [
        { artifactId: 'alpha-config', content: '{}' },
        { artifactId: 'alpha-config', content: '{}' }
      ])
    ).rejects.toThrow('配置集文件重复提供')
  })

  it('应删除配置集并拒绝非法 setId', async () => {
    const created = await service.createConfigSet('demo-tool', '待删除')
    await service.deleteConfigSet('demo-tool', created.setId)
    await expect(service.readConfigSet('demo-tool', created.setId)).rejects.toThrow('配置集不存在')

    await expect(service.deleteConfigSet('demo-tool', '../evil')).rejects.toThrow('非法 setId')
  })
})
