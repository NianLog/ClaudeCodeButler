/**
 * CCB托管模式代理服务 - 类型定义
 * @description 定义代理服务使用的所有TypeScript类型
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
  /** 超时时间(毫秒) */
  timeout?: number
  /** 最大重试次数 */
  maxRetries?: number
  /** 重试延迟(毫秒) */
  retryDelay?: number
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
  /** 代理服务端口,默认8487 */
  port: number
  /** 当前使用的服务商ID */
  currentProvider: string
  /** 服务商列表 */
  providers: ApiProvider[]
  /** 路由配置 */
  router?: RouterConfig
  /** 日志配置 */
  logging?: LoggingConfig
}

/**
 * Claude API消息格式
 */
export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | Array<{
    type: string
    [key: string]: any
  }>
}

/**
 * Claude API请求格式
 */
export interface ClaudeRequest {
  model: string
  messages: ClaudeMessage[]
  max_tokens: number
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  system?: string
  stop_sequences?: string[]
  [key: string]: any
}

/**
 * Claude API响应格式
 */
export interface ClaudeResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: string
    text?: string
    [key: string]: any
  }>
  model: string
  stop_reason: string | null
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
  /** 创建时间 */
  created_at?: string
}

/**
 * 流式响应数据块
 */
export interface StreamChunk {
  id?: string
  object?: string
  created?: number
  model?: string
  choices?: Array<{
    index: number
    delta: any
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/**
 * 转换器接口
 */
export interface Transformer {
  /** 转换器名称 */
  name: string
  /** 转换请求 */
  transformRequest: (request: ClaudeRequest, provider: ApiProvider) => Promise<any>
  /** 转换响应 */
  transformResponse: (response: any, provider: ApiProvider) => Promise<ClaudeResponse>
  /** 转换流式响应 */
  transformStreamChunk?: (chunk: string, provider: ApiProvider) => string | null
}

/**
 * 代理服务器配置
 */
export interface ProxyServerConfig {
  /** 监听端口 */
  port: number
  /** 监听主机 */
  host: string
  /** 托管模式配置 */
  managedMode: ManagedModeConfig
}
