/**
 * 终端管理服务类
 *
 * 功能:
 * - 管理终端配置
 * - 提供使用指定终端执行命令的方法
 * - 为环境检查提供终端执行能力
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { logger } from '../utils/logger'
import type { TerminalConfig, TerminalSettings, TerminalExecutionConfig, TerminalType } from '@shared/types/terminal'

const execAsync = promisify(exec)

/**
 * 终端管理服务类
 */
class TerminalManagementService {
  private settingsPath: string
  private settings: TerminalSettings

  constructor() {
    this.settingsPath = path.join(app.getPath('userData'), 'terminal-settings.json')
    this.settings = {
      defaultTerminal: 'auto' as TerminalType,
      terminals: this.getDefaultTerminals(),
      executionConfigs: []
    }
  }

  /**
   * 获取默认终端配置列表
   */
  private getDefaultTerminals(): TerminalConfig[] {
    const platform = process.platform

    return [
      {
        type: 'auto' as TerminalType,
        name: '自动检测',
        isDefault: true
      },
      ...(platform === 'win32' ? [
        {
          type: 'git-bash' as TerminalType,
          name: 'Git Bash',
          path: this.findGitBashPath(),
          isDefault: false
        },
        {
          type: 'powershell' as TerminalType,
          name: 'PowerShell',
          path: 'powershell.exe',
          isDefault: false
        },
        {
          type: 'cmd' as TerminalType,
          name: 'CMD',
          path: 'cmd.exe',
          isDefault: false
        },
        {
          type: 'wsl' as TerminalType,
          name: 'WSL',
          path: 'wsl.exe',
          args: ['--distribution', 'Ubuntu'],
          isDefault: false
        }
      ] : []),
      ...(platform === 'darwin' || platform === 'linux' ? [
        {
          type: 'git-bash' as TerminalType,
          name: 'Git Bash',
          path: '/usr/local/bin/bash',
          isDefault: false
        },
        {
          type: 'powershell' as TerminalType,
          name: 'PowerShell',
          path: '/usr/local/bin/pwsh',
          isDefault: false
        }
      ] : [])
    ]
  }

  /**
   * 查找Git Bash路径
   */
  private findGitBashPath(): string {
    const commonPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      path.join(os.homedir(), 'AppData\\Local\\Programs\\Git\\bin\\bash.exe'),
      path.join(os.homedir(), 'scoop\\shims\\bash.exe')
    ]

