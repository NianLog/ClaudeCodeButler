/**
 * Skills管理状态管理
 */

import { create } from 'zustand'
import type {
  SkillDirectory,
  SkillFormData,
  SkillImportOptions
} from '@shared/types/skills'

/**
 * Skill管理状态接口
 */
interface SkillsManagementState {
  // 状态
  skills: SkillDirectory[]
  isLoading: boolean
  error: string | null

  // UI状态
  selectedSkill: SkillDirectory | null
  isDetailDrawerOpen: boolean
  isFormModalOpen: boolean
  isImportModalOpen: boolean
  formMode: 'add' | 'edit'
  editingSkill: SkillDirectory | null

  // 操作
  loadSkills: () => Promise<void>
  getSkill: (skillId: string) => Promise<SkillDirectory | null>
  addSkill: (formData: SkillFormData) => Promise<void>
  updateSkill: (skillId: string, formData: SkillFormData) => Promise<void>
  deleteSkill: (skillId: string) => Promise<void>
  importSkill: (sourceDirPath: string, options?: SkillImportOptions) => Promise<{
    success: boolean
    skillId?: string
    error?: string
  }>
  importSkillFiles: (payload: { rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> }, options?: SkillImportOptions) => Promise<{
    success: boolean
    skillId?: string
    error?: string
  }>
  batchImportSkills: (sourceDirPaths: string[], options?: SkillImportOptions) => Promise<{
    success: boolean
    imported?: string[]
    errors?: Array<{ path: string; error: string }>
    error?: string
  }>
  batchImportSkillsFiles: (payloads: Array<{ rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> }>, options?: SkillImportOptions) => Promise<{
    success: boolean
    imported?: string[]
    errors?: Array<{ path: string; error: string }>
    error?: string
  }>

  // UI操作
  openDetailDrawer: (skill: SkillDirectory) => void
  closeDetailDrawer: () => void
  openAddModal: () => void
  openEditModal: (skill: SkillDirectory) => void
  closeFormModal: () => void
  openImportModal: () => void
  closeImportModal: () => void
}

/**
 * Skill管理Store
 */
export const useSkillsManagementStore = create<SkillsManagementState>((set, get) => ({
  // 初始状态
  skills: [],
  isLoading: false,
  error: null,
  selectedSkill: null,
  isDetailDrawerOpen: false,
  isFormModalOpen: false,
  isImportModalOpen: false,
  formMode: 'add',
  editingSkill: null,

  // 加载所有Skill
  loadSkills: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.scan()
      if (result?.success) {
        set({ skills: result.data || [], isLoading: false })
      } else {
        set({ error: result?.error || '加载失败', isLoading: false })
      }
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  // 获取单个Skill
  getSkill: async (skillId) => {
    try {
      const result = await window.electronAPI.skills.get(skillId)
      if (result?.success && result.data) {
        return result.data
      }
      return null
    } catch (error) {
      console.error('获取Skill失败:', error)
      return null
    }
  },

  // 添加Skill
  addSkill: async (formData) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.add(formData)
      if (result?.success) {
        set({ isFormModalOpen: false })
        await get().loadSkills()
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

  // 更新Skill（通过删除+重新添加实现）
  updateSkill: async (skillId, formData) => {
    set({ isLoading: true, error: null })
    try {
      // 先删除旧Skill
      const deleteResult = await window.electronAPI.skills.delete(skillId)
      if (!deleteResult?.success) {
        const errorMessage = deleteResult?.error || '删除旧Skill失败'
        set({ error: errorMessage })
        throw new Error(errorMessage)
      }

      // 添加新Skill
      const addResult = await window.electronAPI.skills.add(formData)
      if (addResult?.success) {
        set({ isFormModalOpen: false })
        await get().loadSkills()
      } else {
        const errorMessage = addResult?.error || '添加新Skill失败'
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

  // 删除Skill
  deleteSkill: async (skillId) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.delete(skillId)
      if (result?.success) {
        await get().loadSkills()
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

  // 导入单个Skill
  importSkill: async (sourceDirPath, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.import(sourceDirPath, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadSkills()
        // 返回组件期望的格式
        return { success: true, skillId: result.data }
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

  // 导入Skill文件列表
  importSkillFiles: async (payload, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.importFiles(payload, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadSkills()
        return { success: true, skillId: result.data }
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

  // 批量导入Skill
  batchImportSkills: async (sourceDirPaths, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.batchImport(sourceDirPaths, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadSkills()
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

  // 批量导入Skill文件列表
  batchImportSkillsFiles: async (payloads, options) => {
    set({ isLoading: true, error: null })
    try {
      const result = await window.electronAPI.skills.batchImportFiles(payloads, options)
      if (result?.success) {
        set({ isImportModalOpen: false })
        await get().loadSkills()
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
  openDetailDrawer: (skill) => {
    set({
      selectedSkill: skill,
      isDetailDrawerOpen: true
    })
  },

  closeDetailDrawer: () => {
    set({
      selectedSkill: null,
      isDetailDrawerOpen: false
    })
  },

  openAddModal: () => {
    set({
      formMode: 'add',
      editingSkill: null,
      isFormModalOpen: true
    })
  },

  openEditModal: (skill) => {
    set({
      formMode: 'edit',
      editingSkill: skill,
      isFormModalOpen: true
    })
  },

  closeFormModal: () => {
    set({
      formMode: 'add',
      editingSkill: null,
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
