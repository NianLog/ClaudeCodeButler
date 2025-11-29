/**
 * 配置列表状态管理
 * 专门管理配置文件列表相关的状态和操作
 */

import { create } from 'zustand'
import { ConfigFile } from '@shared/types'

/**
 * 配置文件过滤器接口
 * 统一管理所有筛选条件
 */
interface ConfigFilters {
  /** 搜索关键词 */
  search?: string
  /** 配置类型筛选 */
  type?: string
  /** 排序方式 */
  sort?: 'name' | 'lastModified' | 'size' | 'type'
}

/**
 * 配置列表Store接口
 */
interface ConfigListStore {
  // 状态
  configs: ConfigFile[]
  selectedConfig: ConfigFile | null
  isLoading: boolean
  error: string | null
  /** 统一的过滤器配置 */
  filters: ConfigFilters

  // 基础操作
  setConfigs: (configs: ConfigFile[]) => void
  setSelectedConfig: (config: ConfigFile | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  /** 设置过滤器(支持部分更新) */
  setFilters: (filters: Partial<ConfigFilters>) => void
  /** 重置所有过滤器 */
  resetFilters: () => void

  // 配置操作
  refreshConfigs: () => Promise<void>
  createConfig: (name: string, template?: string) => Promise<void>
  deleteConfig: (config: ConfigFile) => Promise<void>
  deleteConfigById: (id: string) => Promise<void>
  duplicateConfig: (id: string) => Promise<void>
  exportConfig: (id: string) => Promise<void>

  // 通知相关操作（由外部注入）
  addNotification?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void

  // 过滤配置
  filteredConfigs: () => ConfigFile[]
}

export const useConfigListStore = create<ConfigListStore>((set, get) => ({
  // 初始状态
  configs: [],
  selectedConfig: null,
  isLoading: false,
  error: null,
  filters: {
    search: '',
    type: undefined,
    sort: 'lastModified'
  },

  // 基础设置
  setConfigs: (configs) => set({ configs }),
  setSelectedConfig: (config) => set({ selectedConfig: config }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),
  resetFilters: () => set({
    filters: {
      search: '',
      type: undefined,
      sort: 'lastModified'
    }
  }),

  // 刷新配置列表
  refreshConfigs: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.config.list()
      
      // 处理IPC响应格式
      let configs = []
      if (response && typeof response === 'object' && 'success' in response && response.success && 'data' in response) {
        configs = Array.isArray(response.data) ? response.data : []
      } else if (Array.isArray(response)) {
        // 兼容旧格式
        configs = response
      } else {
        console.warn('Unexpected response format:', response)
        configs = []
      }

      console.log('Loaded configs:', configs.length, configs)

      // 自动比对和更新Claude Code配置状态
      try {
        console.log('🔄 开始调用 autoUpdateClaudeCodeStatus...')
        const updateResponse = await window.electronAPI.config.autoUpdateClaudeCodeStatus()
        console.log('📦 autoUpdateClaudeCodeStatus响应:', updateResponse)

        if (updateResponse && typeof updateResponse === 'object' && 'success' in updateResponse && updateResponse.success && 'data' in updateResponse) {
          const updatedConfigs = (updateResponse.data as any).updatedConfigs
          const totalConfigs = (updateResponse.data as any).totalConfigs
          console.log(`✅ 自动比对完成: 更新了 ${updatedConfigs} 个配置，总共 ${totalConfigs} 个配置`)

          if (updatedConfigs > 0) {
            console.log(`🔄 重新获取配置列表以反映更新...`)

            // 发送配置变更通知
            const addNotification = get().addNotification
            if (addNotification) {
              addNotification({
                type: 'info',
                title: '配置状态更新',
                message: `检测到 ${updatedConfigs} 个配置文件状态发生变化，已自动更新`
              })
            }

            // 重新获取配置列表以反映更新
            const freshResponse = await window.electronAPI.config.list()
            let freshConfigs = []
            if (freshResponse && typeof freshResponse === 'object' && 'success' in freshResponse && freshResponse.success && 'data' in freshResponse) {
              freshConfigs = Array.isArray(freshResponse.data) ? freshResponse.data : []
            } else if (Array.isArray(freshResponse)) {
              freshConfigs = freshResponse
            }
            console.log(`✅ 刷新后的配置列表:`, freshConfigs.map(c => ({ name: c.name, isInUse: c.isInUse, isActive: c.isActive })))
            set({ configs: freshConfigs })
          } else {
            console.log(`ℹ️ 没有配置需要更新，使用原配置列表`)
            set({ configs })
          }
        } else {
          console.warn('⚠️ autoUpdateClaudeCodeStatus响应格式不正确:', updateResponse)
          set({ configs })
        }
      } catch (error) {
        console.error('❌ 自动比对配置失败:', error)
        set({ configs })
      }
    } catch (error) {
      console.error('Failed to refresh configs:', error)
      set({ error: '加载配置列表失败', configs: [] })
    } finally {
      set({ isLoading: false })

      // 刷新配置列表后，通知主进程更新托盘菜单
      try {
        await window.electronAPI.tray?.updateMenu?.()
      } catch (error) {
        console.warn('更新托盘菜单失败:', error)
      }
    }
  },

  // 创建配置
  createConfig: async (name, template) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.config.create(name, template)

      // 刷新配置列表
      await get().refreshConfigs()

      // 选择新创建的配置
      const newConfig = get().configs.find(c => c.path === response.path)
      if (newConfig) {
        get().setSelectedConfig(newConfig)
      }
    } catch (error) {
      console.error('Failed to create config:', error)
      set({ error: error instanceof Error ? error.message : '创建配置失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 删除配置
  deleteConfig: async (config) => {
    try {
      set({ isLoading: true, error: null })
      await window.electronAPI.config.delete(config.path)

      // 刷新配置列表
      await get().refreshConfigs()

      // 如果删除的是当前选中的配置，清除选择
      if (get().selectedConfig?.id === config.id) {
        set({ selectedConfig: null })
      }
    } catch (error) {
      console.error('Failed to delete config:', error)
      set({ error: error instanceof Error ? error.message : '删除配置失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 根据ID删除配置
  deleteConfigById: async (id) => {
    const config = get().configs.find(c => c.id === id)
    if (config) {
      await get().deleteConfig(config)
    }
  },

  // 复制配置
  duplicateConfig: async (id) => {
    try {
      set({ isLoading: true, error: null })
      const config = get().configs.find(c => c.id === id)
      if (!config) {
        throw new Error('配置不存在')
      }

      const createResponse = await window.electronAPI.config.create(`${config.name}_copy`)
      if (createResponse.path) {
        // 获取原配置内容并保存到新配置
        const content = await window.electronAPI.config.get(config.path)
        const saveResponse = await window.electronAPI.config.save(createResponse.path, content)
        
        if (saveResponse !== undefined) {
          // 刷新配置列表
          await get().refreshConfigs()
          
          // 选择新创建的配置
          const newConfig = get().configs.find(c => c.path === createResponse.path)
          if (newConfig) {
            get().setSelectedConfig(newConfig)
          }
        }
      }
    } catch (error) {
      console.error('Failed to duplicate config:', error)
      set({ error: error instanceof Error ? error.message : '复制配置失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 导出配置
  exportConfig: async (id) => {
    try {
      const config = get().configs.find(c => c.id === id)
      if (!config) {
        throw new Error('配置不存在')
      }

      const content = await window.electronAPI.config.get(config.path)
      const dataStr = JSON.stringify(content, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${config.name}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export config:', error)
      set({ error: error instanceof Error ? error.message : '导出配置失败' })
    }
  },

  /**
   * 过滤配置列表
   * 应用所有筛选条件并返回过滤后的配置列表
   */
  filteredConfigs: () => {
    const { configs, filters } = get()

    let filtered = [...configs]

    // 搜索过滤 - 支持名称、路径、描述搜索
    if (filters.search) {
      const keyword = filters.search.toLowerCase()
      filtered = filtered.filter(config =>
        config.name.toLowerCase().includes(keyword) ||
        config.path.toLowerCase().includes(keyword) ||
        (config.description && config.description.toLowerCase().includes(keyword))
      )
    }

    // 类型过滤 - 特殊处理"系统配置"和"正在使用"
    if (filters.type) {
      if (filters.type === '__system__') {
        // 特殊值: 筛选系统配置
        filtered = filtered.filter(config => config.isSystemConfig)
      } else if (filters.type === '__in_use__') {
        // 特殊值: 筛选正在使用的配置
        filtered = filtered.filter(config => config.isInUse)
      } else {
        // 普通类型筛选
        filtered = filtered.filter(config => config.type === filters.type)
      }
    }

    // 排序
    if (filters.sort) {
      filtered.sort((a, b) => {
        switch (filters.sort) {
          case 'name':
            return a.name.localeCompare(b.name)
          case 'lastModified':
            return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
          case 'size':
            return (b.size || 0) - (a.size || 0)
          case 'type':
            return a.type.localeCompare(b.type)
          default:
            return 0
        }
      })
    }

    // 系统配置始终置顶(除非已经按系统配置筛选)
    if (filters.type !== '__system__') {
      filtered.sort((a, b) => {
        if (a.isSystemConfig && !b.isSystemConfig) return -1
        if (!a.isSystemConfig && b.isSystemConfig) return 1
        return 0
      })
    }

    return filtered
  }
}))
