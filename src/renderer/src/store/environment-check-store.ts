/**
 * 环境检测状态管理
 */

import { create } from 'zustand'
import { getTranslation } from '../locales/useTranslation'
import type {
  EnvironmentCheckResult,
  CustomEnvironmentCheck,
  CustomCheckFormData,
  EnvironmentCheckSummary,
  ClaudeCodeVersionInfo
} from '@shared/types/environment'
import type { PredefinedCheckType as PredefinedCheckTypeValue } from '@shared/types/environment'
import { EnvironmentCheckStatus, PredefinedCheckType } from '@shared/types/environment'

const PREDEFINED_CHECKS: Array<{ id: PredefinedCheckTypeValue; type: PredefinedCheckTypeValue; name: string; icon?: string }> = [
  { id: PredefinedCheckType.UV, type: PredefinedCheckType.UV, name: 'UV', icon: '🧪' },
  { id: PredefinedCheckType.CLAUDE_CODE, type: PredefinedCheckType.CLAUDE_CODE, name: 'Claude Code', icon: '🤖' },
  { id: PredefinedCheckType.NODEJS, type: PredefinedCheckType.NODEJS, name: 'Node.js', icon: '🟩' },
  { id: PredefinedCheckType.NPM, type: PredefinedCheckType.NPM, name: 'NPM', icon: '📦' },
  { id: PredefinedCheckType.NPX, type: PredefinedCheckType.NPX, name: 'NPX', icon: '⚡' }
]

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
  checkPredefined: (checkType: PredefinedCheckTypeValue) => Promise<void>
  checkCustom: (customCheck: CustomEnvironmentCheck) => Promise<void>
  checkOne: (checkType: PredefinedCheckTypeValue | 'custom', id: string) => Promise<void>
  refreshAll: (forceRefresh?: boolean) => Promise<void>
  loadCustomChecks: () => Promise<void>
  addCustomCheck: (formData: CustomCheckFormData) => Promise<void>
  updateCustomCheck: (checkId: string, formData: CustomCheckFormData) => Promise<void>
  deleteCustomCheck: (checkId: string) => Promise<void>
  loadClaudeCodeVersion: (forceRefresh?: boolean) => Promise<void>
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
      // 先填充“检查中”占位
      const placeholders = PREDEFINED_CHECKS.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        status: EnvironmentCheckStatus.CHECKING,
        version: undefined,
        error: undefined,
        lastCheckTime: new Date(),
        icon: item.icon,
        isCustom: false
      }))
      set({ predefinedResults: placeholders })

      const updateResult = (resultData: EnvironmentCheckResult) => {
        const { predefinedResults } = get()
        const updatedResults = predefinedResults.map(r =>
          r.id === resultData.id ? { ...r, ...resultData } : r
        )
        set({ predefinedResults: updatedResults })
      }

      const promises = PREDEFINED_CHECKS.map((item) =>
        window.electronAPI.environment.checkPredefined(item.type)
          .then((result: any) => {
            if (result?.success && result.data) {
              updateResult(result.data)
            } else {
              updateResult({
                id: item.id,
                name: item.name,
                type: item.type,
                status: EnvironmentCheckStatus.ERROR,
                error: result?.error || getTranslation('environment.errors.checkFailed'),
                lastCheckTime: new Date(),
                icon: item.icon,
                isCustom: false
              } as EnvironmentCheckResult)
            }
          })
          .catch((error: any) => {
            updateResult({
              id: item.id,
              name: item.name,
              type: item.type,
              status: EnvironmentCheckStatus.ERROR,
              error: String(error),
              lastCheckTime: new Date(),
              icon: item.icon,
              isCustom: false
            } as EnvironmentCheckResult)
          })
      )

      await Promise.allSettled(promises)
      await get().calculateSummary()
    } catch (error) {
      set({ error: String(error) })
    } finally {
      set({ isChecking: false })
    }
  },

  // 检查单个预定义环境
  checkPredefined: async (checkType) => {
    set({ isChecking: true, error: null })
    try {
      // 标记该项为检查中
      const { predefinedResults } = get()
      set({
        predefinedResults: predefinedResults.map(r =>
          r.type === checkType ? { ...r, status: EnvironmentCheckStatus.CHECKING } : r
        )
      })
      const result = await window.electronAPI.environment.checkPredefined(checkType)
      if (result?.success && result.data) {
        const { predefinedResults } = get()
        const updatedResults = predefinedResults.map(r =>
          r.id === result.data?.id ? result.data : r
        )
        set({ predefinedResults: updatedResults, isChecking: false })
        await get().calculateSummary()
      } else {
        set({ error: result?.error || getTranslation('environment.errors.checkFailed'), isChecking: false })
      }
    } catch (error) {
      set({ error: String(error), isChecking: false })
    }
  },

  // 检查单个自定义环境
  checkCustom: async (customCheck) => {
    set({ isChecking: true, error: null })
    try {
      // 标记该项为检查中
      const { customResults } = get()
      const updatedResults = customResults.filter(r => r.id !== customCheck.id)
      updatedResults.push({
        id: customCheck.id,
        name: customCheck.name,
        type: 'custom',
        status: EnvironmentCheckStatus.CHECKING,
        version: undefined,
        error: undefined,
        lastCheckTime: new Date(),
        icon: customCheck.icon,
        isCustom: true
      } as EnvironmentCheckResult)
      set({ customResults: updatedResults })

      const result = await window.electronAPI.environment.checkCustom(customCheck)
      if (result?.success && result.data) {
        const { customResults } = get()
        const updatedResults = customResults.filter(r => r.id !== result.data?.id)
        updatedResults.push(result.data)
        set({ customResults: updatedResults, isChecking: false })
        await get().calculateSummary()
      } else {
        set({ error: result?.error || getTranslation('environment.errors.checkFailed'), isChecking: false })
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
  refreshAll: async (forceRefresh = false) => {
    set({ isChecking: true, error: null })
    // 先填充预定义检查占位
    const placeholders = PREDEFINED_CHECKS.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      status: EnvironmentCheckStatus.CHECKING,
      version: undefined,
      error: undefined,
      lastCheckTime: new Date(),
      icon: item.icon,
      isCustom: false
    }))
    set({ predefinedResults: placeholders })

    // 先把自定义检查标记为检查中
    const { customChecks } = get()
    const customPlaceholders = customChecks.map((check) => ({
      id: check.id,
      name: check.name,
      type: 'custom' as const,
      status: EnvironmentCheckStatus.CHECKING,
      version: undefined,
      error: undefined,
      lastCheckTime: new Date(),
      icon: check.icon,
      isCustom: true
    }))
    set({ customResults: customPlaceholders })

    const predefinedPromise = get().checkAllPredefined()

    const customPromises = customChecks.map((check) =>
      get().checkCustom(check)
    )

    await Promise.allSettled([predefinedPromise, ...customPromises])
    await get().loadClaudeCodeVersion(forceRefresh)
    await get().calculateSummary()
    set({ isChecking: false })
  },

  // 加载自定义检查列表
  loadCustomChecks: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.environment.getCustomChecks()
      if (result?.success) {
        set({ customChecks: result.data || [], isLoading: false })
      } else {
        set({ error: result?.error || getTranslation('environment.errors.loadFailed'), isLoading: false })
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
        const errorMessage = result?.error || getTranslation('environment.errors.addFailed')
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
        const errorMessage = result?.error || getTranslation('environment.errors.updateFailed')
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
        const errorMessage = result?.error || getTranslation('environment.errors.deleteFailed')
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
  loadClaudeCodeVersion: async (forceRefresh = false) => {
    set({ isChecking: true })
    try {
      const result = await window.electronAPI.claudeCodeVersion.checkUpdates(forceRefresh)
      if (result.success && result.data) {
        // 将 claudeCodeVersion 的数据格式转换为 EnvironmentCheckPanel 需要的格式
        const versionInfo = {
          version: result.data.current || getTranslation('common.unknown'),
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
    } finally {
      set({ isChecking: false })
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
