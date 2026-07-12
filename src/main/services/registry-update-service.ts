/**
 * @file src/main/services/registry-update-service.ts
 * @description 负责规则库 manifest 检查与用户明确批准后的 bundle 下载、校验和安装。
 */

import axios from 'axios'
import type {
  ToolRegistryManifest,
  ToolRegistryUpdateStatus
} from '@shared/tool-registry'
import {
  compareStrictSemVer,
  REGISTRY_BUNDLE_MAX_BYTES,
  REGISTRY_MANIFEST_MAX_BYTES,
  validateToolRegistryManifest
} from '@shared/tool-registry-validator'
import { toolRegistryService, type ToolRegistryService } from './tool-registry-service'

/** 默认 registry manifest URL */
export const REGISTRY_MANIFEST_URL = 'https://dev.niansir.com/software/ccb/registry/manifest.json'
/** Registry 固定允许的 origin */
export const REGISTRY_ALLOWED_ORIGINS = ['https://dev.niansir.com'] as const

/** 受限文本 HTTP client contract */
export interface RegistryHttpClient {
  /**
   * 获取 UTF-8 文本，调用方提供最大响应大小
   * @param url 固定或已验证 URL
   * @param maxBytes 最大响应 bytes
   * @returns 响应文本
   */
  getText(url: string, maxBytes: number): Promise<string>
}

/**
 * Axios registry HTTP client
 * @description 禁止 redirect，限制 timeout/content length，避免重定向绕过 pinned origin。
 */
export class AxiosRegistryHttpClient implements RegistryHttpClient {
  /**
   * 获取受大小限制的文本
   * @param url 已验证 HTTPS URL
   * @param maxBytes 最大响应 bytes
   * @returns UTF-8 文本
   */
  public async getText(url: string, maxBytes: number): Promise<string> {
    const response = await axios.get<string>(url, {
      responseType: 'text',
      timeout: 15_000,
      maxRedirects: 0,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      transformResponse: [(data) => data],
      validateStatus: (status) => status === 200
    })
    if (typeof response.data !== 'string') {
      throw new Error('Registry 响应不是 UTF-8 文本')
    }
    if (Buffer.byteLength(response.data, 'utf8') > maxBytes) {
      throw new Error(`Registry 响应超过 ${maxBytes} bytes`)
    }
    return response.data
  }
}

/**
 * Registry 更新服务
 * @description check 只缓存 verified manifest；install 不接受 renderer 提供 URL/hash。
 */
export class RegistryUpdateService {
  private readonly registryService: ToolRegistryService
  private readonly httpClient: RegistryHttpClient
  private readonly manifestUrl: string
  private readonly allowedOrigins: string[]
  private verifiedManifest?: ToolRegistryManifest
  private checkPromise?: Promise<ToolRegistryUpdateStatus>
  private status: ToolRegistryUpdateStatus = {
    state: 'IDLE',
    embeddedVersion: '0.0.0'
  }

  constructor(options?: {
    registryService?: ToolRegistryService
    httpClient?: RegistryHttpClient
    manifestUrl?: string
    allowedOrigins?: string[]
  }) {
    this.registryService = options?.registryService ?? toolRegistryService
    this.httpClient = options?.httpClient ?? new AxiosRegistryHttpClient()
    this.manifestUrl = options?.manifestUrl ?? REGISTRY_MANIFEST_URL
    this.allowedOrigins = options?.allowedOrigins ?? [...REGISTRY_ALLOWED_ORIGINS]
  }

  /**
   * 获取当前更新状态，不触发网络请求
   * @returns 可序列化状态 snapshot
   */
  public getStatus(): ToolRegistryUpdateStatus {
    return { ...this.status }
  }

  /**
   * 检查远程 manifest
   * @description 只下载小型 manifest，不自动下载或安装 bundle。
   * @returns 更新状态
   */
  public checkForUpdates(currentAppVersion: string): Promise<ToolRegistryUpdateStatus> {
    if (!this.checkPromise) {
      this.checkPromise = this.performUpdateCheck(currentAppVersion).finally(() => {
        this.checkPromise = undefined
      })
    }
    return this.checkPromise
  }

