/**
 * @file Claude workspace path facade regression tests
 * @description 验证 legacy compatibility、future workspace 目标与直接子文件安全边界。
 */

import path from 'path'
import { describe, expect, it } from 'vitest'
import { ClaudeWorkspacePathFacade } from '../../../src/main/utils/claude-workspace-path-facade'

describe('ClaudeWorkspacePathFacade', () => {
  const appDataDir = path.resolve('C:\\Users\\test-user\\.ccb')

  it('v1.5.0 默认应固定使用 legacy path 且不隐式迁移', () => {
    const facade = new ClaudeWorkspacePathFacade(appDataDir)
    const paths = facade.getPaths()

    expect(paths.mode).toBe('LEGACY_COMPAT')
    expect(paths.activePath).toBe(path.join(appDataDir, 'claude-configs'))
    expect(paths.workspacePath).toBe(path.join(appDataDir, 'workspaces', 'claude-code'))
  })

  it('只有显式 WORKSPACE_V2 mode 才能选择 future workspace', () => {
    const facade = new ClaudeWorkspacePathFacade(appDataDir, 'WORKSPACE_V2')

    expect(facade.getPaths().activePath).toBe(path.join(appDataDir, 'workspaces', 'claude-code'))
  })

  it('应只允许在 active workspace 内解析直接子文件', () => {
    const facade = new ClaudeWorkspacePathFacade(appDataDir)

    expect(facade.resolveActiveFile('settings.json')).toBe(path.join(appDataDir, 'claude-configs', 'settings.json'))
    expect(() => facade.resolveActiveFile('../settings.json')).toThrow('直接子文件名')
    expect(() => facade.resolveActiveFile('nested/settings.json')).toThrow('直接子文件名')
    expect(() => facade.resolveActiveFile('nested\\settings.json')).toThrow('直接子文件名')
    expect(() => facade.resolveActiveFile('settings\0.json')).toThrow('直接子文件名')
    expect(() => facade.resolveActiveFile('')).toThrow('直接子文件名')
  })

  it('应拒绝相对 app data 根路径', () => {
    expect(() => new ClaudeWorkspacePathFacade('.ccb')).toThrow('必须为绝对路径')
  })
})
