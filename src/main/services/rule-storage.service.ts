/**
 * @file src/main/services/rule-storage.service.ts
 * @description 负责自动化规则的持久化存储和检索
 */

import { promises as fs } from 'fs';
import { pathManager } from '../utils/path-manager';
import { AutomationRule } from '@shared/types/rules';
import { logger } from '../utils/logger';
import { writeJsonAtomic } from '../utils/atomic-json-writer';

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
    } catch {
      logger.info('规则文件不存在，正在创建...');
      try {
        await this.writeRules([]);
      } catch (error) {
        // 初始化创建失败不致命（readRules 会返回 [] 兜底），仅记录日志
        logger.error('初始化规则文件失败:', error);
      }
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
      await writeJsonAtomic(this.storagePath, rules);
    } catch (error) {
      logger.error('写入规则文件失败:', error);
      // 抛出错误让调用方感知失败（修复原 catch 吞错导致规则静默丢失的 P0 缺陷）
      throw new Error(`写入规则文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const ruleStorageService = new RuleStorageService();
