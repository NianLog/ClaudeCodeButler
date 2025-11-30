/**
 * 预加载脚本
 * 安全地暴露主进程 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'
import {
  ConfigFile,
  Rule,
  RuleExecution,
  BackupInfo,
  ValidationResult
} from '@shared/types'
import type {
  ManagedModeStatus,
  ManagedModeConfig,
  ApiProvider,
  EnvCommand
} from '@shared/types/managed-mode'

/**
 * 配置管理 API
 */
interface ConfigAPI {
  // 获取配置文件列表
  list: () => Promise<ConfigFile[]>
  // 获取单个配置文件内容
  get: (path: string) => Promise<any>
  // 保存配置文件
  save: (path: string, content: any, metadata?: any) => Promise<void>
  // 保存配置元数据
  saveMetadata: (path: string, metadata: any) => Promise<void>
  // 获取配置元数据
  getMetadata: (path: string) => Promise<any>
  // 创建新配置文件
  create: (name: string, template?: string) => Promise<{ path: string }>
  // 删除配置文件
  delete: (path: string) => Promise<void>
  // 验证配置
  validate: (content: any) => Promise<ValidationResult>
  // 创建备份
  createBackup: (path: string) => Promise<BackupInfo>
  // 恢复备份
  restoreBackup: (backupId: string) => Promise<void>
  // 获取备份列表
  listBackups: (configPath: string) => Promise<BackupInfo[]>
  // 从用户目录导入配置
  importFromUserDir: () => Promise<any[]>
  // 比较配置文件
  compare: (config1Path: string, config2Path: string) => Promise<{ isSame: boolean }>
  // 自动更新Claude Code配置状态
  autoUpdateClaudeCodeStatus: () => Promise<{ updatedConfigs: number, totalConfigs: number }>
  // 检查配置匹配状态
  checkMatch: (configPath: string) => Promise<{ isMatch: boolean }>
  // 比较配置内容
  compareContent: (config1Path: string, config2Path: string) => Promise<{ isSame: boolean }>
  // 手动激活配置
  activateConfig: (configPath: string) => Promise<{ success: boolean }>
  // 迁移单个配置文件
  migrateFile: (filePath: string) => Promise<{ success: boolean }>
  // 批量迁移配置文件
  migrateFiles: (filePaths: string[]) => Promise<{ success: string[], failed: string[], skipped: string[] }>
  // 检查配置文件是否需要迁移
  checkMigration: (filePath: string) => Promise<{ needsMigration: boolean, error?: string }>
  // 监听配置变化
  watch: (callback: (event: any) => void) => void
}

/**
 * 规则管理 API
 */
interface RuleAPI {
  // 获取规则列表
  list: () => Promise<Rule[]>
  // 获取单个规则
  get: (id: string) => Promise<Rule | null>
  // 创建规则
  create: (rule: Partial<Rule>) => Promise<{ id: string }>
  // 更新规则
  update: (id: string, updates: Partial<Rule>) => Promise<void>
  // 删除规则
  delete: (id: string) => Promise<void>
  // 启用/禁用规则
  toggle: (id: string, enabled: boolean) => Promise<void>
  // 手动执行规则
  execute: (id: string) => Promise<RuleExecution>
  // 获取执行日志
  getExecutionLog: (limit?: number) => Promise<RuleExecution[]>
  // 获取规则统计
  getStats: (ruleId?: string) => Promise<any>
  // 监听规则执行事件
  onExecuted: (callback: (execution: RuleExecution) => void) => void
  // 监听规则执行失败事件
  onExecutionFailed: (callback: (execution: RuleExecution) => void) => void
}

/**
 * 应用管理 API
 */
interface AppAPI {
  // 获取应用版本
  getVersion: () => Promise<string>
  // 获取应用路径
  getPath: (name: string) => Promise<string>
  // 退出应用
  quit: () => Promise<void>
  // 重启应用
  relaunch: () => Promise<void>
  // 获取应用信息
  getInfo: () => Promise<any>
}

/**
 * 设置管理 API
 */
interface SettingsAPI {
  // 获取所有设置
  getAll: () => Promise<any>
  // 获取特定标签页设置
  getTab: (tab: string) => Promise<any>
  // 保存特定标签页设置
  saveTab: (tab: string, data: any, options?: any) => Promise<void>
  // 保存所有设置
  saveAll: (data: any) => Promise<void>
  // 重置设置
  reset: (tab?: string) => Promise<void>
  // 导出设置
  export: (filePath?: string) => Promise<string>
  // 导入设置
  import: (content: string, merge?: boolean) => Promise<void>
  // 加载设置
  loadSettings: () => Promise<any>
}

