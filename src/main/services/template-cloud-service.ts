/**
 * @file src/main/services/template-cloud-service.ts
 * @description 云模板（v2 提案通道）服务：拉取并验证 templates/v1/index.json（Ed25519 canonical
 *              签名 + pinned origin + trust map，与规则库同一条信任链），按用户指令下载并校验
 *              内容寻址模板负载，导入为配置集（CONFIG_SET）或 artifact 默认模板 override（ARTIFACT）。
 *              不引入任何新写路径：导入分别复用 ToolConfigSetService 与 ArtifactTemplateService。
 */

import { createHash } from 'crypto'
import type {
  ArtifactTemplateEntry
} from '@shared/tool-registry'
import type {
  ConfigSetTemplatePayload,
  ArtifactTemplatePayload,
  TemplateCloudImportResult,
  TemplateCloudIndex,
  TemplateCloudItemMeta,
  TemplateCloudListResult,
  TemplateCloudPayload
} from '@shared/template-cloud'
import { TEMPLATE_ITEM_MAX_BYTES } from '@shared/template-cloud'
import {
  validateTemplateCloudIndex,
  templateIndexSignatureInput,
  validateArtifactTemplatePayload,
  validateConfigSetTemplatePayload
} from '@shared/template-cloud-validator'
import { compareStrictSemVer } from '@shared/tool-registry-validator'
import type { RegistryHttpClient } from './registry-update-service'
import { NetFetchRegistryHttpClient, REGISTRY_ALLOWED_ORIGINS, REGISTRY_TRUSTED_PUBLIC_KEYS } from './registry-update-service'
import { verifyRegistryBundleSignature, type RegistryTrustedPublicKeys } from './registry-signature-verifier'
import type { ToolConfigSetService } from './tool-config-set-service'
import { toolConfigSetService } from './tool-config-set-service'
import type { ArtifactTemplateService } from './artifact-template-service'
import { logger } from '../utils/logger'

/** 默认模板 index URL（v2 提案通道唯一可变入口） */
export const TEMPLATE_CLOUD_INDEX_URL = 'https://dev.niansir.com/software/ccb/templates/v1/index.json'

export interface TemplateCloudServiceOptions {
  httpClient?: RegistryHttpClient
  indexUrl?: string
  allowedOrigins?: string[]
  trustedPublicKeys?: RegistryTrustedPublicKeys
  configSetService?: ToolConfigSetService
  /** 必须显式注入，与 ipc-handlers 共享同一 settings 变更队列 */
  artifactTemplateService: ArtifactTemplateService
}

/**
 * 以共享的 ArtifactTemplateService 实例构造云模板服务。
 * @param artifactTemplates 主进程既有 artifact 模板服务实例（共享 settings 原子写队列）
 * @param options 其余可选依赖
 */
export function createTemplateCloudService(
  artifactTemplates: ArtifactTemplateService,
  options: Omit<TemplateCloudServiceOptions, 'artifactTemplateService'> = {}
): TemplateCloudService {
  return new TemplateCloudService({ ...options, artifactTemplateService: artifactTemplates })
}

/**
 * 云模板服务。
 * @description 与 RegistryUpdateService 同一纪律：URL/hash 只在 main process 内部流转；
 *              renderer 仅提供 templateId 与可选显示名，不提供任何 URL 或内容。
 */
export class TemplateCloudService {
  private readonly httpClient: RegistryHttpClient
  private readonly indexUrl: string
  private readonly allowedOrigins: string[]
  private readonly trustedPublicKeys: RegistryTrustedPublicKeys
  private readonly configSetService: ToolConfigSetService
  private readonly artifactTemplates: ArtifactTemplateService
  private verifiedIndex?: TemplateCloudIndex
  private listPromise?: Promise<TemplateCloudListResult>

  constructor(options: TemplateCloudServiceOptions) {
    this.httpClient = options.httpClient ?? new NetFetchRegistryHttpClient()
    this.indexUrl = options.indexUrl ?? TEMPLATE_CLOUD_INDEX_URL
    this.allowedOrigins = options.allowedOrigins ?? [...REGISTRY_ALLOWED_ORIGINS]
    this.trustedPublicKeys = options.trustedPublicKeys ?? REGISTRY_TRUSTED_PUBLIC_KEYS
    this.configSetService = options.configSetService ?? toolConfigSetService
    this.artifactTemplates = options.artifactTemplateService
  }

  /**
   * 拉取并验证模板 index，返回可展示清单（并发去重）。
   * @param currentAppVersion 当前应用版本（minimumAppVersion 门槛）
   */
  public listTemplates(currentAppVersion: string): Promise<TemplateCloudListResult> {
    if (!this.listPromise) {
      this.listPromise = this.fetchAndVerifyIndex(currentAppVersion)
        .then((index) => ({
          templatesVersion: index.templatesVersion,
          publishedAt: index.publishedAt,
          items: index.items
        }))
        .finally(() => {
          this.listPromise = undefined
        })
    }
    return this.listPromise
  }

