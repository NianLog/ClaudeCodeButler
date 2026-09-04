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
    expect(result.data?.tools[1].artifacts[0].capabilities).toEqual(
      ['DISCOVER', 'READ', 'VALIDATE', 'EDIT', 'BACKUP', 'RESTORE']
    )
  })

  it('应接受内置 registry 的全部工具与 editGroup 声明', () => {
    const result = validateToolRegistryBundle(JSON.stringify(builtinRegistryJson))

    expect(result.success).toBe(true)
    expect(result.data?.tools.map((tool) => tool.toolId)).toEqual(
      ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity']
    )
    const codex = result.data?.tools[1]
    expect(codex?.artifacts.map((artifact) => artifact.artifactId)).toEqual(
      ['user-config', 'auth', 'agents-instructions']
    )
    expect(codex?.artifacts[0].editGroup).toBe('core')
    expect(codex?.artifacts[1].editGroup).toBe('core')
    expect(codex?.artifacts[2].editGroup).toBeUndefined()
    expect(codex?.artifacts[0].handler).toBe('TOML_FILE_V1')
  })

  it('应拒绝非法 editGroup 标识与超员编辑分组', () => {
    const invalid = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const tools = invalid.tools as Array<Record<string, unknown>>
    const claudeArtifacts = tools[0].artifacts as Array<Record<string, unknown>>
    claudeArtifacts.forEach((artifact) => {
      artifact.editGroup = 'Invalid_Group'
    })

    const badIdentifier = validateToolRegistryBundle(JSON.stringify(invalid))
    expect(badIdentifier.success).toBe(false)
    expect(badIdentifier.errors.join('\n')).toContain('editGroup')

    const oversized = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const oversizedTools = oversized.tools as Array<Record<string, unknown>>
    const oversizedArtifacts = oversizedTools[0].artifacts as Array<Record<string, unknown>>
    oversizedArtifacts.forEach((artifact) => {
      artifact.editGroup = 'core'
    })
    const extraAlpha = structuredClone(oversizedArtifacts[0]) as Record<string, unknown>
    const extraBeta = structuredClone(oversizedArtifacts[0]) as Record<string, unknown>
    extraAlpha.artifactId = 'extra-alpha'
    extraBeta.artifactId = 'extra-beta'
    oversizedArtifacts.push(extraAlpha, extraBeta)
    const groupResult = validateToolRegistryBundle(JSON.stringify(oversized))
    expect(groupResult.success).toBe(false)
    expect(groupResult.errors.join('\n')).toContain('editGroup core 成员超过')
  })

  it('应接受内置 registry 的 configSet 声明并拒绝非法/超员配置集分组', () => {
    const result = validateToolRegistryBundle(JSON.stringify(builtinRegistryJson))

    expect(result.success).toBe(true)
    // claude-code 走遗留工作区配置通道，不应声明 configSet
    const claude = result.data?.tools[0]
    expect(claude?.artifacts.every((artifact) => artifact.configSet === undefined)).toBe(true)
    const codex = result.data?.tools[1]
    expect(codex?.artifacts[0].configSet).toBe('core')
    expect(codex?.artifacts[1].configSet).toBe('core')
    expect(codex?.artifacts[2].configSet).toBeUndefined()

    const invalid = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const tools = invalid.tools as Array<Record<string, unknown>>
    const codexArtifacts = tools[1].artifacts as Array<Record<string, unknown>>
    codexArtifacts[0].configSet = 'Invalid_Set'

    const badIdentifier = validateToolRegistryBundle(JSON.stringify(invalid))
    expect(badIdentifier.success).toBe(false)
    expect(badIdentifier.errors.join('\n')).toContain('configSet')

    const oversized = structuredClone(builtinRegistryJson) as unknown as Record<string, unknown>
    const oversizedTools = oversized.tools as Array<Record<string, unknown>>
    const oversizedArtifacts = oversizedTools[1].artifacts as Array<Record<string, unknown>>
    oversizedArtifacts.forEach((artifact) => {
      artifact.configSet = 'core'
    })
    const extraGamma = structuredClone(oversizedArtifacts[0]) as Record<string, unknown>
    const extraDelta = structuredClone(oversizedArtifacts[0]) as Record<string, unknown>
    extraGamma.artifactId = 'extra-gamma'
    extraDelta.artifactId = 'extra-delta'
    oversizedArtifacts.push(extraGamma, extraDelta)
    const groupResult = validateToolRegistryBundle(JSON.stringify(oversized))
    expect(groupResult.success).toBe(false)
    expect(groupResult.errors.join('\n')).toContain('configSet core 成员超过')
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

  it('应拒绝纯字符串或缺失的 releaseNotes（回归：发布端曾按字符串生成）', () => {
    const baseManifest = {
      schemaVersion: 1,
      registryVersion: '1.2.1',
      minimumAppVersion: '1.5.0',
      publishedAt: '2026-09-05T00:00:00.000Z',
      bundleUrl: 'https://dev.niansir.com/software/ccb/registry/bundles/1.2.1-abcd1234.json',
      bundleSha256: 'a'.repeat(64),
      bundleSize: 11239,
      signatureAlgorithm: 'ED25519',
      keyId: 'ccb-rehearsal-2026-09',
      signature: Buffer.alloc(64).toString('base64')
    }

    const asString = validateToolRegistryManifest(
      JSON.stringify({ ...baseManifest, releaseNotes: 'CCB registry 1.2.1' }),
      ['https://dev.niansir.com']
    )
    expect(asString.success).toBe(false)
    expect(asString.errors.join('\n')).toContain('$.releaseNotes: 必须为本地化文本对象')

    const missing = validateToolRegistryManifest(
      JSON.stringify({ ...baseManifest }),
      ['https://dev.niansir.com']
    )
    expect(missing.success).toBe(false)
    expect(missing.errors.join('\n')).toContain('$.releaseNotes: 必须为本地化文本对象')

    const emptyLocale = validateToolRegistryManifest(
      JSON.stringify({ ...baseManifest, releaseNotes: { 'zh-CN': '更新', 'en-US': '' } }),
      ['https://dev.niansir.com']
    )
    expect(emptyLocale.success).toBe(false)
    expect(emptyLocale.errors.join('\n')).toContain('$.releaseNotes.en-US: 必须为非空字符串')
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
