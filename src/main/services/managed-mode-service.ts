/**
 * 托管模式管理服务
 * @description 负责管理代理服务的生命周期，包括启动、停止、配置管理等
 */

import { ChildProcess, spawn, utilityProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import axios from 'axios'
import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'
import type {
  ManagedModeConfig,
  ManagedModeStatus,
  ApiProvider,
  EnvCommand
} from '../shared/types/managed-mode'

/**
 * 托管模式管理服务类
 */
export class ManagedModeService extends EventEmitter {
  private proxyProcess: ChildProcess | null = null
  private configPath: string
  private config: ManagedModeConfig | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private isIntegrated: boolean = false // 标记是否使用集成模式
  private startTime: number | null = null // 记录服务启动时间

  // 智能健康检查相关状态
  private consecutiveSuccessCount: number = 0 // 连续成功检查次数
  private currentHealthCheckInterval: number = 10000 // 当前健康检查间隔（毫秒），默认10s
  private healthCheckLevel: number = 0 // 当前健康检查级别 (0-5)

  /**
   * 健康检查间隔级别配置
   * @description 根据连续成功次数自动调整检查频率
   * 优化阈值：让间隔升级更快速合理
   */
  private readonly HEALTH_CHECK_LEVELS = [
    { level: 0, interval: 10000, threshold: 10, label: '10秒' },       // 启动/恢复: 10s，10次成功后升级(100秒)
    { level: 1, interval: 30000, threshold: 10, label: '30秒' },       // 稳定初期: 30s，10次成功后升级(5分钟)
    { level: 2, interval: 60000, threshold: 10, label: '1分钟' },      // 稳定中期: 1min，10次成功后升级(10分钟)
    { level: 3, interval: 300000, threshold: 6, label: '5分钟' },      // 稳定后期: 5min，6次成功后升级(30分钟)
    { level: 4, interval: 600000, threshold: 6, label: '10分钟' },     // 长期稳定: 10min，6次成功后升级(60分钟)
    { level: 5, interval: 900000, threshold: Infinity, label: '15分钟' } // 最大间隔: 15min，永不升级
  ]

  constructor() {
    super()
    // 配置文件路径
    this.configPath = path.join(os.homedir(), '.ccb', 'managed-mode-config.json')
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    try {
      // 加载配置
      await this.loadConfig()

      // 同步 providers：从配置管理列表自动加载并覆盖
      await this.syncProvidersFromConfigList()

      // 校准托管模式状态：比对 settings.json 与托管配置
      await this.calibrateManagedModeStatus()

      // 修改：不再自动启动托管模式，需要用户手动启用
      // 除非检测到当前系统配置就是托管配置且设置了自动启动标记
      if (this.config?.enabled && this.config.autoStart) {
        console.log('检测到托管模式自动启动配置，正在启动托管服务...')
        await this.start()
      } else if (this.config?.enabled) {
        console.log('托管模式已启用但需要手动启动服务')
      }
    } catch (error: any) {
      console.error('托管模式服务初始化失败:', error.message)
    }
  }

  /**
   * 校准托管模式状态
   * @description 启动时检查 ~/.claude/settings.json 与托管配置内容是否一致
   * 如果一致则自动将托管模式标记为已启用，但不需要再次备份
   */
  private async calibrateManagedModeStatus(): Promise<void> {
    try {
      if (!this.config) return

      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')

      // 读取当前 settings.json
      let currentSettings: any = {}
      try {
        const settingsContent = await fs.readFile(userSettingsPath, 'utf8')
        currentSettings = JSON.parse(settingsContent)
      } catch (error) {
        // 文件不存在或读取失败，无需校准
        console.log('settings.json 不存在或读取失败，跳过校准')
        return
      }

      // 生成期望的托管模式配置
      const expectedManagedConfig = {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.config.port || 8487}`,
          ANTHROPIC_AUTH_TOKEN: this.config.accessToken || '',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
        },
        permissions: {
          defaultMode: 'bypassPermissions'
        },
        statusLine: {
          type: 'command',
          command: 'ccline',
          padding: 0
        }
      }

      // 比对关键字段是否匹配
      const envMatches =
        currentSettings.env?.ANTHROPIC_BASE_URL === expectedManagedConfig.env.ANTHROPIC_BASE_URL &&
        currentSettings.env?.ANTHROPIC_AUTH_TOKEN === expectedManagedConfig.env.ANTHROPIC_AUTH_TOKEN &&
        currentSettings.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === expectedManagedConfig.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

      const permissionsMatch =
        currentSettings.permissions?.defaultMode === expectedManagedConfig.permissions.defaultMode

      const statusLineMatch =
        currentSettings.statusLine?.type === expectedManagedConfig.statusLine.type &&
        currentSettings.statusLine?.command === expectedManagedConfig.statusLine.command

      // 如果配置匹配且托管模式未启用，自动启用（但不改变 enabled 状态，仅校准认知）
      if (envMatches && permissionsMatch && statusLineMatch) {
        if (!this.config.enabled) {
          console.log('检测到 settings.json 内容与托管配置一致，自动校准托管模式状态')
          this.config.enabled = true
          await this.saveConfig(this.config)
        } else {
          console.log('settings.json 与托管配置一致，状态已同步')
        }
      } else if (this.config.enabled) {
        // 如果托管模式已启用但配置不匹配，说明用户可能手动修改了 settings.json
        console.warn('托管模式已启用但 settings.json 内容不匹配，可能需要重新应用配置')
      }
    } catch (error: any) {
      console.error('校准托管模式状态失败:', error.message)
    }
  }

  /**
   * 启动代理服务
   */
  async start(): Promise<void> {
    if (this.proxyProcess) {
      throw new Error('代理服务已经在运行中')
    }

    // 加载配置
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置文件不存在或无效')
    }

    if (!this.config.enabled) {
      throw new Error('托管模式未启用')
    }

    // 检查端口是否被占用
    const isPortInUse = await this.checkPortInUse(this.config.port)
    if (isPortInUse) {
      throw new Error(`端口 ${this.config.port} 已被占用`)
    }

    // 记录启动时间
    this.startTime = Date.now()
    console.log(`托管模式服务启动时间: ${new Date(this.startTime).toISOString()}`)

    // 启动前备份系统设置（只在首次启动时备份，避免覆盖原始配置）
    const hasBackup = await this.hasSystemSettingsBackup()
    if (!hasBackup) {
      try {
        await this.backupSystemSettings()
        console.log('托管模式启动：系统设置已备份（首次启动）')
      } catch (backupError) {
        console.warn('托管模式启动：备份系统设置失败，但继续启动', backupError)
      }
    } else {
      console.log('托管模式启动：检测到已有备份，跳过备份步骤（避免覆盖原始配置）')
    }

    // 尝试集成模式启动代理服务
    try {
      await this.startIntegratedProxy()
      this.isIntegrated = true
      console.log('代理服务已启动 (集成模式)')

      // 发送服务启动日志
      this.emit('log', {
        id: `startup_${Date.now()}`,
        timestamp: Date.now(),
        level: 'info' as const,
        type: 'system' as const,
        message: '托管服务启动成功',
        source: 'managed-mode-service',
        data: {
          mode: 'integrated',
          port: this.config.port,
          startTime: this.startTime,
          provider: this.config.currentProvider
        }
      })

      // 启动健康检查
      this.startHealthCheck()
      return
    } catch (error) {
      console.error('集成模式启动失败，尝试传统模式:', error)
      // 如果集成模式失败，尝试传统模式
    }

    // 代理服务入口文件路径
    const proxyServerPath = path.join(__dirname, '../../proxy-server/src/index.ts')
    const proxyServerDir = path.join(__dirname, '../../proxy-server')

    // 尝试多种启动方式
    const startMethods = [
      // 方法1: 使用shell执行，允许shell查找命令
      {
        command: 'npm',
        args: ['run', 'start'],
        cwd: proxyServerDir,
        env: { ...process.env },
        shell: true,
        windowsHide: false
      },
      // 方法2: 使用npx直接运行TypeScript
      {
        command: 'npx',
        args: ['tsx', 'src/index.ts'],
        cwd: proxyServerDir,
        env: { ...process.env },
        shell: true,
        windowsHide: false
      },
      // 方法3: 使用node运行编译后的JS
      {
        command: 'node',
        args: ['dist/index.js'],
        cwd: proxyServerDir,
        env: { ...process.env },
        shell: true,
        windowsHide: false
      },
      // 方法4: 使用PowerShell
      {
        command: 'powershell',
        args: ['-Command', `cd "${proxyServerDir}"; npm run start`],
        cwd: proxyServerDir,
        env: { ...process.env },
        shell: false,
        windowsHide: false
      }
    ]

    let lastError: Error | null = null

    for (const method of startMethods) {
      try {
        console.log(`尝试启动代理服务: ${method.command} ${method.args.join(' ')}`)

        this.proxyProcess = spawn(method.command, method.args, {
          cwd: method.cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
          env: {
            ...process.env,
            NODE_ENV: 'production'
          }
        })

        // 监听标准输出
        this.proxyProcess.stdout?.on('data', (data: Buffer) => {
          const output = data.toString()
          console.log(`[代理服务] ${output}`)
          this.parseAndEmitLog(output, 'info')
        })

        // 监听标准错误
        this.proxyProcess.stderr?.on('data', (data: Buffer) => {
          const output = data.toString()
          console.error(`[代理服务] ${output}`)
          this.parseAndEmitLog(output, 'error')
        })

        // 监听进程退出
        this.proxyProcess.on('exit', (code, signal) => {
          console.log(`代理服务进程退出, code: ${code}, signal: ${signal}`)
          this.proxyProcess = null
          this.stopHealthCheck()
        })

        // 监听进程错误
        this.proxyProcess.on('error', (error) => {
          console.error(`代理服务进程错误 (${method.command}):`, error)
          lastError = error
          this.proxyProcess = null
          this.stopHealthCheck()
        })

        // 等待一小段时间检查进程是否正常启动
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (this.proxyProcess && !this.proxyProcess.killed) {
              console.log(`代理服务启动成功 (使用: ${method.command})`)
              resolve()
            } else {
              reject(new Error(`代理服务启动失败: ${method.command}`))
            }
          }, 2000)

          // 如果进程立即出错，快速失败
          this.proxyProcess?.once('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
        })

        // 如果成功启动，跳出循环
        break

      } catch (error) {
        console.log(`启动方法 ${method.command} 失败，尝试下一个方法...`)
        lastError = error as Error
        if (this.proxyProcess) {
          this.proxyProcess.kill()
          this.proxyProcess = null
        }
      }
    }

    // 如果所有方法都失败了
    if (!this.proxyProcess) {
      throw lastError || new Error('无法启动代理服务，所有启动方法都失败了')
    }

    // 等待服务启动
    await this.waitForServiceReady()

    // 启动健康检查
    this.startHealthCheck()
  }

  /**
   * 停止代理服务
   */
  async stop(): Promise<void> {
    if (!this.proxyProcess) {
      return
    }

    // 停止健康检查
    this.stopHealthCheck()

    // 根据模式选择不同的关闭方式
    if (this.isIntegrated) {
      // 集成模式：关闭 Express 服务器
      if (typeof (this.proxyProcess as any).close === 'function') {
        (this.proxyProcess as any).close()
      }
      this.isIntegrated = false
    } else {
      // 传统模式：关闭子进程
      this.proxyProcess.kill('SIGTERM')

      // 等待进程退出,最多等待5秒
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.proxyProcess) {
            this.proxyProcess.kill('SIGKILL')
          }
          resolve()
        }, 5000)

        this.proxyProcess?.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }

    // 发送服务停止日志
    this.emit('log', {
      id: `shutdown_${Date.now()}`,
      timestamp: Date.now(),
      level: 'info' as const,
      type: 'system' as const,
      message: '托管服务已停止',
      source: 'managed-mode-service',
      data: {
        uptime: this.startTime ? Date.now() - this.startTime : 0,
        mode: this.isIntegrated ? 'integrated' : 'process'
      }
    })

    this.proxyProcess = null

    // 清除启动时间
    this.startTime = null
    console.log('托管模式服务已停止，启动时间已清除')

    // 停止后还原系统设置
    try {
      await this.restoreSystemSettings()
      console.log('托管模式停止：系统设置已还原')
    } catch (restoreError) {
      console.warn('托管模式停止：还原系统设置失败', restoreError)
    }
  }

  /**
   * 重启代理服务
   */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  /**
   * 获取服务状态
   */
  getStatus(): ManagedModeStatus {
    let pid: number | undefined

    if (this.proxyProcess) {
      if (this.isIntegrated) {
        // 集成模式：使用当前Electron主进程的PID
        pid = process.pid
      } else {
        // 传统模式：使用子进程的PID
        pid = this.proxyProcess.pid
      }
    }

    // 获取当前provider的详细信息
    let currentProviderInfo = undefined
    if (this.config?.currentProvider && this.config?.providers) {
      const provider = this.config.providers.find(p => p.id === this.config?.currentProvider)
      if (provider) {
        // 格式化API Key显示(前3后3,中间用***代替)
        const formatApiKey = (key: string): string => {
          if (!key || key.length < 7) return key
          return `${key.substring(0, 3)}***${key.substring(key.length - 3)}`
        }

        currentProviderInfo = {
          id: provider.id,
          name: provider.name,
          type: provider.type,
          apiBaseUrl: provider.apiBaseUrl,
          apiKey: formatApiKey(provider.apiKey),
          rawApiKey: provider.apiKey
        }
      }
    }

    const status: ManagedModeStatus = {
      running: this.proxyProcess !== null,
      enabled: this.config?.enabled || false,
      port: this.config?.port || 8487,
      pid,
      currentProvider: this.config?.currentProvider,
      currentProviderInfo,
      accessToken: this.config?.accessToken,
      networkProxy: this.config?.networkProxy,
      startTime: this.startTime
    }

    return status
  }

  /**
   * 启用托管模式
   * @description 启用托管模式配置并启动代理服务，同时将托管配置写入系统settings.json
   */
  async enableManagedMode(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      await this.loadConfig()

      if (!this.config) {
        throw new Error('配置文件不存在')
      }

      // 启用配置并设置autoStart标志，确保应用重启后自动启动服务
      this.config.enabled = true
      this.config.autoStart = true
      await this.saveConfig(this.config)

      // 启动代理服务（会自动备份 settings.json）
      await this.start()

      // 生成托管模式的默认配置
      const managedConfigData = {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.config.port || 8487}`,
          ANTHROPIC_AUTH_TOKEN: this.config.accessToken || '',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
        },
        permissions: {
          defaultMode: 'bypassPermissions'
        },
        statusLine: {
          type: 'command',
          command: 'ccline',
          padding: 0
        }
      }

      // 将托管配置写入系统 settings.json
      const writeResult = await this.updateSettingsConfig(managedConfigData)
      if (!writeResult.success) {
        console.error('写入托管配置到 settings.json 失败:', writeResult.error)
        // 不抛出错误，因为服务已经启动了
      }

      console.log('托管模式已启用，配置已写入 settings.json')

      return { success: true, message: '托管模式已启用' }
    } catch (error: any) {
      console.error('启用托管模式失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 禁用托管模式
   * @description 停止代理服务并禁用托管模式配置
   */
  async disableManagedMode(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // 停止代理服务
      if (this.proxyProcess) {
        await this.stop()
      }

      // 无论服务是否运行，都尝试还原系统设置
      try {
        await this.restoreSystemSettings()
        console.log('托管模式禁用：系统设置已还原')
      } catch (restoreError) {
        console.warn('托管模式禁用：还原系统设置失败', restoreError)
        // 还原失败不应该阻止禁用操作
      }

      await this.loadConfig()

      if (!this.config) {
        throw new Error('配置文件不存在')
      }

      // 禁用配置
      this.config.enabled = false
      await this.saveConfig(this.config)

      return { success: true, message: '托管模式已禁用' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查托管模式是否已启用
   */
  isManagedModeEnabled(): boolean {
    return this.config?.enabled || false
  }

  /**
   * 检查是否存在系统设置备份
   */
  async checkSystemSettingsBackup(): Promise<boolean> {
    return await this.hasSystemSettingsBackup()
  }

  /**
   * 获取配置
   */
  getConfig(): ManagedModeConfig | null {
    return this.config
  }

  /**
   * 更新配置
   */
  async updateConfig(config: Partial<ManagedModeConfig>): Promise<void> {
    // 加载当前配置
    await this.loadConfig()

    if (!this.config) {
      throw new Error('当前配置不存在')
    }

    // 合并配置
    this.config = {
      ...this.config,
      ...config
    }

    // 保存配置
    await this.saveConfig(this.config)

    // 如果服务正在运行,重启以应用新配置
    if (this.proxyProcess) {
      await this.restart()
    }
  }

  /**
   * 切换服务商
   */
  async switchProvider(providerId: string): Promise<void> {
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置不存在')
    }

    // 检查服务商是否存在
    const provider = this.config.providers.find((p) => p.id === providerId)
    if (!provider) {
      throw new Error(`服务商 ${providerId} 不存在`)
    }

    // 更新当前服务商
    this.config.currentProvider = providerId

    // 保存配置
    await this.saveConfig(this.config)

    // 如果服务正在运行,重启以应用新服务商
    if (this.proxyProcess) {
      await this.restart()
    }
  }

  /**
   * 添加服务商
   */
  async addProvider(provider: ApiProvider): Promise<void> {
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置不存在')
    }

    // 检查ID是否重复
    if (this.config.providers.some((p) => p.id === provider.id)) {
      throw new Error(`服务商ID ${provider.id} 已存在`)
    }

    // 添加服务商
    this.config.providers.push(provider)

    // 如果是第一个服务商,设为当前服务商
    if (this.config.providers.length === 1) {
      this.config.currentProvider = provider.id
    }

    // 保存配置
    await this.saveConfig(this.config)
  }

  /**
   * 更新服务商
   */
  async updateProvider(provider: ApiProvider): Promise<void> {
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置不存在')
    }

    // 查找并更新服务商
    const index = this.config.providers.findIndex((p) => p.id === provider.id)
    if (index === -1) {
      throw new Error(`服务商 ${provider.id} 不存在`)
    }

    this.config.providers[index] = provider

    // 保存配置
    await this.saveConfig(this.config)

    // 如果更新的是当前服务商,重启服务
    if (this.config.currentProvider === provider.id && this.proxyProcess) {
      await this.restart()
    }
  }

  /**
   * 备份系统设置文件
   * @description 备份 ~/.claude/settings.json 到 ~/.ccb/backup/ 目录
   */
  private async backupSystemSettings(): Promise<string> {
    try {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
      const backupDir = path.join(os.homedir(), '.ccb', 'backup')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupFileName = `settings.json.${timestamp}.backup`
      const backupPath = path.join(backupDir, backupFileName)

      // 确保备份目录存在
      await fs.mkdir(backupDir, { recursive: true })

      // 检查原始文件是否存在
      try {
        await fs.access(userSettingsPath)

        // 读取并备份原文件
        const originalContent = await fs.readFile(userSettingsPath, 'utf8')
        await fs.writeFile(backupPath, originalContent, 'utf8')

        console.log(`系统设置已备份到: ${backupPath}`)
        return backupPath
      } catch (error) {
        console.warn(`原始系统设置文件不存在: ${userSettingsPath}`)
        throw new Error('系统设置文件不存在，无法备份')
      }
    } catch (error: any) {
      console.error('备份系统设置失败:', error.message)
      throw new Error(`备份系统设置失败: ${error.message}`)
    }
  }

  /**
   * 还原系统设置文件
   * @description 从 ~/.ccb/backup/ 目录还原最近的 settings.json 备份
   */
  private async restoreSystemSettings(): Promise<void> {
    try {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')
      const backupDir = path.join(os.homedir(), '.ccb', 'backup')

      // 确保用户 .claude 目录存在
      await fs.mkdir(path.dirname(userSettingsPath), { recursive: true })

      // 查找最新的备份文件
      const files = await fs.readdir(backupDir)
      const backupFiles = files
        .filter(file => file.startsWith('settings.json.') && file.endsWith('.backup'))
        .sort((a, b) => b.localeCompare(a)) // 按时间倒序排列，最新的在前

      if (backupFiles.length === 0) {
        console.warn('未找到系统设置备份文件')
        return
      }

      const latestBackup = backupFiles[0]
      const backupPath = path.join(backupDir, latestBackup)

      // 读取备份内容
      const backupContent = await fs.readFile(backupPath, 'utf8')

      // 还原到原位置
      await fs.writeFile(userSettingsPath, backupContent, 'utf8')

      // 删除备份文件
      await fs.unlink(backupPath)

      console.log(`系统设置已从备份还原: ${userSettingsPath}`)
      console.log(`已删除备份文件: ${backupPath}`)
    } catch (error: any) {
      console.error('还原系统设置失败:', error.message)
      throw new Error(`还原系统设置失败: ${error.message}`)
    }
  }

  /**
   * 检查是否存在系统设置备份
   * @description 检查 ~/.ccb/backup/ 目录下是否有 settings.json 备份文件
   */
  private async hasSystemSettingsBackup(): Promise<boolean> {
    try {
      const backupDir = path.join(os.homedir(), '.ccb', 'backup')
      const files = await fs.readdir(backupDir)
      const backupFiles = files.filter(file =>
        file.startsWith('settings.json.') && file.endsWith('.backup')
      )
      return backupFiles.length > 0
    } catch {
      return false
    }
  }

  /**
   * 生成访问令牌
   * @description 生成格式为 ccb-sk-xxx + 32位高强度随机字符串的访问令牌
   */
  private generateAccessToken(): string {
    const randomPart = randomBytes(16).toString('hex') // 32位十六进制字符串
    return `ccb-sk-${randomPart}`
  }

  /**
   * 重置访问令牌
   * @description 生成新的访问令牌并更新配置
   */
  async resetAccessToken(): Promise<string> {
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置不存在')
    }

    const newToken = this.generateAccessToken()
    this.config.accessToken = newToken
    await this.saveConfig(this.config)

    return newToken
  }

  /**
   * 获取访问令牌
   * @description 获取当前访问令牌
   */
  getAccessToken(): string | null {
    return this.config?.accessToken || null
  }

  /**
   * 验证访问令牌
   * @description 验证提供的访问令牌是否有效
   */
  validateAccessToken(token: string): boolean {
    return this.config?.accessToken === token
  }

  /**
   * 删除服务商
   */
  async deleteProvider(providerId: string): Promise<void> {
    await this.loadConfig()

    if (!this.config) {
      throw new Error('配置不存在')
    }

    // 检查是否是当前服务商
    if (this.config.currentProvider === providerId) {
      throw new Error('不能删除当前正在使用的服务商')
    }

    // 删除服务商
    this.config.providers = this.config.providers.filter((p) => p.id !== providerId)

    // 保存配置
    await this.saveConfig(this.config)
  }

  /**
   * 获取环境变量设置命令
   */
  getEnvCommand(): EnvCommand[] {
    const port = this.config?.port || 8487
    const baseUrl = `http://127.0.0.1:${port}`
    const accessToken = this.config?.accessToken || 'ccb-managed-mode'

    return [
      {
        type: 'windows-powershell',
        label: 'Windows (PowerShell)',
        command: `$env:ANTHROPIC_BASE_URL="${baseUrl}"\n$env:ANTHROPIC_API_KEY="${accessToken}"`
      },
      {
        type: 'windows-cmd',
        label: 'Windows (CMD)',
        command: `set ANTHROPIC_BASE_URL=${baseUrl}\nset ANTHROPIC_API_KEY=${accessToken}`
      },
      {
        type: 'unix-bash',
        label: 'macOS/Linux (Bash/Zsh)',
        command: `export ANTHROPIC_BASE_URL="${baseUrl}"\nexport ANTHROPIC_API_KEY="${accessToken}"`
      }
    ]
  }

  /**
   * 从配置管理列表同步 providers
   * @description 扫描配置目录，为每个 claude-code 类型的配置生成 provider，并覆盖 managed-mode-config.json 中的 providers 字段
   */
  private async syncProvidersFromConfigList(): Promise<void> {
    try {
      if (!this.config) return

      const configDir = path.join(os.homedir(), '.ccb', 'claude-configs')

      // 检查目录是否存在
      try {
        await fs.access(configDir)
      } catch {
        console.log('配置目录不存在，跳过 providers 同步')
        return
      }

      // 读取配置目录中的所有文件
      const files = await fs.readdir(configDir)
      const configFiles = files.filter(file => file.endsWith('.json') && file !== 'settings.json')

      const newProviders: ApiProvider[] = []
      const currentProviderId = this.config.currentProvider

      for (const file of configFiles) {
        try {
          const configPath = path.join(configDir, file)
          const content = await fs.readFile(configPath, 'utf-8')
          const config = JSON.parse(content)

          // 只处理有效的 claude-code 配置
          if (config.env?.ANTHROPIC_BASE_URL && config.env?.ANTHROPIC_AUTH_TOKEN) {
            const baseUrl = config.env.ANTHROPIC_BASE_URL
            const authToken = config.env.ANTHROPIC_AUTH_TOKEN
            const configName = path.basename(file, '.json')

            // 生成稳定的 provider ID（使用简化的哈希算法）
            const content = `${configName}|${baseUrl}|${authToken}`
            let hashValue = 0
            for (let i = 0; i < content.length; i++) {
              const char = content.charCodeAt(i)
              hashValue = ((hashValue << 5) - hashValue) + char
              hashValue = hashValue & hashValue
            }
            const stableId = Math.abs(hashValue).toString(16).padStart(8, '0')
            const providerId = `config-${stableId}`

            // 创建 provider 对象
            const provider: ApiProvider = {
              id: providerId,
              name: configName,
              type: 'custom' as const,
              apiBaseUrl: baseUrl,
              apiKey: authToken,
              models: [],
              enabled: true,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }

            newProviders.push(provider)

            // 如果当前 provider 被删除了，清空 currentProvider
            if (currentProviderId && !newProviders.find(p => p.id === currentProviderId)) {
              this.config.currentProvider = ''
            }
          }
        } catch (error) {
          console.error(`处理配置文件 ${file} 失败:`, error)
        }
      }

      // 覆盖 providers
      this.config.providers = newProviders

      // 如果 currentProvider 不在新的 providers 列表中，清空它
      if (this.config.currentProvider && !newProviders.find(p => p.id === this.config.currentProvider)) {
        console.log(`当前 provider ${this.config.currentProvider} 不在新的 providers 列表中，已清空`)
        this.config.currentProvider = ''
      }

      // 保存配置
      await this.saveConfig(this.config)

      console.log(`已从配置列表同步 ${newProviders.length} 个 providers`)
    } catch (error: any) {
      console.error('同步 providers 失败:', error.message)
    }
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8')
      this.config = JSON.parse(data)

      // 兼容旧配置：如果accessToken不存在，生成一个
      if (!this.config.accessToken) {
        this.config.accessToken = this.generateAccessToken()
        await this.saveConfig(this.config)
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 配置文件不存在,创建默认配置
        this.config = {
          enabled: false,
          port: 8487,
          currentProvider: '',
          providers: [],
          accessToken: this.generateAccessToken(), // 自动生成访问令牌
          logging: {
            enabled: true,
            level: 'info'
          }
        }
        await this.saveConfig(this.config)
      } else {
        throw error
      }
    }
  }

  /**
   * 保存配置
   */
  private async saveConfig(config: ManagedModeConfig): Promise<void> {
    // 确保目录存在
    const dir = path.dirname(this.configPath)
    await fs.mkdir(dir, { recursive: true })

    // 写入配置
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8')

    // 更新内存中的配置
    this.config = config
  }

  /**
   * 更新系统settings.json配置
   * @description 将托管模式配置写入到~/.claude/settings.json文件
   * @note 完全替换托管控制的字段，不做合并，避免残留旧配置
   */
  async updateSettingsConfig(configData: any): Promise<{ success: boolean; error?: string }> {
    try {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')

      // 确保目录存在
      const claudeDir = path.dirname(userSettingsPath)
      await fs.mkdir(claudeDir, { recursive: true })

      // 读取现有配置（如果存在）
      let existingConfig: any = {}
      try {
        const existingContent = await fs.readFile(userSettingsPath, 'utf8')
        existingConfig = JSON.parse(existingContent)
      } catch (error) {
        // 文件不存在或读取失败，使用空配置
        console.log('系统settings文件不存在，将创建新文件')
      }

      // 完全替换模式：移除托管控制的字段，然后添加新的托管配置
      // 托管控制的字段：env, permissions, statusLine, 以及其他在 configData 中的字段
      const managedKeys = new Set(['env', 'permissions', 'statusLine', ...Object.keys(configData)])

      // 保留非托管控制的字段
      const preservedConfig: any = {}
      for (const key in existingConfig) {
        if (!managedKeys.has(key)) {
          preservedConfig[key] = existingConfig[key]
        }
      }

      // 合并：先放保留的字段，再放新的托管配置
      const finalConfig = {
        ...preservedConfig,
        ...configData
      }

      // 写入配置
      await fs.writeFile(userSettingsPath, JSON.stringify(finalConfig, null, 2), 'utf8')

      console.log(`托管模式配置已写入系统settings: ${userSettingsPath}`)
      console.log('写入的配置:', JSON.stringify(finalConfig, null, 2))

      // 发送配置更新事件，通知前端状态变化
      this.emit('config-updated', {
        timestamp: Date.now(),
        configPath: userSettingsPath,
        configData: finalConfig
      })

      return { success: true }
    } catch (error: any) {
      console.error('写入系统settings配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查端口是否被占用
   */
  private async checkPortInUse(port: number): Promise<boolean> {
    try {
      const response = await axios.get(`http://127.0.0.1:${port}/health`, {
        timeout: 1000
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  /**
   * 等待服务就绪
   */
  private async waitForServiceReady(): Promise<void> {
    const maxAttempts = 30
    const interval = 1000

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const port = this.config?.port || 8487
        const response = await axios.get(`http://127.0.0.1:${port}/health`, {
          timeout: 1000
        })

        if (response.status === 200) {
          console.log('代理服务已就绪')
          return
        }
      } catch {
        // 继续等待
      }

      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    throw new Error('代理服务启动超时')
  }

  /**
   * 启动健康检查（智能自适应间隔）
   * @description 启动时使用高频率检查，服务稳定后逐步降低检查频率
   */
  private startHealthCheck(): void {
    // 重置状态到初始级别
    this.consecutiveSuccessCount = 0
    this.healthCheckLevel = 0
    this.currentHealthCheckInterval = this.HEALTH_CHECK_LEVELS[0].interval

    console.log(`[健康检查] 启动智能健康检查，初始间隔: ${this.HEALTH_CHECK_LEVELS[0].label}`)

    // 执行第一次检查并启动循环
    this.performHealthCheck()
  }

  /**
   * 执行单次健康检查
   * @description 执行检查后根据结果调整间隔并重新调度
   */
  private performHealthCheck(): void {
    const port = this.config?.port || 8487

    console.log(`[健康检查] 开始执行健康检查...端口: ${port}`)

    axios.get(`http://127.0.0.1:${port}/health`, {
      timeout: 3000
    })
    .then(response => {
      console.log(`[健康检查] 检查成功，准备调度下次检查`)
      // 健康检查成功
      this.consecutiveSuccessCount++
      const currentLevel = this.HEALTH_CHECK_LEVELS[this.healthCheckLevel]

      // 发送健康检查成功日志
      // 策略：初期高频记录，稳定后降低日志频率
      const shouldLog =
        this.consecutiveSuccessCount === 1 || // 首次成功必须记录
        this.consecutiveSuccessCount <= 3 ||  // 前3次检查都记录，让用户看到系统正常工作
        this.consecutiveSuccessCount === currentLevel.threshold || // 达到升级阈值时记录
        this.consecutiveSuccessCount % 20 === 0 // 后续每20次记录一次

      if (shouldLog) {
        this.emit('log', {
          id: `health_${Date.now()}`,
          timestamp: Date.now(),
          level: 'info' as const,
          type: 'system' as const,
          message: `健康检查通过 (连续${this.consecutiveSuccessCount}次成功，当前间隔: ${currentLevel.label})`,
          source: 'managed-mode-service',
          data: {
            status: response.data.status,
            port,
            uptime: this.startTime ? Date.now() - this.startTime : 0,
            consecutiveSuccessCount: this.consecutiveSuccessCount,
            currentInterval: currentLevel.label,
            healthCheckLevel: this.healthCheckLevel
          }
        })
      }

      // 检查是否需要升级到下一个间隔级别
      if (this.consecutiveSuccessCount >= currentLevel.threshold &&
          this.healthCheckLevel < this.HEALTH_CHECK_LEVELS.length - 1) {
        this.healthCheckLevel++
        this.consecutiveSuccessCount = 0 // 重置计数器
        const newLevel = this.HEALTH_CHECK_LEVELS[this.healthCheckLevel]
        this.currentHealthCheckInterval = newLevel.interval

        console.log(`[健康检查] 服务稳定，升级到级别${this.healthCheckLevel}，间隔调整为: ${newLevel.label}`)
        this.emit('log', {
          id: `health_${Date.now()}`,
          timestamp: Date.now(),
          level: 'info' as const,
          type: 'system' as const,
          message: `健康检查频率降低: ${currentLevel.label} → ${newLevel.label}`,
          source: 'managed-mode-service',
          data: {
            oldLevel: this.healthCheckLevel - 1,
            newLevel: this.healthCheckLevel,
            oldInterval: currentLevel.label,
            newInterval: newLevel.label
          }
        })
      }

      // 重新调度下次检查
      this.scheduleNextHealthCheck()
    })
    .catch(error => {
      console.error('[健康检查] 检查失败,服务可能已停止:', error.message)

      // 发送健康检查失败日志
      this.emit('log', {
        id: `health_${Date.now()}`,
        timestamp: Date.now(),
        level: 'error' as const,
        type: 'error' as const,
        message: `健康检查失败 (在${this.HEALTH_CHECK_LEVELS[this.healthCheckLevel].label}间隔级别)`,
        source: 'managed-mode-service',
        data: {
          error: error instanceof Error ? error.message : String(error),
          consecutiveSuccessCount: this.consecutiveSuccessCount,
          healthCheckLevel: this.healthCheckLevel
        }
      })

      // 重置到初始级别
      this.resetHealthCheckLevel()

      // 服务异常,清理进程引用
      if (this.proxyProcess) {
        this.proxyProcess.kill('SIGKILL')
        this.proxyProcess = null
      }
      this.stopHealthCheck()
    })
  }

  /**
   * 调度下次健康检查
   * @description 使用当前间隔调度下次检查
   */
  private scheduleNextHealthCheck(): void {
    // 清除之前的定时器
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval)
    }

    const currentInterval = this.currentHealthCheckInterval
    const currentLabel = this.HEALTH_CHECK_LEVELS[this.healthCheckLevel].label

    console.log(`[健康检查] 调度下次检查，间隔: ${currentInterval}ms (${currentLabel})`)

    // 使用当前间隔调度下次检查
    this.healthCheckInterval = setTimeout(() => {
      console.log(`[健康检康检查] 定时器触发，执行下次检查`)
      this.performHealthCheck()
    }, currentInterval)

    console.log(`[健康检查] 定时器已设置`)
  }

  /**
   * 重置健康检查级别
   * @description 失败时重置到初始高频检查级别
   */
  private resetHealthCheckLevel(): void {
    const oldLevel = this.healthCheckLevel
    const oldInterval = this.HEALTH_CHECK_LEVELS[oldLevel].label

    this.consecutiveSuccessCount = 0
    this.healthCheckLevel = 0
    this.currentHealthCheckInterval = this.HEALTH_CHECK_LEVELS[0].interval

    console.log(`[健康检查] 检查失败，重置到初始级别 (${oldInterval} → ${this.HEALTH_CHECK_LEVELS[0].label})`)

    this.emit('log', {
      id: `health_${Date.now()}`,
      timestamp: Date.now(),
      level: 'warn' as const,
      type: 'system' as const,
      message: `健康检查失败，频率重置: ${oldInterval} → ${this.HEALTH_CHECK_LEVELS[0].label}`,
      source: 'managed-mode-service',
      data: {
        oldLevel,
        newLevel: 0,
        reason: '检查失败'
      }
    })
  }

  /**
   * 停止健康检查
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearTimeout(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
    // 重置状态
    this.consecutiveSuccessCount = 0
    this.healthCheckLevel = 0
    this.currentHealthCheckInterval = this.HEALTH_CHECK_LEVELS[0].interval
  }

  /**
   * 解析并发送日志到渲染进程
   * @description 解析代理服务器的JSON日志并通过IPC发送到前端
   */
  private parseAndEmitLog(output: string, defaultLevel: 'info' | 'error'): void {
    try {
      const lines = output.split('\n').filter(line => line.trim())

      for (const line of lines) {
        try {
          // 尝试解析JSON格式的日志
          const jsonMatch = line.match(/({.+})/)
          if (jsonMatch) {
            const logData = JSON.parse(jsonMatch[1])

            // 构造日志事件
            const logEvent = {
              timestamp: Date.now(),
              level: logData.level || defaultLevel,
              type: this.determineLogType(logData),
              source: 'managed-mode-proxy',
              message: logData.message || line,
              data: this.extractLogData(logData)
            }

            // 发送到渲染进程
            this.emitLog(logEvent)
          } else {
            // 非JSON格式的日志，直接发送
            this.emitLog({
              timestamp: Date.now(),
              level: defaultLevel,
              type: 'system',
              source: 'managed-mode-proxy',
              message: line.trim(),
              data: null
            })
          }
        } catch (parseError) {
          // 解析单行失败时，发送原始日志
          this.emitLog({
            timestamp: Date.now(),
            level: defaultLevel,
            type: 'system',
            source: 'managed-mode-proxy',
            message: line.trim(),
            data: null
          })
        }
      }
    } catch (error) {
      console.error('解析代理服务日志失败:', error)
    }
  }

  /**
   * 确定日志类型
   */
  private determineLogType(logData: any): 'request' | 'response' | 'system' | 'error' {
    // 根据日志消息判断类型
    const message = (logData.message || '').toLowerCase()

    if (message.includes('请求') || message.includes('request')) {
      return 'request'
    }
    if (message.includes('响应') || message.includes('response')) {
      return 'response'
    }
    if (logData.level === 'error') {
      return 'error'
    }
    return 'system'
  }

  /**
   * 提取日志数据
   */
  private extractLogData(logData: any): any {
    const data: any = {}

    // 提取HTTP相关信息
    if (logData.method) data.method = logData.method
    if (logData.url) data.url = logData.url
    if (logData.statusCode) data.statusCode = logData.statusCode
    if (logData.duration) data.duration = logData.duration
    if (logData.headers) data.headers = logData.headers
    if (logData.body) data.body = logData.body
    if (logData.error) data.error = logData.error
    if (logData.stack) data.stack = logData.stack
    if (logData.provider) data.provider = logData.provider

    return Object.keys(data).length > 0 ? data : null
  }

  /**
   * 发送日志事件到渲染进程
   */
  private emitLog(logEvent: any): void {
    try {
      const allWindows = BrowserWindow.getAllWindows()
      allWindows.forEach(window => {
        window.webContents.send('managed-mode:log', logEvent)
      })
    } catch (error) {
      console.error('发送日志事件失败:', error)
    }
  }

  /**
   * 集成模式启动代理服务（在主进程中运行）
   */
  private async startIntegratedProxy(): Promise<void> {
    // 动态导入 express、cors 和 axios
    const express = await import('express')
    const cors = await import('cors')
    const axios = (await import('axios')).default
    const { HttpsProxyAgent } = await import('https-proxy-agent')

    const app = express.default()
    app.use(cors.default())
    app.use(express.default.json({ limit: '50mb' }))

    const port = this.config?.port || 8487

    // 中间件：验证访问令牌
    const authMiddleware = (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization || req.headers['x-api-key']
      const token = authHeader?.replace('Bearer ', '')

      if (!token) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: '缺少访问令牌'
          }
        })
      }

      if (token !== this.config?.accessToken) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: '访问令牌无效'
          }
        })
      }

      next()
    }

    // 健康检查端点（不需要认证）
    app.get('/health', (req, res) => {
      const currentProvider = this.config?.providers.find(
        p => p.id === this.config?.currentProvider
      )
      res.json({
        status: 'ok',
        version: '1.1.0',
        timestamp: new Date().toISOString(),
        mode: 'integrated',
        currentProvider: currentProvider?.name || 'None',
        networkProxy: {
          enabled: this.config?.networkProxy?.enabled || false,
          host: this.config?.networkProxy?.host || '',
          port: this.config?.networkProxy?.port || 0
        }
      })
    })

    // 代理端点 - Anthropic Messages API
    app.post('/v1/messages', authMiddleware, async (req, res) => {
      const requestTime = new Date().toISOString()
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const isStreamRequest = req.body.stream === true
      let axiosConfig: any // 在外部声明，以便在catch块中使用

      try {
        // 获取当前服务提供商配置
        const currentProvider = this.config?.providers.find(
          p => p.id === this.config?.currentProvider
        )

        if (!currentProvider) {
          const errorLog = {
            id: requestId,
            timestamp: requestTime,
            type: 'error' as const,
            message: '未配置服务提供商',
            statusCode: 500
          }
          this.emit('log', errorLog)

          return res.status(500).json({
            type: 'error',
            error: {
              type: 'provider_error',
              message: '未配置服务提供商'
            }
          })
        }

        // 准备请求配置 - 完整转发请求头以保持Claude Code CLI客户端身份
        // 参考调研报告：docs/10-托管模式请求头转发调研报告.md

        // 1. 复制所有原始请求头（保留客户端识别信息）
        const forwardedHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            forwardedHeaders[key.toLowerCase()] = value
          } else if (Array.isArray(value) && value.length > 0) {
            forwardedHeaders[key.toLowerCase()] = value[0]
          }
        }

        // 2. 移除需要清理的头（避免冲突和安全问题）
        const headersToRemove = [
          'host',                    // 会被axios根据目标URL自动设置
          'connection',              // 连接管理头，由HTTP客户端处理
          'content-length',          // 会被axios根据body自动计算
          'transfer-encoding',       // 传输编码，由HTTP客户端处理
          'authorization'            // 原始授权头（后续会替换为x-api-key）
        ]
        headersToRemove.forEach(header => delete forwardedHeaders[header])

        // 3. 添加标准HTTP代理链追踪头（符合RFC 7239）
        forwardedHeaders['x-forwarded-for'] = req.ip || req.socket.remoteAddress || 'unknown'
        forwardedHeaders['x-forwarded-host'] = req.headers.host || 'localhost'
        forwardedHeaders['x-forwarded-proto'] = req.protocol || 'http'

        // 4. 设置/覆盖必要的头
        forwardedHeaders['content-type'] = 'application/json'
        forwardedHeaders['anthropic-version'] = req.headers['anthropic-version'] || '2023-06-01'
        forwardedHeaders['x-api-key'] = currentProvider.apiKey  // 替换为上游API密钥

        // 构建axios配置
        axiosConfig = {
          method: 'POST',
          url: `${currentProvider.apiBaseUrl}/v1/messages`,
          headers: forwardedHeaders,
          data: req.body,
          timeout: 120000 // 2分钟超时
        }

        // 如果是流式请求，设置responseType为stream
        if (isStreamRequest) {
          axiosConfig.responseType = 'stream'
        }

        // 如果启用了网络代理
        if (this.config?.networkProxy?.enabled) {
          const proxyUrl = `http://${this.config.networkProxy.host}:${this.config.networkProxy.port}`
          axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
          console.log(`使用网络代理: ${proxyUrl}`)
        }

        // 记录请求日志（包含转发的请求头信息）
        if (this.config?.logging?.enabled) {
          // 脱敏处理：隐藏API密钥
          const sanitizedHeaders = { ...forwardedHeaders }
          if (sanitizedHeaders['x-api-key']) {
            const key = sanitizedHeaders['x-api-key']
            sanitizedHeaders['x-api-key'] = key.length > 10 ? `${key.substring(0, 10)}...***` : '***'
          }

          const requestLog = {
            id: requestId,
            timestamp: requestTime,
            type: 'request' as const,
            message: `请求 ${currentProvider.name}${isStreamRequest ? ' (流式)' : ''}`,
            provider: currentProvider.name,
            model: req.body.model,
            url: axiosConfig.url,
            method: 'POST',
            statusCode: 0,
            data: {
              method: 'POST',
              url: axiosConfig.url,
              provider: currentProvider.name,
              stream: isStreamRequest,
              headers: sanitizedHeaders,  // 包含完整的转发请求头（已脱敏）
              body: {
                model: req.body.model,
                max_tokens: req.body.max_tokens,
                stream: req.body.stream,
                messages: req.body.messages?.length
                  ? `${req.body.messages.length} message(s)`
                  : undefined
              }
            }
          }
          this.emit('log', requestLog)
          console.log('[托管代理] 转发请求到上游:', {
            provider: currentProvider.name,
            url: axiosConfig.url,
            model: req.body.model,
            stream: isStreamRequest,
            forwardedHeadersCount: Object.keys(forwardedHeaders).length
          })
        }

        // 转发请求到上游 API
        const response = await axios(axiosConfig)

        // 处理流式响应
        if (isStreamRequest && response.data) {
          // 设置SSE响应头
          res.setHeader('Content-Type', 'text/event-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')
          res.setHeader('X-Accel-Buffering', 'no') // 禁用nginx缓冲

          // 将上游流转发给客户端
          response.data.pipe(res)

          // 处理流错误
          response.data.on('error', (error: any) => {
            console.error('[托管代理] 上游流错误:', error)
            if (!res.headersSent) {
              res.status(500).end()
            } else {
              res.end()
            }
          })

          // 流结束时记录日志
          response.data.on('end', () => {
            if (this.config?.logging?.enabled) {
              const endTime = Date.now()
              const duration = endTime - new Date(requestTime).getTime()
              const responseLog = {
                id: requestId,
                timestamp: new Date().toISOString(),
                type: 'response' as const,
                message: '流式响应完成',
                provider: currentProvider.name,
                statusCode: response.status,
                data: {
                  method: 'POST',
                  url: axiosConfig.url,
                  statusCode: response.status,
                  duration,
                  stream: true,
                  headers: {
                    'content-type': response.headers['content-type'],
                    'x-request-id': response.headers['x-request-id']
                  }
                }
              }
              this.emit('log', responseLog)
              console.log('[托管代理] 流式响应完成')
            }
          })

          return
        }

        // 处理非流式响应
        if (this.config?.logging?.enabled) {
          const endTime = Date.now()
          const duration = endTime - new Date(requestTime).getTime()
          const responseLog = {
            id: requestId,
            timestamp: new Date().toISOString(),
            type: 'response' as const,
            message: `响应成功 (${response.status})`,
            provider: currentProvider.name,
            statusCode: response.status,
            hasContent: !!response.data,
            data: {
              method: 'POST',
              url: axiosConfig.url,
              statusCode: response.status,
              duration,
              stream: false,
              headers: {
                'content-type': response.headers['content-type'],
                'x-request-id': response.headers['x-request-id']
              },
              body: response.data ? {
                id: response.data.id,
                type: response.data.type,
                role: response.data.role,
                model: response.data.model,
                usage: response.data.usage,
                content: response.data.content  // 显示完整的content数组，包含所有子级JSON数据
              } : undefined
            }
          }
          this.emit('log', responseLog)
          console.log('[托管代理] 收到上游响应:', {
            status: response.status,
            hasContent: !!response.data
          })
        }

        // 返回上游响应
        res.status(response.status).json(response.data)

      } catch (error: any) {
        console.error('[托管代理] 请求失败:', error.message)

        // 记录错误日志
        const endTime = Date.now()
        const duration = endTime - new Date(requestTime).getTime()
        const errorLog = {
          id: requestId,
          timestamp: new Date().toISOString(),
          type: 'error' as const,
          message: error.message || '请求失败',
          statusCode: error.response?.status || 500,
          errorType: error.code || 'unknown',
          data: {
            method: 'POST',
            url: axiosConfig?.url || '/v1/messages',
            statusCode: error.response?.status || 500,
            duration,
            error: error.message,
            errorCode: error.code,
            errorType: error.response?.data?.error?.type || 'unknown_error',
            headers: error.response?.headers ? {
              'content-type': error.response.headers['content-type']
            } : undefined,
            // 包含上游API返回的完整错误响应体
            body: error.response?.data || null
          }
        }
        this.emit('log', errorLog)

        // 处理axios错误
        if (error.response) {
          // 上游API返回错误
          if (error.response.data && typeof error.response.data === 'object' && !Buffer.isBuffer(error.response.data)) {
            return res.status(error.response.status).json(error.response.data)
          } else {
            // 流式错误响应
            return res.status(error.response.status).send(error.response.data)
          }
        } else if (error.code === 'ECONNABORTED') {
          // 超时错误
          return res.status(504).json({
            type: 'error',
            error: {
              type: 'timeout_error',
              message: '请求超时'
            }
          })
        } else {
          // 其他网络错误
          return res.status(500).json({
            type: 'error',
            error: {
              type: 'api_error',
              message: `代理服务内部错误: ${error.message}`
            }
          })
        }
      }
    })

    // 启动服务器
    return new Promise((resolve, reject) => {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`集成代理服务已启动: http://127.0.0.1:${port}`)
        console.log(`当前服务提供商: ${this.config?.currentProvider || 'None'}`)
        // 将 server 引用存储到 proxyProcess 中，以便后续管理
        this.proxyProcess = server as any
        resolve()
      })

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`端口 ${port} 已被占用`))
        } else {
          reject(error)
        }
      })
    })
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    await this.stop()
  }
}

// 导出单例实例
export const managedModeService = new ManagedModeService()
