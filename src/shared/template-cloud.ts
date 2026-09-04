/**
 * @file src/shared/template-cloud.ts
 * @description 云模板（v2 提案通道）跨进程 domain contract：templates/v1/index.json 清单与
 *              CONFIG_SET / ARTIFACT 两类模板负载的强类型定义。签名链复用规则库信任模型
 *              （Ed25519 detached + pinned keyId → SPKI trust map），客户端校验 fail-closed。
 */

import type { ArtifactFormat, LocalizedText } from './tool-registry'
import type { RegistryValidationResult } from './tool-registry'
import type { ToolConfigSetSummary } from './tool-registry'
import type { ArtifactTemplateEntry } from './tool-registry'

/** 云模板类别枚举值 */
export const TEMPLATE_CLOUD_KINDS = ['CONFIG_SET', 'ARTIFACT'] as const

/** 云模板类别 */
export type TemplateCloudKind = typeof TEMPLATE_CLOUD_KINDS[number]

/** 模板 index 上限（与规则库 manifest 同量级） */
export const TEMPLATE_INDEX_MAX_BYTES = 50 * 1024

/** 单个模板负载上限 */
export const TEMPLATE_ITEM_MAX_BYTES = 2 * 1024 * 1024

/** 模板内单文件内容上限（与配置集单文件限制一致） */
export const TEMPLATE_ITEM_CONTENT_MAX_BYTES = 1024 * 1024

/** index items 数量上限 */
export const TEMPLATE_INDEX_MAX_ITEMS = 200

/** CONFIG_SET 模板文件数上限（与 registry configSet 分组成员上限一致） */
export const CONFIG_SET_TEMPLATE_MAX_FILES = 4

/** 模板 index 清单条目（唯一可变入口内嵌签名） */
export interface TemplateCloudItemMeta {
  templateId: string
  kind: TemplateCloudKind
  toolId: string
  name: string
  description: string
  language: string
  author: string
  itemUrl: string
  itemSha256: string
  itemSize: number
}

/** 模板 index 清单（签名对象为移除 signature 字段后的 canonical JSON） */
export interface TemplateCloudIndex {
  schemaVersion: 1
  templatesVersion: string
  minimumAppVersion: string
  publishedAt: string
  items: TemplateCloudItemMeta[]
  signatureAlgorithm: 'ED25519'
  keyId: string
  signature: string
}

/** CONFIG_SET 模板内单文件 */
export interface ConfigSetTemplateFile {
  artifactId: string
  format?: ArtifactFormat
  content: string
}

/** CONFIG_SET 模板负载：导入为本地配置集 */
export interface ConfigSetTemplatePayload {
  schemaVersion: 1
  templateId: string
  toolId: string
  displayName: LocalizedText
  files: ConfigSetTemplateFile[]
}

/** ARTIFACT 模板负载：导入为 artifact 默认模板 user override */
export interface ArtifactTemplatePayload {
  schemaVersion: 1
  templateId: string
  toolId: string
  artifactId: string
  displayName: LocalizedText
  content: string
}

/** 已验证模板负载的判别联合 */
export type TemplateCloudPayload = ConfigSetTemplatePayload | ArtifactTemplatePayload

/** listTemplates 返回给 renderer 的清单摘要 */
export interface TemplateCloudListResult {
  templatesVersion: string
  publishedAt: string
  items: TemplateCloudItemMeta[]
}

/** importTemplate 返回给 renderer 的导入结果 */
export type TemplateCloudImportResult =
  | { kind: 'CONFIG_SET'; configSet: ToolConfigSetSummary }
  | { kind: 'ARTIFACT'; artifactTemplate: ArtifactTemplateEntry }

/** 模板校验结果（复用 registry 校验结果形状） */
export type TemplateValidationResult<T> = RegistryValidationResult<T>
