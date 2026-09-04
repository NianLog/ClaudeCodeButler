/**
 * @file tests/unit/scripts/template-channel-staging.spec.ts
 * @description 发布物联检：以客户端权威校验器复验 web/software/ccb/registry 下已构建的
 *              registry manifest.json + bundles/ 与 templates/v1/index.json + items/，
 *              并断言发布侧与客户端 canonical JSON 实现逐字节一致（两侧不允许漂移）。
 *              web/ 目录为 git 黑名单本地资源，CI 中不存在时整组跳过。
 */

import { createRequire } from 'module'
import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  canonicalJsonStable,
  templateIndexSignatureInput,
  validateArtifactTemplatePayload,
  validateConfigSetTemplatePayload,
  validateTemplateCloudIndex
} from '../../../src/shared/template-cloud-validator'
import { REGISTRY_TRUSTED_PUBLIC_KEYS } from '../../../src/main/services/registry-update-service'
import { verifyRegistryBundleSignature } from '../../../src/main/services/registry-signature-verifier'
import {
  compareStrictSemVer,
  validateToolRegistryBundle,
  validateToolRegistryManifest
} from '../../../src/shared/tool-registry-validator'

const require = createRequire(import.meta.url)

const repoRelative = (relative: string): string =>
  join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', relative)

const templatesRoot = repoRelative(join('web', 'software', 'ccb', 'templates', 'v1'))
const indexPath = join(templatesRoot, 'index.json')
const hasStaging = existsSync(indexPath)

const registryRoot = repoRelative(join('web', 'software', 'ccb', 'registry'))
const registryManifestPath = join(registryRoot, 'manifest.json')
const hasRegistryStaging = existsSync(registryManifestPath)

/** 发布侧 canonical 实现仅在本地存在时加载（CI 无 web/ 目录）。 */
const serverCanonicalJsonStable = hasStaging
  ? (require('../../../web/software/ccb/registry/tools/common.cjs') as {
      canonicalJsonStable: (value: unknown) => string
    }).canonicalJsonStable
  : undefined

describe.skipIf(!hasRegistryStaging)('registry 发布物 staging 联检（web/ 构建产物存在）', () => {
  const rawManifest = hasRegistryStaging ? readFileSync(registryManifestPath, 'utf8') : ''

  it('已发布 manifest 通过客户端权威校验器（防发布端 schema 漂移）', () => {
    // 回归背景：发布端曾把 releaseNotes 生成为纯字符串，web 侧 verify 亦按字符串校验，
    // 真实客户端以 "$.releaseNotes: 必须为本地化文本对象" 拒绝。真实产物必须过客户端校验器。
    const validation = validateToolRegistryManifest(rawManifest, ['https://dev.niansir.com'])
    expect(validation.errors).toEqual([])
    expect(validation.success).toBe(true)
    expect(validation.data?.releaseNotes['zh-CN'].length).toBeGreaterThan(0)
    expect(validation.data?.releaseNotes['en-US'].length).toBeGreaterThan(0)
    expect(compareStrictSemVer(validation.data!.minimumAppVersion, '1.5.0')).toBeLessThanOrEqual(0)
  })

  it('manifest 指向的 bundle 存在、哈希/尺寸一致且通过客户端 bundle 校验器', () => {
    const manifest = validateToolRegistryManifest(rawManifest, ['https://dev.niansir.com']).data!
    const bundleName = manifest.bundleUrl.slice(manifest.bundleUrl.lastIndexOf('/') + 1)
    const bytes = readFileSync(join(registryRoot, 'bundles', bundleName))
    expect(bytes.length).toBe(manifest.bundleSize)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.bundleSha256)
    expect(bytes.length).toBeLessThanOrEqual(2 * 1024 * 1024)

    const bundle = validateToolRegistryBundle(bytes.toString('utf8'))
    expect(bundle.errors).toEqual([])
    expect(bundle.success).toBe(true)
    expect(bundle.data?.registryVersion).toBe(manifest.registryVersion)
  })

  it('manifest 签名经 production trust map 验证通过', () => {
    const manifest = validateToolRegistryManifest(rawManifest, ['https://dev.niansir.com']).data!
    const bundleName = manifest.bundleUrl.slice(manifest.bundleUrl.lastIndexOf('/') + 1)
    const bytes = readFileSync(join(registryRoot, 'bundles', bundleName))
    expect(() =>
      verifyRegistryBundleSignature(bytes, manifest.signature, manifest.keyId, REGISTRY_TRUSTED_PUBLIC_KEYS)
    ).not.toThrow()
    expect(REGISTRY_TRUSTED_PUBLIC_KEYS[manifest.keyId]).toMatch(/BEGIN PUBLIC KEY/)
  })
})

describe.skipIf(!hasStaging)('云模板发布物 staging 联检（web/ 构建产物存在）', () => {
  const rawIndex = hasStaging ? readFileSync(indexPath, 'utf8') : ''

  it('客户端 validator 接受已发布 index 且两侧 canonical 实现一致', () => {
    const validation = validateTemplateCloudIndex(rawIndex, ['https://dev.niansir.com'])
    expect(validation.errors).toEqual([])
    expect(validation.success).toBe(true)
    expect(validation.data?.items.length).toBeGreaterThan(0)

    const parsed = JSON.parse(rawIndex) as Record<string, unknown>
    const { signature: _signature, ...withoutSignature } = parsed
    const clientCanonical = canonicalJsonStable(withoutSignature)
    expect(clientCanonical).toBe(serverCanonicalJsonStable?.(withoutSignature))
    expect(templateIndexSignatureInput(validation.data!)).toBe(clientCanonical)
  })

  it('已发布 index 签名经 production trust map 验证通过且门槛满足', () => {
    const validation = validateTemplateCloudIndex(rawIndex, ['https://dev.niansir.com'])
    expect(validation.data).toBeDefined()
    const index = validation.data!
    expect(() =>
      verifyRegistryBundleSignature(
        Buffer.from(templateIndexSignatureInput(index), 'utf8'),
        index.signature,
        index.keyId,
        REGISTRY_TRUSTED_PUBLIC_KEYS
      )
    ).not.toThrow()
    expect(REGISTRY_TRUSTED_PUBLIC_KEYS[index.keyId]).toMatch(/BEGIN PUBLIC KEY/)
    expect(compareStrictSemVer(index.minimumAppVersion, '1.5.0')).toBeLessThanOrEqual(0)
  })

  it('逐 item 尺寸 / SHA-256 / 负载结构 / 清单一致性全部通过', () => {
    const validation = validateTemplateCloudIndex(rawIndex, ['https://dev.niansir.com'])
    const index = validation.data!

    for (const meta of index.items) {
      const fileName = meta.itemUrl.slice(meta.itemUrl.lastIndexOf('/') + 1)
      const bytes = readFileSync(join(templatesRoot, 'items', fileName))
      expect(bytes.length).toBe(meta.itemSize)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.itemSha256)

      const payload = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
      const result = meta.kind === 'CONFIG_SET'
        ? validateConfigSetTemplatePayload(payload)
        : validateArtifactTemplatePayload(payload)
      expect(result.errors).toEqual([])
      expect(payload.templateId).toBe(meta.templateId)
      expect(payload.toolId).toBe(meta.toolId)
    }
  })
})