    return commonPaths[0] || 'bash.exe'
  }

  /**
   * 加载终端设置
   */
  public async loadSettings(): Promise<TerminalSettings> {
    try {
      const content = await fs.readFile(this.settingsPath, 'utf-8')
      this.settings = this.normalizeSettings(JSON.parse(content))
      logger.info('终端设置加载成功')
    } catch (error) {
      logger.warn('加载终端设置失败，使用默认设置:', error)
      this.settings = this.normalizeSettings(this.settings)
      await this.saveSettings()
    }

    return this.settings
  }

  /**
   * 标准化终端设置，确保默认终端与列表一致
   */
  private normalizeSettings(settings: TerminalSettings): TerminalSettings {
    const normalized: TerminalSettings = {
      ...settings,
      terminals: Array.isArray(settings.terminals) && settings.terminals.length > 0
        ? settings.terminals
        : this.getDefaultTerminals(),
      executionConfigs: Array.isArray(settings.executionConfigs) ? settings.executionConfigs : []
    }

    if (!normalized.terminals.find(t => t.type === 'auto')) {
      normalized.terminals.unshift({
        type: 'auto' as TerminalType,
        name: '自动检测',
        isDefault: false
      })
    }

    let defaultTerminal = normalized.defaultTerminal
    if (!defaultTerminal || !normalized.terminals.some(t => t.type === defaultTerminal)) {
      defaultTerminal = normalized.terminals.find(t => t.isDefault)?.type || 'auto' as TerminalType
    }

    normalized.defaultTerminal = defaultTerminal
    normalized.terminals = normalized.terminals.map(t => ({
      ...t,
      isDefault: t.type === defaultTerminal
    }))

    return normalized
  }

  /**
   * 保存终端设置
   */
  public async saveSettings(): Promise<void> {
    try {
      const content = JSON.stringify(this.settings, null, 2)
      await fs.writeFile(this.settingsPath, content, 'utf-8')
      logger.info('终端设置保存成功')
    } catch (error) {
      logger.error('保存终端设置失败:', error)
      throw error
    }
  }

  /**
   * 获取所有终端配置
   */
  public async getTerminals(): Promise<TerminalConfig[]> {
    await this.loadSettings()
    return this.settings.terminals
  }

  /**
   * 获取默认终端类型
   */
  public async getDefaultTerminalType(): Promise<TerminalType> {
    await this.loadSettings()
    return this.settings.defaultTerminal
  }

  /**
   * 获取指定终端配置
   */
  public async getTerminalConfig(type: TerminalType): Promise<TerminalConfig | null> {
    await this.loadSettings()
    return this.settings.terminals.find(t => t.type === type) || null
  }

  /**
   * 添加或更新终端配置
   */
  public async upsertTerminal(config: TerminalConfig): Promise<void> {
    await this.loadSettings()

    const existingIndex = this.settings.terminals.findIndex(t => t.type === config.type)

    if (config.isDefault) {
      this.settings.defaultTerminal = config.type
      this.settings.terminals.forEach(t => {
        if (t.type !== config.type) {
          t.isDefault = false
        }
      })
    }

    if (existingIndex >= 0) {
      this.settings.terminals[existingIndex] = {
        ...config,
        isDefault: config.type === this.settings.defaultTerminal
      }
    } else {
      this.settings.terminals.push({
        ...config,
        isDefault: config.type === this.settings.defaultTerminal
      })
    }

    await this.saveSettings()
    logger.info(`终端配置已保存: ${config.name}, 默认终端: ${this.settings.defaultTerminal}`)
  }

  /**
   * 删除终端配置
   */
  public async deleteTerminal(type: TerminalType): Promise<void> {
    await this.loadSettings()

    this.settings.terminals = this.settings.terminals.filter(t => t.type !== type)

    if (this.settings.defaultTerminal === type) {
      this.settings.defaultTerminal = 'auto' as TerminalType
    }

    this.settings.terminals = this.settings.terminals.map(t => ({
      ...t,
      isDefault: t.type === this.settings.defaultTerminal
    }))

    await this.saveSettings()
  }

  /**
   * 设置默认终端
   */
  public async setDefaultTerminal(type: TerminalType): Promise<void> {
    await this.loadSettings()

    this.settings.defaultTerminal = type

    this.settings.terminals.forEach(t => {
      t.isDefault = (t.type === type)
    })

    await this.saveSettings()
    logger.info(`默认终端已设置为: ${type}`)
  }

  /**
   * 获取终端执行配置
   */
  public async getExecutionConfigs(): Promise<TerminalExecutionConfig[]> {
    await this.loadSettings()
    return this.settings.executionConfigs
  }

  /**
   * 为环境检查设置执行配置
   */
  public async setExecutionConfig(
    checkId: string,
    config: Omit<TerminalExecutionConfig, 'id'>
  ): Promise<void> {
    await this.loadSettings()

    const existingIndex = this.settings.executionConfigs.findIndex(c => c.id === checkId)

    const executionConfig: TerminalExecutionConfig = {
      ...config,
      id: checkId
    }

    if (existingIndex >= 0) {
      this.settings.executionConfigs[existingIndex] = executionConfig
    } else {
      this.settings.executionConfigs.push(executionConfig)
    }

    await this.saveSettings()
  }

  /**
   * 使用指定终端执行命令
   */
  public async executeCommand(
    command: string,
    options?: {
      terminalType?: TerminalType
      workingDirectory?: string
      timeout?: number
    }
  ): Promise<{ stdout: string; stderr: string; error?: Error }> {
    try {
      await this.loadSettings()
      const terminalType = options?.terminalType || this.settings.defaultTerminal
      const terminalConfig = this.settings.terminals.find(t => t.type === terminalType)
      const workingDirectory = options?.workingDirectory || terminalConfig?.initialDirectory

      if (!terminalConfig && terminalType !== 'auto') {
        throw new Error(`未找到终端配置: ${terminalType}`)
      }

      let execCommand = command
      const execOptions: any = {
        cwd: workingDirectory,
        timeout: options?.timeout || 10000,
        windowsHide: true,
        encoding: 'utf8'
      }

      if (terminalType === 'git-bash') {
        if (process.platform === 'win32') {
          const bashPath = terminalConfig?.path || this.findGitBashPath()
          const bashCwd = workingDirectory ? this.toGitBashPath(workingDirectory) : null
          const safeCwd = bashCwd ? bashCwd.replace(/'/g, "'\\''") : null
          const cdPrefix = safeCwd ? `cd '${safeCwd}' && ` : ''
          execCommand = `"${bashPath}" -ic "${cdPrefix}${command.replace(/"/g, '\\"')}"`
        } else {
          const safeCwd = workingDirectory ? workingDirectory.replace(/'/g, "'\\''") : null
          const cdPrefix = safeCwd ? `cd '${safeCwd}' && ` : ''
          const initPrefix = 'if [ -f ~/.bashrc ]; then source ~/.bashrc; fi; '
          execCommand = `/bin/bash -c "${initPrefix}${cdPrefix}${command.replace(/"/g, '\\"')}"`
        }
      } else if (terminalType === 'powershell') {
        if (process.platform === 'win32') {
          const cdPrefix = workingDirectory
            ? `Set-Location -LiteralPath '${workingDirectory.replace(/'/g, "''")}'; `
            : ''
          execCommand = `powershell -NoProfile -Command "${cdPrefix}${command.replace(/"/g, '\\"')}"`
        } else {
          const cdPrefix = workingDirectory
            ? `Set-Location -LiteralPath '${workingDirectory.replace(/'/g, "''")}'; `
            : ''
          execCommand = `pwsh -NoProfile -Command "${cdPrefix}${command.replace(/"/g, '\\"')}"`
        }
      } else if (terminalType === 'wsl' && process.platform === 'win32') {
        const wslCwd = workingDirectory ? `--cd "${workingDirectory.replace(/"/g, '\\"')}" ` : ''
        const initPrefix = 'source ~/.bashrc >/dev/null 2>&1; '
        execCommand = `wsl.exe ${terminalConfig?.args?.join(' ') || ''} ${wslCwd}-- bash -lc "${initPrefix}${command.replace(/"/g, '\\"')}"`
      } else if (terminalType === 'cmd') {
        const cdPrefix = workingDirectory ? `cd /d "${workingDirectory.replace(/"/g, '\\"')}" && ` : ''
        execCommand = `cmd /c "${cdPrefix}${command.replace(/"/g, '\\"')}"`
      } else if (terminalConfig?.path) {
        const args = terminalConfig.args?.join(' ') || ''
        execCommand = `"${terminalConfig.path}" ${args} "${command.replace(/"/g, '\\"')}"`
      }

      logger.info(`执行命令 [${terminalType}]: ${command}`)

      const result = await execAsync(execCommand, execOptions)
      const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf8')
      const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr.toString('utf8')

      return {
        stdout,
        stderr
      }
    } catch (error: any) {
      logger.error('命令执行失败:', error)

      return {
        stdout: '',
        stderr: error.stderr || '',
        error: error
      }
    }
  }

  /**
   * 为环境检查获取执行配置
   */
  public getExecutionConfigForCheck(checkId: string): TerminalExecutionConfig | null {
    const config = this.settings.executionConfigs.find(c => c.id === checkId)

    if (config) {
      return config
    }

    return {
      id: 'default',
      name: '默认',
      terminalType: this.settings.defaultTerminal,
      isDefault: true
    }
  }

  /**
   * 将Windows路径转换为Git Bash路径
   */
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
}

export const terminalManagementService = new TerminalManagementService()
