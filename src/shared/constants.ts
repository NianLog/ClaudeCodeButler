/**
 * 共享常量定义
 * 定义在主进程和渲染进程之间共享的常量
 */

// 导入package.json以获取版本号
import packageJson from '../../package.json'

/**
 * 应用信息
 */
export const APP_INFO = {
  name: 'Claude Code Butler',
  version: packageJson.version,
  description: 'Claude Code 配置管理工具',
  author: 'NianSir',
  repository: 'https://github.com/ccb-team/claude-code-butler',
  // 别名
  FULL_NAME: 'Claude Code Butler',
  VERSION: packageJson.version,
  DESCRIPTION: 'Claude Code 配置管理工具',
  AUTHOR: 'NianSir',
  HOMEPAGE: 'https://github.com/ccb-team/claude-code-butler'
} as const

/**
 * IPC通道名称
 */
export const IPC_CHANNELS = {
  // 应用控制
  APP_QUIT: 'app:quit',
  APP_RESTART: 'app:restart',
  APP_VERSION: 'app:version',

  // 窗口控制
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE_DEVTOOLS: 'window:toggle-devtools',

  // 配置管理
  CONFIG_LIST: 'config:list',
  CONFIG_GET: 'config:get',
  CONFIG_CREATE: 'config:create',
  CONFIG_UPDATE: 'config:update',
  CONFIG_DELETE: 'config:delete',
  CONFIG_VALIDATE: 'config:validate',
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',
  CONFIG_BACKUP: 'config:backup',
  CONFIG_RESTORE: 'config:restore',

  // 规则管理
  RULE_LIST: 'rule:list',
  RULE_GET: 'rule:get',
  RULE_CREATE: 'rule:create',
  RULE_UPDATE: 'rule:update',
  RULE_DELETE: 'rule:delete',
  RULE_TOGGLE: 'rule:toggle',
  RULE_EXECUTE: 'rule:execute',
  RULE_GET_STATS: 'rule:get-stats',
  RULE_GET_EXECUTION_LOG: 'rule:get-execution-log',

  // 系统信息
  SYSTEM_GET_INFO: 'system:get-info',
  SYSTEM_GET_PATHS: 'system:get-paths',

  // 文件监视
  FILE_WATCH_START: 'file-watch:start',
  FILE_WATCH_STOP: 'file-watch:stop',
  FILE_WATCH_EVENT: 'file-watch:event',

  // 任务调度
  TASK_SCHEDULE: 'task:schedule',
  TASK_UNSCHEDULE: 'task:unschedule',
  TASK_LIST: 'task:list',
  TASK_EXECUTE: 'task:execute',

  // 设置管理
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_LOAD: 'settings:load',

  // 日志管理
  LOG_GET: 'log:get',
  LOG_CLEAR: 'log:clear',
  LOG_EXPORT: 'log:export',

  // 通知
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_CLICK: 'notification:click',

  // 托管模式
  MANAGED_MODE_START: 'managed-mode:start',
  MANAGED_MODE_STOP: 'managed-mode:stop',
  MANAGED_MODE_RESTART: 'managed-mode:restart',
  MANAGED_MODE_GET_STATUS: 'managed-mode:get-status',
  MANAGED_MODE_GET_CONFIG: 'managed-mode:get-config',
  MANAGED_MODE_UPDATE_CONFIG: 'managed-mode:update-config',
  MANAGED_MODE_SWITCH_PROVIDER: 'managed-mode:switch-provider',
  MANAGED_MODE_ADD_PROVIDER: 'managed-mode:add-provider',
  MANAGED_MODE_UPDATE_PROVIDER: 'managed-mode:update-provider',
  MANAGED_MODE_DELETE_PROVIDER: 'managed-mode:delete-provider',
  MANAGED_MODE_GET_ENV_COMMAND: 'managed-mode:get-env-command',
  MANAGED_MODE_RESET_ACCESS_TOKEN: 'managed-mode:reset-access-token',
  MANAGED_MODE_GET_ACCESS_TOKEN: 'managed-mode:get-access-token',
  MANAGED_MODE_STATUS_CHANGED: 'managed-mode:status-changed',
  MANAGED_MODE_ENABLE: 'managed-mode:enable',
  MANAGED_MODE_DISABLE: 'managed-mode:disable',
  MANAGED_MODE_IS_ENABLED: 'managed-mode:is-enabled',
  MANAGED_MODE_CHECK_BACKUP: 'managed-mode:check-backup',
  MANAGED_MODE_UPDATE_SETTINGS_CONFIG: 'managed-mode:update-settings-config'
} as const

/**
 * 配置文件类型
 */
export const CONFIG_TYPES = {
  CLAUDE_CODE: 'claude-code',
  MCP_CONFIG: 'mcp-config',
  PROJECT_CONFIG: 'project-config',
  USER_PREFERENCES: 'user-preferences'
} as const

/**
 * 默认配置路径
 */
