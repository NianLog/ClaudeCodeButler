/**
 * Claude Code版本管理服务
 *
 * 功能:
 * - 检测当前安装的Claude Code版本
 * - 检查最新可用版本
 * - 执行版本更新
 * - 获取版本更新日志
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { logger } from '../utils/logger'
import axios from 'axios'

const execAsync = promisify(exec)

/**
 * 版本信息接口
 */
export interface ClaudeCodeVersion {
  current: string | null
  latest: string | null
  hasUpdate: boolean
  updateAvailable: boolean
}

/**
 * 更新结果接口
 */
export interface UpdateResult {
  success: boolean
  message: string
  oldVersion: string | null
  newVersion: string | null
  output?: string
  error?: string
}

/**
 * Claude Code版本管理服务类
 */
class ClaudeCodeVersionService {
  private cachedVersion: ClaudeCodeVersion | null = null
  private cacheExpiry: number = 30 * 60 * 1000 // 30分钟缓存
  private lastCacheTime: number = 0

  /**
   * 获取当前安装的Claude Code版本
   */
  public async getCurrentVersion(): Promise<string | null> {
    try {
      logger.info('检测当前Claude Code版本...')

      const os = require('os')
      const path = require('path')
      const fs = require('fs')
      const userHome = os.homedir()

      // 构建检测命令列表 - 按优先级排序
      const commands: string[] = []

      // 1. 检查用户本地安装 (.claude/local) - 如果存在则优先使用
      const localClaudePath = path.join(userHome, '.claude', 'local', 'node_modules', '.bin', 'claude')
      if (fs.existsSync(localClaudePath)) {
        commands.push(localClaudePath + ' --version')
        logger.debug(`发现本地Claude安装: ${localClaudePath}`)
      }

      // 2. 添加通用命令 - 适用于各种安装方式
      commands.push(
        'claude --version',      // PATH中的claude命令
        'npx @anthropic-ai/claude-code --version',  // npm全局安装
        'claude -v'              // 短选项兜底
      )

      // 尝试每个命令,直到找到有效版本
      for (const cmd of commands) {
        try {
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: 10000, // 10秒超时
            windowsHide: true,
            env: {
              ...process.env,
              PATH: process.env.PATH
            }
          })

          const output = (stdout || stderr).trim()
          logger.info(`命令 "${cmd}" 输出: ${output}`)

          // 提取版本号 - 匹配语义化版本号格式
          // 支持: 2.0.22, 2.0.22-beta.1, v2.0.22 等格式
          const versionMatch = output.match(/v?(\d+\.\d+\.\d+(?:-[\w.]+)?)/)
          if (versionMatch) {
            const version = versionMatch[1]
            logger.info(`✅ 检测到Claude Code版本: ${version} (使用命令: ${cmd})`)
            return version
          }
        } catch (error) {
          logger.debug(`命令 "${cmd}" 执行失败:`, error)
          continue
        }
      }

