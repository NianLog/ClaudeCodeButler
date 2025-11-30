/**
 * MCP管理Store
 * @description 使用Zustand管理MCP服务器的状态和操作
 */

import { create } from 'zustand'
import type {
  MCPServerListItem,
  MCPServerFormData,
  ClaudeConfig,
  MCPServerConfig
} from '@shared/types/mcp'

/**
 * MCP管理状态接口
 */
interface MCPManagementState {
  // 状态
  servers: MCPServerListItem[]
  globalServers: Record<string, MCPServerConfig>
  projectPaths: string[]
  selectedScope: string
  selectedServerId: string | null
  isLoading: boolean
  error: string | null
  isServerModalOpen: boolean
  modalMode: 'add' | 'edit'
  editingServer: MCPServerListItem | null
  claudeConfig: ClaudeConfig | null
  isJsonViewOpen: boolean

  // 操作
  loadAllServers: () => Promise<void>
  loadGlobalServers: () => Promise<void>
  loadProjectServers: (projectPath: string) => Promise<void>
  loadProjectPaths: () => Promise<void>
  addOrUpdateServer: (formData: MCPServerFormData) => Promise<void>
  deleteServer: (serverId: string, scope: string) => Promise<void>
  toggleServer: (serverId: string, scope: string) => Promise<void>
  duplicateServer: (serverId: string, scope: string, newServerId: string, targetScope: string) => Promise<void>
  exportServerConfig: (serverId: string, scope: string) => Promise<string>
  importServerConfig: (jsonString: string, serverId: string, targetScope: string) => Promise<void>
  readClaudeConfig: () => Promise<void>
  saveClaudeConfig: (config: ClaudeConfig) => Promise<void>

  // UI状态管理
  setSelectedScope: (scope: string) => void
  setSelectedServerId: (serverId: string | null) => void
  openServerModal: (mode: 'add' | 'edit', server?: MCPServerListItem) => void
  closeServerModal: () => void
  toggleJsonView: () => void
  setError: (error: string | null) => void
  clearError: () => void
}

/**
 * MCP管理Store
 */
