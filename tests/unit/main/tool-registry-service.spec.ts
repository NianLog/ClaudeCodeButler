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
  mergeToolRegistryBundles,
  ToolRegistryService,
  type ToolRegistryPaths
} from '../../../src/main/services/tool-registry-service'
import type { ToolRegistryBundle } from '../../../src/shared/tool-registry'
import { validateToolRegistryBundle } from '../../../src/shared/tool-registry-validator'

describe('definition-aware registry merge', () => {
  const legacy = (): ToolRegistryBundle => {
    const bundle = structuredClone(builtinRegistryJson) as ToolRegistryBundle
    bundle.minimumAppVersion = '1.5.0'
    for (const tool of bundle.tools) {
      tool.definitionVersion = '1.0.0'
      tool.artifacts = tool.artifacts.filter(artifact => !artifact.handler.endsWith('_DIRECTORY_V1'))
      for (const artifact of tool.artifacts) artifact.capabilities = artifact.capabilities.filter(capability => capability !== 'MANAGE_MCP')
    }
    return bundle
  }

  it('new compatible builtins replace older cached definitions as complete definitions', () => {
    const merged = mergeToolRegistryBundles(builtinRegistryJson as ToolRegistryBundle, legacy())
    expect(merged.find(tool => tool.toolId === 'claude-code')?.artifacts.map(artifact => artifact.artifactId)).toContain('skills')
    expect(merged.find(tool => tool.toolId === 'claude-code')?.artifacts.find(artifact => artifact.artifactId === 'mcp-registry')?.capabilities).not.toContain('EDIT')
  })

  it('custom installed paths and reduced legacy permissions remain intact', () => {
    const custom = legacy()
    custom.tools[0].artifacts[0].paths.WINDOWS = ['${HOME}/.custom/settings.json']
    const restricted = legacy()
    restricted.tools[0].artifacts[0].capabilities = ['DISCOVER', 'READ']
    for (const candidate of [custom, restricted]) {
      expect(mergeToolRegistryBundles(builtinRegistryJson as ToolRegistryBundle, candidate).find(tool => tool.toolId === 'claude-code')).toEqual(candidate.tools[0])
    }
  })

  it('same-version installed definitions and newer restricted definitions win without mixing', () => {
    for (const version of ['1.5.1', '9.0.0']) {
      const installed = legacy()
      installed.tools[0].definitionVersion = version
      installed.tools[0].artifacts[0].capabilities = ['READ']
      const merged = mergeToolRegistryBundles(builtinRegistryJson as ToolRegistryBundle, installed)
      expect(merged.find(tool => tool.toolId === 'claude-code')).toEqual(installed.tools[0])
    }
  })

  it('preserves installed configuration-set membership instead of adding credentials to another group', () => {
    const installed = legacy()
    const codex = installed.tools.find(tool => tool.toolId === 'codex-cli')!
    codex.artifacts.find(artifact => artifact.artifactId === 'auth')!.configSet = 'private-auth'
    expect(mergeToolRegistryBundles(builtinRegistryJson as ToolRegistryBundle, installed).find(tool => tool.toolId === 'codex-cli')).toEqual(codex)
  })

  it('does not restore explicitly removed resource permissions from a source supporting the new protocol', () => {
    const installed = structuredClone(builtinRegistryJson) as ToolRegistryBundle
    installed.registryVersion = '1.3.1'
    const claude = installed.tools.find(tool => tool.toolId === 'claude-code')!
    claude.definitionVersion = '1.5.0'
    claude.artifacts.find(artifact => artifact.artifactId === 'skills')!.capabilities = ['DISCOVER', 'READ']
    expect(validateToolRegistryBundle(JSON.stringify(installed)).success).toBe(true)
    const effective = mergeToolRegistryBundles(builtinRegistryJson as ToolRegistryBundle, installed).find(tool => tool.toolId === 'claude-code')!
    expect(effective).toEqual(claude)
    expect(effective.artifacts.find(artifact => artifact.artifactId === 'skills')!.capabilities).not.toContain('MANAGE_DIRECTORY')
  })
})

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
    expect(snapshot.tools.map((tool) => tool.toolId)).toEqual(
      ['antigravity', 'claude-code', 'codex-cli', 'example-tool', 'gemini-cli']
    )
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

    const rolledBack = await service.rollback()
    expect(rolledBack).toEqual({ target: 'LAST_KNOWN_GOOD', registryVersion: '1.1.0' })
    const installed = JSON.parse(await readFile(registryPaths.installed, 'utf8')) as typeof builtinRegistryJson
    expect(installed.registryVersion).toBe('1.1.0')
  })

  it('首次安装后无 last-known-good 时应回退内置基线并清空 installed/metadata', async () => {
    const service = new ToolRegistryService(registryPaths)
    await service.installBundle(createInstallInput(createBundle('1.2.1'), '1.5.0'))

    const rolledBack = await service.rollback()
    expect(rolledBack).toEqual({
      target: 'EMBEDDED',
      registryVersion: (builtinRegistryJson as { registryVersion: string }).registryVersion
    })

    await expect(readFile(registryPaths.installed, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(registryPaths.metadata, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    const snapshot = await service.getSnapshot()
    expect(snapshot.installedVersion).toBeUndefined()
    expect(snapshot.recoveredFromLastKnownGood).toBe(false)
    expect(snapshot.tools.map((tool) => tool.toolId)).toContain('claude-code')
  })

  it('last-known-good 损坏时 rollback 同样回退内置基线', async () => {
    const service = new ToolRegistryService(registryPaths)
    await service.installBundle(createInstallInput(createBundle('1.2.1'), '1.5.0'))
    await writeFile(registryPaths.lastKnownGood, '{broken', 'utf8')

    const rolledBack = await service.rollback()
    expect(rolledBack.target).toBe('EMBEDDED')
    await expect(readFile(registryPaths.lastKnownGood, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('没有任何远程规则库时 rollback 应报错', async () => {
    const service = new ToolRegistryService(registryPaths)

    await expect(service.rollback()).rejects.toThrow('无需回滚')
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
