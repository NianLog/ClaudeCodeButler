/**
 * 子Agent管理服务类
 *
 * 功能:
 * - 扫描 ~/.claude/agents/ 目录下的所有Agent文件
 * - 解析YAML frontmatter元数据
 * - 支持添加、删除、导入Agent
 * - 验证Agent文件格式
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'
import { logger } from '../utils/logger'
import type {
  AgentFile,
  AgentMetadata,
  AgentFormData,
  AgentImportOptions
} from '@shared/types/agents'

/**
 * Agent管理服务类
 */
class AgentsManagementService {
  private agentsDir: string

  constructor() {
    this.agentsDir = path.join(os.homedir(), '.claude', 'agents')
    this.initializeAgentsDir()
  }

  /**
   * 初始化agents目录
   */
  private async initializeAgentsDir(): Promise<void> {
    try {
      await fs.access(this.agentsDir)
    } catch {
      logger.info(`创建agents目录: ${this.agentsDir}`)
      await fs.mkdir(this.agentsDir, { recursive: true })
    }
  }

  /**
   * 扫描所有Agent文件
   */
  public async scanAgents(): Promise<AgentFile[]> {
    try {
      await this.initializeAgentsDir()

      const entries = await fs.readdir(this.agentsDir, { withFileTypes: true })
      const agentFiles = entries
        .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
        .map(entry => path.join(this.agentsDir, entry.name))

      const agents: AgentFile[] = []
      for (const filePath of agentFiles) {
        try {
          const agent = await this.parseAgentFile(filePath)
          if (agent) {
            agents.push(agent)
          }
        } catch (error) {
          logger.warn(`解析Agent文件失败: ${filePath}`, error)
        }
      }

      logger.info(`扫描到 ${agents.length} 个Agent文件`)
      return agents
    } catch (error) {
      logger.error('扫描Agent文件失败:', error)
      return []
    }
  }

  /**
   * 解析单个Agent文件
   */
  public async getAgent(agentId: string): Promise<AgentFile | null> {
    try {
      const filePath = path.join(this.agentsDir, `${agentId}.md`)
      return await this.parseAgentFile(filePath)
    } catch (error) {
      logger.error(`获取Agent失败: ${agentId}`, error)
      return null
    }
  }

  /**
   * 解析Agent文件内容和元数据
   */
  private async parseAgentFile(filePath: string): Promise<AgentFile | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const stats = await fs.stat(filePath)
      const metadata = this.parseFrontmatter(content)

      // 只验证必填字段：name和description（确保是字符串类型）
      const name = String(metadata.name || '').trim()
      const description = String(metadata.description || '').trim()

      if (!name) {
        logger.warn(`Agent文件缺少name字段: ${filePath}`)
        return null
      }

      if (!description) {
        logger.warn(`Agent文件缺少description字段: ${filePath}`)
        return null
      }

      const fileName = path.basename(filePath)
      const id = fileName.replace(/\.md$/, '')

