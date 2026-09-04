/**
 * @file tests/unit/main/artifact-template-service.spec.ts
 * @description 验证 artifact template catalog、ownership、registry lifecycle 与安全持久化。
 */

import { describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../../src/shared/types/settings'
import type { ToolDefinition, ToolRegistrySnapshot } from '../../../src/shared/tool-registry'
import { ArtifactTemplateService } from '../../../src/main/services/artifact-template-service'

/**
 * 创建包含 template artifact 与无 template artifact 的测试工具。
 * @param template user-settings defaultTemplate
 * @returns registry tool definition
 */
function createTool(template?: string): ToolDefinition {
  return {
    toolId: 'example-tool',
    definitionVersion: '1.0.0',
    displayName: { 'zh-CN': '示例工具', 'en-US': 'Example Tool' },
    platforms: ['WINDOWS'],
    detectors: [{ type: 'PATH_EXISTS', path: '${HOME}/.example' }],
    artifacts: [
      {
        artifactId: 'user-settings',
        displayName: { 'zh-CN': '用户设置', 'en-US': 'User Settings' },
        format: 'JSON',
        scope: 'USER',
        paths: { WINDOWS: ['${HOME}/.example/settings.json'] },
        capabilities: ['DISCOVER', 'READ', 'VALIDATE', 'EDIT'],
        handler: 'JSON_FILE_V1',
        ...(template === undefined ? {} : { defaultTemplate: template })
      },
      {
        artifactId: 'runtime-cache',
        displayName: { 'zh-CN': '运行缓存', 'en-US': 'Runtime Cache' },
        format: 'JSON',
        scope: 'USER',
        paths: { WINDOWS: ['${HOME}/.example/cache.json'] },
        capabilities: ['DISCOVER', 'READ'],
        handler: 'JSON_FILE_V1'
      }
    ]
  }
}

/**
 * 创建完整 settings fixture，确保 editor 保存不能丢失无关字段。
 * @returns mutable application settings
 */
function createSettings(): AppSettings {
  return {
    basic: { language: 'zh-CN', theme: 'light', autoSave: true, startupCheck: true },
    editor: {
      fontSize: 18,
      tabSize: 4,
      wordWrap: true,
      minimap: false,
      lineNumbers: true,
      defaultConfigTemplate: '{}',
      artifactTemplateOverrides: {}
    },
    notifications: {
      enabled: true,
      sound: false,
      configChanges: true,
      errors: true,
      startupCheckUpdate: true,
      silentUpdateCheck: true
    },
    advanced: { logLevel: 'info', cacheSize: 100, autoBackup: true, telemetry: false },
    window: {
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      rememberPosition: true
    },
    about: {}
  }
}

/** Artifact template service test harness。 */
interface ServiceHarness {
  service: ArtifactTemplateService
  settings: AppSettings
  setEffectiveTemplate(template?: string): void
  saveSettings: ReturnType<typeof vi.fn>
}

/**
 * 创建可动态模拟 registry update/rollback 的 service harness。
 * @returns service、settings 与 registry mutation helper
 */
function createHarness(): ServiceHarness {
  const embeddedTool = createTool('{"source":"embedded"}')
  let effectiveTool = embeddedTool
  const settings = createSettings()
  const saveSettings = vi.fn(async (_tab, data: Partial<AppSettings>) => {
    if (data.editor) settings.editor = { ...data.editor }
  })
  const service = new ArtifactTemplateService({
    registryService: {
      getSnapshot: async (): Promise<ToolRegistrySnapshot> => ({
        embeddedVersion: '1.0.0',
        installedVersion: effectiveTool === embeddedTool ? undefined : effectiveTool.definitionVersion,
        tools: [effectiveTool],
        recoveredFromLastKnownGood: false
      }),
      getEmbeddedTool: (toolId: string) => toolId === embeddedTool.toolId ? embeddedTool : undefined
    },
    settingsService: {
      loadSettings: async () => settings,
      saveSettings
    }
  })
  return {
    service,
    settings,
    saveSettings,
    setEffectiveTemplate: (template?: string) => {
      effectiveTool = createTool(template)
      effectiveTool.definitionVersion = template?.includes('rollback') ? '1.1.0' : '1.2.0'
    }
  }
}

describe('ArtifactTemplateService', () => {
  it('catalog 应只包含声明 defaultTemplate 的 artifact，并识别 embedded source', async () => {
    const { service } = createHarness()

    const catalog = await service.listArtifactTemplates()

    expect(catalog).toHaveLength(1)
    expect(catalog[0]).toMatchObject({
      key: 'example-tool/user-settings',
      source: 'EMBEDDED',
      effectiveTemplate: '{"source":"embedded"}',
      registryTemplate: undefined
    })
  })

  it('registry update 与 rollback 应动态改变非覆盖 template', async () => {
    const { service, setEffectiveTemplate } = createHarness()
    setEffectiveTemplate('{"source":"registry-v2"}')
    const updated = await service.resolveArtifactTemplate('example-tool', 'user-settings')

    setEffectiveTemplate('{"source":"rollback-v1"}')
    const rolledBack = await service.resolveArtifactTemplate('example-tool', 'user-settings')

    expect(updated).toMatchObject({ source: 'REGISTRY', effectiveTemplate: '{"source":"registry-v2"}' })
    expect(rolledBack).toMatchObject({ source: 'REGISTRY', effectiveTemplate: '{"source":"rollback-v1"}' })
  })

  it('registry update 不应覆盖 user override，并应保留其他 editor settings', async () => {
    const { service, settings, setEffectiveTemplate, saveSettings } = createHarness()
    await service.saveArtifactTemplateOverride(
      'example-tool',
      'user-settings',
      '{"source":"user"}'
    )
    setEffectiveTemplate('{"source":"registry-v3"}')

    const resolved = await service.resolveArtifactTemplate('example-tool', 'user-settings')

    expect(resolved).toMatchObject({ source: 'USER_OVERRIDE', effectiveTemplate: '{"source":"user"}' })
    expect(resolved.registryTemplate).toBe('{"source":"registry-v3"}')
    expect(settings.editor.fontSize).toBe(18)
    expect(settings.editor.tabSize).toBe(4)
    expect(saveSettings).toHaveBeenCalledWith('editor', expect.objectContaining({
      editor: expect.objectContaining({ fontSize: 18, tabSize: 4 })
    }))
  })

  it('应拒绝 invalid codec content、NUL 与超过 64 KiB 的 override', async () => {
    const { service, saveSettings } = createHarness()

    await expect(service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{broken'))
      .rejects.toThrow('Artifact template 校验失败')
    await expect(service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{"value":"\0"}'))
      .rejects.toThrow('不能包含 NUL')
    await expect(service.saveArtifactTemplateOverride('example-tool', 'user-settings', `"${'a'.repeat(64 * 1024)}"`))
      .rejects.toThrow('超过 65536 bytes')
    expect(saveSettings).not.toHaveBeenCalled()
  })

  it('应拒绝 effective registry 提供的 invalid defaultTemplate', async () => {
    const { service, setEffectiveTemplate } = createHarness()
    setEffectiveTemplate('{broken')

    await expect(service.listArtifactTemplates()).rejects.toThrow('Artifact template 校验失败')
  })

  it('应拒绝 unknown artifact 与未声明 defaultTemplate 的 artifact', async () => {
    const { service } = createHarness()

    await expect(service.resolveArtifactTemplate('example-tool', 'unknown'))
      .rejects.toThrow('不存在或未声明 defaultTemplate')
    await expect(service.resolveArtifactTemplate('example-tool', 'runtime-cache'))
      .rejects.toThrow('不存在或未声明 defaultTemplate')
  })

  it('删除 user override 后应恢复当前 registry template', async () => {
    const { service, settings, setEffectiveTemplate } = createHarness()
    setEffectiveTemplate('{"source":"registry-v2"}')
    await service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{"source":"user"}')

    const restored = await service.removeArtifactTemplateOverride('example-tool', 'user-settings')

    expect(restored).toMatchObject({ source: 'REGISTRY', effectiveTemplate: '{"source":"registry-v2"}' })
    expect(settings.editor.artifactTemplateOverrides).toEqual({})
  })

  it('registry 移除 defaultTemplate 后应保留 user override 并可回退 embedded', async () => {
    const { service, setEffectiveTemplate } = createHarness()
    await service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{"source":"user"}')
    setEffectiveTemplate(undefined)

    const withOverride = await service.resolveArtifactTemplate('example-tool', 'user-settings')
    expect(withOverride).toMatchObject({ source: 'USER_OVERRIDE', effectiveTemplate: '{"source":"user"}' })

    const fallback = await service.removeArtifactTemplateOverride('example-tool', 'user-settings')
    expect(fallback).toMatchObject({ source: 'EMBEDDED', effectiveTemplate: '{"source":"embedded"}' })
  })

  it('并发保存应串行化并保持最后一次调用的 override', async () => {
    const { service, settings } = createHarness()

    await Promise.all([
      service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{"order":1}'),
      service.saveArtifactTemplateOverride('example-tool', 'user-settings', '{"order":2}')
    ])

    expect(settings.editor.artifactTemplateOverrides['example-tool/user-settings']).toBe('{"order":2}')
  })
})
