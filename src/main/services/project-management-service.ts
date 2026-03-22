/**
 * Claude Code项目管理服务
 *
 * 功能:
 * - 扫描和管理Claude Code项目
 * - 解析会话历史(JSONL格式)
 * - 提供会话继续功能
 * - 流式读取避免文件锁定
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { logger } from '../utils/logger'
import { spawn } from 'child_process'
import { readJsonlFile, getJsonlStats, readFirstJsonlLine } from '../utils/jsonl-reader'
import { terminalManagementService } from './terminal-management-service'
import type { TerminalConfig, TerminalType } from '@shared/types/terminal'

/**
 * Claude Code项目信息
 */
export interface ClaudeProject {
  id: string              // 项目唯一标识
  name: string            // 项目名称
  path: string            // 项目路径
  sessionCount: number    // 会话数量
  totalMessages: number   // 总消息数
  totalTokens: number     // 总Token数
  lastUsed: string | null // 最后使用时间
  firstUsed: string | null // 首次使用时间
}

/**
 * 会话信息
 */
export interface ProjectSession {
  sessionId: string       // 会话ID
  projectId: string       // 所属项目ID
  projectPath: string     // 项目路径
  startTime: string       // 开始时间
  endTime: string         // 结束时间
  messageCount: number    // 消息数量
  totalTokens: number     // Token消耗
  model: string | null    // 使用的模型
  summary: string | null  // 会话摘要
  jsonlFile: string       // JSONL文件路径
}

/**
 * 消息类型
 */
export interface ConversationMessage {
  uuid: string
  parentUuid?: string
  type: 'user' | 'assistant' | 'system' | 'summary' | 'file-history-snapshot'
  timestamp: string
  content?: any
  role?: string
  model?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  costUSD?: number
  durationMs?: number
}

/**
 * 会话对话内容
 */
export interface SessionConversation {
  sessionId: string
  messages: ConversationMessage[]
  totalMessages: number
  totalTokens: number
}

/**
 * 终端启动规格
 * @description 描述一次受控终端启动所需的可执行文件、参数与工作目录
 */
interface TerminalLaunchSpec {
  filePath: string
  args: string[]
  workingDirectory?: string
  windowsHide?: boolean
}

/**
 * 项目管理服务类
 */
class ProjectManagementService {
  private claudeProjectsDir: string
  private scanConcurrency: number = 4

  constructor() {
    this.claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
    logger.info(`Claude Code项目目录: ${this.claudeProjectsDir}`)
  }

