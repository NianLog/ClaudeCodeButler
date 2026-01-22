/**
 * 规则管理状态
 * 管理自动化规则相关的状态和操作
 */

import { create } from 'zustand'
import { AutomationRule, RuleExecutionLog } from '@shared/types/rules'

interface RuleStore {
  // 状态
  rules: AutomationRule[]
  selectedRule: AutomationRule | null
  isLoading: boolean
  error: string | null
  executionLogs: RuleExecutionLog[]
  stats: Record<string, any>

  // 操作
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setRules: (rules: AutomationRule[]) => void
  setSelectedRule: (rule: AutomationRule | null) => void
  setExecutionLogs: (logs: RuleExecutionLog[]) => void
  setStats: (stats: Record<string, any>) => void

  // 规则操作
  refreshRules: () => Promise<void>
  createRule: (rule: Partial<AutomationRule>) => Promise<void>
  updateRule: (id: string, updates: Partial<AutomationRule>) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  toggleRule: (id: string, enabled: boolean) => Promise<void>
  executeRule: (id: string) => Promise<any>

  // 日志和统计
  loadExecutionLogs: () => Promise<void>
  loadStats: () => Promise<void>
}

export const useRuleStore = create<RuleStore>((set, get) => ({
  // 初始状态
  rules: [],
  selectedRule: null,
  isLoading: false,
  error: null,
  executionLogs: [],
  stats: {},

  // 基础设置
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setRules: (rules) => set({ rules }),
  setSelectedRule: (rule) => set({ selectedRule: rule }),
  setExecutionLogs: (logs) => set({ executionLogs: logs }),
  setStats: (stats) => set({ stats }),

  // 刷新规则列表
  refreshRules: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.list()

      if ((response as any)?.success) {
        set({ rules: (response as any).data })
      } else {
        set({ error: (response as any)?.error || '加载规则列表失败' })
      }
    } catch (error) {
      console.error('Failed to refresh rules:', error)
      set({ error: '加载规则列表失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 创建规则
  createRule: async (ruleData) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.create(ruleData)

      if ((response as any)?.success) {
        await get().refreshRules()
      } else {
        set({ error: (response as any)?.error || '创建规则失败' })
      }
    } catch (error) {
      console.error('Failed to create rule:', error)
      set({ error: '创建规则失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 更新规则
  updateRule: async (id, updates) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.update(id, updates)

      if ((response as any)?.success) {
        await get().refreshRules()

        const updatedRule = get().rules.find(r => r.id === id)
        if (updatedRule && get().selectedRule?.id === id) {
          set({ selectedRule: updatedRule })
        }
      } else {
        set({ error: (response as any)?.error || '更新规则失败' })
      }
    } catch (error) {
      console.error('Failed to update rule:', error)
      set({ error: '更新规则失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 删除规则
  deleteRule: async (id) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.delete(id)

      if ((response as any)?.success) {
        await get().refreshRules()

        if (get().selectedRule?.id === id) {
          set({ selectedRule: null })
        }
      } else {
        set({ error: (response as any)?.error || '删除规则失败' })
      }
    } catch (error) {
      console.error('Failed to delete rule:', error)
      set({ error: '删除规则失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 切换规则状态
  toggleRule: async (id, enabled) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.toggle(id, enabled)

      if ((response as any)?.success) {
        await get().refreshRules()
      } else {
        set({ error: (response as any)?.error || '切换规则状态失败' })
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error)
      set({ error: '切换规则状态失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 执行规则
  executeRule: async (id) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.rule.execute(id)

      if ((response as any)?.success) {
        await get().loadExecutionLogs()
        await get().loadStats()
        return (response as any).data
      } else {
        const errorMessage = (response as any)?.error || '执行规则失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      console.error('Failed to execute rule:', error)
      set({ error: '执行规则失败' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  // 加载执行日志
  loadExecutionLogs: async () => {
    try {
      const response = await window.electronAPI.rule.getExecutionLog(50)

      if ((response as any)?.success) {
        set({ executionLogs: (response as any).data })
      }
    } catch (error) {
      console.error('Failed to load execution logs:', error)
    }
  },

  // 加载统计信息
  loadStats: async () => {
    try {
      const response = await window.electronAPI.rule.getStats()

      if ((response as any)?.success) {
        set({ stats: (response as any).data })
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }
}))