/**
 * @file SettingsService artifact template migration tests
 * @description 验证 legacy global template 迁移、new override 优先级与 object validation。
 */

import { mkdtemp, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NEW_CONFIG_TEMPLATE } from '../../../src/shared/config-template'

const electronState = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataPath
  }
}))

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { SettingsService } from '../../../src/main/services/settings-service'

describe('SettingsService artifact template migration', () => {
  let tempDirectory = ''

  beforeEach(async () => {
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ccb-settings-'))
    electronState.userDataPath = tempDirectory
  })

  afterEach(async () => {
    await rm(tempDirectory, { recursive: true, force: true })
  })

  /** 写入最小 legacy settings fixture。 */
  async function writeLegacySettings(defaultConfigTemplate: string, overrides?: Record<string, string>): Promise<void> {
    await writeFile(path.join(tempDirectory, 'settings.json'), JSON.stringify({
      editor: {
        defaultConfigTemplate,
        ...(overrides ? { artifactTemplateOverrides: overrides } : {})
      }
    }), 'utf8')
  }

  it('应将旧自定义模板迁移为 Claude user-settings override', async () => {
    await writeLegacySettings('{"custom":true}')
    const settings = await new SettingsService(tempDirectory).loadSettings()

    expect(settings.editor.artifactTemplateOverrides['claude-code/user-settings'])
      .toContain('"custom": true')
    expect(settings.editor.defaultConfigTemplate).toBe(DEFAULT_NEW_CONFIG_TEMPLATE)
  })

  it('不应把旧内置默认值误判为 user override', async () => {
    await writeLegacySettings(DEFAULT_NEW_CONFIG_TEMPLATE)
    const settings = await new SettingsService(tempDirectory).loadSettings()

    expect(settings.editor.artifactTemplateOverrides).toEqual({})
  })

  it('已有 artifact override 应优先于 legacy field', async () => {
    await writeLegacySettings('{"legacy":true}', {
      'claude-code/user-settings': '{"new":true}'
    })
    const settings = await new SettingsService(tempDirectory).loadSettings()

    expect(settings.editor.artifactTemplateOverrides).toEqual({
      'claude-code/user-settings': '{"new":true}'
    })
  })

  it('应拒绝非 object override map', async () => {
    const service = new SettingsService(tempDirectory)

    await expect(service.saveSettings('editor', {
      editor: { artifactTemplateOverrides: [] }
    } as never)).rejects.toThrow('必须是对象')
  })

  it('加载损坏 override map 时应安全回退并保留可迁移 legacy template', async () => {
    await writeFile(path.join(tempDirectory, 'settings.json'), JSON.stringify({
      editor: {
        defaultConfigTemplate: '{"legacy":true}',
        artifactTemplateOverrides: []
      }
    }), 'utf8')

    const settings = await new SettingsService(tempDirectory).loadSettings()

    expect(settings.editor.artifactTemplateOverrides['claude-code/user-settings'])
      .toContain('"legacy": true')
  })
})