  /**
   * 下载并导入模板（CONFIG_SET → 本地配置集；ARTIFACT → 默认模板 user override）。
   * @param templateId 清单中的 stable template identifier
   * @param currentAppVersion 当前应用版本
   * @param options.name 可选配置集显示名（仅 CONFIG_SET；缺省用模板 displayName）
   */
  public async importTemplate(
    templateId: string,
    currentAppVersion: string,
    options?: { name?: string }
  ): Promise<TemplateCloudImportResult> {
    const index = this.verifiedIndex ?? (await this.fetchAndVerifyIndex(currentAppVersion))
    const meta = index.items.find((item) => item.templateId === templateId)
    if (!meta) {
      throw new Error(`模板清单中不存在: ${templateId}`)
    }
    const payload = await this.downloadVerifiedItem(meta)
    if (meta.kind === 'CONFIG_SET') {
      const configSetPayload = payload as ConfigSetTemplatePayload
      const name = options?.name ?? configSetPayload.displayName['zh-CN'] ?? Object.values(configSetPayload.displayName)[0]
      const configSet = await this.configSetService.createConfigSetFromContents(
        meta.toolId,
        name,
        configSetPayload.files.map((file) => ({ artifactId: file.artifactId, content: file.content }))
      )
      logger.info(`云模板已导入为配置集: ${templateId} -> ${meta.toolId}/${configSet.setId}`)
      return { kind: 'CONFIG_SET', configSet }
    }
    const artifactPayload = payload as ArtifactTemplatePayload
    const artifactTemplate: ArtifactTemplateEntry = await this.artifactTemplates.saveArtifactTemplateOverride(
      meta.toolId,
      artifactPayload.artifactId,
      artifactPayload.content
    )
    logger.info(`云模板已导入为默认模板 override: ${templateId} -> ${meta.toolId}/${artifactPayload.artifactId}`)
    return { kind: 'ARTIFACT', artifactTemplate }
  }

  /**
   * 拉取并完整验证 index：pinned URL → 尺寸 → 结构闭集 → minimumAppVersion → canonical 签名。
   */
  private async fetchAndVerifyIndex(currentAppVersion: string): Promise<TemplateCloudIndex> {
    this.validatePinnedUrl(this.indexUrl, '模板 index URL')
    const rawIndex = await this.httpClient.getText(this.indexUrl, 50 * 1024)
    const validation = validateTemplateCloudIndex(rawIndex, this.allowedOrigins)
    if (!validation.success || !validation.data) {
      this.verifiedIndex = undefined
      throw new Error(`模板 index 无效: ${validation.errors.join('; ')}`)
    }
    const index = validation.data
    if (compareStrictSemVer(index.minimumAppVersion, currentAppVersion) > 0) {
      this.verifiedIndex = undefined
      throw new Error(`模板 index 要求 CCB >= ${index.minimumAppVersion}`)
    }
    // 签名对象为「移除 signature 字段后的 canonical JSON」（与发布侧 canonicalJsonStable 一致）
    verifyRegistryBundleSignature(
      Buffer.from(templateIndexSignatureInput(index), 'utf8'),
      index.signature,
      index.keyId,
      this.trustedPublicKeys
    )
    this.verifiedIndex = index
    return index
  }

  /**
   * 下载并验证单个模板负载：pinned URL → 尺寸 → SHA-256 → 结构（按 kind）→ templateId/toolId 一致性。
   */
  private async downloadVerifiedItem(meta: TemplateCloudItemMeta): Promise<TemplateCloudPayload> {
    this.validatePinnedUrl(meta.itemUrl, `模板 ${meta.templateId} itemUrl`)
    const rawItem = await this.httpClient.getBytes(meta.itemUrl, TEMPLATE_ITEM_MAX_BYTES)
    if (rawItem.length !== meta.itemSize) {
      throw new Error(`模板 ${meta.templateId} 尺寸不匹配: index=${meta.itemSize}, actual=${rawItem.length}`)
    }
    const actualSha256 = createHash('sha256').update(rawItem).digest('hex')
    if (actualSha256 !== meta.itemSha256) {
      throw new Error(`模板 ${meta.templateId} SHA-256 不匹配`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(rawItem.toString('utf8'))
    } catch (error) {
      throw new Error(`模板 ${meta.templateId} JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    const validation = meta.kind === 'CONFIG_SET'
      ? validateConfigSetTemplatePayload(parsed)
      : validateArtifactTemplatePayload(parsed)
    if (!validation.success || !validation.data) {
      throw new Error(`模板 ${meta.templateId} 负载无效: ${validation.errors.join('; ')}`)
    }
    const payload = validation.data as TemplateCloudPayload
    if (payload.templateId !== meta.templateId || payload.toolId !== meta.toolId) {
      throw new Error(
        `模板 ${meta.templateId} 负载与清单不一致（payload=${payload.templateId}/${payload.toolId}）`
      )
    }
    return payload
  }

  /** 校验 URL 使用 HTTPS 且命中 pinned origin。 */
  private validatePinnedUrl(value: string, label: string): void {
    const parsedUrl = new URL(value)
    if (parsedUrl.protocol !== 'https:' || !this.allowedOrigins.includes(parsedUrl.origin)) {
      throw new Error(`${label} 不在 pinned HTTPS origin 中`)
    }
  }
}
