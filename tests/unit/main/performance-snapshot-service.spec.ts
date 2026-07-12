/**
 * @file tests/unit/main/performance-snapshot-service.spec.ts
 * @description 验证性能 snapshot 只在调用时采集并正确汇总 Electron process metrics。
 */

import { describe, expect, it, vi } from 'vitest'

const { getAppMetrics } = vi.hoisted(() => ({
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
  ])
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

import { PerformanceSnapshotService } from '../../../src/main/services/performance-snapshot-service'

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
})
