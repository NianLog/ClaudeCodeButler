/**
 * 任务调度器
 * 负责管理和执行定时任务
 */

import * as cron from 'node-cron'
import { EventEmitter } from 'events'
import { Rule, RuleExecution, RuleCondition } from '@shared/types/rule'
import { logger } from './utils/logger'

export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, cron.ScheduledTask> = new Map()
  private isRunning = false
  private executionLog: RuleExecution[] = []

  /**
   * 启动任务调度器
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('任务调度器已在运行')
      return
    }

    this.isRunning = true
    logger.info('任务调度器已启动')
  }

  /**
   * 停止任务调度器
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    // 停止所有定时任务
    this.tasks.forEach(task => {
      task.stop()
    })

    this.tasks.clear()
    this.isRunning = false
    logger.info('任务调度器已停止')
  }

  /**
   * 添加规则到调度器
   */
  addRule(rule: Rule): void {
    if (!this.isRunning) {
      logger.warn('任务调度器未运行，无法添加规则')
      return
    }

    // 如果规则已存在，先移除
    if (this.tasks.has(rule.id)) {
      this.removeRule(rule.id)
    }

    try {
      // 生成 cron 表达式
      const cronExpression = this.generateCronExpression(rule.condition)

      if (!cronExpression) {
        logger.error(`无法为规则 ${rule.name} 生成 cron 表达式`, rule.condition)
        return
      }

      // 创建定时任务
      const task = cron.schedule(cronExpression, async () => {
        await this.executeRule(rule)
      }, {
        scheduled: false, // 先不启动
        timezone: 'Asia/Shanghai'
      })

      // 保存任务
      this.tasks.set(rule.id, task)

      // 如果规则启用，立即启动任务
      if (rule.enabled) {
        task.start()
        logger.info(`规则已添加到调度器: ${rule.name} (${cronExpression})`)
      } else {
        logger.info(`规则已添加但未启用: ${rule.name}`)
      }

    } catch (error) {
      logger.error(`添加规则到调度器失败: ${rule.name}`, error)
    }
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    const task = this.tasks.get(ruleId)
    if (task) {
      task.stop()
      this.tasks.delete(ruleId)
      logger.info(`规则已从调度器移除: ${ruleId}`)
    }
  }

  /**
   * 更新规则
   */
  updateRule(rule: Rule): void {
    this.removeRule(rule.id)
    this.addRule(rule)
  }

  /**
   * 启用/禁用规则
   */
  toggleRule(ruleId: string, enabled: boolean): void {
    const task = this.tasks.get(ruleId)
    if (task) {
      if (enabled) {
        task.start()
        logger.info(`规则已启用: ${ruleId}`)
      } else {
        task.stop()
        logger.info(`规则已禁用: ${ruleId}`)
      }
    }
  }

  /**
   * 手动执行规则
   */
  async executeRuleManually(rule: Rule): Promise<RuleExecution> {
    return this.executeRule(rule)
  }

  /**
   * 执行规则
   */
  private async executeRule(rule: Rule): Promise<RuleExecution> {
    const startTime = Date.now()
    let execution: RuleExecution = {
      ruleId: rule.id,
      timestamp: new Date(),
      success: false,
      duration: 0
    }

    try {
      logger.info(`开始执行规则: ${rule.name}`)

      // 验证规则条件
      if (!this.evaluateCondition(rule.condition)) {
        logger.info(`规则条件不满足，跳过执行: ${rule.name}`)
        execution.success = true
        execution.result = { skipped: true, reason: '条件不满足' }
        return execution
      }

      // 执行规则动作
      const result = await this.executeAction(rule.action)

      execution.success = true
      execution.result = result

      logger.info(`规则执行成功: ${rule.name}`, result)

      // 发送执行完成事件
      this.emit('rule-executed', execution)

    } catch (error) {
      execution.success = false
      execution.error = error instanceof Error ? error.message : String(error)

      logger.error(`规则执行失败: ${rule.name}`, error)

      // 发送执行失败事件
      this.emit('rule-execution-failed', execution)

    } finally {
      execution.duration = Date.now() - startTime

      // 记录执行日志
      this.addExecutionLog(execution)

      // 限制日志数量
      if (this.executionLog.length > 1000) {
        this.executionLog = this.executionLog.slice(-500)
      }
    }

    return execution
  }

  /**
   * 评估规则条件
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
   * 执行规则动作
   */
  private async executeAction(action: any): Promise<any> {
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
    // 发送配置切换事件
    this.emit('config-switch-requested', { targetConfig })

    logger.info(`请求切换配置: ${targetConfig}`)

    return { switched: true, targetConfig }
  }

  /**
   * 显示通知
   */
  private async showNotification(params: any): Promise<any> {
    const { title, message } = params

    // 发送通知事件
    this.emit('notification-requested', { title, message })

    logger.info(`显示通知: ${title} - ${message}`)

    return { notified: true, title, message }
  }

  /**
   * 生成 cron 表达式
   */
  private generateCronExpression(condition: RuleCondition): string | null {
    switch (condition.type) {
      case 'time':
        return this.generateTimeCron(condition)
      case 'weekday':
        return this.generateWeekdayCron(condition)
      case 'date':
        return this.generateDateCron(condition)
      default:
        return null
    }
  }

  /**
   * 生成时间 cron 表达式
   */
  private generateTimeCron(condition: RuleCondition): string | null {
    if (condition.operator !== 'between' || !Array.isArray(condition.value)) {
      return null
    }

    const [startTime, endTime] = condition.value
    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour] = endTime.split(':').map(Number)

    // 每分钟检查一次是否在时间范围内
    return `${startMin} ${startHour}-${endHour} * * *`
  }

  /**
   * 生成星期 cron 表达式
   */
  private generateWeekdayCron(condition: RuleCondition): string | null {
    if (condition.operator !== 'in' || !Array.isArray(condition.value)) {
      return null
    }

    const weekdays = condition.value.join(',')
    // 每天早上 9 点检查
    return `0 9 * * ${weekdays}`
  }

  /**
   * 生成日期 cron 表达式
   */
  private generateDateCron(condition: RuleCondition): string | null {
    if (condition.operator !== 'between' || !Array.isArray(condition.value)) {
      return null
    }

    const [startDate, endDate] = condition.value
    const [, startMonth, startDay] = startDate.split('-').map(Number)

    // 如果开始和结束是同一天
    if (startDate === endDate) {
      return `0 9 ${startDay} ${startMonth} *`
    }

    // 跨日期的情况，使用更复杂的逻辑
    // 这里简化为每天检查
    return `0 9 * * *`
  }

  /**
   * 添加执行日志
   */
  private addExecutionLog(execution: RuleExecution): void {
    this.executionLog.unshift(execution)

    // 限制日志数量
    if (this.executionLog.length > 1000) {
      this.executionLog = this.executionLog.slice(0, 500)
    }

    // 发送日志更新事件
    this.emit('execution-log-updated', execution)
  }

  /**
   * 获取执行日志
   */
  getExecutionLog(limit: number = 100): RuleExecution[] {
    return this.executionLog.slice(0, limit)
  }

  /**
   * 获取规则统计信息
   */
  getRuleStats(ruleId: string): any {
    const ruleLogs = this.executionLog.filter(log => log.ruleId === ruleId)
    const total = ruleLogs.length
    const successful = ruleLogs.filter(log => log.success).length
    const failed = total - successful

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : '0%',
      lastExecution: ruleLogs[0]?.timestamp || null,
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
    const ruleIds = [...new Set(this.executionLog.map(log => log.ruleId))]

    ruleIds.forEach(ruleId => {
      stats[ruleId] = this.getRuleStats(ruleId)
    })

    return stats
  }

  /**
   * 清理执行日志
   */
  clearExecutionLog(): void {
    this.executionLog = []
    logger.info('执行日志已清理')
  }

  /**
   * 获取调度器状态
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      activeTasks: this.tasks.size,
      totalExecutions: this.executionLog.length,
      lastExecution: this.executionLog[0]?.timestamp || null
    }
  }
}