/**
 * @file src/main/services/runtime-performance-telemetry.ts
 * @description 被动维护 watcher 与配置扫描指标；不创建 timer、不写盘、不上传。
 */

import type {
  ConfigScanRuntimeMetric,
  RuntimePerformanceMetrics
} from '@shared/performance'

/** 单个 active watcher 的内部计数。 */
interface FileWatcherRuntimeMetric {
  watchedDirectoryCount: number
  watchedEntryCount: number
}

/**
 * Main runtime performance telemetry
 * @description 仅由现有生命周期事件同步更新，snapshot capture 时返回防御性只读副本。
 */
export class RuntimePerformanceTelemetry {
  private readonly fileWatchers = new Map<symbol, FileWatcherRuntimeMetric>()
  private lastConfigScan: ConfigScanRuntimeMetric | null = null

  /**
   * 标记 watcher 已 ready；若尚无 topology 数据则从零开始。
   * @param watcherId watcher 实例私有标识
   */
  public markFileWatcherActive(watcherId: symbol): void {
    if (!this.fileWatchers.has(watcherId)) {
      this.fileWatchers.set(watcherId, {
        watchedDirectoryCount: 0,
        watchedEntryCount: 0
      })
    }
  }

  /**
   * 更新 active watcher 的 topology 计数。
   * @param watcherId watcher 实例私有标识
   * @param watchedDirectoryCount 当前目录数量
   * @param watchedEntryCount 当前目录项数量
   */
  public updateFileWatcher(
    watcherId: symbol,
    watchedDirectoryCount: number,
    watchedEntryCount: number
  ): void {
    this.fileWatchers.set(watcherId, {
      watchedDirectoryCount: this.normalizeCount(watchedDirectoryCount),
      watchedEntryCount: this.normalizeCount(watchedEntryCount)
    })
  }

  /**
   * 移除 stopped/destroyed watcher。
   * @param watcherId watcher 实例私有标识
   */
  public removeFileWatcher(watcherId: symbol): void {
    this.fileWatchers.delete(watcherId)
  }

  /**
   * 记录最近一次配置扫描结果。
   * @param metric 已完成扫描的摘要
   */
  public recordConfigScan(metric: ConfigScanRuntimeMetric): void {
    this.lastConfigScan = {
      completedAt: metric.completedAt,
      durationMs: this.normalizeDuration(metric.durationMs),
      filesVisited: this.normalizeCount(metric.filesVisited),
      configsLoaded: this.normalizeCount(metric.configsLoaded),
      success: metric.success
    }
  }

  /**
   * 获取聚合后的防御性副本。
   * @returns 可安全写入 PerformanceSnapshot 的运行时指标
   */
  public getSnapshot(): RuntimePerformanceMetrics {
    let watchedDirectoryCount = 0
    let watchedEntryCount = 0
    for (const metric of this.fileWatchers.values()) {
      watchedDirectoryCount = Math.min(
        watchedDirectoryCount + metric.watchedDirectoryCount,
        Number.MAX_SAFE_INTEGER
      )
      watchedEntryCount = Math.min(
        watchedEntryCount + metric.watchedEntryCount,
        Number.MAX_SAFE_INTEGER
      )
    }

    return {
      activeWatcherCount: this.fileWatchers.size,
      watchedDirectoryCount,
      watchedEntryCount,
      lastConfigScan: this.lastConfigScan ? { ...this.lastConfigScan } : null
    }
  }

  /**
   * 将外部计数规范化为非负安全整数。
   * @param value 待规范化数值
   * @returns 非负安全整数
   */
  private normalizeCount(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0
    }
    return Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER)
  }

  /**
   * 将耗时规范化为非负有限数值。
   * @param value 待规范化耗时
   * @returns 非负有限耗时
   */
  private normalizeDuration(value: number): number {
    return Number.isFinite(value) && value >= 0 ? value : 0
  }
}

/** 默认 main runtime performance telemetry。 */
export const runtimePerformanceTelemetry = new RuntimePerformanceTelemetry()
