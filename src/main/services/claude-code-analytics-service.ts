/**
 * Claude Code使用分析服务
 *
 * 功能:
 * - 解析Claude Code的JSONL日志文件
 * - 统计模型使用情况
 * - 统计项目使用情况
 * - 统计Token消耗
 *
 * 安全策略:
 * - 只读模式访问文件
 * - 流式读取大文件
 * - 优雅处理文件锁定和并发访问
 * - 数据缓存减少文件访问
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as readline from 'readline'
import { Readable } from 'stream'
import { logger } from '../utils/logger'

/**
 * Claude Code会话记录类型
 */
interface ClaudeCodeMessage {
  type: 'assistant' | 'user' | 'summary' | 'file-history-snapshot' | 'system'
  message?: {
    id?: string
    model?: string
    usage?: {
      cache_creation?: {
        ephemeral_1h_input_tokens?: number
        ephemeral_5m_input_tokens?: number
      }
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
      input_tokens?: number
      output_tokens?: number
      service_tier?: string
    }
    role?: string
    content?: any[]
  }
  cwd?: string
  sessionId?: string
  timestamp?: string
  uuid?: string
  parentUuid?: string
}

/**
 * 模型使用统计
 */
interface ModelUsageStats {
  modelName: string
  usageCount: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreationTokens: number
  lastUsed: string
}

/**
 * 项目使用统计
 */
interface ProjectUsageStats {
  projectPath: string
  projectName: string
  sessionCount: number
  totalMessages: number
  totalTokens: number
  firstUsed: string
  lastUsed: string
  models: Map<string, number> // 模型名 -> 使用次数
}

/**
 * 会话统计
 */
interface SessionStats {
  sessionId: string
  projectPath: string
  startTime: string
  endTime: string
  messageCount: number
  totalTokens: number
  models: Set<string>
}

/**
 * Claude Code分析结果
 */
export interface ClaudeCodeAnalytics {
  // 模型统计
  modelStats: ModelUsageStats[]

  // 项目统计
  projectStats: ProjectUsageStats[]

  // 总体统计
  totalSessions: number
  totalMessages: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheTokens: number

  // 时间范围
  firstActivity: string | null
  lastActivity: string | null

  // 数据更新时间
  lastUpdated: string
}

/**
 * Claude Code分析服务
 */
class ClaudeCodeAnalyticsService {
  private claudeProjectsDir: string
  private cache: ClaudeCodeAnalytics | null = null
  private cacheExpiry: number = 5 * 60 * 1000 // 5分钟缓存
  private lastCacheTime: number = 0
  private analysisConcurrency: number = 4

  constructor() {
    // 获取Claude项目目录路径
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
    logger.info(`Claude Code项目目录: ${this.claudeProjectsDir}`)
  }

  /**
   * 获取Claude Code分析数据
   * 如果缓存有效则返回缓存,否则重新分析
   */
  public async getAnalytics(forceRefresh = false): Promise<ClaudeCodeAnalytics> {
    const now = Date.now()

    // 检查缓存是否有效
    if (!forceRefresh && this.cache && (now - this.lastCacheTime) < this.cacheExpiry) {
      logger.info('返回缓存的Claude Code分析数据')
      return this.cache
    }

    logger.info('开始分析Claude Code使用数据...')

    try {
      // 重新分析数据
      const analytics = await this.analyzeClaudeCodeData()

      // 更新缓存
      this.cache = analytics
      this.lastCacheTime = now

      logger.info('Claude Code分析完成')
      return analytics
    } catch (error) {
      logger.error('分析Claude Code数据失败:', error)

      // 如果有缓存,返回旧缓存
      if (this.cache) {
        logger.warn('返回旧缓存数据')
        return this.cache
      }

      // 返回空数据
      return this.getEmptyAnalytics()
    }
  }

