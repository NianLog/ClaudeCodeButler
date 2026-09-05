/**
 * @file Registry publisher rehearsal（R1 发布链四场景）
 * @description 使用 production trust map、真实 offline signing helper 与真实 ToolRegistryService 存储，
 *              走完整 manifest check → explicit install → tampered/unknown-key 拒绝 → rollback 链路。
 *              需要环境变量 CCB_REHEARSAL_PRIVATE_KEY 指向 .keys/ 下 gitignored 的 Ed25519 private key；
 *              未设置时仅验证 trust map 注入，四场景在 CI 自动跳过（private key 永不进入仓库）。
 */

import { createRequire } from 'module'
import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  REGISTRY_TRUSTED_PUBLIC_KEYS,
  RegistryUpdateService,
  type RegistryHttpClient
} from '../../../src/main/services/registry-update-service'
import { ToolRegistryService } from '../../../src/main/services/tool-registry-service'
import builtinRegistryJson from '../../../src/shared/builtin-tool-registry.json'

const require = createRequire(import.meta.url)
const { buildBundleIntegrity } = require('../../../scripts/sign-registry-bundle.cjs') as {
  buildBundleIntegrity: (rawBundle: Buffer, privateKeyPem: string, keyId: string) => BundleIntegrity
}

const REHEARSAL_ORIGIN = 'https://registry.rehearsal.invalid'
const REHEARSAL_MANIFEST_URL = `${REHEARSAL_ORIGIN}/manifest.json`
const REHEARSAL_BUNDLE_URL = `${REHEARSAL_ORIGIN}/bundle.json`
const DEFAULT_REHEARSAL_KEY_ID = 'ccb-rehearsal-2026-09'

// builtin registry 版本随发布推进，演练场景版本必须始终高于 embedded baseline
const embeddedVersion = (builtinRegistryJson as { registryVersion: string }).registryVersion
const embeddedMinor = Number(embeddedVersion.split('.')[1])
const rehearsalVersionA = `1.${embeddedMinor + 1}.0`
const rehearsalVersionB = `1.${embeddedMinor + 2}.0`

const privateKeyPath = process.env.CCB_REHEARSAL_PRIVATE_KEY
const rehearsalKeyId = process.env.CCB_REHEARSAL_KEY_ID ?? DEFAULT_REHEARSAL_KEY_ID
const rehearsalEnabled = Boolean(privateKeyPath) && Boolean(REGISTRY_TRUSTED_PUBLIC_KEYS[rehearsalKeyId])

interface BundleIntegrity {
  bundleSha256: string
  bundleSize: number
  signatureAlgorithm: string
  keyId: string
  signature: string
}

/** 以 builtin registry 为基础生成指定 registryVersion 的 RC bundle 文本。 */
function createBundleText(registryVersion: string): string {
  const bundle = { ...(builtinRegistryJson as Record<string, unknown>), registryVersion }
  return JSON.stringify(bundle, null, 2)
}

/** 组装可被 manifest validator 接受的 manifest JSON 文本。 */
function createManifestText(
  integrity: BundleIntegrity,
  registryVersion: string,
  overrides: Record<string, unknown> = {}
): string {
  return JSON.stringify({
    schemaVersion: 1,
    registryVersion,
    minimumAppVersion: '1.5.0',
    publishedAt: '2026-09-04T00:00:00.000Z',
    bundleUrl: REHEARSAL_BUNDLE_URL,
    bundleSha256: integrity.bundleSha256,
    bundleSize: integrity.bundleSize,
    signatureAlgorithm: integrity.signatureAlgorithm,
    keyId: integrity.keyId,
    signature: integrity.signature,
    releaseNotes: { 'zh-CN': 'rehearsal 更新', 'en-US': 'rehearsal update' },
    ...overrides
  })
}

/** HTTP client stub：返回固定 manifest 文本与 bundle bytes。 */
function createHttpClient(manifestText: string, bundleBuffer: Buffer): RegistryHttpClient {
  return {
    getText: async () => manifestText,
    getBytes: async () => bundleBuffer
  }
}

/** 创建使用真实原子存储（临时目录）的 ToolRegistryService。 */
function createRegistryService(): ToolRegistryService {
  const directory = mkdtempSync(join(tmpdir(), 'ccb-registry-rehearsal-'))
  return new ToolRegistryService({
    installed: join(directory, 'installed.json'),
    metadata: join(directory, 'metadata.json'),
    lastKnownGood: join(directory, 'last-known-good.json')
  })
}

/** 创建使用 production trust map 的更新服务。 */
function createUpdateService(
  registryService: ToolRegistryService,
  httpClient: RegistryHttpClient
): RegistryUpdateService {
  return new RegistryUpdateService({
    registryService,
    httpClient,
    manifestUrl: REHEARSAL_MANIFEST_URL,
    allowedOrigins: [REHEARSAL_ORIGIN],
    trustedPublicKeys: REGISTRY_TRUSTED_PUBLIC_KEYS
  })
}

