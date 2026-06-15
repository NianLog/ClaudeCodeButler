/**
 * 环境检测服务类
 *
 * 功能:
 * - 检查预定义环境（uv, claude-code, nodejs, npm, npx）
 * - 支持自定义环境检查
 * - 版本号提取（使用模板匹配）
 * - 管理自定义检查项
 * - 使用配置的终端执行命令
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { logger } from '../utils/logger'
import { executeCommand } from '../utils/command-executor'
import { terminalManagementService } from './terminal-management-service'
import {
  PredefinedCheckType,
  EnvironmentCheckStatus
} from '@shared/types/environment'
import type {
  EnvironmentCheckResult,
  CustomEnvironmentCheck,
  CustomCheckFormData,
  EnvironmentCheckSummary,
  ClaudeCodeVersionInfo
} from '@shared/types/environment'


/**
 * 环境检测服务类
 */
class EnvironmentCheckService {
  private customChecksPath: string
  private claudeCodeVersionPath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.customChecksPath = path.join(userDataPath, 'custom-environment-checks.json')
    this.claudeCodeVersionPath = path.join(os.homedir(), '.claude', 'code-version.json')
  }

  /**
   * 使用配置的终端执行命令（全局终端配置）
   */
  private async executeCommandWithTerminal(
    command: string,
    options?: { timeout?: number; workingDirectory?: string }
  ): Promise<{ stdout: string; stderr: string; error?: Error }> {
    try {
      // 使用全局默认终端执行命令
      const result = await terminalManagementService.executeCommand(command, {
        workingDirectory: options?.workingDirectory,
        timeout: options?.timeout || 10000
      })

      return result
    } catch (error: unknown) {
      return {
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error : new Error(String(error))
      }
    }
  }

  /**
   * 检查所有预定义环境
   */
  public async checkAllPredefined(): Promise<EnvironmentCheckResult[]> {
    const checks: PredefinedCheckType[] = [
      PredefinedCheckType.UV,
      PredefinedCheckType.CLAUDE_CODE,
      PredefinedCheckType.NODEJS,
      PredefinedCheckType.NPM,
      PredefinedCheckType.NPX
    ]

    const results: EnvironmentCheckResult[] = []

    for (const checkType of checks) {
      const result = await this.checkPredefined(checkType)
      results.push(result)
    }

    return results
  }

  /**
   * 检查单个预定义环境
   */
  public async checkPredefined(checkType: PredefinedCheckType): Promise<EnvironmentCheckResult> {
    const now = new Date()

    try {
      switch (checkType) {
        case PredefinedCheckType.UV:
          return await this.checkUV(now)
        case PredefinedCheckType.CLAUDE_CODE:
          return await this.checkClaudeCode(now)
        case PredefinedCheckType.NODEJS:
          return await this.checkNodeJS(now)
        case PredefinedCheckType.NPM:
          return await this.checkNPM(now)
        case PredefinedCheckType.NPX:
          return await this.checkNPX(now)
        default:
          return {
            id: checkType,
            name: checkType,
            type: checkType,
            status: EnvironmentCheckStatus.ERROR,
            error: '未知的检查类型',
            lastCheckTime: now,
            isCustom: false
          }
      }
    } catch (error) {
      return {
        id: checkType,
        name: checkType,
        type: checkType,
        status: EnvironmentCheckStatus.ERROR,
        error: error instanceof Error ? error.message : String(error),
        lastCheckTime: now,
        isCustom: false
      }
    }
  }

  /**
   * 检查UV
   */
  private async checkUV(checkTime: Date): Promise<EnvironmentCheckResult> {
    const result = await this.executeCommandWithTerminal('uv --version', { timeout: 5000 })

    if (result.error) {
      return {
        id: PredefinedCheckType.UV,
        name: 'UV',
        type: PredefinedCheckType.UV,
        status: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? EnvironmentCheckStatus.NOT_FOUND
          : EnvironmentCheckStatus.ERROR,
        error: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? '未安装UV'
          : result.error.message,
        lastCheckTime: checkTime,
        icon: '⚡',
        isCustom: false
      }
    }

    const version = result.stdout.trim().match(/^uv ([\d.]+)/)?.[1] || result.stdout.trim()

    return {
      id: PredefinedCheckType.UV,
      name: 'UV',
      type: PredefinedCheckType.UV,
      status: EnvironmentCheckStatus.OK,
      version,
      rawOutput: result.stdout,
      lastCheckTime: checkTime,
      icon: '⚡',
      isCustom: false
    }
  }

  /**
   * 检查Claude Code（从统计面板迁移逻辑）
   */
  private async checkClaudeCode(checkTime: Date): Promise<EnvironmentCheckResult> {
    try {
      // 读取Claude Code版本信息
      const content = await fs.readFile(this.claudeCodeVersionPath, 'utf-8')
      const versionInfo = JSON.parse(content) as ClaudeCodeVersionInfo

      return {
        id: PredefinedCheckType.CLAUDE_CODE,
        name: 'Claude Code',
        type: PredefinedCheckType.CLAUDE_CODE,
        status: EnvironmentCheckStatus.OK,
        version: versionInfo.version,
        rawOutput: JSON.stringify(versionInfo, null, 2),
        lastCheckTime: checkTime,
        icon: '🤖',
        isCustom: false
      }
    } catch (error: unknown) {
      const errorCode = error instanceof Error && 'code' in error ? (error as { code?: unknown }).code : undefined
      const errorMessage = error instanceof Error ? error.message : String(error)
      return {
        id: PredefinedCheckType.CLAUDE_CODE,
        name: 'Claude Code',
        type: PredefinedCheckType.CLAUDE_CODE,
        status: errorCode === 'ENOENT' ? EnvironmentCheckStatus.NOT_FOUND : EnvironmentCheckStatus.ERROR,
        error: errorCode === 'ENOENT' ? 'Claude Code未安装或版本文件不存在' : errorMessage,
        lastCheckTime: checkTime,
        icon: '🤖',
        isCustom: false
      }
    }
  }

  /**
   * 检查Node.js
   */
  private async checkNodeJS(checkTime: Date): Promise<EnvironmentCheckResult> {
    const result = await this.executeCommandWithTerminal('node --version', { timeout: 5000 })

    if (result.error) {
      return {
        id: PredefinedCheckType.NODEJS,
        name: 'Node.js',
        type: PredefinedCheckType.NODEJS,
        status: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? EnvironmentCheckStatus.NOT_FOUND
          : EnvironmentCheckStatus.ERROR,
        error: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? '未安装Node.js'
          : result.error.message,
        lastCheckTime: checkTime,
        icon: '💚',
        isCustom: false
      }
    }

    const version = result.stdout.trim().replace(/^v/, '')

    return {
      id: PredefinedCheckType.NODEJS,
      name: 'Node.js',
      type: PredefinedCheckType.NODEJS,
      status: EnvironmentCheckStatus.OK,
      version,
      rawOutput: result.stdout,
      lastCheckTime: checkTime,
      icon: '💚',
      isCustom: false
    }
  }

  /**
   * 检查NPM
   */
  private async checkNPM(checkTime: Date): Promise<EnvironmentCheckResult> {
    const result = await this.executeCommandWithTerminal('npm --version', { timeout: 5000 })

    if (result.error) {
      return {
        id: PredefinedCheckType.NPM,
        name: 'NPM',
        type: PredefinedCheckType.NPM,
        status: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? EnvironmentCheckStatus.NOT_FOUND
          : EnvironmentCheckStatus.ERROR,
        error: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? '未安装NPM'
          : result.error.message,
        lastCheckTime: checkTime,
        icon: '📦',
        isCustom: false
      }
    }

    const version = result.stdout.trim()

    return {
      id: PredefinedCheckType.NPM,
      name: 'NPM',
      type: PredefinedCheckType.NPM,
      status: EnvironmentCheckStatus.OK,
      version,
      rawOutput: result.stdout,
      lastCheckTime: checkTime,
      icon: '📦',
      isCustom: false
    }
  }

  /**
   * 检查NPX
   */
  private async checkNPX(checkTime: Date): Promise<EnvironmentCheckResult> {
    const result = await this.executeCommandWithTerminal('npx --version', { timeout: 5000 })

    if (result.error) {
      return {
        id: PredefinedCheckType.NPX,
        name: 'NPX',
        type: PredefinedCheckType.NPX,
        status: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? EnvironmentCheckStatus.NOT_FOUND
          : EnvironmentCheckStatus.ERROR,
        error: result.error.message.includes('not found') || result.error.message.includes('ENOENT')
          ? '未安装NPX'
          : result.error.message,
        lastCheckTime: checkTime,
        icon: '⚡',
        isCustom: false
      }
    }

    const version = result.stdout.trim()

    return {
      id: PredefinedCheckType.NPX,
      name: 'NPX',
      type: PredefinedCheckType.NPX,
      status: EnvironmentCheckStatus.OK,
      version,
      rawOutput: result.stdout,
      lastCheckTime: checkTime,
      icon: '⚡',
      isCustom: false
    }
  }

  /**
   * 检查单个自定义环境
   */
  public async checkCustom(customCheck: CustomEnvironmentCheck): Promise<EnvironmentCheckResult> {
    const now = new Date()

    // v2.0 安全重做：自定义命令改用参数化 command-executor，消除 shell 拼接导致的 RCE 风险
    const result = await executeCommand(customCheck.command, { timeout: 10000 })

    if (!result.success) {
      const errorMsg = result.error?.message || `命令执行失败 (exit ${result.exitCode})`
      const isNotFound = errorMsg.includes('not found') || errorMsg.includes('ENOENT')
      return {
        id: customCheck.id,
        name: customCheck.name,
        type: 'custom',
        status: isNotFound
          ? EnvironmentCheckStatus.NOT_FOUND
          : EnvironmentCheckStatus.ERROR,
        error: isNotFound
          ? '未找到该命令'
          : errorMsg,
        lastCheckTime: now,
        icon: customCheck.icon,
        isCustom: true
      }
    }

    const version = this.extractVersion(result.stdout, customCheck.outputTemplate)

    return {
      id: customCheck.id,
      name: customCheck.name,
      type: 'custom',
      status: version ? EnvironmentCheckStatus.OK : EnvironmentCheckStatus.WARNING,
      version: version || '无法提取版本号',
      rawOutput: result.stdout,
      lastCheckTime: now,
      icon: customCheck.icon,
      isCustom: true
    }
  }

  /**
   * 使用模板匹配提取版本号
   */
  private extractVersion(output: string, template: string): string | null {
    try {
      // 转义模板中的特殊字符，但保留 {ver} 占位符
      const escapedTemplate = template
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace('\\{ver\\}', '([\\s\\S]+?)') // 使用非贪婪匹配捕获版本号

      const regex = new RegExp(escapedTemplate, 'm') // m标志支持多行匹配
      const match = output.match(regex)

      if (match && match[1]) {
        return match[1].trim()
      }

      return null
    } catch (error) {
      logger.error('提取版本号失败:', error)
      return null
    }
  }

  /**
   * 获取所有自定义检查
   */
  public async getCustomChecks(): Promise<CustomEnvironmentCheck[]> {
    try {
      const content = await fs.readFile(this.customChecksPath, 'utf-8')
      const checks = JSON.parse(content) as CustomEnvironmentCheck[]

      // 转换日期字符串为Date对象
      return checks.map(check => ({
        ...check,
        createdAt: new Date(check.createdAt)
      }))
    } catch (error: unknown) {
      const errorCode = error instanceof Error && 'code' in error ? (error as { code?: unknown }).code : undefined
      if (errorCode === 'ENOENT') {
        return []
      }
      logger.error('读取自定义检查失败:', error)
      return []
    }
  }

  /**
   * 添加自定义检查
   */
  public async addCustomCheck(
    formData: CustomCheckFormData
  ): Promise<{ success: boolean; error?: string; checkId?: string }> {
    try {
      const checks = await this.getCustomChecks()

      // 生成唯一ID
      const id = `${this.slugify(formData.name)  }-${  Date.now()}`

      const newCheck: CustomEnvironmentCheck = {
        id,
        name: formData.name,
        command: formData.command,
        outputTemplate: formData.outputTemplate,
        description: formData.description,
        icon: formData.icon,
        createdAt: new Date()
      }

      checks.push(newCheck)

      // 保存到文件
      await this.saveCustomChecks(checks)

      logger.info(`成功添加自定义检查: ${formData.name}`)
      return { success: true, checkId: id }
    } catch (error) {
      logger.error('添加自定义检查失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 更新自定义检查
   */
  public async updateCustomCheck(
    checkId: string,
    formData: CustomCheckFormData
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const checks = await this.getCustomChecks()
      const index = checks.findIndex(check => check.id === checkId)

      if (index === -1) {
        return { success: false, error: `检查项 "${checkId}" 不存在` }
      }

      // 更新检查项（保留原有id和createdAt）
      checks[index] = {
        ...checks[index],
        name: formData.name,
        command: formData.command,
        outputTemplate: formData.outputTemplate,
        description: formData.description,
        icon: formData.icon
      }

      await this.saveCustomChecks(checks)

      logger.info(`成功更新自定义检查: ${formData.name}`)
      return { success: true }
    } catch (error) {
      logger.error('更新自定义检查失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 删除自定义检查
   */
  public async deleteCustomCheck(checkId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const checks = await this.getCustomChecks()
      const filtered = checks.filter(check => check.id !== checkId)

      if (filtered.length === checks.length) {
        return { success: false, error: `检查项 "${checkId}" 不存在` }
      }

      await this.saveCustomChecks(filtered)

      logger.info(`成功删除自定义检查: ${checkId}`)
      return { success: true }
    } catch (error) {
      logger.error('删除自定义检查失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 保存自定义检查到文件
   */
  private async saveCustomChecks(checks: CustomEnvironmentCheck[]): Promise<void> {
    const content = JSON.stringify(checks, null, 2)
    await fs.writeFile(this.customChecksPath, content, 'utf-8')
  }

  /**
   * 计算检查结果汇总
   */
  public calculateSummary(results: EnvironmentCheckResult[]): EnvironmentCheckSummary {
    const summary: EnvironmentCheckSummary = {
      total: results.length,
      ok: 0,
      warning: 0,
      error: 0,
      notFound: 0
    }

    for (const result of results) {
      switch (result.status) {
        case EnvironmentCheckStatus.OK:
          summary.ok++
          break
        case EnvironmentCheckStatus.WARNING:
          summary.warning++
          break
        case EnvironmentCheckStatus.ERROR:
          summary.error++
          break
        case EnvironmentCheckStatus.NOT_FOUND:
          summary.notFound++
          break
      }
    }

    return summary
  }

  /**
   * 获取Claude Code版本信息
   */
  public async getClaudeCodeVersion(): Promise<ClaudeCodeVersionInfo | null> {
    try {
      const content = await fs.readFile(this.claudeCodeVersionPath, 'utf-8')
      const versionInfo = JSON.parse(content) as ClaudeCodeVersionInfo
      return versionInfo
    } catch (error) {
      logger.error('读取Claude Code版本失败:', error)
      return null
    }
  }

  /**
   * 将字符串转换为URL安全的slug
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '')
  }
}

// 导出单例
export const environmentCheckService = new EnvironmentCheckService()
