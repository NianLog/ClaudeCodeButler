/**
 * @file src/shared/performance.ts
 * @description 定义按需性能采集在 main/preload/renderer 之间共享的序列化 contract。
 */

/** 单个 Electron process metric */
export interface ElectronProcessPerformanceMetric {
  /** Electron process type */
  type: string
  /** OS process ID */
  pid: number
  /** CPU percent */
  cpuPercent: number
  /** Working set KB */
  workingSetKb: number
  /** Peak working set KB */
  peakWorkingSetKb: number
  /** Private bytes KB；部分平台/进程不提供 */
  privateBytesKb?: number
}

/** Performance snapshot */
export interface PerformanceSnapshot {
  /** Snapshot schema version */
  schemaVersion: 1
  /** ISO-8601 collection time */
  capturedAt: string
  /** Application version */
  appVersion: string
  /** Platform */
  platform: NodeJS.Platform
  /** CPU architecture */
  arch: string
  /** Main process uptime seconds */
  uptimeSeconds: number
  /** Main Node heap/process memory bytes */
  mainMemoryUsage: NodeJS.MemoryUsage
  /** Electron process metrics */
  processes: ElectronProcessPerformanceMetric[]
  /** Total working set KB */
  totalWorkingSetKb: number
}
