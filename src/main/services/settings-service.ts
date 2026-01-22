/**
 * 设置服务
 * 负责应用设置的存储、加载和按标签页分类管理
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  AppSettings,
  SettingsTab,
  SettingsSaveOptions,
  SettingsChangeEvent,
  SettingsValidationRule
} from '@shared/types/settings'
import { logger } from '../utils/logger'

export class SettingsService {
  private settingsPath: string
  private settings: AppSettings
  private validationRules: SettingsValidationRule[]
  private changeHandlers: Map<string, ((event: SettingsChangeEvent) => void)[]>

  constructor(userDataPath?: string) {
    this.settingsPath = join(userDataPath || app.getPath('userData'), 'settings.json')
    this.settings = this.getDefaultSettings()
    this.changeHandlers = new Map()
    this.validationRules = this.initializeValidationRules()
  }

  /**
   * 获取默认设置
   */
  private getDefaultSettings(): AppSettings {
    return {
      basic: {
        language: 'zh-CN',
        theme: 'light',
        autoSave: true,
        startupCheck: true
      },
      editor: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: false,
        minimap: true,
        lineNumbers: true
      },
      notifications: {
        enabled: true,
        sound: true,
        configChanges: true,
        errors: true,
        startupCheckUpdate: true,
        silentUpdateCheck: true
      },
      advanced: {
        logLevel: 'info',
        cacheSize: 100,
        autoBackup: true,
        telemetry: false
      },
      window: {
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        rememberPosition: true
      },
      about: {}
    }
  }

  /**
   * 初始化验证规则
   */
  private initializeValidationRules(): SettingsValidationRule[] {
    return [
      // 基本设置验证
      { tab: 'basic', key: 'language', required: true, type: 'string', enum: ['zh-CN', 'en-US'] },
      { tab: 'basic', key: 'theme', required: true, type: 'string', enum: ['light', 'dark', 'auto'] },
      { tab: 'basic', key: 'autoSave', required: true, type: 'boolean' },
      { tab: 'basic', key: 'startupCheck', required: true, type: 'boolean' },

      // 编辑器设置验证
      { tab: 'editor', key: 'fontSize', required: true, type: 'number', min: 8, max: 72 },
      { tab: 'editor', key: 'tabSize', required: true, type: 'number', min: 1, max: 8 },
      { tab: 'editor', key: 'wordWrap', required: true, type: 'boolean' },
      { tab: 'editor', key: 'minimap', required: true, type: 'boolean' },
      { tab: 'editor', key: 'lineNumbers', required: true, type: 'boolean' },

      // 通知设置验证
      { tab: 'notifications', key: 'enabled', required: true, type: 'boolean' },
      { tab: 'notifications', key: 'sound', required: true, type: 'boolean' },
      { tab: 'notifications', key: 'configChanges', required: true, type: 'boolean' },
      { tab: 'notifications', key: 'errors', required: true, type: 'boolean' },
      { tab: 'notifications', key: 'startupCheckUpdate', required: true, type: 'boolean' },
      { tab: 'notifications', key: 'silentUpdateCheck', required: true, type: 'boolean' },

      // 高级设置验证
      { tab: 'advanced', key: 'logLevel', required: true, type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
      { tab: 'advanced', key: 'cacheSize', required: true, type: 'number', min: 10, max: 1000 },
      { tab: 'advanced', key: 'autoBackup', required: true, type: 'boolean' },
      { tab: 'advanced', key: 'telemetry', required: true, type: 'boolean' },

      // 窗口设置验证
      { tab: 'window', key: 'width', required: true, type: 'number', min: 400, max: 4000 },
      { tab: 'window', key: 'height', required: true, type: 'number', min: 300, max: 3000 },
      { tab: 'window', key: 'minWidth', required: true, type: 'number', min: 400, max: 2000 },
      { tab: 'window', key: 'minHeight', required: true, type: 'number', min: 300, max: 1500 },
      { tab: 'window', key: 'rememberPosition', required: true, type: 'boolean' }
    ]
  }

  /**
   * 加载设置
   */
  async loadSettings(): Promise<AppSettings> {
    try {
      logger.info(`正在从 ${this.settingsPath} 加载设置`)

      // 确保目录存在
      await fs.mkdir(app.getPath('userData'), { recursive: true })

      // 检查文件是否存在
      try {
        await fs.access(this.settingsPath)
      } catch {
        logger.info('设置文件不存在，创建默认设置文件')
        await this.saveAllSettings()
        return this.settings
      }

      // 读取设置文件
      const content = await fs.readFile(this.settingsPath, 'utf8')
      const loadedSettings = JSON.parse(content)

      // 合并默认设置和加载的设置
      this.settings = this.mergeWithDefaults(loadedSettings)

      // 验证设置
      const validation = this.validateSettings(this.settings)
      if (!validation.isValid) {
        logger.warn('加载的设置存在验证错误:', validation.errors)
        // 修复无效设置
        this.settings = this.fixInvalidSettings(this.settings)
      }

      logger.info('设置加载成功')
      return this.settings

    } catch (error) {
      logger.error('加载设置失败:', error)
      logger.info('使用默认设置')
      this.settings = this.getDefaultSettings()
      return this.settings
    }
  }

  /**
   * 合并默认设置(仅在加载时补充缺失字段)
   * 注意: loaded settings 应该覆盖 defaults,而不是相反
   */
  private mergeWithDefaults(loadedSettings: any): AppSettings {
    const defaults = this.getDefaultSettings()
    return {
      basic: { ...defaults.basic, ...loadedSettings.basic },
      editor: { ...defaults.editor, ...loadedSettings.editor },
      notifications: { ...defaults.notifications, ...loadedSettings.notifications },
      advanced: { ...defaults.advanced, ...loadedSettings.advanced },
      window: { ...defaults.window, ...loadedSettings.window },
      about: { ...defaults.about, ...loadedSettings.about }
    }
  }

  /**
   * 保存特定标签页的设置
   */
  async saveSettings(tab: SettingsTab, data: Partial<AppSettings>, options: SettingsSaveOptions = {}): Promise<void> {
    try {
      logger.info(`正在保存 ${tab} 设置:`, data)

      // 保存前验证
      const tabData = this.extractTabData(tab, data)
      const validation = this.validateTabSettings(tab, tabData)

      if (!validation.isValid) {
        throw new Error(`设置验证失败: ${validation.errors.join(', ')}`)
      }

      // 保存旧值用于事件
      const oldValues = { ...this.settings[tab] }

      // 更新设置
      this.settings[tab] = { ...this.settings[tab], ...tabData }

      // 保存到文件
      if (!options.silent) {
        await this.saveToFile()
      }

      // 触发变更事件
      this.triggerChangeEvents(tab, oldValues, this.settings[tab])

      logger.info(`${tab} 设置保存成功`)

    } catch (error) {
      logger.error(`保存 ${tab} 设置失败:`, error)
      throw error
    }
  }

  /**
   * 保存所有设置
   */
  async saveAllSettings(): Promise<void> {
    try {
      // 验证所有设置
      const validation = this.validateSettings(this.settings)
      if (!validation.isValid) {
        throw new Error(`设置验证失败: ${validation.errors.join(', ')}`)
      }

      await this.saveToFile()
      logger.info('所有设置保存成功')

    } catch (error) {
      logger.error('保存所有设置失败:', error)
      throw error
    }
  }

  /**
   * 保存到文件
   */
  private async saveToFile(): Promise<void> {
    try {
      const content = JSON.stringify(this.settings, null, 2)
      await fs.writeFile(this.settingsPath, content, 'utf8')
      logger.debug(`设置已保存到: ${this.settingsPath}`)
    } catch (error) {
      logger.error('写入设置文件失败:', error)
      throw error
    }
  }

  /**
   * 提取标签页数据
   */
  private extractTabData(tab: SettingsTab, data: Partial<AppSettings>): any {
    return data[tab] || {}
  }

  /**
   * 验证标签页设置
   */
  private validateTabSettings(tab: SettingsTab, data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    const tabRules = this.validationRules.filter(rule => rule.tab === tab)

    for (const rule of tabRules) {
      const value = data[rule.key]

      // 必填验证
      if (rule.required && (value === undefined || value === null)) {
        errors.push(`${rule.key} 是必填项`)
        continue
      }

      // 类型验证
      if (value !== undefined && value !== null) {
        if (rule.type === 'number' && typeof value !== 'number') {
          errors.push(`${rule.key} 必须是数字`)
        } else if (rule.type === 'string' && typeof value !== 'string') {
          errors.push(`${rule.key} 必须是字符串`)
        } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`${rule.key} 必须是布尔值`)
        }

        // 枚举值验证
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push(`${rule.key} 必须是以下值之一: ${rule.enum.join(', ')}`)
        }

        // 数值范围验证
        if (typeof value === 'number') {
          if (rule.min !== undefined && value < rule.min) {
            errors.push(`${rule.key} 不能小于 ${rule.min}`)
          }
          if (rule.max !== undefined && value > rule.max) {
            errors.push(`${rule.key} 不能大于 ${rule.max}`)
          }
        }

        // 自定义验证
        if (rule.validator) {
          const result = rule.validator(value)
          if (result !== true) {
            errors.push(`${rule.key}: ${result}`)
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * 验证所有设置
   */
  private validateSettings(settings: AppSettings): { isValid: boolean; errors: string[] } {
    const allErrors: string[] = []

    for (const tab of ['basic', 'editor', 'notifications', 'advanced', 'window'] as SettingsTab[]) {
      const validation = this.validateTabSettings(tab, settings[tab])
      allErrors.push(...validation.errors)
    }

    return {
      isValid: allErrors.length === 0,
      errors: allErrors
    }
  }

  /**
   * 修复无效设置
   */
  private fixInvalidSettings(settings: AppSettings): AppSettings {
    const defaults = this.getDefaultSettings()
    const fixed = { ...settings }
    const fixedByTab = fixed as Record<Exclude<SettingsTab, 'about'>, any>
    const settingsByTab = settings as Record<Exclude<SettingsTab, 'about'>, any>
    const defaultsByTab = defaults as Record<Exclude<SettingsTab, 'about'>, any>

    // 简单修复：使用默认值替换无效值
    const tabs: Array<Exclude<SettingsTab, 'about'>> = ['basic', 'editor', 'notifications', 'advanced', 'window']
    for (const tab of tabs) {
      const tabValidation = this.validateTabSettings(tab, settingsByTab[tab])
      if (!tabValidation.isValid) {
        fixedByTab[tab] = { ...defaultsByTab[tab], ...settingsByTab[tab] }
      }
    }

    return fixed
  }

  /**
   * 触发变更事件
   */
  private triggerChangeEvents(tab: SettingsTab, oldValues: any, newValues: any): void {
    const handlers = this.changeHandlers.get(tab) || []

    for (const [key, newValue] of Object.entries(newValues)) {
      if (oldValues[key] !== newValue) {
        const event: SettingsChangeEvent = {
          tab,
          key,
          oldValue: oldValues[key],
          newValue,
          timestamp: new Date()
        }

        handlers.forEach(handler => {
          try {
            handler(event)
          } catch (error) {
            logger.error('设置变更处理器执行失败:', error)
          }
        })
      }
    }
  }

  /**
   * 注册设置变更处理器
   */
  onSettingsChange(tab: SettingsTab, handler: (event: SettingsChangeEvent) => void): () => void {
    if (!this.changeHandlers.has(tab)) {
      this.changeHandlers.set(tab, [])
    }

    this.changeHandlers.get(tab)!.push(handler)

    // 返回取消注册函数
    return () => {
      const handlers = this.changeHandlers.get(tab)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }

  /**
   * 获取设置
   */
  getSettings(): AppSettings {
    return { ...this.settings }
  }

  /**
   * 获取特定标签页设置
   */
  getTabSettings(tab: SettingsTab): any {
    if (tab === 'about') {
      return {}
    }
    return { ...this.settings[tab] }
  }

  /**
   * 重置设置
   */
  async resetSettings(tab?: SettingsTab): Promise<void> {
    try {
      if (tab) {
        if (tab === 'about') {
          logger.info('about 设置无需重置')
          return
        }
        // 重置特定标签页
        const defaults = this.getDefaultSettings()
        const settingsByTab = this.settings as Record<Exclude<SettingsTab, 'about'>, any>
        const defaultsByTab = defaults as Record<Exclude<SettingsTab, 'about'>, any>
        const oldValues = { ...settingsByTab[tab] }
        settingsByTab[tab] = { ...defaultsByTab[tab] }

        await this.saveToFile()
        this.triggerChangeEvents(tab, oldValues, this.settings[tab])

        logger.info(`${tab} 设置已重置`)
      } else {
        // 重置所有设置
        const oldSettings = { ...this.settings }
        this.settings = this.getDefaultSettings()

        await this.saveToFile()

        // 触发所有标签页的变更事件
        const tabs: Array<Exclude<SettingsTab, 'about'>> = ['basic', 'editor', 'notifications', 'advanced', 'window']
        const oldSettingsByTab = oldSettings as Record<Exclude<SettingsTab, 'about'>, any>
        const newSettingsByTab = this.settings as Record<Exclude<SettingsTab, 'about'>, any>
        for (const tabKey of tabs) {
          this.triggerChangeEvents(tabKey, oldSettingsByTab[tabKey], newSettingsByTab[tabKey])
        }

        logger.info('所有设置已重置')
      }
    } catch (error) {
      logger.error('重置设置失败:', error)
      throw error
    }
  }

  /**
   * 导出设置
   */
  async exportSettings(filePath?: string): Promise<string> {
    try {
      const content = JSON.stringify(this.settings, null, 2)

      if (filePath) {
        await fs.writeFile(filePath, content, 'utf8')
        logger.info(`设置已导出到: ${filePath}`)
      }

      return content
    } catch (error) {
      logger.error('导出设置失败:', error)
      throw error
    }
  }

  /**
   * 导入设置
   */
  async importSettings(content: string, merge: boolean = false): Promise<void> {
    try {
      const importedSettings = JSON.parse(content)

      if (!this.isValidSettingsFormat(importedSettings)) {
        throw new Error('无效的设置格式')
      }

      if (merge) {
        // 合并导入的设置
        this.settings = this.mergeWithDefaults(importedSettings)
      } else {
        // 完全替换设置
        this.settings = this.mergeWithDefaults(importedSettings)
      }

      // 验证导入的设置
      const validation = this.validateSettings(this.settings)
      if (!validation.isValid) {
        throw new Error(`导入的设置验证失败: ${validation.errors.join(', ')}`)
      }

      await this.saveToFile()
      logger.info('设置导入成功')

    } catch (error) {
      logger.error('导入设置失败:', error)
      throw error
    }
  }

  /**
   * 检查设置格式是否有效
   */
  private isValidSettingsFormat(settings: any): boolean {
    return (
      typeof settings === 'object' &&
      settings !== null &&
      ['basic', 'editor', 'notifications', 'advanced', 'window'].every(
        key => typeof settings[key] === 'object' && settings[key] !== null
      )
    )
  }
}