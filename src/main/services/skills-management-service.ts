/**
 * Skills管理服务类
 *
 * 功能:
 * - 扫描 ~/.claude/skills/ 目录下的所有Skill目录
 * - 解析SKILL.md中的YAML frontmatter元数据
 * - 支持添加、删除、导入Skill
 * - 验证Skill目录格式
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'
import { logger } from '../utils/logger'
import type {
  SkillDirectory,
  SkillMetadata,
  SkillFormData,
  SkillImportOptions,
  SkillFileStructure
} from '@shared/types/skills'

/**
 * Skills管理服务类
 */
class SkillsManagementService {
  private skillsDir: string

  constructor() {
    this.skillsDir = path.join(os.homedir(), '.claude', 'skills')
    this.initializeSkillsDir()
  }

  /**
   * 初始化skills目录
   */
  private async initializeSkillsDir(): Promise<void> {
    try {
      await fs.access(this.skillsDir)
    } catch {
      logger.info(`创建skills目录: ${this.skillsDir}`)
      await fs.mkdir(this.skillsDir, { recursive: true })
    }
  }

  /**
   * 扫描所有Skill目录
   */
  public async scanSkills(): Promise<SkillDirectory[]> {
    try {
      await this.initializeSkillsDir()

      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true })
      const skillDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(this.skillsDir, entry.name))

      const skills: SkillDirectory[] = []
      for (const dirPath of skillDirs) {
        try {
          const skill = await this.parseSkillDirectory(dirPath)
          if (skill) {
            skills.push(skill)
          }
        } catch (error) {
          logger.warn(`解析Skill目录失败: ${dirPath}`, error)
        }
      }

      logger.info(`扫描到 ${skills.length} 个Skill目录`)
      return skills
    } catch (error) {
      logger.error('扫描Skill目录失败:', error)
      return []
    }
  }

  /**
   * 获取单个Skill
   */
  public async getSkill(skillId: string): Promise<SkillDirectory | null> {
    try {
      const dirPath = path.join(this.skillsDir, skillId)
      return await this.parseSkillDirectory(dirPath)
    } catch (error) {
      logger.error(`获取Skill失败: ${skillId}`, error)
      return null
    }
  }

  /**
   * 解析Skill目录
   */
  private async parseSkillDirectory(dirPath: string): Promise<SkillDirectory | null> {
    try {
      // 检查目录是否存在
      try {
        const stats = await fs.stat(dirPath)
        if (!stats.isDirectory()) {
          return null
        }
      } catch {
        return null
      }

      const skillMdPath = path.join(dirPath, 'SKILL.md')

      // 检查SKILL.md是否存在
      try {
        await fs.access(skillMdPath)
      } catch {
        logger.warn(`Skill目录缺少SKILL.md: ${dirPath}`)
        return null
      }

      // 读取SKILL.md内容
      const skillMdContent = await fs.readFile(skillMdPath, 'utf-8')
      const metadata = this.parseSkillFrontmatter(skillMdContent)

      if (!metadata.name || !metadata.description) {
        logger.warn(`SKILL.md缺少必填字段: ${skillMdPath}`)
        return null
      }

      // 获取目录结构
      const structure = await this.getSkillStructure(dirPath)

      // 获取目录统计信息
      const dirStats = await fs.stat(dirPath)
      const dirName = path.basename(dirPath)

      return {
        id: dirName,
        metadata,
        directoryPath: dirPath,
        directoryName: dirName,
        structure,
        skillMdContent,
        createdAt: dirStats.birthtime,
        updatedAt: dirStats.mtime
      }
    } catch (error) {
      logger.error(`解析Skill目录失败: ${dirPath}`, error)
      return null
    }
  }

  /**
   * 获取Skill目录的文件结构
   */
  private async getSkillStructure(dirPath: string): Promise<SkillFileStructure> {
    try {
      const skillMdPath = path.join(dirPath, 'SKILL.md')
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      const additionalFiles: string[] = []
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isFile()) {
          // 跳过SKILL.md，添加其他文件
          if (entry.name !== 'SKILL.md') {
            additionalFiles.push(fullPath)
          }
        } else if (entry.isDirectory()) {
          // 添加子目录中的文件
          const subFiles = await this.getFilesRecursively(fullPath)
          additionalFiles.push(...subFiles)
        }
      }

      return {
        skillMdPath,
        additionalFiles
      }
    } catch (error) {
      logger.error(`获取Skill文件结构失败: ${dirPath}`, error)
      return {
        skillMdPath: path.join(dirPath, 'SKILL.md'),
        additionalFiles: []
      }
    }
  }

  /**
   * 递归获取目录下所有文件
   */
  private async getFilesRecursively(dirPath: string): Promise<string[]> {
    const files: string[] = []

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isFile()) {
          files.push(fullPath)
        } else if (entry.isDirectory()) {
          const subFiles = await this.getFilesRecursively(fullPath)
          files.push(...subFiles)
        }
      }
    } catch (error) {
      logger.warn(`递归读取目录失败: ${dirPath}`, error)
    }

    return files
  }

  /**
   * 解析SKILL.md的frontmatter
   */
  private parseSkillFrontmatter(content: string): SkillMetadata {
    try {
      const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
      const match = content.match(frontmatterRegex)

      if (!match) {
        logger.warn('未找到YAML frontmatter，返回默认元数据')
        return {
          name: '',
          description: ''
        }
      }

      const yamlContent = match[1]
      const metadata = yaml.load(yamlContent) as SkillMetadata

      return {
        name: metadata.name || '',
        description: metadata.description || ''
      }
    } catch (error) {
      logger.error('解析YAML frontmatter失败:', error)
      return {
        name: '',
        description: ''
      }
    }
  }

  /**
   * 添加新Skill
   * @returns 成功时返回 skillId（目录名），失败时抛出错误
   */
  public async addSkill(formData: SkillFormData): Promise<string> {
    await this.initializeSkillsDir()

    // 生成目录名（使用name的slug形式）
    const dirName = this.slugify(formData.name)
    const dirPath = path.join(this.skillsDir, dirName)

    // 检查目录是否已存在
    try {
      await fs.access(dirPath)
      throw new Error(`Skill "${formData.name}" 已存在`)
    } catch {
      // 目录不存在，可以继续
    }

    // 创建目录
    await fs.mkdir(dirPath, { recursive: true })

    // 构建SKILL.md内容
    const content = this.buildSkillContent(formData)
    const skillMdPath = path.join(dirPath, 'SKILL.md')

    // 写入SKILL.md
    await fs.writeFile(skillMdPath, content, 'utf-8')

    logger.info(`成功创建Skill: ${dirName}`)
    return dirName
  }

  /**
   * 删除Skill
   * @throws Skill不存在或删除失败时抛出错误
   */
  public async deleteSkill(skillId: string): Promise<void> {
    const dirPath = path.join(this.skillsDir, skillId)

    // 检查目录是否存在
    try {
      await fs.access(dirPath)
    } catch {
      throw new Error(`Skill "${skillId}" 不存在`)
    }

    // 递归删除目录
    await fs.rm(dirPath, { recursive: true, force: true })

    logger.info(`成功删除Skill: ${skillId}`)
  }

  /**
   * 导入Skill目录
   * @returns 成功时返回 skillId（目录名），失败时抛出错误
   */
  public async importSkill(
    sourceDirPath: string,
    options: SkillImportOptions = {}
  ): Promise<string> {
    // 验证源目录存在
    try {
      const stats = await fs.stat(sourceDirPath)
      if (!stats.isDirectory()) {
        throw new Error(`源路径不是目录: ${sourceDirPath}`)
      }
    } catch {
      throw new Error(`源目录不存在: ${sourceDirPath}`)
    }

    // 检查SKILL.md是否存在
    const sourceSkillMdPath = path.join(sourceDirPath, 'SKILL.md')
    try {
      await fs.access(sourceSkillMdPath)
    } catch {
      throw new Error(`Skill目录必须包含SKILL.md文件`)
    }

    // 读取并验证SKILL.md
    const skillMdContent = await fs.readFile(sourceSkillMdPath, 'utf-8')
    const metadata = this.parseSkillFrontmatter(skillMdContent)

    if (!metadata.name) {
      throw new Error('SKILL.md缺少必填的name字段')
    }

    if (!metadata.description) {
      throw new Error('SKILL.md缺少必填的description字段')
    }

    // 生成目标目录名
    const dirName = this.slugify(metadata.name)
    const targetPath = path.join(this.skillsDir, dirName)

    // 检查目标目录是否已存在
    try {
      await fs.access(targetPath)
      if (!options.overwrite) {
        throw new Error(`Skill "${metadata.name}" 已存在，请选择覆盖或重命名`)
      }
      // 如果覆盖，先删除现有目录
      await fs.rm(targetPath, { recursive: true, force: true })
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在')) {
        throw error
      }
      // 目录不存在，可以继续
    }

    // 递归复制目录
    await this.copyDirectoryRecursive(sourceDirPath, targetPath)

    logger.info(`成功导入Skill: ${dirName}`)
    return dirName
  }

  /**
   * 导入Skill文件列表
   */
  public async importSkillFiles(
    payload: { rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> },
    options: SkillImportOptions = {}
  ): Promise<string> {
    await this.initializeSkillsDir()

    const rootDirName = payload.rootDirName
    if (!rootDirName) {
      throw new Error('Skill目录名不能为空')
    }

    const targetPath = path.join(this.skillsDir, rootDirName)

    try {
      await fs.access(targetPath)
      if (!options.overwrite) {
        throw new Error(`Skill "${rootDirName}" 已存在，请选择覆盖或重命名`)
      }
      await fs.rm(targetPath, { recursive: true, force: true })
    } catch (error) {
      if (error instanceof Error && error.message.includes('已存在')) {
        throw error
      }
    }

    await fs.mkdir(targetPath, { recursive: true })

    for (const file of payload.files) {
      const targetFilePath = path.join(targetPath, file.relativePath)
      await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
      const buffer = Buffer.from(file.contentBase64, 'base64')
      await fs.writeFile(targetFilePath, buffer)
    }

    const skillMdPath = path.join(targetPath, 'SKILL.md')
    try {
      await fs.access(skillMdPath)
    } catch {
      await fs.rm(targetPath, { recursive: true, force: true })
      throw new Error('Skill目录必须包含SKILL.md文件')
    }

    const skillMdContent = await fs.readFile(skillMdPath, 'utf-8')
    const metadata = this.parseSkillFrontmatter(skillMdContent)

    if (!metadata.name || !metadata.description) {
      await fs.rm(targetPath, { recursive: true, force: true })
      throw new Error('SKILL.md缺少必填的name或description字段')
    }

    logger.info(`成功导入Skill文件列表: ${rootDirName}`)
    return rootDirName
  }

  /**
   * 批量导入Skill目录
   * @returns 返回导入结果（成功列表和错误列表）
   */
  public async batchImportSkills(
    sourceDirPaths: string[],
    options: SkillImportOptions = {}
  ): Promise<{ imported: string[]; errors: Array<{ path: string; error: string }> }> {
    const imported: string[] = []
    const errors: Array<{ path: string; error: string }> = []

    for (const sourcePath of sourceDirPaths) {
      try {
        const skillId = await this.importSkill(sourcePath, options)
        imported.push(skillId)
      } catch (error) {
        errors.push({
          path: sourcePath,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info(`批量导入Skill完成: 成功 ${imported.length} 个, 失败 ${errors.length} 个`)
    return {
      imported,
      errors
    }
  }

  /**
   * 批量导入Skill文件列表
   */
  public async batchImportSkillsFiles(
    payloads: Array<{ rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> }>,
    options: SkillImportOptions = {}
  ): Promise<{ imported: string[]; errors: Array<{ path: string; error: string }> }> {
    const imported: string[] = []
    const errors: Array<{ path: string; error: string }> = []

    for (const payload of payloads) {
      try {
        const skillId = await this.importSkillFiles(payload, options)
        imported.push(skillId)
      } catch (error) {
        errors.push({
          path: payload.rootDirName,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    logger.info(`批量导入Skill文件列表完成: 成功 ${imported.length} 个, 失败 ${errors.length} 个`)
    return {
      imported,
      errors
    }
  }

  /**
   * 递归复制目录
   */
  private async copyDirectoryRecursive(source: string, target: string): Promise<void> {
    try {
      // 创建目标目录
      await fs.mkdir(target, { recursive: true })

      // 读取源目录
      const entries = await fs.readdir(source, { withFileTypes: true })

      for (const entry of entries) {
        const sourcePath = path.join(source, entry.name)
        const targetPath = path.join(target, entry.name)

        if (entry.isDirectory()) {
          // 递归复制子目录
          await this.copyDirectoryRecursive(sourcePath, targetPath)
        } else {
          // 复制文件
          await fs.copyFile(sourcePath, targetPath)
        }
      }
    } catch (error) {
      logger.error(`递归复制目录失败: ${source} -> ${target}`, error)
      throw error
    }
  }

  /**
   * 构建SKILL.md文件内容（frontmatter + 正文）
   * 使用字符串拼接确保 YAML 格式符合标准（无引号）
   */
  private buildSkillContent(formData: SkillFormData): string {
    // 使用自定义格式生成YAML，确保无引号
    let yamlContent = '---\n'
    yamlContent += `name: ${formData.name}\n`
    yamlContent += `description: ${formData.description}\n`
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
export const skillsManagementService = new SkillsManagementService()
