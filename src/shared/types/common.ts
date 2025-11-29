/**
 * 通用类型定义
 */

/**
 * API 响应格式
 */
export interface ApiResponse<T = any> {
  /** 是否成功 */
  success: boolean
  /** 数据 */
  data?: T
  /** 错误信息 */
  error?: string
  /** 错误码 */
  code?: number
  /** 时间戳 */
  timestamp: number
}

/**
 * 分页参数
 */
export interface PaginationParams {
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  items: T[]
  /** 总数量 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
  /** 总页数 */
  totalPages: number
}

/**
 * 排序参数
 */
export interface SortParams {
  /** 排序字段 */
  field: string
  /** 排序方向 */
  direction: 'asc' | 'desc'
}

/**
 * 搜索参数
 */
export interface SearchParams {
  /** 搜索关键词 */
  keyword?: string
  /** 搜索字段 */
  fields?: string[]
  /** 排序 */
  sort?: SortParams
  /** 分页 */
  pagination?: PaginationParams
}

/**
 * 应用状态
 */
export type AppState = 'loading' | 'ready' | 'error' | 'idle'

/**
 * 主题类型
 */
export type ThemeType = 'light' | 'dark' | 'auto'

/**
 * 语言类型
 */
export type LanguageType = 'zh-CN' | 'en-US'

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日志条目
 */
export interface LogEntry {
  /** 日志级别 */
  level: LogLevel
  /** 日志消息 */
  message: string
  /** 时间戳 */
  timestamp: Date
  /** 额外数据 */
  data?: any
  /** 来源 */
  source?: string
}

/**
 * 通知类型
 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error'

/**
 * 通知消息
 */
export interface Notification {
  /** 通知ID */
  id: string
  /** 通知类型 */
  type: NotificationType
  /** 标题 */
  title: string
  /** 内容 */
  message?: string
  /** 持续时间（毫秒） */
  duration?: number
  /** 是否可关闭 */
  closable?: boolean
  /** 操作按钮 */
  actions?: NotificationAction[]
}

/**
 * 通知操作按钮
 */
export interface NotificationAction {
  /** 按钮文本 */
  label: string
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'danger'
  /** 点击回调 */
  onClick: () => void
}

/**
 * 键盘快捷键
 */
export interface Shortcut {
  /** 快捷键组合 */
  key: string
  /** 描述 */
  description: string
  /** 是否全局 */
  global?: boolean
}