/**
 * @file tests/unit/main/tool-registry-service.spec.ts
 * @description 验证 registry install、integrity、merge、fallback 与 rollback。
 */

import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
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
      rawJson,
      expectedSha256: '0'.repeat(64),
      expectedSize: Buffer.byteLength(rawJson),
      currentAppVersion: '1.5.0'
    })).rejects.toThrow('SHA-256')

    await service.installBundle({
      rawJson,
      expectedSha256: calculateRegistrySha256(rawJson),
      expectedSize: Buffer.byteLength(rawJson),
      currentAppVersion: '1.5.0'
    })
    const snapshot = await service.getSnapshot()

    expect(snapshot.installedVersion).toBe('1.1.0')
    expect(snapshot.tools.map((tool) => tool.toolId)).toEqual(['claude-code', 'codex-cli', 'example-tool'])
  })

  it('应拒绝不兼容 app version 与隐式 downgrade', async () => {
    const service = new ToolRegistryService(registryPaths)
    const futureBundle = JSON.parse(createBundle('2.0.0')) as Record<string, unknown>
    futureBundle.minimumAppVersion = '2.0.0'
    const futureRaw = JSON.stringify(futureBundle)

    await expect(service.installBundle({
      rawJson: futureRaw,
      expectedSha256: calculateRegistrySha256(futureRaw),
      expectedSize: Buffer.byteLength(futureRaw),
      currentAppVersion: '1.5.0'
    })).rejects.toThrow('要求 CCB')

    const newerRaw = createBundle('2.0.0')
    await service.installBundle({
      rawJson: newerRaw,
      expectedSha256: calculateRegistrySha256(newerRaw),
      expectedSize: Buffer.byteLength(newerRaw),
      currentAppVersion: '2.0.0'
    })
    const olderRaw = createBundle('1.9.0')
    await expect(service.installBundle({
      rawJson: olderRaw,
      expectedSha256: calculateRegistrySha256(olderRaw),
      expectedSize: Buffer.byteLength(olderRaw),
      currentAppVersion: '2.0.0'
    })).rejects.toThrow('拒绝规则库降级')
  })

  it('installed 损坏时应回退 last-known-good，并支持显式 rollback', async () => {
    const service = new ToolRegistryService(registryPaths)
    const firstRaw = createBundle('1.1.0', 'first-tool')
    await service.installBundle({
      rawJson: firstRaw,
      expectedSha256: calculateRegistrySha256(firstRaw),
      expectedSize: Buffer.byteLength(firstRaw),
      currentAppVersion: '1.5.0'
    })
    const secondRaw = createBundle('1.2.0', 'second-tool')
    await service.installBundle({
      rawJson: secondRaw,
      expectedSha256: calculateRegistrySha256(secondRaw),
      expectedSize: Buffer.byteLength(secondRaw),
      currentAppVersion: '1.5.0'
    })

    await writeFile(registryPaths.installed, '{broken', 'utf8')
    const recovered = await service.getSnapshot()
    expect(recovered.recoveredFromLastKnownGood).toBe(true)
    expect(recovered.tools.map((tool) => tool.toolId)).toContain('first-tool')

    const rolledBackVersion = await service.rollback()
    expect(rolledBackVersion).toBe('1.1.0')
    const installed = JSON.parse(await readFile(registryPaths.installed, 'utf8')) as typeof builtinRegistryJson
    expect(installed.registryVersion).toBe('1.1.0')
  })
})