      logger.warn('⚠️ 无法检测Claude Code版本,可能未安装')
      return null
    } catch (error) {
      logger.error('获取Claude Code版本失败:', error)
      return null
    }
  }

  /**
   * 获取npm包的最新版本
   */
  public async getLatestVersion(): Promise<string | null> {
    try {
      logger.info('获取Claude Code最新版本...')

      // 从npm registry获取最新版本
      const response = await axios.get(
        'https://registry.npmjs.org/@anthropic-ai/claude-code',
        {
          timeout: 10000,
          headers: {
            'Accept': 'application/json'
          }
        }
      )

      const latestVersion = response.data['dist-tags']?.latest
      if (latestVersion) {
        logger.info(`最新Claude Code版本: ${latestVersion}`)
        return latestVersion
      }

      logger.warn('无法从npm registry获取最新版本')
      return null
    } catch (error) {
      logger.error('获取最新版本失败:', error)
      return null
    }
  }

  /**
   * 检查版本更新
   * 如果缓存有效则返回缓存,否则重新检查
   */
  public async checkForUpdates(forceRefresh = false): Promise<ClaudeCodeVersion> {
    const now = Date.now()

    // 检查缓存是否有效
    if (!forceRefresh && this.cachedVersion && (now - this.lastCacheTime) < this.cacheExpiry) {
      logger.info('返回缓存的版本信息')
      return this.cachedVersion
    }

    logger.info('检查Claude Code版本更新...')

    try {
      // 并行获取当前版本和最新版本
      const [currentVersion, latestVersion] = await Promise.all([
        this.getCurrentVersion(),
        this.getLatestVersion()
      ])

      // 比较版本
      const hasUpdate = this.compareVersions(currentVersion, latestVersion)

      const versionInfo: ClaudeCodeVersion = {
        current: currentVersion,
        latest: latestVersion,
        hasUpdate,
        updateAvailable: hasUpdate && currentVersion !== null && latestVersion !== null
      }

      // 更新缓存
      this.cachedVersion = versionInfo
      this.lastCacheTime = now

      logger.info('版本检查完成:', versionInfo)
      return versionInfo
    } catch (error) {
      logger.error('检查版本更新失败:', error)

      // 如果有缓存,返回旧缓存
      if (this.cachedVersion) {
        logger.warn('返回旧缓存数据')
        return this.cachedVersion
      }

      // 返回空数据
      return {
        current: null,
        latest: null,
        hasUpdate: false,
        updateAvailable: false
      }
    }
  }

  /**
   * 比较两个版本号
   * 返回true表示latestVersion更新
   */
  private compareVersions(current: string | null, latest: string | null): boolean {
    if (!current || !latest) return false

    try {
      // 移除版本号中的非数字字符(除了点)
      const cleanCurrent = current.replace(/[^\d.]/g, '')
      const cleanLatest = latest.replace(/[^\d.]/g, '')

      const currentParts = cleanCurrent.split('.').map(Number)
      const latestParts = cleanLatest.split('.').map(Number)

      // 逐段比较版本号
      const maxLength = Math.max(currentParts.length, latestParts.length)
      for (let i = 0; i < maxLength; i++) {
        const currentPart = currentParts[i] || 0
        const latestPart = latestParts[i] || 0

        if (latestPart > currentPart) return true
        if (latestPart < currentPart) return false
      }

      return false
    } catch (error) {
      logger.error('版本比较失败:', error)
      return false
    }
  }

  /**
   * 执行Claude Code更新
   */
  public async update(): Promise<UpdateResult> {
    try {
      logger.info('开始更新Claude Code...')

      // 获取当前版本
      const oldVersion = await this.getCurrentVersion()

      // 尝试多种更新命令
      const updateCommands = [
        'npm update -g @anthropic-ai/claude-code',
        'npm install -g @anthropic-ai/claude-code@latest'
      ]

      let lastError: any = null
      let output = ''

      for (const cmd of updateCommands) {
        try {
          logger.info(`执行更新命令: ${cmd}`)
          const { stdout, stderr } = await execAsync(cmd, {
            timeout: 120000, // 2分钟超时
            windowsHide: true
          })

          output = stdout + stderr
          logger.info('更新命令执行完成')
          break
        } catch (error) {
          logger.warn(`命令 "${cmd}" 执行失败:`, error)
          lastError = error
          continue
        }
      }

      if (lastError && !output) {
        throw lastError
      }

      // 等待一下让更新生效
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 获取新版本
      const newVersion = await this.getCurrentVersion()

      // 检查是否成功更新
      if (newVersion && newVersion !== oldVersion) {
        logger.info(`更新成功: ${oldVersion} -> ${newVersion}`)

        // 清除缓存
        this.clearCache()

        return {
          success: true,
          message: `成功更新到版本 ${newVersion}`,
          oldVersion,
          newVersion,
          output
        }
      } else if (newVersion && newVersion === oldVersion) {
        logger.info('已经是最新版本')
        return {
          success: true,
          message: '已经是最新版本',
          oldVersion,
          newVersion,
          output
        }
      } else {
        throw new Error('更新后无法检测到版本信息')
      }
    } catch (error) {
      logger.error('更新失败:', error)
      return {
        success: false,
        message: '更新失败',
        oldVersion: null,
        newVersion: null,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 清除版本信息缓存
   */
  public clearCache(): void {
    this.cachedVersion = null
    this.lastCacheTime = 0
    logger.info('Claude Code版本信息缓存已清除')
  }

  /**
   * 检查Claude Code是否已安装
   */
  public async isInstalled(): Promise<boolean> {
    const version = await this.getCurrentVersion()
    return version !== null
  }
}

// 导出单例
export const claudeCodeVersionService = new ClaudeCodeVersionService()
