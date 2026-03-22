/**
 * 配置编辑器辅助工具单元测试
 * @description 覆盖复制命名与编辑器语言判断，避免 JSON/Markdown 模式再次错配。
 */

import { describe, expect, it } from 'vitest'
import {
  appendSuffixBeforeExtension,
  generateUniqueDuplicateName,
  resolveConfigEditorLanguage
} from '../../../src/renderer/src/utils/config-editor-utils'

describe('config-editor-utils', () => {
  it('should detect markdown configs by type or file name', () => {
    expect(resolveConfigEditorLanguage({ type: 'user-preferences' })).toBe('markdown')
    expect(resolveConfigEditorLanguage({ name: 'CLAUDE.md' })).toBe('markdown')
    expect(resolveConfigEditorLanguage({ path: 'C:/temp/preferences.md' })).toBe('markdown')
  })

  it('should keep json as the default editor language', () => {
    expect(resolveConfigEditorLanguage({ type: 'claude-code', name: 'settings.json' })).toBe('json')
    expect(resolveConfigEditorLanguage({ name: 'custom-config' })).toBe('json')
  })

  it('should append duplicate suffix before known extensions', () => {
    expect(appendSuffixBeforeExtension('settings.json', '_copy')).toBe('settings_copy.json')
    expect(appendSuffixBeforeExtension('memory.md', '_副本')).toBe('memory_副本.md')
    expect(appendSuffixBeforeExtension('plain-name', '_副本')).toBe('plain-name_副本')
  })

  it('should generate incremented duplicate names when conflicts already exist', () => {
    expect(
      generateUniqueDuplicateName('settings.json', '_copy', [
        'settings_copy.json',
        'settings_copy2.json'
      ])
    ).toBe('settings_copy3.json')

    expect(
      generateUniqueDuplicateName('记忆.md', '_副本', [
        '记忆_副本.md',
        '记忆_副本2.md'
      ])
    ).toBe('记忆_副本3.md')
  })
})
