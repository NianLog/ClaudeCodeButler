/**
 * @file src/main/services/rule-engine.service.ts
 * @description 自动化规则引擎，负责调度和执行规则
 */

import * as cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { ruleStorageService } from './rule-storage.service';
import { ConfigService } from './config-service';
import { AutomationRule, RuleId, Action, SwitchConfigAction, CustomCommandAction } from '@shared/types/rules';
import { logger } from '../utils/logger';
import { pathManager } from '../utils/path-manager';
import { logStorageService } from './log-storage.service';
import { CONFIG_FILES } from '@shared/constants';
import { BrowserWindow, Notification } from 'electron';
import { executeCommand } from '../utils/command-executor';

class RuleEngineService {
  private cronJobs = new Map<RuleId, cron.ScheduledTask>();
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }

  /**
   * 启动规则引擎
   */
  public async start(): Promise<void> {
    logger.info('启动规则引擎...');
    const rules = await ruleStorageService.readRules();
    logger.info(`加载了 ${rules.length} 条规则。`);
    rules.forEach(rule => {
      if (rule.enabled) {
        this.scheduleRule(rule);
      }
    });
    logger.info(`${this.cronJobs.size} 条规则已被调度。`);
  }

  /**
   * 停止规则引擎
   */
  public stop(): void {
    logger.info('停止规则引擎...');
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs.clear();
    logger.info('所有已调度的任务已停止。');
  }

  /**
   * 调度一条规则
   * @param rule 要调度的规则
   */
  /**
   * 校验定时触发器参数（时间格式 + 日期非空）
   * @throws 若 time 格式或 days 非法，供 createRule/updateRule 在保存前拒绝非法输入
   */
  private assertValidTimeTrigger(time: string, days: unknown): void {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      throw new Error(`无效的触发时间格式 "${time}"，应为 HH:MM（24小时制，如 09:30）`);
    }
    if (!Array.isArray(days) || days.length === 0) {
      throw new Error('触发日期不能为空');
    }
    if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      throw new Error('无效的触发日期，应为 0-6 的数字数组（0=周日）');
    }
  }

  private scheduleRule(rule: AutomationRule): void {
    if (this.cronJobs.has(rule.id)) {
      this.unscheduleRule(rule.id);
    }

    if (rule.trigger.type === 'time') {
      const { time, days } = rule.trigger;
      // v1.4.0 边界校验：先验证 time/days，避免构造出无效或恒不触发的 cron 表达式
      try {
        this.assertValidTimeTrigger(time, days);
      } catch (error) {
        logger.error(`规则 "${rule.name}" 触发器无效，未调度: ${error instanceof Error ? error.message : error}`);
        return;
      }

      const [hour, minute] = time.split(':');
      const cronExpression = `${minute} ${hour} * * ${days.join(',')}`;

      if (!cron.validate(cronExpression)) {
        logger.error(`无效的 Cron 表达式: ${cronExpression} (规则ID: ${rule.id})`);
        return;
      }

      const job = cron.schedule(cronExpression, () => {
        logger.info(`触发规则: "${rule.name}" (ID: ${rule.id})`);
        void this.executeRuleAction(rule, 'auto')
      });

      this.cronJobs.set(rule.id, job);
      logger.info(`规则 "${rule.name}" 已调度, Cron: [${cronExpression}]`);
    }
  }

  /**
   * 取消调度一条规则
   * @param ruleId 要取消的规则ID
   */
  private unscheduleRule(ruleId: RuleId): void {
    const job = this.cronJobs.get(ruleId);
    if (job) {
      job.stop();
      this.cronJobs.delete(ruleId);
      logger.info(`规则 (ID: ${ruleId}) 已被取消调度。`);
    }
  }

  /**
   * 执行规则定义的动作
   * @param rule 规则对象
   */
  private async executeRuleAction(rule: AutomationRule, trigger: 'auto' | 'manual' = 'auto'): Promise<{ success: boolean; message: string; result?: unknown }> {
    const actionType = rule.action.type

    try {
      let message = ''
      let result: unknown = undefined

      if (actionType === 'switch-config') {
        const action = rule.action as SwitchConfigAction
        result = await this.executeSwitchConfigAction(rule, action)
        message = `规则 "${rule.name}" 已成功执行，配置已切换。`
        this.sendNotification('配置自动切换', message)
      } else if (actionType === 'custom-command') {
        const action = rule.action as CustomCommandAction
        result = await this.executeCustomCommandAction(rule, action)
        message = `规则 "${rule.name}" 命令执行完成。`
        // v1.4.0 UX：自定义命令执行成功也推送通知（自动触发/手动触发均通知，让用户感知规则已执行）
        this.sendNotification(`规则执行${trigger === 'manual' ? '（手动）' : '（自动）'}`, message)
      } else {
        throw new Error(`未支持的动作类型: ${(rule.action as Action).type}`)
      }

      await logStorageService.addLog({
        ruleId: rule.id,
        ruleName: rule.name,
        timestamp: new Date().toISOString(),
        success: true,
        message
      })

      return { success: true, message, result }
    } catch (error) {
      const errorMessage = `执行规则 "${rule.name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`
      logger.error(errorMessage)
      if (actionType === 'switch-config' || trigger === 'manual') {
        this.sendNotification('规则执行失败', errorMessage)
      }
      await logStorageService.addLog({
        ruleId: rule.id,
        ruleName: rule.name,
        timestamp: new Date().toISOString(),
        success: false,
        message: errorMessage
      })
      return { success: false, message: errorMessage }
    }
  }

  /**
   * 执行切换配置文件的动作
   * @param rule 规则对象
   */
  private async executeSwitchConfigAction(_rule: AutomationRule, action: SwitchConfigAction): Promise<{ targetPath: string }> {
    const targetPath = pathManager.getClaudeConfigPath(CONFIG_FILES.SETTINGS)
    logger.info(`执行切换配置动作: 从 "${action.targetConfigPath}" 到 "${targetPath}"`)

    const contentToSwitch = await this.configService.getConfig(action.targetConfigPath)
    await this.configService.saveConfig(targetPath, contentToSwitch)

    return { targetPath }
  }

  /**
   * 执行自定义命令动作
   */
  private async executeCustomCommandAction(rule: AutomationRule, action: CustomCommandAction): Promise<{ stdout: string; stderr: string }> {
    logger.info(`执行自定义命令动作: ${rule.name} -> ${action.command}`)

    // v1.4.0 安全重做：改用参数化 command-executor（spawn shell:false + 元字符黑名单），
    // 消除原 terminalManagementService.executeCommand 的 shell 拼接导致的任意命令执行（RCE）风险。
    const result = await executeCommand(action.command, {
      cwd: action.workingDirectory,
      timeout: action.timeout || 10000
    })

    if (!result.success) {
      throw result.error || new Error(`自定义命令执行失败 (exit ${result.exitCode})`)
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr
    }
  }

  /**
   * 向渲染进程发送通知
   * @param title 标题
   * @param body 内容
   */
  private sendNotification(title: string, body: string): void {
    try {
      // v1.4.0：主进程直接显示系统通知（Electron Notification API），不依赖 renderer 监听链路
      // 原实现仅 webContents.send('notification:show')，但 renderer 无对应 ipcRenderer.on 监听，链路断裂
      if (Notification.isSupported()) {
        new Notification({ title, body }).show()
      }
      // 同时通过 IPC 通知 renderer（兼容可能存在的应用内通知监听）
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('notification:show', { title, body })
      }
    } catch (error) {
      logger.error('发送系统通知失败', error)
    }
  }

  // --- 公共管理方法 ---

  public async getAllRules(): Promise<AutomationRule[]> {
    return await ruleStorageService.readRules();
  }

  /**
   * 手动执行规则
   */
  public async executeRuleManually(ruleId: RuleId): Promise<{ success: boolean; message: string; result?: unknown }> {
    const rules = await this.getAllRules()
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) {
      throw new Error(`规则不存在: ${ruleId}`)
    }

    const result = await this.executeRuleAction(rule, 'manual')
    if (!result.success) {
      throw new Error(result.message)
    }
    return result
  }

  public async createRule(newRuleData: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutomationRule> {
    // v1.4.0 边界校验：保存前拒绝非法的定时触发器，避免静默创建不可用的规则
    if (newRuleData.trigger?.type === 'time') {
      this.assertValidTimeTrigger(newRuleData.trigger.time, newRuleData.trigger.days);
    }
    const now = new Date().toISOString();
    const rule: AutomationRule = {
      ...newRuleData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    const rules = await this.getAllRules();
    rules.push(rule);
    await ruleStorageService.writeRules(rules);

    if (rule.enabled) {
      this.scheduleRule(rule);
    }
    logger.info(`新规则 "${rule.name}" 已创建。`);
    return rule;
  }

  public async updateRule(ruleId: RuleId, updates: Partial<AutomationRule>): Promise<AutomationRule | null> {
    // v1.4.0 边界校验：更新前拒绝非法的定时触发器
    if (updates.trigger?.type === 'time') {
      this.assertValidTimeTrigger(updates.trigger.time, updates.trigger.days);
    }
    const rules = await this.getAllRules();
    const ruleIndex = rules.findIndex(r => r.id === ruleId);

    if (ruleIndex === -1) {
      logger.warn(`尝试更新一个不存在的规则: ${ruleId}`);
      return null;
    }

    const originalRule = rules[ruleIndex];
    const updatedRule = { 
      ...originalRule, 
      ...updates, 
      id: originalRule.id, // 确保ID不变
      updatedAt: new Date().toISOString() 
    };
    rules[ruleIndex] = updatedRule;
    await ruleStorageService.writeRules(rules);

    // 重新调度
    this.unscheduleRule(ruleId);
    if (updatedRule.enabled) {
      this.scheduleRule(updatedRule);
    }

    logger.info(`规则 "${updatedRule.name}" 已更新。`);
    return updatedRule;
  }

  public async deleteRule(ruleId: RuleId): Promise<void> {
    let rules = await this.getAllRules();
    const initialLength = rules.length;
    rules = rules.filter(r => r.id !== ruleId);

    if (rules.length < initialLength) {
      await ruleStorageService.writeRules(rules);
      this.unscheduleRule(ruleId);
      logger.info(`规则 (ID: ${ruleId}) 已被删除。`);
    } else {
      logger.warn(`尝试删除一个不存在的规则: ${ruleId}`);
    }
  }
}

export const ruleEngineService = new RuleEngineService();
