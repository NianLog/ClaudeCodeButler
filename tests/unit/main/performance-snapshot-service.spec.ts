/**
 * @file tests/unit/main/performance-snapshot-service.spec.ts
 * @description 验证性能 snapshot 只在调用时采集并正确汇总 Electron process metrics。
 */

import { describe, expect, it, vi } from 'vitest'

const { getAppMetrics, mkdir, writeJsonAtomic } = vi.hoisted(() => ({
  getAppMetrics: vi.fn(() => [
    {
      type: 'Browser',
      pid: 100,
      cpu: { percentCPUUsage: 1.25 },
      memory: { workingSetSize: 1000, peakWorkingSetSize: 1500, privateBytes: 800 }
    },
    {
      type: 'Tab',
      pid: 101,
      cpu: { percentCPUUsage: 2.5 },
      memory: { workingSetSize: 2000, peakWorkingSetSize: 2500 }
    }
  ]),
  mkdir: vi.fn(async () => undefined),
  writeJsonAtomic: vi.fn(async () => undefined)
}))

vi.mock('electron', () => ({
  app: {
    getAppMetrics,
    getVersion: vi.fn(() => '1.5.0')
  }
}))

vi.mock('../../../src/main/utils/path-manager', () => ({
  pathManager: { appDataDir: 'C:\\test\\.ccb' }
}))

vi.mock('fs', () => ({
  promises: { mkdir }
}))

vi.mock('../../../src/main/utils/atomic-json-writer', () => ({
  writeJsonAtomic
}))

import { PerformanceSnapshotService } from '../../../src/main/services/performance-snapshot-service'
import { RuntimePerformanceTelemetry } from '../../../src/main/services/runtime-performance-telemetry'

describe('PerformanceSnapshotService', () => {
  it('构造时不应自动采样', () => {
    new PerformanceSnapshotService()

    expect(getAppMetrics).not.toHaveBeenCalled()
  })

  it('capture 应汇总所有 Electron process working set', () => {
    const service = new PerformanceSnapshotService()
    const snapshot = service.capture()

    expect(getAppMetrics).toHaveBeenCalledOnce()
    expect(snapshot.appVersion).toBe('1.5.0')
    expect(snapshot.processes).toHaveLength(2)
    expect(snapshot.totalWorkingSetKb).toBe(3000)
    expect(snapshot.processes[1].privateBytesKb).toBeUndefined()
  })

  it('exportSnapshot 应写入 main 校验后的 renderer timing summary', async () => {
    const service = new PerformanceSnapshotService()
    const rendererTimings = [
      {
        name: 'ccb-app-init-duration',
        entryType: 'MEASURE',
        startTimeMs: 12,
        durationMs: 248.5,
        ignored: 'renderer-controlled field'
      }
    ]

    const outputPath = await service.exportSnapshot(rendererTimings)

    expect(outputPath).toContain('performance-')
    expect(mkdir).toHaveBeenCalledOnce()
    expect(writeJsonAtomic).toHaveBeenCalledOnce()
    expect(writeJsonAtomic.mock.calls[0][1]).toMatchObject({
      rendererTimings: [{
        name: 'ccb-app-init-duration',
        entryType: 'MEASURE',
        startTimeMs: 12,
        durationMs: 248.5
      }]
    })
    expect(writeJsonAtomic.mock.calls[0][1]).not.toHaveProperty('rendererTimings.0.ignored')
  })

  it.each([
    {
      label: 'unknown name',
      value: [{ name: 'attacker-entry', entryType: 'MEASURE', startTimeMs: 0, durationMs: 1 }]
    },
    {
      label: 'wrong entry type',
      value: [{ name: 'ccb-app-init-duration', entryType: 'MARK', startTimeMs: 0, durationMs: 1 }]
    },
    {
      label: 'negative duration',
      value: [{ name: 'ccb-app-init-duration', entryType: 'MEASURE', startTimeMs: 0, durationMs: -1 }]
    },
    {
      label: 'non-finite duration',
      value: [{ name: 'ccb-app-init-duration', entryType: 'MEASURE', startTimeMs: 0, durationMs: Number.POSITIVE_INFINITY }]
    },
    {
      label: 'too many entries',
      value: Array.from({ length: 4 }, (_, index) => ({
        name: 'ccb-app-init-duration',
        entryType: 'MEASURE',
        startTimeMs: index,
        durationMs: index
      }))
    }
  ])('拒绝 renderer 的不可信 timing payload: $label', ({ value }) => {
    const service = new PerformanceSnapshotService()

    expect(() => service.capture(value)).toThrow()
  })

  it('允许显式导出空 renderer timing summary', () => {
    const service = new PerformanceSnapshotService()

    expect(service.capture([]).rendererTimings).toEqual([])
  })

  it('capture 应包含 watcher 与最近配置扫描的只读副本', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const watcherId = Symbol('watcher')
    telemetry.markFileWatcherActive(watcherId)
    telemetry.updateFileWatcher(watcherId, 2, 5)
    telemetry.recordConfigScan({
      completedAt: '2026-07-13T05:00:00.000Z',
      durationMs: 42,
      filesVisited: 4,
      configsLoaded: 3,
      success: true
    })
    const service = new PerformanceSnapshotService(telemetry)

    const snapshot = service.capture()

    expect(snapshot.runtimeMetrics).toEqual({
      activeWatcherCount: 1,
      watchedDirectoryCount: 2,
      watchedEntryCount: 5,
      lastConfigScan: {
        completedAt: '2026-07-13T05:00:00.000Z',
        durationMs: 42,
        filesVisited: 4,
        configsLoaded: 3,
        success: true
      }
    })

    const mutableScan = snapshot.runtimeMetrics.lastConfigScan as { durationMs: number }
    mutableScan.durationMs = 999
    expect(service.capture().runtimeMetrics.lastConfigScan?.durationMs).toBe(42)
  })
})
