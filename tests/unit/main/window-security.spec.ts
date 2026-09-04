/**
 * @file Electron renderer navigation security tests
 * @description 验证同文档 hash 允许与跨 origin/protocol/path navigation 拒绝。
 */

import { describe, expect, it } from 'vitest'
import { isAllowedRendererNavigation } from '../../../src/main/utils/window-security'

describe('isAllowedRendererNavigation', () => {
  it('应允许同 document hash navigation', () => {
    expect(isAllowedRendererNavigation(
      'file:///C:/app/out/renderer/index.html',
      'file:///C:/app/out/renderer/index.html#settings'
    )).toBe(true)
  })

  it('应拒绝跨 origin、protocol 与 path navigation', () => {
    expect(isAllowedRendererNavigation('https://localhost:5175/', 'https://evil.example/')).toBe(false)
    expect(isAllowedRendererNavigation('file:///C:/app/index.html', 'https://example.com/')).toBe(false)
    expect(isAllowedRendererNavigation('file:///C:/app/index.html', 'file:///C:/app/other.html')).toBe(false)
  })

  it('应拒绝 malformed URL', () => {
    expect(isAllowedRendererNavigation('not-a-url', 'also-invalid')).toBe(false)
  })
})
