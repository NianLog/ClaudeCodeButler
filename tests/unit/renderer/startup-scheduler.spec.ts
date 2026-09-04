/**
 * Renderer 启动任务调度工具回归测试。
 * 验证 timeout 释放、后台批次顺序与卸载取消语义。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleStartupBatches, withTimeout } from '../../../src/renderer/src/utils/startup-scheduler'

describe('startup scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('clears the timeout after the task resolves', async () => {
    await expect(withTimeout(Promise.resolve('ready'), 15_000, 'AppStore')).resolves.toBe('ready')

    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not execute a pending batch after cancellation', async () => {
    const task = vi.fn(async () => undefined)
    const schedule = scheduleStartupBatches([[task]])

    schedule.cancel()
    await vi.runAllTimersAsync()

    expect(task).not.toHaveBeenCalled()
  })

  it('waits for each batch before scheduling the next batch', async () => {
    const executionOrder: string[] = []
    let finishFirstBatch: (() => void) | undefined
    const firstTask = vi.fn(() => new Promise<void>((resolve) => {
      executionOrder.push('first:start')
      finishFirstBatch = () => {
        executionOrder.push('first:end')
        resolve()
      }
    }))
    const secondTask = vi.fn(async () => {
      executionOrder.push('second')
    })

    scheduleStartupBatches([[firstTask], [secondTask]])
    await vi.advanceTimersByTimeAsync(50)

    expect(executionOrder).toEqual(['first:start'])
    expect(secondTask).not.toHaveBeenCalled()

    finishFirstBatch?.()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(50)

    expect(executionOrder).toEqual(['first:start', 'first:end', 'second'])
  })
})
