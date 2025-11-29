/**
 * 自动化规则相关类型定义
 */

/**
 * 规则配置
 */
export interface Rule {
  /** 规则ID */
  id: string
  /** 规则名称 */
  name: string
  /** 规则描述 */
  description?: string
  /** 是否启用 */
  enabled: boolean
  /** 优先级（数字越大优先级越高） */
  priority: number
  /** 触发条件 */
  condition: RuleCondition
  /** 执行动作 */
  action: RuleAction
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
  /** 最后执行时间 */
  lastExecuted?: Date
  /** 执行次数 */
  executionCount: number
}

/**
 * 规则条件
 */
export interface RuleCondition {
  /** 条件类型 */
  type: 'time' | 'date' | 'weekday' | 'custom'
  /** 操作符 */
  operator: 'equals' | 'between' | 'in' | 'custom'
  /** 条件值 */
  value: any
}

/**
 * 时间条件
 */
export interface TimeCondition {
  /** 开始时间 (HH:mm) */
  startTime: string
  /** 结束时间 (HH:mm) */
  endTime: string
}

/**
 * 日期条件
 */
export interface DateCondition {
  /** 开始日期 */
  startDate: string
  /** 结束日期 */
  endDate: string
}

/**
 * 星期条件
 */
export interface WeekdayCondition {
  /** 星期几 (0-6, 0=Sunday) */
  weekdays: number[]
}

/**
 * 规则动作
 */
export interface RuleAction {
  /** 动作类型 */
  type: 'switchConfig' | 'notification' | 'custom'
  /** 动作参数 */
  params: Record<string, any>
}

/**
 * 规则执行结果
 */
export interface RuleExecution {
  /** 规则ID */
  ruleId: string
  /** 执行时间 */
  timestamp: Date
  /** 是否成功 */
  success: boolean
  /** 执行结果 */
  result?: any
  /** 错误信息 */
  error?: string
  /** 执行耗时（毫秒） */
  duration: number
}

/**
 * 执行日志
 */
export interface ExecutionLog {
  /** 日志ID */
  id: string
  /** 规则ID */
  ruleId: string
  /** 规则名称 */
  ruleName: string
  /** 执行时间 */
  timestamp: Date
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
  /** 上下文信息 */
  context?: Record<string, any>
}