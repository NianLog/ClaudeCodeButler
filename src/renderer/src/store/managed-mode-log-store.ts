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
  persistThreshold: number // 持久化阈值：达到此数量时触发持久化（默认450）

  // Actions
  addLog: (log: Omit<LogEntry, 'id'>) => void
  clearLogs: () => void
  setMaxEntries: (max: number) => void
  persistLogs: () => Promise<void> // 手动触发持久化
  triggerPersistIfNeeded: () => Promise<void> // 检查并触发持久化

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
  maxEntries: 500, // 默认最多保存500条日志（配合虚拟滚动优化内存占用）
  persistThreshold: 450, // 达到450条时触发持久化，留50条余量避免频繁触发
  isInitialized: false,

  /**
   * 添加日志条目
   * @description 添加日志后自动检查是否需要持久化
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

    // 添加日志后，异步检查是否需要持久化（不阻塞UI）
    setTimeout(() => {
      get().triggerPersistIfNeeded().catch(error => {
        console.error('[ManagedModeLogStore] 自动持久化失败:', error)
      })
    }, 0)
  },

  /**
   * 持久化日志到文件
   * @description 将当前内存中的日志持久化到文件，持久化后保留最新的50条
   */
  persistLogs: async () => {
    const { logs } = get()

    if (logs.length === 0) {
      console.log('[ManagedModeLogStore] 没有日志需要持久化')
      return
    }

    try {
      console.log(`[ManagedModeLogStore] 开始持久化 ${logs.length} 条日志`)

      // 调用IPC方法持久化日志
      // 注意: createSimpleHandler 包装器会将结果包装为 { success: true, data: actualResult }
      const result = await window.electronAPI.managedMode.logRotation.persistLogs(logs)

      // 检查IPC调用本身是否成功
      if (result.success && result.data) {
        // 检查实际的持久化操作是否成功
        if (result.data.success) {
          console.log(`[ManagedModeLogStore] 持久化成功${result.data.rotated ? '（已触发轮转）' : ''}`)

          // 持久化成功后，保留最新的50条日志，其余删除
          const retainCount = 50
          set((state) => ({
            logs: state.logs.slice(-retainCount)
          }))

          console.log(`[ManagedModeLogStore] 已清理内存日志，保留最新 ${retainCount} 条`)
        } else {
          // 持久化操作失败
          console.error('[ManagedModeLogStore] 持久化操作失败:', result.data.error)
        }
      } else {
        // IPC调用失败
        console.error('[ManagedModeLogStore] IPC调用失败:', result.error)
      }
    } catch (error) {
      console.error('[ManagedModeLogStore] 持久化过程出错:', error)
      throw error
    }
  },

  /**
   * 检查并触发持久化
   * @description 当日志数量达到阈值时，自动触发持久化
   */
  triggerPersistIfNeeded: async () => {
    const { logs, persistThreshold } = get()

    // 检查是否达到持久化阈值
    if (logs.length >= persistThreshold) {
      console.log(`[ManagedModeLogStore] 日志数量 (${logs.length}) 达到阈值 (${persistThreshold})，触发持久化`)
      await get().persistLogs()
    }
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
      // 同时调整持久化阈值，保持90%的比例
      const threshold = Math.floor(max * 0.9)
      return {
        maxEntries: max,
        persistThreshold: threshold,
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