/**
 * 权限管理 API
 */
interface PrivilegeAPI {
  // 检查权限状态
  check: () => Promise<any>
  // 提升权限
  elevate: () => Promise<boolean>
  // 以管理员身份重启
  relaunchAsAdmin: () => Promise<boolean>
}

/**
 * 系统管理 API
 */
interface SystemAPI {
  // 显示通知
  showNotification: (title: string, body: string) => Promise<void>
  // 打开外部链接
  openExternal: (url: string) => Promise<void>
  // 下载文件
  downloadFile: (url: string, fileName?: string) => Promise<{ success: boolean; path?: string; error?: string; message?: string }>
  // 监听下载进度
  onDownloadProgress: (callback: (progress: { progress: number; receivedBytes: number; totalBytes: number }) => void) => void
  // 获取URL内容(绕过CORS)
  fetchUrl: (url: string) => Promise<{ success: boolean; data?: string; error?: string }>
  // 在文件管理器中显示文件
  showItemInFolder: (fullPath: string) => Promise<void>
  // 获取系统信息
  getInfo: () => Promise<any>
  // 获取进程信息
  getProcessInfo: () => Promise<any>
  // 获取平台信息
  getPlatform: () => Promise<string>
}

/**
 * 窗口管理 API
 */
interface WindowAPI {
  // 最小化窗口
  minimize: () => Promise<void>
  // 最大化/还原窗口
  maximize: () => Promise<void>
  // 关闭窗口
  close: () => Promise<void>
  // 监听窗口最大化状态变化
  onMaximized: (callback: (maximized: boolean) => void) => void
}

/**
 * 菜单事件 API
 */
interface MenuAPI {
  // 监听菜单事件
  onNewConfig: (callback: () => void) => void
  onValidateConfigs: (callback: () => void) => void
  onExportConfigs: (callback: () => void) => void
}

/**
 * 托盘事件 API
 */
interface TrayAPI {
  // 监听配置切换请求
  onSwitchConfig: (callback: (configName: string) => void) => void
  // 更新托盘菜单
  updateMenu: () => Promise<void>
}

/**
 * 统计 API
 */
interface StatisticsAPI {
  // 获取统计摘要
  getSummary: (timeRange?: { start: number; end: number }) => Promise<any>
  // 获取配置使用统计
  getConfigUsage: (timeRange?: { start: number; end: number }) => Promise<any>
  // 获取规则执行统计
  getRuleExecution: (timeRange?: { start: number; end: number }) => Promise<any>
  // 获取系统统计
  getSystem: (timeRange?: { start: number; end: number }) => Promise<any>
  // 生成统计摘要
  generate: (timeRange?: { start: number; end: number }) => Promise<any>
  // 导出统计数据
  export: (exportPath: string) => Promise<void>
  // 清理过期数据
  cleanup: (daysToKeep?: number) => Promise<void>
}

/**
 * Claude Code 使用分析 API
 */
interface ClaudeCodeAPI {
  // 获取 Claude Code 使用分析数据
  getAnalytics: (forceRefresh?: boolean) => Promise<any>
  // 清除分析数据缓存
  clearCache: () => Promise<any>
}

/**
 * Claude Code 版本管理 API
 */
interface ClaudeCodeVersionAPI {
  // 检查版本更新
  checkUpdates: (forceRefresh?: boolean) => Promise<any>
  // 获取当前版本
  getCurrentVersion: () => Promise<any>
  // 获取最新版本
  getLatestVersion: () => Promise<any>
  // 执行更新
  update: () => Promise<any>
  // 检查是否已安装
  isInstalled: () => Promise<any>
  // 清除版本信息缓存
  clearCache: () => Promise<any>
}

/**
 * 项目管理 API
 */
interface ProjectManagementAPI {
  // 扫描所有Claude Code项目
  scanProjects: () => Promise<any>
  // 获取项目的所有会话列表
  getProjectSessions: (projectId: string) => Promise<any>
  // 获取会话的完整对话内容
  getSessionConversation: (projectId: string, sessionId: string, limit?: number) => Promise<any>
  // 在终端中继续指定会话
  continueSession: (projectId: string, sessionId: string, projectPath?: string, terminal?: string, asAdmin?: boolean) => Promise<any>
  // 获取项目统计摘要
  getProjectSummary: (projectId: string) => Promise<any>
}

