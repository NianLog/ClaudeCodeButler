/**
 * MCP管理服务
 * @description 负责管理Claude Code的MCP服务器配置,包括全局和项目级配置
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { mcpArchiveService } from './mcp-archive.service'
import type {
  ClaudeConfig,
  MCPServerConfig,
  MCPServerListItem,
  MCPServerFormData,
  MCPServerValidation,
  MCPConfigResult
} from '../../shared/types/mcp'

/**
 * MCP管理服务类
 */
export class MCPManagementService {
  private configPath: string

  constructor() {
    // Claude配置文件路径: ~/.claude.json
    this.configPath = path.join(os.homedir(), '.claude.json')
  }

  /**
   * 读取Claude配置文件
   * @returns Claude配置对象
   */
  async readClaudeConfig(): Promise<MCPConfigResult<ClaudeConfig>> {
    try {
      console.log('[MCP Management Service] 读取配置文件:', this.configPath)
      const content = await fs.readFile(this.configPath, 'utf-8')
      console.log('[MCP Management Service] 配置文件内容长度:', content.length)

      const config = JSON.parse(content) as ClaudeConfig
      console.log('[MCP Management Service] 配置解析成功,配置对象键:', Object.keys(config))

      // 输出配置的关键信息(不输出敏感数据)
      console.log('[MCP Management Service] 配置信息:', {
        hasMcpServers: !!config.mcpServers,
        mcpServersKeys: config.mcpServers ? Object.keys(config.mcpServers) : [],
        hasProjects: !!config.projects,
        projectsKeys: config.projects ? Object.keys(config.projects) : []
      })

      return { success: true, data: config }
    } catch (error: any) {
      console.error('[MCP Management Service] 读取配置文件失败:', error)
      if (error.code === 'ENOENT') {
        return {
          success: false,
          error: 'Claude配置文件不存在',
          details: { path: this.configPath }
        }
      }
      return {
        success: false,
        error: `读取配置文件失败: ${error.message}`,
        details: error
      }
    }
  }

  /**
   * 保存Claude配置文件
   * @description 使用原子性操作和备份机制,确保配置文件安全
   * @param config Claude配置对象
   */
  async saveClaudeConfig(config: ClaudeConfig): Promise<MCPConfigResult<void>> {
    const backupPath = `${this.configPath}.backup`
    let backupCreated = false

    try {
      // 步骤1: 验证配置对象结构
      if (!config || typeof config !== 'object') {
        return {
          success: false,
          error: '配置对象无效'
        }
      }

      // 步骤2: 验证JSON序列化
      let content: string
      try {
        content = JSON.stringify(config, null, 2)
        // 验证能否正确解析回来
        JSON.parse(content)
      } catch (jsonError: any) {
        return {
          success: false,
          error: `配置对象无法序列化为有效JSON: ${jsonError.message}`
        }
      }

      // 步骤3: 创建备份(如果原文件存在)
      try {
        await fs.access(this.configPath)
        // 文件存在,创建备份
        await fs.copyFile(this.configPath, backupPath)
        backupCreated = true
      } catch (accessError: any) {
        // 文件不存在,无需备份
        if (accessError.code !== 'ENOENT') {
          return {
            success: false,
            error: `无法访问配置文件: ${accessError.message}`
          }
        }
      }

      // 步骤4: 原子性写入 - 先写临时文件,再重命名
      const tempPath = `${this.configPath}.tmp`
      try {
        await fs.writeFile(tempPath, content, 'utf-8')
        // 验证写入的文件可以正确读取和解析
        const verifyContent = await fs.readFile(tempPath, 'utf-8')
        JSON.parse(verifyContent)

        // 原子性重命名
        await fs.rename(tempPath, this.configPath)
      } catch (writeError: any) {
        // 写入失败,恢复备份
        if (backupCreated) {
          try {
            await fs.copyFile(backupPath, this.configPath)
          } catch (restoreError) {
            // 恢复失败,严重错误
            return {
              success: false,
              error: `保存失败且无法恢复备份: ${(restoreError as Error).message}`,
              details: { originalError: writeError.message }
            }
          }
        }
        return {
          success: false,
          error: `写入配置文件失败: ${writeError.message}`,
          details: writeError
        }
      }

      // 步骤5: 清理备份文件
      if (backupCreated) {
        try {
          await fs.unlink(backupPath)
        } catch {
          // 删除备份失败不影响主流程
        }
      }

      return { success: true }
    } catch (error: any) {
      // 未预期的错误,尝试恢复备份
      if (backupCreated) {
        try {
          await fs.copyFile(backupPath, this.configPath)
        } catch {
          // 恢复失败
        }
      }
      return {
        success: false,
        error: `保存配置文件失败: ${error.message}`,
        details: error
      }
    }
  }

