/**
 * 配置文件相关类型定义
 */

/**
 * 配置文件类型
 */
export type ConfigType = 
  | 'settings'
  | 'settings-local' 
  | 'claude-json'
  | 'claude-md'
  | 'claude-code'
  | 'mcp-config'
  | 'project-config'
  | 'user-preferences'
  | 'custom'

/**
 * 配置文件类型常量
 */
export const CONFIG_TYPES = {
  SETTINGS: 'settings' as const,
  SETTINGS_LOCAL: 'settings-local' as const,
  CLAUDE_JSON: 'claude-json' as const,
  CLAUDE_MD: 'claude-md' as const,
  CUSTOM: 'custom' as const
} as const

/**
 * 配置文件信息
 */
export interface ConfigFile {
  /** 唯一标识 */
  id: string
  /** 文件名 */
  name: string
  /** 文件路径 */
  path: string
  /** 配置类型 */
  type: ConfigType
  /** 文件大小（字节） */
  size: number
  /** 最后修改时间 */
  lastModified: Date
  /** 配置内容 */
  content?: any
  /** 是否有效 */
  isValid?: boolean
  /** 错误信息 */
  errors?: string[]
  /** 是否正在编辑 */
  isEditing?: boolean
  /** 是否有未保存的更改 */
  hasUnsavedChanges?: boolean
  /** 描述信息 */
  description?: string
  /** 是否为系统配置文件 */
  isSystemConfig?: boolean
  /** 是否激活 */
  isActive?: boolean
  /** 是否正在使用中（Claude Code配置专用） */
  isInUse?: boolean
}

/**
 * 配置变更事件
 */
export interface ConfigChangeEvent {
  type: 'added' | 'changed' | 'deleted'
  path: string
  timestamp: Date
}

/**
 * 备份信息
 */
export interface BackupInfo {
  /** 备份ID */
  id: string
  /** 配置文件路径 */
  configPath: string
  /** 备份时间 */
  timestamp: Date
  /** 备份文件路径 */
  backupPath: string
  /** 备份大小 */
  size: number
  /** 备份描述 */
  description?: string
}

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  isValid: boolean
  /** 错误列表 */
  errors: ValidationError[]
  /** 警告列表 */
  warnings: ValidationWarning[]
  /** 验证后的数据 */
  data?: any
}

/**
 * 验证警告
 */
export interface ValidationWarning {
  path: string
  message: string
  code?: string
}

/**
 * JSON Schema 验证错误
 */
export interface ValidationError {
  path: string
  message: string
  code?: string
  value?: any
}