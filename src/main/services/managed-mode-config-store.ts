/**
 * 托管模式配置存储
 * @file src/main/services/managed-mode-config-store.ts
 * @description 封装 managed-mode-config.json 的读写与访问令牌生成。
 *
 * 从 ManagedModeService 拆分的第一个子模块（v1.4.0 架构解耦）。
 * ManagedModeService 通过本类委托配置持久化，对外 API（loadConfig/saveConfig/generateAccessToken）
 * 保持不变，仅内部实现委托，确保 26 个 IPC 调用点不受影响。
 *
 * 改进：配置写入改用原子写（temp + rename），避免写入中断损坏配置文件。
 */

import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import { writeJsonAtomic } from '../utils/atomic-json-writer'
import type { ManagedModeConfig } from '@shared/types/managed-mode'

export class ManagedModeConfigStore {
  /** 默认托管服务端口 */
  static readonly DEFAULT_PORT = 8487

  constructor(private readonly configPath: string) {}

  /**
   * 生成访问令牌（ccb-sk- 前缀 + 32 位十六进制随机串）
   */
  generateAccessToken(): string {
    return `ccb-sk-${randomBytes(16).toString('hex')}`
  }

  /**
   * 读取配置
   * @description 文件不存在时创建默认配置（含自动生成的 accessToken）；
   *              旧配置缺失 accessToken 时补全并持久化。
   * @returns 完整的 ManagedModeConfig（保证 accessToken 存在）
   */
  async load(): Promise<ManagedModeConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      const parsed = JSON.parse(data) as ManagedModeConfig
      // 兼容旧配置：accessToken 缺失则生成并保存
      if (!parsed.accessToken) {
        parsed.accessToken = this.generateAccessToken()
        await this.save(parsed)
      }
      return parsed
    } catch (error: unknown) {
      const errorCode = error instanceof Error && 'code' in error ? (error as { code?: unknown }).code : undefined
      if (errorCode === 'ENOENT') {
        // 配置文件不存在，创建默认配置
        const defaultConfig: ManagedModeConfig = {
          enabled: false,
          port: ManagedModeConfigStore.DEFAULT_PORT,
          currentProvider: '',
          providers: [],
          accessToken: this.generateAccessToken(),
          logging: { enabled: true, level: 'info' }
        }
        await this.save(defaultConfig)
        return defaultConfig
      }
      throw error
    }
  }

  /**
   * 原子保存配置（temp + rename，避免写入中断损坏）
   */
  async save(config: ManagedModeConfig): Promise<void> {
    await writeJsonAtomic(this.configPath, config, { indent: 2 })
  }
}
