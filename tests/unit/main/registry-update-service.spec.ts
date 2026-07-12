/**
 * @file tests/unit/main/registry-update-service.spec.ts
 * @description 验证 manifest-only check、explicit install 与 pinned origin 安全边界。
 */

import { generateKeyPairSync, sign } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ToolRegistrySnapshot } from '../../../src/main/services/tool-registry-service'
import {
  RegistryUpdateService,
  type RegistryHttpClient
} from '../../../src/main/services/registry-update-service'

/**
 * 创建最小 registry service fake
 * @returns 带 mock methods 的 registry service
 */
function createRegistryServiceFake(): {
  getSnapshot: ReturnType<typeof vi.fn>
  installBundle: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
} {
  const snapshot: ToolRegistrySnapshot = {
    embeddedVersion: '1.0.0',
    tools: [],
    recoveredFromLastKnownGood: false
  }
  return {
    getSnapshot: vi.fn(async () => snapshot),
    installBundle: vi.fn(async () => '1.1.0'),
    rollback: vi.fn(async () => '1.0.0')
  }
}

/**
 * 创建 manifest 文本
 * @param overrides 可覆盖字段
 * @returns manifest JSON
 */
const registryKeyPair = generateKeyPairSync('ed25519')
const trustedPublicKeys = {
  'test-registry-2026': registryKeyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

/**
 * 对 raw bundle 创建测试用 detached signature。
 * @param rawBundle 未规范化 bundle 文本
 */
function signBundle(rawBundle: string): string {
  return sign(null, Buffer.from(rawBundle, 'utf8'), registryKeyPair.privateKey).toString('base64')
}

function createManifest(rawBundle: string = '{}', overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    registryVersion: '1.1.0',
    minimumAppVersion: '1.5.0',
    publishedAt: '2026-07-12T00:00:00.000Z',
    bundleUrl: 'https://registry.example/bundle.json',
    bundleSha256: 'a'.repeat(64),
    bundleSize: Buffer.byteLength(rawBundle),
    signatureAlgorithm: 'ED25519',
    keyId: 'test-registry-2026',
    signature: signBundle(rawBundle),
    releaseNotes: { 'zh-CN': '更新', 'en-US': 'Update' },
    ...overrides
  })
}

describe('RegistryUpdateService', () => {
  it('check 只获取 manifest，不下载 bundle', async () => {
    const registryService = createRegistryServiceFake()
    const httpClient: RegistryHttpClient = {
      getText: vi.fn(async () => createManifest()),
      getBytes: vi.fn()
    }
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient,
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })

    const status = await service.checkForUpdates('1.5.0')

    expect(status.state).toBe('UPDATE_AVAILABLE')
    expect(httpClient.getText).toHaveBeenCalledOnce()
    expect(httpClient.getText).toHaveBeenCalledWith('https://registry.example/manifest.json', expect.any(Number))
    expect(registryService.installBundle).not.toHaveBeenCalled()
  })

  it('未 check 或无 update 时应拒绝 install', async () => {
    const service = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: { getText: vi.fn(), getBytes: vi.fn() },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })

    await expect(service.installAvailableUpdate('1.5.0')).rejects.toThrow('没有经过验证')
  })

  it('用户明确 install 后才下载 bundle，并使用 manifest integrity 数据', async () => {
    const registryService = createRegistryServiceFake()
    const rawBundle = '{}'
    const getText = vi.fn(async () => createManifest(rawBundle))
    const getBytes = vi.fn(async () => Buffer.from(rawBundle, 'utf8'))
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient: { getText, getBytes },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })

    await service.checkForUpdates('1.5.0')
    const status = await service.installAvailableUpdate('1.5.0')

    expect(getText).toHaveBeenCalledOnce()
    expect(getBytes).toHaveBeenCalledOnce()
    expect(registryService.installBundle).toHaveBeenCalledWith({
      rawBytes: Buffer.from('{}', 'utf8'),
      expectedSha256: 'a'.repeat(64),
      expectedSize: 2,
      expectedRegistryVersion: '1.1.0',
      expectedMinimumAppVersion: '1.5.0',
      currentAppVersion: '1.5.0'
    })
    expect(status.state).toBe('INSTALLED')
  })

  it('应拒绝非 pinned manifest URL 与跨 origin bundle', async () => {
    const badManifestService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: { getText: vi.fn(), getBytes: vi.fn() },
      manifestUrl: 'https://evil.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })
    expect((await badManifestService.checkForUpdates('1.5.0')).state).toBe('CHECK_FAILED')

    const crossOriginService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: {
        getText: vi.fn(async () => createManifest('{}', { bundleUrl: 'https://evil.example/bundle.json' })),
        getBytes: vi.fn()
      },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })
    expect((await crossOriginService.checkForUpdates('1.5.0')).state).toBe('CHECK_FAILED')
  })

  it('应合并并发 check，并在 manifest 要求更高 app version 时拒绝', async () => {
    const registryService = createRegistryServiceFake()
    const getText = vi.fn(async () => createManifest('{}', { minimumAppVersion: '2.0.0' }))
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient: { getText, getBytes: vi.fn() },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })

    const [first, second] = await Promise.all([
      service.checkForUpdates('1.5.0'),
      service.checkForUpdates('1.5.0')
    ])

    expect(getText).toHaveBeenCalledOnce()
    expect(first.state).toBe('CHECK_FAILED')
    expect(second.state).toBe('CHECK_FAILED')
    expect(first.error).toContain('要求 CCB >= 2.0.0')
  })

  it('应拒绝未知 keyId 与下载后被篡改的 bundle', async () => {
    const unknownKeyService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: {
        getText: vi.fn(async () => createManifest('{}', { keyId: 'unknown-key' })),
        getBytes: vi.fn()
      },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })
    const unknownKeyStatus = await unknownKeyService.checkForUpdates('1.5.0')
    expect(unknownKeyStatus.state).toBe('CHECK_FAILED')
    expect(unknownKeyStatus.error).toContain('keyId 未受信任')
    await expect(unknownKeyService.installAvailableUpdate('1.5.0')).rejects.toThrow('没有经过验证')

    const getText = vi.fn(async () => createManifest('{"safe":true}'))
    const getBytes = vi.fn(async () => Buffer.from('{"safe":false}', 'utf8'))
    const tamperedService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: { getText, getBytes },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example'],
      trustedPublicKeys
    })
    await tamperedService.checkForUpdates('1.5.0')
    await expect(tamperedService.installAvailableUpdate('1.5.0')).rejects.toThrow('signature 校验失败')
  })
})
