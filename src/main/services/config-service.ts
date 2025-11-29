/**
 * 配置服务
 * 负责配置文件的 CRUD 操作和验证
 */

import { promises as fs } from 'fs'
import { join, basename, extname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'
import {
  ConfigFile,
  ConfigType,
  BackupInfo,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from '@shared/types'
import { PATHS, CONFIG_FILES } from '@shared/constants'
import { logger } from '../utils/logger'
import { ConfigMigrationService } from './config-migration'
import { pathManager } from '../utils/path-manager'

export class ConfigService {
  // 使用 pathManager 获取 Claude 配置目录
  private get claudeDir(): string {
    return pathManager.claudeConfigsDir
  }

  constructor() {
    // 不再在构造函数中设置,使用 getter
  }

  /**
   * 扫描配置文件
   */
  async scanConfigs(): Promise<ConfigFile[]> {
    const startTime = Date.now()
    const configs: ConfigFile[] = []

    try {
      // 确保 .claude 目录存在
      await this.ensureClaudeDir()

      // 扫描所有配置文件
      const files = await this.getAllConfigFiles()
      logger.info(`扫描到 ${files.length} 个配置文件:`, files)

      for (const filePath of files) {
        try {
          const config = await this.createConfigFileObject(filePath)
          configs.push(config)
          logger.info(`成功创建配置文件对象: ${config.name} (${config.type})`)
        } catch (error) {
          logger.error(`创建配置文件对象失败 ${filePath}:`, error)
        }
      }

      logger.info(`最终返回 ${configs.length} 个配置文件`)
      logger.performance('扫描配置文件', startTime)
      return configs

    } catch (error) {
      logger.error('扫描配置文件失败:', error)
      throw error
    }
  }

  /**
   * 获取配置文件内容（统一架构：只返回纯内容）
   * 对于所有配置文件，统一返回纯文件内容，不返回元数据
   * 元数据由单独的getConfigMetadata方法获取
   */
  async getConfig(path: string): Promise<any> {
    try {
      const fs = require('fs/promises')
      const content = await fs.readFile(path, 'utf8')

      // 统一处理：MD文件返回字符串，JSON文件解析后返回对象
      if (path.endsWith('.md') || path.endsWith('CLAUDE.md')) {
        return content
      } else if (path.endsWith('.json')) {
        return content.trim() ? JSON.parse(content) : {}
      } else {
        try {
          return JSON.parse(content)
        } catch {
          return content
        }
      }
    } catch (error) {
      logger.error(`读取配置文件失败 ${path}:`, error)
      throw new Error(`读取配置文件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取配置文件元数据（从.meta文件读取）
   */
  async getConfigMetadata(path: string): Promise<any> {
    try {
      const fs = require('fs/promises')
      const metaPath = `${path}.meta`

      try {
        const metaContent = await fs.readFile(metaPath, 'utf8')
        return JSON.parse(metaContent)
      } catch {
        // .meta文件不存在，返回null
        return null
      }
    } catch (error) {
      logger.error(`读取配置元数据失败 ${path}:`, error)
      return null
    }
  }

  /**
   * 保存配置文件（统一架构：只保存纯内容）
   * 统一保存逻辑：直接保存纯内容到文件
   * metadata通过单独的saveConfigMetadata方法保存
   */
  async saveConfig(path: string, content: any, metadata?: any): Promise<void> {
    try {
      // 检查并处理 undefined/null content
      if (content === undefined || content === null) {
        logger.warn(`配置内容为空，使用默认值: ${path}`)
        content = path.endsWith('.md') ? '' : {}
      }

      // 检查是否为系统配置文件
      const fileName = basename(path)
      const userHome = os.homedir()
      const isUserHomeConfig = path.includes(userHome) &&
        (path.endsWith(join(userHome, '.claude', 'settings.json')) ||
         path.endsWith(join(userHome, '.claude.json')) ||
         path.endsWith(join(userHome, '.claude', 'CLAUDE.md')))

      const isSystemConfig =
        fileName === CONFIG_FILES.SETTINGS ||
        fileName === CONFIG_FILES.SETTINGS_LOCAL ||
        fileName === CONFIG_FILES.CLAUDE_JSON ||
        fileName === CONFIG_FILES.CLAUDE_MD ||
        isUserHomeConfig

      // 如果是系统配置文件，创建备份
      if (isSystemConfig) {
        try {
          await this.createBackup(path)
          logger.info(`系统配置文件备份已创建: ${path}`)
        } catch (backupError) {
          logger.warn(`创建系统配置备份失败: ${path}`, backupError)
          // 备份失败不阻止保存操作
        }
      }

      // 统一保存内容文件
      const fs = require('fs/promises')

      if (path.endsWith('.md') || path.endsWith('CLAUDE.md')) {
        // MD文件保存为纯文本
        const contentString = typeof content === 'string' ? content : String(content)
        await fs.writeFile(path, contentString, 'utf8')
      } else {
        // JSON文件保存为JSON格式
        const jsonString = JSON.stringify(content, null, 2)
        await fs.writeFile(path, jsonString, 'utf8')
      }

      // 非系统配置文件：同时保存元数据到.meta文件
      if (!isSystemConfig) {
        await this.saveConfigMetadata(path, metadata)
      }

      logger.info(`配置文件已保存: ${path}`)

    } catch (error) {
      logger.error(`保存配置文件失败 ${path}:`, error)
      throw new Error(`保存配置文件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 保存配置文件元数据（到.meta文件）
   */
  async saveConfigMetadata(path: string, metadata?: any): Promise<void> {
    try {
      const fs = require('fs/promises')
      const fileName = basename(path)
      const metaPath = `${path}.meta`

      // 尝试读取现有元数据,保留created时间
      let existingMetadata: any = {}
      try {
        const existingContent = await fs.readFile(metaPath, 'utf8')
        existingMetadata = JSON.parse(existingContent)
      } catch {
        // 元数据文件不存在,稍后创建新的
      }

      // 合并元数据
      const finalMetadata = {
        name: metadata?.name || existingMetadata.name || fileName.replace(/\.(json|md)$/, ''),
        description: metadata?.description || existingMetadata.description || `用户配置文件: ${fileName}`,
        type: metadata?.type || existingMetadata.type || (path.endsWith('.md') ? 'user-preferences' : 'claude-code'),
        isActive: metadata?.isActive !== undefined ? metadata.isActive : (existingMetadata.isActive || false),
        isInUse: metadata?.isInUse !== undefined ? metadata.isInUse : (existingMetadata.isInUse || false), // 添加isInUse字段处理
        created: existingMetadata.created || new Date().toISOString(),
        lastModified: new Date().toISOString()
      }

      await fs.writeFile(metaPath, JSON.stringify(finalMetadata, null, 2), 'utf8')
      logger.info(`元数据文件已更新: ${metaPath}`)

    } catch (error) {
      logger.error(`保存配置元数据失败 ${path}:`, error)
      throw new Error(`保存配置元数据失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 创建配置文件（统一架构）
   */
  async createConfig(name: string, template?: string): Promise<string> {
    try {
      // 根据文件名判断文件类型
      let fileName = name

      if (!name.endsWith('.md') && !name.endsWith('.json')) {
        // 没有扩展名，尝试从模板判断
        if (template) {
          try {
            const parsedTemplate = JSON.parse(template)
            if (parsedTemplate.type === 'user-preferences' || parsedTemplate.type === 'claude-md') {
              fileName = `${name}.md`
            } else {
              fileName = `${name}.json`
            }
          } catch {
            // 模板不是JSON，默认为JSON文件
            fileName = `${name}.json`
          }
        } else {
          fileName = `${name}.json`
        }
      }

      const filePath = join(this.claudeDir, fileName)

      // 检查文件是否已存在
      try {
        await fs.access(filePath)
        throw new Error(`配置文件已存在: ${fileName}`)
      } catch {
        // 文件不存在，继续创建
      }

      // 准备内容
      let content: any

      if (template) {
        // 如果template是JSON字符串，解析它
        try {
          const parsedTemplate = JSON.parse(template)
          // 检查是否为多层JSON格式
          if (parsedTemplate && typeof parsedTemplate === 'object' && parsedTemplate.content !== undefined) {
            // 多层JSON格式，提取content字段作为实际内容
            content = parsedTemplate.content
            logger.debug(`createConfig: 检测到多层JSON格式，提取content字段作为实际内容`)
          } else {
            // 普通JSON格式或字符串，直接使用
            content = parsedTemplate
          }
        } catch {
          // 不是JSON，可能是MD文件的字符串内容
          content = template
        }
      } else {
        // 没有模板时，使用默认内容
        content = fileName.endsWith('.md') ? '' : this.getDefaultContent(fileName)
      }

      // 保存文件（不需要传递metadata，因为这是首次创建）
      await this.saveConfig(filePath, content)

      logger.info(`配置文件已创建: ${filePath}`)
      return filePath

    } catch (error) {
      logger.error(`创建配置文件失败 ${name}:`, error)
      throw error
    }
  }

  /**
   * 删除配置文件
   */
  async deleteConfig(path: string): Promise<void> {
    try {
      // 检查是否为系统配置文件
      const deleteFileName = basename(path)
      const deleteUserHome = os.homedir()
      const deleteIsUserHomeConfig = path.includes(deleteUserHome) &&
        (path.endsWith(join(deleteUserHome, '.claude', 'settings.json')) ||
         path.endsWith(join(deleteUserHome, '.claude.json')) ||
         path.endsWith(join(deleteUserHome, '.claude', 'CLAUDE.md')))

      const deleteIsSystemConfig =
        deleteFileName === CONFIG_FILES.SETTINGS ||
        deleteFileName === CONFIG_FILES.SETTINGS_LOCAL ||
        deleteFileName === CONFIG_FILES.CLAUDE_JSON ||
        deleteFileName === CONFIG_FILES.CLAUDE_MD ||
        deleteIsUserHomeConfig

      if (deleteIsSystemConfig) {
        throw new Error('系统配置文件不允许删除，请手动在文件系统中管理这些文件')
      }

      // 创建备份
      await this.createBackup(path)

      // 删除文件
      await fs.unlink(path)
      
      // 如果是用户配置文件，同时删除对应的.meta文件
      if (!deleteIsSystemConfig) {
        // 用户配置文件：同时删除.meta文件
        const metaPath = `${path}.meta`
        try {
          await fs.unlink(metaPath)
          logger.info(`元数据文件已删除: ${metaPath}`)
        } catch (metaError) {
          // .meta文件不存在或删除失败，不影响主流程
          logger.warn(`删除元数据文件失败: ${metaPath}`, metaError)
        }
      }

      logger.info(`配置文件已删除: ${path}`)

    } catch (error) {
      logger.error(`删除配置文件失败 ${path}:`, error)
      throw new Error(`删除配置文件失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 移除加密/解密功能

  /**
   * 验证配置
   */
  validateConfig(content: unknown): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    try {
      // 检查是否为有效的 JSON
      if (typeof content !== 'object' || content === null) {
        errors.push({ path: 'root', message: '配置必须是一个有效的 JSON 对象', code: 'INVALID_TYPE' })
        return { isValid: false, errors, warnings }
      }

      const config = content as Record<string, any>

      // 检查常用字段
      if (config.model && typeof config.model !== 'string') {
        errors.push({ path: 'model', message: 'model 字段必须是字符串', code: 'INVALID_TYPE' })
      }

      if (config.max_tokens !== undefined) {
        if (typeof config.max_tokens !== 'number' || config.max_tokens <= 0) {
          errors.push({ path: 'max_tokens', message: 'max_tokens 必须是正整数', code: 'INVALID_VALUE' })
        }
      }

      if (config.temperature !== undefined) {
        if (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 1) {
          warnings.push({ path: 'temperature', message: 'temperature 应该在 0-1 之间', code: 'OUT_OF_RANGE' })
        }
      }

      // 检查未知字段
      const knownFields = ['model', 'max_tokens', 'temperature', 'top_p', 'top_k', 'stop', 'stream']
      const unknownFields = Object.keys(config).filter(key => !knownFields.includes(key))
      if (unknownFields.length > 0) {
        warnings.push({ path: 'root', message: `包含未知字段: ${unknownFields.join(', ')}`, code: 'UNKNOWN_FIELDS' })
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        data: config
      }

    } catch (error) {
      errors.push({ path: 'root', message: `配置验证失败: ${error instanceof Error ? error.message : String(error)}`, code: 'VALIDATION_ERROR' })
      return { isValid: false, errors, warnings }
    }
  }

  /**
   * 创建备份
   */
  async createBackup(path: string): Promise<BackupInfo> {
    try {
      const backupId = uuidv4()
      const fileName = basename(path)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFileName = `${fileName}.${timestamp}.backup`
      const backupPath = join(PATHS.BACKUP_DIR, backupFileName)

      // 确保备份目录存在
      await fs.mkdir(PATHS.BACKUP_DIR, { recursive: true })

      // 复制文件
      const content = await fs.readFile(path)
      await fs.writeFile(backupPath, content)

      const backupInfo: BackupInfo = {
        id: backupId,
        configPath: path,
        timestamp: new Date(),
        backupPath,
        size: content.length,
        description: `自动备份 - ${new Date().toLocaleString()}`
      }

      logger.info(`配置备份已创建: ${backupPath}`)
      return backupInfo

    } catch (error) {
      logger.error(`创建备份失败 ${path}:`, error)
      throw new Error(`创建备份失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(backupId: string): Promise<void> {
    try {
      // 这里简化实现，实际应该从数据库或文件中查找备份信息
      // 目前直接在备份目录中查找
      const backupFiles = await fs.readdir(PATHS.BACKUP_DIR)
      const backupFile = backupFiles.find(file => file.includes(backupId))

      if (!backupFile) {
        throw new Error(`备份文件不存在: ${backupId}`)
      }

      const backupPath = join(PATHS.BACKUP_DIR, backupFile)
      const content = await fs.readFile(backupPath)

      // 从备份文件名中提取原始配置文件名
      const originalFileName = backupFile.split('.').slice(0, -2).join('.')
      const configPath = join(this.claudeDir, originalFileName)

      // 恢复文件
      await fs.writeFile(configPath, content)

      logger.info(`配置已从备份恢复: ${configPath}`)

    } catch (error) {
      logger.error(`恢复备份失败 ${backupId}:`, error)
      throw new Error(`恢复备份失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 获取备份列表
   */
  async listBackups(configPath: string): Promise<BackupInfo[]> {
    try {
      const backupFiles = await fs.readdir(PATHS.BACKUP_DIR)
      const configFileName = basename(configPath)

      const backups: BackupInfo[] = []

      for (const file of backupFiles) {
        if (file.startsWith(configFileName) && file.endsWith('.backup')) {
          const backupPath = join(PATHS.BACKUP_DIR, file)
          const stats = await fs.stat(backupPath)

          const backupInfo: BackupInfo = {
            id: file.split('.').slice(-2)[0], // 提取 backupId
            configPath,
            timestamp: stats.mtime,
            backupPath,
            size: stats.size
          }

          backups.push(backupInfo)
        }
      }

      // 按时间倒序排列
      backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      return backups

    } catch (error) {
      logger.error(`获取备份列表失败 ${configPath}:`, error)
      throw new Error(`获取备份列表失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 确保 Claude 配置目录存在
   */
  private async ensureClaudeDir(): Promise<void> {
    try {
      await fs.mkdir(this.claudeDir, { recursive: true })
      logger.debug(`确保 Claude 配置目录存在: ${this.claudeDir}`)
    } catch (error) {
      logger.error(`创建 Claude 配置目录失败 (${this.claudeDir}):`, error)
      throw error
    }
  }

  /**
   * 获取所有配置文件
   */
  private async getAllConfigFiles(): Promise<string[]> {
    const files: string[] = []

    logger.info(`开始扫描配置文件，应用目录: ${this.claudeDir}`)

    // 扫描应用 .claude 目录
    await this.scanDirectory(this.claudeDir, files)
    logger.info(`应用目录扫描完成，找到 ${files.length} 个文件`)

    // 扫描用户目录下的系统配置文件
    await this.scanUserSystemConfigs(files)
    logger.info(`用户系统配置扫描完成，总共找到 ${files.length} 个文件`)

    return files
  }

  /**
   * 扫描用户目录下的系统配置文件
   * 只扫描固定的三个系统配置文件，不包括.ccb目录下的文件
   */
  private async scanUserSystemConfigs(files: string[]): Promise<void> {
    try {
      const os = require('os')
      const path = require('path')

      // 获取用户主目录
      const userHome = os.homedir()

      // 要扫描的系统配置文件 - 只有这三个是系统配置
      const systemConfigs = [
        path.join(userHome, '.claude', 'settings.json'),
        path.join(userHome, '.claude.json'),
        path.join(userHome, '.claude', 'CLAUDE.md')
      ]

      for (const configPath of systemConfigs) {
        try {
          // 检查文件是否存在
          await fs.access(configPath)
          if (this.isConfigFile(configPath) || configPath.endsWith('.md')) {
            files.push(configPath)
            logger.info(`发现系统配置文件: ${configPath}`)
          }
        } catch {
          // 文件不存在，尝试创建默认配置
          await this.createDefaultSystemConfig(configPath)
          try {
            await fs.access(configPath)
            files.push(configPath)
            logger.info(`创建默认系统配置文件: ${configPath}`)
          } catch {
            logger.debug(`无法创建默认系统配置文件: ${configPath}`)
          }
        }
      }
    } catch (error) {
      logger.error('扫描用户系统配置文件失败:', error)
    }
  }

  /**
   * 创建默认系统配置文件
   */
  private async createDefaultSystemConfig(configPath: string): Promise<void> {
    try {
      const path = require('path')
      const dir = path.dirname(configPath)
      
      // 确保目录存在
      await fs.mkdir(dir, { recursive: true })

      if (configPath.endsWith('settings.json')) {
        // 创建默认的settings.json
        const defaultSettings = {
          version: "1.0.0",
          theme: "auto",
          language: "zh-CN",
          autoSave: true,
          notifications: {
            enabled: true,
            sound: true
          },
          editor: {
            fontSize: 14,
            tabSize: 2,
            wordWrap: true,
            minimap: true
          },
          claude: {
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0.7
          }
        }
        await fs.writeFile(configPath, JSON.stringify(defaultSettings, null, 2), 'utf8')
      } else if (configPath.endsWith('.claude.json')) {
        // 创建默认的.claude.json
        const defaultClaudeConfig = {
          version: "1.0.0",
          name: "默认Claude配置",
          description: "系统默认的Claude配置",
          type: "system",
          settings: {
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0.7,
            systemPrompt: "你是一个有用的AI助手，请用中文回答用户的问题。"
          },
          rules: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        await fs.writeFile(configPath, JSON.stringify(defaultClaudeConfig, null, 2), 'utf8')
      } else if (configPath.endsWith('CLAUDE.md')) {
        // 创建默认的CLAUDE.md
        const defaultMemory = `# Claude 用户记忆配置

## 用户偏好
- 语言：中文
- 回答风格：详细、准确、友好
- 专业领域：编程、技术、学习

## 常用指令
- 代码审查
- 问题解答
- 学习指导

## 注意事项
- 请保持回答的准确性和实用性
- 适当使用代码示例
- 考虑用户的技术水平

---
*此文件由CCB自动创建于 ${new Date().toLocaleString()}*
`
        await fs.writeFile(configPath, defaultMemory, 'utf8')
      }
    } catch (error) {
      logger.error(`创建默认系统配置文件失败 ${configPath}:`, error)
    }
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(dir: string, files: string[]): Promise<void> {
    try {
      const items = await fs.readdir(dir, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(dir, item.name)

        if (item.isFile() && this.isConfigFile(fullPath)) {
          // 检查是否有对应的.meta文件，如果没有则忽略
          const metaPath = `${fullPath}.meta`
          try {
            await fs.access(metaPath)
            files.push(fullPath)
          } catch {
            // 没有.meta文件，忽略此配置文件
            logger.debug(`忽略无.meta文件的配置: ${fullPath}`)
          }
        } else if (item.isDirectory() && !item.name.startsWith('.')) {
          await this.scanDirectory(fullPath, files)
        }
      }
    } catch (error) {
      logger.error(`扫描目录失败 ${dir}:`, error)
    }
  }

  /**
   * 判断是否为配置文件
   */
  private isConfigFile(filePath: string): boolean {
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    // JSON 文件
    if (ext === '.json') {
      return true
    }

    // MD 文件（包括 CLAUDE.md 和其他 .md 文件）
    if (ext === '.md') {
      return true
    }

    return false
  }

  /**
   * 创建配置文件对象
   */
  private async createConfigFileObject(filePath: string): Promise<ConfigFile> {
    const stats = await fs.stat(filePath)
    const fileName = basename(filePath)

    let configType: ConfigType = 'custom'
    let isSystemConfig = false
    let configName = fileName
    let description = ''

    // 检查是否为系统配置文件
    const userHome = os.homedir()
    const normalizedFilePath = filePath.replace(/\\/g, '/')
    const normalizedUserHome = userHome.replace(/\\/g, '/')
    
    const isUserHomeConfig = normalizedFilePath.includes(normalizedUserHome) &&
      (normalizedFilePath.endsWith(`${normalizedUserHome}/.claude/settings.json`) ||
       normalizedFilePath.endsWith(`${normalizedUserHome}/.claude.json`) ||
       normalizedFilePath.endsWith(`${normalizedUserHome}/.claude/CLAUDE.md`))

    // 只有系统配置文件才使用预定义类型
    if (isUserHomeConfig) {
      // 根据文件路径确定具体类型
      if (normalizedFilePath.endsWith(`${normalizedUserHome}/.claude/settings.json`)) {
        configType = 'settings'
        configName = '用户settings配置'
        description = '用户目录下的 Claude Code settings配置文件 (settings.json)'
      } else if (normalizedFilePath.endsWith(`${normalizedUserHome}/.claude.json`)) {
        configType = 'claude-json'
        configName = '用户Claude配置'
        description = '用户目录下的 Claude Code 主配置文件 (.claude.json)'
      } else if (normalizedFilePath.endsWith(`${normalizedUserHome}/.claude/CLAUDE.md`)) {
        configType = 'claude-md'
        configName = '用户记忆配置'
        description = '用户目录下的 Claude 记忆配置文件 (CLAUDE.md)'
      }
      isSystemConfig = true
    } else if (fileName === CONFIG_FILES.SETTINGS_LOCAL) {
      configType = 'settings-local'
      isSystemConfig = true
      configName = '本地设置'
      description = 'Claude Code 本地配置文件 (settings.local.json)'
    } else if (fileName.endsWith('.md')) {
      configType = 'user-preferences'
      
      // 尝试从.meta文件读取元数据
      try {
        const metaPath = `${filePath}.meta`
        const metaContent = await fs.readFile(metaPath, 'utf8')
        const metadata = JSON.parse(metaContent)
        
        if (metadata.type) {
          configType = metadata.type as ConfigType
        }
        if (metadata.name) {
          configName = String(metadata.name)
        }
        if (metadata.description) {
          description = String(metadata.description)
        }
      } catch (metaError) {
        // 没有.meta文件，使用默认值
        configName = fileName.replace('.md', '')
        description = 'Markdown配置文件'
      }
    } else if (fileName.endsWith('.json')) {
      configType = 'custom'

      // 优先尝试从.meta文件读取元数据
      try {
        const metaPath = `${filePath}.meta`
        const metaContent = await fs.readFile(metaPath, 'utf8')
        const metadata = JSON.parse(metaContent)
        
        if (metadata.type) {
          configType = metadata.type as ConfigType
        }
        if (metadata.name) {
          configName = String(metadata.name)
        }
        if (metadata.description) {
          description = String(metadata.description)
        }
      } catch (metaError) {
        // 没有.meta文件，尝试从配置文件内容读取元数据
        try {
          const content = await this.getConfig(filePath)

        // 检查是否有_metadata字段（新格式）或多层JSON格式
        if (content && typeof content === 'object' && content._metadata) {
          const metadata = content._metadata
          if (metadata.type) {
            configType = metadata.type as ConfigType
          }
          if (metadata.name) {
            configName = String(metadata.name)
          }
          if (metadata.description) {
            description = String(metadata.description)
          }
        } else if (content && typeof content === 'object' && content.name && content.type && content.content) {
          // 多层JSON格式（类似导入_CLAUDE.md.json的结构）
          if (content.type) {
            configType = content.type as ConfigType
          }
          if (content.name) {
            configName = String(content.name)
          }
          if (content.description) {
            description = String(content.description)
          }
        } else if (content && typeof content === 'object') {
          // 检查是否为旧格式，如果是则自动迁移
          if (ConfigMigrationService.isOldFormat(content)) {
            logger.info(`检测到旧格式配置文件，开始自动迁移: ${filePath}`)
            try {
              await ConfigMigrationService.migrateConfigFile(filePath)
              // 重新读取迁移后的内容
              const migratedContent = await this.getConfig(filePath)
              if (migratedContent && migratedContent.type && migratedContent.name && migratedContent.content !== undefined) {
                if (migratedContent.type) configType = migratedContent.type as ConfigType
                if (migratedContent.name) configName = String(migratedContent.name)
                if (migratedContent.description) description = String(migratedContent.description)
              }
            } catch (migrationError) {
              logger.error(`自动迁移配置文件失败: ${filePath}`, migrationError)
              // 迁移失败时使用旧格式的字段
              if (content.type) configType = content.type as ConfigType
              if (content.name) configName = String(content.name)
              if (content.description) description = String(content.description)
            }
          } else {
            // 兼容旧格式：直接检查根级别的字段
            if (content.type) {
              configType = content.type as ConfigType
            }
            if (content.name) {
              configName = String(content.name)
            }
            if (content.description) {
              description = String(content.description)
            }
          }
        }
        } catch (error) {
          // 读取失败时使用默认值
          logger.warn(`无法读取配置文件内容以获取元数据: ${filePath}`, error)
        }
      }
    }

    // 检查配置是否与用户settings配置匹配
    let isInUse = false
    let isActive = false

    // 优先从.meta文件读取isInUse和isActive状态
    if (!isSystemConfig) {
      try {
        const metaPath = `${filePath}.meta`
        const metaContent = await fs.readFile(metaPath, 'utf8')
        const metadata = JSON.parse(metaContent)

        // 从元数据读取isInUse和isActive
        if (metadata.isInUse !== undefined) {
          isInUse = metadata.isInUse
        }
        if (metadata.isActive !== undefined) {
          isActive = metadata.isActive
        }

        logger.info(`从.meta文件读取配置状态: ${filePath} - isInUse: ${isInUse}, isActive: ${isActive}`)
      } catch (metaError) {
        logger.debug(`无法从.meta文件读取配置状态: ${filePath}`, metaError)
      }
    }

    // 如果未从.meta文件读取到状态，且是settings配置，则检查是否与用户settings匹配
    if (!isInUse && configType === 'settings' && !isUserHomeConfig) {
      try {
        isInUse = await this.checkConfigMatch(filePath)
        logger.info(`通过内容比对检查配置匹配状态: ${filePath} - isInUse: ${isInUse}`)
      } catch (error) {
        logger.warn(`检查配置匹配状态失败: ${filePath}`, error)
      }
    }

    return {
      id: uuidv4(),
      name: configName,
      path: filePath,
      type: configType,
      size: stats.size,
      lastModified: stats.mtime,
      isValid: true,
      description,
      isSystemConfig, // 添加系统配置标识
      isActive: isSystemConfig ? true : isActive, // 系统配置始终处于激活状态，用户配置从.meta读取
      isInUse // 从.meta文件读取或通过内容比对确定
    }
  }

  /**
   * 获取模板内容
   */
  private async getTemplateContent(templateName: string): Promise<any> {
    const templates: Record<string, any> = {
      'basic': {
        model: 'claude-3-sonnet',
        max_tokens: 4096,
        temperature: 0.7
      },
      'development': {
        model: 'claude-3-sonnet',
        max_tokens: 8192,
        temperature: 0.3,
        top_p: 0.9
      },
      'creative': {
        model: 'claude-3-opus',
        max_tokens: 4096,
        temperature: 0.9,
        top_p: 1.0,
        top_k: 250
      },
      'efficient': {
        model: 'claude-3-haiku',
        max_tokens: 2048,
        temperature: 0.5
      }
    }

    return templates[templateName] || templates.basic
  }

  /**
   * 验证是否为有效的CCB配置结构
   */
  private isValidCCBConfig(content: any): boolean {
    try {
      // CCB配置支持多种格式：
      // 1. 标准CCB settings.json格式：{env: {...}, permissions: {...}}
      // 2. Claude Code配置格式：{model, max_tokens, temperature, ...}
      // 3. 自定义JSON配置格式

      if (!content || typeof content !== 'object') {
        return false
      }

      // 检查是否为CCB标准配置格式
      if (content.env && typeof content.env === 'object') {
        // 验证env字段中的必需配置
        const env = content.env
        if (env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_BASE_URL) {
          // 这是CCB标准配置，验证permissions字段
          if (content.permissions && typeof content.permissions === 'object') {
            const permissions = content.permissions
            if (Array.isArray(permissions.allow) && Array.isArray(permissions.deny)) {
              return true
            }
          }
          return true // 即使没有permissions字段也接受
        }
      }

      // 检查是否为Claude Code配置格式
      if (content.model || content.max_tokens || content.temperature) {
        return true // 这是Claude Code配置格式
      }

      // 检查是否为其他有效的配置对象
      if (Object.keys(content).length > 0) {
        // 任何非空对象都可能是有效配置
        return true
      }

      return false
    } catch (error) {
      logger.error('CCB配置验证失败:', error)
      return false
    }
  }

  /**
   * 比较配置文件内容
   */
  async compareConfigs(config1Path: string, config2Path: string): Promise<boolean> {
    try {
      const content1 = await this.getConfig(config1Path)
      const content2 = await this.getConfig(config2Path)

      // 简单的内容比较，可以根据需要扩展
      return JSON.stringify(content1) === JSON.stringify(content2)
    } catch (error) {
      logger.error(`比较配置文件失败: ${error}`)
      return false
    }
  }

  /**
   * 比较配置内容（忽略格式差异）
   */
  async compareConfigContent(config1Path: string, config2Path: string): Promise<boolean> {
    try {
      const content1 = await this.getConfig(config1Path)
      const content2 = await this.getConfig(config2Path)

      // 标准化内容进行比较
      const normalizeContent = (content: any) => {
        if (typeof content === 'string') {
          try {
            return JSON.parse(content)
          } catch {
            return content
          }
        }
        return content
      }

      const normalized1 = normalizeContent(content1)
      const normalized2 = normalizeContent(content2)

      // 深度比较，忽略键的顺序
      return JSON.stringify(normalized1, Object.keys(normalized1).sort()) === 
             JSON.stringify(normalized2, Object.keys(normalized2).sort())
    } catch (error) {
      logger.error(`比较配置内容失败: ${error}`)
      return false
    }
  }

  /**
   * 检查配置是否与用户settings配置匹配
   */
  async checkConfigMatch(configPath: string): Promise<boolean> {
    try {
      const os = require('os')
      const userHome = os.homedir()
      const userSettingsPath = require('path').join(userHome, '.claude', 'settings.json')

      // 检查用户settings文件是否存在
      try {
        await require('fs/promises').access(userSettingsPath)
      } catch {
        return false // 用户settings文件不存在
      }

      // 比较配置内容
      return await this.compareConfigContent(configPath, userSettingsPath)
    } catch (error) {
      logger.error(`检查配置匹配失败: ${error}`)
      return false
    }
  }

  public async activateConfig(configPath: string): Promise<void> {
    try {
      logger.info(`开始激活配置: ${configPath}`)
      const configContent = await this.getConfig(configPath)
      const userSettingsPath = require('path').join(require('os').homedir(), '.claude', 'settings.json')

      logger.info(`用户系统settings路径: ${userSettingsPath}`)
      await this.saveConfig(userSettingsPath, configContent)
      logger.info(`配置内容已复制到用户系统settings`)

      await this.autoUpdateClaudeCodeStatus();
      logger.info(`✅ 配置激活完成，并已更新所有配置状态`)
    } catch (error) {
      logger.error(`激活配置失败: ${error}`)
      throw error
    }
  }

  public async autoUpdateClaudeCodeStatus(): Promise<{ updatedConfigs: number, totalConfigs: number }> {
    try {
      const configs = await this.scanConfigs();
      const userSettingsPath = require('path').join(require('os').homedir(), '.claude', 'settings.json');
      
      let systemSettingsContent;
      try {
        systemSettingsContent = await this.getConfig(userSettingsPath);
      } catch (e) {
        logger.warn('无法读取系统 settings.json，跳过状态更新。');
        return { updatedConfigs: 0, totalConfigs: configs.length };
      }

      let updatedCount = 0;
      for (const config of configs) {
        if (!config.isSystemConfig) {
          const configContent = await this.getConfig(config.path);
          const isMatch = JSON.stringify(configContent) === JSON.stringify(systemSettingsContent);
          
          if (config.isInUse !== isMatch) {
            const metadata = await this.getConfigMetadata(config.path) || {};
            await this.saveConfigMetadata(config.path, { ...metadata, isInUse: isMatch, isActive: isMatch });
            updatedCount++;
          }
        }
      }
      logger.info(`自动比对完成，更新了 ${updatedCount} 个配置状态`);
      return { updatedConfigs: updatedCount, totalConfigs: configs.length };
    } catch (error) {
      logger.error('自动更新Claude Code配置状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取默认配置内容
   */
  private getDefaultContent(fileName: string): any {
    // 所有配置文件统一使用标准的 Claude Code settings 配置模板
    return {
      env: {
        ANTHROPIC_AUTH_TOKEN: "Claude Code TokenKey",
        ANTHROPIC_BASE_URL: "Claude Code API URL",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
      },
      permissions: {
        allow: [],
        deny: []
      }
    }
  }

  /**
   * 从用户目录导入配置文件
   * 只扫描 ~/.claude 根目录下的 JSON 和 MD 文件（不递归子目录）
   * 排除系统配置文件：settings.json, .claude.json, CLAUDE.md
   */
  async importFromUserDir(): Promise<ConfigFile[]> {
    const importedConfigs: ConfigFile[] = []

    try {
      const userHome = os.homedir()
      const userClaudeDir = join(userHome, '.claude')

      logger.info(`开始从用户目录导入配置: ${userClaudeDir}`)

      // 检查用户 .claude 目录是否存在
      try {
        await fs.access(userClaudeDir)
      } catch {
        logger.warn(`用户 .claude 目录不存在: ${userClaudeDir}`)
        return importedConfigs
      }

      // 系统配置文件列表（需要排除的）
      const systemConfigFiles = ['settings.json', '.claude.json', 'CLAUDE.md', 'claude.md']

      // 只读取根目录下的文件，不递归子目录
      const items = await fs.readdir(userClaudeDir, { withFileTypes: true })

      for (const item of items) {
        // 只处理文件，跳过目录
        if (!item.isFile()) {
          continue
        }

        const fileName = item.name
        const ext = extname(fileName).toLowerCase()

        // 只处理 .json 和 .md 文件
        if (ext !== '.json' && ext !== '.md') {
          continue
        }

        // 排除系统配置文件
        if (systemConfigFiles.includes(fileName)) {
          logger.debug(`跳过系统配置文件: ${fileName}`)
          continue
        }

        const filePath = join(userClaudeDir, fileName)

        try {
          // 读取文件内容
          const content = await this.getConfig(filePath)

          // 根据文件扩展名设置默认类型
          const defaultType = ext === '.md' ? 'user-preferences' : 'claude-code'

          // 创建配置对象（使用默认类型）
          const config: ConfigFile = {
            id: uuidv4(),
            name: fileName.replace(/\.(json|md)$/i, ''),
            path: filePath,
            type: defaultType,
            size: (await fs.stat(filePath)).size,
            lastModified: (await fs.stat(filePath)).mtime,
            isValid: true,
            description: `从用户目录导入: ${fileName}`,
            isSystemConfig: false,
            isActive: false,
            isInUse: false,
            content // 包含文件内容
          }

          importedConfigs.push(config)
          logger.info(`成功导入配置文件: ${config.name} (${config.type}) - 路径: ${config.path}`)
        } catch (error) {
          logger.error(`导入配置文件失败 ${filePath}:`, error)
        }
      }

      logger.info(`从用户目录成功导入 ${importedConfigs.length} 个配置文件`)
      return importedConfigs

    } catch (error) {
      logger.error('从用户目录导入配置失败:', error)
      throw new Error(`从用户目录导入配置失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}