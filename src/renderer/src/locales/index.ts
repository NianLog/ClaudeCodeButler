/**
 * 国际化系统
 * 支持简体中文和英文
 */

import { ReactNode } from 'react'

// 支持的语言类型
export type SupportedLanguage = 'zh-CN' | 'en-US'

// 翻译键类型
export type TranslationKey = string

// 翻译值类型
export type TranslationValue = string | ReactNode

// 翻译字典类型
export type TranslationDict = Record<TranslationKey, TranslationValue>

// 语言资源类型
export type LanguageResources = Record<SupportedLanguage, TranslationDict>

// 中文翻译
const zhCN: TranslationDict = {
  // 通用
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.delete': '删除',
  'common.edit': '编辑',
  'common.add': '添加',
  'common.remove': '移除',
  'common.search': '搜索',
  'common.filter': '筛选',
  'common.refresh': '刷新',
  'common.loading': '加载中...',
  'common.success': '成功',
  'common.error': '错误',
  'common.warning': '警告',
  'common.info': '信息',
  'common.settings': '设置',
  'common.about': '关于',
  'common.version': '版本',
  'common.language': '语言',
  'common.theme': '主题',
  'common.exit': '退出',
  'common.restart': '重启',

  // 导航
  'nav.dashboard': '仪表板',
  'nav.config': '配置管理',
  'nav.automation': '自动化',
  'nav.statistics': '统计',
  'nav.projects': '项目管理',

  // 设置页面
  'settings.title': '设置',
  'settings.subtitle': '配置应用偏好和系统设置',
  'settings.basic': '基本设置',
  'settings.editor': '编辑器设置',
  'settings.notifications': '通知设置',
  'settings.advanced': '高级设置',
  'settings.about': '关于',

  // 基本设置
  'settings.basic.language': '语言',
  'settings.basic.language.tooltip': '选择应用界面语言',
  'settings.basic.theme': '主题',
  'settings.basic.theme.tooltip': '选择应用主题',
  'settings.basic.theme.light': '浅色主题',
  'settings.basic.theme.dark': '深色主题',
  'settings.basic.theme.auto': '跟随系统',
  'settings.basic.autoSave': '自动保存',
  'settings.basic.autoSave.tooltip': '自动保存配置更改',
  'settings.basic.startupCheck': '启动时检查更新',
  'settings.basic.startupCheck.tooltip': '应用启动时自动检查更新',
  'settings.basic.windowWidth': '窗口宽度',
  'settings.basic.windowWidth.tooltip': '应用启动时的窗口宽度',
  'settings.basic.windowHeight': '窗口高度',
  'settings.basic.windowHeight.tooltip': '应用启动时的窗口高度',

  // 编辑器设置
  'settings.editor.fontSize': '字体大小',
  'settings.editor.fontSize.tooltip': '编辑器字体大小',
  'settings.editor.tabSize': 'Tab 大小',
  'settings.editor.tabSize.tooltip': 'Tab 键缩进大小',
  'settings.editor.wordWrap': '自动换行',
  'settings.editor.wordWrap.tooltip': '编辑器自动换行',
  'settings.editor.minimap': '显示小地图',
  'settings.editor.minimap.tooltip': '显示代码小地图',
  'settings.editor.lineNumbers': '显示行号',
  'settings.editor.lineNumbers.tooltip': '显示行号',

  // 通知设置
  'settings.notifications.enabled': '启用通知',
  'settings.notifications.enabled.tooltip': '启用系统通知',
  'settings.notifications.sound': '通知声音',
  'settings.notifications.sound.tooltip': '通知时播放声音',
  'settings.notifications.configChanges': '配置变更通知',
  'settings.notifications.configChanges.tooltip': '配置变更时发送通知',
  'settings.notifications.errors': '错误通知',
  'settings.notifications.errors.tooltip': '发生错误时发送通知',
  'settings.notifications.startupCheckUpdate': '启动时检查更新',
  'settings.notifications.startupCheckUpdate.tooltip': '应用启动时自动检查版本更新',
  'settings.notifications.silentUpdateCheck': '静默更新检查',
  'settings.notifications.silentUpdateCheck.tooltip': '网络失败时不显示错误通知，仅在发现更新时提醒',

  // 高级设置
  'settings.advanced.logLevel': '日志级别',
  'settings.advanced.logLevel.tooltip': '设置日志输出级别',
  'settings.advanced.logLevel.error': '错误',
  'settings.advanced.logLevel.warn': '警告',
  'settings.advanced.logLevel.info': '信息',
  'settings.advanced.logLevel.debug': '调试',
  'settings.advanced.cacheSize': '缓存大小(MB)',
  'settings.advanced.cacheSize.tooltip': '设置缓存大小',
  'settings.advanced.autoBackup': '自动备份',
  'settings.advanced.autoBackup.tooltip': '自动备份配置文件',
  'settings.advanced.telemetry': '遥测数据',
  'settings.advanced.telemetry.tooltip': '发送匿名使用数据帮助改进',

  // 数据管理
  'settings.data.title': '数据管理',
  'settings.data.description': '管理应用数据和配置',
  'settings.data.export': '导出设置',
  'settings.data.import': '导入设置',
  'settings.data.reset': '重置设置',

  // 关于页面
  'about.app.name': 'Claude Code Butler',
  'about.app.description': 'Claude Code 配置管理工具',
  'about.app.info': '应用信息',
  'about.app.currentVersion': '当前版本',
  'about.app.author': '作者',
  'about.app.license': '许可证',
  'about.app.techStack': '技术栈',
  'about.app.techStack.value': 'Electron + React + TypeScript + Ant Design',

  // 更新相关
  'update.check': '检查更新',
  'update.checking': '正在检查更新...',
  'update.latest': '当前已是最新版本',
  'update.available': '发现新版本',
  'update.download': '立即下载',
  'update.visitWebsite': '访问官网',
  'update.docs': '使用文档',
  'update.github': '作者 GitHub',

  // 更新日志
  'changelog.title': '更新日志',
  'changelog.version': '版本 1.0.0',
  'changelog.description': '初始版本发布:',
  'changelog.features': [
    '配置文件管理功能',
    '项目监控与统计',
    '自动化规则系统',
    '现代化UI界面'
  ],

  // 消息提示
  'message.settings.saved': '{tab}设置已保存',
  'message.settings.saveFailed': '保存{tab}设置失败',
  'message.settings.reset': '{tab}设置已重置',
  'message.settings.resetFailed': '重置{tab}设置失败',
  'message.settings.exported': '设置导出成功',
  'message.settings.exportFailed': '导出设置失败',
  'message.settings.imported': '设置导入成功',
  'message.settings.importFailed': '导入设置失败',
  'message.update.downloaded': '更新下载完成',
  'message.update.failed': '更新失败'
}

