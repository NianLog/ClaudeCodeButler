/**
 * @file tests/unit/shared/tool-registry-validator.spec.ts
 * @description 验证 registry schema、边界限制与 fail-closed 安全策略。
 */

import { describe, expect, it } from 'vitest'
import builtinRegistryJson from '../../../src/shared/builtin-tool-registry.json'
import {
  compareStrictSemVer,
  REGISTRY_BUNDLE_MAX_BYTES,
  validateToolRegistryBundle,
  validateToolRegistryManifest
} from '../../../src/shared/tool-registry-validator'

describe('validateToolRegistryBundle', () => {
  it('应接受内置 Claude Code registry', () => {
    const result = validateToolRegistryBundle(JSON.stringify(builtinRegistryJson))

    expect(result.success).toBe(true)
    expect(result.data?.tools[0].toolId).toBe('claude-code')
    expect(result.data?.tools[0].artifacts).toHaveLength(3)
    expect(result.data?.tools[1].toolId).toBe('codex-cli')
    expect(result.data?.tools[1].artifacts[0].capabilities).toEqual(['DISCOVER', 'READ'])
  })

  it('应拒绝 command detector 参数与未知 capability', () => {
    const invalid = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const tools = invalid.tools as Array<Record<string, unknown>>
    tools[0].detectors = [{ type: 'COMMAND_EXISTS', command: 'claude --version; whoami' }]
    const artifacts = tools[0].artifacts as Array<Record<string, unknown>>
    artifacts[0].capabilities = ['READ', 'EXECUTE_REMOTE_SCRIPT']

    const result = validateToolRegistryBundle(JSON.stringify(invalid))

    expect(result.success).toBe(false)
    expect(result.errors.join('\n')).toContain('shell 字符')
    expect(result.errors.join('\n')).toContain('不支持的枚举值')
  })

  it('应拒绝 traversal、未知路径变量与额外字段', () => {
    const invalid = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const tools = invalid.tools as Array<Record<string, unknown>>
    tools[0].unexpectedScript = 'require("child_process")'
    const artifacts = tools[0].artifacts as Array<Record<string, unknown>>
    artifacts[0].paths = { WINDOWS: ['${UNKNOWN}/../secrets.json'] }

    const result = validateToolRegistryBundle(JSON.stringify(invalid))

    expect(result.success).toBe(false)
    expect(result.errors.join('\n')).toContain('不支持的字段')
    expect(result.errors.join('\n')).toContain('不允许的路径结构')
    expect(result.errors.join('\n')).toContain('不允许的路径变量')
  })

  it('应拒绝未使用受控根变量的绝对路径和 glob', () => {
    const invalid = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const tools = invalid.tools as Array<Record<string, unknown>>
    const artifacts = tools[0].artifacts as Array<Record<string, unknown>>
    artifacts[0].paths = { WINDOWS: ['C:\\Users\\Public\\*.json'] }

    const result = validateToolRegistryBundle(JSON.stringify(invalid))

    expect(result.success).toBe(false)
    expect(result.errors.join('\n')).toContain('必须从允许的根路径变量开始')
    expect(result.errors.join('\n')).toContain('不允许的路径字符')
  })

  it('应在解析前拒绝超大 bundle', () => {
    const result = validateToolRegistryBundle(' '.repeat(REGISTRY_BUNDLE_MAX_BYTES + 1))

    expect(result.success).toBe(false)
    expect(result.errors[0]).toContain('bundle 超过')
  })
})

describe('validateToolRegistryManifest', () => {
  it('应接受 pinned origin 的 HTTPS manifest', () => {
    const result = validateToolRegistryManifest(JSON.stringify({
      schemaVersion: 1,
      registryVersion: '1.1.0',
      minimumAppVersion: '1.5.0',
      publishedAt: '2026-07-12T00:00:00.000Z',
      bundleUrl: 'https://dev.niansir.com/software/ccb/registry/1.1.0.json',
      bundleSha256: 'a'.repeat(64),
      bundleSize: 1024,
      signatureAlgorithm: 'ED25519',
      keyId: 'ccb-registry-2026',
      signature: Buffer.alloc(64).toString('base64'),
      releaseNotes: { 'zh-CN': '更新', 'en-US': 'Update' }
    }), ['https://dev.niansir.com'])

    expect(result.success).toBe(true)
  })

  it('应拒绝 HTTP 与非 allowlist origin', () => {
    const result = validateToolRegistryManifest(JSON.stringify({
      schemaVersion: 1,
      registryVersion: '1.1.0',
      minimumAppVersion: '1.5.0',
      publishedAt: '2026-07-12T00:00:00.000Z',
      bundleUrl: 'http://evil.example/registry.json',
      bundleSha256: 'a'.repeat(64),
      bundleSize: 1024,
      signatureAlgorithm: 'ED25519',
      keyId: 'ccb-registry-2026',
      signature: Buffer.alloc(64).toString('base64'),
      releaseNotes: { 'zh-CN': '更新', 'en-US': 'Update' }
    }), ['https://dev.niansir.com'])

    expect(result.success).toBe(false)
    expect(result.errors.join('\n')).toContain('必须使用 HTTPS')
    expect(result.errors.join('\n')).toContain('origin 不在应用 allowlist')
  })

  it('应拒绝缺失或非 Ed25519 signature metadata', () => {
    const result = validateToolRegistryManifest(JSON.stringify({
      schemaVersion: 1,
      registryVersion: '1.1.0',
      minimumAppVersion: '1.5.0',
      publishedAt: '2026-07-12T00:00:00.000Z',
      bundleUrl: 'https://dev.niansir.com/software/ccb/registry/1.1.0.json',
      bundleSha256: 'a'.repeat(64),
      bundleSize: 1024,
      signatureAlgorithm: 'RSA',
      keyId: 'ccb-registry-2026',
      signature: 'not-base64',
      releaseNotes: { 'zh-CN': '更新', 'en-US': 'Update' }
    }), ['https://dev.niansir.com'])

    expect(result.success).toBe(false)
    expect(result.errors.join('\n')).toContain('当前只支持 ED25519')
    expect(result.errors.join('\n')).toContain('标准 Base64')
  })
})

describe('compareStrictSemVer', () => {
  it('应正确处理 core 与 prerelease precedence', () => {
    expect(compareStrictSemVer('1.5.0', '1.4.9')).toBe(1)
    expect(compareStrictSemVer('1.5.0-beta.1', '1.5.0')).toBe(-1)
    expect(compareStrictSemVer('1.5.0+build.2', '1.5.0+build.1')).toBe(0)
  })
})
