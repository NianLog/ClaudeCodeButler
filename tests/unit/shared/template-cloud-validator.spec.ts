/**
 * @file tests/unit/shared/template-cloud-validator.spec.ts
 * @description 验证云模板（v2 通道）index 清单与负载的结构校验闭集、pinned origin、
 *              尺寸上限与 canonical JSON 签名输入重建。
 */

import { describe, expect, it } from 'vitest'
import {
  canonicalJsonStable,
  templateIndexSignatureInput,
  validateArtifactTemplatePayload,
  validateConfigSetTemplatePayload,
  validateTemplateCloudIndex
} from '../../../src/shared/template-cloud-validator'
import {
  CONFIG_SET_TEMPLATE_MAX_FILES,
  TEMPLATE_INDEX_MAX_BYTES,
  TEMPLATE_ITEM_CONTENT_MAX_BYTES,
  TEMPLATE_INDEX_MAX_ITEMS
} from '../../../src/shared/template-cloud'
import type { TemplateCloudIndex } from '../../../src/shared/template-cloud'

const ALLOWED_ORIGINS = ['https://templates.example']

/** 构造合法 item meta（可覆盖字段）。 */
function createItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    templateId: 'demo-template',
    kind: 'CONFIG_SET',
    toolId: 'demo-tool',
    name: 'Demo',
    description: 'demo template',
    language: 'zh-CN',
    author: 'ccb',
    itemUrl: 'https://templates.example/items/demo-template.json',
    itemSha256: 'a'.repeat(64),
    itemSize: 128,
    ...overrides
  }
}

/** 构造合法 index JSON 文本。 */
function createIndexText(overrides: Record<string, unknown> = {}, itemOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    templatesVersion: '1.0.0',
    minimumAppVersion: '1.5.0',
    publishedAt: '2026-09-04T00:00:00.000Z',
    items: [createItem(itemOverrides)],
    signatureAlgorithm: 'ED25519',
    keyId: 'test-publisher-2026',
    signature: `${'A'.repeat(86)}==`,
    ...overrides
  })
}

describe('validateTemplateCloudIndex', () => {
  it('合法 index 通过并返回规范化数据', () => {
    const result = validateTemplateCloudIndex(createIndexText(), ALLOWED_ORIGINS)
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.data?.templatesVersion).toBe('1.0.0')
    expect(result.data?.items).toHaveLength(1)
    expect(result.data?.items[0].kind).toBe('CONFIG_SET')
  })

  it('拒绝未知顶层字段与未知 item 字段（闭集）', () => {
    const extraTop = validateTemplateCloudIndex(
      createIndexText({ _comment: 'must be rejected' }),
      ALLOWED_ORIGINS
    )
    expect(extraTop.success).toBe(false)
    expect(extraTop.errors.join('; ')).toContain('未知字段')

    const extraItem = validateTemplateCloudIndex(
      createIndexText({}, { _extra: 1 }),
      ALLOWED_ORIGINS
    )
    expect(extraItem.success).toBe(false)
    expect(extraItem.errors.join('; ')).toContain('未知字段')
  })

  it('拒绝 HTTP 与跨 origin 的 itemUrl', () => {
    const http = validateTemplateCloudIndex(
      createIndexText({}, { itemUrl: 'http://templates.example/items/x.json' }),
      ALLOWED_ORIGINS
    )
    expect(http.success).toBe(false)
    expect(http.errors.join('; ')).toContain('HTTPS')

    const offOrigin = validateTemplateCloudIndex(
      createIndexText({}, { itemUrl: 'https://evil.example/items/x.json' }),
      ALLOWED_ORIGINS
    )
    expect(offOrigin.success).toBe(false)
    expect(offOrigin.errors.join('; ')).toContain('origin 不在应用 allowlist')
  })

  it('拒绝非法 signature 格式、非法 keyId 与重复 templateId', () => {
    const badSignature = validateTemplateCloudIndex(
      createIndexText({ signature: 'not-base64-signature!' }),
      ALLOWED_ORIGINS
    )
    expect(badSignature.success).toBe(false)
    expect(badSignature.errors.join('; ')).toContain('signature')

    const badKeyId = validateTemplateCloudIndex(createIndexText({ keyId: 'Invalid_Key' }), ALLOWED_ORIGINS)
    expect(badKeyId.success).toBe(false)
    expect(badKeyId.errors.join('; ')).toContain('kebab-case')

    const duplicated = validateTemplateCloudIndex(
      createIndexText({ items: [createItem(), createItem({ itemUrl: 'https://templates.example/items/2.json' })] }),
      ALLOWED_ORIGINS
    )
    expect(duplicated.success).toBe(false)
    expect(duplicated.errors.join('; ')).toContain('重复的 templateId')
  })

  it('拒绝空 items、超上限 items 与超尺寸 index 文本', () => {
    const empty = validateTemplateCloudIndex(createIndexText({ items: [] }), ALLOWED_ORIGINS)
    expect(empty.success).toBe(false)
    expect(empty.errors.join('; ')).toContain('1-200')

    const minimalItem = (index: number): Record<string, unknown> => ({
      templateId: `d${index}`,
      kind: 'CONFIG_SET',
      toolId: 't',
      name: 'x',
      description: 'x',
      language: 'x',
      author: 'x',
      itemUrl: 'https://templates.example/a.json',
      itemSha256: 'a'.repeat(64),
      itemSize: 1
    })
    const oversizedItems = validateTemplateCloudIndex(
      createIndexText({ items: Array.from({ length: TEMPLATE_INDEX_MAX_ITEMS + 1 }, (_, index) => minimalItem(index)) }),
      ALLOWED_ORIGINS
    )
    expect(oversizedItems.success).toBe(false)
    expect(oversizedItems.errors.join('; ')).toContain('1-200')

    const oversized = validateTemplateCloudIndex(
      createIndexText({}, { description: 'x'.repeat(TEMPLATE_INDEX_MAX_BYTES) }),
      ALLOWED_ORIGINS
    )
    expect(oversized.success).toBe(false)
    expect(oversized.errors.join('; ')).toContain('超过')
  })
})