  /**
   * 分析Claude Code数据
   */
  private async analyzeClaudeCodeData(): Promise<ClaudeCodeAnalytics> {
    // 检查项目目录是否存在
    if (!fs.existsSync(this.claudeProjectsDir)) {
      logger.warn(`Claude Code项目目录不存在: ${this.claudeProjectsDir}`)
      return this.getEmptyAnalytics()
    }

    // 获取所有项目目录
    const projectDirs = await this.getProjectDirectories()
    logger.info(`发现 ${projectDirs.length} 个Claude Code项目`)

    // 统计数据容器
    const modelStatsMap = new Map<string, ModelUsageStats>()
    const projectStatsMap = new Map<string, ProjectUsageStats>()
    const sessionStatsMap = new Map<string, SessionStats>()

    let totalMessages = 0
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheTokens = 0
    let firstActivity: string | null = null
    let lastActivity: string | null = null

    // 逐个项目分析
    for (const projectDir of projectDirs) {
      try {
        const jsonlFiles = await this.getJsonlFiles(projectDir)
        logger.info(`项目 ${path.basename(projectDir)} 有 ${jsonlFiles.length} 个JSONL文件`)

        await this.processFilesWithConcurrency(jsonlFiles, async (jsonlFile) => {
          try {
            await this.analyzeJsonlFile(
              jsonlFile,
              modelStatsMap,
              projectStatsMap,
              sessionStatsMap
            )
          } catch (error) {
            // 单个文件失败不影响整体分析
            logger.warn(`分析文件失败: ${jsonlFile}`, error)
          }
        })
      } catch (error) {
        logger.warn(`分析项目目录失败: ${projectDir}`, error)
      }
    }

    // 计算总体统计
    for (const modelStats of modelStatsMap.values()) {
      totalInputTokens += modelStats.totalInputTokens
      totalOutputTokens += modelStats.totalOutputTokens
      totalCacheTokens += modelStats.totalCacheReadTokens + modelStats.totalCacheCreationTokens
    }

    for (const projectStats of projectStatsMap.values()) {
      totalMessages += projectStats.totalMessages

      if (!firstActivity || projectStats.firstUsed < firstActivity) {
        firstActivity = projectStats.firstUsed
      }
      if (!lastActivity || projectStats.lastUsed > lastActivity) {
        lastActivity = projectStats.lastUsed
      }
    }

    // 转换项目统计中的Map为普通对象,并对模型按使用次数排序
    const projectStatsArray = Array.from(projectStatsMap.values()).map(stats => {
      // 提取sessions集合但保留sessionCount
      const { sessions, models, ...basicStats } = stats as any

      // 将Map转换为对象并按使用次数降序排序
      const sortedModels = Array.from(models.entries())
        .sort((a, b) => b[1] - a[1]) // 按使用次数降序
        .reduce((acc, [model, count]) => {
          acc[model] = count
          return acc
        }, {} as Record<string, number>)

      return {
        ...basicStats,
        sessionCount: sessions ? sessions.size : stats.sessionCount,
        models: sortedModels
      }
    })

    return {
      modelStats: Array.from(modelStatsMap.values()).sort((a, b) => b.usageCount - a.usageCount),
      projectStats: projectStatsArray.sort((a, b) =>
        new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      ),
      totalSessions: sessionStatsMap.size,
      totalMessages,
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens,
      firstActivity,
      lastActivity,
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * 获取所有项目目录
   */
  private async getProjectDirectories(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.claudeProjectsDir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(this.claudeProjectsDir, entry.name))
    } catch (error) {
      logger.error('读取项目目录失败:', error)
      return []
    }
  }

