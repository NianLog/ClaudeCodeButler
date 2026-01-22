/**
 * 权限管理器
 * 负责检测和提升应用权限
 */

import { app, dialog } from 'electron'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { logger } from './logger'

/**
 * 权限级别枚举
 */
export enum PrivilegeLevel {
  USER = 'user',
  ADMINISTRATOR = 'administrator',
  UNKNOWN = 'unknown'
}

/**
 * 权限检查结果
 */
export interface PrivilegeCheckResult {
  isRunningAsAdmin: boolean
  privilegeLevel: PrivilegeLevel
  needsElevation: boolean
  canAccessSystemFiles: boolean
  canAccessSystemNotifications: boolean
}

/**
 * 权限提升选项
 */
export interface ElevationOptions {
  forceElevation?: boolean
  elevationMethod?: 'relaunch' | 'prompt'
  showWarning?: boolean
  retryOnFailure?: boolean
}

/**
 * 权限管理器类
 */
export class PrivilegeManager {
  private static instance: PrivilegeManager
  private isElevated: boolean = false
  private elevationAttempts: number = 0
  private readonly maxElevationAttempts: number = 3
  private privilegeStateFile: string
  private lastElevationTime: number = 0

  private constructor() {
    this.privilegeStateFile = join(app.getPath('userData'), 'privilege-state.json')
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): PrivilegeManager {
    if (!PrivilegeManager.instance) {
      PrivilegeManager.instance = new PrivilegeManager()
    }
    return PrivilegeManager.instance
  }

  /**
   * 检查当前权限状态
   */
  public async checkPrivileges(): Promise<PrivilegeCheckResult> {
    try {
      // 首先检查持久化的权限状态
      await this.loadPrivilegeState()

      const isWindows = process.platform === 'win32'
      const isMacOS = process.platform === 'darwin'
      const isLinux = process.platform === 'linux'

      let isRunningAsAdmin = false
      let canAccessSystemFiles = false
      let canAccessSystemNotifications = false

      // 检查是否在最近10分钟内提升过权限（增加缓存时间）
      const recentlyElevated = (Date.now() - this.lastElevationTime) < 10 * 60 * 1000
      if (recentlyElevated && this.isElevated) {
        logger.info('使用缓存的权限状态: 已提升权限')
        return {
          isRunningAsAdmin: true,
          privilegeLevel: PrivilegeLevel.ADMINISTRATOR,
          needsElevation: false,
          canAccessSystemFiles: true,
          canAccessSystemNotifications: true
        }
      }

      // 执行实际的权限检测
      if (isWindows) {
        isRunningAsAdmin = await this.checkWindowsAdminPrivileges()
        // 如果检测到管理员权限，进行额外的验证
        if (isRunningAsAdmin) {
          canAccessSystemFiles = await this.validateSystemFileAccess()
          canAccessSystemNotifications = true // Windows 管理员通常有通知权限
        }
      }
      // macOS 系统权限检查
      else if (isMacOS) {
        isRunningAsAdmin = await this.checkMacOSAdminPrivileges()
        canAccessSystemFiles = isRunningAsAdmin
        canAccessSystemNotifications = true // macOS 通常允许通知
      }
      // Linux 系统权限检查
      else if (isLinux) {
        isRunningAsAdmin = await this.checkLinuxAdminPrivileges()
        canAccessSystemFiles = isRunningAsAdmin
        canAccessSystemNotifications = true
      }

      const privilegeLevel = isRunningAsAdmin
        ? PrivilegeLevel.ADMINISTRATOR
        : PrivilegeLevel.USER

      const needsElevation = this.calculateNeedsElevation(
        canAccessSystemFiles,
        canAccessSystemNotifications
      )

      // 如果检测到管理员权限，更新内部状态
      if (isRunningAsAdmin && !this.isElevated) {
        this.isElevated = true
        this.lastElevationTime = Date.now()
        await this.savePrivilegeState()
        logger.info('检测到新的管理员权限，已更新状态')
      }

      logger.info(`权限检查完成: 级别=${privilegeLevel}, 管理员=${isRunningAsAdmin}, 需要提升=${needsElevation}, 文件访问=${canAccessSystemFiles}`)

      return {
        isRunningAsAdmin,
        privilegeLevel,
        needsElevation,
        canAccessSystemFiles,
        canAccessSystemNotifications
      }
    } catch (error) {
      logger.error('权限检查失败:', error)
      return {
        isRunningAsAdmin: false,
        privilegeLevel: PrivilegeLevel.UNKNOWN,
        needsElevation: true,
        canAccessSystemFiles: false,
        canAccessSystemNotifications: false
      }
    }
  }

