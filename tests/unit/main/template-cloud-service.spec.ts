/**
 * @file tests/unit/main/template-cloud-service.spec.ts
 * @description 验证云模板（v2 通道）服务的完整信任链：index 签名（canonical Ed25519）、
 *              pinned origin、minimumAppVersion 门槛、item 哈希/尺寸/一致性校验，
 *              以及 CONFIG_SET / ARTIFACT 两类导入不引入任何新写路径。
 */

import { createHash, generateKeyPairSync, sign } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import { TemplateCloudService } from '../../../src/main/services/template-cloud-service'
import type { RegistryHttpClient } from '../../../src/main/services/registry-update-service'
import type { ToolConfigSetService } from '../../../src/main/services/tool-config-set-service'
import type { ArtifactTemplateService } from '../../../src/main/services/artifact-template-service'
import type { TemplateCloudItemMeta } from '../../../src/shared/template-cloud'
import { canonicalJsonStable } from '../../../src/shared/template-cloud-validator'

const ORIGIN = 'https://templates.example'
const INDEX_URL = `${ORIGIN}/software/ccb/templates/v1/index.json`

const keyPair = generateKeyPairSync('ed25519')
const trustedPublicKeys = {
  'test-template-2026': keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
}

/** 测试用 fixture：item meta + 负载字节。 */
interface FixtureItem {
  meta: TemplateCloudItemMeta
  bytes: Buffer
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** 构造 CONFIG_SET 模板 fixture。 */
function createConfigSetFixture(templateId = 'demo-config-set'): FixtureItem {
  const payload = {
    schemaVersion: 1,
    templateId,
    toolId: 'demo-tool',
    displayName: { 'zh-CN': '云端工作集', 'en-US': 'Cloud Work Set' },
    files: [{ artifactId: 'alpha-config', format: 'JSON', content: '{"model":"cloud"}' }]
  }
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  return {
    bytes,
    meta: {
      templateId,
      kind: 'CONFIG_SET',
      toolId: 'demo-tool',
      name: 'demo',
      description: 'demo',
      language: 'zh-CN',
      author: 'ccb',
      itemUrl: `${ORIGIN}/software/ccb/templates/v1/items/${templateId}.json`,
      itemSha256: sha256Hex(bytes),
      itemSize: bytes.length
    }
  }
}

/** 构造 ARTIFACT 模板 fixture。 */
function createArtifactFixture(templateId = 'demo-artifact'): FixtureItem {
  const payload = {
    schemaVersion: 1,
    templateId,
    toolId: 'demo-tool',
    artifactId: 'instructions',
    displayName: { 'zh-CN': '启动模板' },
    content: '# cloud template\n'
  }
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  return {
    bytes,
    meta: {
      templateId,
      kind: 'ARTIFACT',
      toolId: 'demo-tool',
      name: 'demo',
      description: 'demo',
      language: 'zh-CN',
      author: 'ccb',
      itemUrl: `${ORIGIN}/software/ccb/templates/v1/items/${templateId}.json`,
      itemSha256: sha256Hex(bytes),
      itemSize: bytes.length
    }
  }
}

/** 组装签名 index 文本（签名对象为移除 signature 后的 canonical JSON）。 */
function buildSignedIndex(
  fixtures: FixtureItem[],
  overrides: Record<string, unknown> = {},
  signingKey = keyPair.privateKey
): string {
  const base = {
    schemaVersion: 1,
    templatesVersion: '1.0.0',
    minimumAppVersion: '1.5.0',
    publishedAt: '2026-09-04T00:00:00.000Z',
    items: fixtures.map((fixture) => fixture.meta),
    signatureAlgorithm: 'ED25519',
    keyId: 'test-template-2026'
  }
  const signature = sign(null, Buffer.from(canonicalJsonStable(base), 'utf8'), signingKey).toString('base64')
  return JSON.stringify({ ...base, signature, ...overrides })
}

/** HTTP client stub：按 itemUrl 分发 fixture 字节。 */
function createHttpClient(rawIndex: string, fixtures: FixtureItem[]): RegistryHttpClient {
  return {
    getText: vi.fn(async () => rawIndex),
    getBytes: vi.fn(async (url: string) => {
      const fixture = fixtures.find((item) => item.meta.itemUrl === url)
      if (!fixture) throw new Error(`unexpected url: ${url}`)
      return fixture.bytes
    })
  }
}

/** 组装被测服务（注入 fake 写路径依赖）。 */
function createService(httpClient: RegistryHttpClient) {
  const configSetService = {
    createConfigSetFromContents: vi.fn(async () => ({
      toolId: 'demo-tool',
      setId: 'set-000000000001',
      name: '云端工作集',
      createdAt: '2026-09-04T00:00:00.000Z',
      lastModifiedAt: '2026-09-04T00:00:00.000Z',
      files: [],
      sizeBytes: 0,
      isInUse: false
    }))
  } as unknown as ToolConfigSetService
  const artifactTemplates = {
    saveArtifactTemplateOverride: vi.fn(async () => ({
      key: 'demo-tool/instructions',
      toolId: 'demo-tool',
      artifactId: 'instructions'
    }))
  } as unknown as ArtifactTemplateService
  const service = new TemplateCloudService({
    httpClient,
    indexUrl: INDEX_URL,
    allowedOrigins: [ORIGIN],
    trustedPublicKeys,
    configSetService,
    artifactTemplateService: artifactTemplates
  })
  return { service, configSetService, artifactTemplates }
}

describe('TemplateCloudService', () => {
  it('listTemplates 返回清单且并发去重', async () => {
    const configSetFixture = createConfigSetFixture()
    const artifactFixture = createArtifactFixture()
    const httpClient = createHttpClient(
      buildSignedIndex([configSetFixture, artifactFixture]),
      [configSetFixture, artifactFixture]
    )
    const { service } = createService(httpClient)

    const [first, second] = await Promise.all([service.listTemplates('1.5.0'), service.listTemplates('1.5.0')])

    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(2)
    expect(first.templatesVersion).toBe('1.0.0')
    expect(httpClient.getText).toHaveBeenCalledOnce()
    expect(httpClient.getText).toHaveBeenCalledWith(INDEX_URL, expect.any(Number))
  })

  it('importTemplate 导入 CONFIG_SET：复用 createConfigSetFromContents 且不含 format', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(buildSignedIndex([configSetFixture]), [configSetFixture])
    const { service, configSetService, artifactTemplates } = createService(httpClient)

    const result = await service.importTemplate('demo-config-set', '1.5.0')

    expect(result.kind).toBe('CONFIG_SET')
    expect(configSetService.createConfigSetFromContents).toHaveBeenCalledWith(
      'demo-tool',
      '云端工作集',
      [{ artifactId: 'alpha-config', content: '{"model":"cloud"}' }]
    )
    expect(artifactTemplates.saveArtifactTemplateOverride).not.toHaveBeenCalled()
  })

  it('importTemplate 导入 ARTIFACT：复用 saveArtifactTemplateOverride', async () => {
    const artifactFixture = createArtifactFixture()
    const httpClient = createHttpClient(buildSignedIndex([artifactFixture]), [artifactFixture])
    const { service, configSetService, artifactTemplates } = createService(httpClient)

    const result = await service.importTemplate('demo-artifact', '1.5.0')

    expect(result.kind).toBe('ARTIFACT')
    expect(artifactTemplates.saveArtifactTemplateOverride).toHaveBeenCalledWith(
      'demo-tool',
      'instructions',
      '# cloud template\n'
    )
    expect(configSetService.createConfigSetFromContents).not.toHaveBeenCalled()
  })

  it('importTemplate 尊重用户提供的显示名并复用已验证 index', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(buildSignedIndex([configSetFixture]), [configSetFixture])
    const { service, configSetService } = createService(httpClient)

    await service.listTemplates('1.5.0')
    await service.importTemplate('demo-config-set', '1.5.0', { name: '我的云端配置' })

    expect(configSetService.createConfigSetFromContents).toHaveBeenCalledWith(
      'demo-tool',
      '我的云端配置',
      expect.any(Array)
    )
    expect(httpClient.getText).toHaveBeenCalledOnce()
  })

