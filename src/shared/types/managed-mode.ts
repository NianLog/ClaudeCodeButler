/**
 * 托管模式相关类型定义
 * @description 定义托管模式在主进程和渲染进程之间共享的类型
 */

/**
 * API服务商类型
 */
export type ProviderType = 'anthropic' | 'openrouter' | 'deepseek' | 'gemini' | 'custom'

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/**
 * API服务商配置
 */
export interface ApiProvider {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 服务商类型 */
  type: ProviderType
  /** API基础URL */
  apiBaseUrl: string
  /** API密钥 */
  apiKey: string
  /** 可用模型列表 */
  models: string[]
  /** 使用的转换器 */
  transformer?: string
  /** 是否启用 */
  enabled: boolean
  /** 描述 */
  description?: string
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
}

/**
 * 路由配置
 */
export interface RouterConfig {
  /** 默认模型 */
  default?: string
  /** 后台任务模型 */
  background?: string
  /** 思考任务模型 */
  think?: string
  /** 长上下文模型 */
  longContext?: string
  /** 长上下文阈值 */
  longContextThreshold?: number
  /** Web搜索模型 */
  webSearch?: string
}

/**
 * 日志配置
 */
export interface LoggingConfig {
  /** 是否启用日志 */
  enabled: boolean
  /** 日志级别 */
  level: LogLevel
}

/**
 * 托管模式配置
 */
export interface ManagedModeConfig {
  /** 是否启用托管模式 */
  enabled: boolean
  /** 是否自动启动（仅当系统配置是托管配置时生效） */
  autoStart?: boolean
  /** 代理服务端口,默认8487 */
  port: number
  /** 当前使用的服务商ID */
  currentProvider: string
  /** 服务商列表 */
  providers: ApiProvider[]
  /** 托管模式访问令牌（自动生成） */
  accessToken: string
  /** 路由配置 */
  router?: RouterConfig
  /** 日志配置 */
  logging?: LoggingConfig
  /** 网络代理配置 */
  networkProxy?: {
    /** 是否启用网络代理 */
    enabled: boolean
    /** 代理主机 */
    host: string
    /** 代理端口 */
    port: number | string
  }
  /** settings.json配置数据（用于持久化用户在GUI/JSON编辑器中的修改） */
  configData?: any
}

/**
 * 当前Provider详细信息
 */
export interface CurrentProviderInfo {
  /** 服务商ID */
  id: string
  /** 服务商名称 */
  name: string
  /** 服务商类型 */
  type: ProviderType
  /** API基础URL */
  apiBaseUrl: string
  /** API密钥（格式化显示） */
  apiKey: string
  /** 原始API密钥（完整） */
  rawApiKey?: string
}

/**
 * 托管模式服务状态
 */
export interface ManagedModeStatus {
  /** 是否正在运行 */
  running: boolean
  /** 启用状态 */
  enabled?: boolean
  /** 监听端口 */
  port: number
  /** 进程ID */
  pid?: number
  /** 当前服务商ID */
  currentProvider?: string
  /** 当前服务商详细信息 */
  currentProviderInfo?: CurrentProviderInfo
  /** 托管代理访问令牌 */
  accessToken?: string
  /** 网络代理配置 */
  networkProxy?: {
    enabled: boolean
    host: string
    port: number | string
  }
  /** 启动时间 */
  startTime?: number | null
  /** 错误信息 */
  error?: string
}

/**
 * 环境变量命令类型
 */
export type EnvCommandType = 'windows-powershell' | 'windows-cmd' | 'unix-bash'

/**
 * 环境变量命令
 */
export interface EnvCommand {
  /** 命令类型 */
  type: EnvCommandType
  /** 命令内容 */
  command: string
  /** 显示标签 */
  label: string
}
