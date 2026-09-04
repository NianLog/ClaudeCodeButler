/**
 * @file Release preflight regression tests
 * @description 验证 production key blocker、preview warning 与 private key leak detection。
 */

import { createRequire } from 'module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { auditReleaseSnapshot } = require('../../../scripts/release-preflight.cjs') as {
  auditReleaseSnapshot: (input: Record<string, unknown>) => {
    version: string
    errors: string[]
    warnings: string[]
  }
}

/** 创建最小通过 release metadata 的 snapshot。 */
function createSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    packageJson: JSON.stringify({
      version: '1.5.0',
      description: 'Claude Code Butler - 多 AI Agent 配置管理工具',
      build: {
        appId: 'com.claudecode.butler',
        productName: 'CCB',
        portable: { artifactName: 'CCB-Portable-${version}.exe' },
        nsis: { artifactName: 'CCB-Setup-${version}.exe' }
      }
    }),
    packageLock: JSON.stringify({ version: '1.5.0', packages: { '': { version: '1.5.0' } } }),
    constantsSource: 'version: packageJson.version',
    registryUpdateSource: 'REGISTRY_TRUSTED_PUBLIC_KEYS = Object.freeze({})',
    windowManagerSource: [
      'nodeIntegration: false',
      'contextIsolation: true',
      'sandbox: true',
      'webSecurity: true',
      'allowRunningInsecureContent: false',
      'setWindowOpenHandler',
      "webContents.on('will-navigate'"
    ].join('\n'),
    readmeEn: '`1.5.0`',
    readmeZh: '`1.5.0`',
    changelog: '[Unreleased] - 1.5.0',
    trackedFiles: [],
    allowPreviewRegistry: false,
    ...overrides
  }
}

describe('release preflight', () => {
  it('production mode 应将空 publisher trust map 视为 blocker', () => {
    const result = auditReleaseSnapshot(createSnapshot())

    expect(result.errors.join('\n')).toContain('production publisher public key')
  })

  it('preview mode 应只警告空 trust map', () => {
    const result = auditReleaseSnapshot(createSnapshot({ allowPreviewRegistry: true }))

    expect(result.errors).toEqual([])
    expect(result.warnings.join('\n')).toContain('production publisher public key')
  })

  it('production mode 不应将注释误判为 publisher trust key', () => {
    const result = auditReleaseSnapshot(createSnapshot({
      registryUpdateSource: 'REGISTRY_TRUSTED_PUBLIC_KEYS = Object.freeze({ /* inject before release */ })'
    }))

    expect(result.errors.join('\n')).toContain('production publisher public key')
  })

  it('production mode 应拒绝 rehearsal 命名的 publisher keyId', () => {
    const result = auditReleaseSnapshot(createSnapshot({
      registryUpdateSource: "REGISTRY_TRUSTED_PUBLIC_KEYS = Object.freeze({ 'ccb-rehearsal-2026-09': pem })"
    }))

    expect(result.errors.join('\n')).toContain('非 production 命名 keyId')
    expect(result.errors.join('\n')).toContain('ccb-rehearsal-2026-09')
  })

  it('preview mode 对 rehearsal 命名 keyId 只警告', () => {
    const result = auditReleaseSnapshot(createSnapshot({
      allowPreviewRegistry: true,
      registryUpdateSource: "REGISTRY_TRUSTED_PUBLIC_KEYS = Object.freeze({ 'ccb-rehearsal-2026-09': pem })"
    }))

    expect(result.errors).toEqual([])
    expect(result.warnings.join('\n')).toContain('ccb-rehearsal-2026-09')
  })

  it('production 命名 keyId 应通过 trust map 检查', () => {
    const result = auditReleaseSnapshot(createSnapshot({
      registryUpdateSource: "REGISTRY_TRUSTED_PUBLIC_KEYS = Object.freeze({ 'ccb-publisher-2026': pem })"
    }))

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it.each(['', 'ENCRYPTED ', 'RSA ', 'DSA ', 'EC ', 'OPENSSH '])(
    '应阻止 tracked private key marker prefix: %s',
    (prefix) => {
      // 分段构造 fixture，避免测试源码本身被 release preflight 误判为泄漏的 PEM。
      const marker = `-----BEGIN ${prefix}${'PRIVATE KEY'}-----`
      const result = auditReleaseSnapshot(createSnapshot({
        allowPreviewRegistry: true,
        trackedFiles: [{ path: 'secret.pem', content: `${marker}\nsecret` }]
      }))

      expect(result.errors.join('\n')).toContain('secret.pem')
    }
  )

  it('应阻止 Electron sandbox/navigation contract 回退', () => {
    const result = auditReleaseSnapshot(createSnapshot({
      allowPreviewRegistry: true,
      windowManagerSource: 'nodeIntegration: false'
    }))

    expect(result.errors.join('\n')).toContain('sandbox: true')
    expect(result.errors.join('\n')).toContain('setWindowOpenHandler')
  })
})
