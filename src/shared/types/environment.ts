/**
 * 环境检测相关类型定义
 */

/**
 * 环境检查状态常量
 */
export const EnvironmentCheckStatus = {
  /** 正常 */
  OK: 'ok',
  /** 警告 */
  WARNING: 'warning',
  /** 错误 */
  ERROR: 'error',
  /** 未安装/未找到 */
  NOT_FOUND: 'not_found',
  /** 检查中 */
  CHECKING: 'checking'
} as const

/** 环境检查状态类型 */
export type EnvironmentCheckStatus = typeof EnvironmentCheckStatus[keyof typeof EnvironmentCheckStatus]

/**
 * 预定义环境检查项类型常量
 */
export const PredefinedCheckType = {
  /** UV包管理器 */
  UV: 'uv',
  /** Claude Code */
  CLAUDE_CODE: 'claude-code',
  /** Node.js */
  NODEJS: 'nodejs',
  /** NPM */
  NPM: 'npm',
  /** NPX */
  NPX: 'npx'
} as const

/** 预定义环境检查项类型 */
export type PredefinedCheckType = typeof PredefinedCheckType[keyof typeof PredefinedCheckType]

/**
 * 自定义环境检查项接口
 */
export interface CustomEnvironmentCheck {
  /** 唯一标识 */
  id: string
  /** 检查项名称 */
  name: string
  /** 检查命令（如 "java -version"） */
  command: string
  /** 输出格式模板（如 "java version \"{ver}\""） */
  outputTemplate: string
  /** 描述 */
  description?: string
  /** 图标（可选） */
  icon?: string
  /** 创建时间 */
  createdAt: Date
}

/**
 * 环境检查结果接口
 */
export interface EnvironmentCheckResult {
  /** 检查项ID */
  id: string
  /** 检查项名称 */
  name: string
  /** 检查项类型 */
  type: PredefinedCheckType | 'custom'
  /** 检查状态 */
  status: EnvironmentCheckStatus
  /** 版本信息（如果成功） */
  version?: string
  /** 完整输出（原始命令输出） */
  rawOutput?: string
  /** 错误信息（如果失败） */
  error?: string
  /** 最后检查时间 */
  lastCheckTime: Date
  /** 图标 */
  icon?: string
  /** 是否是自定义检查项 */
  isCustom: boolean
}

/**
 * Claude Code版本信息（从统计分析迁移）
 */
export interface ClaudeCodeVersionInfo {
  /** 版本号 */
  version: string
  /** 当前版本 */
  current?: string
  /** 最新版本 */
  latest?: string
  /** 是否有更新 */
  updateAvailable?: boolean
  /** 更新日志 */
  changelog?: string
  /** 安装路径 */
  path?: string
  /** 最后更新时间 */
  lastUpdated?: Date | string
}

/**
 * 自定义检查表单数据接口
 */
export interface CustomCheckFormData {
  /** 检查项名称 */
  name: string
  /** 检查命令 */
  command: string
  /** 输出格式模板 */
  outputTemplate: string
  /** 描述 */
  description?: string
  /** 图标 */
  icon?: string
}

/**
 * 环境检查汇总信息
 */
export interface EnvironmentCheckSummary {
  /** 总检查项数 */
  total: number
  /** 正常数 */
  ok: number
  /** 警告数 */
  warning: number
  /** 错误数 */
  error: number
  /** 未找到数 */
  notFound: number
}
