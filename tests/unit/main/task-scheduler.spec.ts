/**
 * TaskScheduler 单元测试
 * @description 验证 node-cron 4 升级后，规则注册与启用状态保持原有语义。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rule } from '../../../src/shared/types/rule'

const { cronTask, createTask } = vi.hoisted(() => {
  const task = {
    start: vi.fn(),
    stop: vi.fn()
  }

  return {
    cronTask: task,
    createTask: vi.fn(() => task)
  }
})

vi.mock('node-cron', () => ({
  createTask
}))

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { TaskScheduler } from '../../../src/main/task-scheduler'

/**
 * 创建调度测试所需的最小规则
 * @param enabled 是否启用规则
 * @returns 可生成有效 cron expression 的规则
 */
function createRule(enabled: boolean): Rule {
  return {
    id: enabled ? 'enabled-rule' : 'disabled-rule',
    name: enabled ? 'Enabled rule' : 'Disabled rule',
    enabled,
    priority: 1,
    condition: {
      type: 'time',
      operator: 'between',
      value: ['09:00', '10:00']
    },
    action: {
      type: 'notification',
      params: {}
    },
    createdAt: new Date('2026-07-12T00:00:00.000Z'),
    updatedAt: new Date('2026-07-12T00:00:00.000Z'),
    executionCount: 0
  }
}

describe('TaskScheduler（node-cron 4 调度语义）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disabled rule 应创建 task 但不启动', () => {
    const scheduler = new TaskScheduler()
    scheduler.start()
    scheduler.addRule(createRule(false))

    expect(createTask).toHaveBeenCalledOnce()
    expect(cronTask.start).not.toHaveBeenCalled()
  })

  it('enabled rule 应在创建后显式启动', () => {
    const scheduler = new TaskScheduler()
    scheduler.start()
    scheduler.addRule(createRule(true))

    expect(createTask).toHaveBeenCalledOnce()
    expect(cronTask.start).toHaveBeenCalledOnce()
  })
})