/**
 * 托管模式管理 API
 */
interface ManagedModeAPI {
  // 启动代理服务
  start: () => Promise<{ success: boolean; error?: string }>
  // 停止代理服务
  stop: () => Promise<{ success: boolean; error?: string }>
  // 重启代理服务
  restart: () => Promise<{ success: boolean; error?: string }>
  // 获取服务状态
  getStatus: () => Promise<ManagedModeStatus>
  // 获取配置
  getConfig: () => Promise<ManagedModeConfig | null>
  // 更新配置
  updateConfig: (config: Partial<ManagedModeConfig>) => Promise<{ success: boolean; error?: string }>
  // 切换服务商
  switchProvider: (providerId: string) => Promise<{ success: boolean; error?: string }>
  // 添加服务商
  addProvider: (provider: ApiProvider) => Promise<{ success: boolean; error?: string }>
  // 更新服务商
  updateProvider: (provider: ApiProvider) => Promise<{ success: boolean; error?: string }>
  // 删除服务商
  deleteProvider: (providerId: string) => Promise<{ success: boolean; error?: string }>
  // 获取环境变量命令
  getEnvCommand: () => Promise<EnvCommand[]>
  // 启用托管模式
  enable: () => Promise<{ success: boolean; message?: string; error?: string }>
  // 禁用托管模式
  disable: () => Promise<{ success: boolean; message?: string; error?: string }>
  // 检查托管模式是否启用
  isEnabled: () => Promise<{ success: boolean; enabled: boolean }>
  // 检查是否存在系统设置备份
  checkBackup: () => Promise<{ success: boolean; hasBackup: boolean }>
  // 更新系统settings配置
  updateSettingsConfig: (configData: any) => Promise<{ success: boolean; error?: string }>
  // 监听状态变化
  onStatusChanged: (callback: (status: ManagedModeStatus) => void) => () => void
  // 监听配置更新
  onConfigUpdated: (callback: () => void) => () => void
  // 监听日志事件
  onLog: (callback: (log: any) => void) => () => void

  /**
   * 日志轮转相关API
   */
  // 持久化日志到文件
  logRotation: {
    // 持久化日志数组 (返回值由 createSimpleHandler 包装)
    persistLogs: (logs: any[]) => Promise<{
      success: boolean
      data?: { success: boolean; rotated: boolean; error?: string }
      error?: string
    }>
    // 获取历史日志文件列表 (返回值由 createSimpleHandler 包装)
    getLogFileList: () => Promise<{
      success: boolean
      data?: any[]
      error?: string
    }>
    // 读取指定日志文件 (返回值由 createSimpleHandler 包装)
    readLogFile: (filename: string) => Promise<{
      success: boolean
      data?: any[]
      error?: string
    }>
    // 按时间范围查询日志 (返回值由 createSimpleHandler 包装)
    queryLogsByTimeRange: (startTime: number, endTime: number) => Promise<{
      success: boolean
      data?: any[]
      error?: string
    }>
    // 获取日志轮转配置 (返回值由 createSimpleHandler 包装)
    getConfig: () => Promise<{
      success: boolean
      data?: any
      error?: string
    }>
    // 更新日志轮转配置 (返回值由 createSimpleHandler 包装)
    updateConfig: (config: any) => Promise<{
      success: boolean
      data?: void
      error?: string
    }>
  }
}

// 移除安全管理API

/**
 * 完整的 Electron API
 */
export interface ElectronAPI {
  config: ConfigAPI
  rule: RuleAPI
  app: AppAPI
  system: SystemAPI
  privilege: PrivilegeAPI
  window: WindowAPI
  menu: MenuAPI
  tray: TrayAPI
  statistics: StatisticsAPI
  claudeCode: ClaudeCodeAPI
  claudeCodeVersion: ClaudeCodeVersionAPI
  projectManagement: ProjectManagementAPI
  settings: SettingsAPI
  managedMode: ManagedModeAPI
  // 移除安全API
}

