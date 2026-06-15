/**
 * ManagedModeConfigStore 单元测试
 * @description 验证托管模式配置存储的读取/默认创建/accessToken 补全/原子写入。
 *              覆盖 v2.0 架构解耦第一步：从 ManagedModeService 拆分 ConfigStore。
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ManagedModeConfigStore } from '../../../src/main/services/managed-mode-config-store'

describe('ManagedModeConfigStore', () => {
  let tempDir: string
  let configPath: string
  let store: ManagedModeConfigStore

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-config-store-'))
    configPath = path.join(tempDir, 'managed-mode-config.json')
    store = new ManagedModeConfigStore(configPath)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('load 文件不存在时应创建默认配置（含自动生成的 accessToken）', async () => {
    const config = await store.load()
    expect(config.enabled).toBe(false)
    expect(config.port).toBe(ManagedModeConfigStore.DEFAULT_PORT)
    expect(config.accessToken).toMatch(/^ccb-sk-/)
    expect(config.providers).toEqual([])
    // 默认配置已持久化到磁盘
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'))
    expect(saved.accessToken).toBe(config.accessToken)
  })

  it('load 文件存在但 accessToken 缺失时应补全并保存', async () => {
    // 预置一份无 accessToken 的旧配置
    await fs.writeFile(
      configPath,
      JSON.stringify({ enabled: true, port: 9999, currentProvider: 'p1', providers: [] }),
      'utf8'
    )
    const config = await store.load()
    expect(config.accessToken).toMatch(/^ccb-sk-/)
    expect(config.port).toBe(9999) // 保留原有字段
    expect(config.enabled).toBe(true)
    // 补全后的 accessToken 已持久化
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'))
    expect(saved.accessToken).toBe(config.accessToken)
  })

  it('save 应原子写入且不残留 .tmp 文件', async () => {
    const config = {
      enabled: true,
      port: 8487,
      currentProvider: 'p1',
      providers: [],
      accessToken: 'tok-123',
      logging: { enabled: true, level: 'info' as const }
    }
    await store.save(config as never)
    await expect(fs.access(`${configPath}.tmp`)).rejects.toThrow()
    const saved = JSON.parse(await fs.readFile(configPath, 'utf8'))
    expect(saved.currentProvider).toBe('p1')
    expect(saved.accessToken).toBe('tok-123')
  })

  it('generateAccessToken 应生成 ccb-sk- 前缀 + 32 位十六进制', () => {
    const token = store.generateAccessToken()
    expect(token).toMatch(/^ccb-sk-[0-9a-f]{32}$/)
    // 两次生成应不同（随机性）
    expect(store.generateAccessToken()).not.toBe(token)
  })
})
