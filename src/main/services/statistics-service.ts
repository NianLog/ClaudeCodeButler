/**
 * 统计服务
 * 负责收集、存储和查询应用使用统计数据
 */

import { app } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'

/**
 * 统计事件类型
 */
export enum StatEventType {
  CONFIG_SWITCH = 'config_switch',      // 配置切换
  CONFIG_CREATE = 'config_create',      // 配置创建
  CONFIG_DELETE = 'config_delete',      // 配置删除
  CONFIG_EDIT = 'config_edit',          // 配置编辑
  RULE_EXECUTE = 'rule_execute',        // 规则执行
  RULE_SUCCESS = 'rule_success',        // 规则执行成功
  RULE_FAILURE = 'rule_failure',        // 规则执行失败
  APP_START = 'app_start',              // 应用启动
  APP_CLOSE = 'app_close',              // 应用关闭
  ERROR = 'error'                       // 错误事件
}

/**
 * 统计事件接口
 */
export interface StatEvent {
  type: StatEventType
  timestamp: number
  data?: any
}

/**
 * 配置使用统计
 */
export interface ConfigUsageStats {
  configName: string
  configPath: string
  switchCount: number       // 切换次数
  lastUsed: number         // 最后使用时间
  totalDuration: number    // 总使用时长(毫秒)
  editCount: number        // 编辑次数
}

/**
 * 规则执行统计
 */
export interface RuleExecutionStats {
  ruleId: string
  ruleName: string
  totalExecutions: number   // 总执行次数
  successCount: number      // 成功次数
  failureCount: number      // 失败次数
  avgDuration: number       // 平均执行时长(毫秒)
  lastExecuted: number      // 最后执行时间
}

/**
 * 系统统计数据
 */
export interface SystemStats {
  totalConfigs: number              // 配置总数
  totalRules: number               // 规则总数
  totalConfigSwitches: number      // 配置切换总次数
  totalRuleExecutions: number      // 规则执行总次数
  totalErrors: number              // 错误总数
  appStartCount: number            // 应用启动次数
  totalUptime: number              // 总运行时长(毫秒)
  lastStartTime: number            // 最后启动时间
  avgResponseTime: number          // 平均响应时间(毫秒)
}

/**
 * 统计数据汇总
 */
export interface StatisticsSummary {
  system: SystemStats
  configUsage: ConfigUsageStats[]
  ruleExecution: RuleExecutionStats[]
  timeRange: {
    start: number
    end: number
  }
}

/**
 * 统计服务类
 */
export class StatisticsService {
  private statsDir: string
  private eventsFile: string
  private summaryFile: string
  private events: StatEvent[] = []
  private maxEvents = 10000  // 最多保留事件数
  private saveInterval = 60000  // 保存间隔(1分钟)
  private saveTimer: NodeJS.Timeout | null = null
  private appStartTime: number = Date.now()

  constructor() {
    const userDataPath = app.getPath('userData')
    this.statsDir = path.join(userDataPath, '.ccb', 'statistics')
    this.eventsFile = path.join(this.statsDir, 'events.json')
    this.summaryFile = path.join(this.statsDir, 'summary.json')

    this.initialize()
  }

  /**
   * 初始化统计服务
   */
  private async initialize(): Promise<void> {
    try {
      // 创建统计目录
      await fs.ensureDir(this.statsDir)

      // 加载已有事件
      await this.loadEvents()

      // 记录应用启动
      this.recordEvent(StatEventType.APP_START)

      // 启动定期保存
      this.startAutoSave()

      console.log('[统计服务] 初始化完成')
    } catch (error) {
      console.error('[统计服务] 初始化失败:', error)
    }
  }

  /**
   * 加载已有事件
   */
  private async loadEvents(): Promise<void> {
    try {
      if (await fs.pathExists(this.eventsFile)) {
        const data = await fs.readJSON(this.eventsFile)
        this.events = Array.isArray(data) ? data : []

        // 清理过期事件(保留最近90天)
        const cutoffTime = Date.now() - 90 * 24 * 60 * 60 * 1000
        this.events = this.events.filter(e => e.timestamp > cutoffTime)

        console.log(`[统计服务] 加载了 ${this.events.length} 个历史事件`)
      }
    } catch (error) {
      console.error('[统计服务] 加载事件失败:', error)
      this.events = []
    }
  }

