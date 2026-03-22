/**
 * 新建配置模板工具单元测试
 * @description 验证默认模板的合法性、格式化行为和异常回退逻辑
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NEW_CONFIG_TEMPLATE,
  normalizeNewConfigTemplate,
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
})
