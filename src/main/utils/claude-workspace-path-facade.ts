/**
 * @file Claude workspace path compatibility facade
 * @description 集中管理 Claude Code 配置工作区路径，v1.5.0 保持 legacy 目录兼容且不移动用户数据。
 */

import path from 'path'

/** Claude workspace 路径模式枚举值。 */
export const CLAUDE_WORKSPACE_PATH_MODES = ['LEGACY_COMPAT', 'WORKSPACE_V2'] as const

/** Claude workspace 路径模式。 */
export type ClaudeWorkspacePathMode = typeof CLAUDE_WORKSPACE_PATH_MODES[number]

/** Claude workspace 路径 snapshot。 */
export interface ClaudeWorkspacePaths {
  /** 当前业务必须使用的 active path。 */
  activePath: string
  /** v1.4.x 与 v1.5.0 兼容目录。 */
  legacyPath: string
  /** 未来显式 migration 的目标目录。 */
  workspacePath: string
  /** 当前路径选择模式。 */
  mode: ClaudeWorkspacePathMode
}

/**
 * Claude workspace 路径兼容 facade。
 * @description 路径选择只由显式 mode 决定，不根据目录存在性隐式切换数据源。
 */
export class ClaudeWorkspacePathFacade {
  private readonly appDataDir: string
  private readonly mode: ClaudeWorkspacePathMode

  constructor(appDataDir: string, mode: ClaudeWorkspacePathMode = 'LEGACY_COMPAT') {
    if (!path.isAbsolute(appDataDir)) {
      throw new Error('Claude workspace appDataDir 必须为绝对路径')
    }
    this.appDataDir = path.resolve(appDataDir)
    this.mode = mode
  }

  /**
   * 获取 immutable-friendly workspace 路径 snapshot。
   */
  public getPaths(): ClaudeWorkspacePaths {
    const legacyPath = path.join(this.appDataDir, 'claude-configs')
    const workspacePath = path.join(this.appDataDir, 'workspaces', 'claude-code')
    return {
      activePath: this.mode === 'WORKSPACE_V2' ? workspacePath : legacyPath,
      legacyPath,
      workspacePath,
      mode: this.mode
    }
  }

  /**
   * 在 active workspace 内解析单个直接子文件。
   * @param fileName 不允许包含目录结构的文件名
   */
  public resolveActiveFile(fileName: string): string {
    if (
      !fileName ||
      fileName === '.' ||
      fileName === '..' ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('\0')
    ) {
      throw new Error('Claude workspace fileName 必须为直接子文件名')
    }
    return path.join(this.getPaths().activePath, fileName)
  }
}
