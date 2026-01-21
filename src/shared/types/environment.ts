/**
 * 环境检测相关类型定义
 */

/**
 * 环境检查状态枚举
 */
export enum EnvironmentCheckStatus {
  /** 正常 */
  OK = 'ok',
  /** 警告 */
  WARNING = 'warning',
  /** 错误 */
  ERROR = 'error',
  /** 未安装/未找到 */
  NOT_FOUND = 'not_found',
  /** 检查中 */
  CHECKING = 'checking'
}

/**
 * 预定义环境检查项类型
 */
export enum PredefinedCheckType {
  /** UV包管理器 */
  UV = 'uv',
  /** Claude Code */
  CLAUDE_CODE = 'claude-code',
  /** Node.js */
  NODEJS = 'nodejs',
  /** NPM */
  NPM = 'npm',
  /** NPX */
  NPX = 'npx'
}

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
  /** 安装路径 */
  path?: string
  /** 最后更新时间 */
  lastUpdated?: Date
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