  /**
   * 获取所有MCP服务器列表(包括全局和项目级,以及已归档的服务器)
   * @returns MCP服务器列表
   */
  async listAllServers(): Promise<MCPConfigResult<MCPServerListItem[]>> {
    console.log('[MCP Management Service] ========== 开始执行 listAllServers ==========')

    const configResult = await this.readClaudeConfig()
    console.log('[MCP Management Service] readClaudeConfig 结果:', {
      success: configResult.success,
      hasData: !!configResult.data,
      error: configResult.error
    })

    if (!configResult.success || !configResult.data) {
      console.error('[MCP Management Service] 读取配置失败:', configResult.error)
      return { success: false, error: configResult.error }
    }

    const config = configResult.data
    const servers: MCPServerListItem[] = []

    console.log('[MCP Management Service] 配置文件结构:', {
      hasMcpServers: !!config.mcpServers,
      mcpServersCount: config.mcpServers ? Object.keys(config.mcpServers).length : 0,
      hasProjects: !!config.projects,
      projectsCount: config.projects ? Object.keys(config.projects).length : 0
    })

    // 添加全局MCP服务器(活动的)
    if (config.mcpServers) {
      console.log('[MCP Management Service] 处理全局 MCP 服务器...')
      const globalServerIds = Object.keys(config.mcpServers)
      console.log('[MCP Management Service] 全局服务器 IDs:', globalServerIds)

      Object.entries(config.mcpServers).forEach(([id, serverConfig]) => {
        console.log(`[MCP Management Service] 添加全局服务器: ${id}`, serverConfig)
        servers.push({
          id,
          config: serverConfig,
          scope: 'global',
          isGlobal: true
        })
      })
      console.log(`[MCP Management Service] 已添加 ${globalServerIds.length} 个全局服务器`)
    } else {
      console.log('[MCP Management Service] 配置中没有全局 MCP 服务器')
    }

    // 添加全局MCP服务器(已归档的)
    console.log('[MCP Management Service] 获取已归档的全局服务器...')
    const archivedGlobalServers = await mcpArchiveService.getArchivedGlobalServers()
    const archivedGlobalCount = Object.keys(archivedGlobalServers).length
    console.log(`[MCP Management Service] 已归档的全局服务器数量: ${archivedGlobalCount}`)

    Object.entries(archivedGlobalServers).forEach(([id, archiveEntry]) => {
      console.log(`[MCP Management Service] 添加已归档全局服务器: ${id}`)
      servers.push({
        id,
        config: { ...archiveEntry.config, disabled: true },
        scope: 'global',
        isGlobal: true
      })
    })

    // 添加项目级MCP服务器(活动的)
    if (config.projects) {
      console.log('[MCP Management Service] 处理项目级 MCP 服务器...')
      const projectPaths = Object.keys(config.projects)
      console.log(`[MCP Management Service] 项目数量: ${projectPaths.length}`)
      console.log('[MCP Management Service] 项目路径:', projectPaths)

      Object.entries(config.projects).forEach(([projectPath, projectConfig]) => {
        console.log(`[MCP Management Service] 检查项目: ${projectPath}`)
        console.log(`[MCP Management Service] 项目配置:`, {
          hasMcpServers: !!projectConfig.mcpServers,
          mcpServersCount: projectConfig.mcpServers ? Object.keys(projectConfig.mcpServers).length : 0
        })

        if (projectConfig.mcpServers) {
          const projectServerIds = Object.keys(projectConfig.mcpServers)
          console.log(`[MCP Management Service] 项目 ${projectPath} 的服务器:`, projectServerIds)

          Object.entries(projectConfig.mcpServers).forEach(([id, serverConfig]) => {
            console.log(`[MCP Management Service] 添加项目服务器: ${projectPath}/${id}`, serverConfig)
            servers.push({
              id,
              config: serverConfig,
              scope: projectPath,
              isGlobal: false,
              projectPath
            })
          })
        } else {
          console.log(`[MCP Management Service] 项目 ${projectPath} 没有 MCP 服务器`)
        }
      })
    } else {
      console.log('[MCP Management Service] 配置中没有项目')
    }

    // 添加项目级MCP服务器(已归档的)
    if (config.projects) {
      console.log('[MCP Management Service] 获取已归档的项目服务器...')
      for (const projectPath of Object.keys(config.projects)) {
        const archivedProjectServers = await mcpArchiveService.getArchivedProjectServers(projectPath)
        const archivedProjectCount = Object.keys(archivedProjectServers).length
        console.log(`[MCP Management Service] 项目 ${projectPath} 的已归档服务器数量: ${archivedProjectCount}`)

        Object.entries(archivedProjectServers).forEach(([id, archiveEntry]) => {
          console.log(`[MCP Management Service] 添加已归档项目服务器: ${projectPath}/${id}`)
          servers.push({
            id,
            config: { ...archiveEntry.config, disabled: true },
            scope: projectPath,
            isGlobal: false,
            projectPath
          })
        })
      }
    }

    console.log(`[MCP Management Service] ========== 完成 listAllServers,总共 ${servers.length} 个服务器 ==========`)
    console.log('[MCP Management Service] 服务器列表:', JSON.stringify(servers, null, 2))

    return { success: true, data: servers }
  }

