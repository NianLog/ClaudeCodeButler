/**
 * Zustand 状态管理
 * 统一导出所有状态管理模块
 */

// 新的模块化store
export { useConfigListStore } from './config-list-store'
export { useConfigEditorStore } from './config-editor-store'
export { useConfigBackupStore } from './config-backup-store'
export { useConfigValidationStore } from './config-validation-store'

// 原有store
// export { useConfigStore } from './config-store' // 已删除，使用模块化store
export { useRuleStore } from './rule-store'
export { useAppStore } from './app-store'
export { useSettingsStore, useBasicSettings, useEditorSettings, useNotificationSettings, useAdvancedSettings, useWindowSettings, useSettingsActions, useUnsavedChanges } from './settings-store'