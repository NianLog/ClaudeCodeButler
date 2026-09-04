/**
 * @file src/shared/template-cloud-validator.ts
 * @description 云模板（v2 提案通道）结构校验：index 清单闭集/尺寸/枚举/pinned origin 与
 *              CONFIG_SET / ARTIFACT 负载闭集。与发布侧 web/software/ccb/registry/tools/common.cjs
 *              一一对应；客户端校验为权威，发布侧是忠实再实现。
 */

import { ARTIFACT_FORMATS } from './tool-registry'
import type { ArtifactFormat } from './tool-registry'
import type {
  ArtifactTemplatePayload,
  ConfigSetTemplateFile,
  ConfigSetTemplatePayload,
  TemplateCloudIndex,
  TemplateCloudItemMeta,
  TemplateCloudKind,
  TemplateValidationResult
} from './template-cloud'
import {
  CONFIG_SET_TEMPLATE_MAX_FILES,
  TEMPLATE_CLOUD_KINDS,
  TEMPLATE_INDEX_MAX_BYTES,
  TEMPLATE_INDEX_MAX_ITEMS,
  TEMPLATE_ITEM_CONTENT_MAX_BYTES,
  TEMPLATE_ITEM_MAX_BYTES
} from './template-cloud'

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STRICT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ED25519_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/

/** index 顶层字段闭集 */
const INDEX_ALLOWED_KEYS = [
  'schemaVersion',
  'templatesVersion',
  'minimumAppVersion',
  'publishedAt',
  'items',
  'signatureAlgorithm',
  'keyId',
  'signature'
] as const

/** index items 元素字段闭集 */
const ITEM_META_ALLOWED_KEYS = [
  'templateId',
  'kind',
  'toolId',
  'name',
  'description',
  'language',
  'author',
  'itemUrl',
  'itemSha256',
  'itemSize'
] as const

/** CONFIG_SET 负载顶层字段闭集 */
const CONFIG_SET_PAYLOAD_ALLOWED_KEYS = ['schemaVersion', 'templateId', 'toolId', 'displayName', 'files'] as const

/** CONFIG_SET files 元素字段闭集 */
const CONFIG_SET_FILE_ALLOWED_KEYS = ['artifactId', 'format', 'content'] as const

/** ARTIFACT 负载顶层字段闭集 */
const ARTIFACT_PAYLOAD_ALLOWED_KEYS = [
  'schemaVersion',
  'templateId',
  'toolId',
  'artifactId',
  'displayName',
  'content'
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** UTF-8 字节长度（renderer 沙箱无 Buffer，统一用 TextEncoder）。 */
function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function validateAllowedKeys(record: Record<string, unknown>, allowedKeys: readonly string[], path: string, errors: string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`${path}: 存在未知字段 "${key}"（闭集校验失败）`)
    }
  }
}

