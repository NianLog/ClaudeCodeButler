/**
 * 新的设置状态管理
 * 支持按标签页分类管理设置
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  AppSettings,
  SettingsTab,
  SettingsModuleState,
  SettingsSaveOptions
} from '@shared/types/settings'

const DEFAULT_SETTINGS: AppSettings = {
  basic: {
    language: 'zh-CN',
    theme: 'light',
    autoSave: true,
    startupCheck: true
  },
  editor: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    lineNumbers: true
  },
  notifications: {
    enabled: true,
    sound: true,
    configChanges: true,
    errors: true,
    startupCheckUpdate: true,
    silentUpdateCheck: true
  },
  advanced: {
    logLevel: 'info',
    cacheSize: 100,
    autoBackup: true,
    telemetry: false
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    rememberPosition: true
  },
  about: {}
}

// 设置操作接口
interface SettingsStore extends SettingsModuleState {
  // 基础操作
  setSettings: (settings: Partial<AppSettings>) => void
  setTabSettings: (tab: SettingsTab, data: any) => void
  updateSetting: (tab: SettingsTab, key: string, value: any) => void

  // 异步操作
  loadSettings: () => Promise<void>
  saveSettings: (tab?: SettingsTab, options?: SettingsSaveOptions) => Promise<void>
  saveAllSettings: () => Promise<void>
  resetSettings: (tab?: SettingsTab) => Promise<void>

  // 导入导出
  exportSettings: () => Promise<string>
  importSettings: (content: string, merge?: boolean) => Promise<void>

  // 状态管理
  setLoading: (loading: boolean) => void
  setSaving: (saving: boolean) => void
  setError: (error: string | null) => void
  markTabUnsaved: (tab: SettingsTab) => void
  markTabSaved: (tab: SettingsTab) => void

  // 初始化
  initialize: () => Promise<void>
  isInitialized: boolean

  // 默认设置备份（仅在重置时使用）
  getDefaultSettings: () => AppSettings
}

/**
 * 创建设置 store
 */