export const useMCPManagementStore = create<MCPManagementState>((set, get) => ({
  // 初始状态
  servers: [],
  globalServers: {},
  projectPaths: [],
  selectedScope: 'global',
  selectedServerId: null,
  isLoading: false,
  error: null,
  isServerModalOpen: false,
  modalMode: 'add',
  editingServer: null,
  claudeConfig: null,
  isJsonViewOpen: false,

  // 加载所有MCP服务器
  loadAllServers: async () => {
    console.log('[MCP Store] 开始加载所有MCP服务器...')
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.listAllServers()
      console.log('[MCP Store] IPC调用结果:', result)

      if (result.success) {
        // 确保 servers 始终是数组
        const serverList = Array.isArray(result.data) ? result.data : []
        console.log('[MCP Store] 成功加载服务器列表，共', serverList.length, '个服务器')
        console.log('[MCP Store] 服务器详情:', JSON.stringify(serverList, null, 2))
        set({ servers: serverList, isLoading: false })
      } else {
        console.error('[MCP Store] 加载失败:', result.error)
        set({ error: result.error || '加载服务器列表失败', servers: [], isLoading: false })
      }
    } catch (error) {
      console.error('[MCP Store] 加载异常:', error)
      set({ error: String(error), servers: [], isLoading: false })
    }
  },

  // 加载全局MCP服务器
  loadGlobalServers: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.getGlobalServers()
      if (result.success) {
        set({ globalServers: result.data || {}, isLoading: false })
      } else {
        set({ error: result.error || '加载全局服务器失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 加载项目级MCP服务器
  loadProjectServers: async (projectPath: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.getProjectServers(projectPath)
      if (result.success) {
        set({ isLoading: false })
        // 可以根据需要存储项目服务器
      } else {
        set({ error: result.error || '加载项目服务器失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 加载项目路径列表
  loadProjectPaths: async () => {
    console.log('[MCP Store] 开始加载项目路径...')
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.getProjectPaths()
      console.log('[MCP Store] 项目路径IPC调用结果:', result)

      if (result.success) {
        // 确保 projectPaths 始终是数组
        const paths = Array.isArray(result.data) ? result.data : []
        console.log('[MCP Store] 成功加载项目路径，共', paths.length, '个项目')
        console.log('[MCP Store] 项目路径列表:', paths)
        set({ projectPaths: paths, isLoading: false })
      } else {
        console.error('[MCP Store] 加载项目路径失败:', result.error)
        set({ error: result.error || '加载项目路径失败', projectPaths: [], isLoading: false })
      }
    } catch (error) {
      console.error('[MCP Store] 加载项目路径异常:', error)
      set({ error: String(error), projectPaths: [], isLoading: false })
    }
  },

  // 添加或更新MCP服务器
  addOrUpdateServer: async (formData: MCPServerFormData) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.addOrUpdateServer(formData)
      if (result.success) {
        set({ isLoading: false, isServerModalOpen: false, editingServer: null })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '保存服务器失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 删除MCP服务器
  deleteServer: async (serverId: string, scope: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.deleteServer(serverId, scope)
      if (result.success) {
        set({ isLoading: false })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '删除服务器失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 切换MCP服务器启用状态
  toggleServer: async (serverId: string, scope: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.toggleServer(serverId, scope)
      if (result.success) {
        set({ isLoading: false })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '切换服务器状态失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 复制MCP服务器
  duplicateServer: async (serverId: string, scope: string, newServerId: string, targetScope: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.duplicateServer(serverId, scope, newServerId, targetScope)
      if (result.success) {
        set({ isLoading: false })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '复制服务器失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 导出服务器配置
  exportServerConfig: async (serverId: string, scope: string): Promise<string> => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.exportServerConfig(serverId, scope)
      if (result.success) {
        set({ isLoading: false })
        return result.data || ''
      } else {
        set({ error: result.error || '导出配置失败', isLoading: false })
        throw new Error(result.error || '导出配置失败')
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
      throw error
    }
  },

  // 导入服务器配置
  importServerConfig: async (jsonString: string, serverId: string, targetScope: string) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.importServerConfig(jsonString, serverId, targetScope)
      if (result.success) {
        set({ isLoading: false })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '导入配置失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 读取Claude配置文件
  readClaudeConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.readClaudeConfig()
      if (result.success) {
        set({ claudeConfig: result.data || null, isLoading: false })
      } else {
        set({ error: result.error || '读取Claude配置失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 保存Claude配置文件
  saveClaudeConfig: async (config: ClaudeConfig) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.mcp.saveClaudeConfig(config)
      if (result.success) {
        set({ claudeConfig: config, isLoading: false })
        // 重新加载服务器列表
        await get().loadAllServers()
      } else {
        set({ error: result.error || '保存Claude配置失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 设置选中的范围
  setSelectedScope: (scope: string) => {
    set({ selectedScope: scope })
  },

  // 设置选中的服务器ID
  setSelectedServerId: (serverId: string | null) => {
    set({ selectedServerId: serverId })
  },

  // 打开服务器模态框
  openServerModal: (mode: 'add' | 'edit', server?: MCPServerListItem) => {
    set({
      isServerModalOpen: true,
      modalMode: mode,
      editingServer: server || null
    })
  },

  // 关闭服务器模态框
  closeServerModal: () => {
    set({
      isServerModalOpen: false,
      modalMode: 'add',
      editingServer: null
    })
  },

  // 切换JSON视图
  toggleJsonView: () => {
    set(state => ({ isJsonViewOpen: !state.isJsonViewOpen }))
  },

  // 设置错误
  setError: (error: string | null) => {
    set({ error })
  },

  // 清除错误
  clearError: () => {
    set({ error: null })
  }
}))