  /**
   * 获取全局MCP服务器
   * @returns 全局MCP服务器映射
   */
  async getGlobalServers(): Promise<MCPConfigResult<Record<string, MCPServerConfig>>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    return {
      success: true,
      data: configResult.data.mcpServers || {}
    }
  }

  /**
   * 获取项目级MCP服务器
   * @param projectPath 项目路径
   * @returns 项目MCP服务器映射
   */
  async getProjectServers(
    projectPath: string
  ): Promise<MCPConfigResult<Record<string, MCPServerConfig>>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data
    const projectConfig = config.projects?.[projectPath]

    return {
      success: true,
      data: projectConfig?.mcpServers || {}
    }
  }

  /**
   * 添加或更新MCP服务器
   * @param formData 服务器表单数据
   * @returns 操作结果
   */
  async addOrUpdateServer(formData: MCPServerFormData): Promise<MCPConfigResult<void>> {
    // 验证表单数据
    const validation = this.validateServerFormData(formData)
    if (!validation.valid) {
      return {
        success: false,
        error: '服务器配置验证失败',
        details: validation.errors
      }
    }

    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data

    // 转换表单数据为服务器配置
    const serverConfig: MCPServerConfig = {
      command: formData.command.trim()
    }

    // 处理可选字段
    if (formData.type) {
      serverConfig.type = formData.type
    }

    if (formData.argsText) {
      // 解析参数文本(支持空格或换行分隔)
      serverConfig.args = formData.argsText
        .split(/[\s\n]+/)
        .map(arg => arg.trim())
        .filter(arg => arg.length > 0)
    }

    if (formData.envText) {
      // 尝试解析环境变量(支持JSON格式或键值对格式)
      try {
        serverConfig.env = JSON.parse(formData.envText)
      } catch {
        // 如果不是JSON,尝试解析为键值对格式 (KEY=VALUE)
        const env: Record<string, string> = {}
        formData.envText.split('\n').forEach(line => {
          const match = line.match(/^([^=]+)=(.*)$/)
          if (match) {
            env[match[1].trim()] = match[2].trim()
          }
        })
        if (Object.keys(env).length > 0) {
          serverConfig.env = env
        }
      }
    }

    if (formData.disabled !== undefined) {
      serverConfig.disabled = formData.disabled
    }

    if (formData.timeout) {
      serverConfig.timeout = formData.timeout
    }

    if (formData.autoApproveText) {
      serverConfig.autoApprove = formData.autoApproveText
        .split(',')
        .map(tool => tool.trim())
        .filter(tool => tool.length > 0)
    }

    if (formData.fromGalleryId) {
      serverConfig.fromGalleryId = formData.fromGalleryId.trim()
    }

    // 根据目标范围添加到配置
    if (formData.targetScope === 'global') {
      // 添加到全局MCP服务器
      if (!config.mcpServers) {
        config.mcpServers = {}
      }
      config.mcpServers[formData.id] = serverConfig
    } else {
      // 添加到项目级MCP服务器
      const projectPath = formData.targetScope
      if (!config.projects) {
        config.projects = {}
      }
      if (!config.projects[projectPath]) {
        config.projects[projectPath] = {}
      }
      if (!config.projects[projectPath].mcpServers) {
        config.projects[projectPath].mcpServers = {}
      }
      config.projects[projectPath].mcpServers![formData.id] = serverConfig
    }

    // 保存配置
    return await this.saveClaudeConfig(config)
  }

  /**
   * 删除MCP服务器
   * @param serverId 服务器ID
   * @param scope 范围('global'或项目路径)
   * @returns 操作结果
   */
  async deleteServer(serverId: string, scope: string): Promise<MCPConfigResult<void>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data

    if (scope === 'global') {
      // 从全局MCP服务器中删除
      if (config.mcpServers && config.mcpServers[serverId]) {
        delete config.mcpServers[serverId]
      } else {
        return {
          success: false,
          error: `全局MCP服务器 "${serverId}" 不存在`
        }
      }
    } else {
      // 从项目级MCP服务器中删除
      const projectPath = scope
      if (
        config.projects &&
        config.projects[projectPath] &&
        config.projects[projectPath].mcpServers &&
        config.projects[projectPath].mcpServers![serverId]
      ) {
        delete config.projects[projectPath].mcpServers![serverId]
      } else {
        return {
          success: false,
          error: `项目 "${projectPath}" 的MCP服务器 "${serverId}" 不存在`
        }
      }
    }

    // 保存配置
    return await this.saveClaudeConfig(config)
  }

  /**
   * 切换MCP服务器启用状态(使用Archive机制)
   * 禁用时:将服务器配置从.claude.json移动到archive文件
   * 启用时:将服务器配置从archive文件移回.claude.json
   * @param serverId 服务器ID
   * @param scope 范围('global'或项目路径)
   * @returns 操作结果,data为新的disabled状态
   */
  async toggleServer(serverId: string, scope: string): Promise<MCPConfigResult<boolean>> {
    try {
      // 检查服务器是否在 archive 中
      const isArchived = await mcpArchiveService.isArchived(serverId, scope)

      if (isArchived) {
        // 服务器在archive中,需要启用(从archive移回.claude.json)
        const restoredConfig = scope === 'global'
          ? await mcpArchiveService.restoreGlobalServer(serverId)
          : await mcpArchiveService.restoreProjectServer(serverId, scope)

        if (!restoredConfig) {
          return {
            success: false,
            error: `无法从archive恢复服务器 "${serverId}"`
          }
        }

        // 读取当前配置
        const configResult = await this.readClaudeConfig()
        if (!configResult.success || !configResult.data) {
          return { success: false, error: configResult.error }
        }

        const config = configResult.data

        // 添加到.claude.json
        if (scope === 'global') {
          if (!config.mcpServers) config.mcpServers = {}
          config.mcpServers[serverId] = restoredConfig
        } else {
          const projectPath = scope
          if (!config.projects) config.projects = {}
          if (!config.projects[projectPath]) config.projects[projectPath] = { mcpServers: {} } as any
          if (!config.projects[projectPath].mcpServers) config.projects[projectPath].mcpServers = {}
          config.projects[projectPath].mcpServers![serverId] = restoredConfig
        }

        // 保存配置
        const saveResult = await this.saveClaudeConfig(config)
        if (!saveResult.success) {
          return { success: false, error: saveResult.error }
        }

        return { success: true, data: false } // false = 已启用(not disabled)
      } else {
        // 服务器不在archive中,需要禁用(从.claude.json移到archive)
        const configResult = await this.readClaudeConfig()
        if (!configResult.success || !configResult.data) {
          return { success: false, error: configResult.error }
        }

        const config = configResult.data
        let serverConfig: MCPServerConfig | undefined

        // 获取服务器配置
        if (scope === 'global') {
          serverConfig = config.mcpServers?.[serverId]
        } else {
          const projectPath = scope
          serverConfig = config.projects?.[projectPath]?.mcpServers?.[serverId]
        }

        if (!serverConfig) {
          return {
            success: false,
            error: `MCP服务器 "${serverId}" 不存在`
          }
        }

        // 移动到archive
        const archiveResult = scope === 'global'
          ? await mcpArchiveService.archiveGlobalServer(serverId, serverConfig)
          : await mcpArchiveService.archiveProjectServer(serverId, scope, serverConfig)

        if (!archiveResult.success) {
          return {
            success: false,
            error: archiveResult.error || '移动到archive失败'
          }
        }

        // 从.claude.json中删除
        if (scope === 'global') {
          if (config.mcpServers) {
            delete config.mcpServers[serverId]
          }
        } else {
          const projectPath = scope
          if (config.projects?.[projectPath]?.mcpServers) {
            delete config.projects[projectPath].mcpServers![serverId]
          }
        }

        // 保存配置
        const saveResult = await this.saveClaudeConfig(config)
        if (!saveResult.success) {
          return { success: false, error: saveResult.error }
        }

        return { success: true, data: true } // true = 已禁用(disabled)
      }
    } catch (error) {
      const errorMessage = `切换服务器 "${serverId}" 状态失败: ${(error as Error).message}`
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 复制MCP服务器
   * @param serverId 源服务器ID
   * @param scope 源范围
   * @param newServerId 新服务器ID
   * @param targetScope 目标范围
   * @returns 操作结果
   */
  async duplicateServer(
    serverId: string,
    scope: string,
    newServerId: string,
    targetScope: string
  ): Promise<MCPConfigResult<void>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data
    let sourceServerConfig: MCPServerConfig | undefined

    // 获取源服务器配置
    if (scope === 'global') {
      sourceServerConfig = config.mcpServers?.[serverId]
    } else {
      const projectPath = scope
      sourceServerConfig = config.projects?.[projectPath]?.mcpServers?.[serverId]
    }

    if (!sourceServerConfig) {
      return {
        success: false,
        error: `源MCP服务器 "${serverId}" 不存在`
      }
    }

    // 复制服务器配置
    const newServerConfig = JSON.parse(JSON.stringify(sourceServerConfig)) as MCPServerConfig

    // 添加到目标范围
    if (targetScope === 'global') {
      if (!config.mcpServers) {
        config.mcpServers = {}
      }
      if (config.mcpServers[newServerId]) {
        return {
          success: false,
          error: `全局MCP服务器 "${newServerId}" 已存在`
        }
      }
      config.mcpServers[newServerId] = newServerConfig
    } else {
      const projectPath = targetScope
      if (!config.projects) {
        config.projects = {}
      }
      if (!config.projects[projectPath]) {
        config.projects[projectPath] = {}
      }
      if (!config.projects[projectPath].mcpServers) {
        config.projects[projectPath].mcpServers = {}
      }
      if (config.projects[projectPath].mcpServers![newServerId]) {
        return {
          success: false,
          error: `项目 "${projectPath}" 的MCP服务器 "${newServerId}" 已存在`
        }
      }
      config.projects[projectPath].mcpServers![newServerId] = newServerConfig
    }

    // 保存配置
    return await this.saveClaudeConfig(config)
  }

  /**
   * 获取所有项目路径列表
   * @returns 项目路径数组
   */
  async getProjectPaths(): Promise<MCPConfigResult<string[]>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data
    const projectPaths = config.projects ? Object.keys(config.projects) : []

    return { success: true, data: projectPaths }
  }

  /**
   * 验证服务器表单数据
   * @param formData 表单数据
   * @returns 验证结果
   */
  private validateServerFormData(formData: MCPServerFormData): MCPServerValidation {
    const errors: Record<string, string> = {}

    // 验证ID
    if (!formData.id || formData.id.trim().length === 0) {
      errors.id = '服务器ID不能为空'
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.id)) {
      errors.id = '服务器ID只能包含字母、数字、下划线和连字符'
    }

    // 验证命令
    if (!formData.command || formData.command.trim().length === 0) {
      errors.command = '执行命令不能为空'
    }

    // 验证环境变量格式
    if (formData.envText) {
      try {
        // 尝试解析为JSON
        JSON.parse(formData.envText)
      } catch {
        // 如果不是JSON,验证键值对格式
        const lines = formData.envText.split('\n').filter(line => line.trim().length > 0)
        const invalidLines = lines.filter(line => !line.match(/^[^=]+=/))
        if (invalidLines.length > 0) {
          errors.env = '环境变量格式错误,应为JSON或KEY=VALUE格式'
        }
      }
    }

    // 验证超时时间
    if (formData.timeout !== undefined && formData.timeout < 0) {
      errors.timeout = '超时时间不能为负数'
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: Object.keys(errors).length > 0 ? errors : undefined
    }
  }

  /**
   * 导出MCP配置为JSON字符串
   * @param serverId 服务器ID
   * @param scope 范围
   * @returns JSON字符串
   */
  async exportServerConfig(
    serverId: string,
    scope: string
  ): Promise<MCPConfigResult<string>> {
    const configResult = await this.readClaudeConfig()
    if (!configResult.success || !configResult.data) {
      return { success: false, error: configResult.error }
    }

    const config = configResult.data
    let serverConfig: MCPServerConfig | undefined

    if (scope === 'global') {
      serverConfig = config.mcpServers?.[serverId]
    } else {
      const projectPath = scope
      serverConfig = config.projects?.[projectPath]?.mcpServers?.[serverId]
    }

    if (!serverConfig) {
      return {
        success: false,
        error: `MCP服务器 "${serverId}" 不存在`
      }
    }

    try {
      const jsonString = JSON.stringify(serverConfig, null, 2)
      return { success: true, data: jsonString }
    } catch (error: any) {
      return {
        success: false,
        error: `导出配置失败: ${error.message}`
      }
    }
  }

  /**
   * 从JSON字符串导入MCP配置
   * @param jsonString JSON字符串
   * @param serverId 服务器ID
   * @param targetScope 目标范围
   * @returns 操作结果
   */
  async importServerConfig(
    jsonString: string,
    serverId: string,
    targetScope: string
  ): Promise<MCPConfigResult<void>> {
    try {
      const serverConfig = JSON.parse(jsonString) as MCPServerConfig

      // 基本验证
      if (!serverConfig.command) {
        return {
          success: false,
          error: '导入的配置缺少必需的command字段'
        }
      }

      const configResult = await this.readClaudeConfig()
      if (!configResult.success || !configResult.data) {
        return { success: false, error: configResult.error }
      }

      const config = configResult.data

      // 添加到目标范围
      if (targetScope === 'global') {
        if (!config.mcpServers) {
          config.mcpServers = {}
        }
        config.mcpServers[serverId] = serverConfig
      } else {
        const projectPath = targetScope
        if (!config.projects) {
          config.projects = {}
        }
        if (!config.projects[projectPath]) {
          config.projects[projectPath] = {}
        }
        if (!config.projects[projectPath].mcpServers) {
          config.projects[projectPath].mcpServers = {}
        }
        config.projects[projectPath].mcpServers![serverId] = serverConfig
      }

      // 保存配置
      return await this.saveClaudeConfig(config)
    } catch (error: any) {
      return {
        success: false,
        error: `导入配置失败: ${error.message}`
      }
    }
  }
}

// 导出单例实例
export const mcpManagementService = new MCPManagementService()
