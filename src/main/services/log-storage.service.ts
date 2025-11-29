/**
 * @file src/main/services/log-storage.service.ts
 * @description 负责自动化规则执行日志的持久化存储
 */

import { promises as fs } from 'fs';
import { pathManager } from '../utils/path-manager';
import { logger } from '../utils/logger';

export interface RuleExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  timestamp: string;
  success: boolean;
  message: string;
}

const MAX_LOG_ENTRIES = 1000;

class LogStorageService {
  private readonly storagePath: string;

  constructor() {
    // We need to define this path in path-manager
    this.storagePath = pathManager.ruleExecutionsLogFile;
    this.ensureStorageFile();
  }

  private async ensureStorageFile(): Promise<void> {
    try {
      await fs.access(this.storagePath);
    } catch (error) {
      await this.writeLogs([]);
    }
  }

  public async readLogs(): Promise<RuleExecutionLog[]> {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      return JSON.parse(data) as RuleExecutionLog[];
    } catch (error) {
      logger.error('读取规则执行日志文件失败:', error);
      return [];
    }
  }

  public async writeLogs(logs: RuleExecutionLog[]): Promise<void> {
    try {
      const data = JSON.stringify(logs, null, 2);
      await fs.writeFile(this.storagePath, data, 'utf-8');
    } catch (error) {
      logger.error('写入规则执行日志文件失败:', error);
    }
  }

  public async addLog(logEntry: Omit<RuleExecutionLog, 'id'>): Promise<void> {
    try {
      const logs = await this.readLogs();
      const newLog: RuleExecutionLog = {
        ...logEntry,
        id: crypto.randomUUID(),
      };
      logs.unshift(newLog); // Add to the beginning

      // Trim logs if they exceed the max length
      if (logs.length > MAX_LOG_ENTRIES) {
        logs.splice(MAX_LOG_ENTRIES);
      }

      await this.writeLogs(logs);
    } catch (error) {
      logger.error('添加规则执行日志失败:', error);
    }
  }
}

export const logStorageService = new LogStorageService();
