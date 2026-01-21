/**
 * 环境检测状态管理
 */

import { create } from 'zustand'
import type {
  EnvironmentCheckResult,
  CustomEnvironmentCheck,
  CustomCheckFormData,
  EnvironmentCheckSummary,
  PredefinedCheckType,
  ClaudeCodeVersionInfo
} from '@shared/types/environment'

/**
 * 环境检测状态接口
 */
interface EnvironmentCheckState {
  // 状态
  predefinedResults: EnvironmentCheckResult[]
  customChecks: CustomEnvironmentCheck[]
  customResults: EnvironmentCheckResult[]
  claudeCodeVersion: ClaudeCodeVersionInfo | null
  summary: EnvironmentCheckSummary | null
  isLoading: boolean
  isChecking: boolean
  error: string | null

  // UI状态
  isCustomCheckModalOpen: boolean
  editingCustomCheck: CustomEnvironmentCheck | null

  // 操作
  checkAllPredefined: () => Promise<void>
  checkPredefined: (checkType: PredefinedCheckType) => Promise<void>
  checkCustom: (customCheck: CustomEnvironmentCheck) => Promise<void>
  checkOne: (checkType: PredefinedCheckType | 'custom', id: string) => Promise<void>
  refreshAll: () => Promise<void>
  loadCustomChecks: () => Promise<void>
  addCustomCheck: (formData: CustomCheckFormData) => Promise<void>
  updateCustomCheck: (checkId: string, formData: CustomCheckFormData) => Promise<void>
  deleteCustomCheck: (checkId: string) => Promise<void>
  loadClaudeCodeVersion: () => Promise<void>
  calculateSummary: () => Promise<void>

  // UI操作
  openCustomCheckModal: () => void
  closeCustomCheckModal: () => void
  editCustomCheck: (check: CustomEnvironmentCheck) => void
}

/**
 * 环境检测Store
 */
export const useEnvironmentCheckStore = create<EnvironmentCheckState>((set, get) => ({
  // 初始状态
  predefinedResults: [],
  customChecks: [],
  customResults: [],
  claudeCodeVersion: null,
  summary: null,
  isLoading: false,
  isChecking: false,
  error: null,
  isCustomCheckModalOpen: false,
  editingCustomCheck: null,

  // 检查所有预定义环境
  checkAllPredefined: async () => {
    set({ isChecking: true, error: null })
    try {
      const result = await window.electronAPI.environment.checkAllPredefined()
      if (result?.success && result.data) {
        set({ predefinedResults: result.data, isChecking: false })
        await get().calculateSummary()
      } else {
        set({ error: result?.error || '检查失败', isChecking: false })
      }
    } catch (error) {
      set({ error: String(error), isChecking: false })
    }
  },

  // 检查单个预定义环境
  checkPredefined: async (checkType) => {
    set({ isChecking: true, error: null })
    try {
      const result = await window.electronAPI.environment.checkPredefined(checkType)
      if (result?.success && result.data) {
        const { predefinedResults } = get()
        const updatedResults = predefinedResults.map(r =>
          r.id === result.data?.id ? result.data : r
        )
        set({ predefinedResults: updatedResults, isChecking: false })
        await get().calculateSummary()
      } else {
        set({ error: result?.error || '检查失败', isChecking: false })
      }
    } catch (error) {
      set({ error: String(error), isChecking: false })
    }
  },

  // 检查单个自定义环境
  checkCustom: async (customCheck) => {
    set({ isChecking: true, error: null })
    try {
      const result = await window.electronAPI.environment.checkCustom(customCheck)
      if (result?.success && result.data) {
        const { customResults } = get()
        const updatedResults = customResults.filter(r => r.id !== result.data?.id)
        updatedResults.push(result.data)
        set({ customResults: updatedResults, isChecking: false })
        await get().calculateSummary()
      } else {
        set({ error: result?.error || '检查失败', isChecking: false })
      }
    } catch (error) {
      set({ error: String(error), isChecking: false })
    }
  },

  // 检查单个（预定义或自定义）
  checkOne: async (checkType, id) => {
    if (checkType === 'custom') {
      const customCheck = get().customChecks.find(c => c.id === id)
      if (customCheck) {
        await get().checkCustom(customCheck)
      }
    } else {
      await get().checkPredefined(id as PredefinedCheckType)
    }
  },

  // 刷新所有检查
  refreshAll: async () => {
    await get().checkAllPredefined()
    // 刷新所有自定义检查
    const { customChecks } = get()
    for (const check of customChecks) {
      await get().checkCustom(check)
    }
    await get().loadClaudeCodeVersion()
  },

  // 加载自定义检查列表
  loadCustomChecks: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.environment.getCustomChecks()
      if (result?.success) {
        set({ customChecks: result.data || [], isLoading: false })
      } else {
        set({ error: result?.error || '加载失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 添加自定义检查
  addCustomCheck: async (formData) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.environment.addCustomCheck(formData)
      if (result?.success) {
        set({ isCustomCheckModalOpen: false })
        await get().loadCustomChecks()
      } else {
        const errorMessage = result?.error || '添加失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isLoading: false })
    }
  },

  // 更新自定义检查
  updateCustomCheck: async (checkId, formData) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.environment.updateCustomCheck(checkId, formData)
      if (result?.success) {
        set({ isCustomCheckModalOpen: false })
        await get().loadCustomChecks()
      } else {
        const errorMessage = result?.error || '更新失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isLoading: false })
    }
  },

  // 删除自定义检查
  deleteCustomCheck: async (checkId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.environment.deleteCustomCheck(checkId)
      if (result?.success) {
        await get().loadCustomChecks()
        // 从customResults中移除
        const { customResults } = get()
        set({ customResults: customResults.filter(r => r.id !== checkId) })
      } else {
        const errorMessage = result?.error || '删除失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isLoading: false })
    }
  },

  // 加载Claude Code版本信息（使用与Statistics页面相同的API）
  loadClaudeCodeVersion: async () => {
    try {
      const result = await window.electronAPI.claudeCodeVersion.checkUpdates(false)
      if (result.success && result.data) {
        // 将 claudeCodeVersion 的数据格式转换为 EnvironmentCheckPanel 需要的格式
        const versionInfo = {
          version: result.data.current || '未知',
          path: '~/.claude/',
          lastUpdated: new Date().toISOString(),
          current: result.data.current,
          latest: result.data.latest,
          updateAvailable: result.data.updateAvailable,
          changelog: result.data.changelog
        }
        set({ claudeCodeVersion: versionInfo })
      }
    } catch (error) {
      console.error('加载Claude Code版本失败:', error)
    }
  },

  // 计算汇总统计
  calculateSummary: async () => {
    try {
      const { predefinedResults, customResults } = get()
      const allResults = [...predefinedResults, ...customResults]
      const result = await window.electronAPI.environment.calculateSummary(allResults)
      if (result.success && result.data) {
        set({ summary: result.data })
      }
    } catch (error) {
      console.error('计算汇总失败:', error)
    }
  },

  // UI操作
  openCustomCheckModal: () => {
    set({
      isCustomCheckModalOpen: true,
      editingCustomCheck: null
    })
  },

  closeCustomCheckModal: () => {
    set({
      isCustomCheckModalOpen: false,
      editingCustomCheck: null
    })
  },

  editCustomCheck: (check) => {
    set({
      editingCustomCheck: check,
      isCustomCheckModalOpen: true
    })
  }
}))
