/**
 * @file src/main/services/rule-engine.service.ts
 * @description 自动化规则引擎，负责调度和执行规则
 */

import * as cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { ruleStorageService } from './rule-storage.service';
import { ConfigService } from './config-service';
import { AutomationRule, RuleId, Action, SwitchConfigAction } from '@shared/types/rules';
import { logger } from '../utils/logger';
import { pathManager } from '../utils/path-manager';
import { logStorageService } from './log-storage.service';
import { CONFIG_FILES } from '@shared/constants';
import { BrowserWindow } from 'electron';

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
  private scheduleRule(rule: AutomationRule): void {
    if (this.cronJobs.has(rule.id)) {
      this.unscheduleRule(rule.id);
    }

    if (rule.trigger.type === 'time') {
      const { time, days } = rule.trigger;
      const [hour, minute] = time.split(':');
      const cronExpression = `${minute} ${hour} * * ${days.join(',')}`;

      if (!cron.validate(cronExpression)) {
        logger.error(`无效的 Cron 表达式: ${cronExpression} (规则ID: ${rule.id})`);
        return;
      }

      const job = cron.schedule(cronExpression, () => {
        logger.info(`触发规则: "${rule.name}" (ID: ${rule.id})`);
        this.executeRuleAction(rule);
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
  private async executeRuleAction(rule: AutomationRule): Promise<void> {
    if (rule.action.type === 'switch-config') {
      await this.executeSwitchConfigAction(rule);
    }
    // 未来可扩展其他动作类型
  }

  /**
   * 执行切换配置文件的动作
   * @param rule 规则对象
   */
  private async executeSwitchConfigAction(rule: AutomationRule): Promise<void> {
    const { action, id, name } = rule;
    const successMessage = `规则 "${name}" 已成功执行，配置已切换。`;
    let errorMessage = `执行规则 "${name}" 失败。`;
    try {
      const targetPath = pathManager.getClaudeConfigPath(CONFIG_FILES.SETTINGS);
      logger.info(`执行切换配置动作: 从 "${action.targetConfigPath}" 到 "${targetPath}"`);

      const contentToSwitch = await this.configService.getConfig(action.targetConfigPath);
      await this.configService.saveConfig(targetPath, contentToSwitch);

      logger.info(successMessage);
      this.sendNotification('配置自动切换', successMessage);
      await logStorageService.addLog({ ruleId: id, ruleName: name, timestamp: new Date().toISOString(), success: true, message: successMessage });

    } catch (error) {
      errorMessage = `执行规则 "${name}" 失败: ${error instanceof Error ? error.message : '未知错误'}`;
      logger.error(errorMessage);
      this.sendNotification('配置切换失败', errorMessage);
      await logStorageService.addLog({ ruleId: id, ruleName: name, timestamp: new Date().toISOString(), success: false, message: errorMessage });
    }
  }

  /**
   * 向渲染进程发送通知
   * @param title 标题
   * @param body 内容
   */
  private sendNotification(title: string, body: string): void {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('notification:show', { title, body });
    }
  }

  // --- 公共管理方法 ---

  public async getAllRules(): Promise<AutomationRule[]> {
    return await ruleStorageService.readRules();
  }

  public async createRule(newRuleData: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AutomationRule> {
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
