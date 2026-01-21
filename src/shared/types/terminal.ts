/**
 * 终端类型定义
 */

/**
 * 支持的终端类型（允许自定义字符串）
 */
export type TerminalType =
  | 'git-bash'
  | 'powershell'
  | 'cmd'
  | 'wsl'
  | 'auto'
  | (string & {})

/**
 * 终端配置
 */
export interface TerminalConfig {
  /** 终端类型 */
  type: TerminalType
  /** 终端名称 */
  name: string
  /** 终端路径（可执行文件路径） */
  path?: string
  /** 初始工作目录 */
  initialDirectory?: string
  /** 是否为默认终端 */
  isDefault?: boolean
  /** 终端参数 */
  args?: string[]
  /** 环境变量 */
  env?: Record<string, string>
}

/**
 * 终端执行配置
 * 为特定的环境检查或命令配置执行终端
 */
export interface TerminalExecutionConfig {
  /** 配置ID */
  id: string
  /** 配置名称 */
  name: string
  /** 使用的终端配置 */
  terminalType: TerminalType
  /** 工作目录（覆盖默认初始目录） */
  workingDirectory?: string
  /** 是否为该检查的默认配置 */
  isDefault?: boolean
}

/**
 * 终端管理设置
 */
export interface TerminalSettings {
  /** 全局默认终端 */
  defaultTerminal: TerminalType
  /** 所有已配置的终端 */
  terminals: TerminalConfig[]
  /** 环境检查执行配置（为每个检查项配置终端） */
  executionConfigs: TerminalExecutionConfig[]
}
