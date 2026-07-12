/**
 * @file src/main/services/performance-snapshot-service.ts
 * @description 按用户请求采集 Electron 进程性能 snapshot，并以 UTF-8 JSON 导出到本地。
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { writeJsonAtomic } from '../utils/atomic-json-writer'
import { pathManager } from '../utils/path-manager'
import type { PerformanceSnapshot } from '@shared/performance'

/**
 * Performance snapshot service
 * @description 不定时采样、不上传；只有 IPC 明确调用时才采集或导出。
 */
export class PerformanceSnapshotService {
  /**
   * 采集当前 Electron process snapshot
   * @returns 可序列化性能数据
   */
  public capture(): PerformanceSnapshot {
    const processes = app.getAppMetrics().map((metric) => ({
      type: metric.type,
      pid: metric.pid,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKb: metric.memory.workingSetSize,
      peakWorkingSetKb: metric.memory.peakWorkingSetSize,
      privateBytesKb: metric.memory.privateBytes
    }))

    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: process.uptime(),
      mainMemoryUsage: process.memoryUsage(),
      processes,
      totalWorkingSetKb: processes.reduce((total, metric) => total + metric.workingSetKb, 0)
    }
  }

  /**
   * 导出当前 snapshot 到 .ccb/performance
   * @returns 导出文件绝对路径
   */
  public async exportSnapshot(): Promise<string> {
    const snapshot = this.capture()
    const safeTimestamp = snapshot.capturedAt.replace(/[:.]/g, '-')
    const outputDirectory = path.join(pathManager.appDataDir, 'performance')
    const outputPath = path.join(outputDirectory, `performance-${safeTimestamp}.json`)
    await fs.mkdir(outputDirectory, { recursive: true })
    await writeJsonAtomic(outputPath, snapshot)
    return outputPath
  }
}

/** 默认性能 snapshot service */
export const performanceSnapshotService = new PerformanceSnapshotService()
