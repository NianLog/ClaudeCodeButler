/**
 * 托管模式管理服务
 * @description 负责管理代理服务的生命周期，包括启动、停止、配置管理等
 */

import { app } from 'electron'
import { ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import axios, { type AxiosRequestConfig } from 'axios'
import { EventEmitter } from 'events'
import type { Request, Response, NextFunction } from 'express'
import type {
  ManagedModeConfig,
  ManagedModeStatus,
  ApiProvider,
  EnvCommand
} from '@shared/types/managed-mode'
import { managedModeLogRotationService } from './managed-mode-log-rotation.service'
import { ManagedModeConfigStore } from './managed-mode-config-store'
import { logger } from '../utils/logger'
import { pathManager } from '../utils/path-manager'

const managedModeLogger = logger.child('ManagedModeService')

/**
 * 集成模式下代理进程的实际形态
 * @description 传统模式下为子进程，集成模式下为 Express http.Server，二者对外暴露不同的关闭接口
 */
type ProxyProcessLike = ChildProcess | { close: (callback?: (err?: Error) => void) => void; once: (event: string, listener: (...args: unknown[]) => void) => void }

/**
 * Anthropic Messages API 请求体结构
 * @description 仅声明托管代理需要读取的字段，其它字段按原样透传到上游
 */
interface MessagesRequestBody {
  model?: string
  max_tokens?: number
  stream?: boolean
  messages?: unknown[]
}

/**
 * 上游响应中的 usage / content 片段结构（仅用于日志记录的字段子集）
 */
interface UpstreamResponseData {
  id?: string
  type?: string
  role?: string
  model?: string
  usage?: Record<string, unknown>
  content?: unknown
}

/**
 * 托管模式管理服务类
 */
export class ManagedModeService extends EventEmitter {
  /**
   * 默认托管服务端口
   * @description 当配置文件不存在或未指定端口时使用此默认值
   */
  private static readonly DEFAULT_PORT = 8487

  private proxyProcess: ProxyProcessLike | null = null
  private configPath: string
  private config: ManagedModeConfig | null = null
  // v1.4.0 架构解耦：配置读写委托给 ConfigStore（第一步拆分）
  private configStore: ManagedModeConfigStore
  private healthCheckInterval: NodeJS.Timeout | null = null
  private isIntegrated: boolean = false // 标记是否使用集成模式
  private startTime: number | null = null // 记录服务启动时间
  private isRestarting: boolean = false // 标记是否正在执行重启操作
  // v1.4.0 重启互斥链：串行化所有 restart，避免并发 stop/start 导致 settings 错误还原
  private restartChain: Promise<void> = Promise.resolve()

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
    // v1.4.0 架构解耦：委托 ConfigStore 处理配置持久化与 accessToken 生成
    this.configStore = new ManagedModeConfigStore(this.configPath)
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    managedModeLogger.info('开始初始化托管模式服务')
    try {
      // 初始化日志轮转服务
      managedModeLogger.info('步骤1：初始化日志轮转服务')
      await managedModeLogRotationService.initialize()
      managedModeLogger.info('步骤1完成：日志轮转服务初始化成功')

      // 加载配置
      managedModeLogger.info('步骤2：加载托管模式配置')
      await this.loadConfig()
      managedModeLogger.info('步骤2完成：配置加载成功')

      // 同步 providers：从配置管理列表自动加载并覆盖
      managedModeLogger.info('步骤3：同步服务提供商列表')
      await this.syncProvidersFromConfigList()
      managedModeLogger.info('步骤3完成：服务提供商同步成功')

      // 校准托管模式状态：比对 settings.json 与托管配置
      managedModeLogger.info('步骤4：校准托管模式状态')
      await this.calibrateManagedModeStatus()
      managedModeLogger.info('步骤4完成：状态校准成功')

      // 修改：不再自动启动托管模式，需要用户手动启用
      // 除非检测到当前系统配置就是托管配置且设置了自动启动标记
      if (this.config?.enabled && this.config.autoStart) {
        managedModeLogger.info('检测到托管模式自动启动配置，正在启动托管服务')
        await this.start()
      } else if (this.config?.enabled) {
        managedModeLogger.info('托管模式已启用但需要手动启动服务')
      }

      managedModeLogger.info('托管模式服务初始化完成')
    } catch (error: unknown) {
      managedModeLogger.error('托管模式服务初始化失败', error)
      // 重新抛出错误，确保上层能够捕获到初始化失败
      throw error
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
      let currentSettings: Record<string, unknown> = {}
      try {
        const settingsContent = await fs.readFile(userSettingsPath, 'utf8')
        currentSettings = JSON.parse(settingsContent) as Record<string, unknown>
      } catch (error) {
        // 文件不存在或读取失败，无需校准
        managedModeLogger.info('settings.json 不存在或读取失败，跳过校准')
        return
      }

      // 生成期望的托管模式配置
      const expectedManagedConfig = {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.config.port || ManagedModeService.DEFAULT_PORT}`,
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

      // 安全读取嵌套字段，避免对未校验结构直接断言
      const currentEnv = (currentSettings.env ?? {}) as Record<string, unknown>
      const currentPermissions = (currentSettings.permissions ?? {}) as Record<string, unknown>
      const currentStatusLine = (currentSettings.statusLine ?? {}) as Record<string, unknown>

      // 比对关键字段是否匹配
      const envMatches =
        currentEnv.ANTHROPIC_BASE_URL === expectedManagedConfig.env.ANTHROPIC_BASE_URL &&
        currentEnv.ANTHROPIC_AUTH_TOKEN === expectedManagedConfig.env.ANTHROPIC_AUTH_TOKEN &&
        currentEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC === expectedManagedConfig.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC

      const permissionsMatch =
        currentPermissions.defaultMode === expectedManagedConfig.permissions.defaultMode

      const statusLineMatch =
        currentStatusLine.type === expectedManagedConfig.statusLine.type &&
        currentStatusLine.command === expectedManagedConfig.statusLine.command

      // 如果配置匹配且托管模式未启用，自动启用（但不改变 enabled 状态，仅校准认知）
      if (envMatches && permissionsMatch && statusLineMatch) {
        if (!this.config.enabled) {
          // v1.4.0 防御：校准启用时若不存在系统设置备份，原始配置可能已丢失，禁用时将无法还原原始配置
          const hasBackup = await this.hasSystemSettingsBackup()
          if (!hasBackup) {
            managedModeLogger.warn('校准启用托管模式：未找到系统设置备份，后续禁用时可能无法还原原始配置')
          }
          managedModeLogger.info('检测到 settings.json 内容与托管配置一致，自动校准托管模式状态')
          this.config.enabled = true
          await this.saveConfig(this.config)
        } else {
          managedModeLogger.info('settings.json 与托管配置一致，状态已同步')
        }
      } else if (this.config.enabled) {
        // 如果托管模式已启用但配置不匹配，说明用户可能手动修改了 settings.json
        managedModeLogger.warn('托管模式已启用但 settings.json 内容不匹配，可能需要重新应用配置')
      }
    } catch (error: unknown) {
      managedModeLogger.error('校准托管模式状态失败', error)
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
    managedModeLogger.info(`托管模式服务启动时间: ${new Date(this.startTime).toISOString()}`)

    // 启动前备份系统设置（只在首次启动时备份，避免覆盖原始配置）
    const hasBackup = await this.hasSystemSettingsBackup()
    if (!hasBackup) {
      try {
        await this.backupSystemSettings()
        managedModeLogger.info('托管模式启动：系统设置已备份（首次启动）')
      } catch (backupError) {
        managedModeLogger.warn('托管模式启动：备份系统设置失败，但继续启动', backupError)
      }
    } else {
      managedModeLogger.info('托管模式启动：检测到已有备份，跳过备份步骤（避免覆盖原始配置）')
    }

    // 集成模式启动代理服务（v1.4.0：移除传统代理 fallback —— 其无鉴权 + CORS 全开是 P0 安全漏洞，
    // 且 4 种子进程启动方式不可靠。集成模式失败直接抛错，不再降级到不安全的传统代理）
    try {
      await this.startIntegratedProxy()
      this.isIntegrated = true
      managedModeLogger.info('代理服务已启动 (集成模式)')

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

      // 重启时覆写settings配置
      await this.applySettingsOnRestart()
    } catch (error) {
      managedModeLogger.error('集成代理启动失败', error)
      throw error
    }
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
      // 集成模式：关闭 Express 服务器（异步操作，需 await 确保 port 释放后再 restart）
      const proxy = this.proxyProcess
      if (proxy && 'close' in proxy) {
        await new Promise<void>((resolve) => {
          // Express http.Server.close(callback) 在所有连接断开后回调
          let resolved = false
          const done = () => { if (!resolved) { resolved = true; resolve() } }
          proxy.close(done)
          // 3s 超时兜底：即使连接未完全断开也放行（防止 restart 卡死）
          setTimeout(done, 3000)
        })
      }
      this.isIntegrated = false
    } else {
      // 传统模式：关闭子进程
      if (this.proxyProcess && 'kill' in this.proxyProcess) {
        this.proxyProcess.kill('SIGTERM')
      }

      // 等待进程退出,最多等待5秒
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.proxyProcess && 'kill' in this.proxyProcess) {
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
    managedModeLogger.info('托管模式服务已停止，启动时间已清除')

    // 停止后还原系统设置（重启操作时跳过还原）
    if (!this.isRestarting) {
      try {
        await this.restoreSystemSettings()
        managedModeLogger.info('托管模式停止：系统设置已还原')
      } catch (restoreError) {
        managedModeLogger.warn('托管模式停止：还原系统设置失败', restoreError)
      }
    } else {
      managedModeLogger.info('重启操作：跳过还原settings，保持托管配置')
    }
  }

  /**
   * 重启时应用settings配置
   * @description 重启操作时覆写settings，但不触发备份
   */
  private async applySettingsOnRestart(): Promise<void> {
    if (!this.isRestarting) {
      // 非重启操作，跳过
      return
    }

    if (!this.config) {
      managedModeLogger.warn('重启操作：配置不存在，跳过覆写settings')
      return
    }

    try {
      // 生成托管模式的配置
      const managedConfigData = {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.config.port || ManagedModeService.DEFAULT_PORT}`,
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

      // 覆写settings配置
      const writeResult = await this.updateSettingsConfig(managedConfigData)
      if (writeResult.success) {
        managedModeLogger.info('重启操作：已覆写settings配置，保持托管模式')
      } else {
        managedModeLogger.error('重启操作：覆写settings配置失败', writeResult.error)
      }
    } catch (error: unknown) {
      managedModeLogger.error('重启操作：应用settings配置失败', error)
    }
  }

  /**
   * 重启代理服务
   * @description 重启时保持托管配置，不触发settings还原和备份
   */
  async restart(): Promise<void> {
    // v1.4.0 互斥：所有 restart 串行化执行。原实现仅用 boolean 标志，连续 UI 操作（保存配置→切换 provider）
    // 会并发触发 stop/start，导致第二次 stop() 错误地把 settings.json 还原成非托管状态。
    const previousChain = this.restartChain
    const currentRestart = previousChain.then(async () => {
      this.isRestarting = true
      try {
        await this.stop()
        await this.start()
      } finally {
        this.isRestarting = false
      }
    })
    // 链本身 catch 吞错，防止单次失败阻断后续 restart；本次 restart 的真实结果通过 currentRestart 返回给调用方
    this.restartChain = currentRestart.catch((error) => {
      managedModeLogger.error('重启链执行失败', error)
    })
    return currentRestart
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
      } else if ('pid' in this.proxyProcess) {
        // 传统模式：使用子进程的PID
        pid = this.proxyProcess.pid
      }
    }

    // 获取当前provider的详细信息
    let currentProviderInfo = undefined
    if (this.config?.currentProvider && this.config?.providers) {
      const provider = this.config.providers.find((p: ApiProvider) => p.id === this.config?.currentProvider)
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
          apiKey: formatApiKey(provider.apiKey)
        }
      }
    }

    const status: ManagedModeStatus = {
      running: this.proxyProcess !== null,
      enabled: this.config?.enabled || false,
      port: this.config?.port || ManagedModeService.DEFAULT_PORT,
      pid,
      currentProvider: this.config?.currentProvider,
      currentProviderInfo,
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
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${this.config.port || ManagedModeService.DEFAULT_PORT}`,
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
        managedModeLogger.error('写入托管配置到 settings.json 失败', writeResult.error)
        // 不抛出错误，因为服务已经启动了
      }

      managedModeLogger.info('托管模式已启用，配置已写入 settings.json')

      return { success: true, message: '托管模式已启用' }
    } catch (error: unknown) {
      managedModeLogger.error('启用托管模式失败', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 禁用托管模式
   * @description 停止代理服务并禁用托管模式配置
   */
  async disableManagedMode(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // 停止代理服务（运行时 stop 内部会还原系统设置并删除最新备份）
      const wasRunning = !!this.proxyProcess
      if (this.proxyProcess) {
        await this.stop()
      }

      // 仅在服务未运行（stop 未触发还原）时才还原，避免二次还原到更旧备份
      // （v1.4.0 修复：原实现无论是否运行都 restore，导致运行时禁用会还原到倒数第二个备份）
      if (!wasRunning) {
        try {
          await this.restoreSystemSettings()
          managedModeLogger.info('托管模式禁用：系统设置已还原')
        } catch (restoreError) {
          managedModeLogger.warn('托管模式禁用：还原系统设置失败', restoreError)
          // 还原失败不应该阻止禁用操作
        }
      }

      await this.loadConfig()

      if (!this.config) {
        throw new Error('配置文件不存在')
      }

      // 禁用配置
      this.config.enabled = false
      await this.saveConfig(this.config)

      return { success: true, message: '托管模式已禁用' }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
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
    return this.buildRendererSafeConfig()
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
    const provider = this.config.providers.find((p: ApiProvider) => p.id === providerId)
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
    if (this.config.providers.some((p: ApiProvider) => p.id === provider.id)) {
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
    const index = this.config.providers.findIndex((p: ApiProvider) => p.id === provider.id)
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

        managedModeLogger.info(`系统设置已备份到: ${backupPath}`)
        return backupPath
      } catch (error) {
        managedModeLogger.warn(`原始系统设置文件不存在: ${userSettingsPath}`)
        throw new Error('系统设置文件不存在，无法备份')
      }
    } catch (error: unknown) {
      managedModeLogger.error('备份系统设置失败', error)
      throw new Error(`备份系统设置失败: ${error instanceof Error ? error.message : String(error)}`)
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
        managedModeLogger.warn('未找到系统设置备份文件')
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

      managedModeLogger.info(`系统设置已从备份还原: ${userSettingsPath}`)
      managedModeLogger.info(`已删除备份文件: ${backupPath}`)
    } catch (error: unknown) {
      managedModeLogger.error('还原系统设置失败', error)
      throw new Error(`还原系统设置失败: ${error instanceof Error ? error.message : String(error)}`)
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
    // v1.4.0 架构解耦：委托 ConfigStore
    return this.configStore.generateAccessToken()
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
    this.config.providers = this.config.providers.filter((p: ApiProvider) => p.id !== providerId)

    // 保存配置
    await this.saveConfig(this.config)
  }

  /**
   * 获取环境变量设置命令
   */
  getEnvCommand(): EnvCommand[] {
    const port = this.config?.port || ManagedModeService.DEFAULT_PORT
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
      const managedConfig = this.config

      const configDir = pathManager.claudeConfigsDir

      // 检查目录是否存在
      try {
        await fs.access(configDir)
      } catch {
        managedModeLogger.info('配置目录不存在，跳过 providers 同步')
        return
      }

      // 读取配置目录中的所有文件
      const files = await fs.readdir(configDir)
      const configFiles = files.filter(file => file.endsWith('.json') && file !== 'settings.json')

      const newProviders: ApiProvider[] = []
      const currentProviderId = managedConfig.currentProvider

      for (const file of configFiles) {
        try {
          const configPath = path.join(configDir, file)
          const content = await fs.readFile(configPath, 'utf-8')
          const rawConfig = JSON.parse(content) as Record<string, unknown>

          // 支持两种配置格式：
          // 1. 标准格式：config.env.ANTHROPIC_BASE_URL
          // 2. 扁平格式：config.ANTHROPIC_BASE_URL
          let baseUrl: string | undefined
          let authToken: string | undefined

          const envBlock = rawConfig.env as Record<string, unknown> | undefined
          if (
            envBlock &&
            typeof envBlock.ANTHROPIC_BASE_URL === 'string' &&
            typeof envBlock.ANTHROPIC_AUTH_TOKEN === 'string'
          ) {
            // 标准格式
            baseUrl = envBlock.ANTHROPIC_BASE_URL
            authToken = envBlock.ANTHROPIC_AUTH_TOKEN
          } else if (
            typeof rawConfig.ANTHROPIC_BASE_URL === 'string' &&
            typeof rawConfig.ANTHROPIC_AUTH_TOKEN === 'string'
          ) {
            // 扁平格式
            baseUrl = rawConfig.ANTHROPIC_BASE_URL
            authToken = rawConfig.ANTHROPIC_AUTH_TOKEN
          }

          // 只处理有效的 claude-code 配置
          if (baseUrl && authToken) {
            const configName = path.basename(file, '.json')

            // 读取.meta文件获取显示名称
            let displayName = configName // 默认使用文件名
            try {
              const metaPath = path.join(configDir, `${file}.meta`)
              const metaContent = await fs.readFile(metaPath, 'utf-8')
              const metaData = JSON.parse(metaContent) as Record<string, unknown>
              if (typeof metaData.name === 'string') {
                displayName = metaData.name
                managedModeLogger.debug(`从元数据文件读取到配置显示名称: ${displayName} (文件名: ${configName})`)
              }
            } catch (metaError) {
              // .meta文件不存在或读取失败，使用文件名作为fallback
              managedModeLogger.debug(`未找到或无法读取元数据文件 ${file}.meta，使用文件名作为显示名称`)
            }

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
              name: displayName, // 使用从.meta文件读取的显示名称
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
            if (currentProviderId && !newProviders.find((p: ApiProvider) => p.id === currentProviderId)) {
              managedConfig.currentProvider = ''
            }
          }
        } catch (error) {
          managedModeLogger.error(`处理配置文件 ${file} 失败`, error)
        }
      }

      // 覆盖 providers
      managedConfig.providers = newProviders

      // 如果 currentProvider 不在新的 providers 列表中，清空它
      if (managedConfig.currentProvider && !newProviders.find((p: ApiProvider) => p.id === managedConfig.currentProvider)) {
        managedModeLogger.info(`当前 provider ${managedConfig.currentProvider} 不在新的 providers 列表中，已清空`)
        managedConfig.currentProvider = ''
      }

      // 保存配置
      await this.saveConfig(managedConfig)

      managedModeLogger.info(`已从配置列表同步 ${newProviders.length} 个 providers`)
    } catch (error: unknown) {
      managedModeLogger.error('同步 providers 失败', error)
    }
  }

  /**
   * 手动同步providers（供前端调用）
   * @description 重新扫描配置目录并同步providers列表，供前端动态刷新配置列表使用
   */
  async syncProviders(): Promise<void> {
    // 重新加载配置，确保使用最新的配置状态
    await this.loadConfig()
    await this.syncProvidersFromConfigList()
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    // v1.4.0 架构解耦：委托 ConfigStore 处理读取 / 默认值创建 / accessToken 补全
    this.config = await this.configStore.load()
  }

  /**
   * 保存配置
   */
  private async saveConfig(config: ManagedModeConfig): Promise<void> {
    // v1.4.0 架构解耦：委托 ConfigStore 原子写入（temp + rename，避免写入中断损坏）
    await this.configStore.save(config)

    // 更新内存中的配置
    this.config = config
  }

  /**
   * 更新系统settings.json配置
   * @description 将托管模式配置写入到~/.claude/settings.json文件
   * @note 完全替换托管控制的字段，不做合并，避免残留旧配置
   */
  async updateSettingsConfig(configData: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    try {
      const userSettingsPath = path.join(os.homedir(), '.claude', 'settings.json')

      // 确保目录存在
      const claudeDir = path.dirname(userSettingsPath)
      await fs.mkdir(claudeDir, { recursive: true })

      // 读取现有配置（如果存在）
      let existingConfig: Record<string, unknown> = {}
      try {
        const existingContent = await fs.readFile(userSettingsPath, 'utf8')
        existingConfig = JSON.parse(existingContent) as Record<string, unknown>
      } catch (error) {
        // 文件不存在或读取失败，使用空配置
        managedModeLogger.info('系统settings文件不存在，将创建新文件')
      }

      // 完全替换模式：移除托管控制的字段，然后添加新的托管配置
      // 托管控制的字段：env, permissions, statusLine, 以及其他在 configData 中的字段
      const managedKeys = new Set(['env', 'permissions', 'statusLine', ...Object.keys(configData)])

      // 保留非托管控制的字段
      const preservedConfig: Record<string, unknown> = {}
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

      managedModeLogger.info(`托管模式配置已写入系统settings: ${userSettingsPath}`)
      managedModeLogger.debug('写入的配置', finalConfig)

      // 发送配置更新事件，通知前端状态变化
      this.emit('config-updated', {
        timestamp: Date.now(),
        configPath: userSettingsPath
      })

      return { success: true }
    } catch (error: unknown) {
      managedModeLogger.error('写入系统settings配置失败', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
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
   * 生成渲染进程可见的安全配置副本
   * @description 默认对 provider apiKey 与 accessToken 做脱敏，减少普通状态接口暴露敏感字段
   */
  private buildRendererSafeConfig(
    options?: {
      includeAccessToken?: boolean
      includeProviderSecrets?: boolean
    }
  ): ManagedModeConfig | null {
    if (!this.config) {
      return null
    }

    const includeAccessToken = options?.includeAccessToken || false
    const includeProviderSecrets = options?.includeProviderSecrets || false
    const accessToken = includeAccessToken ? this.config.accessToken : ''
    const configData = this.config.configData
      ? {
          ...this.config.configData,
          env: {
            ...((this.config.configData as Record<string, unknown>).env || {}) as Record<string, unknown>,
            ANTHROPIC_AUTH_TOKEN: accessToken
          }
        }
      : this.config.configData

    return {
      ...this.config,
      accessToken,
      providers: this.config.providers.map((provider) => ({
        ...provider,
        apiKey: includeProviderSecrets ? provider.apiKey : this.maskSecret(provider.apiKey)
      })),
      configData
    }
  }

  /**
   * 对敏感字符串做固定格式脱敏
   * @description 保留首尾少量字符用于识别，同时避免在普通状态接口中暴露完整 secret
   */
  private maskSecret(secret: string): string {
    if (!secret) {
      return ''
    }

    if (secret.length <= 6) {
      return '*'.repeat(secret.length)
    }

    return `${secret.slice(0, 3)}***${secret.slice(-3)}`
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

    managedModeLogger.info(`启动智能健康检查，初始间隔: ${this.HEALTH_CHECK_LEVELS[0].label}`)

    // 执行第一次检查并启动循环
    this.performHealthCheck()
  }

  /**
   * 执行单次健康检查
   * @description 执行检查后根据结果调整间隔并重新调度
   */
  private performHealthCheck(): void {
    const port = this.config?.port || ManagedModeService.DEFAULT_PORT

    managedModeLogger.debug(`开始执行健康检查，端口: ${port}`)

    axios.get(`http://127.0.0.1:${port}/health`, {
      timeout: 3000
    })
    .then(response => {
      managedModeLogger.debug('健康检查成功，准备调度下次检查')
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

        managedModeLogger.info(`服务稳定，升级到级别${this.healthCheckLevel}，间隔调整为: ${newLevel.label}`)
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
      managedModeLogger.error('健康检查失败，服务可能已停止', error)

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

      // 服务异常，清理进程引用（集成模式用 close，传统模式用 kill）
      if (this.proxyProcess) {
        if ('close' in this.proxyProcess) {
          // 集成模式：关闭 Express 服务器
          this.proxyProcess.close()
        } else if ('kill' in this.proxyProcess) {
          // 传统模式（已移除但保留兼容）：强制终止子进程
          this.proxyProcess.kill('SIGKILL')
        }
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

    managedModeLogger.debug(`调度下次检查，间隔: ${currentInterval}ms (${currentLabel})`)

    // 使用当前间隔调度下次检查
    this.healthCheckInterval = setTimeout(() => {
      managedModeLogger.debug('健康检查定时器触发，执行下次检查')
      this.performHealthCheck()
    }, currentInterval)

    managedModeLogger.debug('健康检查定时器已设置')
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

    managedModeLogger.warn(`健康检查失败，重置到初始级别 (${oldInterval} → ${this.HEALTH_CHECK_LEVELS[0].label})`)

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
   * 截断日志中的上游响应 content，避免完整响应内容广播到所有渲染窗口
   * @description 安全加固：日志事件会被多个窗口接收，完整上游响应（含生成内容）
   *              不应原样广播，仅保留前若干项并截断文本长度。
   */
  private truncateContentForLog(content: unknown): unknown {
    if (!Array.isArray(content)) {
      return content
    }
    const MAX_ITEMS = 2
    const MAX_TEXT_LENGTH = 200
    return content.slice(0, MAX_ITEMS).map((item: unknown) => {
      if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
        const text = (item as { text: string }).text
        return {
          ...item as Record<string, unknown>,
          text: text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}...[已截断]` : text
        }
      }
      return item
    })
  }

  /**
   * 集成模式启动代理服务（在主进程中运行）
   */
  private async startIntegratedProxy(): Promise<void> {
    // 动态导入 express 和 https-proxy-agent
    // 注：不启用 CORS —— 托管代理仅服务本机 Claude CLI，CLI 不走浏览器 CORS；
    // 全开 CORS 反而会让本机恶意网页在 token 泄露后能直接调用上游 API（安全收紧）。
    const express = await import('express')
    const { HttpsProxyAgent } = await import('https-proxy-agent')

    const expressApp = express.default()
    expressApp.use(express.default.json({ limit: '50mb' }))

    const port = this.config?.port || ManagedModeService.DEFAULT_PORT

    // 中间件：验证访问令牌
    const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization || (req.headers['x-api-key'] as string | undefined)
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
    expressApp.get('/health', (_req: Request, res: Response) => {
      const currentProvider = this.config?.providers.find(
        (p: ApiProvider) => p.id === this.config?.currentProvider
      )
      res.json({
        status: 'ok',
        version: app.getVersion(),
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
    expressApp.post('/v1/messages', authMiddleware, async (req: Request, res: Response) => {
      const requestTime = new Date().toISOString()
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
      const requestBody = (req.body ?? {}) as MessagesRequestBody
      const isStreamRequest = requestBody.stream === true
      let axiosConfig: AxiosRequestConfig | undefined // 在外部声明，以便在catch块中使用

      try {
        // 获取当前服务提供商配置
        const currentProvider = this.config?.providers.find(
          (p: ApiProvider) => p.id === this.config?.currentProvider
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
        forwardedHeaders['anthropic-version'] = (Array.isArray(req.headers['anthropic-version']) ? req.headers['anthropic-version'][0] : req.headers['anthropic-version']) || '2023-06-01'
        forwardedHeaders['x-api-key'] = currentProvider.apiKey  // 替换为上游API密钥

        // 构建axios配置
        axiosConfig = {
          method: 'POST',
          url: `${currentProvider.apiBaseUrl}/v1/messages`,
          headers: forwardedHeaders,
          data: req.body,
          timeout: 120000 // 2分钟超时
        } as AxiosRequestConfig

        // 如果是流式请求，设置responseType为stream
        if (isStreamRequest) {
          axiosConfig.responseType = 'stream'
        }

        // 如果启用了网络代理
        if (this.config?.networkProxy?.enabled) {
          const proxyUrl = `http://${this.config.networkProxy.host}:${this.config.networkProxy.port}`
          axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl)
          managedModeLogger.info(`使用网络代理: ${proxyUrl}`)
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
            model: requestBody.model,
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
                model: requestBody.model,
                max_tokens: requestBody.max_tokens,
                stream: requestBody.stream,
                messages: requestBody.messages?.length
                  ? `${requestBody.messages.length} message(s)`
                  : undefined
              }
            }
          }
          this.emit('log', requestLog)
          managedModeLogger.debug('[托管代理] 转发请求到上游', {
            provider: currentProvider.name,
            url: axiosConfig.url,
            model: requestBody.model,
            stream: isStreamRequest,
            forwardedHeadersCount: Object.keys(forwardedHeaders).length
          })
        }

        // 转发请求到上游 API
        if (!axiosConfig) {
          throw new Error('请求配置未初始化，无法转发到上游 API')
        }
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
          response.data.on('error', (error: unknown) => {
            managedModeLogger.error('[托管代理] 上游流错误', error)
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
                  url: axiosConfig?.url,
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
              managedModeLogger.debug('[托管代理] 流式响应完成')
            }
          })

          return
        }

        // 处理非流式响应
        if (this.config?.logging?.enabled) {
          const endTime = Date.now()
          const duration = endTime - new Date(requestTime).getTime()
          const responseData = response.data as UpstreamResponseData
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
                id: responseData.id,
                type: responseData.type,
                role: responseData.role,
                model: responseData.model,
                usage: responseData.usage,
                content: this.truncateContentForLog(responseData.content)  // 截断后广播，避免完整上游响应扩散
              } : undefined
            }
          }
          this.emit('log', responseLog)
          managedModeLogger.debug('[托管代理] 收到上游响应', {
            status: response.status,
            hasContent: !!response.data
          })
        }

        // 返回上游响应
        res.status(response.status).json(response.data)

      } catch (error: unknown) {
        managedModeLogger.error('[托管代理] 请求失败', error)

        // 统一提取错误信息，避免在 catch 中直接访问 any 字段
        const errorMessage = error instanceof Error ? error.message : '请求失败'
        const axiosError = error as { response?: { status?: number; data?: { error?: { type?: string } }; headers?: Record<string, string> }; code?: string; isAxiosError?: boolean }
        const statusCode = axiosError?.response?.status || 500
        const errorCode = axiosError?.code || 'unknown'
        const errorResponseType = axiosError?.response?.data?.error?.type || 'unknown_error'
        const errorResponseHeaders = axiosError?.response?.headers
        const errorResponseData = axiosError?.response?.data

        // 记录错误日志
        const endTime = Date.now()
        const duration = endTime - new Date(requestTime).getTime()
        const errorLog = {
          id: requestId,
          timestamp: new Date().toISOString(),
          type: 'error' as const,
          message: errorMessage,
          statusCode,
          errorType: errorCode,
          data: {
            method: 'POST',
            url: axiosConfig?.url || '/v1/messages',
            statusCode,
            duration,
            error: errorMessage,
            errorCode,
            errorType: errorResponseType,
            headers: errorResponseHeaders ? {
              'content-type': errorResponseHeaders['content-type']
            } : undefined,
            // 包含上游API返回的完整错误响应体
            body: errorResponseData ?? null
          }
        }
        this.emit('log', errorLog)

        // 处理axios错误
        if (axiosError?.response) {
          // 上游API返回错误
          const errorStatus = axiosError.response.status ?? 500
          if (axiosError.response.data && typeof axiosError.response.data === 'object' && !Buffer.isBuffer(axiosError.response.data)) {
            return res.status(errorStatus).json(axiosError.response.data)
          } else {
            // 流式错误响应
            return res.status(errorStatus).send(axiosError.response.data)
          }
        } else if (errorCode === 'ECONNABORTED') {
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
              message: `代理服务内部错误: ${errorMessage}`
            }
          })
        }
      }
    })

    // 启动服务器
    return new Promise((resolve, reject) => {
      const server = expressApp.listen(port, '127.0.0.1', () => {
        managedModeLogger.info(`集成代理服务已启动: http://127.0.0.1:${port}`)
        managedModeLogger.info(`当前服务提供商: ${this.config?.currentProvider || 'None'}`)
        // 将 server 引用存储到 proxyProcess 中，以便后续管理
        // Express http.Server 的 close 接口签名与 ProxyProcessLike 集成形态相符
        this.proxyProcess = server as unknown as ProxyProcessLike
        resolve()
      })

      server.on('error', (error: NodeJS.ErrnoException) => {
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