// 创建配置 API 对象
const configAPI: ConfigAPI = {
  list: () => ipcRenderer.invoke('config:list'),
  get: (path: string) => ipcRenderer.invoke('config:get', path),
  save: (path: string, content: any, metadata?: any) => ipcRenderer.invoke('config:save', path, content, metadata),
  saveMetadata: (path: string, metadata: any) => ipcRenderer.invoke('config:saveMetadata', path, metadata),
  getMetadata: (path: string) => ipcRenderer.invoke('config:getMetadata', path),
  create: (name: string, template?: string) => ipcRenderer.invoke('config:create', name, template),
  delete: (path: string) => ipcRenderer.invoke('config:delete', path),
  validate: (content: any) => ipcRenderer.invoke('config:validate', content),
  createBackup: (path: string) => ipcRenderer.invoke('config:createBackup', path),
  restoreBackup: (backupId: string) => ipcRenderer.invoke('config:restoreBackup', backupId),
  listBackups: (configPath: string) => ipcRenderer.invoke('config:listBackups', configPath),
  importFromUserDir: () => ipcRenderer.invoke('config:importFromUserDir'),
  compare: (config1Path: string, config2Path: string) => ipcRenderer.invoke('config:compare', config1Path, config2Path),
  autoUpdateClaudeCodeStatus: () => ipcRenderer.invoke('config:autoUpdateClaudeCodeStatus'),
  checkMatch: (configPath: string) => ipcRenderer.invoke('config:checkMatch', configPath),
  compareContent: (config1Path: string, config2Path: string) => ipcRenderer.invoke('config:compareContent', config1Path, config2Path),
  activateConfig: (configPath: string) => ipcRenderer.invoke('config:activateConfig', configPath),
  migrateFile: (filePath: string) => ipcRenderer.invoke('config:migrateFile', filePath),
  migrateFiles: (filePaths: string[]) => ipcRenderer.invoke('config:migrateFiles', filePaths),
  checkMigration: (filePath: string) => ipcRenderer.invoke('config:checkMigration', filePath),
  watch: (callback: (event: any) => void) => {
    ipcRenderer.on('config:changed', (_, event) => callback(event))
  }
}

// 创建规则 API 对象
const ruleAPI: RuleAPI = {
  list: () => ipcRenderer.invoke('rule:list'),
  get: (id: string) => ipcRenderer.invoke('rule:get', id),
  create: (rule: Partial<Rule>) => ipcRenderer.invoke('rule:create', rule),
  update: (id: string, updates: Partial<Rule>) => ipcRenderer.invoke('rule:update', id, updates),
  delete: (id: string) => ipcRenderer.invoke('rule:delete', id),
  toggle: (id: string, enabled: boolean) => ipcRenderer.invoke('rule:toggle', id, enabled),
  execute: (id: string) => ipcRenderer.invoke('rule:execute', id),
  getExecutionLog: (limit?: number) => ipcRenderer.invoke('rule:getExecutionLog', limit),
  getStats: (ruleId?: string) => ipcRenderer.invoke('rule:getStats', ruleId),
  onExecuted: (callback: (execution: RuleExecution) => void) => {
    ipcRenderer.on('rule:executed', (_, execution) => callback(execution))
  },
  onExecutionFailed: (callback: (execution: RuleExecution) => void) => {
    ipcRenderer.on('rule:execution-failed', (_, execution) => callback(execution))
  }
}

// 创建应用 API 对象
const appAPI: AppAPI = {
  getVersion: async () => {
    const result = await ipcRenderer.invoke('app:getVersion')
    // createSimpleHandler 会包装返回值为 {success, data}
    // 需要解包获取实际的版本字符串
    return (result as any).success ? (result as any).data : result
  },
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
  quit: () => ipcRenderer.invoke('app:quit'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  getInfo: () => ipcRenderer.invoke('app:getInfo')
}

// 创建权限管理 API 对象
const privilegeAPI: PrivilegeAPI = {
  check: () => ipcRenderer.invoke('privilege:check'),
  elevate: () => ipcRenderer.invoke('privilege:elevate'),
  relaunchAsAdmin: () => ipcRenderer.invoke('privilege:relaunch-as-admin')
}

// 创建系统 API 对象
const systemAPI: SystemAPI = {
  showNotification: (title: string, body: string) => ipcRenderer.invoke('system:showNotification', title, body),
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
  downloadFile: (url: string, fileName?: string) => ipcRenderer.invoke('system:downloadFile', url, fileName),
  onDownloadProgress: (callback: (progress: { progress: number; receivedBytes: number; totalBytes: number }) => void) => {
    ipcRenderer.on('download:progress', (_, progress) => callback(progress))
  },
  fetchUrl: (url: string) => ipcRenderer.invoke('system:fetchUrl', url),
  showItemInFolder: (fullPath: string) => ipcRenderer.invoke('system:showItemInFolder', fullPath),
  getInfo: () => ipcRenderer.invoke('system:getInfo'),
  getProcessInfo: () => ipcRenderer.invoke('system:getProcessInfo'),
  getPlatform: () => ipcRenderer.invoke('system:getPlatform')
}

// 创建窗口 API 对象
const windowAPI: WindowAPI = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  onMaximized: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximized', (_, maximized) => callback(maximized))
  }
}

