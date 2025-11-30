/**
 * MCP Archive Service
 * @description 管理被禁用的MCP服务器配置的存档服务
 * 将禁用的服务器配置从 .claude.json 移动到独立的 archive 文件
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { logger } from '../utils/logger'
import type { MCPServerConfig } from '@shared/types/mcp'

/**
 * Archive 条目接口
 */
interface MCPArchiveEntry {
  config: MCPServerConfig
  archivedAt: number
}

/**
 * Archive 文件结构接口
 */
interface MCPArchiveFile {
  global: Record<string, MCPArchiveEntry>
  projects: Record<string, Record<string, MCPArchiveEntry>>
}

/**
 * Archive 操作结果接口
 */
interface ArchiveResult {
  success: boolean
  error?: string
}

/**
 * MCP Archive Service 类
 */
class MCPArchiveService {
  private archivePath: string

  constructor() {
    // Archive 文件存储在应用数据目录
    const userDataPath = app.getPath('userData')
    this.archivePath = path.join(userDataPath, 'mcp-archive.json')
  }

  /**
   * 读取 Archive 文件
   * @returns Archive 文件内容
   */
  async readArchive(): Promise<MCPArchiveFile> {
    try {
      const content = await fs.readFile(this.archivePath, 'utf-8')
      const archive = JSON.parse(content) as MCPArchiveFile

      // 确保结构完整
      if (!archive.global) archive.global = {}
      if (!archive.projects) archive.projects = {}

      return archive
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在,返回空结构
        logger.info('Archive 文件不存在,创建新的空 Archive')
        return {
          global: {},
          projects: {}
        }
      }
      logger.error('读取 Archive 文件失败:', error)
      throw error
    }
  }

  /**
   * 写入 Archive 文件
   * @param archive Archive 文件内容
   */
  async writeArchive(archive: MCPArchiveFile): Promise<void> {
    try {
      const content = JSON.stringify(archive, null, 2)
      await fs.writeFile(this.archivePath, content, 'utf-8')
      logger.info('Archive 文件写入成功')
    } catch (error) {
      logger.error('写入 Archive 文件失败:', error)
      throw error
    }
  }

  /**
   * 存档全局服务器
   * @param serverId 服务器ID
   * @param config 服务器配置
   * @returns 操作结果
   */
  async archiveGlobalServer(serverId: string, config: MCPServerConfig): Promise<ArchiveResult> {
    try {
      const archive = await this.readArchive()

      // 添加到全局 archive
      archive.global[serverId] = {
        config,
        archivedAt: Date.now()
      }

      await this.writeArchive(archive)
      logger.info(`全局服务器 "${serverId}" 已存档`)

      return { success: true }
    } catch (error) {
      const errorMessage = `存档全局服务器 "${serverId}" 失败: ${(error as Error).message}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 存档项目级服务器
   * @param serverId 服务器ID
   * @param projectPath 项目路径
   * @param config 服务器配置
   * @returns 操作结果
   */
  async archiveProjectServer(
    serverId: string,
    projectPath: string,
    config: MCPServerConfig
  ): Promise<ArchiveResult> {
    try {
      const archive = await this.readArchive()

      // 确保项目路径存在
      if (!archive.projects[projectPath]) {
        archive.projects[projectPath] = {}
      }

      // 添加到项目 archive
      archive.projects[projectPath][serverId] = {
        config,
        archivedAt: Date.now()
      }

      await this.writeArchive(archive)
      logger.info(`项目服务器 "${serverId}" (${projectPath}) 已存档`)

      return { success: true }
    } catch (error) {
      const errorMessage = `存档项目服务器 "${serverId}" 失败: ${(error as Error).message}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 恢复全局服务器
   * @param serverId 服务器ID
   * @returns 服务器配置,如果不存在返回 null
   */
  async restoreGlobalServer(serverId: string): Promise<MCPServerConfig | null> {
    try {
      const archive = await this.readArchive()

      const entry = archive.global[serverId]
      if (!entry) {
        logger.warn(`全局服务器 "${serverId}" 不在 archive 中`)
        return null
      }

      // 从 archive 中移除
      const config = entry.config
      delete archive.global[serverId]
      await this.writeArchive(archive)

      logger.info(`全局服务器 "${serverId}" 已从 archive 恢复`)
      return config
    } catch (error) {
      logger.error(`恢复全局服务器 "${serverId}" 失败:`, error)
      throw error
    }
  }

  /**
   * 恢复项目级服务器
   * @param serverId 服务器ID
   * @param projectPath 项目路径
   * @returns 服务器配置,如果不存在返回 null
   */
  async restoreProjectServer(serverId: string, projectPath: string): Promise<MCPServerConfig | null> {
    try {
      const archive = await this.readArchive()

      const projectArchive = archive.projects[projectPath]
      if (!projectArchive || !projectArchive[serverId]) {
        logger.warn(`项目服务器 "${serverId}" (${projectPath}) 不在 archive 中`)
        return null
      }

      // 从 archive 中移除
      const config = projectArchive[serverId].config
      delete projectArchive[serverId]

      // 如果项目 archive 为空,删除项目条目
      if (Object.keys(projectArchive).length === 0) {
        delete archive.projects[projectPath]
      }

      await this.writeArchive(archive)

      logger.info(`项目服务器 "${serverId}" (${projectPath}) 已从 archive 恢复`)
      return config
    } catch (error) {
      logger.error(`恢复项目服务器 "${serverId}" 失败:`, error)
      throw error
    }
  }

  /**
   * 获取所有已存档的全局服务器
   * @returns 已存档的全局服务器列表
   */
  async getArchivedGlobalServers(): Promise<Record<string, MCPArchiveEntry>> {
    try {
      const archive = await this.readArchive()
      return archive.global
    } catch (error) {
      logger.error('获取已存档的全局服务器失败:', error)
      return {}
    }
  }

  /**
   * 获取项目的所有已存档服务器
   * @param projectPath 项目路径
   * @returns 已存档的项目服务器列表
   */
  async getArchivedProjectServers(projectPath: string): Promise<Record<string, MCPArchiveEntry>> {
    try {
      const archive = await this.readArchive()
      return archive.projects[projectPath] || {}
    } catch (error) {
      logger.error(`获取项目 "${projectPath}" 的已存档服务器失败:`, error)
      return {}
    }
  }

  /**
   * 检查服务器是否在 archive 中
   * @param serverId 服务器ID
   * @param scope 作用域(global 或项目路径)
   * @returns 是否在 archive 中
   */
  async isArchived(serverId: string, scope: string): Promise<boolean> {
    try {
      const archive = await this.readArchive()

      if (scope === 'global') {
        return !!archive.global[serverId]
      } else {
        const projectArchive = archive.projects[scope]
        return projectArchive ? !!projectArchive[serverId] : false
      }
    } catch (error) {
      logger.error(`检查服务器 "${serverId}" 是否在 archive 中失败:`, error)
      return false
    }
  }

  /**
   * 删除已存档的服务器
   * @param serverId 服务器ID
   * @param scope 作用域(global 或项目路径)
   * @returns 操作结果
   */
  async deleteArchivedServer(serverId: string, scope: string): Promise<ArchiveResult> {
    try {
      const archive = await this.readArchive()

      if (scope === 'global') {
        if (!archive.global[serverId]) {
          return { success: false, error: `服务器 "${serverId}" 不在全局 archive 中` }
        }
        delete archive.global[serverId]
      } else {
        const projectArchive = archive.projects[scope]
        if (!projectArchive || !projectArchive[serverId]) {
          return { success: false, error: `服务器 "${serverId}" 不在项目 archive 中` }
        }
        delete projectArchive[serverId]

        // 如果项目 archive 为空,删除项目条目
        if (Object.keys(projectArchive).length === 0) {
          delete archive.projects[scope]
        }
      }

      await this.writeArchive(archive)
      logger.info(`已存档的服务器 "${serverId}" (${scope}) 已永久删除`)

      return { success: true }
    } catch (error) {
      const errorMessage = `删除已存档的服务器 "${serverId}" 失败: ${(error as Error).message}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取 archive 文件路径
   * @returns archive 文件路径
   */
  getArchivePath(): string {
    return this.archivePath
  }
}

// 导出单例实例
export const mcpArchiveService = new MCPArchiveService()
