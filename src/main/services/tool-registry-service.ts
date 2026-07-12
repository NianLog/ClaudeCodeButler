/**
 * @file src/main/services/tool-registry-service.ts
 * @description 管理内置、已安装与 last-known-good 工具规则库，提供安全安装、合并与回滚。
 */

import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import builtinRegistryJson from '@shared/builtin-tool-registry.json'
import type { ToolDefinition, ToolRegistryBundle, ToolRegistrySnapshot } from '@shared/tool-registry'
import {
  compareStrictSemVer,
  REGISTRY_BUNDLE_MAX_BYTES,
  validateToolRegistryBundle
} from '@shared/tool-registry-validator'
import { writeJsonAtomic } from '../utils/atomic-json-writer'
import { pathManager } from '../utils/path-manager'
import { logger } from '../utils/logger'

/** Registry storage 所需路径 */
export interface ToolRegistryPaths {
  /** 当前已安装规则库 */
  installed: string
  /** 当前规则库 metadata */
  metadata: string
  /** 最近一次可用的旧规则库 */
  lastKnownGood: string
}

/** 已安装规则库 metadata */
export interface InstalledRegistryMetadata {
  /** 安装的 registry version */
  registryVersion: string
  /** 原始 bundle SHA-256 */
  sha256: string
  /** 原始 bundle bytes */
  size: number
  /** ISO-8601 安装时间 */
  installedAt: string
  /** 规则来源 */
  source: 'REMOTE' | 'ROLLBACK'
}

/** 安装 bundle 输入 */
export interface InstallRegistryBundleInput {
  /** 下载到的原始 JSON */
  rawJson: string
  /** manifest 声明的 SHA-256 */
  expectedSha256: string
  /** manifest 声明的 bytes */
  expectedSize: number
  /** 当前应用版本 */
  currentAppVersion: string
  /** 仅显式 rollback/debug 流程允许降级 */
  allowDowngrade?: boolean
}

/**
 * 计算 raw registry bundle 的 SHA-256
 * @param rawJson 原始 JSON 文本
 * @returns lowercase hex digest
 */
export function calculateRegistrySha256(rawJson: string): string {
  return createHash('sha256').update(rawJson, 'utf8').digest('hex')
}

/**
 * 合并 embedded 与 installed bundle
 * @description installed 中同 toolId 定义覆盖 embedded，其余 embedded tools 保留。
 * @param embedded 内置 bundle
 * @param installed 已安装 bundle
 * @returns 按 toolId 排序的 immutable-friendly tools 数组
 */
export function mergeToolRegistryBundles(
  embedded: ToolRegistryBundle,
  installed?: ToolRegistryBundle
): ToolDefinition[] {
  const definitions = new Map(embedded.tools.map((tool) => [tool.toolId, tool]))
  for (const tool of installed?.tools ?? []) {
    definitions.set(tool.toolId, tool)
  }
  return [...definitions.values()].sort((left, right) => left.toolId.localeCompare(right.toolId))
}

/**
 * 工具规则库服务
 * @description 所有远程 bundle 必须先经过 hash、size、schema 与 app compatibility 校验。
 */
export class ToolRegistryService {
  private readonly paths: ToolRegistryPaths
  private readonly embedded: ToolRegistryBundle

  constructor(paths?: Partial<ToolRegistryPaths>) {
    this.paths = {
      installed: paths?.installed ?? pathManager.installedRegistryFile,
      metadata: paths?.metadata ?? pathManager.installedRegistryMetadataFile,
      lastKnownGood: paths?.lastKnownGood ?? pathManager.lastKnownGoodRegistryFile
    }
    const embeddedValidation = validateToolRegistryBundle(JSON.stringify(builtinRegistryJson))
    if (!embeddedValidation.success || !embeddedValidation.data) {
      throw new Error(`内置工具规则库无效: ${embeddedValidation.errors.join('; ')}`)
    }
    this.embedded = embeddedValidation.data
  }

  /**
   * 获取当前 effective registry snapshot
   * @returns embedded 与 installed/last-known-good 合并结果
   */
  public async getSnapshot(): Promise<ToolRegistrySnapshot> {
    const installedResult = await this.readBundle(this.paths.installed)
    if (installedResult.bundle) {
      return {
        embeddedVersion: this.embedded.registryVersion,
        installedVersion: installedResult.bundle.registryVersion,
        tools: mergeToolRegistryBundles(this.embedded, installedResult.bundle),
        recoveredFromLastKnownGood: false
      }
    }

    const fallbackResult = await this.readBundle(this.paths.lastKnownGood)
    if (fallbackResult.bundle) {
      logger.warn(`installed registry 无法加载，使用 last-known-good: ${installedResult.error || '文件不存在'}`)
      return {
        embeddedVersion: this.embedded.registryVersion,
        installedVersion: fallbackResult.bundle.registryVersion,
        tools: mergeToolRegistryBundles(this.embedded, fallbackResult.bundle),
        recoveredFromLastKnownGood: true
      }
    }

    return {
      embeddedVersion: this.embedded.registryVersion,
      tools: mergeToolRegistryBundles(this.embedded),
      recoveredFromLastKnownGood: false
    }
  }