// 创建菜单 API 对象
const menuAPI: MenuAPI = {
  onNewConfig: (callback: () => void) => {
    ipcRenderer.on('menu:new-config', callback)
  },
  onValidateConfigs: (callback: () => void) => {
    ipcRenderer.on('menu:validate-configs', callback)
  },
  onExportConfigs: (callback: () => void) => {
    ipcRenderer.on('menu:export-configs', callback)
  }
}

// 创建托盘 API 对象
const trayAPI: TrayAPI = {
  onSwitchConfig: (callback: (configName: string) => void) => {
    ipcRenderer.on('tray:switch-config', (_, configName) => callback(configName))
  },
  updateMenu: () => ipcRenderer.invoke('tray:updateMenu')
}

// 创建统计 API 对象
const statisticsAPI: StatisticsAPI = {
  getSummary: (timeRange?: { start: number; end: number }) => ipcRenderer.invoke('statistics:getSummary', timeRange),
  getConfigUsage: (timeRange?: { start: number; end: number }) => ipcRenderer.invoke('statistics:getConfigUsage', timeRange),
  getRuleExecution: (timeRange?: { start: number; end: number }) => ipcRenderer.invoke('statistics:getRuleExecution', timeRange),
  getSystem: (timeRange?: { start: number; end: number }) => ipcRenderer.invoke('statistics:getSystem', timeRange),
  generate: (timeRange?: { start: number; end: number }) => ipcRenderer.invoke('statistics:generate', timeRange),
  export: (exportPath: string) => ipcRenderer.invoke('statistics:export', exportPath),
  cleanup: (daysToKeep?: number) => ipcRenderer.invoke('statistics:cleanup', daysToKeep)
}

// 创建 Claude Code 分析 API 对象
const claudeCodeAPI: ClaudeCodeAPI = {
  getAnalytics: (forceRefresh?: boolean) => ipcRenderer.invoke('claudeCode:getAnalytics', forceRefresh),
  clearCache: () => ipcRenderer.invoke('claudeCode:clearCache')
}

// 创建 Claude Code 版本管理 API 对象
const claudeCodeVersionAPI: ClaudeCodeVersionAPI = {
  checkUpdates: (forceRefresh?: boolean) => ipcRenderer.invoke('claudeCodeVersion:checkUpdates', forceRefresh),
  getCurrentVersion: () => ipcRenderer.invoke('claudeCodeVersion:getCurrentVersion'),
  getLatestVersion: () => ipcRenderer.invoke('claudeCodeVersion:getLatestVersion'),
  update: () => ipcRenderer.invoke('claudeCodeVersion:update'),
  isInstalled: () => ipcRenderer.invoke('claudeCodeVersion:isInstalled'),
  clearCache: () => ipcRenderer.invoke('claudeCodeVersion:clearCache')
}

// 创建项目管理 API 对象
const projectManagementAPI: ProjectManagementAPI = {
  scanProjects: () => ipcRenderer.invoke('projectManagement:scanProjects'),
  getProjectSessions: (projectId: string) => ipcRenderer.invoke('projectManagement:getProjectSessions', projectId),
  getSessionConversation: (projectId: string, sessionId: string, limit?: number) => ipcRenderer.invoke('projectManagement:getSessionConversation', projectId, sessionId, limit),
  continueSession: (projectId: string, sessionId: string, projectPath?: string, terminal?: string, asAdmin?: boolean) => ipcRenderer.invoke('projectManagement:continueSession', projectId, sessionId, projectPath, terminal, asAdmin),
  getProjectSummary: (projectId: string) => ipcRenderer.invoke('projectManagement:getProjectSummary', projectId)
}

// 创建设置 API 对象
const settingsAPI: SettingsAPI = {
  getAll: () => ipcRenderer.invoke('settings:getAll'),
  getTab: (tab: string) => ipcRenderer.invoke('settings:getTab', tab),
  saveTab: (tab: string, data: any, options?: any) => ipcRenderer.invoke('settings:saveTab', tab, data, options),
  saveAll: (data: any) => ipcRenderer.invoke('settings:saveAll', data),
  reset: (tab?: string) => ipcRenderer.invoke('settings:reset', tab),
  export: (filePath?: string) => ipcRenderer.invoke('settings:export', filePath),
  import: (content: string, merge?: boolean) => ipcRenderer.invoke('settings:import', content, merge),
  loadSettings: () => ipcRenderer.invoke('settings:load')
}