describe('validateConfigSetTemplatePayload', () => {
  it('合法 CONFIG_SET 负载通过（format 可选）', () => {
    const result = validateConfigSetTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-template',
      toolId: 'demo-tool',
      displayName: { 'zh-CN': '云端工作集', 'en-US': 'Cloud Work Set' },
      files: [
        { artifactId: 'alpha-config', format: 'JSON', content: '{}\n' },
        { artifactId: 'beta-notes', content: '# notes\n' }
      ]
    })
    expect(result.success).toBe(true)
    expect(result.data?.files).toHaveLength(2)
  })

  it('拒绝未知字段、重复 artifactId 与超过上限的 files', () => {
    const unknownField = validateConfigSetTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-template',
      toolId: 'demo-tool',
      displayName: { 'zh-CN': '云端' },
      files: [{ artifactId: 'alpha-config', content: '{}', evil: true }]
    })
    expect(unknownField.success).toBe(false)
    expect(unknownField.errors.join('; ')).toContain('未知字段')

    const duplicated = validateConfigSetTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-template',
      toolId: 'demo-tool',
      displayName: { 'zh-CN': '云端' },
      files: [
        { artifactId: 'alpha-config', content: '{}' },
        { artifactId: 'alpha-config', content: '{}' }
      ]
    })
    expect(duplicated.success).toBe(false)
    expect(duplicated.errors.join('; ')).toContain('重复的 artifactId')

    const tooMany = validateConfigSetTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-template',
      toolId: 'demo-tool',
      displayName: { 'zh-CN': '云端' },
      files: Array.from({ length: CONFIG_SET_TEMPLATE_MAX_FILES + 1 }, (_, index) => ({
        artifactId: `file-${index}`,
        content: '{}'
      }))
    })
    expect(tooMany.success).toBe(false)
    expect(tooMany.errors.join('; ')).toContain(`1-${CONFIG_SET_TEMPLATE_MAX_FILES}`)
  })

  it('拒绝超过 1MiB 的单文件内容', () => {
    const result = validateConfigSetTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-template',
      toolId: 'demo-tool',
      displayName: { 'zh-CN': '云端' },
      files: [{ artifactId: 'alpha-config', content: 'x'.repeat(TEMPLATE_ITEM_CONTENT_MAX_BYTES + 1) }]
    })
    expect(result.success).toBe(false)
    expect(result.errors.join('; ')).toContain('超过')
  })
})

describe('validateArtifactTemplatePayload', () => {
  it('合法 ARTIFACT 负载通过', () => {
    const result = validateArtifactTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-artifact',
      toolId: 'demo-tool',
      artifactId: 'instructions',
      displayName: { 'zh-CN': '启动模板' },
      content: '# template\n'
    })
    expect(result.success).toBe(true)
    expect(result.data?.artifactId).toBe('instructions')
  })

  it('拒绝缺失 content 与未知字段', () => {
    const missingContent = validateArtifactTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-artifact',
      toolId: 'demo-tool',
      artifactId: 'instructions',
      displayName: { 'zh-CN': '启动模板' }
    })
    expect(missingContent.success).toBe(false)
    expect(missingContent.errors.join('; ')).toContain('content')

    const unknownField = validateArtifactTemplatePayload({
      schemaVersion: 1,
      templateId: 'demo-artifact',
      toolId: 'demo-tool',
      artifactId: 'instructions',
      displayName: { 'zh-CN': '启动模板' },
      content: '# template\n',
      execute: 'rm -rf /'
    })
    expect(unknownField.success).toBe(false)
    expect(unknownField.errors.join('; ')).toContain('未知字段')
  })
})

describe('canonicalJsonStable 与签名输入重建', () => {
  it('递归键排序且无空白', () => {
    expect(canonicalJsonStable({ b: 1, a: { d: [3, 2], c: null } })).toBe('{"a":{"c":null,"d":[3,2]},"b":1}')
  })

  it('templateIndexSignatureInput 移除 signature 字段', () => {
    const index = JSON.parse(createIndexText()) as TemplateCloudIndex
    const { signature: _signature, ...withoutSignature } = index
    expect(templateIndexSignatureInput(index)).toBe(canonicalJsonStable(withoutSignature))
    expect(templateIndexSignatureInput(index)).not.toContain('signature":"')
  })
})
