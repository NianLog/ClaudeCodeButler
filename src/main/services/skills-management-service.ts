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
import { load } from 'js-yaml'
import { logger } from '../utils/logger'
import type {
  SkillDirectory,
  SkillMetadata,
  SkillFormData,
  SkillImportOptions,
  SkillFileStructure
} from '@shared/types/skills'
import { ensureSafePathSegment, resolveSafeChildPath, sanitizeFileName, normalizePathForComparison } from '../utils/path-security'

const MAX_IMPORT_FILES = 2000
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
const MAX_IMPORT_TOTAL_BYTES = 50 * 1024 * 1024

/**
 * Skills管理服务类
 */
class SkillsManagementService {
  private skillsDir: string
  private importQueue: Promise<unknown> = Promise.resolve()

  constructor() {
    this.skillsDir = path.join(os.homedir(), '.claude', 'skills')
    void this.initializeSkillsDir().catch(error => logger.error('初始化 Skill 目录失败', error))
  }

  /**
   * 根据 Skill ID 解析目录路径
   * @param skillId Skill 标识
   * @returns Skill 目录绝对路径
   */
  private resolveSkillDirectoryPath(skillId: string): string {
    const safeSkillId = ensureSafePathSegment(skillId, 'Skill ID')
    return path.join(this.skillsDir, safeSkillId)
  }

  /**
   * 初始化skills目录
   */
  private async initializeSkillsDir(): Promise<void> {
    for (const directory of [path.dirname(this.skillsDir), this.skillsDir]) {
      try {
        const stats = await fs.lstat(directory)
        if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Skill 根目录不能是链接或普通文件')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await fs.mkdir(directory, { recursive: true })
      }
    }
    const expected = path.join(await fs.realpath(os.homedir()), '.claude', 'skills')
    if (normalizePathForComparison(await fs.realpath(this.skillsDir)) !== normalizePathForComparison(expected)) {
      throw new Error('Skill 根目录超出当前用户允许的路径')
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
      const dirPath = this.resolveSkillDirectoryPath(skillId)
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
        logger.debug('未找到YAML frontmatter，返回默认元数据')
        return {
          name: '',
          description: ''
        }
      }

      const yamlContent = match[1]
      const metadata = load(yamlContent) as SkillMetadata

      return {
        name: typeof metadata?.name === 'string' ? metadata.name.trim() : '',
        description: typeof metadata?.description === 'string' ? metadata.description.trim() : ''
      }
    } catch (error) {
      // YAML 解析失败是预期行为（部分 Skill frontmatter 含特殊字符），
      // 降级为 debug 避免扫描时刷 ERROR/WARNING 噪音
      logger.debug('解析YAML frontmatter失败，返回默认元数据:', error)
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
    // 注意：独立捕获 fs.access 的 ENOENT，避免与“已存在”判断共用 catch 导致同名 Skill 被静默覆盖。
    let skillExists = true
    try {
      await fs.access(dirPath)
    } catch {
      skillExists = false
    }
    if (skillExists) {
      throw new Error(`Skill "${formData.name}" 已存在`)
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
    const dirPath = this.resolveSkillDirectoryPath(skillId)

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
    if (typeof sourceDirPath !== 'string' || !path.isAbsolute(sourceDirPath) || /^[\\/]{2}/.test(sourceDirPath)) {
      throw new Error('Skill 源目录必须是本地绝对路径，不支持 UNC')
    }
    const stats = await fs.lstat(sourceDirPath)
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Skill 源目录不能是链接或普通文件')
    const sourceSkillMdPath = path.join(sourceDirPath, 'SKILL.md')
    const skillStats = await fs.lstat(sourceSkillMdPath)
    if (!skillStats.isFile() || skillStats.isSymbolicLink() || skillStats.size > MAX_IMPORT_FILE_BYTES) {
      throw new Error('SKILL.md 必须是 10 MiB 以内的普通文件')
    }
    const skillMdContent = await fs.readFile(sourceSkillMdPath, 'utf-8')
    const metadata = this.parseSkillFrontmatter(skillMdContent)
    if (!metadata.name || !metadata.description) throw new Error('SKILL.md缺少必填的name或description字段')
    return this.commitSkillImport(this.slugify(metadata.name), options, async staged => {
      await this.copyDirectoryRecursive(sourceDirPath, staged, { files: 0, bytes: 0 })
    })
  }

  /**
   * 导入Skill文件列表
   */
  public async importSkillFiles(
    payload: { rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> },
    options: SkillImportOptions = {}
  ): Promise<string> {
    if (!payload || !Array.isArray(payload.files) || !payload.files.length || payload.files.length > MAX_IMPORT_FILES) {
      throw new Error('Skill 导入需要 1～2000 个文件')
    }
    const budget = { files: 0, bytes: 0 }
    const names = new Set<string>()
    const files = payload.files.map(file => {
      const relativePath = this.validateImportPath(file.relativePath)
      const key = relativePath.replace(/\\/g, '/').toLowerCase()
      if (names.has(key)) throw new Error('Skill 导入包含重复文件路径')
      names.add(key)
      if (typeof file.contentBase64 !== 'string' || file.contentBase64.length > Math.ceil(MAX_IMPORT_FILE_BYTES / 3) * 4) {
        throw new Error('Skill 文件不能超过 10 MiB')
      }
      const content = Buffer.from(file.contentBase64, 'base64')
      if (content.toString('base64') !== file.contentBase64) throw new Error('Skill 文件的 Base64 编码无效')
      this.checkImportBudget(budget, content.length)
      return { relativePath, content }
    })
    return this.commitSkillImport(payload.rootDirName, options, async staged => {
      for (const file of files) {
        const target = resolveSafeChildPath(staged, file.relativePath, 'Skill文件路径')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, file.content, { flag: 'wx' })
      }
    })
  }