export const DEFAULT_PATHS = {
  CLAUDE_CONFIG: '.claude',
  CLAUDE_DESKTOP_CONFIG: '.claude-desktop',
  MCP_SERVERS: 'mcp_servers.json',
  USER_PREFERENCES: 'preferences.json',
  PROJECTS: 'projects.json'
} as const

/**
 * 配置文件常量
 */
export const CONFIG_FILES = {
  SETTINGS: 'settings.json',
  SETTINGS_LOCAL: 'settings.local.json',
  CLAUDE_JSON: '.claude.json',
  CLAUDE_MD: 'CLAUDE.md',
  MCP_SERVERS: 'mcp_servers.json',
  RULES_FILE: 'rules.json'
} as const

/**
 * 规则触发类型
 */
export const RULE_TRIGGER_TYPES = {
  TIME: 'time',
  FILE: 'file',
  MANUAL: 'manual',
  SYSTEM: 'system'
} as const

/**
 * 规则动作类型
 */
export const RULE_ACTION_TYPES = {
  SWITCH_CONFIG: 'switch_config',
  BACKUP_CONFIG: 'backup_config',
  NOTIFICATION: 'notification',
  LOG: 'log',
  CUSTOM: 'custom'
} as const

/**
 * 日志级别
 */
export const LOG_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
} as const

/**
 * 通知类型
 */
export const NOTIFICATION_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
} as const

/**
 * 主题类型
 */
export const THEME_TYPES = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
} as const

/**
 * 语言类型
 */
export const LANGUAGE_TYPES = {
  ZH_CN: 'zh-CN',
  EN_US: 'en-US'
} as const

/**
 * 文件扩展名
 */
export const FILE_EXTENSIONS = {
  JSON: '.json',
  CONFIG: '.config',
  BACKUP: '.backup',
  LOG: '.log'
} as const

/**
 * 时间格式
 */
export const DATE_FORMATS = {
  DATE_TIME: 'YYYY-MM-DD HH:mm:ss',
  DATE: 'YYYY-MM-DD',
  TIME: 'HH:mm:ss',
  ISO: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
} as const

/**
 * 正则表达式
 */
export const REGEX_PATTERNS = {
  JSON_FILE: /\.json$/i,
  CONFIG_FILE: /\.(json|config|conf)$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  CRON: /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/
} as const

/**
 * 错误代码
 */
export const ERROR_CODES = {
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // 配置错误
  CONFIG_PARSE_ERROR: 'CONFIG_PARSE_ERROR',
  CONFIG_VALIDATION_ERROR: 'CONFIG_VALIDATION_ERROR',
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',

  // 规则错误
  RULE_VALIDATION_ERROR: 'RULE_VALIDATION_ERROR',
  RULE_EXECUTION_ERROR: 'RULE_EXECUTION_ERROR',
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',

  // 文件系统错误
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',

  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR'
} as const

/**
 * 系统限制
 */
export const LIMITS = {
  MAX_CONFIG_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CONFIG_FILES: 1000,
  MAX_RULES: 100,
  MAX_BACKUP_FILES: 50,
  MAX_LOG_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_EXECUTION_LOGS: 10000,
  API_TIMEOUT: 30000, // 30秒
  WATCHER_DEBOUNCE: 500 // 500ms
} as const

/**
 * 快捷键
 */
export const SHORTCUTS = {
  // 应用控制
  QUIT: 'CmdOrCtrl+Q',
  RESTART: 'CmdOrCtrl+R',

  // 窗口控制
  MINIMIZE: 'CmdOrCtrl+M',
  TOGGLE_DEVTOOLS: 'F12',

  // 功能快捷键
  NEW_CONFIG: 'CmdOrCtrl+N',
  SAVE_CONFIG: 'CmdOrCtrl+S',
  OPEN_CONFIG: 'CmdOrCtrl+O',
  SEARCH: 'CmdOrCtrl+F',

  // 导航
  CONFIG_TAB: 'CmdOrCtrl+1',
  AUTOMATION_TAB: 'CmdOrCtrl+2',
  STATISTICS_TAB: 'CmdOrCtrl+3',
  SETTINGS_TAB: 'CmdOrCtrl+4'
} as const

/**
 * 应用路径
 * 所有路径都基于用户主目录,确保无论程序在哪运行都能正确找到配置
 */
export const PATHS = {
  // 主应用目录 (用户目录/.ccb)
  USER_DATA: '.ccb',

  // 子目录
  CONFIG_DIR: 'config',
  BACKUP_DIR: 'backup',
  LOG_DIR: 'logs',
  TEMP_DIR: 'temp',
  DATA_DIR: 'data',
  CACHE_DIR: 'cache',

  // Claude 配置目录 (用户目录/.ccb/claude-configs)
  // 将原 .claude 目录的配置统一管理到 .ccb 下
  CLAUDE_CONFIGS_DIR: 'claude-configs'
} as const

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS = {
  autoSaveInterval: 30,
  backupRetention: 10,
  enableNotifications: true,
  startMinimized: false,
  autoStart: false,
  theme: THEME_TYPES.AUTO,
  language: LANGUAGE_TYPES.ZH_CN,
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600
  },
  startup: {
    startMinimized: false
  }
} as const