/**
 * 共享类型定义
 * 定义在主进程和渲染进程之间共享的类型
 */

/**
 * 配置类型
 */
export type ConfigType = 'claude-code' | 'mcp-config' | 'project-config' | 'user-preferences' | 'settings' | 'settings-local' | 'claude-json' | 'claude-md' | 'custom'

/**
 * 配置文件接口
 */
export interface ConfigFile {
  id: string
  name: string
  description?: string
  type: ConfigType
  path: string
  content?: Record<string, any>
  size?: number
  lastModified: Date
  isActive?: boolean
  isValid?: boolean
  createdAt?: Date
  updatedAt?: Date
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
 * 备份信息接口
 */
export interface BackupInfo {
  id: string
  configPath: string
  backupPath: string
  size: number
  timestamp: Date
  description?: string
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  data?: any
}

/**
 * 验证错误接口
 */
export interface ValidationError {
  path: string
  message: string
  code: string
}

/**
 * 验证警告接口
 */
export interface ValidationWarning {
  path: string
  message: string
  code: string
}

/**
 * 自动化规则接口
 */
export interface Rule {
  id: string
  name: string
  description?: string
  enabled: boolean
  isRunning: boolean
  trigger: {
    type: 'time' | 'file' | 'manual' | 'system'
    config: Record<string, any>
  }
  conditions: RuleCondition[]
  actions: RuleAction[]
  executionCount: number
  lastExecuted?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * 规则条件接口
 */
export interface RuleCondition {
  type: 'time' | 'file' | 'config' | 'system'
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than'
  field: string
  value: any
}

/**
 * 规则动作接口
 */
export interface RuleAction {
  type: 'switch_config' | 'backup_config' | 'notification' | 'log' | 'custom'
  config: Record<string, any>
}

/**
 * 规则执行记录接口
 */
export interface RuleExecution {
  id: string
  ruleId: string
  ruleName: string
  status: 'success' | 'failed' | 'running'
  startTime: Date
  endTime?: Date
  duration?: number
  error?: string
  result?: any
}

/**
 * API响应接口
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/**
 * 系统信息接口
 */
export interface SystemInfo {
  platform: string
  arch: string
  version: string
  nodeVersion: string
  electronVersion: string
}

/**
 * 应用设置接口
 */
export interface AppSettings {
  autoSaveInterval: number
  backupRetention: number
  enableNotifications: boolean
  startMinimized: boolean
  autoStart: boolean
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
}

/**
 * 通知接口
 */
export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: Date
  read: boolean
}

/**
 * 统计数据接口
 */
export interface Statistics {
  totalUsage: number
  tokenUsage: number
  activeConfigs: number
  executionCount: number
  errorRate: number
  avgResponseTime: number
  period: {
    start: Date
    end: Date
  }
}

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * 日志条目接口
 */
export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: Date
  module: string
  metadata?: Record<string, any>
}

/**
 * 文件监视事件接口
 */
export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  stats?: any
  timestamp: Date
}

/**
 * 任务调度信息接口
 */
export interface TaskSchedule {
  id: string
  name: string
  cron: string
  enabled: boolean
  nextRun?: Date
  lastRun?: Date
  taskType: string
  config: Record<string, any>
}