  /**
   * 获取项目目录下的所有JSONL文件
   */
  private async getJsonlFiles(projectDir: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(projectDir)
      return entries
        .filter(file => file.endsWith('.jsonl'))
        .map(file => path.join(projectDir, file))
    } catch (error) {
      logger.error(`读取JSONL文件失败: ${projectDir}`, error)
      return []
    }
  }

  /**
   * 分析单个JSONL文件
   * 使用流式读取,避免内存问题和文件锁定
   */
  private async analyzeJsonlFile(
    filePath: string,
    modelStatsMap: Map<string, ModelUsageStats>,
    projectStatsMap: Map<string, ProjectUsageStats>,
    sessionStatsMap: Map<string, SessionStats>
  ): Promise<void> {
    const safePath = await this.createTemporaryCopy(filePath)
    if (!safePath) {
      return
    }

    return new Promise((resolve, reject) => {
      let fileStream: fs.ReadStream | null = null

      try {
        // 创建只读文件流
        fileStream = fs.createReadStream(safePath, {
          encoding: 'utf8',
          flags: 'r', // 只读模式
          autoClose: true
        })

        // 创建逐行读取器
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        })

        let lineCount = 0

        // 逐行处理
        rl.on('line', (line) => {
          try {
            lineCount++
            const message: ClaudeCodeMessage = JSON.parse(line)

            // 只处理assistant类型的消息(包含使用统计)
            if (message.type === 'assistant' && message.message) {
              this.processAssistantMessage(
                message,
                modelStatsMap,
                projectStatsMap,
                sessionStatsMap
              )
            }
          } catch (error) {
            // 跳过无效的JSON行
            logger.debug(`跳过无效JSON行 (行${lineCount}): ${filePath}`)
          }
        })

        rl.on('close', () => {
          logger.debug(`完成分析文件: ${filePath} (${lineCount}行)`)
          resolve()
        })

        rl.on('error', (error) => {
          logger.error(`读取文件错误: ${filePath}`, error)
          reject(error)
        })

        // 处理文件流错误
        fileStream.on('error', (error: NodeJS.ErrnoException) => {
          // 优雅处理常见错误
          if (error.code === 'EBUSY') {
            logger.warn(`文件被占用,跳过: ${filePath}`)
            resolve() // 不算错误,继续处理其他文件
          } else if (error.code === 'ENOENT') {
            logger.warn(`文件不存在: ${filePath}`)
            resolve()
          } else {
            logger.error(`文件流错误: ${filePath}`, error)
            reject(error)
          }
        })

      } catch (error) {
        logger.error(`创建文件流失败: ${filePath}`, error)
        reject(error)
      }
    }).finally(async () => {
      await this.removeTemporaryCopy(safePath)
    })
  }

  /**
   * 创建临时拷贝，避免占用主文件
   */
  private async createTemporaryCopy(filePath: string): Promise<string | null> {
    try {
      const tempDir = path.join(os.tmpdir(), 'claude-codebutler', 'analytics')
      await fs.promises.mkdir(tempDir, { recursive: true })
      const tempPath = path.join(
        tempDir,
        `analytics-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
      )
      await fs.promises.copyFile(filePath, tempPath)
      return tempPath
    } catch (error) {
      logger.warn(`创建临时拷贝失败，跳过文件: ${filePath}`, error)
      return null
    }
  }

  /**
   * 清理临时拷贝
   */
  private async removeTemporaryCopy(tempPath: string | null): Promise<void> {
    if (!tempPath) return
    try {
      await fs.promises.rm(tempPath, { force: true })
    } catch {
      // ignore
    }
  }

  /**
   * 并发处理文件
   */
  private async processFilesWithConcurrency(
    files: string[],
    handler: (file: string) => Promise<void>
  ): Promise<void> {
    const queue = [...files]
    const workers = Array.from({ length: this.analysisConcurrency }).map(async () => {
      while (queue.length > 0) {
        const file = queue.shift()
        if (!file) return
        await handler(file)
      }
    })

    await Promise.all(workers)
  }

  /**
   * 处理assistant消息
   */
  private processAssistantMessage(
    message: ClaudeCodeMessage,
    modelStatsMap: Map<string, ModelUsageStats>,
    projectStatsMap: Map<string, ProjectUsageStats>,
    sessionStatsMap: Map<string, SessionStats>
  ): void {
    const model = message.message?.model
    const usage = message.message?.usage
    const cwd = message.cwd
    const sessionId = message.sessionId
    const timestamp = message.timestamp

    if (!model || !usage || !timestamp) {
      return
    }

    // 更新模型统计
    this.updateModelStats(modelStatsMap, model, usage, timestamp)

    // 更新项目统计
    if (cwd) {
      this.updateProjectStats(projectStatsMap, cwd, model, usage, timestamp, sessionId)
    }

    // 更新会话统计
    if (sessionId && cwd) {
      this.updateSessionStats(sessionStatsMap, sessionId, cwd, model, usage, timestamp)
    }
  }

  /**
   * 更新模型统计
   */
  private updateModelStats(
    modelStatsMap: Map<string, ModelUsageStats>,
    model: string,
    usage: any,
    timestamp: string
  ): void {
    let stats = modelStatsMap.get(model)

    if (!stats) {
      stats = {
        modelName: model,
        usageCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        lastUsed: timestamp
      }
      modelStatsMap.set(model, stats)
    }

    stats.usageCount++
    stats.totalInputTokens += usage.input_tokens || 0
    stats.totalOutputTokens += usage.output_tokens || 0
    stats.totalCacheReadTokens += usage.cache_read_input_tokens || 0
    stats.totalCacheCreationTokens += usage.cache_creation_input_tokens || 0

    if (timestamp > stats.lastUsed) {
      stats.lastUsed = timestamp
    }
  }

  /**
   * 更新项目统计
   */
  private updateProjectStats(
    projectStatsMap: Map<string, ProjectUsageStats>,
    cwd: string,
    model: string,
    usage: any,
    timestamp: string,
    sessionId?: string
  ): void {
    let stats = projectStatsMap.get(cwd)

    if (!stats) {
      stats = {
        projectPath: cwd,
        projectName: path.basename(cwd),
        sessionCount: 0,
        totalMessages: 0,
        totalTokens: 0,
        firstUsed: timestamp,
        lastUsed: timestamp,
        models: new Map(),
        sessions: new Set() // 添加会话集合以跟踪唯一会话
      }
      projectStatsMap.set(cwd, stats)
    }

    stats.totalMessages++
    stats.totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)

    // 跟踪唯一会话
    if (sessionId && !(stats as any).sessions.has(sessionId)) {
      (stats as any).sessions.add(sessionId)
      stats.sessionCount = (stats as any).sessions.size
    }

    if (timestamp < stats.firstUsed) {
      stats.firstUsed = timestamp
    }
    if (timestamp > stats.lastUsed) {
      stats.lastUsed = timestamp
    }

    // 更新模型使用次数
    const modelCount = stats.models.get(model) || 0
    stats.models.set(model, modelCount + 1)
  }

  /**
   * 更新会话统计
   */
  private updateSessionStats(
    sessionStatsMap: Map<string, SessionStats>,
    sessionId: string,
    cwd: string,
    model: string,
    usage: any,
    timestamp: string
  ): void {
    let stats = sessionStatsMap.get(sessionId)

    if (!stats) {
      stats = {
        sessionId,
        projectPath: cwd,
        startTime: timestamp,
        endTime: timestamp,
        messageCount: 0,
        totalTokens: 0,
        models: new Set()
      }
      sessionStatsMap.set(sessionId, stats)
    }

    stats.messageCount++
    stats.totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)
    stats.models.add(model)

    if (timestamp < stats.startTime) {
      stats.startTime = timestamp
    }
    if (timestamp > stats.endTime) {
      stats.endTime = timestamp
    }
  }

  /**
   * 获取空的分析结果
   */
  private getEmptyAnalytics(): ClaudeCodeAnalytics {
    return {
      modelStats: [],
      projectStats: [],
      totalSessions: 0,
      totalMessages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
      firstActivity: null,
      lastActivity: null,
      lastUpdated: new Date().toISOString()
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cache = null
    this.lastCacheTime = 0
    logger.info('Claude Code分析缓存已清除')
  }
}

// 导出单例
export const claudeCodeAnalyticsService = new ClaudeCodeAnalyticsService()