  /**
   * 执行一次 manifest 检查
   * @param currentAppVersion 当前应用版本
   * @returns update 状态
   */
  private async performUpdateCheck(currentAppVersion: string): Promise<ToolRegistryUpdateStatus> {
    const snapshot = await this.registryService.getSnapshot()
    this.status = {
      state: 'CHECKING_MANIFEST',
      embeddedVersion: snapshot.embeddedVersion,
      installedVersion: snapshot.installedVersion
    }
    try {
      this.validatePinnedUrl(this.manifestUrl, 'Registry manifest URL')
      const rawManifest = await this.httpClient.getText(this.manifestUrl, REGISTRY_MANIFEST_MAX_BYTES)
      const validation = validateToolRegistryManifest(rawManifest, this.allowedOrigins)
      if (!validation.success || !validation.data) {
        throw new Error(`Registry manifest 无效: ${validation.errors.join('; ')}`)
      }
      if (compareStrictSemVer(validation.data.minimumAppVersion, currentAppVersion) > 0) {
        throw new Error(`Registry manifest 要求 CCB >= ${validation.data.minimumAppVersion}`)
      }
      this.verifiedManifest = validation.data
      const currentVersion = snapshot.installedVersion ?? snapshot.embeddedVersion
      const updateAvailable = compareStrictSemVer(validation.data.registryVersion, currentVersion) > 0
      this.status = {
        state: updateAvailable ? 'UPDATE_AVAILABLE' : 'UP_TO_DATE',
        embeddedVersion: snapshot.embeddedVersion,
        installedVersion: snapshot.installedVersion,
        availableVersion: validation.data.registryVersion,
        publishedAt: validation.data.publishedAt,
        releaseNotes: validation.data.releaseNotes,
        lastCheckedAt: new Date().toISOString()
      }
      return this.getStatus()
    } catch (error) {
      this.verifiedManifest = undefined
      this.status = {
        state: 'CHECK_FAILED',
        embeddedVersion: snapshot.embeddedVersion,
        installedVersion: snapshot.installedVersion,
        lastCheckedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      }
      return this.getStatus()
    }
  }

  /**
   * 安装最近一次检查到的可用更新
   * @description 必须由用户操作调用；没有 verified manifest 时拒绝。
   * @param currentAppVersion 当前应用版本
   * @returns 安装后的更新状态
   */
  public async installAvailableUpdate(currentAppVersion: string): Promise<ToolRegistryUpdateStatus> {
    const manifest = this.verifiedManifest
    if (!manifest || this.status.state !== 'UPDATE_AVAILABLE') {
      throw new Error('没有经过验证且等待用户确认的规则库更新')
    }
    this.status = { ...this.status, state: 'DOWNLOADING', error: undefined }
    try {
      this.validatePinnedUrl(manifest.bundleUrl, 'Registry bundle URL')
      const rawBundle = await this.httpClient.getText(manifest.bundleUrl, REGISTRY_BUNDLE_MAX_BYTES)
      this.status = { ...this.status, state: 'VERIFYING_HASH' }
      await this.registryService.installBundle({
        rawJson: rawBundle,
        expectedSha256: manifest.bundleSha256,
        expectedSize: manifest.bundleSize,
        currentAppVersion
      })
      const snapshot = await this.registryService.getSnapshot()
      this.status = {
        state: 'INSTALLED',
        embeddedVersion: snapshot.embeddedVersion,
        installedVersion: snapshot.installedVersion,
        availableVersion: manifest.registryVersion,
        publishedAt: manifest.publishedAt,
        releaseNotes: manifest.releaseNotes,
        lastCheckedAt: new Date().toISOString()
      }
      this.verifiedManifest = undefined
      return this.getStatus()
    } catch (error) {
      this.status = {
        ...this.status,
        state: 'CHECK_FAILED',
        error: error instanceof Error ? error.message : String(error)
      }
      throw error
    }
  }

  /**
   * 显式回滚规则库
   * @returns 回滚后的状态
   */
  public async rollback(): Promise<ToolRegistryUpdateStatus> {
    const registryVersion = await this.registryService.rollback()
    const snapshot = await this.registryService.getSnapshot()
    this.verifiedManifest = undefined
    this.status = {
      state: 'ROLLED_BACK',
      embeddedVersion: snapshot.embeddedVersion,
      installedVersion: registryVersion,
      lastCheckedAt: new Date().toISOString()
    }
    return this.getStatus()
  }

  /**
   * 校验 URL 使用 HTTPS 且命中 pinned origin
   * @param value URL 文本
   * @param label 错误标签
   */
  private validatePinnedUrl(value: string, label: string): void {
    const parsedUrl = new URL(value)
    if (parsedUrl.protocol !== 'https:' || !this.allowedOrigins.includes(parsedUrl.origin)) {
      throw new Error(`${label} 不在 pinned HTTPS origin 中`)
    }
  }
}

/** 默认 registry 更新服务单例 */
export const registryUpdateService = new RegistryUpdateService()
