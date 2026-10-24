/**
 * 配置编辑器辅助工具单元测试
 * @description 覆盖复制命名与编辑器语言判断，避免 JSON/Markdown 模式再次错配。
 */

import { describe, expect, it } from 'vitest'
import {
  appendSuffixBeforeExtension,
  formatEditorContent,
  generateUniqueDuplicateName,
  resolveConfigEditorLanguage
} from '../../../src/renderer/src/utils/config-editor-utils'

describe('config-editor-utils', () => {
  it('formats JSON whitespace without changing numeric and string literals', () => {
    const raw = String.raw`{"id":9007199254740993123,"exponent":1.230000000001e-99,"negative":-0,"escaped":"\u4e2d\/"}`
    const formatted = formatEditorContent(raw, 'json')
    expect(formatted).toContain('9007199254740993123')
    expect(formatted).toContain('1.230000000001e-99')
    expect(formatted).toContain('"negative": -0')
    expect(formatted).toContain(String.raw`"\u4e2d\/"`)
    expect(formatted).toContain('\n  "id": ')
  })

  it('preserves Windows line endings when formatting JSON', () => {
    const formatted = formatEditorContent('{\r\n"id":1,"nested":{"value":2}\r\n}', 'json')
    expect(formatted).toContain('\r\n  "id"')
    expect(formatted.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('keeps duplicate JSON keys instead of silently dropping input', () => {
    const formatted = formatEditorContent('{"key":1,"key":2}', 'json')
    expect(formatted.match(/"key"/g)).toHaveLength(2)
  })

  it('refuses malformed JSON before producing replacement content', () => {
    expect(() => formatEditorContent('{"id":', 'json')).toThrow(SyntaxError)
  })

  it('keeps Markdown frontmatter, blank lines and fenced code byte for byte', () => {
    const raw = '---\nname: sample\ndescription: |\n  First line\n  Second line\n---\n\n```sh\nprintf "one" \\\n  "two"\n```\n\n'
    expect(formatEditorContent(raw, 'markdown')).toBe(raw)
  })

  it('keeps unformatted TOML and other plaintext intact', () => {
    const raw = 'name = "reviewer"\r\n\r\n# Keep this comment\r\n'
    expect(formatEditorContent(raw, 'plaintext')).toBe(raw)
  })

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
