/**
 * 终端管理状态管理
 */

import { create } from 'zustand'
import type {
  TerminalConfig,
  TerminalType
} from '@shared/types/terminal'

/**
 * 终端管理状态接口
 */
interface TerminalStore {
  // 状态
  terminals: TerminalConfig[]
  defaultTerminal: TerminalType
  isLoading: boolean
  isSaving: boolean
  error: string | null

  // 操作
  loadTerminals: () => Promise<void>
  upsertTerminal: (config: TerminalConfig) => Promise<void>
  deleteTerminal: (type: TerminalType) => Promise<void>
  setDefaultTerminal: (type: TerminalType) => Promise<void>

  // 命令执行
  executeCommand: (command: string, options?: {
    terminalType?: TerminalType
    workingDirectory?: string
    timeout?: number
  }) => Promise<{ stdout: string; stderr: string; error?: Error }>
}

/**
 * 终端管理 Store
 */
export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // 初始状态
  terminals: [],
  defaultTerminal: 'auto' as TerminalType,
  isLoading: false,
  isSaving: false,
  error: null,

  // 加载终端列表
  loadTerminals: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.terminal.getTerminals()
      if (result.success && result.data) {
        set({
          terminals: result.data,
          defaultTerminal: result.data.find(t => t.isDefault)?.type || 'auto' as TerminalType,
          isLoading: false
        })
      } else {
        set({ error: result.error || '加载失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 添加或更新终端
  upsertTerminal: async (config) => {
    set({ isSaving: true, error: null })
    try {
      const result = await window.electronAPI.terminal.upsertTerminal(config)
      if (result.success) {
        await get().loadTerminals()
      } else {
        const errorMessage = result.error || '保存失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isSaving: false })
    }
  },

  // 删除终端
  deleteTerminal: async (type) => {
    set({ isSaving: true, error: null })
    try {
      const result = await window.electronAPI.terminal.deleteTerminal(type)
      if (result.success) {
        await get().loadTerminals()
      } else {
        const errorMessage = result.error || '删除失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isSaving: false })
    }
  },

  // 设置默认终端
  setDefaultTerminal: async (type) => {
    set({ isSaving: true, error: null })
    try {
      const result = await window.electronAPI.terminal.setDefault(type)
      if (result.success) {
        await get().loadTerminals()
      } else {
        const errorMessage = result.error || '设置失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      set({ error: errorMessage })
      throw new Error(errorMessage)
    } finally {
      set({ isSaving: false })
    }
  },

  // 执行命令
  executeCommand: async (command, options) => {
    try {
      const result = await window.electronAPI.terminal.executeCommand(command, options)
      if (result.success && result.data) {
        return {
          stdout: result.data.stdout,
          stderr: result.data.stderr
        }
      } else {
        const error = new Error(result.error || '命令执行失败')
        return {
          stdout: '',
          stderr: '',
          error
        }
      }
    } catch (error: any) {
      return {
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }
}))