  /**
   * 扫描所有Claude Code项目
   */
  public async scanProjects(): Promise<ClaudeProject[]> {
    try {
      logger.info('开始扫描Claude Code项目...')

      // 检查项目目录是否存在
      if (!fs.existsSync(this.claudeProjectsDir)) {
        logger.warn(`项目目录不存在: ${this.claudeProjectsDir}`)
        return []
      }

      // 读取所有项目目录
      const entries = await fs.promises.readdir(this.claudeProjectsDir, { withFileTypes: true })
      const projectDirs = entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(this.claudeProjectsDir, entry.name))

      logger.info(`发现 ${projectDirs.length} 个项目目录`)

      // 解析每个项目
      const projects: ClaudeProject[] = []
      await this.processWithConcurrency(projectDirs, async (projectDir) => {
        try {
          const project = await this.parseProject(projectDir)
          if (project) {
            projects.push(project)
          }
        } catch (error) {
          logger.warn(`解析项目失败: ${projectDir}`, error)
        }
      })

      // 按最后使用时间排序
      projects.sort((a, b) => {
        if (!a.lastUsed) return 1
        if (!b.lastUsed) return -1
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      })

      logger.info(`成功解析 ${projects.length} 个项目`)
      return projects
    } catch (error) {
      logger.error('扫描项目失败:', error)
      return []
    }
  }

  /**
   * 解析单个项目
   */
  private async parseProject(projectDir: string): Promise<ClaudeProject | null> {
    try {
      const projectName = path.basename(projectDir)
      const projectId = projectName

      // 获取项目中的所有JSONL文件
      const jsonlFiles = await this.getJsonlFiles(projectDir)

      if (jsonlFiles.length === 0) {
        logger.debug(`项目 ${projectName} 没有会话文件`)
        return null
      }

      let totalMessages = 0
      let totalTokens = 0
      let firstUsed: string | null = null
      let lastUsed: string | null = null

      // 分析每个JSONL文件
      for (const jsonlFile of jsonlFiles) {
        const stats = await this.getFileBasicStats(jsonlFile)
        totalMessages += stats.messageCount
        totalTokens += stats.totalTokens

        if (!firstUsed || stats.firstTimestamp < firstUsed) {
          firstUsed = stats.firstTimestamp
        }
        if (!lastUsed || stats.lastTimestamp > lastUsed) {
          lastUsed = stats.lastTimestamp
        }
      }

      // 尝试获取实际项目路径
      const actualPath = await this.getProjectActualPath(projectDir)

      return {
        id: projectId,
        name: projectName,
        path: actualPath || projectName,
        sessionCount: jsonlFiles.length,
        totalMessages,
        totalTokens,
        lastUsed,
        firstUsed
      }
    } catch (error) {
      logger.error(`解析项目失败: ${projectDir}`, error)
      return null
    }
  }

  /**
   * 获取项目的所有JSONL文件
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
   * 获取文件基本统计信息(快速扫描)
   */
  private async getFileBasicStats(filePath: string): Promise<{
    messageCount: number
    totalTokens: number
    firstTimestamp: string
    lastTimestamp: string
  }> {
    interface Stats {
      messageCount: number
      totalTokens: number
      firstTimestamp: string | null
      lastTimestamp: string | null
    }

    const result = await this.withTemporaryCopy(filePath, (safePath) =>
      getJsonlStats<any, Stats>(
        safePath,
        (message, stats) => {
        stats.messageCount++

        if (message.timestamp) {
          if (!stats.firstTimestamp) {
            stats.firstTimestamp = message.timestamp
          }
          stats.lastTimestamp = message.timestamp
        }

        if (message.message?.usage) {
          const usage = message.message.usage
          stats.totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)
        }

          return stats
        },
        {
          messageCount: 0,
          totalTokens: 0,
          firstTimestamp: null,
          lastTimestamp: null
        }
      )
    )

    if (!result) {
      const now = new Date().toISOString()
      return {
        messageCount: 0,
        totalTokens: 0,
        firstTimestamp: now,
        lastTimestamp: now
      }
    }

    const now = new Date().toISOString()
    return {
      messageCount: result.messageCount,
      totalTokens: result.totalTokens,
      firstTimestamp: result.firstTimestamp || now,
      lastTimestamp: result.lastTimestamp || now
    }
  }

  /**
   * 获取项目的实际路径(从会话文件中读取cwd)
   */
  private async getProjectActualPath(projectDir: string): Promise<string | null> {
    try {
      const jsonlFiles = await this.getJsonlFiles(projectDir)
      if (jsonlFiles.length === 0) return null

      // 读取第一个文件的第一行获取cwd
      const firstLine = await this.withTemporaryCopy(jsonlFiles[0], (safePath) =>
        readFirstJsonlLine<any>(safePath)
      )
      return firstLine?.cwd || null
    } catch (error) {
      return null
    }
  }

  /**
   * 获取项目的所有会话列表
   */
  public async getProjectSessions(projectId: string): Promise<ProjectSession[]> {
    try {
      logger.info(`获取项目会话列表: ${projectId}`)

      const projectDir = path.join(this.claudeProjectsDir, projectId)
      if (!fs.existsSync(projectDir)) {
        logger.warn(`项目目录不存在: ${projectDir}`)
        return []
      }

      const jsonlFiles = await this.getJsonlFiles(projectDir)
      const sessions: ProjectSession[] = []

      await this.processWithConcurrency(jsonlFiles, async (jsonlFile) => {
        try {
          const session = await this.parseSession(projectId, jsonlFile)
          if (session) {
            sessions.push(session)
          }
        } catch (error) {
          logger.warn(`解析会话失败: ${jsonlFile}`, error)
        }
      })

      // 按开始时间倒序排序
      sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())

      logger.info(`项目 ${projectId} 有 ${sessions.length} 个会话`)
      return sessions
    } catch (error) {
      logger.error('获取项目会话失败:', error)
      return []
    }
  }

  /**
   * 解析单个会话
   */
  private async parseSession(projectId: string, jsonlFile: string): Promise<ProjectSession | null> {
    interface SessionInfo {
      sessionId: string | null
      projectPath: string | null
      startTime: string | null
      endTime: string | null
      messageCount: number
      totalTokens: number
      model: string | null
      summary: string | null
    }

    const result = await this.withTemporaryCopy(jsonlFile, (safePath) =>
      getJsonlStats<any, SessionInfo>(
        safePath,
        (message, info) => {
        info.messageCount++

        // 提取会话信息
        if (!info.sessionId && message.sessionId) {
          info.sessionId = message.sessionId
        }
        if (!info.projectPath && message.cwd) {
          info.projectPath = message.cwd
        }
        if (!info.startTime && message.timestamp) {
          info.startTime = message.timestamp
        }
        if (message.timestamp) {
          info.endTime = message.timestamp
        }
        if (!info.model && message.message?.model) {
          info.model = message.message.model
        }

        // 提取摘要
        if (message.type === 'summary' && message.message?.content) {
          info.summary = message.message.content
        }

        // 统计Token
        if (message.message?.usage) {
          const usage = message.message.usage
          info.totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)
        }

          return info
        },
        {
          sessionId: null,
          projectPath: null,
          startTime: null,
          endTime: null,
          messageCount: 0,
          totalTokens: 0,
          model: null,
          summary: null
        }
      )
    )

    if (!result) {
      return null
    }

    // 从文件名生成sessionId(如果没有找到)
    const sessionId = result.sessionId || path.basename(jsonlFile, '.jsonl')
    const now = new Date().toISOString()

    return {
      sessionId,
      projectId,
      projectPath: result.projectPath || projectId,
      startTime: result.startTime || now,
      endTime: result.endTime || now,
      messageCount: result.messageCount,
      totalTokens: result.totalTokens,
      model: result.model,
      summary: result.summary,
      jsonlFile
    }
  }

  /**
   * 获取会话的完整对话内容
   */
  public async getSessionConversation(
    projectId: string,
    sessionId: string,
    limit?: number
  ): Promise<SessionConversation | null> {
    try {
      logger.info(`加载会话对话: ${projectId}/${sessionId}`)

      const projectDir = path.join(this.claudeProjectsDir, projectId)
      const jsonlFiles = await this.getJsonlFiles(projectDir)

      // 找到对应的JSONL文件
      const sessionFile = jsonlFiles.find(file => {
        const fileName = path.basename(file, '.jsonl')
        return fileName === sessionId || file.includes(sessionId)
      })

      if (!sessionFile) {
        logger.warn(`找不到会话文件: ${sessionId}`)
        return null
      }

      return await this.parseConversation(sessionId, sessionFile, limit)
    } catch (error) {
      logger.error('加载会话对话失败:', error)
      return null
    }
  }

  /**
   * 解析会话对话内容
   */
  private async parseConversation(
    sessionId: string,
    jsonlFile: string,
    limit?: number
  ): Promise<SessionConversation | null> {
    const result = await this.withTemporaryCopy(jsonlFile, (safePath) =>
      readJsonlFile<any>(
        safePath,
        undefined,
        { limit, skipErrors: true }
      )
    )

    if (!result) {
      logger.error(`读取会话文件失败: ${jsonlFile}`)
      return {
        sessionId,
        messages: [],
        totalMessages: 0,
        totalTokens: 0
      }
    }

    if (!result.success) {
      logger.error(`读取会话文件失败: ${jsonlFile}`, result.error)
      return {
        sessionId,
        messages: [],
        totalMessages: 0,
        totalTokens: 0
      }
    }

    // 转换为ConversationMessage格式
    const messages: ConversationMessage[] = result.data.map((rawMessage, index) => ({
      uuid: rawMessage.uuid || `msg-${index + 1}`,
      parentUuid: rawMessage.parentUuid,
      type: rawMessage.type || 'system',
      timestamp: rawMessage.timestamp || new Date().toISOString(),
      content: rawMessage.message?.content,
      role: rawMessage.message?.role,
      model: rawMessage.message?.model,
      usage: rawMessage.message?.usage,
      costUSD: rawMessage.message?.costUSD,
      durationMs: rawMessage.message?.durationMs
    }))

    // 统计Token
    const totalTokens = messages.reduce((sum, msg) => {
      if (msg.usage) {
        return sum + (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)
      }
      return sum
    }, 0)

    logger.info(`加载了 ${messages.length} 条消息`)
    return {
      sessionId,
      messages,
      totalMessages: messages.length,
      totalTokens
    }
  }

  /**
   * 临时拷贝读取，避免占用主文件
   */
  private async withTemporaryCopy<T>(
    filePath: string,
    reader: (safePath: string) => Promise<T>
  ): Promise<T | null> {
    let tempPath: string | null = null
    try {
      const tempDir = path.join(os.tmpdir(), 'claude-codebutler', 'projects')
      await fs.promises.mkdir(tempDir, { recursive: true })
      tempPath = path.join(
        tempDir,
        `project-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`
      )
      await fs.promises.copyFile(filePath, tempPath)
      return await reader(tempPath)
    } catch (error) {
      logger.warn(`创建临时拷贝失败，跳过文件: ${filePath}`, error)
      return null
    } finally {
      if (tempPath) {
        try {
          await fs.promises.rm(tempPath, { force: true })
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * 并发处理
   */
  private async processWithConcurrency<T>(
    items: T[],
    handler: (item: T) => Promise<void>
  ): Promise<void> {
    const queue = [...items]
    const workers = Array.from({ length: this.scanConcurrency }).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) return
        await handler(item)
      }
    })

    await Promise.all(workers)
  }

  /**
   * 在终端中继续指定会话
   * @param projectId 项目ID
   * @param sessionId 会话ID
   * @param projectPath 项目路径(可选)
   * @param terminal 终端类型(gitbash/cmd/powershell,默认gitbash)
   * @param asAdmin 是否以管理员身份运行(默认false)
   */
  public async continueSession(
    projectId: string,
    sessionId: string,
    projectPath?: string,
    terminal?: string,
    asAdmin: boolean = false
  ): Promise<{ success: boolean; message: string; command?: string }> {
    try {
      const safeProjectId = this.ensureSafeSessionIdentifier(projectId, '项目ID')
      const safeSessionId = this.ensureSafeSessionIdentifier(sessionId, '会话ID')
      const resolvedTerminalType = this.normalizeTerminalType(terminal)
      const defaultTerminal = await terminalManagementService.getDefaultTerminalType()
      const terminalType = resolvedTerminalType || defaultTerminal
      const terminalConfig = terminalType !== 'auto'
        ? await terminalManagementService.getTerminalConfig(terminalType)
        : null

      logger.info(`尝试继续会话: ${safeProjectId}/${safeSessionId}, 终端: ${terminalType}, 管理员模式: ${asAdmin}`)

      // 检查claude命令是否可用
      const claudeAvailable = await this.checkClaudeAvailable()
      if (!claudeAvailable) {
        return {
          success: false,
          message: 'Claude Code CLI未安装或不可用'
        }
      }

      // 构建Claude命令
      const claudeCommand = `claude --resume ${safeSessionId}`
      const workingDirectory = this.resolveWorkingDirectory(projectPath)

      logger.info(`Claude命令: ${claudeCommand}`)

      // 根据平台和终端类型构建终端启动规格
      const platform = process.platform
      let launchSpec: TerminalLaunchSpec

      if (platform === 'win32') {
        // Windows平台
        launchSpec = await this.buildWindowsTerminalLaunchSpec(
          safeSessionId,
          terminalType,
          terminalConfig,
          workingDirectory,
          asAdmin
        )
      } else if (platform === 'darwin') {
        // macOS: 使用 osascript 打开新的 Terminal 窗口
        launchSpec = this.buildMacOSTerminalLaunchSpec(safeSessionId, workingDirectory)
      } else {
        // Linux: 使用 gnome-terminal 或 xterm
        launchSpec = await this.buildLinuxTerminalLaunchSpec(safeSessionId, workingDirectory)
      }

      logger.info(`终端启动: ${launchSpec.filePath} ${launchSpec.args.join(' ')}`)
      await this.launchTerminalProcess(launchSpec)

      return {
        success: true,
        message: `已在新${this.getTerminalDisplayName(terminalType)}窗口中打开会话${asAdmin ? '(管理员模式)' : ''}`,
        command: claudeCommand
      }
    } catch (error) {
      logger.error('继续会话失败:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : '未知错误'
      }
    }
  }

  /**
   * 构建 Windows 平台的终端启动规格
   */
  private async buildWindowsTerminalLaunchSpec(
    sessionId: string,
    terminalType: TerminalType,
    terminalConfig: TerminalConfig | null,
    workingDirectory: string | undefined,
    asAdmin: boolean
  ): Promise<TerminalLaunchSpec> {
    const claudeCommand = `claude --resume ${sessionId}`

    switch (terminalType) {
      case 'git-bash': {
        const gitBashPath = terminalConfig?.path
        if (!gitBashPath) {
          logger.warn('未配置Git Bash路径,回退到CMD')
          return await this.buildWindowsTerminalLaunchSpec(sessionId, 'cmd', null, workingDirectory, asAdmin)
        }
        const bashCommand = workingDirectory
          ? 'cd -- "$1" && exec claude --resume "$2"'
          : 'exec claude --resume "$1"'
        const bashArgs = ['-lc', bashCommand, 'bash']

        if (workingDirectory) {
          bashArgs.push(this.toGitBashPath(workingDirectory))
        }

        bashArgs.push(sessionId)

        return asAdmin
          ? this.buildElevatedWindowsLaunchSpec(gitBashPath, bashArgs, workingDirectory)
          : {
              filePath: gitBashPath,
              args: bashArgs,
              workingDirectory
            }
      }

      case 'powershell': {
        const powerShellArgs = ['-NoExit', '-Command', `& claude --resume --% ${sessionId}`]
        return asAdmin
          ? this.buildElevatedWindowsLaunchSpec('powershell.exe', powerShellArgs, workingDirectory)
          : {
              filePath: 'powershell.exe',
              args: powerShellArgs,
              workingDirectory
            }
      }

      case 'wsl': {
        const wslArgs = [...(terminalConfig?.args || [])]
        if (workingDirectory) {
          wslArgs.push('--cd', workingDirectory)
        }
        wslArgs.push('--', 'bash', '-lc', 'exec claude --resume "$1"', 'bash', sessionId)

        return asAdmin
          ? this.buildElevatedWindowsLaunchSpec('wsl.exe', wslArgs, workingDirectory)
          : {
              filePath: 'wsl.exe',
              args: wslArgs,
              workingDirectory
            }
      }

      case 'cmd':
      default: {
        if (terminalConfig?.path && terminalType !== 'cmd' && terminalType !== 'auto') {
          const args = [...(terminalConfig.args || []), claudeCommand]
          return asAdmin
            ? this.buildElevatedWindowsLaunchSpec(terminalConfig.path, args, workingDirectory)
            : {
                filePath: terminalConfig.path,
                args,
                workingDirectory
              }
        }

        const cmdArgs = ['/K', claudeCommand]
        return asAdmin
          ? this.buildElevatedWindowsLaunchSpec('cmd.exe', cmdArgs, workingDirectory)
          : {
              filePath: 'cmd.exe',
              args: cmdArgs,
              workingDirectory
            }
      }
    }
  }

  /**
   * 获取终端类型的显示名称
   */
  private getTerminalDisplayName(terminal: TerminalType): string {
    switch (terminal) {
      case 'git-bash':
        return 'Git Bash'
      case 'powershell':
        return 'PowerShell'
      case 'cmd':
        return 'CMD'
      case 'wsl':
        return 'WSL'
      case 'auto':
        return '系统默认终端'
      default:
        return terminal
    }
  }

  private normalizeTerminalType(terminal?: string): TerminalType | null {
    if (!terminal) return null
    if (terminal === 'gitbash') return 'git-bash'
    return terminal as TerminalType
  }

  /**
   * 构建 macOS 终端启动规格
   * @description 使用 AppleScript 打开新的 Terminal 窗口并在其中继续会话
   */
  private buildMacOSTerminalLaunchSpec(sessionId: string, workingDirectory?: string): TerminalLaunchSpec {
    const shellCommand = workingDirectory
      ? `cd ${this.quoteForPosixShell(workingDirectory)}; claude --resume ${this.quoteForPosixShell(sessionId)}`
      : `claude --resume ${this.quoteForPosixShell(sessionId)}`
    const escapedCommand = shellCommand
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')

    return {
      filePath: 'osascript',
      args: ['-e', `tell application "Terminal" to do script "${escapedCommand}"`]
    }
  }

  /**
   * 构建 Linux 终端启动规格
   * @description 优先使用 gnome-terminal，不可用时回退到 xterm
   */
  private async buildLinuxTerminalLaunchSpec(sessionId: string, workingDirectory?: string): Promise<TerminalLaunchSpec> {
    const shellCommand = workingDirectory
      ? 'cd -- "$1" && exec claude --resume "$2"; exec bash'
      : 'exec claude --resume "$1"; exec bash'
    const shellArgs = ['-lc', shellCommand, 'bash']

    if (workingDirectory) {
      shellArgs.push(workingDirectory)
    }

    shellArgs.push(sessionId)

    if (await this.commandExists('gnome-terminal')) {
      return {
        filePath: 'gnome-terminal',
        args: ['--', 'bash', ...shellArgs]
      }
    }

    if (await this.commandExists('xterm')) {
      return {
        filePath: 'xterm',
        args: ['-hold', '-e', 'bash', ...shellArgs]
      }
    }

    throw new Error('未找到可用的 Linux 图形终端(gnome-terminal/xterm)')
  }

  private toGitBashPath(inputPath: string): string {
    const normalized = inputPath.replace(/\\/g, '/')
    if (/^[A-Za-z]:\//.test(normalized)) {
      const driveLetter = normalized[0].toLowerCase()
      const rest = normalized.slice(2)
      return `/${driveLetter}${rest}`
    }
    if (normalized.startsWith('//')) {
      return normalized
    }
    return normalized
  }

  /**
   * 检查Claude CLI是否可用
   */
  private async checkClaudeAvailable(): Promise<boolean> {
    try {
      return await this.commandExists('claude')
    } catch (error) {
      return false
    }
  }

  /**
   * 校验继续会话使用的标识符
   * @description 限制为安全字符集，避免异常参数进入终端命令上下文
   */
  private ensureSafeSessionIdentifier(identifier: string, label: string): string {
    const normalizedIdentifier = identifier.trim()

    if (!normalizedIdentifier) {
      throw new Error(`${label}不能为空`)
    }

    if (normalizedIdentifier.length > 128) {
      throw new Error(`${label}长度不能超过 128 个字符`)
    }

    if (!/^[A-Za-z0-9._:-]+$/.test(normalizedIdentifier)) {
      throw new Error(`${label}包含不允许的字符`)
    }

    return normalizedIdentifier
  }

  /**
   * 解析可用工作目录
   * @description 仅在目录存在且为文件夹时返回，避免将无效路径注入终端启动流程
   */
  private resolveWorkingDirectory(projectPath?: string): string | undefined {
    if (!projectPath) {
      return undefined
    }

    const resolvedPath = path.resolve(projectPath)
    if (!fs.existsSync(resolvedPath)) {
      return undefined
    }

    const stat = fs.statSync(resolvedPath)
    return stat.isDirectory() ? resolvedPath : undefined
  }

  /**
   * 启动新的终端进程
   * @description 统一使用 detached + ignore 模式，避免继续会话窗口被主进程生命周期绑定
   */
  private async launchTerminalProcess(spec: TerminalLaunchSpec): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(spec.filePath, spec.args, {
        cwd: spec.workingDirectory,
        detached: true,
        stdio: 'ignore',
        windowsHide: spec.windowsHide ?? false
      })

      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve()
      })
    })
  }

  /**
   * 生成 Windows 提权启动规格
   * @description 使用 PowerShell Start-Process + 参数数组，避免字符串拼接注入
   */
  private buildElevatedWindowsLaunchSpec(
    filePath: string,
    args: string[],
    workingDirectory?: string
  ): TerminalLaunchSpec {
    const powerShellArgs = [
      '-NoProfile',
      '-Command',
      this.buildPowerShellStartProcessScript(filePath, args, workingDirectory, true)
    ]

    return {
      filePath: 'powershell.exe',
      args: powerShellArgs,
      windowsHide: true
    }
  }

  /**
   * 构造 PowerShell Start-Process 脚本文本
   * @description 使用单引号字面量和数组参数，减少 Windows 提权路径中的注入面
   */
  private buildPowerShellStartProcessScript(
    filePath: string,
    args: string[],
    workingDirectory?: string,
    runAsAdmin: boolean = false
  ): string {
    const argumentListLiteral = args.length > 0
      ? `@(${args.map((arg) => `'${this.escapePowerShellLiteral(arg)}'`).join(', ')})`
      : '@()'
    const workingDirectoryClause = workingDirectory
      ? ` -WorkingDirectory '${this.escapePowerShellLiteral(workingDirectory)}'`
      : ''
    const verbClause = runAsAdmin ? ' -Verb RunAs' : ''

    return `Start-Process -FilePath '${this.escapePowerShellLiteral(filePath)}' -ArgumentList ${argumentListLiteral}${workingDirectoryClause}${verbClause}`
  }

  /**
   * 对 PowerShell 单引号字面量进行转义
   */
  private escapePowerShellLiteral(value: string): string {
    return value.replace(/'/g, "''")
  }

  /**
   * 对 POSIX shell 参数进行单引号包裹
   */
  private quoteForPosixShell(value: string): string {
    return `'${value.replace(/'/g, `'"'"'`)}'`
  }

  /**
   * 判断命令是否存在于当前系统 PATH 中
   * @description 使用 where/which 做显式探测，避免为可执行性检测重新引入 shell 拼接
   */
  private async commandExists(command: string): Promise<boolean> {
    const locator = process.platform === 'win32' ? 'where' : 'which'

    return await new Promise<boolean>((resolve) => {
      const child = spawn(locator, [command], {
        windowsHide: true,
        stdio: 'ignore'
      })

      child.once('error', () => resolve(false))
      child.once('exit', (code) => resolve(code === 0))
    })
  }

  /**
   * 获取项目统计摘要
   */
  public async getProjectSummary(projectId: string): Promise<{
    sessionCount: number
    totalMessages: number
    totalTokens: number
    models: Record<string, number>
    timeRange: { start: string | null; end: string | null }
  }> {
    try {
      const sessions = await this.getProjectSessions(projectId)

      let totalMessages = 0
      let totalTokens = 0
      const models: Record<string, number> = {}
      let start: string | null = null
      let end: string | null = null

      for (const session of sessions) {
        totalMessages += session.messageCount
        totalTokens += session.totalTokens

        if (session.model) {
          models[session.model] = (models[session.model] || 0) + 1
        }

        if (!start || session.startTime < start) {
          start = session.startTime
        }
        if (!end || session.endTime > end) {
          end = session.endTime
        }
      }

      return {
        sessionCount: sessions.length,
        totalMessages,
        totalTokens,
        models,
        timeRange: { start, end }
      }
    } catch (error) {
      logger.error('获取项目摘要失败:', error)
      return {
        sessionCount: 0,
        totalMessages: 0,
        totalTokens: 0,
        models: {},
        timeRange: { start: null, end: null }
      }
    }
  }
}

// 导出单例
export const projectManagementService = new ProjectManagementService()
