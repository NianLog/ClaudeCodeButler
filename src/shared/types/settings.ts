/**
 * 设置相关的完整类型定义
 * 支持按标签页分类管理设置
 */

// 基础设置类型
export interface BasicSettings {
  language: 'zh-CN' | 'en-US'
  theme: 'light' | 'dark' | 'auto'
  autoSave: boolean
  startupCheck: boolean
}

// 编辑器设置类型
export interface EditorSettings {
  fontSize: number
  tabSize: number
  wordWrap: boolean
  minimap: boolean
  lineNumbers: boolean
}

// 通知设置类型
export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  configChanges: boolean
  errors: boolean
  startupCheckUpdate: boolean
  silentUpdateCheck: boolean
}

// 高级设置类型
export interface AdvancedSettings {
  logLevel: 'error' | 'warn' | 'info' | 'debug'
  cacheSize: number
  autoBackup: boolean
  telemetry: boolean
}

// 窗口设置类型
export interface WindowSettings {
  width: number
  height: number
  minWidth: number
  minHeight: number
  rememberPosition: boolean
  x?: number
  y?: number
  maximized?: boolean
}

// 完整应用设置类型
export interface AppSettings {
  basic: BasicSettings
  editor: EditorSettings
  notifications: NotificationSettings
  advanced: AdvancedSettings
  window: WindowSettings
  about: Record<string, never>
}

// 设置标签页类型
export type SettingsTab = 'basic' | 'editor' | 'notifications' | 'advanced' | 'window' | 'about'

// 设置保存选项
export interface SettingsSaveOptions {
  tab?: SettingsTab
  silent?: boolean
}

// 设置变更事件
export interface SettingsChangeEvent {
  tab: SettingsTab
  key: string
  oldValue: any
  newValue: any
  timestamp: Date
}

// 设置验证规则
export interface SettingsValidationRule {
  tab: SettingsTab
  key: string
  required?: boolean
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  min?: number
  max?: number
  enum?: any[]
  validator?: (value: any) => boolean | string
}

// 设置模块状态
export interface SettingsModuleState {
  settings: AppSettings
  isLoading: boolean
  isSaving: boolean
  lastError: string | null
  lastSaved: Date | null
  unsavedChanges: Set<SettingsTab>
}