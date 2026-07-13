/**
 * @file tests/unit/main/runtime-performance-telemetry.spec.ts
 * @description 验证 main runtime telemetry 的聚合、规范化与防御性复制语义。
 */

import { describe, expect, it } from 'vitest'
import { RuntimePerformanceTelemetry } from '../../../src/main/services/runtime-performance-telemetry'

describe('RuntimePerformanceTelemetry', () => {
  it('聚合多个 active watcher 并在 stop 后移除对应计数', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const firstWatcher = Symbol('first')
    const secondWatcher = Symbol('second')

    telemetry.markFileWatcherActive(firstWatcher)
    telemetry.updateFileWatcher(firstWatcher, 2, 5)
    telemetry.updateFileWatcher(secondWatcher, 3, 7)

    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 2,
      watchedDirectoryCount: 5,
      watchedEntryCount: 12
    })

    telemetry.removeFileWatcher(firstWatcher)
    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 1,
      watchedDirectoryCount: 3,
      watchedEntryCount: 7
    })
  })

  it('规范化异常数值并返回 lastConfigScan 防御性副本', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const watcherId = Symbol('watcher')
    telemetry.updateFileWatcher(watcherId, Number.NaN, -4)
    telemetry.recordConfigScan({
      completedAt: '2026-07-13T05:00:00.000Z',
      durationMs: Number.POSITIVE_INFINITY,
      filesVisited: 3.9,
      configsLoaded: -1,
      success: false
    })

    const firstSnapshot = telemetry.getSnapshot()
    expect(firstSnapshot).toEqual({
      activeWatcherCount: 1,
      watchedDirectoryCount: 0,
      watchedEntryCount: 0,
      lastConfigScan: {
        completedAt: '2026-07-13T05:00:00.000Z',
        durationMs: 0,
        filesVisited: 3,
        configsLoaded: 0,
        success: false
      }
    })

    const mutableScan = firstSnapshot.lastConfigScan as { filesVisited: number }
    mutableScan.filesVisited = 999
    expect(telemetry.getSnapshot().lastConfigScan?.filesVisited).toBe(3)
  })
})
