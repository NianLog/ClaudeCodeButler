/**
 * 配置文件迁移服务
 * 负责将旧格式的配置文件迁移到新的_metadata格式
 */

import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { logger } from '../utils/logger'

export interface OldConfigFormat {
  name: string
  description?: string
  type: string
  content: any
  isActive?: boolean
}

export interface NewConfigFormat {
  name: string
  description: string
  type: string
  content: any
  isActive: boolean
  created: string
  lastModified: string
}

/**
 * 配置文件迁移服务
 */
export class ConfigMigrationService {
  /**
   * 检查配置文件是否为旧格式
   */
  static isOldFormat(config: any): config is OldConfigFormat {
    return (
      config &&
      typeof config === 'object' &&
      'name' in config &&
      'type' in config &&
      'content' in config &&
      !('_metadata' in config) &&
      // 确保不是新的多层JSON格式
      !(config.name && config.type && config.content !== undefined && config.isActive !== undefined)
    )
  }

  /**
   * 将旧格式配置迁移到新格式
   */
  static migrateToNewFormat(oldConfig: OldConfigFormat): NewConfigFormat {
    const now = new Date().toISOString()
    
    return {
      name: oldConfig.name || '未命名配置',
      description: oldConfig.description || '',
      type: oldConfig.type || 'claude-code',
      content: oldConfig.content,
      isActive: oldConfig.isActive || false,
      created: now,
      lastModified: now
    }
  }

  /**
   * 迁移单个配置文件
   */
  static async migrateConfigFile(filePath: string): Promise<boolean> {
    try {
      logger.info(`开始迁移配置文件: ${filePath}`)
      
      // 读取文件内容
      const content = await readFile(filePath, 'utf8')
      const config = JSON.parse(content)
      
      // 检查是否为旧格式
      if (!this.isOldFormat(config)) {
        logger.info(`配置文件已为新格式，跳过迁移: ${filePath}`)
        return false
      }
      
      // 迁移到新格式
      const newConfig = this.migrateToNewFormat(config)
      
      // 创建备份
      const backupPath = `${filePath}.backup.${Date.now()}`
      await writeFile(backupPath, content, 'utf8')
      logger.info(`已创建备份文件: ${backupPath}`)
      
      // 写入新格式
      await writeFile(filePath, JSON.stringify(newConfig, null, 2), 'utf8')
      logger.info(`配置文件迁移完成: ${filePath}`)
      
      return true
    } catch (error) {
      logger.error(`迁移配置文件失败 ${filePath}:`, error)
      return false
    }
  }

  /**
   * 批量迁移配置文件
   */
  static async migrateConfigFiles(filePaths: string[]): Promise<{
    success: string[]
    failed: string[]
    skipped: string[]
  }> {
    const result = {
      success: [] as string[],
      failed: [] as string[],
      skipped: [] as string[]
    }

    for (const filePath of filePaths) {
      try {
        const migrated = await this.migrateConfigFile(filePath)
        if (migrated) {
          result.success.push(filePath)
        } else {
          result.skipped.push(filePath)
        }
      } catch (error) {
        logger.error(`迁移配置文件失败: ${filePath}`, error)
        result.failed.push(filePath)
      }
    }

    logger.info(`配置文件迁移完成: 成功 ${result.success.length}, 跳过 ${result.skipped.length}, 失败 ${result.failed.length}`)
    return result
  }
}
