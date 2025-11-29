/**
 * 托管模式日志全局状态管理
 * @description 在应用级别管理托管模式日志的收集和存储，确保即使用户未进入日志页面，日志也在后台持续收集
 * @reference https://github.com/pmndrs/zustand
 * @reference https://stackoverflow.com/questions/78162656/zustand-and-event-listerners
 */

import { create } from 'zustand'
import type { LogLevel } from '@shared/types/managed-mode'

/**
 * 日志条目接口
 */
export interface LogEntry {
  id: string
  timestamp: number
  level: LogLevel
  type: 'request' | 'response' | 'system' | 'error'
  message: string
  data?: {
    method?: string
    url?: string
    statusCode?: number
    duration?: number
    headers?: Record<string, string>
    body?: any
    error?: string
  }
  source?: string
}

/**
 * 托管模式日志状态接口
 */
interface ManagedModeLogState {
  // 日志数据
  logs: LogEntry[]

  // 统计数据
  normalLogCount: number
  errorLogCount: number

  // 配置
  maxEntries: number

  // Actions
  addLog: (log: Omit<LogEntry, 'id'>) => void
  clearLogs: () => void
  setMaxEntries: (max: number) => void

  // 初始化标记
  isInitialized: boolean
  setInitialized: (initialized: boolean) => void
}

/**
 * 托管模式日志Store
 * @description 全局日志状态管理，在应用启动时初始化监听器
 */
export const useManagedModeLogStore = create<ManagedModeLogState>((set, get) => ({
  // 初始状态
  logs: [],
  normalLogCount: 0,
  errorLogCount: 0,
  maxEntries: 2000, // 默认最多保存2000条日志
  isInitialized: false,

  /**
   * 添加日志条目
   */
  addLog: (log: Omit<LogEntry, 'id'>) => {
    const newLog: LogEntry = {
      ...log,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    set((state) => {
      const updatedLogs = [...state.logs, newLog]

      // 限制日志条目数量，防止内存占用过多
      const finalLogs = updatedLogs.length > state.maxEntries
        ? updatedLogs.slice(-state.maxEntries)
        : updatedLogs

      // 更新统计数据
      let normalCount = state.normalLogCount
      let errorCount = state.errorLogCount

      // 错误日志判断：type为error 或 level为error 或 响应状态码>=400
      const isError = log.type === 'error'
        || log.level === 'error'
        || (log.data?.statusCode && log.data.statusCode >= 400)

      if (isError) {
        errorCount++
      } else if (log.type === 'request' || log.type === 'response' || log.type === 'system') {
        normalCount++
      }

      return {
        logs: finalLogs,
        normalLogCount: normalCount,
        errorLogCount: errorCount
      }
    })
  },

  /**
   * 清空日志
   */
  clearLogs: () => {
    set({
      logs: [],
      normalLogCount: 0,
      errorLogCount: 0
    })
  },

  /**
   * 设置最大日志条目数
   */
  setMaxEntries: (max: number) => {
    set((state) => {
      const logs = state.logs.length > max ? state.logs.slice(-max) : state.logs
      return {
        maxEntries: max,
        logs
      }
    })
  },

  /**
   * 设置初始化状态
   */
  setInitialized: (initialized: boolean) => {
    set({ isInitialized: initialized })
  }
}))

/**
 * 初始化托管模式日志监听器
 * @description 在应用启动时调用，设置全局日志事件监听
 * @returns 清理函数，用于卸载监听器
 */
export const initializeManagedModeLogListener = (): (() => void) => {
  const store = useManagedModeLogStore.getState()

  // 防止重复初始化
  if (store.isInitialized) {
    console.warn('[ManagedModeLogStore] 日志监听器已初始化，跳过重复初始化')
    return () => {}
  }

  console.log('[ManagedModeLogStore] 初始化托管模式日志监听器')

  /**
   * 日志事件处理函数
   */
  const handleManagedModeLog = (event: any) => {
    store.addLog({
      timestamp: event.timestamp || Date.now(),
      level: event.level || 'info',
      type: event.type || 'system',
      source: event.source || 'managed-mode-proxy',
      message: event.message || '',
      data: event.data || null
    })
  }

  // 注册监听器
  const unsubscribe = window.electronAPI.managedMode.onLog?.(handleManagedModeLog)

  // 标记为已初始化
  store.setInitialized(true)

  console.log('[ManagedModeLogStore] 托管模式日志监听器初始化完成')

  // 返回清理函数
  return () => {
    if (unsubscribe) {
      unsubscribe()
      console.log('[ManagedModeLogStore] 托管模式日志监听器已卸载')
    }
    store.setInitialized(false)
  }
}
