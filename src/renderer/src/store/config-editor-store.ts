/**
 * 配置编辑器状态管理
 * 专门管理配置编辑器相关的状态和操作
 */

import { create } from 'zustand'
import { ConfigFile } from '@shared/types'

interface ConfigEditorStore {
  // 状态
  editingConfig: ConfigFile | null
  editorContent: any
  originalContent: any
  hasUnsavedChanges: boolean
  activeTab: 'list' | 'editor' | 'backups'
  isLoading: boolean
  error: string | null

  // 基础操作
  setEditingConfig: (config: ConfigFile | null) => void
  setEditorContent: (content: any) => void
  setActiveTab: (tab: 'list' | 'editor' | 'backups') => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // 编辑器操作
  loadConfigContent: (config: ConfigFile) => Promise<void>
  saveConfig: (config: ConfigFile, content: any) => Promise<void>
  resetEditorContent: () => void
  markAsSaved: () => void
  createConfigWithData: (configData: any) => Promise<void>
  updateConfig: (id: string, configData: any) => Promise<void>
  importConfig: (configData: any) => Promise<void>
}

export const useConfigEditorStore = create<ConfigEditorStore>((set, get) => ({
  // 初始状态
  editingConfig: null,
  editorContent: null,
  originalContent: null,
  hasUnsavedChanges: false,
  activeTab: 'list',
  isLoading: false,
  error: null,

  // 基础设置
  setEditingConfig: (config) => set({ editingConfig: config }),
  setEditorContent: (content) => set({ 
    editorContent: content,
    hasUnsavedChanges: true
  }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // 加载配置内容
  loadConfigContent: async (config) => {
    try {
      set({ isLoading: true, error: null })
      const response = await window.electronAPI.config.get(config.path)
      
      // 正确解析IPC响应格式
      let content
      if (response && typeof response === 'object' && 'success' in response) {
        if (response.success && response.data !== undefined) {
          content = response.data
        } else {
          throw new Error(response.error || '获取配置内容失败')
        }
      } else {
        // 兼容旧格式
        content = response
      }
      
      set({
        editingConfig: config,
        editorContent: content,
        originalContent: content,
        hasUnsavedChanges: false,
        activeTab: 'editor'
      })
    } catch (error) {
      console.error('Failed to load config content:', error)
      set({ error: '加载配置内容失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 保存配置
  saveConfig: async (config, content) => {
    try {
      set({ isLoading: true, error: null })
      const saveResult = await window.electronAPI.config.save(config.path, content)
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || '保存配置失败')
      }

      set({
        hasUnsavedChanges: false,
        originalContent: content
      })

      // 更新编辑中的配置
      if (get().editingConfig) {
        const updatedConfig = { ...get().editingConfig!, lastModified: new Date() }
        set({ editingConfig: updatedConfig })
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      set({ error: error instanceof Error ? error.message : '保存配置失败' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  // 重置编辑器内容
  resetEditorContent: () => set({
    editorContent: get().originalContent,
    hasUnsavedChanges: false
  }),

  // 标记为已保存
  markAsSaved: () => set({
    hasUnsavedChanges: false,
    originalContent: get().editorContent
  }),

  // 使用数据创建配置（统一架构）
  createConfigWithData: async (configData) => {
    try {
      set({ isLoading: true, error: null })

      // 验证必要字段
      if (!configData.name && !configData.metadata?.name) {
        throw new Error('配置名称不能为空')
      }

      // 提取纯内容
      const content = configData.content || {}

      // 对于MD文件，需要确保文件名以.md结尾
      let configName = configData.metadata?.name || configData.name
      const configType = configData.metadata?.type || configData.type || 'claude-code'

      if ((configType === 'user-preferences' || configType === 'claude-md') && !configName.endsWith('.md')) {
        configName = `${configName}.md`
      }

      // 根据文件类型传递不同的内容格式
      let templateContent: string
      if (configType === 'user-preferences' || configType === 'claude-md') {
        // MD文件：直接传递字符串内容
        templateContent = typeof content === 'string' ? content : String(content)
      } else {
        // JSON文件：传递JSON字符串
        templateContent = JSON.stringify(content, null, 2)
      }

      const response = await window.electronAPI.config.create(configName, templateContent)

      if (response?.success && response.data?.path) {
        // 保存元数据到.meta文件
        const metadata = {
          name: configData.metadata?.name || configData.name,
          description: configData.metadata?.description || configData.description || '',
          type: configType,
          isActive: configData.metadata?.isActive !== undefined ? configData.metadata.isActive : (configData.isActive || false)
        }

        const saveMetaResult = await window.electronAPI.config.saveMetadata(response.data.path, metadata)
        if (!saveMetaResult?.success) {
          throw new Error(saveMetaResult?.error || '保存配置元数据失败')
        }

        // 设置编辑器状态
        set({
          editingConfig: {
            id: response.data.path,
            name: configName,
            path: response.data.path,
            type: configType,
            size: JSON.stringify(content).length,
            lastModified: new Date(),
            content,
            isValid: true,
            description: metadata.description
          },
          editorContent: content,
          originalContent: content,
          hasUnsavedChanges: false,
          activeTab: 'editor'
        })
      }
    } catch (error) {
      console.error('Failed to create config with data:', error)
      set({ error: error instanceof Error ? error.message : '创建配置失败' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  // 更新配置
  updateConfig: async (id, configData) => {
    try {
      set({ isLoading: true, error: null })
      // await window.electronAPI.config.update(id, configData) // 暂时注释，等待实现

      // 更新编辑中的配置
      if (get().editingConfig && get().editingConfig!.id === id) {
        const updatedConfig = {
          ...get().editingConfig,
          ...configData,
          lastModified: new Date()
        }
        set({ editingConfig: updatedConfig })
      }
    } catch (error) {
      console.error('Failed to update config:', error)
      set({ error: error instanceof Error ? error.message : '更新配置失败' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  // 导入配置（统一架构）
  importConfig: async (configData) => {
    try {
      set({ isLoading: true, error: null })

      // 验证必要字段
      if (!configData.name && !configData.metadata?.name) {
        throw new Error('配置名称不能为空')
      }

      // 提取纯内容
      const content = configData.content || {}

      // 对于MD文件，需要确保文件名以.md结尾
      let configName = configData.metadata?.name || configData.name
      const configType = configData.metadata?.type || configData.type || 'claude-code'

      if ((configType === 'user-preferences' || configType === 'claude-md') && !configName.endsWith('.md')) {
        configName = `${configName}.md`
      }

      // 根据文件类型传递不同的内容格式
      let templateContent: string
      if (configType === 'user-preferences' || configType === 'claude-md') {
        // MD文件：直接传递字符串内容
        templateContent = typeof content === 'string' ? content : String(content)
      } else {
        // JSON文件：传递JSON字符串
        templateContent = JSON.stringify(content, null, 2)
      }

      const response = await window.electronAPI.config.create(configName, templateContent)

      if (response?.success && response.data?.path) {
        // 保存元数据到.meta文件
        const metadata = {
          name: configData.metadata?.name || configData.name,
          description: configData.metadata?.description || configData.description || '',
          type: configType,
          isActive: configData.metadata?.isActive !== undefined ? configData.metadata.isActive : (configData.isActive || false)
        }

        const saveMetaResult = await window.electronAPI.config.saveMetadata(response.data.path, metadata)
        if (!saveMetaResult?.success) {
          throw new Error(saveMetaResult?.error || '保存配置元数据失败')
        }

        // 设置编辑器状态
        set({
          editingConfig: {
            id: response.data.path,
            name: configName,
            path: response.data.path,
            type: configType,
            size: JSON.stringify(content).length,
            lastModified: new Date(),
            content,
            isValid: true,
            description: metadata.description
          },
          editorContent: content,
          originalContent: content,
          hasUnsavedChanges: false,
          activeTab: 'editor'
        })
      }
    } catch (error) {
      console.error('Failed to import config:', error)
      set({ error: error instanceof Error ? error.message : '导入配置失败' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  }
}))