// 创建托管模式 API 对象
const managedModeAPI: ManagedModeAPI = {
  start: () => ipcRenderer.invoke('managed-mode:start'),
  stop: () => ipcRenderer.invoke('managed-mode:stop'),
  restart: () => ipcRenderer.invoke('managed-mode:restart'),
  getStatus: () => ipcRenderer.invoke('managed-mode:get-status'),
  getConfig: () => ipcRenderer.invoke('managed-mode:get-config'),
  updateConfig: (config: Partial<ManagedModeConfig>) => ipcRenderer.invoke('managed-mode:update-config', config),
  switchProvider: (providerId: string) => ipcRenderer.invoke('managed-mode:switch-provider', providerId),
  addProvider: (provider: ApiProvider) => ipcRenderer.invoke('managed-mode:add-provider', provider),
  updateProvider: (provider: ApiProvider) => ipcRenderer.invoke('managed-mode:update-provider', provider),
  deleteProvider: (providerId: string) => ipcRenderer.invoke('managed-mode:delete-provider', providerId),
  getEnvCommand: () => ipcRenderer.invoke('managed-mode:get-env-command'),
  enable: () => ipcRenderer.invoke('managed-mode:enable'),
  disable: () => ipcRenderer.invoke('managed-mode:disable'),
  isEnabled: () => ipcRenderer.invoke('managed-mode:is-enabled'),
  checkBackup: () => ipcRenderer.invoke('managed-mode:check-backup'),
  updateSettingsConfig: (configData: any) => ipcRenderer.invoke('managed-mode:update-settings-config', configData),
  onStatusChanged: (callback: (status: ManagedModeStatus) => void) => {
    const listener = (_: any, status: ManagedModeStatus) => callback(status)
    ipcRenderer.on('managed-mode:status-changed', listener)
    // 返回取消订阅函数
    return () => {
      ipcRenderer.removeListener('managed-mode:status-changed', listener)
    }
  },
  // 监听配置更新事件
  onConfigUpdated: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('managed-mode:config-updated', listener)
    return () => {
      ipcRenderer.removeListener('managed-mode:config-updated', listener)
    }
  },
  // 监听日志事件
  onLog: (callback: (log: any) => void) => {
    const listener = (_: any, log: any) => callback(log)
    ipcRenderer.on('managed-mode:log', listener)
    return () => {
      ipcRenderer.removeListener('managed-mode:log', listener)
    }
  },

  // 日志轮转API
  logRotation: {
    persistLogs: (logs: any[]) => ipcRenderer.invoke('managedModeLogRotation:persistLogs', logs),
    getLogFileList: () => ipcRenderer.invoke('managedModeLogRotation:getLogFileList'),
    readLogFile: (filename: string) => ipcRenderer.invoke('managedModeLogRotation:readLogFile', filename),
    queryLogsByTimeRange: (startTime: number, endTime: number) => ipcRenderer.invoke('managedModeLogRotation:queryLogsByTimeRange', startTime, endTime),
    getConfig: () => ipcRenderer.invoke('managedModeLogRotation:getConfig'),
    updateConfig: (config: any) => ipcRenderer.invoke('managedModeLogRotation:updateConfig', config)
  }
}

// 移除安全API实现

// 暴露安全的 API 到渲染进程
const electronAPI: ElectronAPI = {
  config: configAPI,
  rule: ruleAPI,
  app: appAPI,
  system: systemAPI,
  privilege: privilegeAPI,
  window: windowAPI,
  menu: menuAPI,
  tray: trayAPI,
  statistics: statisticsAPI,
  claudeCode: claudeCodeAPI,
  claudeCodeVersion: claudeCodeVersionAPI,
  projectManagement: projectManagementAPI,
  settings: settingsAPI,
  managedMode: managedModeAPI
  // 移除安全API
}

// 使用 contextBridge 安全地暴露 API
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 声明全局类型
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// 开发环境下的调试信息
if (process.env.NODE_ENV === 'development') {
  console.log('Preload script loaded successfully')
  console.log('Available APIs:', Object.keys(electronAPI))
}

// 预加载脚本完成标记
contextBridge.exposeInMainWorld('preloadLoaded', true)