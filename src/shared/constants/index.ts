/**
 * 应用常量定义
 */

import { join } from 'path'
import { homedir } from 'os'

/**
 * 应用信息
 */
export const APP_INFO = {
  /** 应用名称 */
  NAME: 'CCB',
  /** 应用全称 */
  FULL_NAME: 'Claude Code Butler',
  /** 版本号 */
  VERSION: '1.0.0',
  /** 描述 */
  DESCRIPTION: 'Claude Code 配置管理工具',
  /** 作者 */
  AUTHOR: 'NianSir',
  /** 主页 */
  HOMEPAGE: 'https://github.com/ccb-team/claude-code-butler'
} as const

/**
 * 文件路径常量
 */
export const PATHS = {
  /** Claude Code 配置目录 */
  CLAUDE_DIR: join(homedir(), '.claude'),
  /** 应用数据目录 */
  DATA_DIR: join(homedir(), '.ccb'),
  /** 备份目录 */
  BACKUP_DIR: join(homedir(), '.ccb', 'backups'),
  /** 日志目录 */
  LOG_DIR: join(homedir(), '.ccb', 'logs'),
  /** 缓存目录 */
  CACHE_DIR: join(homedir(), '.ccb', 'cache')
} as const

/**
 * 配置文件名常量
 */
export const CONFIG_FILES = {
  /** 主配置文件 */
  SETTINGS: 'settings.json',
  /** 本地配置文件 */
  SETTINGS_LOCAL: 'settings.local.json',
  /** Claude 配置文件 */
  CLAUDE_JSON: '.claude.json',
  /** CLAUDE.md 文件 */
  CLAUDE_MD: 'CLAUDE.md'
} as const

/**
 * 默认配置文件扫描路径
 */
export const DEFAULT_SCAN_PATHS = [
  PATHS.CLAUDE_DIR,
  join(PATHS.CLAUDE_DIR, 'commands'),
  join(PATHS.CLAUDE_DIR, 'prompts')
] as const

/**
 * 主题配置
 */
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  AUTO: 'auto'
} as const

/**
 * 支持的语言
 */
export const LANGUAGES = {
  ZH_CN: 'zh-CN',
  EN_US: 'en-US'
} as const

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS = {
  /** 主题 */
  theme: THEMES.AUTO,
  /** 语言 */
  language: LANGUAGES.ZH_CN,
  /** 自动保存间隔（秒） */
  autoSaveInterval: 30,
  /** 备份保留数量 */
  backupRetention: 10,
  /** 窗口设置 */
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600
  },
  /** 启动时行为 */
  startup: {
    /** 最小化启动 */
    startMinimized: false,
    /** 开机自启 */
    autoStart: false
  },
  /** 通知设置 */
  notifications: {
    /** 启用通知 */
    enabled: true,
    /** 通知持续时间（秒） */
    duration: 5
  }
} as const

/**
 * 快捷键配置
 */
export const SHORTCUTS = {
  /** 新建配置 */
  NEW_CONFIG: 'CmdOrCtrl+N',
  /** 保存配置 */
  SAVE_CONFIG: 'CmdOrCtrl+S',
  /** 刷新配置列表 */
  REFRESH_LIST: 'F5',
  /** 搜索配置 */
  SEARCH: 'CmdOrCtrl+F',
  /** 打开设置 */
  SETTINGS: 'CmdOrCtrl+,',
  /** 退出应用 */
  QUIT: 'CmdOrCtrl+Q',
  /** 最小化窗口 */
  MINIMIZE: 'CmdOrCtrl+M',
  /** 切换主题 */
  TOGGLE_THEME: 'CmdOrCtrl+Shift+T'
} as const

/**
 * 文件大小单位
 */
export const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * 时间格式
 */
export const DATE_FORMATS = {
  /** 日期时间 */
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  /** 日期 */
  DATE: 'YYYY-MM-DD',
  /** 时间 */
  TIME: 'HH:mm:ss',
  /** 时间（不带秒） */
  TIME_SHORT: 'HH:mm'
} as const

/**
 * 正则表达式
 */
export const REGEX = {
  /** JSON 文件 */
  JSON_FILE: /\.json$/i,
  /** 时间格式 HH:mm */
  TIME: /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/,
  /** 日期格式 YYYY-MM-DD */
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  /** 邮箱 */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** URL */
  URL: /^https?:\/\/.+/
} as const

/**
 * 错误码
 */
export const ERROR_CODES = {
  /** 文件不存在 */
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  /** 文件读取失败 */
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  /** 文件写入失败 */
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  /** JSON 解析失败 */
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
  /** 配置验证失败 */
  CONFIG_VALIDATION_ERROR: 'CONFIG_VALIDATION_ERROR',
  /** 网络错误 */
  NETWORK_ERROR: 'NETWORK_ERROR',
  /** 权限不足 */
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  /** 未知错误 */
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const

/**
 * 限制常量
 */
export const LIMITS = {
  /** 最大配置文件大小 (10MB) */
  MAX_CONFIG_SIZE: 10 * 1024 * 1024,
  /** 最大规则数量 */
  MAX_RULES: 100,
  /** 最大备份文件数量 */
  MAX_BACKUPS: 50,
  /** 最大日志文件大小 (50MB) */
  MAX_LOG_SIZE: 50 * 1024 * 1024,
  /** 搜索结果最大数量 */
  MAX_SEARCH_RESULTS: 1000
} as const