function readString(value: unknown, path: string, maxLength: number, errors: string[]): string {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path}: 必须为非空字符串`)
    return ''
  }
  if (value.length > maxLength) {
    errors.push(`${path}: 长度超过 ${maxLength}`)
    return ''
  }
  return value
}

function readStrictCoreSemVer(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== 'string' || !STRICT_SEMVER_PATTERN.test(value)) {
    errors.push(`${path}: 必须为 MAJOR.MINOR.PATCH 严格 SemVer`)
    return ''
  }
  return value
}

function readIdentifier(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    errors.push(`${path}: 必须为 kebab-case 标识`)
    return ''
  }
  return value
}

function readLocalizedText(value: unknown, path: string, errors: string[]): Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    errors.push(`${path}: 必须为非空 LocalizedText object`)
    return {}
  }
  const result: Record<string, string> = {}
  for (const [locale, text] of Object.entries(value)) {
    if (locale.length === 0 || locale.length > 16) {
      errors.push(`${path}.${locale}: locale 长度非法`)
      continue
    }
    if (typeof text !== 'string' || text.length === 0 || text.length > 128) {
      errors.push(`${path}.${locale}: 必须为 1-128 字符文本`)
      continue
    }
    result[locale] = text
  }
  return result
}

/** 校验 itemUrl 使用 HTTPS 且命中 pinned origin allowlist。 */
function readPinnedHttpsUrl(value: unknown, path: string, allowedOrigins: string[], errors: string[]): string {
  const url = readString(value, path, 2048, errors)
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      errors.push(`${path}: 必须使用 HTTPS`)
    }
    if (!allowedOrigins.includes(parsed.origin)) {
      errors.push(`${path}: origin 不在应用 allowlist`)
    }
  } catch {
    errors.push(`${path}: URL 格式无效`)
  }
  return url
}

/**
 * 解析并校验模板 index 清单 JSON。
 * @param rawJson UTF-8 index JSON 文本
 * @param allowedOrigins 应用固定允许的云资源 origins
 */
export function validateTemplateCloudIndex(
  rawJson: string,
  allowedOrigins: string[]
): TemplateValidationResult<TemplateCloudIndex> {
  if (getUtf8ByteLength(rawJson) > TEMPLATE_INDEX_MAX_BYTES) {
    return { success: false, errors: [`$: 模板 index 超过 ${TEMPLATE_INDEX_MAX_BYTES} bytes`] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    return { success: false, errors: [`$: JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`] }
  }
  if (!isRecord(parsed)) {
    return { success: false, errors: ['$: 模板 index 必须为 object'] }
  }
  const errors: string[] = []
  validateAllowedKeys(parsed, INDEX_ALLOWED_KEYS, '$', errors)
  if (parsed.schemaVersion !== 1) errors.push('$.schemaVersion: 当前只支持 1')
  if (parsed.signatureAlgorithm !== 'ED25519') errors.push('$.signatureAlgorithm: 当前只支持 ED25519')

  const publishedAt = readString(parsed.publishedAt, '$.publishedAt', 64, errors)
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) errors.push('$.publishedAt: 必须为 ISO-8601 时间')
  readIdentifier(parsed.keyId, '$.keyId', errors)
  const signature = readString(parsed.signature, '$.signature', 88, errors)
  if (signature && !ED25519_SIGNATURE_PATTERN.test(signature)) {
    errors.push('$.signature: 必须为 64-byte Ed25519 signature 的标准 Base64')
  }

  if (!Array.isArray(parsed.items) || parsed.items.length === 0 || parsed.items.length > TEMPLATE_INDEX_MAX_ITEMS) {
    return {
      success: false,
      errors: [...errors, `$.items: 必须为 1-${TEMPLATE_INDEX_MAX_ITEMS} 个元素的数组`]
    }
  }

  const seenTemplateIds = new Set<string>()
  const items: TemplateCloudItemMeta[] = []
  for (const [index, rawItem] of parsed.items.entries()) {
    const path = `$.items[${index}]`
    if (!isRecord(rawItem)) {
      errors.push(`${path}: 必须为 object`)
      continue
    }
    validateAllowedKeys(rawItem, ITEM_META_ALLOWED_KEYS, path, errors)
    const templateId = readIdentifier(rawItem.templateId, `${path}.templateId`, errors)
    if (templateId) {
      if (seenTemplateIds.has(templateId)) errors.push(`${path}.templateId: 重复的 templateId "${templateId}"`)
      seenTemplateIds.add(templateId)
    }
    if (typeof rawItem.kind !== 'string' || !TEMPLATE_CLOUD_KINDS.includes(rawItem.kind as TemplateCloudKind)) {
      errors.push(`${path}.kind: 必须为 CONFIG_SET 或 ARTIFACT`)
    }
    readIdentifier(rawItem.toolId, `${path}.toolId`, errors)
    readString(rawItem.name, `${path}.name`, 64, errors)
    readString(rawItem.description, `${path}.description`, 200, errors)
    readString(rawItem.language, `${path}.language`, 16, errors)
    readString(rawItem.author, `${path}.author`, 64, errors)
    readPinnedHttpsUrl(rawItem.itemUrl, `${path}.itemUrl`, allowedOrigins, errors)
    const itemSha256 = readString(rawItem.itemSha256, `${path}.itemSha256`, 64, errors)
    if (itemSha256 && !SHA256_PATTERN.test(itemSha256)) errors.push(`${path}.itemSha256: 必须为 lowercase SHA-256`)
    const itemSize = rawItem.itemSize
    if (!Number.isInteger(itemSize) || Number(itemSize) <= 0 || Number(itemSize) > TEMPLATE_ITEM_MAX_BYTES) {
      errors.push(`${path}.itemSize: 必须为 1-${TEMPLATE_ITEM_MAX_BYTES} 的整数`)
    }
    if (errors.length === 0 && isRecord(rawItem)) {
      items.push(rawItem as unknown as TemplateCloudItemMeta)
    }
  }

  const templatesVersion = readStrictCoreSemVer(parsed.templatesVersion, '$.templatesVersion', errors)
  const minimumAppVersion = readStrictCoreSemVer(parsed.minimumAppVersion, '$.minimumAppVersion', errors)

  if (errors.length > 0) return { success: false, errors }
  return {
    success: true,
    errors: [],
    data: {
      schemaVersion: 1,
      templatesVersion,
      minimumAppVersion,
      publishedAt,
      items,
      signatureAlgorithm: 'ED25519',
      keyId: String(parsed.keyId),
      signature
    }
  }
}

/**
 * 校验 CONFIG_SET 模板负载对象。
 * @param parsed 已解析负载
 */
export function validateConfigSetTemplatePayload(parsed: unknown): TemplateValidationResult<ConfigSetTemplatePayload> {
  const errors: string[] = []
  if (!isRecord(parsed)) return { success: false, errors: ['$: CONFIG_SET 负载必须为 object'] }
  validateAllowedKeys(parsed, CONFIG_SET_PAYLOAD_ALLOWED_KEYS, '$', errors)
  if (parsed.schemaVersion !== 1) errors.push('$.schemaVersion: 当前只支持 1')
  readIdentifier(parsed.templateId, '$.templateId', errors)
  readIdentifier(parsed.toolId, '$.toolId', errors)
  readLocalizedText(parsed.displayName, '$.displayName', errors)

  if (!Array.isArray(parsed.files) || parsed.files.length === 0 || parsed.files.length > CONFIG_SET_TEMPLATE_MAX_FILES) {
    return {
      success: false,
      errors: [...errors, `$.files: 必须为 1-${CONFIG_SET_TEMPLATE_MAX_FILES} 个元素的数组`]
    }
  }
  const seenArtifactIds = new Set<string>()
  const files: ConfigSetTemplateFile[] = []
  for (const [index, rawFile] of parsed.files.entries()) {
    const path = `$.files[${index}]`
    if (!isRecord(rawFile)) {
      errors.push(`${path}: 必须为 object`)
      continue
    }
    validateAllowedKeys(rawFile, CONFIG_SET_FILE_ALLOWED_KEYS, path, errors)
    const artifactId = readIdentifier(rawFile.artifactId, `${path}.artifactId`, errors)
    if (artifactId) {
      if (seenArtifactIds.has(artifactId)) errors.push(`${path}.artifactId: 重复的 artifactId "${artifactId}"`)
      seenArtifactIds.add(artifactId)
    }
    if (rawFile.format !== undefined && !ARTIFACT_FORMATS.includes(rawFile.format as ArtifactFormat)) {
      errors.push(`${path}.format: 未知 format "${String(rawFile.format)}"`)
    }
    const content = readString(rawFile.content, `${path}.content`, 4 * TEMPLATE_ITEM_CONTENT_MAX_BYTES, errors)
    if (content && getUtf8ByteLength(content) > TEMPLATE_ITEM_CONTENT_MAX_BYTES) {
      errors.push(`${path}.content: 超过 ${TEMPLATE_ITEM_CONTENT_MAX_BYTES} bytes`)
    }
    files.push({ artifactId, format: rawFile.format as ArtifactFormat | undefined, content })
  }
  if (errors.length > 0) return { success: false, errors }
  return {
    success: true,
    errors: [],
    data: parsed as unknown as ConfigSetTemplatePayload
  }
}

/**
 * 校验 ARTIFACT 模板负载对象。
 * @param parsed 已解析负载
 */
export function validateArtifactTemplatePayload(parsed: unknown): TemplateValidationResult<ArtifactTemplatePayload> {
  const errors: string[] = []
  if (!isRecord(parsed)) return { success: false, errors: ['$: ARTIFACT 负载必须为 object'] }
  validateAllowedKeys(parsed, ARTIFACT_PAYLOAD_ALLOWED_KEYS, '$', errors)
  if (parsed.schemaVersion !== 1) errors.push('$.schemaVersion: 当前只支持 1')
  readIdentifier(parsed.templateId, '$.templateId', errors)
  readIdentifier(parsed.toolId, '$.toolId', errors)
  readIdentifier(parsed.artifactId, '$.artifactId', errors)
  readLocalizedText(parsed.displayName, '$.displayName', errors)
  const content = readString(parsed.content, '$.content', 4 * TEMPLATE_ITEM_CONTENT_MAX_BYTES, errors)
  if (content && getUtf8ByteLength(content) > TEMPLATE_ITEM_CONTENT_MAX_BYTES) {
    errors.push(`$.content: 超过 ${TEMPLATE_ITEM_CONTENT_MAX_BYTES} bytes`)
  }
  if (errors.length > 0) return { success: false, errors }
  return { success: true, errors: [], data: parsed as unknown as ArtifactTemplatePayload }
}

/**
 * 稳定 canonical JSON（递归键排序 + 无空白）。
 * @description 与发布侧 canonicalJsonStable 逐字节一致，用于内嵌签名文档
 *              （模板 index）重建签名输入；两侧实现不允许漂移。
 */
export function canonicalJsonStable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJsonStable(item)).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonStable((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}

/** 从已解析 index 重建签名输入（移除 signature 字段后 canonical 化）。 */
export function templateIndexSignatureInput(index: TemplateCloudIndex): string {
  const withoutSignature: Partial<TemplateCloudIndex> = { ...index }
  delete withoutSignature.signature
  return canonicalJsonStable(withoutSignature)
}
