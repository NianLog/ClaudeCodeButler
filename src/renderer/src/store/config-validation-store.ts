/**
 * 配置验证状态管理
 * 专门管理配置验证相关的状态和操作
 */

import { create } from 'zustand'
import { ValidationResult, ValidationError, ValidationWarning } from '@shared/types'

interface ConfigValidationStore {
  // 状态
  validationErrors: ValidationError[]
  validationWarnings: ValidationWarning[]
  isValidating: boolean

  // 基础操作
  setValidationErrors: (errors: ValidationError[]) => void
  setValidationWarnings: (warnings: ValidationWarning[]) => void
  setIsValidating: (validating: boolean) => void
  clearValidation: () => void

  // 验证操作
  validateConfig: (content: any) => ValidationResult
  validateConfigFile: (configPath: string) => Promise<ValidationResult>
}

export const useConfigValidationStore = create<ConfigValidationStore>((set, get) => ({
  // 初始状态
  validationErrors: [],
  validationWarnings: [],
  isValidating: false,

  // 基础设置
  setValidationErrors: (errors) => set({ validationErrors: errors }),
  setValidationWarnings: (warnings) => set({ validationWarnings: warnings }),
  setIsValidating: (validating) => set({ isValidating: validating }),
  clearValidation: () => set({ 
    validationErrors: [], 
    validationWarnings: [] 
  }),

  // 验证配置内容
  validateConfig: (content) => {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // 基本类型检查
      if (content === null || content === undefined) {
        errors.push({
          path: 'root',
          message: '配置内容不能为空',
          code: 'EMPTY_CONTENT'
        })
        return { isValid: false, errors, warnings }
      }

      // 检查是否为对象
      if (typeof content !== 'object') {
        errors.push({
          path: 'root',
          message: '配置内容必须是对象',
          code: 'INVALID_TYPE'
        })
        return { isValid: false, errors, warnings }
      }

      // 检查必要字段
      const requiredFields = ['name', 'version']
      requiredFields.forEach(field => {
        if (!content[field]) {
          warnings.push({
            path: field,
            message: `建议添加 ${field} 字段`,
            code: 'MISSING_FIELD'
          })
        }
      })

      // 检查版本格式
      if (content.version && typeof content.version !== 'string') {
        errors.push({
          path: 'version',
          message: '版本号必须是字符串',
          code: 'INVALID_VERSION_TYPE'
        })
      }

      // 检查名称格式
      if (content.name && typeof content.name !== 'string') {
        errors.push({
          path: 'name',
          message: '名称必须是字符串',
          code: 'INVALID_NAME_TYPE'
        })
      }

      // 检查配置类型
      if (content.type && !['claude-code', 'custom', 'settings'].includes(content.type)) {
        warnings.push({
          path: 'type',
          message: '未知的配置类型',
          code: 'UNKNOWN_TYPE'
        })
      }

      // 检查是否有循环引用
      try {
        JSON.stringify(content)
      } catch (error) {
        errors.push({
          path: 'root',
          message: '配置包含循环引用',
          code: 'CIRCULAR_REFERENCE'
        })
      }

    } catch (error) {
      errors.push({
        path: 'root',
        message: `验证过程中发生错误: ${error instanceof Error ? error.message : String(error)}`,
        code: 'VALIDATION_ERROR'
      })
    }

    const isValid = errors.length === 0

    // 更新状态
    set({ 
      validationErrors: errors, 
      validationWarnings: warnings 
    })

    return { isValid, errors, warnings }
  },

  // 验证配置文件
  validateConfigFile: async (configPath) => {
    try {
      set({ isValidating: true })
      
      // 读取配置文件内容
      const content = await window.electronAPI.config.get(configPath)
      
      // 验证内容
      const result = get().validateConfig(content)
      
      return result
    } catch (error) {
      const errorResult: ValidationResult = {
        isValid: false,
        errors: [{
          path: 'root',
          message: `无法读取配置文件: ${error instanceof Error ? error.message : String(error)}`,
          code: 'READ_ERROR'
        }],
        warnings: []
      }
      
      set({ 
        validationErrors: errorResult.errors,
        validationWarnings: []
      })
      
      return errorResult
    } finally {
      set({ isValidating: false })
    }
  }
}))