      return {
        id,
        metadata,
        filePath,
        fileName,
        fileSize: stats.size,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
        content
      }
    } catch (error) {
      logger.error(`解析Agent文件失败: ${filePath}`, error)
      return null
    }
  }

  /**
   * 解析YAML frontmatter
   * 如果 YAML 解析失败，尝试手动提取 name 和 description
   */
  private parseFrontmatter(content: string): AgentMetadata {
    try {
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
      const match = content.match(frontmatterRegex)

      if (!match) {
        logger.warn('未找到YAML frontmatter，尝试手动提取')
        return this.extractMetadataManually(content)
      }

      const yamlContent = match[1]
      const metadata = yaml.load(yamlContent) as any

      // 处理tools字段：可能是字符串或数组
      let tools: string[] = []
      if (metadata.tools) {
        if (Array.isArray(metadata.tools)) {
          tools = metadata.tools
        } else if (typeof metadata.tools === 'string') {
          // 分割逗号、空格或中文逗号
          tools = metadata.tools
            .split(/[,，\s]+/)
            .filter((tool: string) => tool.trim().length > 0)
        }
      }

      return {
        name: metadata.name || '',
        description: metadata.description || '',
        tools,
        model: metadata.model || undefined,
        color: metadata.color || undefined
      }
    } catch (error) {
      logger.warn('YAML解析失败，尝试手动提取元数据:', error)
      return this.extractMetadataManually(content)
    }
  }

  /**
   * 手动提取 name 和 description（容错处理）
   */
  private extractMetadataManually(content: string): AgentMetadata {
    // 提取 name
    const nameMatch = content.match(/^name:\s*(.+?)\s*$/m)
    const name = nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : ''

    // 提取 description（可能在多行）
    const descMatch = content.match(/^description:\s*(.+?)\s*(?=^name:|^tools:|^model:|^color:|^---|\n*$)/ms)
    const description = descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, '').replace(/\n+/g, ' ') : ''

    // 提取 tools
    const toolsMatch = content.match(/^tools:\s*(.+?)\s*(?=^name:|^description:|^model:|^color:|^---|\n*$)/ms)
    let tools: string[] = []
    if (toolsMatch) {
      const toolsStr = toolsMatch[1].trim()
      // 尝试分割数组格式或逗号分隔格式
      if (toolsStr.includes('-')) {
        // YAML 列表格式
        tools = toolsStr.split(/\n-\s*/).filter(t => t.trim().length > 0)
      } else {
        // 逗号分隔格式
        tools = toolsStr.split(/[,，\s]+/).filter(t => t.trim().length > 0)
      }
    }

    // 提取 model
    const modelMatch = content.match(/^model:\s*(.+?)\s*$/m)
    const model = modelMatch ? modelMatch[1].trim() : undefined

    // 提取 color
    const colorMatch = content.match(/^color:\s*(.+?)\s*$/m)
    const color = colorMatch ? colorMatch[1].trim() : undefined

    if (!name || !description) {
      logger.warn(`手动提取失败: name="${name}", description="${description}"`)
    }

    return {
      name,
      description,
      tools,
      model,
      color
    }
  }

  /**
   * 添加新Agent
   * @returns 成功时返回 agentId，失败时抛出错误
   */
  public async addAgent(formData: AgentFormData): Promise<string> {
    await this.initializeAgentsDir()

    // 生成文件名（使用name的slug形式）
    const fileName = this.slugify(formData.name) + '.md'
    const filePath = path.join(this.agentsDir, fileName)

    // 检查文件是否已存在
    try {
      await fs.access(filePath)
      throw new Error(`Agent "${formData.name}" 已存在`)
    } catch {
      // 文件不存在，可以继续
    }

    // 构建文件内容（frontmatter + 正文）
    const content = this.buildAgentContent(formData)

    // 写入文件
    await fs.writeFile(filePath, content, 'utf-8')

    logger.info(`成功创建Agent: ${fileName}`)
    return fileName.replace(/\.md$/, '')
  }

  /**
   * 删除Agent
   * @throws Agent不存在或删除失败时抛出错误
   */
  public async deleteAgent(agentId: string): Promise<void> {
    const filePath = path.join(this.agentsDir, `${agentId}.md`)

    // 检查文件是否存在
    try {
      await fs.access(filePath)
    } catch {
      throw new Error(`Agent "${agentId}" 不存在`)
    }

    // 删除文件
    await fs.unlink(filePath)

    logger.info(`成功删除Agent: ${agentId}`)
  }

  /**
   * 导入Agent文件
   * @returns 成功时返回 agentId，失败时抛出错误
   */
  public async importAgent(
    sourceFilePath: string,
    options: AgentImportOptions = {}
  ): Promise<string> {
    // 验证文件存在
    try {
      await fs.access(sourceFilePath)
    } catch {
      throw new Error(`源文件不存在: ${sourceFilePath}`)
    }

    // 读取并验证文件格式
    const content = await fs.readFile(sourceFilePath, 'utf-8')
    const metadata = this.parseFrontmatter(content)

    if (!metadata.name) {
      throw new Error('Agent文件缺少必填的name字段')
    }

    if (!metadata.description) {
      throw new Error('Agent文件缺少必填的description字段')
    }

    // 生成目标文件名
    const fileName = this.slugify(metadata.name) + '.md'
    const targetPath = path.join(this.agentsDir, fileName)

    // 检查目标文件是否已存在
    try {
      await fs.access(targetPath)
      if (!options.overwrite) {
        throw new Error(`Agent "${metadata.name}" 已存在，请选择覆盖或重命名`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在')) {
        throw error
      }
      // 文件不存在，可以继续
    }

    // 复制文件
    await fs.copyFile(sourceFilePath, targetPath)

    logger.info(`成功导入Agent: ${fileName}`)
    return fileName.replace(/\.md$/, '')
  }

  /**
   * 导入Agent内容
   * @returns 成功时返回 agentId，失败时抛出错误
   */
  public async importAgentContent(
    content: string,
    options: AgentImportOptions = {}
  ): Promise<string> {
    await this.initializeAgentsDir()

    const metadata = this.parseFrontmatter(content)

    if (!metadata.name) {
      throw new Error('Agent文件缺少必填的name字段')
    }

    if (!metadata.description) {
      throw new Error('Agent文件缺少必填的description字段')
    }

    const fileName = this.slugify(metadata.name) + '.md'
    const targetPath = path.join(this.agentsDir, fileName)

    try {
      await fs.access(targetPath)
      if (!options.overwrite) {
        throw new Error(`Agent "${metadata.name}" 已存在，请选择覆盖或重命名`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在')) {
        throw error
      }
    }

    await fs.writeFile(targetPath, content, 'utf-8')

    logger.info(`成功导入Agent内容: ${fileName}`)
    return fileName.replace(/\.md$/, '')
  }

  /**
   * 批量导入Agent文件
   * @returns 返回导入结果（成功列表和错误列表）
   */
  public async batchImportAgents(
    sourceFilePaths: string[],
    options: AgentImportOptions = {}
  ): Promise<{ imported: string[]; errors: Array<{ path: string; error: string }> }> {
    const imported: string[] = []
    const errors: Array<{ path: string; error: string }> = []

    for (const sourcePath of sourceFilePaths) {
      try {
        const agentId = await this.importAgent(sourcePath, options)
        imported.push(agentId)
      } catch (error) {
        errors.push({
          path: sourcePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info(`批量导入Agent完成: 成功 ${imported.length} 个, 失败 ${errors.length} 个`)
    return {
      imported,
      errors
    }
  }

  /**
   * 批量导入Agent内容
   */
  public async batchImportAgentsContent(
    contents: Array<{ name?: string; content: string }>,
    options: AgentImportOptions = {}
  ): Promise<{ imported: string[]; errors: Array<{ path: string; error: string }> }> {
    const imported: string[] = []
    const errors: Array<{ path: string; error: string }> = []

    for (const item of contents) {
      try {
        const agentId = await this.importAgentContent(item.content, options)
        imported.push(agentId)
      } catch (error) {
        errors.push({
          path: item.name || 'unknown',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info(`批量导入Agent内容完成: 成功 ${imported.length} 个, 失败 ${errors.length} 个`)
    return {
      imported,
      errors
    }
  }

  /**
   * 构建Agent文件内容（frontmatter + 正文）
   */
  private buildAgentContent(formData: AgentFormData): string {
    // 使用自定义格式生成YAML
    let yamlContent = '---\n'
    yamlContent += `name: ${formData.name}\n`
    yamlContent += `description: ${formData.description}\n`

    // tools用逗号分隔字符串
    if (formData.tools && formData.tools.length > 0) {
      yamlContent += `tools: ${formData.tools.join(', ')}\n`
    }

    // model
    if (formData.model && formData.model.trim()) {
      yamlContent += `model: ${formData.model.trim()}\n`
    }

    // color（确保是有效的hex颜色格式）
    if (formData.color && formData.color.trim()) {
      let color = formData.color.trim()
      // 如果没有#前缀且是6位hex，添加#
      if (!color.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(color)) {
        color = '#' + color
      }
      yamlContent += `color: ${color}\n`
    }

    yamlContent += '---\n'
    yamlContent += `\n${formData.content}`

    return yamlContent
  }

  /**
   * 将字符串转换为URL安全的slug
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // 空格替换为连字符
      .replace(/[^\w\-]+/g, '') // 移除非单词字符
      .replace(/\-\-+/g, '-') // 移除多个连字符
      .replace(/^-+/, '') // 移除前导连字符
      .replace(/-+$/, '') // 移除尾部连字符
  }
}

// 导出单例
export const agentsManagementService = new AgentsManagementService()
