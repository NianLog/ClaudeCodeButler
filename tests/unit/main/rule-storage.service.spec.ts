/**
 * RuleStorageService 单元测试
 * @description 验证规则持久化的原子写入与失败抛错。
 *              覆盖 P0 修复：原实现 writeRules 的 catch 吞错会导致规则静默丢失，
 *              现已改为原子写（temp + rename）+ 失败抛出。
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMockState = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? electronMockState.userDataPath : process.cwd())
  }
}))

vi.mock('@shared/constants', () => ({
  PATHS: {
    USER_DATA: '.ccb',
    DATA_DIR: 'data',
    LOG_DIR: path.join(process.cwd(), '.vitest-logs'),
    BACKUP_DIR: 'backup',
    CONFIG_DIR: 'config',
    CACHE_DIR: 'cache',
    CLAUDE_CONFIGS_DIR: 'claude-configs'
  },
  CONFIG_FILES: {
    RULES_FILE: 'rules.json',
    SETTINGS: 'settings.json'
  }
}))

describe('RuleStorageService', () => {
  let tempHomeDir = ''
  let rulesFilePath: string

  /**
   * 为每个用例准备独立的临时 HOME 目录，并预创建 rules.json 所在目录与空文件，
   * 使构造函数的 ensureStorageFile 跳过初始化写入，避免与测试用例的写入相互干扰。
   */
  beforeEach(async () => {
    vi.resetModules()
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-rule-'))
    electronMockState.userDataPath = tempHomeDir
    vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir)
    rulesFilePath = path.join(tempHomeDir, '.ccb', 'data', 'rules.json')
    await fs.mkdir(path.dirname(rulesFilePath), { recursive: true })
    await fs.writeFile(rulesFilePath, '[]', 'utf8')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(tempHomeDir, { recursive: true, force: true })
  })

  it('writeRules 应原子写入并可通过 readRules 读回', async () => {
    const { ruleStorageService } = await import('../../../src/main/services/rule-storage.service')
    const rules = [{ id: 'r1', name: '测试规则', enabled: true }] as never

    await ruleStorageService.writeRules(rules)

    // 原子写：不应残留 .tmp 临时文件
    await expect(fs.access(`${rulesFilePath}.tmp`)).rejects.toThrow()
    // 文件内容正确
    const saved = JSON.parse(await fs.readFile(rulesFilePath, 'utf8'))
    expect(saved).toEqual(rules)
    // readRules 读回一致
    expect(await ruleStorageService.readRules()).toEqual(rules)
  })

  it('writeRules 失败应抛出错误，不再静默吞错（P0 修复验证）', async () => {
    const { ruleStorageService } = await import('../../../src/main/services/rule-storage.service')
    // rule-storage 内部使用 fs.promises.writeFile，与此处的 fs 同一引用
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left'))

    await expect(ruleStorageService.writeRules([])).rejects.toThrow('写入规则文件失败')
  })
})
