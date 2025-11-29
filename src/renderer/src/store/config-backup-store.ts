/**
 * 配置备份状态管理
 * 专门管理配置备份相关的状态和操作
 */

import { create } from 'zustand'
import { BackupInfo } from '@shared/types'

interface ConfigBackupStore {
  // 状态
  backups: BackupInfo[]
  selectedBackup: BackupInfo | null
  isLoading: boolean
  error: string | null

  // 基础操作
  setBackups: (backups: BackupInfo[]) => void
  setSelectedBackup: (backup: BackupInfo | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void

  // 备份操作
  loadBackups: (configPath: string) => Promise<void>
  createBackup: (configPath: string, description?: string) => Promise<void>
  restoreBackup: (backup: BackupInfo) => Promise<void>
  deleteBackup: (backupId: string) => Promise<void>
}

export const useConfigBackupStore = create<ConfigBackupStore>((set, get) => ({
  // 初始状态
  backups: [],
  selectedBackup: null,
  isLoading: false,
  error: null,

  // 基础设置
  setBackups: (backups) => set({ backups }),
  setSelectedBackup: (backup) => set({ selectedBackup: backup }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  // 加载备份列表
  loadBackups: async (configPath) => {
    try {
      set({ isLoading: true, error: null })
      const backups = await window.electronAPI.config.listBackups(configPath)
      set({ backups })
    } catch (error) {
      console.error('Failed to load backups:', error)
      set({ error: '加载备份列表失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 创建备份
  createBackup: async (configPath, description) => {
    try {
      set({ isLoading: true, error: null })
      const backup = await window.electronAPI.config.createBackup(configPath)
      
      // 添加到备份列表
      set(state => ({
        backups: [backup, ...state.backups]
      }))
    } catch (error) {
      console.error('Failed to create backup:', error)
      set({ error: '创建备份失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 恢复备份
  restoreBackup: async (backup) => {
    try {
      set({ isLoading: true, error: null })
      await window.electronAPI.config.restoreBackup(backup.id)
      
      // 刷新备份列表
      await get().loadBackups(backup.configPath)
    } catch (error) {
      console.error('Failed to restore backup:', error)
      set({ error: '恢复备份失败' })
    } finally {
      set({ isLoading: false })
    }
  },

  // 删除备份
  deleteBackup: async (backupId) => {
    try {
      set({ isLoading: true, error: null })
      
      // 这里需要添加删除备份的API调用
      // await window.electronAPI.config.deleteBackup(backupId)
      
      // 从备份列表中移除
      set(state => ({
        backups: state.backups.filter(backup => backup.id !== backupId)
      }))
    } catch (error) {
      console.error('Failed to delete backup:', error)
      set({ error: '删除备份失败' })
    } finally {
      set({ isLoading: false })
    }
  }
}))