  /**
   * 保存事件到文件
   */
  private async saveEvents(): Promise<void> {
    try {
      await fs.writeJSON(this.eventsFile, this.events, { spaces: 2 })
    } catch (error) {
      console.error('[统计服务] 保存事件失败:', error)
    }
  }

  /**
   * 启动自动保存
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer)
    }

    this.saveTimer = setInterval(() => {
      this.saveEvents()
      this.generateSummary()
    }, this.saveInterval)
  }

  /**
   * 停止自动保存
   */
  private stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer)
      this.saveTimer = null
    }
  }

  /**
   * 记录事件
   */
  public recordEvent(type: StatEventType, data?: any): void {
    const event: StatEvent = {
      type,
      timestamp: Date.now(),
      data
    }

    this.events.push(event)

    // 限制事件数量
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }

    // console.log(`[统计服务] 记录事件: ${type}`, data)
  }

  /**
   * 获取配置使用统计
   */
  public getConfigUsageStats(timeRange?: { start: number; end: number }): ConfigUsageStats[] {
    const start = timeRange?.start || 0
    const end = timeRange?.end || Date.now()

    // 筛选时间范围内的配置相关事件
    const configEvents = this.events.filter(e =>
      e.timestamp >= start &&
      e.timestamp <= end &&
      (e.type === StatEventType.CONFIG_SWITCH ||
       e.type === StatEventType.CONFIG_EDIT)
    )

    // 按配置分组统计
    const statsMap = new Map<string, ConfigUsageStats>()

    for (const event of configEvents) {
      const configPath = event.data?.configPath || event.data?.path
      if (!configPath) continue

      if (!statsMap.has(configPath)) {
        statsMap.set(configPath, {
          configName: event.data?.configName || path.basename(configPath),
          configPath,
          switchCount: 0,
          lastUsed: 0,
          totalDuration: 0,
          editCount: 0
        })
      }

      const stats = statsMap.get(configPath)!

      if (event.type === StatEventType.CONFIG_SWITCH) {
        stats.switchCount++
        stats.lastUsed = Math.max(stats.lastUsed, event.timestamp)
      } else if (event.type === StatEventType.CONFIG_EDIT) {
        stats.editCount++
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.switchCount - a.switchCount)
  }

  /**
   * 获取规则执行统计
   */
  public getRuleExecutionStats(timeRange?: { start: number; end: number }): RuleExecutionStats[] {
    const start = timeRange?.start || 0
    const end = timeRange?.end || Date.now()

    // 筛选时间范围内的规则执行事件
    const ruleEvents = this.events.filter(e =>
      e.timestamp >= start &&
      e.timestamp <= end &&
      (e.type === StatEventType.RULE_EXECUTE ||
       e.type === StatEventType.RULE_SUCCESS ||
       e.type === StatEventType.RULE_FAILURE)
    )

    // 按规则分组统计
    const statsMap = new Map<string, RuleExecutionStats>()

    for (const event of ruleEvents) {
      const ruleId = event.data?.ruleId
      if (!ruleId) continue

      if (!statsMap.has(ruleId)) {
        statsMap.set(ruleId, {
          ruleId,
          ruleName: event.data?.ruleName || ruleId,
          totalExecutions: 0,
          successCount: 0,
          failureCount: 0,
          avgDuration: 0,
          lastExecuted: 0
        })
      }

      const stats = statsMap.get(ruleId)!

      if (event.type === StatEventType.RULE_EXECUTE) {
        stats.totalExecutions++
        stats.lastExecuted = Math.max(stats.lastExecuted, event.timestamp)
      } else if (event.type === StatEventType.RULE_SUCCESS) {
        stats.successCount++
        if (event.data?.duration) {
          stats.avgDuration = (stats.avgDuration * (stats.successCount - 1) + event.data.duration) / stats.successCount
        }
      } else if (event.type === StatEventType.RULE_FAILURE) {
        stats.failureCount++
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalExecutions - a.totalExecutions)
  }

  /**
   * 获取系统统计
   */
  public getSystemStats(timeRange?: { start: number; end: number }): SystemStats {
    const start = timeRange?.start || 0
    const end = timeRange?.end || Date.now()

    const rangeEvents = this.events.filter(e => e.timestamp >= start && e.timestamp <= end)

    return {
      totalConfigs: new Set(rangeEvents
        .filter(e => e.type === StatEventType.CONFIG_SWITCH)
        .map(e => e.data?.configPath)).size,
      totalRules: new Set(rangeEvents
        .filter(e => e.type === StatEventType.RULE_EXECUTE)
        .map(e => e.data?.ruleId)).size,
      totalConfigSwitches: rangeEvents.filter(e => e.type === StatEventType.CONFIG_SWITCH).length,
      totalRuleExecutions: rangeEvents.filter(e => e.type === StatEventType.RULE_EXECUTE).length,
      totalErrors: rangeEvents.filter(e => e.type === StatEventType.ERROR).length,
      appStartCount: rangeEvents.filter(e => e.type === StatEventType.APP_START).length,
      totalUptime: Date.now() - this.appStartTime,
      lastStartTime: this.appStartTime,
      avgResponseTime: 0  // TODO: 实现响应时间统计
    }
  }

  /**
   * 生成统计摘要
   */
  public async generateSummary(timeRange?: { start: number; end: number }): Promise<StatisticsSummary> {
    const range = timeRange || {
      start: Date.now() - 30 * 24 * 60 * 60 * 1000,  // 最近30天
      end: Date.now()
    }

    const summary: StatisticsSummary = {
      system: this.getSystemStats(range),
      configUsage: this.getConfigUsageStats(range),
      ruleExecution: this.getRuleExecutionStats(range),
      timeRange: range
    }

    // 保存摘要到文件
    try {
      await fs.writeJSON(this.summaryFile, summary, { spaces: 2 })
    } catch (error) {
      console.error('[统计服务] 保存摘要失败:', error)
    }

    return summary
  }

  /**
   * 获取统计摘要
   */
  public async getSummary(timeRange?: { start: number; end: number }): Promise<StatisticsSummary> {
    // 如果有时间范围参数,实时生成
    if (timeRange) {
      return this.generateSummary(timeRange)
    }

    // 否则尝试加载缓存的摘要
    try {
      if (await fs.pathExists(this.summaryFile)) {
        return await fs.readJSON(this.summaryFile)
      }
    } catch (error) {
      console.error('[统计服务] 加载摘要失败:', error)
    }

    // 生成新摘要
    return this.generateSummary()
  }

  /**
   * 清理过期数据
   */
  public async cleanup(daysToKeep: number = 90): Promise<void> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
    const originalLength = this.events.length

    this.events = this.events.filter(e => e.timestamp > cutoffTime)

    await this.saveEvents()

    console.log(`[统计服务] 清理完成,删除了 ${originalLength - this.events.length} 个过期事件`)
  }

  /**
   * 导出统计数据
   */
  public async exportStats(exportPath: string): Promise<void> {
    const summary = await this.generateSummary()
    await fs.writeJSON(exportPath, {
      summary,
      events: this.events,
      exportTime: Date.now()
    }, { spaces: 2 })
  }

  /**
   * 关闭统计服务
   */
  public async shutdown(): Promise<void> {
    console.log('[统计服务] 关闭中...')

    // 停止自动保存
    this.stopAutoSave()

    // 记录应用关闭
    this.recordEvent(StatEventType.APP_CLOSE)

    // 保存最终数据
    await this.saveEvents()
    await this.generateSummary()

    console.log('[统计服务] 已关闭')
  }
}

// 导出单例
export const statisticsService = new StatisticsService()
