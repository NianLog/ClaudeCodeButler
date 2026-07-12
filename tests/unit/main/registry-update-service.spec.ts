/**
 * @file tests/unit/main/registry-update-service.spec.ts
 * @description 验证 manifest-only check、explicit install 与 pinned origin 安全边界。
 */

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
function createManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    registryVersion: '1.1.0',
    minimumAppVersion: '1.5.0',
    publishedAt: '2026-07-12T00:00:00.000Z',
    bundleUrl: 'https://registry.example/bundle.json',
    bundleSha256: 'a'.repeat(64),
    bundleSize: 2,
    releaseNotes: { 'zh-CN': '更新', 'en-US': 'Update' },
    ...overrides
  })
}

describe('RegistryUpdateService', () => {
  it('check 只获取 manifest，不下载 bundle', async () => {
    const registryService = createRegistryServiceFake()
    const httpClient: RegistryHttpClient = {
      getText: vi.fn(async () => createManifest())
    }
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient,
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example']
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
      httpClient: { getText: vi.fn() },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example']
    })

    await expect(service.installAvailableUpdate('1.5.0')).rejects.toThrow('没有经过验证')
  })

  it('用户明确 install 后才下载 bundle，并使用 manifest integrity 数据', async () => {
    const registryService = createRegistryServiceFake()
    const getText = vi.fn(async (url: string) =>
      url.endsWith('manifest.json') ? createManifest() : '{}'
    )
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient: { getText },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example']
    })

    await service.checkForUpdates('1.5.0')
    const status = await service.installAvailableUpdate('1.5.0')

    expect(getText).toHaveBeenCalledTimes(2)
    expect(registryService.installBundle).toHaveBeenCalledWith({
      rawJson: '{}',
      expectedSha256: 'a'.repeat(64),
      expectedSize: 2,
      currentAppVersion: '1.5.0'
    })
    expect(status.state).toBe('INSTALLED')
  })

  it('应拒绝非 pinned manifest URL 与跨 origin bundle', async () => {
    const badManifestService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: { getText: vi.fn() },
      manifestUrl: 'https://evil.example/manifest.json',
      allowedOrigins: ['https://registry.example']
    })
    expect((await badManifestService.checkForUpdates('1.5.0')).state).toBe('CHECK_FAILED')

    const crossOriginService = new RegistryUpdateService({
      registryService: createRegistryServiceFake() as never,
      httpClient: { getText: vi.fn(async () => createManifest({ bundleUrl: 'https://evil.example/bundle.json' })) },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example']
    })
    expect((await crossOriginService.checkForUpdates('1.5.0')).state).toBe('CHECK_FAILED')
  })

  it('应合并并发 check，并在 manifest 要求更高 app version 时拒绝', async () => {
    const registryService = createRegistryServiceFake()
    const getText = vi.fn(async () => createManifest({ minimumAppVersion: '2.0.0' }))
    const service = new RegistryUpdateService({
      registryService: registryService as never,
      httpClient: { getText },
      manifestUrl: 'https://registry.example/manifest.json',
      allowedOrigins: ['https://registry.example']
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
})
