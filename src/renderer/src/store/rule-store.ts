/**
 * 规则管理状态
 * 管理自动化规则相关的状态和操作
 */

import { create } from 'zustand'
import { AutomationRule, RuleExecutionLog } from '@shared/types/rules'

/** 规则操作的统一响应包装类型（兼容旧式 { success, data, error } 返回） */
type RuleResponse<T = unknown> = { success?: boolean; data?: T; error?: string }

/** 从响应中提取数据或错误信息 */
const unwrapRuleResponse = <T>(response: RuleResponse<T> | undefined | null): { ok: boolean; data?: T; error?: string } => {
  if (!response) return { ok: false }
  return {
    ok: Boolean(response.success),
    data: response.data,
    error: response.error
  }
}

interface RuleStore {
  // 状态
  rules: AutomationRule[]
  selectedRule: AutomationRule | null
  isLoading: boolean
  error: string | null
  executionLogs: RuleExecutionLog[]
  stats: Record<string, unknown>

  // 操作
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setRules: (rules: AutomationRule[]) => void
  setSelectedRule: (rule: AutomationRule | null) => void
  setExecutionLogs: (logs: RuleExecutionLog[]) => void
  setStats: (stats: Record<string, unknown>) => void

  // 规则操作
  refreshRules: () => Promise<void>
  createRule: (rule: Partial<AutomationRule>) => Promise<void>
  updateRule: (id: string, updates: Partial<AutomationRule>) => Promise<void>
  deleteRule: (id: string) => Promise<void>
  toggleRule: (id: string, enabled: boolean) => Promise<void>
  executeRule: (id: string) => Promise<unknown>

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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<AutomationRule[]>)

      if (result.ok) {
        set({ rules: result.data ?? [] })
      } else {
        set({ error: result.error || '加载规则列表失败' })
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<unknown>)

      if (result.ok) {
        await get().refreshRules()
      } else {
        set({ error: result.error || '创建规则失败' })
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<unknown>)

      if (result.ok) {
        await get().refreshRules()

        const updatedRule = get().rules.find(r => r.id === id)
        if (updatedRule && get().selectedRule?.id === id) {
          set({ selectedRule: updatedRule })
        }
      } else {
        set({ error: result.error || '更新规则失败' })
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<unknown>)

      if (result.ok) {
        await get().refreshRules()

        if (get().selectedRule?.id === id) {
          set({ selectedRule: null })
        }
      } else {
        set({ error: result.error || '删除规则失败' })
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<unknown>)

      if (result.ok) {
        await get().refreshRules()
      } else {
        set({ error: result.error || '切换规则状态失败' })
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<unknown>)

      if (result.ok) {
        await get().loadExecutionLogs()
        await get().loadStats()
        return result.data
      } else {
        const errorMessage = result.error || '执行规则失败'
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
      const result = unwrapRuleResponse(response as unknown as RuleResponse<RuleExecutionLog[]>)

      if (result.ok && result.data) {
        set({ executionLogs: result.data })
      }
    } catch (error) {
      console.error('Failed to load execution logs:', error)
    }
  },

  // 加载统计信息
  loadStats: async () => {
    try {
      const response = await window.electronAPI.rule.getStats()
      const result = unwrapRuleResponse(response as unknown as RuleResponse<Record<string, unknown>>)

      if (result.ok && result.data) {
        set({ stats: result.data })
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }
}))