// 英文翻译
const enUS: TranslationDict = {
  // 通用
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.refresh': 'Refresh',
  'common.loading': 'Loading...',
  'common.success': 'Success',
  'common.error': 'Error',
  'common.warning': 'Warning',
  'common.info': 'Info',
  'common.settings': 'Settings',
  'common.about': 'About',
  'common.version': 'Version',
  'common.language': 'Language',
  'common.theme': 'Theme',
  'common.exit': 'Exit',
  'common.restart': 'Restart',

  // 导航
  'nav.dashboard': 'Dashboard',
  'nav.config': 'Configuration',
  'nav.automation': 'Automation',
  'nav.statistics': 'Statistics',
  'nav.projects': 'Projects',

  // 设置页面
  'settings.title': 'Settings',
  'settings.subtitle': 'Configure application preferences and system settings',
  'settings.basic': 'Basic Settings',
  'settings.editor': 'Editor Settings',
  'settings.notifications': 'Notification Settings',
  'settings.advanced': 'Advanced Settings',
  'settings.about': 'About',

  // 基本设置
  'settings.basic.language': 'Language',
  'settings.basic.language.tooltip': 'Select application interface language',
  'settings.basic.theme': 'Theme',
  'settings.basic.theme.tooltip': 'Select application theme',
  'settings.basic.theme.light': 'Light Theme',
  'settings.basic.theme.dark': 'Dark Theme',
  'settings.basic.theme.auto': 'Follow System',
  'settings.basic.autoSave': 'Auto Save',
  'settings.basic.autoSave.tooltip': 'Automatically save configuration changes',
  'settings.basic.startupCheck': 'Check for updates on startup',
  'settings.basic.startupCheck.tooltip': 'Automatically check for updates when application starts',
  'settings.basic.windowWidth': 'Window Width',
  'settings.basic.windowWidth.tooltip': 'Application startup window width',
  'settings.basic.windowHeight': 'Window Height',
  'settings.basic.windowHeight.tooltip': 'Application startup window height',

  // 编辑器设置
  'settings.editor.fontSize': 'Font Size',
  'settings.editor.fontSize.tooltip': 'Editor font size',
  'settings.editor.tabSize': 'Tab Size',
  'settings.editor.tabSize.tooltip': 'Tab key indentation size',
  'settings.editor.wordWrap': 'Word Wrap',
  'settings.editor.wordWrap.tooltip': 'Editor automatic word wrapping',
  'settings.editor.minimap': 'Show Minimap',
  'settings.editor.minimap.tooltip': 'Show code minimap',
  'settings.editor.lineNumbers': 'Show Line Numbers',
  'settings.editor.lineNumbers.tooltip': 'Show line numbers',

  // 通知设置
  'settings.notifications.enabled': 'Enable Notifications',
  'settings.notifications.enabled.tooltip': 'Enable system notifications',
  'settings.notifications.sound': 'Notification Sound',
  'settings.notifications.sound.tooltip': 'Play sound when notifying',
  'settings.notifications.configChanges': 'Configuration Change Notifications',
  'settings.notifications.configChanges.tooltip': 'Send notifications when configuration changes',
  'settings.notifications.errors': 'Error Notifications',
  'settings.notifications.errors.tooltip': 'Send notifications when errors occur',
  'settings.notifications.startupCheckUpdate': 'Check for updates on startup',
  'settings.notifications.startupCheckUpdate.tooltip': 'Automatically check for version updates when application starts',
  'settings.notifications.silentUpdateCheck': 'Silent Update Check',
  'settings.notifications.silentUpdateCheck.tooltip': 'Do not show error notifications on network failures, only remind when updates are found',

  // 高级设置
  'settings.advanced.logLevel': 'Log Level',
  'settings.advanced.logLevel.tooltip': 'Set log output level',
  'settings.advanced.logLevel.error': 'Error',
  'settings.advanced.logLevel.warn': 'Warning',
  'settings.advanced.logLevel.info': 'Info',
  'settings.advanced.logLevel.debug': 'Debug',
  'settings.advanced.cacheSize': 'Cache Size (MB)',
  'settings.advanced.cacheSize.tooltip': 'Set cache size',
  'settings.advanced.autoBackup': 'Auto Backup',
  'settings.advanced.autoBackup.tooltip': 'Automatically backup configuration files',
  'settings.advanced.telemetry': 'Telemetry',
  'settings.advanced.telemetry.tooltip': 'Send anonymous usage data to help improve',

  // 数据管理
  'settings.data.title': 'Data Management',
  'settings.data.description': 'Manage application data and configuration',
  'settings.data.export': 'Export Settings',
  'settings.data.import': 'Import Settings',
  'settings.data.reset': 'Reset Settings',

  // 关于页面
  'about.app.name': 'Claude Code Butler',
  'about.app.description': 'Claude Code Configuration Management Tool',
  'about.app.info': 'Application Information',
  'about.app.currentVersion': 'Current Version',
  'about.app.author': 'Author',
  'about.app.license': 'License',
  'about.app.techStack': 'Tech Stack',
  'about.app.techStack.value': 'Electron + React + TypeScript + Ant Design',

  // 更新相关
  'update.check': 'Check for Updates',
  'update.checking': 'Checking for updates...',
  'update.latest': 'You are using the latest version',
  'update.available': 'New version available',
  'update.download': 'Download Now',
  'update.visitWebsite': 'Visit Website',
  'update.docs': 'Documentation',
  'update.github': 'Author GitHub',

  // 更新日志
  'changelog.title': 'Changelog',
  'changelog.version': 'Version 1.0.0',
  'changelog.description': 'Initial release:',
  'changelog.features': [
    'Configuration file management',
    'Project monitoring and statistics',
    'Automation rule system',
    'Modern UI interface'
  ],

  // 消息提示
  'message.settings.saved': '{tab} settings saved successfully',
  'message.settings.saveFailed': 'Failed to save {tab} settings',
  'message.settings.reset': '{tab} settings reset successfully',
  'message.settings.resetFailed': 'Failed to reset {tab} settings',
  'message.settings.exported': 'Settings exported successfully',
  'message.settings.exportFailed': 'Failed to export settings',
  'message.settings.imported': 'Settings imported successfully',
  'message.settings.importFailed': 'Failed to import settings',
  'message.update.downloaded': 'Update downloaded successfully',
  'message.update.failed': 'Update failed'
}

// 语言资源
export const languageResources: LanguageResources = {
  'zh-CN': zhCN,
  'en-US': enUS
}

// 默认语言
export const DEFAULT_LANGUAGE: SupportedLanguage = 'zh-CN'

// 获取当前语言
export const getCurrentLanguage = (): SupportedLanguage => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ccb-language') as SupportedLanguage
    if (saved && languageResources[saved]) {
      return saved
    }

    // 浏览器语言检测
    const browserLang = navigator.language
    if (browserLang.startsWith('zh')) {
      return 'zh-CN'
    }
  }

  return DEFAULT_LANGUAGE
}

// 设置当前语言
export const setCurrentLanguage = (language: SupportedLanguage): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ccb-language', language)
    document.documentElement.lang = language
  }
}

// 格式化翻译字符串（支持简单变量替换）
export const formatTranslation = (template: string, variables: Record<string, string | number> = {}): string => {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key]?.toString() || match
  })
}