  /**
   * 获取指定工具定义
   * @param toolId 稳定 tool identifier
   * @returns 工具定义，不存在时返回 undefined
   */
  public async getTool(toolId: string): Promise<ToolDefinition | undefined> {
    const snapshot = await this.getSnapshot()
    return snapshot.tools.find((tool) => tool.toolId === toolId)
  }

  /**
   * 安装用户明确批准下载的规则 bundle
   * @param input 原始 bundle 与 manifest integrity 信息
   * @returns 新安装的 registry version
   */
  public async installBundle(input: InstallRegistryBundleInput): Promise<string> {
    const actualSize = Buffer.byteLength(input.rawJson, 'utf8')
    if (actualSize !== input.expectedSize) {
      throw new Error(`规则库大小不匹配: expected=${input.expectedSize}, actual=${actualSize}`)
    }
    if (actualSize > REGISTRY_BUNDLE_MAX_BYTES) {
      throw new Error(`规则库超过最大限制: ${REGISTRY_BUNDLE_MAX_BYTES}`)
    }
    const actualSha256 = calculateRegistrySha256(input.rawJson)
    if (actualSha256 !== input.expectedSha256) {
      throw new Error('规则库 SHA-256 校验失败')
    }
    const validation = validateToolRegistryBundle(input.rawJson)
    if (!validation.success || !validation.data) {
      throw new Error(`规则库结构无效: ${validation.errors.join('; ')}`)
    }
    const bundle = validation.data
    if (compareStrictSemVer(bundle.minimumAppVersion, input.currentAppVersion) > 0) {
      throw new Error(`规则库要求 CCB >= ${bundle.minimumAppVersion}`)
    }
    const currentInstalled = await this.readBundle(this.paths.installed)
    if (
      currentInstalled.bundle &&
      compareStrictSemVer(bundle.registryVersion, currentInstalled.bundle.registryVersion) < 0 &&
      !input.allowDowngrade
    ) {
      throw new Error(`拒绝规则库降级: ${currentInstalled.bundle.registryVersion} -> ${bundle.registryVersion}`)
    }

    if (currentInstalled.bundle) {
      await writeJsonAtomic(this.paths.lastKnownGood, currentInstalled.bundle)
    }
    await writeJsonAtomic(this.paths.installed, bundle)
    const metadata: InstalledRegistryMetadata = {
      registryVersion: bundle.registryVersion,
      sha256: actualSha256,
      size: actualSize,
      installedAt: new Date().toISOString(),
      source: 'REMOTE'
    }
    await writeJsonAtomic(this.paths.metadata, metadata)
    return bundle.registryVersion
  }

  /**
   * 显式回滚到 last-known-good
   * @returns 回滚后的 registry version
   */
  public async rollback(): Promise<string> {
    const fallbackResult = await this.readBundle(this.paths.lastKnownGood)
    if (!fallbackResult.bundle) {
      throw new Error(`没有可用的 last-known-good 规则库: ${fallbackResult.error || '文件不存在'}`)
    }
    const fallbackRaw = JSON.stringify(fallbackResult.bundle, null, 2)
    await writeJsonAtomic(this.paths.installed, fallbackResult.bundle)
    const metadata: InstalledRegistryMetadata = {
      registryVersion: fallbackResult.bundle.registryVersion,
      sha256: calculateRegistrySha256(fallbackRaw),
      size: Buffer.byteLength(fallbackRaw, 'utf8'),
      installedAt: new Date().toISOString(),
      source: 'ROLLBACK'
    }
    await writeJsonAtomic(this.paths.metadata, metadata)
    return fallbackResult.bundle.registryVersion
  }

  /**
   * 读取并验证本地 bundle
   * @param filePath bundle 路径
   * @returns bundle 或诊断错误
   */
  private async readBundle(filePath: string): Promise<{ bundle?: ToolRegistryBundle; error?: string }> {
    try {
      const rawJson = await fs.readFile(filePath, 'utf8')
      const validation = validateToolRegistryBundle(rawJson)
      if (!validation.success || !validation.data) {
        return { error: validation.errors.join('; ') }
      }
      return { bundle: validation.data }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code === 'ENOENT') {
        return {}
      }
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/** 默认工具规则库服务单例 */
export const toolRegistryService = new ToolRegistryService()
