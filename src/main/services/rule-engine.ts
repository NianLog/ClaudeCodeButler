/**
 * 规则引擎服务
 * 负责自动化规则的存储、管理和执行
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import {
  Rule,
  RuleCondition,
  RuleAction,
  RuleExecution,
  ExecutionLog
} from '@shared/types'
import { PATHS } from '@shared/constants'
import { logger } from '../utils/logger'

export class RuleEngine {
  private rulesFile: string
  private logFile: string
  private rules: Map<string, Rule> = new Map()
  private executionLogs: ExecutionLog[] = []

  constructor() {
    this.rulesFile = join(PATHS.DATA_DIR, 'rules.json')
    this.logFile = join(PATHS.DATA_DIR, 'rule-executions.json')
  }

  /**
   * 初始化规则引擎
   */
  async initialize(): Promise<void> {
    try {
      await this.ensureDataDir()
      await this.loadRules()
      await this.loadExecutionLogs()
      logger.info('规则引擎初始化完成')
    } catch (error) {
      logger.error('规则引擎初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取所有规则
   */
  async listRules(): Promise<Rule[]> {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority)
  }

  /**
   * 获取单个规则
   */
  async getRule(id: string): Promise<Rule | null> {
    return this.rules.get(id) || null
  }

  /**
   * 创建规则
   */
  async createRule(ruleData: Partial<Rule>): Promise<string> {
    try {
      const id = uuidv4()
      const now = new Date()

      const rule: Rule = {
        id,
        name: ruleData.name || '新规则',
        description: ruleData.description,
        enabled: ruleData.enabled ?? true,
        priority: ruleData.priority ?? 0,
        condition: ruleData.condition!,
        action: ruleData.action!,
        createdAt: now,
        updatedAt: now,
        lastExecuted: undefined,
        executionCount: 0
      }

      // 验证规则
      this.validateRule(rule)

      // 保存规则
      this.rules.set(id, rule)
      await this.saveRules()

      logger.info(`规则已创建: ${rule.name} (${id})`)
      return id

    } catch (error) {
      logger.error('创建规则失败:', error)
      throw new Error(`创建规则失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 更新规则
   */
  async updateRule(id: string, updates: Partial<Rule>): Promise<void> {
    try {
      const existingRule = this.rules.get(id)
      if (!existingRule) {
        throw new Error(`规则不存在: ${id}`)
      }

      const updatedRule: Rule = {
        ...existingRule,
        ...updates,
        id,
        updatedAt: new Date()
      }

      // 验证规则
      this.validateRule(updatedRule)

      // 保存规则
      this.rules.set(id, updatedRule)
      await this.saveRules()

      logger.info(`规则已更新: ${updatedRule.name} (${id})`)

    } catch (error) {
      logger.error(`更新规则失败 ${id}:`, error)
      throw new Error(`更新规则失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 删除规则
   */
  async deleteRule(id: string): Promise<void> {
    try {
      const rule = this.rules.get(id)
      if (!rule) {
        throw new Error(`规则不存在: ${id}`)
      }

      this.rules.delete(id)
      await this.saveRules()

      logger.info(`规则已删除: ${rule.name} (${id})`)

    } catch (error) {
      logger.error(`删除规则失败 ${id}:`, error)
      throw new Error(`删除规则失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 启用/禁用规则
   */
  async toggleRule(id: string, enabled: boolean): Promise<void> {
    await this.updateRule(id, { enabled })
  }

  /**
   * 手动执行规则
   */
  async executeRuleManually(id: string): Promise<RuleExecution> {
    const rule = this.rules.get(id)
    if (!rule) {
      throw new Error(`规则不存在: ${id}`)
    }

    return this.executeRule(rule, 'manual')
  }

  /**
   * 执行规则
   */
  async executeRule(rule: Rule, trigger: 'auto' | 'manual' = 'auto'): Promise<RuleExecution> {
    const startTime = Date.now()
    const execution: RuleExecution = {
      ruleId: rule.id,
      timestamp: new Date(),
      success: false,
      duration: 0
    }

    try {
      logger.info(`开始执行规则: ${rule.name} (触发方式: ${trigger})`)

      // 评估条件
      const conditionMet = this.evaluateCondition(rule.condition)
      if (!conditionMet) {
        execution.success = true
        execution.result = { skipped: true, reason: '条件不满足' }
        logger.info(`规则条件不满足，跳过执行: ${rule.name}`)
        return execution
      }

      // 执行动作
      const result = await this.executeAction(rule.action)
      execution.success = true
      execution.result = result

      // 更新规则执行信息
      rule.lastExecuted = execution.timestamp
      rule.executionCount++
      rule.updatedAt = new Date()
      await this.saveRules()

      logger.info(`规则执行成功: ${rule.name}`, result)

    } catch (error) {
      execution.success = false
      execution.error = error instanceof Error ? error.message : String(error)
      logger.error(`规则执行失败: ${rule.name}`, error)
    }

    execution.duration = Date.now() - startTime

    // 记录执行日志
    await this.addExecutionLog(rule, execution, trigger)

    return execution
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(limit: number = 100): ExecutionLog[] {
    return this.executionLogs.slice(0, limit)
  }

  /**
   * 获取规则统计
   */
  getRuleStats(ruleId: string): any {
    const ruleLogs = this.executionLogs.filter(log => log.ruleId === ruleId)
    const total = ruleLogs.length
    const successful = ruleLogs.filter(log => log.success).length
    const failed = total - successful
    const lastExecution = ruleLogs[0]?.timestamp || null

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      lastExecution,
      averageDuration: total > 0
        ? (ruleLogs.reduce((sum, log) => sum + log.duration, 0) / total).toFixed(2) + 'ms'
        : '0ms'
    }
  }

  /**
   * 获取所有规则统计
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {}

    this.rules.forEach((rule, id) => {
      stats[id] = {
        name: rule.name,
        enabled: rule.enabled,
        priority: rule.priority,
        executionCount: rule.executionCount,
        lastExecuted: rule.lastExecuted,
        ...this.getRuleStats(id)
      }
    })

    return stats
  }

  /**
   * 清理执行日志
   */
  async clearExecutionLogs(): Promise<void> {
    this.executionLogs = []
    await this.saveExecutionLogs()
    logger.info('执行日志已清理')
  }

  /**
   * 验证规则
   */
  private validateRule(rule: Rule): void {
    if (!rule.name || rule.name.trim() === '') {
      throw new Error('规则名称不能为空')
    }

    if (!rule.condition) {
      throw new Error('规则条件不能为空')
    }

    if (!rule.action) {
      throw new Error('规则动作不能为空')
    }

    // 验证条件
    this.validateCondition(rule.condition)

    // 验证动作
    this.validateAction(rule.action)
  }

  /**
   * 验证条件
   */
  private validateCondition(condition: RuleCondition): void {
    const validTypes = ['time', 'date', 'weekday', 'custom']
    if (!validTypes.includes(condition.type)) {
      throw new Error(`无效的条件类型: ${condition.type}`)
    }

    const validOperators = ['equals', 'between', 'in', 'custom']
    if (!validOperators.includes(condition.operator)) {
      throw new Error(`无效的操作符: ${condition.operator}`)
    }

    if (condition.value === undefined || condition.value === null) {
      throw new Error('条件值不能为空')
    }
  }

  /**
   * 验证动作
   */
  private validateAction(action: RuleAction): void {
    const validTypes = ['switchConfig', 'notification', 'custom']
    if (!validTypes.includes(action.type)) {
      throw new Error(`无效的动作类型: ${action.type}`)
    }

    if (!action.params || typeof action.params !== 'object') {
      throw new Error('动作参数不能为空')
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: RuleCondition): boolean {
    const now = new Date()

    switch (condition.type) {
      case 'time':
        return this.evaluateTimeCondition(condition, now)
      case 'date':
        return this.evaluateDateCondition(condition, now)
      case 'weekday':
        return this.evaluateWeekdayCondition(condition, now)
      default:
        logger.warn(`未知的条件类型: ${condition.type}`)
        return false
    }
  }

  /**
   * 评估时间条件
   */
  private evaluateTimeCondition(condition: RuleCondition, now: Date): boolean {
    if (condition.operator !== 'between' || !Array.isArray(condition.value)) {
      return false
    }

    const [startTime, endTime] = condition.value
    const currentTime = now.getHours() * 60 + now.getMinutes()

    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    return currentTime >= startMinutes && currentTime <= endMinutes
  }

  /**
   * 评估日期条件
   */
  private evaluateDateCondition(condition: RuleCondition, now: Date): boolean {
    if (condition.operator !== 'between' || !Array.isArray(condition.value)) {
      return false
    }

    const [startDate, endDate] = condition.value
    const currentDate = now.toISOString().split('T')[0]

    return currentDate >= startDate && currentDate <= endDate
  }

  /**
   * 评估星期条件
   */
  private evaluateWeekdayCondition(condition: RuleCondition, now: Date): boolean {
    if (condition.operator !== 'in' || !Array.isArray(condition.value)) {
      return false
    }

    const currentDay = now.getDay()
    return condition.value.includes(currentDay)
  }

  /**
   * 执行动作
   */
  private async executeAction(action: RuleAction): Promise<any> {
    switch (action.type) {
      case 'switchConfig':
        return this.switchConfig(action.params.targetConfig)
      case 'notification':
        return this.showNotification(action.params)
      default:
        throw new Error(`未知的动作类型: ${action.type}`)
    }
  }

  /**
   * 切换配置
   */
  private async switchConfig(targetConfig: string): Promise<any> {
    // 这里应该调用配置服务来实际切换配置
    // 目前只是记录日志
    logger.info(`请求切换配置: ${targetConfig}`)
    return { switched: true, targetConfig }
  }

  /**
   * 显示通知
   */
  private async showNotification(params: any): Promise<any> {
    const { title, message } = params
    logger.info(`显示通知: ${title} - ${message}`)

    // 这里可以调用系统通知
    const notification = new Notification({
      title,
      body: message
    })
    notification.show()

    return { notified: true, title, message }
  }

  /**
   * 添加执行日志
   */
  private async addExecutionLog(rule: Rule, execution: RuleExecution, trigger: 'auto' | 'manual'): Promise<void> {
    const log: ExecutionLog = {
      id: uuidv4(),
      ruleId: rule.id,
      ruleName: rule.name,
      timestamp: execution.timestamp,
      success: execution.success,
      error: execution.error,
      context: {
        trigger,
        priority: rule.priority,
        condition: rule.condition,
        action: rule.action
      }
    }

    this.executionLogs.unshift(log)

    // 限制日志数量
    if (this.executionLogs.length > 1000) {
      this.executionLogs = this.executionLogs.slice(0, 500)
    }

    await this.saveExecutionLogs()
  }

  /**
   * 确保数据目录存在
   */
  private async ensureDataDir(): Promise<void> {
    await fs.mkdir(PATHS.DATA_DIR, { recursive: true })
  }

  /**
   * 加载规则
   */
  private async loadRules(): Promise<void> {
    try {
      if (await this.fileExists(this.rulesFile)) {
        const content = await fs.readFile(this.rulesFile, 'utf8')
        const rulesData = JSON.parse(content)

        this.rules.clear()
        for (const ruleData of rulesData) {
          const rule = {
            ...ruleData,
            createdAt: new Date(ruleData.createdAt),
            updatedAt: new Date(ruleData.updatedAt),
            lastExecuted: ruleData.lastExecuted ? new Date(ruleData.lastExecuted) : undefined
          }
          this.rules.set(rule.id, rule)
        }

        logger.info(`已加载 ${this.rules.size} 个规则`)
      }
    } catch (error) {
      logger.error('加载规则失败:', error)
      throw error
    }
  }

  /**
   * 保存规则
   */
  private async saveRules(): Promise<void> {
    try {
      const rulesData = Array.from(this.rules.values())
      await fs.writeFile(this.rulesFile, JSON.stringify(rulesData, null, 2), 'utf8')
    } catch (error) {
      logger.error('保存规则失败:', error)
      throw error
    }
  }

  /**
   * 加载执行日志
   */
  private async loadExecutionLogs(): Promise<void> {
    try {
      if (await this.fileExists(this.logFile)) {
        const content = await fs.readFile(this.logFile, 'utf8')
        const logsData = JSON.parse(content)

        this.executionLogs = logsData.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }))

        logger.info(`已加载 ${this.executionLogs.length} 条执行日志`)
      }
    } catch (error) {
      logger.error('加载执行日志失败:', error)
      // 不抛出错误，允许应用继续运行
    }
  }

  /**
   * 保存执行日志
   */
  private async saveExecutionLogs(): Promise<void> {
    try {
      await fs.writeFile(this.logFile, JSON.stringify(this.executionLogs, null, 2), 'utf8')
    } catch (error) {
      logger.error('保存执行日志失败:', error)
      // 不抛出错误，避免影响主要功能
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}