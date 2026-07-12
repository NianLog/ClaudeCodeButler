/**
 * privilege-manager 单元测试
 * @description 验证跨平台提权命令保持参数边界，并正确转义解释器字符串。
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\test-user-data'),
    quit: vi.fn()
  },
  dialog: {
    showMessageBox: vi.fn()
  }
}))

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { buildElevationLaunchSpec } from '../../../src/main/utils/privilege-manager'

describe('buildElevationLaunchSpec（提权命令参数化）', () => {
  it('Windows 应将单引号作为 PowerShell 字面量转义', () => {
    const spec = buildElevationLaunchSpec(
      'win32',
      "C:\\Apps\\O'Brien\\ccb.exe",
      ["--profile=owner's", '; Remove-Item C:\\']
    )

    expect(spec.command).toBe('powershell.exe')
    expect(spec.args).toHaveLength(3)
    expect(spec.args[2]).toContain("O''Brien")
    expect(spec.args[2]).toContain("owner''s")
    expect(spec.args[2]).toContain("'; Remove-Item C:\\'")
  })

  it('macOS 应同时保护 POSIX shell 与 AppleScript 字符串边界', () => {
    const spec = buildElevationLaunchSpec(
      'darwin',
      "/Applications/CCB's App/ccb",
      ['$(touch /tmp/injected)', 'argument with spaces']
    )

    expect(spec.command).toBe('osascript')
    expect(spec.args).toHaveLength(2)
    expect(spec.args[1]).toContain("'$(touch /tmp/injected)'")
    expect(spec.args[1]).toContain("'argument with spaces'")
    expect(spec.args[1]).toContain("CCB'\\\\''s App")
  })

  it('Linux 应直接传递 executable 与 args，不生成 shell command string', () => {
    const spec = buildElevationLaunchSpec(
      'linux',
      '/opt/ccb/ccb',
      ['--config', '/tmp/a;touch injected'],
      'pkexec'
    )

    expect(spec).toEqual({
      command: 'pkexec',
      args: ['/opt/ccb/ccb', '--config', '/tmp/a;touch injected']
    })
  })
})
