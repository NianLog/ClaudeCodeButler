/**
 * 子Agent管理状态管理
 */

import { create } from 'zustand'
import type {
  AgentFile,
  AgentFormData,
  AgentImportOptions
} from '@shared/types/agents'

/**
 * Agent管理状态接口
 */
interface AgentsManagementState {
  // 状态
  agents: AgentFile[]
  isLoading: boolean
  error: string | null

  // UI状态
  selectedAgent: AgentFile | null
  isDetailDrawerOpen: boolean
  isFormModalOpen: boolean
  isImportModalOpen: boolean
  formMode: 'add' | 'edit'
  editingAgent: AgentFile | null

  // 操作
  loadAgents: () => Promise<void>
  getAgent: (agentId: string) => Promise<AgentFile | null>
  addAgent: (formData: AgentFormData) => Promise<void>
  updateAgent: (agentId: string, formData: AgentFormData) => Promise<void>
  deleteAgent: (agentId: string) => Promise<void>
  importAgent: (sourceFilePath: string, options?: AgentImportOptions) => Promise<{
    success: boolean
    agentId?: string
    error?: string
  }>
  importAgentContent: (content: string, options?: AgentImportOptions) => Promise<{
    success: boolean
    agentId?: string
    error?: string
  }>
  batchImportAgents: (sourceFilePaths: string[], options?: AgentImportOptions) => Promise<{
    success: boolean
    imported?: string[]
    errors?: Array<{ path: string; error: string }>
    error?: string
  }>
  batchImportAgentsContent: (contents: Array<{ name?: string; content: string }>, options?: AgentImportOptions) => Promise<{
    success: boolean
    imported?: string[]
    errors?: Array<{ path: string; error: string }>
    error?: string
  }>

  // UI操作
  openDetailDrawer: (agent: AgentFile) => void
  closeDetailDrawer: () => void
  openAddModal: () => void
  openEditModal: (agent: AgentFile) => void
  closeFormModal: () => void
  openImportModal: () => void
  closeImportModal: () => void
}

/**
 * Agent管理Store
 */
export const useAgentsManagementStore = create<AgentsManagementState>((set, get) => ({
  // 初始状态
  agents: [],
  isLoading: false,
  error: null,
  selectedAgent: null,
  isDetailDrawerOpen: false,
  isFormModalOpen: false,
  isImportModalOpen: false,
  formMode: 'add',
  editingAgent: null,

  // 加载所有Agent
  loadAgents: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.scan()
      if (result?.success) {
        set({ agents: result.data || [], isLoading: false })
      } else {
        set({ error: result?.error || '加载失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 获取单个Agent
  getAgent: async (agentId) => {
    try {
      const result = await window.electronAPI.agents.get(agentId)
      if (result?.success && result.data) {
        return result.data
      }
      return null
    } catch (error) {
      console.error('获取Agent失败:', error)
      return null
    }
  },

  // 添加Agent
  addAgent: async (formData) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.add(formData)
      if (result?.success) {
        set({ isFormModalOpen: false })
        await get().loadAgents()
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

  // 更新Agent（通过删除+重新添加实现）
  updateAgent: async (agentId, formData) => {
    set({ isLoading: true, error: null })
    try {
      // 先删除旧Agent
      const deleteResult = await window.electronAPI.agents.delete(agentId)
      if (!deleteResult?.success) {
        const errorMessage = deleteResult?.error || '删除旧Agent失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }

      // 添加新Agent
      const addResult = await window.electronAPI.agents.add(formData)
      if (addResult?.success) {
        set({ isFormModalOpen: false })
        await get().loadAgents()
      } else {
        const errorMessage = addResult?.error || '添加新Agent失败'
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

  // 删除Agent
  deleteAgent: async (agentId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.delete(agentId)
      if (result?.success) {
        await get().loadAgents()
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

  // 导入单个Agent
  importAgent: async (sourceFilePath, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.import(sourceFilePath, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadAgents()
        // 返回组件期望的格式
        return { success: true, agentId: result.data }
      } else {
        const errorMessage = result?.error || '导入失败'
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

  // 导入Agent内容
  importAgentContent: async (content, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.importContent(content, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadAgents()
        return { success: true, agentId: result.data }
      }
      const errorMessage = result?.error || '导入失败'
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isLoading: false })
    }
  },

  // 批量导入Agent
  batchImportAgents: async (sourceFilePaths, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.batchImport(sourceFilePaths, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadAgents()
        if (result.data?.errors && result.data.errors.length > 0) {
          console.warn('部分导入失败:', result.data.errors)
        }
        // 返回组件期望的格式
        return { success: true, ...result.data }
      } else {
        const errorMessage = result?.error || '批量导入失败'
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

  // 批量导入Agent内容
  batchImportAgentsContent: async (contents, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.agents.batchImportContent(contents, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadAgents()
        if (result.data?.errors && result.data.errors.length > 0) {
          console.warn('部分导入失败:', result.data.errors)
        }
        return { success: true, ...result.data }
      }
      const errorMessage = result?.error || '批量导入失败'
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isLoading: false })
    }
  },

  // UI操作
  openDetailDrawer: (agent) => {
    set({
      selectedAgent: agent,
      isDetailDrawerOpen: true
    })
  },

  closeDetailDrawer: () => {
    set({
      selectedAgent: null,
      isDetailDrawerOpen: false
    })
  },

  openAddModal: () => {
    set({
      formMode: 'add',
      editingAgent: null,
      isFormModalOpen: true
    })
  },

  openEditModal: (agent) => {
    set({
      formMode: 'edit',
      editingAgent: agent,
      isFormModalOpen: true
    })
  },

  closeFormModal: () => {
    set({
      formMode: 'add',
      editingAgent: null,
      isFormModalOpen: false
    })
  },

  openImportModal: () => {
    set({ isImportModalOpen: true })
  },

  closeImportModal: () => {
    set({ isImportModalOpen: false })
  }
}))
