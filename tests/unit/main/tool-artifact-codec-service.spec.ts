/**
 * @file tests/unit/main/tool-artifact-codec-service.spec.ts
 * @description 验证内置 artifact codecs 的有效、无效与边界输入。
 */

import { describe, expect, it } from 'vitest'
import { ToolArtifactCodecService } from '../../../src/main/services/tool-artifact-codec-service'

describe('ToolArtifactCodecService', () => {
  const service = new ToolArtifactCodecService()

  it('应校验 JSON 与拒绝 malformed JSON', () => {
    expect(service.validate('JSON', '{"enabled":true}').valid).toBe(true)
    expect(service.validate('JSON', '{broken').valid).toBe(false)
  })

  it('应支持 string-aware JSONC comments 与 trailing commas', () => {
    const content = '{\n  // comment\n  "url": "https://example.com/*literal*/",\n  "items": [1, 2,],\n}'
    expect(service.validate('JSONC', content)).toEqual({ valid: true, format: 'JSONC', errors: [] })
    expect(service.validate('JSONC', '{ /* broken').errors[0]).toContain('未闭合')
  })

  it('应使用 JSON schema 限制 YAML tags', () => {
    expect(service.validate('YAML', 'enabled: true\nitems:\n  - one\n').valid).toBe(true)
    expect(service.validate('YAML', 'value: !!js/function function() {}').valid).toBe(false)
  })

  it('应接受普通文本并拒绝 NUL 与未实现 TOML validation', () => {
    expect(service.validate('MARKDOWN', '# Instructions\n').valid).toBe(true)
    expect(service.validate('TEXT', 'a\0b').valid).toBe(false)
    expect(service.validate('TOML', 'model = "gpt-5"').errors[0]).toContain('TOML')
  })

  it('应拒绝超过深度限制的 parsed configuration', () => {
    const content = `${'{"value":'.repeat(66)}null${'}'.repeat(66)}`
    expect(service.validate('JSON', content).errors[0]).toContain('levels')
  })
})
