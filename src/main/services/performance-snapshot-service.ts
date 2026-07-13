/**
 * @file src/main/services/performance-snapshot-service.ts
 * @description 按用户请求采集 Electron 进程性能 snapshot，并以 UTF-8 JSON 导出到本地。
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { writeJsonAtomic } from '../utils/atomic-json-writer'
import { pathManager } from '../utils/path-manager'
import {
  validateRendererPerformanceTimings,
  type PerformanceSnapshot
} from '@shared/performance'
import {
  RuntimePerformanceTelemetry,
  runtimePerformanceTelemetry
} from './runtime-performance-telemetry'

/**
 * Performance snapshot service
 * @description 不定时采样、不上传；只有 IPC 明确调用时才采集或导出。
 */
export class PerformanceSnapshotService {
  /**
   * 创建 performance snapshot service。
   * @param performanceTelemetry 被动维护的 main runtime metrics provider
   */
  constructor(
    private readonly performanceTelemetry: RuntimePerformanceTelemetry = runtimePerformanceTelemetry
  ) {}

  /**
   * 采集当前 Electron process snapshot
   * @param rendererTimingsInput 可选且不可信的 renderer timing summary；进入 snapshot 前强制校验
   * @returns 可序列化性能数据
   */
  public capture(rendererTimingsInput?: unknown): PerformanceSnapshot {
    const rendererTimings = validateRendererPerformanceTimings(rendererTimingsInput)
    const processes = app.getAppMetrics().map((metric) => ({
      type: metric.type,
      pid: metric.pid,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKb: metric.memory.workingSetSize,
      peakWorkingSetKb: metric.memory.peakWorkingSetSize,
      privateBytesKb: metric.memory.privateBytes
    }))

    const snapshot: PerformanceSnapshot = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: process.uptime(),
      mainMemoryUsage: process.memoryUsage(),
      processes,
      totalWorkingSetKb: processes.reduce((total, metric) => total + metric.workingSetKb, 0),
      runtimeMetrics: this.performanceTelemetry.getSnapshot()
    }

    if (rendererTimings !== undefined) {
      snapshot.rendererTimings = rendererTimings
    }

    return snapshot
  }

  /**
   * 导出当前 snapshot 到 .ccb/performance
   * @param rendererTimingsInput 可选且不可信的 renderer timing summary
   * @returns 导出文件绝对路径
   */
  public async exportSnapshot(rendererTimingsInput?: unknown): Promise<string> {
    const snapshot = this.capture(rendererTimingsInput)
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