  private validateImportPath(relativePath: string): string {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
      throw new Error('Skill 文件路径必须是相对路径')
    }
    const segments = relativePath.split(/[\\/]/)
    if (segments.length > 32 || segments.some(segment => !segment || segment === '.' || segment === '..' ||
      sanitizeFileName(segment, '') !== segment || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment))) {
      throw new Error('Skill 文件路径包含无效目录段')
    }
    return segments.join(path.sep)
  }

  private checkImportBudget(budget: { files: number; bytes: number }, size: number): void {
    budget.files++
    budget.bytes += size
    if (size > MAX_IMPORT_FILE_BYTES || budget.files > MAX_IMPORT_FILES || budget.bytes > MAX_IMPORT_TOTAL_BYTES) {
      throw new Error('Skill 导入限 2000 个文件、单文件 10 MiB、总计 50 MiB')
    }
  }

  // 同进程的两种导入入口共享提交队列；外部 CLI 修改不在此锁内。
  private commitSkillImport(dirName: string, options: SkillImportOptions, populate: (staged: string) => Promise<void>): Promise<string> {
    const operation = this.importQueue.catch(() => undefined).then(async () => {
      const safeName = ensureSafePathSegment(dirName, 'Skill目录名')
      if (this.validateImportPath(safeName) !== safeName || safeName.toLowerCase().startsWith('.ccb-import-')) throw new Error('Skill 目录名无效')
      await this.initializeSkillsDir()
      const target = this.resolveSkillDirectoryPath(safeName)
      let exists = false
      try {
        const stats = await fs.lstat(target)
        if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Skill 目标必须是普通目录，不能是链接')
        exists = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      if (exists && !options.overwrite) throw new Error(`Skill "${safeName}" 已存在，请选择覆盖或重命名`)
      const transaction = await fs.mkdtemp(path.join(this.skillsDir, '.ccb-import-'))
      const staged = path.join(transaction, 'staged')
      const backup = path.join(transaction, 'original')
      let hasBackup = false
      try {
        await fs.mkdir(staged)
        await populate(staged)
        const content = new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(path.join(staged, 'SKILL.md')))
        const metadata = this.parseSkillFrontmatter(content)
        if (!metadata.name || !metadata.description) throw new Error('SKILL.md缺少必填的name或description字段')
        await this.initializeSkillsDir()
        if (exists) {
          const stats = await fs.lstat(target)
          if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Skill 目标在导入期间发生变化')
          await fs.rename(target, backup)
          hasBackup = true
        }
        try {
          await fs.rename(staged, target)
        } catch (error) {
          if (hasBackup) {
            try {
              await fs.rename(backup, target)
              hasBackup = false
            } catch {
              throw new Error(`Skill 替换和恢复均失败，原文件保留在 ${backup}`, { cause: error })
            }
          }
          throw error
        }
        hasBackup = false
        logger.info(`成功导入Skill: ${safeName}`)
        return safeName
      } finally {
        // 仅清理本次 mkdtemp 创建的目录；恢复失败时必须保留其中的原 Skill。
        if (!hasBackup) {
          await this.cleanupImportDirectory(transaction).catch(error => logger.warn(`Skill 临时目录清理失败: ${transaction}`, error))
        }
      }
    })
    this.importQueue = operation
    return operation
  }

  private async cleanupImportDirectory(transaction: string): Promise<void> {
    await this.initializeSkillsDir()
    if (path.dirname(transaction) !== this.skillsDir || !path.basename(transaction).startsWith('.ccb-import-')) {
      throw new Error('Skill 临时目录超出清理范围')
    }
    await fs.rm(transaction, { recursive: true, force: true })
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
  private async copyDirectoryRecursive(source: string, target: string, budget: { files: number; bytes: number }, depth = 0): Promise<void> {
    try {
      // 创建目标目录
      await fs.mkdir(target, { recursive: true })

      // 读取源目录
      const entries = await fs.readdir(source, { withFileTypes: true })
      if (depth > 32) throw new Error('Skill 导入目录不能超过 32 层')
      if (depth > 0) this.checkImportBudget(budget, 0)

      for (const entry of entries) {
        this.validateImportPath(entry.name)
        const sourcePath = path.join(source, entry.name)
        const targetPath = path.join(target, entry.name)

        if (entry.isDirectory()) {
          // 递归复制子目录
          await this.copyDirectoryRecursive(sourcePath, targetPath, budget, depth + 1)
        } else if (entry.isFile()) {
          const stats = await fs.lstat(sourcePath)
          if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Skill 源文件在导入期间发生变化')
          this.checkImportBudget(budget, stats.size)
          // 复制文件
          await fs.copyFile(sourcePath, targetPath)
        } else {
          throw new Error('Skill 导入不支持链接或特殊文件')
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
      .replace(/[^\w-]+/g, '') // 移除非单词字符
      .replace(/--+/g, '-') // 移除多个连字符
      .replace(/^-+/, '') // 移除前导连字符
      .replace(/-+$/, '') // 移除尾部连字符
  }
}

// 导出单例
export const skillsManagementService = new SkillsManagementService()
