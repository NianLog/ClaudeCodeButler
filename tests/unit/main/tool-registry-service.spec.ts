/**
 * @file tests/unit/main/tool-registry-service.spec.ts
 * @description 验证 registry install、integrity、merge、fallback 与 rollback。
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import builtinRegistryJson from '../../../src/shared/builtin-tool-registry.json'

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import {
  calculateRegistrySha256,
  ToolRegistryService,
  type ToolRegistryPaths
} from '../../../src/main/services/tool-registry-service'

let tempDirectory: string
let registryPaths: ToolRegistryPaths

/**
 * 创建指定版本的有效 registry bundle
 * @param registryVersion registry SemVer
 * @param toolId tool identifier
 * @returns raw JSON
 */
function createBundle(registryVersion: string, toolId: string = 'example-tool'): string {
  return JSON.stringify({
    schemaVersion: 1,
    registryVersion,
    minimumAppVersion: '1.4.0',
    tools: [{
      toolId,
      definitionVersion: registryVersion,
      displayName: { 'zh-CN': '示例工具', 'en-US': 'Example Tool' },
      platforms: ['WINDOWS'],
      detectors: [{ type: 'PATH_EXISTS', path: '${HOME}/.example' }],
      artifacts: [{
        artifactId: 'settings',
        displayName: { 'zh-CN': '设置', 'en-US': 'Settings' },
        format: 'JSON',
        scope: 'USER',
        paths: { WINDOWS: ['${HOME}/.example/settings.json'] },
        capabilities: ['DISCOVER', 'READ'],
        handler: 'JSON_FILE_V1'
      }]
    }]
  })
}

/**
 * 创建与 bundle metadata 绑定的安装参数。
 * @param rawJson 原始 bundle JSON
 * @param currentAppVersion 当前应用版本
 */
function createInstallInput(rawJson: string, currentAppVersion: string): {
  rawBytes: Buffer
  expectedSha256: string
  expectedSize: number
  expectedRegistryVersion: string
  expectedMinimumAppVersion: string
  currentAppVersion: string
} {
  const bundle = JSON.parse(rawJson) as { registryVersion: string; minimumAppVersion: string }
  return {
    rawBytes: Buffer.from(rawJson, 'utf8'),
    expectedSha256: calculateRegistrySha256(rawJson),
    expectedSize: Buffer.byteLength(rawJson),
    expectedRegistryVersion: bundle.registryVersion,
    expectedMinimumAppVersion: bundle.minimumAppVersion,
    currentAppVersion
  }
}

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-registry-'))
  registryPaths = {
    installed: path.join(tempDirectory, 'installed.json'),
    metadata: path.join(tempDirectory, 'installed.meta.json'),
    lastKnownGood: path.join(tempDirectory, 'last-known-good.json')
  }
})
afterEach(async () => {
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ToolRegistryService', () => {
  it('无 installed bundle 时应返回内置 Claude adapter', async () => {
    const service = new ToolRegistryService(registryPaths)
    const snapshot = await service.getSnapshot()

    expect(snapshot.tools.map((tool) => tool.toolId)).toContain('claude-code')
    expect(snapshot.installedVersion).toBeUndefined()
  })

  it('应校验 integrity 并合并 installed tool', async () => {
    const service = new ToolRegistryService(registryPaths)
    const rawJson = createBundle('1.1.0')

    await expect(service.installBundle({
      ...createInstallInput(rawJson, '1.5.0'),
      expectedSha256: '0'.repeat(64),
    })).rejects.toThrow('SHA-256')

    await service.installBundle(createInstallInput(rawJson, '1.5.0'))
    const snapshot = await service.getSnapshot()

    expect(snapshot.installedVersion).toBe('1.1.0')
    expect(snapshot.tools.map((tool) => tool.toolId)).toEqual(['claude-code', 'codex-cli', 'example-tool'])
  })

  it('应在 schema parse 前拒绝无效 UTF-8 bytes', async () => {
    const service = new ToolRegistryService(registryPaths)
    const rawBytes = Buffer.from([0xc3, 0x28])

    await expect(service.installBundle({
      rawBytes,
      expectedSha256: calculateRegistrySha256(rawBytes),
      expectedSize: rawBytes.length,
      expectedRegistryVersion: '1.1.0',
      expectedMinimumAppVersion: '1.4.0',
      currentAppVersion: '1.5.0'
    })).rejects.toThrow('不是有效 UTF-8')
  })

  it('应拒绝不兼容 app version 与隐式 downgrade', async () => {
    const service = new ToolRegistryService(registryPaths)
    const futureBundle = JSON.parse(createBundle('2.0.0')) as Record<string, unknown>
    futureBundle.minimumAppVersion = '2.0.0'
    const futureRaw = JSON.stringify(futureBundle)

    await expect(service.installBundle(createInstallInput(futureRaw, '1.5.0'))).rejects.toThrow('要求 CCB')

    const newerRaw = createBundle('2.0.0')
    await service.installBundle(createInstallInput(newerRaw, '2.0.0'))
    const olderRaw = createBundle('1.9.0')
    await expect(service.installBundle(createInstallInput(olderRaw, '2.0.0'))).rejects.toThrow('拒绝规则库降级')

    await expect(service.installBundle({
      ...createInstallInput(newerRaw, '2.0.0'),
      expectedRegistryVersion: '2.0.1'
    })).rejects.toThrow('版本与 manifest 不匹配')
  })

  it('installed 损坏时应回退 last-known-good，并支持显式 rollback', async () => {
    const service = new ToolRegistryService(registryPaths)
    const firstRaw = createBundle('1.1.0', 'first-tool')
    await service.installBundle(createInstallInput(firstRaw, '1.5.0'))
    const secondRaw = createBundle('1.2.0', 'second-tool')
    await service.installBundle(createInstallInput(secondRaw, '1.5.0'))

    await writeFile(registryPaths.installed, '{broken', 'utf8')
    const recovered = await service.getSnapshot()
    expect(recovered.recoveredFromLastKnownGood).toBe(true)
    expect(recovered.tools.map((tool) => tool.toolId)).toContain('first-tool')

    const rolledBackVersion = await service.rollback()
    expect(rolledBackVersion).toBe('1.1.0')
    const installed = JSON.parse(await readFile(registryPaths.installed, 'utf8')) as typeof builtinRegistryJson
    expect(installed.registryVersion).toBe('1.1.0')
  })

  it('应缓存未变化 snapshot 并在 storage 变化后失效', async () => {
    const service = new ToolRegistryService(registryPaths)
    const readFileSpy = vi.spyOn(fs, 'readFile')

    const [first, concurrent] = await Promise.all([service.getSnapshot(), service.getSnapshot()])
    const readsAfterFirstLoad = readFileSpy.mock.calls.length
    const cached = await service.getSnapshot()

    expect(concurrent).toEqual(first)
    expect(cached).toEqual(first)
    expect(readFileSpy.mock.calls).toHaveLength(readsAfterFirstLoad)

    const rawJson = createBundle('1.3.0', 'cached-tool')
    await writeFile(registryPaths.installed, rawJson, 'utf8')
    const refreshed = await service.getSnapshot()

    expect(refreshed.tools.map((tool) => tool.toolId)).toContain('cached-tool')
    expect(readFileSpy.mock.calls.length).toBeGreaterThan(readsAfterFirstLoad)
    readFileSpy.mockRestore()
  })
})
