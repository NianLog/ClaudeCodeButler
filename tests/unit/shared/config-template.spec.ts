/**
 * 新建配置模板工具单元测试
 * @description 验证默认模板的合法性、格式化行为和异常回退逻辑
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NEW_CONFIG_TEMPLATE,
  applyResolvedTemplateIfUntouched,
  createArtifactTemplateEntry,
  createArtifactTemplateKey,
  createTemplateLineDiff,
  migrateLegacyTemplateOverride,
  normalizeNewConfigTemplate,
  resolveArtifactTemplateOwnership,
  validateArtifactTemplateOverrides,
  validateNewConfigTemplate
} from '../../../src/shared/config-template'

describe('config-template helpers', () => {
  it('should keep the built-in default template valid', () => {
    expect(validateNewConfigTemplate(DEFAULT_NEW_CONFIG_TEMPLATE)).toBe(true)
  })

  it('should normalize valid json template content', () => {
    const normalizedTemplate = normalizeNewConfigTemplate('{"env":{"FOO":"bar"}}')
    expect(normalizedTemplate).toContain('"FOO": "bar"')
    expect(validateNewConfigTemplate(normalizedTemplate)).toBe(true)
  })

  it('should reject invalid json template content', () => {
    expect(validateNewConfigTemplate('{invalid json}')).toBe('模板必须是合法 JSON')
  })

  it('should fallback to built-in template when normalization input is invalid', () => {
    expect(normalizeNewConfigTemplate('{invalid json}')).toBe(DEFAULT_NEW_CONFIG_TEMPLATE)
  })

  it('should resolve artifact ownership without allowing registry to overwrite user override', () => {
    expect(resolveArtifactTemplateOwnership({
      embeddedTemplate: 'embedded',
      registryTemplate: 'registry',
      userOverride: 'user'
    })).toEqual({ content: 'user', source: 'USER_OVERRIDE' })
    expect(resolveArtifactTemplateOwnership({ embeddedTemplate: 'embedded', registryTemplate: 'registry' }))
      .toEqual({ content: 'registry', source: 'REGISTRY' })
  })

  it('should create stable keys and reject invalid identifiers', () => {
    expect(createArtifactTemplateKey('claude-code', 'user-settings')).toBe('claude-code/user-settings')
    expect(() => createArtifactTemplateKey('Claude', 'settings')).toThrow('lowercase kebab-case')
  })

  it('should build bounded line diffs', () => {
    expect(createTemplateLineDiff('a\nb', 'a\nc')).toEqual([
      { type: 'UNCHANGED', content: 'a' },
      { type: 'ADDED', content: 'c' },
      { type: 'REMOVED', content: 'b' }
    ])
    expect(() => createTemplateLineDiff('x\n'.repeat(1001), 'x')).toThrow('1000 行')
  })

  it('should create entries with a consistent effective source', () => {
    const entry = createArtifactTemplateEntry({
      key: 'claude-code/user-settings',
      toolId: 'claude-code',
      artifactId: 'user-settings',
      toolDisplayName: { 'zh-CN': 'Claude Code', 'en-US': 'Claude Code' },
      artifactDisplayName: { 'zh-CN': '用户设置', 'en-US': 'User Settings' },
      format: 'JSON',
      embeddedTemplate: '{}',
      registryTemplate: '{"registry":true}'
    })
    expect(entry.source).toBe('REGISTRY')
    expect(entry.effectiveTemplate).toBe('{"registry":true}')
  })

  it('should migrate only customized legacy templates without overwriting new overrides', () => {
    expect(migrateLegacyTemplateOverride(DEFAULT_NEW_CONFIG_TEMPLATE, {})).toEqual({})
    expect(migrateLegacyTemplateOverride('{"custom":true}', {}))
      .toHaveProperty('claude-code/user-settings')
    expect(migrateLegacyTemplateOverride('{"legacy":true}', {
      'claude-code/user-settings': '{"new":true}'
    })).toEqual({ 'claude-code/user-settings': '{"new":true}' })
  })

  it('should validate bounded override maps', () => {
    expect(validateArtifactTemplateOverrides({ 'claude-code/user-settings': '{}' })).toBe(true)
    expect(validateArtifactTemplateOverrides([])).toContain('必须为 object')
    expect(validateArtifactTemplateOverrides({ 'Claude/settings': '{}' })).toContain('无效')
    expect(validateArtifactTemplateOverrides({ 'claude-code/user-settings': 'a\0b' })).toContain('NUL')
  })

  it('should not overwrite a draft edited before async template resolution', () => {
    expect(applyResolvedTemplateIfUntouched('fallback', 'fallback', 'resolved')).toBe('resolved')
    expect(applyResolvedTemplateIfUntouched('user draft', 'fallback', 'resolved')).toBe('user draft')
  })
})
