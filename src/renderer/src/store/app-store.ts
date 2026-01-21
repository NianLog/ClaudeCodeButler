/**
 * 应用全局状态
 * 管理应用级别的状态和操作
 */

import { create } from 'zustand'

interface AppStore {
  // 应用信息
  version: string
  platform: string

  // UI 状态
  activeMainTab: 'configs' | 'automation' | 'statistics' | 'projects' | 'mcp-management' | 'agents-management' | 'skills-management' | 'environment-check' | 'managed-mode' | 'settings'
  sidebarCollapsed: boolean
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  expandedMenuGroups: {
    advanced: boolean  // 高级功能分组
  }

  // 通知
  notifications: Array<{
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    timestamp: Date
  }>

  // 操作
  setActiveMainTab: (tab: 'configs' | 'automation' | 'statistics' | 'projects' | 'mcp-management' | 'agents-management' | 'skills-management' | 'environment-check' | 'managed-mode' | 'settings') => void
  toggleSidebar: () => void
  toggleMenuGroup: (group: 'advanced') => void
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
  setLanguage: (language: 'zh-CN' | 'en-US') => void
  addNotification: (notification: {
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
  }) => void
  removeNotification: (id: string) => void

  // 初始化
  initialize: () => Promise<void>
  refreshAll: () => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  // 初始状态
  version: '1.0.0',
  platform: 'unknown',
  activeMainTab: 'configs',
  sidebarCollapsed: false,
  theme: 'auto',
  language: 'zh-CN',
  expandedMenuGroups: { advanced: true },
  notifications: [],

  // 操作
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleMenuGroup: (group) => set((state) => ({
    expandedMenuGroups: {
      ...state.expandedMenuGroups,
      [group]: !state.expandedMenuGroups[group]
    }
  })),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),

  addNotification: (notification) => {
    const id = Date.now().toString()
    const newNotification = {
      ...notification,
      id,
      timestamp: new Date()
    }

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 5)
    }))

    // 自动移除通知
    setTimeout(() => {
      get().removeNotification(id)
    }, 5000)
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),

  // 初始化应用信息
  initialize: async () => {
    try {
      // 获取应用版本
      const version = await window.electronAPI.app.getVersion()

      // 获取系统信息
      const systemInfo = await window.electronAPI.system.getInfo()

      set({
        version,
        platform: systemInfo.platform
      })

      console.log('App initialized:', { version, platform: systemInfo.platform })
    } catch (error) {
      console.error('Failed to initialize app:', error)
    }
  },

  // 全局刷新所有数据
  refreshAll: async () => {
    try {
      // 这里可以添加刷新所有相关数据的逻辑
      // 例如刷新配置、规则、统计等
      console.log('Refreshing all data...')
      
      // 可以触发其他store的刷新方法
      // 这里暂时只是占位，实际实现需要根据具体需求
      
    } catch (error) {
      console.error('Failed to refresh all data:', error)
      throw error
    }
  }
}))