  it('拒绝篡改后的 index（签名不覆盖变更内容）', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(
      buildSignedIndex([configSetFixture], { templatesVersion: '9.9.9' }),
      [configSetFixture]
    )
    const { service } = createService(httpClient)

    await expect(service.listTemplates('1.5.0')).rejects.toThrow('signature 校验失败')
  })

  it('拒绝未受信任 keyId', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(
      buildSignedIndex([configSetFixture], { keyId: 'attacker-unknown-key' }),
      [configSetFixture]
    )
    const { service } = createService(httpClient)

    await expect(service.listTemplates('1.5.0')).rejects.toThrow('keyId 未受信任')
  })

  it('拒绝非 pinned HTTPS origin 的 indexUrl', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(buildSignedIndex([configSetFixture]), [configSetFixture])
    const { service } = createService(httpClient)
    const evilService = new TemplateCloudService({
      httpClient,
      indexUrl: 'https://evil.example/templates/v1/index.json',
      allowedOrigins: [ORIGIN],
      trustedPublicKeys,
      configSetService: {} as ToolConfigSetService,
      artifactTemplateService: {} as ArtifactTemplateService
    })

    await expect(evilService.listTemplates('1.5.0')).rejects.toThrow('不在 pinned HTTPS origin 中')
  })

  it('拒绝 minimumAppVersion 高于当前应用的 index', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(
      buildSignedIndex([configSetFixture], { minimumAppVersion: '99.0.0' }),
      [configSetFixture]
    )
    const { service } = createService(httpClient)

    await expect(service.listTemplates('1.5.0')).rejects.toThrow('要求 CCB >= 99.0.0')
  })

  it('拒绝被篡改的 item（SHA-256 不匹配）', async () => {
    const configSetFixture = createConfigSetFixture()
    const tampered = Buffer.from(configSetFixture.bytes)
    tampered[tampered.length - 3] ^= 0x01
    const httpClient: RegistryHttpClient = {
      getText: vi.fn(async () => buildSignedIndex([configSetFixture])),
      getBytes: vi.fn(async () => tampered)
    }
    const { service } = createService(httpClient)

    await expect(service.importTemplate('demo-config-set', '1.5.0')).rejects.toThrow('SHA-256 不匹配')
  })

  it('拒绝跨 origin 的 itemUrl', async () => {
    const configSetFixture = createConfigSetFixture()
    const evilMeta = {
      ...configSetFixture.meta,
      itemUrl: 'https://evil.example/items/demo-config-set.json'
    }
    const evilFixture: FixtureItem = { meta: evilMeta, bytes: configSetFixture.bytes }
    const httpClient = createHttpClient(buildSignedIndex([evilFixture]), [configSetFixture])
    const { service } = createService(httpClient)

    // index validator 在 list/import 之前即拒绝跨 origin itemUrl（fail-closed）
    await expect(service.importTemplate('demo-config-set', '1.5.0')).rejects.toThrow(
      'origin 不在应用 allowlist'
    )
  })

  it('拒绝与清单不一致的负载', async () => {
    const configSetFixture = createConfigSetFixture()
    const payload = JSON.parse(configSetFixture.bytes.toString('utf8')) as Record<string, unknown>
    payload.templateId = 'other-template'
    const mismatched = Buffer.from(JSON.stringify(payload), 'utf8')
    const mismatchedFixture: FixtureItem = {
      meta: { ...configSetFixture.meta, itemSha256: sha256Hex(mismatched), itemSize: mismatched.length },
      bytes: mismatched
    }
    const httpClient = createHttpClient(buildSignedIndex([mismatchedFixture]), [mismatchedFixture])
    const { service } = createService(httpClient)

    await expect(service.importTemplate('demo-config-set', '1.5.0')).rejects.toThrow('负载与清单不一致')
  })

  it('拒绝清单中不存在的 templateId', async () => {
    const configSetFixture = createConfigSetFixture()
    const httpClient = createHttpClient(buildSignedIndex([configSetFixture]), [configSetFixture])
    const { service } = createService(httpClient)

    await expect(service.importTemplate('no-such-template', '1.5.0')).rejects.toThrow('模板清单中不存在')
  })
})