  /**
   * 验证系统文件访问权限
   */
  private async validateSystemFileAccess(): Promise<boolean> {
    return new Promise((resolve) => {
      const fs = require('fs')
      const path = require('path')

      // 尝试访问多个系统关键位置来验证权限
      const testPaths = [
        path.join(process.env.WINDIR || 'C:\\Windows', 'System32'),
        path.join(process.env.WINDIR || 'C:\\Windows', 'System32\\config'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Common Files')
      ]

      let successCount = 0
      for (const testPath of testPaths) {
        try {
          fs.accessSync(testPath, fs.constants.R_OK)
          successCount++
        } catch (error) {
          logger.debug(`无法访问: ${testPath}`)
        }
      }

      // 如果可以访问大部分系统目录，认为有管理员权限
      const hasAccess = successCount >= Math.ceil(testPaths.length * 0.75)
      logger.debug(`系统文件访问验证: ${successCount}/${testPaths.length} 成功`)
      resolve(hasAccess)
    })
  }

  /**
   * 加载权限状态
   */
  private async loadPrivilegeState(): Promise<void> {
    try {
      const data = await fs.readFile(this.privilegeStateFile, 'utf8')
      const state = JSON.parse(data)
      this.isElevated = state.isElevated || false
      this.lastElevationTime = state.lastElevationTime || 0
      this.elevationAttempts = state.elevationAttempts || 0
    } catch (error) {
      // 文件不存在或读取失败，使用默认值
      logger.debug('权限状态文件不存在，使用默认状态')
    }
  }

  /**
   * 保存权限状态
   */
  private async savePrivilegeState(): Promise<void> {
    try {
      const state = {
        isElevated: this.isElevated,
        lastElevationTime: this.lastElevationTime,
        elevationAttempts: this.elevationAttempts
      }
      await fs.writeFile(this.privilegeStateFile, JSON.stringify(state, null, 2))
      logger.debug('权限状态已保存')
    } catch (error) {
      logger.error('保存权限状态失败:', error)
    }
  }

  /**
   * 尝试提升权限
   */
  public async elevatePrivileges(options: ElevationOptions = {}): Promise<boolean> {
    const {
      forceElevation = false,
      elevationMethod = 'relaunch',
      showWarning = true,
      retryOnFailure = true
    } = options

    try {
      // 加载最新状态
      await this.loadPrivilegeState()

      // 检查是否已经是管理员权限或最近提升过
      const privilegeCheck = await this.checkPrivileges()
      if (privilegeCheck.isRunningAsAdmin && !forceElevation) {
        logger.info('已拥有管理员权限，无需提升')
        this.isElevated = true
        await this.savePrivilegeState()
        return true
      }

      // 检查是否在短时间内重复提升
      const recentlyElevated = (Date.now() - this.lastElevationTime) < 30 * 1000 // 30秒内
      if (recentlyElevated && this.elevationAttempts > 0) {
        logger.warn('检测到权限提升循环，停止提升尝试')
        return false
      }

      // 检查提升次数限制
      if (this.elevationAttempts >= this.maxElevationAttempts) {
        logger.warn(`权限提升尝试次数已达上限 (${this.maxElevationAttempts})`)
        return false
      }

      this.elevationAttempts++
      await this.savePrivilegeState()

      // 显示权限提升警告
      if (showWarning) {
        const result = await this.showElevationWarning()
        if (!result) {
          logger.info('用户拒绝了权限提升请求')
          return false
        }
      }

      // 记录提升开始时间
      this.lastElevationTime = Date.now()
      await this.savePrivilegeState()

      // 根据平台执行权限提升
      const success = await this.performElevation(elevationMethod)

      if (success) {
        this.isElevated = true
        this.elevationAttempts = 0 // 重置尝试次数
        await this.savePrivilegeState()
        logger.info('权限提升成功')
        return true
      } else if (retryOnFailure && this.elevationAttempts < this.maxElevationAttempts) {
        logger.warn('权限提升失败，准备重试')
        // 延迟后重试
        await new Promise(resolve => setTimeout(resolve, 1000))
        return this.elevatePrivileges({ ...options, showWarning: false })
      }

      return false
    } catch (error) {
      logger.error('权限提升过程中发生错误:', error)
      return false
    }
  }

  /**
   * 强制以管理员模式重启应用
   */
  public async relaunchAsAdmin(): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32'
      const isMacOS = process.platform === 'darwin'

      const currentExecutable = process.execPath
      const currentArgs = process.argv.slice(1)

      let command: string
      let args: string[]

      if (isWindows) {
        // Windows: 使用 PowerShell 以管理员权限运行
        command = 'powershell.exe'
        args = [
          '-Command',
          'Start-Process',
          `"${currentExecutable}"`,
          '-ArgumentList',
          `"${currentArgs.join('" "').replace(/"/g, '""')}"`,
          '-Verb',
          'RunAs'
        ]
      } else if (isMacOS) {
        // macOS: 使用 osascript 提升权限
        command = 'osascript'
        args = [
          '-e',
          `do shell script "exec '${currentExecutable}' ${currentArgs.join(' ')}" with administrator privileges`
        ]
      } else {
        // Linux: 使用 pkexec 或 sudo
        const hasPkexec = await this.checkCommandExists('pkexec')
        if (hasPkexec) {
          command = 'pkexec'
          args = [currentExecutable, ...currentArgs]
        } else {
          command = 'sudo'
          args = [currentExecutable, ...currentArgs]
        }
      }

      logger.info(`准备以管理员权限重启应用: ${command} ${args.join(' ')}`)

      // 执行权限提升命令
      await this.executeElevatedCommand(command, args)

      // 退出当前实例
      setTimeout(() => {
        app.quit()
      }, 1000)

      return true
    } catch (error) {
      logger.error('以管理员权限重启应用失败:', error)
      return false
    }
  }

  /**
   * 检查是否已经提升权限
   */
  public isElevatedPrivileges(): boolean {
    return this.isElevated
  }

  /**
   * 重置权限提升尝试计数
   */
  public resetElevationAttempts(): void {
    this.elevationAttempts = 0
  }

  /**
   * Windows 管理员权限检查
   */
  private async checkWindowsAdminPrivileges(): Promise<boolean> {
    return new Promise((resolve) => {
      // 如果已经知道是提升状态，直接返回true
      if (this.isElevated && (Date.now() - this.lastElevationTime) < 5 * 60 * 1000) {
        resolve(true)
        return
      }

      // 方法1: 使用 fs 模块尝试访问受保护的系统目录
      const fs = require('fs')
      const path = require('path')
      const systemConfigDir = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'config')

      try {
        // 尝试读取系统配置目录
        fs.accessSync(systemConfigDir, fs.constants.R_OK)
        logger.debug('方法1成功: 可以访问系统配置目录')
        resolve(true)
        return
      } catch (error) {
        logger.debug('方法1失败: 无法访问系统配置目录')
      }

      // 方法2: 使用 whoami /priv 检查权限
      exec('whoami /priv', (error: any, stdout: string, _stderr: string) => {
        if (!error) {
          // 检查是否包含 SeShutdownPrivilege 等管理员权限
          const adminPrivileges = [
            'SeShutdownPrivilege',
            'SeChangeNotifyPrivilege',
            'SeIncreaseWorkingSetPrivilege',
            'SeTimeZonePrivilege'
          ]

          const hasAdminPrivs = adminPrivileges.some(priv => stdout.includes(priv))

          if (hasAdminPrivs) {
            logger.debug('方法2成功: 检测到管理员权限标识')
            resolve(true)
            return
          }
        }

        // 方法3: 检查管理员组SID
        exec('whoami /groups', (error: any, stdout: string, _stderr: string) => {
          if (!error) {
            const adminIndicators = [
              'S-1-5-32-544', // Administrators group SID
              'BUILTIN\\Administrators',
              'Mandatory Label\\High Mandatory Level',
              'Mandatory Label\\System Mandatory Level'
            ]

            const hasAdminGroup = adminIndicators.some(indicator =>
              stdout.includes(indicator)
            )

            if (hasAdminGroup) {
              logger.debug('方法3成功: 检测到管理员组标识')
              resolve(true)
              return
            }
          }

          // 方法4: 尝试 net session 命令
          exec('net session', (netError: any, _netStdout: string, _netStderr: string) => {
            if (!netError) {
              logger.debug('方法4成功: net session 命令执行成功')
              resolve(true)
              return
            }

            // 方法5: 检查进程完整性级别
            exec('powershell -Command "([System.Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)"', (psError: any, psStdout: string) => {
              if (!psError && psStdout.includes('True')) {
                logger.debug('方法5成功: PowerShell 管理员角色检查')
                resolve(true)
                return
              }

              logger.debug('所有权限检测方法均失败，返回 false')
              resolve(false)
            })
          })
        })
      })
    })
  }

  /**
   * macOS 管理员权限检查
   */
  private async checkMacOSAdminPrivileges(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process')
      exec('id -un', (error: any, stdout: string) => {
        // 检查是否是 root 用户
        resolve(!error && stdout.trim() === 'root')
      })
    })
  }

  /**
   * Linux 管理员权限检查
   */
  private async checkLinuxAdminPrivileges(): Promise<boolean> {
    return new Promise((resolve) => {
      const { exec } = require('child_process')
      exec('id -u', (error: any, stdout: string) => {
        // 检查用户 ID 是否为 0 (root)
        resolve(!error && stdout.trim() === '0')
      })
    })
  }

  /**
   * 计算是否需要权限提升
   */
  private calculateNeedsElevation(
    canAccessSystemFiles: boolean,
    canAccessSystemNotifications: boolean
  ): boolean {
    // 如果无法访问系统文件或通知，则需要提升权限
    return !canAccessSystemFiles || !canAccessSystemNotifications
  }

  /**
   * 显示权限提升警告对话框
   */
  private async showElevationWarning(): Promise<boolean> {
    try {
      const result = await dialog.showMessageBox({
        type: 'warning',
        title: '权限提升请求',
        message: 'CCB 需要管理员权限才能正常运行',
        detail: 'CCB 需要访问系统文件和通知功能。是否允许以管理员权限启动？',
        buttons: ['允许', '取消'],
        defaultId: 0,
        cancelId: 1
      })

      return result.response === 0
    } catch (error) {
      logger.error('显示权限提升警告失败:', error)
      return true // 默认允许
    }
  }

  /**
   * 执行权限提升
   */
  private async performElevation(method: string): Promise<boolean> {
    switch (method) {
      case 'relaunch':
        return await this.relaunchAsAdmin()
      case 'prompt':
        return await this.promptForElevation()
      default:
        return await this.relaunchAsAdmin()
    }
  }

  /**
   * 提示用户进行权限提升
   */
  private async promptForElevation(): Promise<boolean> {
    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        title: '需要管理员权限',
        message: '请手动以管理员身份运行应用',
        detail: '请右键点击应用图标，选择"以管理员身份运行"，然后重新启动应用。',
        buttons: ['我知道了'],
        defaultId: 0
      })

      return result.response === 0
    } catch (error) {
      logger.error('显示权限提升提示失败:', error)
      return false
    }
  }

  /**
   * 检查命令是否存在
   */
  private async checkCommandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`which ${command}`, (error: any) => {
        resolve(!error)
      })
    })
  }

  /**
   * 执行提升权限的命令
   */
  private async executeElevatedCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`${command} ${args.join(' ')}`, (error: any, _stdout: string, stderr: string) => {
        if (error) {
          reject(new Error(`执行命令失败: ${stderr}`))
        } else {
          resolve()
        }
      })
    })
  }
}

// 导出单例实例
export const privilegeManager = PrivilegeManager.getInstance()