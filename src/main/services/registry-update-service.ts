/**
 * @file src/main/services/registry-update-service.ts
 * @description 负责规则库 manifest 检查与用户明确批准后的 bundle 下载、校验和安装。
 */

import { net } from 'electron'
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
import {
  getTrustedRegistryPublicKey,
  verifyRegistryBundleSignature,
  type RegistryTrustedPublicKeys
} from './registry-signature-verifier'

/** 默认 registry manifest URL */
export const REGISTRY_MANIFEST_URL = 'https://dev.niansir.com/software/ccb/registry/manifest.json'
/** Registry 固定允许的 origin */
export const REGISTRY_ALLOWED_ORIGINS = ['https://dev.niansir.com'] as const
/**
 * Production registry publisher keys。
 * @description 正式 release 前必须由维护者注入其离线保管 private key 对应的 SPKI public key。
 */
export const REGISTRY_TRUSTED_PUBLIC_KEYS: RegistryTrustedPublicKeys = Object.freeze({
  // Rehearsal publisher key（2026-09-04 在开发机生成，仅用于 v1.5.0 发布链 rehearsal 与 preview 模式）。
  // 公共发布前必须轮换为离线 ceremony 生成的 production key；release preflight 拒绝 rehearsal 命名 keyId 进入 production。
  'ccb-rehearsal-2026-09': [
    '-----BEGIN PUBLIC KEY-----',
    'MCowBQYDK2VwAyEAyfS6bIe+NeVBUw+d2MzBenVO++Q+X5C2hMMMtahF+nw=',
    '-----END PUBLIC KEY-----'
  ].join('\n')
})

/** 受限文本 HTTP client contract */
export interface RegistryHttpClient {
  /**
   * 获取 UTF-8 文本，调用方提供最大响应大小
   * @param url 固定或已验证 URL
   * @param maxBytes 最大响应 bytes
   * @returns 响应文本
   */
  getText(url: string, maxBytes: number): Promise<string>
  /**
   * 获取原始 bytes，调用方提供最大响应大小。
   * @param url 固定或已验证 URL
   * @param maxBytes 最大响应 bytes
   */
  getBytes(url: string, maxBytes: number): Promise<Buffer>
}

/**
 * 流式读取 net.fetch 响应体，超过 maxBytes 立即中断下载。
 * @description 必须在读取过程中限制大小，避免把超大响应整段缓冲进内存后才拒绝。
 */
async function readNetFetchBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0)
  }
  const chunks: Buffer[] = []
  let total = 0
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`Registry 响应超过 ${maxBytes} bytes`)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/**
 * Electron net.fetch registry HTTP client
 * @description 禁止 redirect（redirect:'error'，重定向即失败，避免绕过 pinned origin），
 * 限制 timeout/content length；Chromium 网络栈遵循系统代理。
 */
export class NetFetchRegistryHttpClient implements RegistryHttpClient {
  /**
   * 获取受大小限制的文本
   * @param url 已验证 HTTPS URL
   * @param maxBytes 最大响应 bytes
   * @returns UTF-8 文本
   */
  public async getText(url: string, maxBytes: number): Promise<string> {
    const response = await net.fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
    if (response.status !== 200) {
      throw new Error(`Registry HTTP 状态异常: ${response.status}`)
    }
    if (response.redirected) {
      throw new Error('Registry 响应发生重定向，已拒绝')
    }
    const bytes = await readNetFetchBody(response.body, maxBytes)
    return bytes.toString('utf8')
  }

  /**
   * 获取受大小限制的原始 bytes，供 detached signature 与 hash 验证。
   * @param url 已验证 HTTPS URL
   * @param maxBytes 最大响应 bytes
   */
  public async getBytes(url: string, maxBytes: number): Promise<Buffer> {
    const response = await net.fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000)
    })
    if (response.status !== 200) {
      throw new Error(`Registry HTTP 状态异常: ${response.status}`)
    }
    if (response.redirected) {
      throw new Error('Registry 响应发生重定向，已拒绝')
    }
    return readNetFetchBody(response.body, maxBytes)
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
  private readonly trustedPublicKeys: RegistryTrustedPublicKeys
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
    trustedPublicKeys?: RegistryTrustedPublicKeys
  }) {
    this.registryService = options?.registryService ?? toolRegistryService
    this.httpClient = options?.httpClient ?? new NetFetchRegistryHttpClient()
    this.manifestUrl = options?.manifestUrl ?? REGISTRY_MANIFEST_URL
    this.allowedOrigins = options?.allowedOrigins ?? [...REGISTRY_ALLOWED_ORIGINS]
    this.trustedPublicKeys = options?.trustedPublicKeys ?? REGISTRY_TRUSTED_PUBLIC_KEYS
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
      getTrustedRegistryPublicKey(validation.data.keyId, this.trustedPublicKeys)
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
      const rawBundle = await this.httpClient.getBytes(manifest.bundleUrl, REGISTRY_BUNDLE_MAX_BYTES)
      this.status = { ...this.status, state: 'VERIFYING_SIGNATURE' }
      verifyRegistryBundleSignature(
        rawBundle,
        manifest.signature,
        manifest.keyId,
        this.trustedPublicKeys
      )
      this.status = { ...this.status, state: 'VERIFYING_HASH' }
      await this.registryService.installBundle({
        rawBytes: rawBundle,
        expectedSha256: manifest.bundleSha256,
        expectedSize: manifest.bundleSize,
        expectedRegistryVersion: manifest.registryVersion,
        expectedMinimumAppVersion: manifest.minimumAppVersion,
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
   * @description 恢复 last-known-good；没有历史版本时由 registry service 回退内置基线，
   * 状态字段一律取回滚后的 fresh snapshot（embedded 回退时 installedVersion 为空）。
   * @returns 回滚后的状态
   */
  public async rollback(): Promise<ToolRegistryUpdateStatus> {
    await this.registryService.rollback()
    const snapshot = await this.registryService.getSnapshot()
    this.verifiedManifest = undefined
    this.status = {
      state: 'ROLLED_BACK',
      embeddedVersion: snapshot.embeddedVersion,
      installedVersion: snapshot.installedVersion,
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