describe('Registry publisher rehearsal', () => {
  it('production trust map 应只包含 production 命名的 SPKI publisher key', () => {
    const keyIds = Object.keys(REGISTRY_TRUSTED_PUBLIC_KEYS)
    expect(keyIds.length).toBeGreaterThan(0)
    for (const keyId of keyIds) {
      expect(keyId).not.toMatch(/rehearsal|test|dev|staging|example|sample|placeholder|dummy/i)
      expect(REGISTRY_TRUSTED_PUBLIC_KEYS[keyId]).toMatch(/BEGIN PUBLIC KEY/)
      expect(REGISTRY_TRUSTED_PUBLIC_KEYS[keyId]).not.toContain('PRIVATE KEY')
    }
  })

  it('offline signing helper 应拒绝非法 keyId 与超限 bundle', () => {
    // 占位串即可：两个用例均在解析 key 之前抛出（size/keyId 前置校验）；
    // 不要在这里写 PEM 字面量，release-preflight 会扫描 tracked 文件中的 private key marker。
    const keyPem = 'unused-placeholder-key-material'
    expect(() => buildBundleIntegrity(Buffer.from('{}'), keyPem, 'INVALID_KEY_ID')).toThrow(
      /kebab-case/
    )
    expect(() => buildBundleIntegrity(Buffer.alloc(0), keyPem, 'valid-key')).toThrow(/size/)
  })

  describe.skipIf(!rehearsalEnabled)('R1 四场景（CCB_REHEARSAL_PRIVATE_KEY 已设置）', () => {
    let bundle11: Buffer
    let bundle12: Buffer
    let manifest11: string
    let manifest12: string
    let manifestUnknownKey: string

    beforeAll(() => {
      expect(privateKeyPath).toBeTruthy()
      const keyPem = readFileSync(privateKeyPath!, 'utf8')
      const buildIntegrity = (rawBundle: Buffer, keyId: string): BundleIntegrity =>
        buildBundleIntegrity(rawBundle, keyPem, keyId)

      bundle11 = Buffer.from(createBundleText(rehearsalVersionA), 'utf8')
      bundle12 = Buffer.from(createBundleText(rehearsalVersionB), 'utf8')
      manifest11 = createManifestText(buildIntegrity(bundle11, rehearsalKeyId), rehearsalVersionA)
      manifest12 = createManifestText(buildIntegrity(bundle12, rehearsalKeyId), rehearsalVersionB)
      manifestUnknownKey = createManifestText(buildIntegrity(bundle11, rehearsalKeyId), rehearsalVersionA, {
        keyId: 'unknown-publisher-2026'
      })
    })

    it('valid：真实签名链通过 manifest check 与 explicit install', async () => {
      const registryService = createRegistryService()
      const service = createUpdateService(registryService, createHttpClient(manifest11, bundle11))

      const checked = await service.checkForUpdates('1.5.0')
      expect(checked.state).toBe('UPDATE_AVAILABLE')
      expect(checked.availableVersion).toBe(rehearsalVersionA)

      const installed = await service.installAvailableUpdate('1.5.0')
      expect(installed.state).toBe('INSTALLED')

      const snapshot = await registryService.getSnapshot()
      expect(snapshot.installedVersion).toBe(rehearsalVersionA)
      expect(snapshot.tools.some((tool) => tool.toolId === 'claude-code')).toBe(true)
    })

    it('tampered：签名后篡改 bundle bytes 必须被拒绝', async () => {
      const registryService = createRegistryService()
      const tampered = Buffer.from(bundle11)
      tampered[Math.floor(tampered.length / 2)] ^= 0x01
      const service = createUpdateService(registryService, createHttpClient(manifest11, tampered))

      await service.checkForUpdates('1.5.0')
      await expect(service.installAvailableUpdate('1.5.0')).rejects.toThrow(/signature|SHA-256/i)

      const snapshot = await registryService.getSnapshot()
      expect(snapshot.installedVersion).toBeUndefined()
    })

    it('unknown-key：未受信任 keyId 的 manifest 必须被拒绝', async () => {
      const registryService = createRegistryService()
      const service = createUpdateService(registryService, createHttpClient(manifestUnknownKey, bundle11))

      const status = await service.checkForUpdates('1.5.0')
      expect(status.state).toBe('CHECK_FAILED')
      expect(status.error).toContain('未受信任')
    })

    it('rollback：连续安装后可显式回滚到 last-known-good', async () => {
      const registryService = createRegistryService()
      const install = async (manifestText: string, bundle: Buffer): Promise<void> => {
        const service = createUpdateService(registryService, createHttpClient(manifestText, bundle))
        await service.checkForUpdates('1.5.0')
        await service.installAvailableUpdate('1.5.0')
      }

      await install(manifest11, bundle11)
      await install(manifest12, bundle12)
      let snapshot = await registryService.getSnapshot()
      expect(snapshot.installedVersion).toBe(rehearsalVersionB)

      const rollbackService = createUpdateService(registryService, createHttpClient(manifest12, bundle12))
      const status = await rollbackService.rollback()
      expect(status.state).toBe('ROLLED_BACK')

      snapshot = await registryService.getSnapshot()
      expect(snapshot.installedVersion).toBe(rehearsalVersionA)
    })
  })
})
