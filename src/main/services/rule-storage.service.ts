/**
 * @file src/main/services/rule-storage.service.ts
 * @description 负责自动化规则的持久化存储和检索
 */

import { promises as fs } from 'fs';
import { pathManager } from '../utils/path-manager';
import { AutomationRule } from '@shared/types/rules';
import { logger } from '../utils/logger';

class RuleStorageService {
  private readonly storagePath: string;

  constructor() {
    this.storagePath = pathManager.rulesFile;
    this.ensureStorageFile();
  }

  /**
   * 确保规则存储文件存在
   */
  private async ensureStorageFile(): Promise<void> {
    try {
      await fs.access(this.storagePath);
    } catch (error) {
      logger.info('规则文件不存在，正在创建...');
      await this.writeRules([]);
    }
  }

  /**
   * 从文件读取所有规则
   * @returns {Promise<AutomationRule[]>} 规则数组
   */
  public async readRules(): Promise<AutomationRule[]> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      return JSON.parse(data) as AutomationRule[];
    } catch (error) {
      logger.error('读取规则文件失败:', error);
      return [];
    }
  }

  /**
   * 将所有规则写入文件
   * @param {AutomationRule[]} rules - 要写入的规则数组
   * @returns {Promise<void>}
   */
  public async writeRules(rules: AutomationRule[]): Promise<void> {
    try {
      const data = JSON.stringify(rules, null, 2);
      await fs.writeFile(this.storagePath, data, 'utf-8');
    } catch (error) {
      logger.error('写入规则文件失败:', error);
    }
  }
}

export const ruleStorageService = new RuleStorageService();
