/**
 * @file ruleStore.ts
 * @description 自动化规则的 Zustand 状态管理
 */

import { create } from 'zustand';
import { AutomationRule } from '@shared/types/rules';

interface RuleState {
  rules: AutomationRule[];
  selectedRule: AutomationRule | null;
  isLoading: boolean;
  error: string | null;
  executionLogs: any[]; // 暂定为 any
  stats: any; // 暂定为 any
}

interface RuleActions {
  setSelectedRule: (rule: AutomationRule | null) => void;
  refreshRules: () => Promise<void>;
  createRule: (newRuleData: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateRule: (ruleId: string, updates: Partial<AutomationRule>) => Promise<void>;
  deleteRule: (ruleId: string) => Promise<void>;
  toggleRule: (ruleId: string, enabled: boolean) => Promise<void>;
  executeRule: (ruleId: string) => Promise<void>; // 占位
  loadExecutionLogs: () => Promise<void>; // 占位
  loadStats: () => Promise<void>; // 占位
}

export const useRuleStore = create<RuleState & RuleActions>((set, get) => ({
  // 初始状态
  rules: [],
  selectedRule: null,
  isLoading: false,
  error: null,
  executionLogs: [],
  stats: { totalRules: 0, activeRules: 0, totalExecutions: 0, failedExecutions: 0 },

  // Actions
  setSelectedRule: (rule) => set({ selectedRule: rule }),

  refreshRules: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI.rule.list();
      if (result.success) {
        set({ rules: result.data, isLoading: false });
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      set({ error: `加载规则失败: ${error}`, isLoading: false });
    }
  },

  createRule: async (newRuleData) => {
    try {
      const result = await window.electronAPI.rule.create(newRuleData);
      if (result.success) {
        await get().refreshRules(); // 重新加载列表
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      console.error('创建规则失败:', error);
      throw new Error(`创建规则失败: ${error}`);
    }
  },

  updateRule: async (ruleId, updates) => {
    try {
      const result = await window.electronAPI.rule.update(ruleId, updates);
      if (result.success) {
        await get().refreshRules(); // 重新加载列表
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      console.error('更新规则失败:', error);
      throw new Error(`更新规则失败: ${error}`);
    }
  },

  deleteRule: async (ruleId) => {
    try {
      const result = await window.electronAPI.rule.delete(ruleId);
      if (result.success) {
        await get().refreshRules(); // 重新加载列表
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      console.error('删除规则失败:', error);
      throw new Error(`删除规则失败: ${error}`);
    }
  },

  toggleRule: async (ruleId, enabled) => {
    try {
      const result = await window.electronAPI.rule.toggle(ruleId, enabled);
       if (result.success) {
        // 局部更新状态，避免重新请求列表，优化体验
        set(state => ({
          rules: state.rules.map(r => r.id === ruleId ? { ...r, enabled } : r)
        }));
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      console.error('切换规则状态失败:', error);
      throw new Error(`切换规则状态失败: ${error}`);
    }
  },

  // --- 占位函数 ---
  executeRule: async (ruleId) => {
    console.warn('executeRule 功能尚未实现', ruleId);
    // 未来实现: await window.electronAPI.rule.execute(ruleId);
  },

  loadExecutionLogs: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.rule.getExecutionLog();
      if (result.success) {
        set({ executionLogs: result.data, isLoading: false });
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      set({ error: `加载执行日志失败: ${error}`, isLoading: false });
    }
  },

  loadStats: async () => {
    try {
      const result = await window.electronAPI.rule.getStats();
      if (result.success) {
        set({ stats: result.data });
      } else {
        throw new Error(result.error);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : '未知错误';
      console.error('加载统计数据失败:', error);
    }
  },
}));
