/**
 * MCP (Model Context Protocol) 管理相关类型定义
 * @description 定义MCP服务器配置、项目配置和Claude配置文件结构
 */

/**
 * MCP传输类型
 * @description MCP服务器的通信传输协议类型
 */
export type MCPTransportType = 'stdio' | 'sse' | 'http'

/**
 * MCP服务器配置
 * @description 单个MCP服务器的完整配置信息
 */
export interface MCPServerConfig {
  /** 传输协议类型 */
  type?: MCPTransportType
  /** 执行命令 */
  command: string
  /** 命令参数数组 */
  args?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** 是否禁用此服务器 */
  disabled?: boolean
  /** 超时时间(毫秒) */
  timeout?: number
  /** 自动批准的工具名称列表 */
  autoApprove?: string[]
  /** MCP画廊来源ID */
  fromGalleryId?: string
}

/**
 * 项目MCP配置
 * @description 项目级别的MCP服务器配置和设置
 */
export interface ProjectMCPConfig {
  /** 允许的工具列表 */
  allowedTools?: string[]
  /** MCP上下文URI列表 */
  mcpContextUris?: string[]
  /** MCP服务器配置映射 */
  mcpServers?: Record<string, MCPServerConfig>
  /** 启用的mcp.json服务器列表 */
  enabledMcpjsonServers?: string[]
  /** 禁用的mcp.json服务器列表 */
  disabledMcpjsonServers?: string[]
  /** 是否接受信任对话框 */
  hasTrustDialogAccepted?: boolean
  /** 忽略模式列表 */
  ignorePatterns?: string[]
  /** 项目引导已查看次数 */
  projectOnboardingSeenCount?: number
  /** 是否批准外部包含 */
  hasClaudeMdExternalIncludesApproved?: boolean
  /** 是否显示外部包含警告 */
  hasClaudeMdExternalIncludesWarningShown?: boolean
  /** 示例文件列表 */
  exampleFiles?: string[]
  /** 上次网络搜索请求总数 */
  lastTotalWebSearchRequests?: number
  /** 禁用的MCP服务器列表 */
  disabledMcpServers?: string[]
  /** 是否完成项目引导 */
  hasCompletedProjectOnboarding?: boolean
  /** 上次成本 */
  lastCost?: number
  /** 上次API持续时间 */
  lastAPIDuration?: number
  /** 上次工具持续时间 */
  lastToolDuration?: number
  /** 上次总持续时间 */
  lastDuration?: number
  /** 上次添加的行数 */
  lastLinesAdded?: number
  /** 上次删除的行数 */
  lastLinesRemoved?: number
  /** 上次总输入tokens */
  lastTotalInputTokens?: number
  /** 上次总输出tokens */
  lastTotalOutputTokens?: number
  /** 上次总缓存创建输入tokens */
  lastTotalCacheCreationInputTokens?: number
  /** 上次总缓存读取输入tokens */
  lastTotalCacheReadInputTokens?: number
  /** 上次会话ID */
  lastSessionId?: string
}

/**
 * Claude配置文件完整结构
 * @description ~/.claude.json文件的完整结构定义
 */
export interface ClaudeConfig {
  /** 启动次数 */
  numStartups?: number
  /** 安装方式 */
  installMethod?: string
  /** 是否自动更新 */
  autoUpdates?: boolean
  /** 是否已查看任务提示 */
  hasSeenTasksHint?: boolean
  /** 提示历史记录 */
  tipsHistory?: Record<string, number>
  /** 内存使用次数 */
  memoryUsageCount?: number
  /** 提示队列使用次数 */
  promptQueueUseCount?: number
  /** 缓存的Statsig开关 */
  cachedStatsigGates?: Record<string, boolean>
  /** 缓存的动态配置 */
  cachedDynamicConfigs?: Record<string, any>
  /** 全局MCP服务器配置 */
  mcpServers?: Record<string, MCPServerConfig>
  /** 项目配置映射 (路径 -> 项目配置) */
  projects?: Record<string, ProjectMCPConfig>
  /** GitHub仓库路径映射 */
  githubRepoPaths?: Record<string, string[]>
  /** 首次启动时间 */
  firstStartTime?: string
  /** 用户ID */
  userID?: string
  /** 回退可用警告阈值 */
  fallbackAvailableWarningThreshold?: number
  /** 是否完成引导 */
  hasCompletedOnboarding?: boolean
  /** 上次引导版本 */
  lastOnboardingVersion?: string
  /** 是否有Opus计划默认 */
  hasOpusPlanDefault?: boolean
  /** 订阅通知次数 */
  subscriptionNoticeCount?: number
  /** 是否有可用订阅 */
  hasAvailableSubscription?: boolean
  /** 是否符合数据共享资格 */
  isQualifiedForDataSharing?: boolean
  /** 是否确认成本阈值 */
  hasAcknowledgedCostThreshold?: boolean
  /** 缓存的更新日志 */
  cachedChangelog?: string
  /** 更新日志上次获取时间 */
  changelogLastFetched?: number
  /** 上次查看的发布说明 */
  lastReleaseNotesSeen?: string
  /** 是否接受绕过权限模式 */
  bypassPermissionsModeAccepted?: boolean
  /** Sonnet 4.5迁移是否完成 */
  sonnet45MigrationComplete?: boolean
  /** Sonnet 4.5迁移时间戳 */
  sonnet45MigrationTimestamp?: number
  /** 反馈调查状态 */
  feedbackSurveyState?: {
    lastShownTime?: number
  }
  /** Opus 4.5迁移是否完成 */
  opus45MigrationComplete?: boolean
}

/**
 * MCP服务器列表项
 * @description 用于UI展示的MCP服务器信息
 */
export interface MCPServerListItem {
  /** 服务器ID (键名) */
  id: string
  /** 服务器配置 */
  config: MCPServerConfig
  /** 所属范围: 'global' | 项目路径 */
  scope: string
  /** 是否为全局服务器 */
  isGlobal: boolean
  /** 项目路径 (仅项目级服务器) */
  projectPath?: string
}

/**
 * MCP管理操作类型
 */
export type MCPOperation =
  | 'add'       // 添加服务器
  | 'edit'      // 编辑服务器
  | 'delete'    // 删除服务器
  | 'toggle'    // 切换启用/禁用
  | 'duplicate' // 复制服务器

/**
 * MCP服务器表单数据
 * @description 用于创建/编辑MCP服务器的表单数据
 */
export interface MCPServerFormData {
  /** 服务器ID */
  id: string
  /** 传输类型 */
  type?: MCPTransportType
  /** 执行命令 */
  command: string
  /** 命令参数 (字符串形式,用空格或换行分隔) */
  argsText?: string
  /** 环境变量 (JSON字符串或键值对数组) */
  envText?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 超时时间(毫秒) */
  timeout?: number
  /** 自动批准工具 (逗号分隔的字符串) */
  autoApproveText?: string
  /** MCP画廊来源ID */
  fromGalleryId?: string
  /** 目标范围: 'global' | 项目路径 */
  targetScope: string
}

/**
 * MCP服务器验证结果
 */
export interface MCPServerValidation {
  /** 是否有效 */
  valid: boolean
  /** 错误信息 */
  errors?: {
    id?: string
    command?: string
    args?: string
    env?: string
    timeout?: string
    [key: string]: string | undefined
  }
}

/**
 * MCP配置文件操作结果
 */
export interface MCPConfigResult<T = any> {
  /** 是否成功 */
  success: boolean
  /** 返回数据 */
  data?: T
  /** 错误信息 */
  error?: string
  /** 错误详情 */
  details?: any
}
