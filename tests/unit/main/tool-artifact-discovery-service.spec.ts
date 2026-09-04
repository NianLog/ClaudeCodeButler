/**
 * @file tests/unit/main/tool-artifact-discovery-service.spec.ts
 * @description 验证规则驱动 artifact discovery 的 capability、路径与文件安全边界。
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolRegistrySnapshot } from '../../../src/shared/tool-registry'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import {
  CONFIG_ARTIFACT_MAX_BYTES,
  ToolArtifactDiscoveryService
} from '../../../src/main/services/tool-artifact-discovery-service'
import type { ToolRegistryService } from '../../../src/main/services/tool-registry-service'

let tempDirectory: string

/**
 * 创建可控制 capability 的测试工具定义。
 * @param capabilities artifact capabilities
 * @returns 测试工具定义
 */
function createTool(capabilities: ToolDefinition['artifacts'][number]['capabilities']): ToolDefinition {
  return {
    toolId: 'codex-cli',
    definitionVersion: '1.0.0',
    displayName: { 'zh-CN': 'Codex CLI', 'en-US': 'Codex CLI' },
    platforms: ['WINDOWS'],
    detectors: [{ type: 'PATH_EXISTS', path: '${HOME}/.codex/config.toml' }],
    artifacts: [{
      artifactId: 'user-config',
      displayName: { 'zh-CN': '用户配置', 'en-US': 'User Configuration' },
      format: 'TOML',
      scope: 'USER',
      paths: { WINDOWS: ['${HOME}/.codex/config.toml'] },
      capabilities,
      handler: 'TEXT_FILE_V1'
    }]
  }
}

/**
 * 创建只提供指定工具的 registry stub。
 * @param tool 测试工具定义
 * @returns registry service stub
 */
function createRegistryService(tool: ToolDefinition): ToolRegistryService {
  const snapshot: ToolRegistrySnapshot = {
    embeddedVersion: '1.0.0',
    tools: [tool],
    recoveredFromLastKnownGood: false
  }
  return {
    getSnapshot: async () => snapshot,
    getTool: async (toolId: string) => toolId === tool.toolId ? tool : undefined
  } as ToolRegistryService
}

/**
 * 创建使用 Windows 路径语义和临时 HOME 的 discovery service。
 * @param tool 测试工具定义
 * @returns 可隔离测试的 discovery service
 */
function createService(tool: ToolDefinition): ToolArtifactDiscoveryService {
  return new ToolArtifactDiscoveryService({
    registryService: createRegistryService(tool),
    detectionService: new ToolDetectionService({
      platform: 'win32',
      pathVariables: { HOME: tempDirectory },
      commandExists: async () => false
    })
  })
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-artifact-'))
})

afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ToolArtifactDiscoveryService', () => {
  it('应发现并读取 Codex TOML 原始文本', async () => {
    const configDirectory = path.join(tempDirectory, '.codex')
    await mkdir(configDirectory)
    const configPath = path.join(configDirectory, 'config.toml')
    const content = 'model = "gpt-5"\n'
    await writeFile(configPath, content, 'utf8')
    const service = createService(createTool(['DISCOVER', 'READ']))

    const detected = await service.detectTools()
    const artifacts = await service.discoverArtifacts('codex-cli')
    const loaded = await service.readArtifact('codex-cli', 'user-config', artifacts[0].path)

    expect(detected[0].detected).toBe(true)
    expect(artifacts).toHaveLength(1)
    expect(loaded.content).toBe(content)
    expect(loaded.format).toBe('TOML')
  })

  it('应忽略缺失文件并拒绝 registry 外部路径', async () => {
    const service = createService(createTool(['DISCOVER', 'READ']))

    await expect(service.discoverArtifacts('codex-cli')).resolves.toEqual([])
    await expect(service.readArtifact(
      'codex-cli',
      'user-config',
      path.join(tempDirectory, 'secrets.txt')
    )).rejects.toThrow('未声明')
  })

  it('应支持空 requestedPath 授权到声明的主候选路径', async () => {
    const configDirectory = path.join(tempDirectory, '.codex')
    await mkdir(configDirectory)
    const configPath = path.join(configDirectory, 'config.toml')
    const content = 'model = "gpt-5"\n'
    await writeFile(configPath, content, 'utf8')
    const service = createService(createTool(['DISCOVER', 'READ']))

    const loaded = await service.readArtifact('codex-cli', 'user-config', '')

    expect(loaded.path).toBe(configPath)
    expect(loaded.content).toBe(content)
  })

  it('应拒绝未声明 READ capability 的资产', async () => {
    const service = createService(createTool(['DISCOVER']))
    await expect(service.readArtifact(
      'codex-cli',
      'user-config',
      path.join(tempDirectory, '.codex', 'config.toml')
    )).rejects.toThrow('READ capability')
  })

  it('应拒绝无效 UTF-8 配置文本', async () => {
    const configDirectory = path.join(tempDirectory, '.codex')
    await mkdir(configDirectory)
    const configPath = path.join(configDirectory, 'config.toml')
    await writeFile(configPath, Buffer.from([0xc3, 0x28]))
    const service = createService(createTool(['DISCOVER', 'READ']))

    await expect(service.readArtifact('codex-cli', 'user-config', configPath)).rejects.toThrow('UTF-8')
  })

  it('应拒绝超限文件和 symbolic link', async () => {
    const configDirectory = path.join(tempDirectory, '.codex')
    await mkdir(configDirectory)
    const configPath = path.join(configDirectory, 'config.toml')
    const service = createService(createTool(['DISCOVER', 'READ']))
    await writeFile(configPath, Buffer.alloc(CONFIG_ARTIFACT_MAX_BYTES + 1))

    await expect(service.discoverArtifacts('codex-cli')).rejects.toThrow('超过读取限制')

    await rm(configPath)
    const externalDirectory = path.join(tempDirectory, 'external')
    await mkdir(externalDirectory)
    await symlink(externalDirectory, configPath, 'junction')
    await expect(service.discoverArtifacts('codex-cli')).rejects.toThrow('symbolic link')
  })

  it('应拒绝中间目录 junction 重定向', async () => {
    const externalDirectory = path.join(tempDirectory, 'external-codex')
    await mkdir(externalDirectory)
    await writeFile(path.join(externalDirectory, 'config.toml'), 'secret = true\n', 'utf8')
    await symlink(externalDirectory, path.join(tempDirectory, '.codex'), 'junction')
    const service = createService(createTool(['DISCOVER', 'READ']))

    await expect(service.discoverArtifacts('codex-cli')).rejects.toThrow('symbolic link')
  })
})