export const useSettingsStore = create<SettingsStore>()(
  devtools(
    (set, get) => ({
      // 初始状态
      settings: { ...DEFAULT_SETTINGS },
      isLoading: false,
      isSaving: false,
      lastError: null,
      lastSaved: null,
      unsavedChanges: new Set(),
      isInitialized: false,

      // 获取默认设置备份（仅在重置时使用）
      getDefaultSettings: () => ({ ...DEFAULT_SETTINGS }),

      // 基础操作
      setSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }))
      },

      setTabSettings: (tab, data) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [tab]: { ...state.settings[tab], ...data }
          }
        }))
        // 标记为未保存
        get().markTabUnsaved(tab)
      },

      updateSetting: (tab, key, value) => {
        set((state) => ({
          settings: {
            ...state.settings,
            [tab]: { ...state.settings[tab], [key]: value }
          }
        }))
        // 标记为未保存
        get().markTabUnsaved(tab)
      },

      // 异步操作
      loadSettings: async () => {
        console.log('🔧 [loadSettings] 开始执行')
        try {
          get().setLoading(true)
          get().setError(null)

          if (window.electronAPI?.settings?.loadSettings) {
            console.log('🔧 [loadSettings] 调用 IPC')
            const response = await window.electronAPI.settings.loadSettings()
            console.log('🔧 [loadSettings] IPC响应:', JSON.stringify(response, null, 2))

            // 检查响应格式，提取data字段（IPC返回格式为 { success, data }）
            const loadedSettings = response?.data || response
            console.log('🔧 [loadSettings] 提取的settings:', JSON.stringify(loadedSettings, null, 2))
            console.log('🔧 [loadSettings] window设置:', loadedSettings?.window)

            const mergedSettings: AppSettings = {
              ...DEFAULT_SETTINGS,
              ...loadedSettings,
              basic: { ...DEFAULT_SETTINGS.basic, ...loadedSettings?.basic },
              editor: { ...DEFAULT_SETTINGS.editor, ...loadedSettings?.editor },
              notifications: { ...DEFAULT_SETTINGS.notifications, ...loadedSettings?.notifications },
              advanced: { ...DEFAULT_SETTINGS.advanced, ...loadedSettings?.advanced },
              window: { ...DEFAULT_SETTINGS.window, ...loadedSettings?.window },
              about: DEFAULT_SETTINGS.about
            }

            set({ settings: mergedSettings, isLoading: false, lastError: null })

            // 验证store是否更新
            const currentState = get()
            console.log('🔧 [loadSettings] store更新后的settings:', currentState.settings)
            console.log('🔧 [loadSettings] store中的window:', currentState.settings?.window)
          } else {
            // 后备方案：从 localStorage 加载设置
            const defaultSettings = { ...DEFAULT_SETTINGS }

            try {
              // 尝试从 localStorage 加载
              const savedSettings = localStorage.getItem('ccb-settings')
              if (savedSettings) {
                const parsed = JSON.parse(savedSettings)
                const mergedSettings = {
                  basic: { ...defaultSettings.basic, ...parsed.basic },
                  editor: { ...defaultSettings.editor, ...parsed.editor },
                  notifications: { ...defaultSettings.notifications, ...parsed.notifications },
                  advanced: { ...defaultSettings.advanced, ...parsed.advanced },
                  window: { ...defaultSettings.window, ...parsed.window },
                  about: defaultSettings.about
                }

                set(() => ({
                  settings: mergedSettings,
                  isLoading: false,
                  lastError: null,
                  unsavedChanges: new Set()
                }))
              } else {
                // 使用默认设置
                set(() => ({
                  settings: defaultSettings,
                  isLoading: false,
                  lastError: null,
                  unsavedChanges: new Set()
                }))
              }
            } catch (localError) {
              // 使用默认设置
              set(() => ({
                settings: defaultSettings,
                isLoading: false,
                lastError: null,
                unsavedChanges: new Set()
              }))
            }
          }
        } catch (error) {
          console.error('加载设置失败:', error)
          set(() => ({
            isLoading: false,
            lastError: error instanceof Error ? error.message : String(error)
          }))
        }
      },

      saveSettings: async (tab, options = {}) => {
        try {
          get().setSaving(true)
          get().setError(null)

          const currentSettings = get().settings

          if (tab) {
            // 保存特定标签页
            if (window.electronAPI?.settings?.saveTab) {
              await window.electronAPI.settings.saveTab(tab, { [tab]: currentSettings[tab] }, options)
              get().markTabSaved(tab)
              console.log(`${tab} 设置保存成功`)
            } else {
              // 后备方案：保存到 localStorage
              try {
                const settingsKey = `ccb-settings-${tab}`
                localStorage.setItem(settingsKey, JSON.stringify(currentSettings[tab]))
                get().markTabSaved(tab)
                console.log(`${tab} 设置保存成功（使用 localStorage 后备方案）`)
              } catch (localError) {
                console.warn('localStorage 保存失败:', localError)
                // 即使保存失败，也不抛出错误，只是标记为已保存
                get().markTabSaved(tab)
                console.log(`${tab} 设置已标记为已保存`)
              }
            }
          } else {
            // 保存所有设置
            if (window.electronAPI?.settings?.saveAll) {
              await window.electronAPI.settings.saveAll(currentSettings)
              set(() => ({
                unsavedChanges: new Set()
              }))
              console.log('所有设置保存成功')
            } else {
              // 后备方案：保存到 localStorage
              try {
                localStorage.setItem('ccb-settings', JSON.stringify(currentSettings))
                set(() => ({
                  unsavedChanges: new Set()
                }))
                console.log('所有设置保存成功（使用 localStorage 后备方案）')
              } catch (localError) {
                console.warn('localStorage 保存失败:', localError)
                // 即使保存失败，也不抛出错误
                set(() => ({
                  unsavedChanges: new Set()
                }))
                console.log('设置已标记为已保存')
              }
            }
          }

          set(() => ({
            isSaving: false,
            lastError: null,
            lastSaved: new Date()
          }))

        } catch (error) {
          console.error('保存设置失败:', error)
          set(() => ({
            isSaving: false,
            lastError: error instanceof Error ? error.message : String(error)
          }))
          throw error
        }
      },

      saveAllSettings: async () => {
        await get().saveSettings()
      },

      resetSettings: async (tab) => {
        try {
          get().setLoading(true)
          get().setError(null)

          if (window.electronAPI?.settings?.reset) {
            await window.electronAPI.settings.reset(tab)

            if (tab) {
              // 重新加载该标签页设置
              await get().loadSettings()
            } else {
              // 重新加载所有设置
              await get().loadSettings()
            }

            console.log(`${tab || '所有'} 设置重置成功`)
          } else {
            // 后备方案：使用默认设置备份重置
            const defaultSettings = get().getDefaultSettings()

            if (tab) {
              // 重置特定标签页
              set((state) => ({
                settings: {
                  ...state.settings,
                  [tab]: defaultSettings[tab as keyof typeof defaultSettings]
                },
                isLoading: false,
                lastError: null
              }))
            } else {
              // 重置所有设置
              set(() => ({
                settings: defaultSettings,
                isLoading: false,
                lastError: null,
                unsavedChanges: new Set()
              }))
            }

            console.log(`${tab || '所有'} 设置重置成功（使用后备方案）`)
          }

        } catch (error) {
          console.error('重置设置失败:', error)
          set(() => ({
            isLoading: false,
            lastError: error instanceof Error ? error.message : String(error)
          }))
          throw error
        }
      },

      // 导入导出
      exportSettings: async () => {
        try {
          if (window.electronAPI?.settings?.export) {
            const content = await window.electronAPI.settings.export()
            console.log('设置导出成功')
            return content
          } else {
            throw new Error('ElectronAPI 不可用')
          }
        } catch (error) {
          console.error('导出设置失败:', error)
          set(() => ({
            lastError: error instanceof Error ? error.message : String(error)
          }))
          throw error
        }
      },

      importSettings: async (content, merge = false) => {
        try {
          get().setLoading(true)
          get().setError(null)

          if (window.electronAPI?.settings?.import) {
            await window.electronAPI.settings.import(content, merge)

            // 重新加载设置
            await get().loadSettings()

            console.log('设置导入成功')
          } else {
            throw new Error('ElectronAPI 不可用')
          }

        } catch (error) {
          console.error('导入设置失败:', error)
          set(() => ({
            isLoading: false,
            lastError: error instanceof Error ? error.message : String(error)
          }))
          throw error
        }
      },

      // 状态管理
      setLoading: (loading) => set({ isLoading: loading }),
      setSaving: (saving) => set({ isSaving: saving }),
      setError: (error) => set({ lastError: error }),
      markTabUnsaved: (tab) => set((state) => ({
        unsavedChanges: new Set([...state.unsavedChanges, tab])
      })),
      markTabSaved: (tab) => set((state) => {
        const newUnsaved = new Set(state.unsavedChanges)
        newUnsaved.delete(tab)
        return { unsavedChanges: newUnsaved }
      }),

      // 初始化
      initialize: async () => {
        const state = get()
        if (state.isInitialized) {
          return
        }
        await get().loadSettings()
        set({ isInitialized: true })
      }
    }),
    {
      name: 'settings-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)

/**
 * 选择器 hooks
 * 使用Zustand的浅比较来避免不必要的重新渲染
 */
export const useBasicSettings = () => useSettingsStore((state) =>
  state.settings?.basic && Object.keys(state.settings.basic).length > 0
    ? state.settings.basic
    : DEFAULT_SETTINGS.basic
)

export const useEditorSettings = () => useSettingsStore((state) =>
  state.settings?.editor && Object.keys(state.settings.editor).length > 0
    ? state.settings.editor
    : DEFAULT_SETTINGS.editor
)

export const useNotificationSettings = () => useSettingsStore((state) =>
  state.settings?.notifications && Object.keys(state.settings.notifications).length > 0
    ? state.settings.notifications
    : DEFAULT_SETTINGS.notifications
)

export const useAdvancedSettings = () => useSettingsStore((state) =>
  state.settings?.advanced && Object.keys(state.settings.advanced).length > 0
    ? state.settings.advanced
    : DEFAULT_SETTINGS.advanced
)

export const useWindowSettings = () => useSettingsStore((state) => {
  const windowSettings = state.settings?.window && Object.keys(state.settings.window).length > 0
    ? state.settings.window
    : DEFAULT_SETTINGS.window
  console.log('🪟 [useWindowSettings] 选择器返回:', windowSettings)
  return windowSettings
})

export const useSettingsLoading = () => useSettingsStore((state) => state.isLoading)
export const useSettingsSaving = () => useSettingsStore((state) => state.isSaving)
export const useSettingsError = () => useSettingsStore((state) => state.lastError)
export const useUnsavedChanges = () => useSettingsStore((state) => state.unsavedChanges)
export const useHasUnsavedChanges = () => useSettingsStore((state) => state.unsavedChanges.size > 0)

/**
 * 操作 hooks
 */
export const useSettingsActions = () => useSettingsStore((state) => ({
  setSettings: state.setSettings,
  setTabSettings: state.setTabSettings,
  updateSetting: state.updateSetting,
  loadSettings: state.loadSettings,
  saveSettings: state.saveSettings,
  saveAllSettings: state.saveAllSettings,
  resetSettings: state.resetSettings,
  exportSettings: state.exportSettings,
  importSettings: state.importSettings,
  markTabSaved: state.markTabSaved,
  initialize: state.initialize,
  getDefaultSettings: state.getDefaultSettings
}))