/**
 * @file src/shared/types/rules.ts
 * @description 自动化规则相关类型定义
 */

/**
 * 规则的唯一标识符
 */
export type RuleId = string;

/**
 * 触发器类型
 * - time: 基于时间的触发器
 */
export type TriggerType = 'time';

/**
 * 动作类型
 * - switch-config: 切换配置文件
 */
export type ActionType = 'switch-config' | 'custom-command';

/**
 * 基于时间的触发器配置
 */
export interface TimeTrigger {
  type: 'time';
  /**
   * 触发的具体时间，格式为 HH:mm
   */
  time: string;
  /**
   * 重复周期，数组中的数字代表星期几 (0=周日, 1=周一, ..., 6=周六)
   */
  days: number[];
}

// 未来可扩展更多触发器类型
// export interface AppFocusTrigger {
//   type: 'app-focus';
//   appName: string;
// }

export type Trigger = TimeTrigger; // | AppFocusTrigger;

/**
 * 切换配置文件的动作
 */
export interface SwitchConfigAction {
  type: 'switch-config';
  /**
   * 目标配置文件的路径
   */
  targetConfigPath: string;
}

/**
 * 执行自定义命令的动作
 */
export interface CustomCommandAction {
  type: 'custom-command';
  /**
   * 要执行的命令
   */
  command: string;
  /**
   * 可选工作目录
   */
  workingDirectory?: string;
  /**
   * 超时时间（毫秒）
   */
  timeout?: number;
}

// 未来可扩展更多动作类型
// export interface SendNotificationAction {
//   type: 'send-notification';
//   message: string;
// }

export type Action = SwitchConfigAction | CustomCommandAction; // | SendNotificationAction;

/**
 * 自动化规则的完整定义
 */
export interface AutomationRule {
  id: RuleId;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  action: Action;
  createdAt: string;
  updatedAt: string;
}

/**
 * 规则执行日志（用于展示）
 */
export interface RuleExecutionLog {
  id: string;
  ruleId: RuleId;
  ruleName: string;
  timestamp: string;
  success: boolean;
  message: string;
}

/**
 * 规则执行结果
 */
export interface RuleExecutionResult {
  success: boolean;
  message: string;
  result?: any;
}
