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

/** renderer 允许导出的性能条目名称。 */
export const RENDERER_PERFORMANCE_ENTRY_NAMES = {
  initStart: 'ccb-app-init-start',
  interactive: 'ccb-app-interactive',
  initDuration: 'ccb-app-init-duration'
} as const

/** renderer 性能条目名称。 */
export type RendererPerformanceEntryName =
  typeof RENDERER_PERFORMANCE_ENTRY_NAMES[keyof typeof RENDERER_PERFORMANCE_ENTRY_NAMES]

/** renderer 性能条目类型；跨进程 enum-like value 保持 UPPERCASE。 */
export type RendererPerformanceEntryType = 'MARK' | 'MEASURE'

/** renderer 可提交的最大性能条目数量。 */
export const MAX_RENDERER_PERFORMANCE_TIMINGS = Object.keys(RENDERER_PERFORMANCE_ENTRY_NAMES).length

/** 单个经过约束的 renderer 性能条目。 */
export interface RendererPerformanceTiming {
  /** whitelist 中的性能条目名称。 */
  name: RendererPerformanceEntryName
  /** MARK 或 MEASURE。 */
  entryType: RendererPerformanceEntryType
  /** 相对 renderer timeOrigin 的起始时间（毫秒）。 */
  startTimeMs: number
  /** 条目耗时（毫秒）；MARK 固定为 0。 */
  durationMs: number
}

/** 最近一次配置扫描的性能摘要。 */
export interface ConfigScanRuntimeMetric {
  /** 扫描完成时间（ISO-8601）。 */
  readonly completedAt: string
  /** 扫描总耗时（毫秒）。 */
  readonly durationMs: number
  /** 本次扫描发现并尝试加载的配置文件数量。 */
  readonly filesVisited: number
  /** 成功构建的配置对象数量。 */
  readonly configsLoaded: number
  /** 顶层扫描是否成功完成。 */
  readonly success: boolean
}

/** main process 被动维护的运行时性能指标。 */
export interface RuntimePerformanceMetrics {
  /** 当前 ready 且尚未 stop 的 watcher 数量。 */
  readonly activeWatcherCount: number
  /** 所有 active watcher 当前监控的目录总数。 */
  readonly watchedDirectoryCount: number
  /** 所有 active watcher 当前监控的目录项总数。 */
  readonly watchedEntryCount: number
  /** 最近一次配置扫描摘要；尚未扫描时为 null。 */
  readonly lastConfigScan: ConfigScanRuntimeMetric | null
}

/** renderer 性能条目的预期类型映射。 */
const RENDERER_PERFORMANCE_ENTRY_TYPES: Readonly<
  Record<RendererPerformanceEntryName, RendererPerformanceEntryType>
> = {
  [RENDERER_PERFORMANCE_ENTRY_NAMES.initStart]: 'MARK',
  [RENDERER_PERFORMANCE_ENTRY_NAMES.interactive]: 'MARK',
  [RENDERER_PERFORMANCE_ENTRY_NAMES.initDuration]: 'MEASURE'
}

/**
 * 判断字符串是否属于 renderer 性能条目 whitelist。
 * @param value 待验证名称
 * @returns 是否为受支持条目名称
 */
function isRendererPerformanceEntryName(value: string): value is RendererPerformanceEntryName {
  return Object.prototype.hasOwnProperty.call(RENDERER_PERFORMANCE_ENTRY_TYPES, value)
}

/**
 * 校验并复制来自 renderer 的不可信性能摘要。
 * @param input IPC 输入；必须是 bounded array 或 undefined
 * @returns 规范化条目；undefined 表示调用方未提供 renderer 摘要
 * @throws payload 结构、名称、类型或数值不符合 contract 时抛错
 */
export function validateRendererPerformanceTimings(
  input: unknown
): RendererPerformanceTiming[] | undefined {
  if (input === undefined) {
    return undefined
  }

  if (!Array.isArray(input)) {
    throw new Error('rendererTimings must be an array')
  }

  if (input.length > MAX_RENDERER_PERFORMANCE_TIMINGS) {
    throw new Error(`rendererTimings exceeds the ${MAX_RENDERER_PERFORMANCE_TIMINGS} entry limit`)
  }

  const seenNames = new Set<RendererPerformanceEntryName>()
  return input.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`rendererTimings[${index}] must be an object`)
    }

    const candidate = entry as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !isRendererPerformanceEntryName(candidate.name)) {
      throw new Error(`rendererTimings[${index}].name is not allowed`)
    }
    if (seenNames.has(candidate.name)) {
      throw new Error(`rendererTimings contains duplicate entry: ${candidate.name}`)
    }

    const expectedEntryType = RENDERER_PERFORMANCE_ENTRY_TYPES[candidate.name]
    if (candidate.entryType !== expectedEntryType) {
      throw new Error(`rendererTimings[${index}].entryType must be ${expectedEntryType}`)
    }
    if (
      typeof candidate.startTimeMs !== 'number' ||
      !Number.isFinite(candidate.startTimeMs) ||
      candidate.startTimeMs < 0
    ) {
      throw new Error(`rendererTimings[${index}].startTimeMs must be finite and non-negative`)
    }
    if (
      typeof candidate.durationMs !== 'number' ||
      !Number.isFinite(candidate.durationMs) ||
      candidate.durationMs < 0
    ) {
      throw new Error(`rendererTimings[${index}].durationMs must be finite and non-negative`)
    }
    if (expectedEntryType === 'MARK' && candidate.durationMs !== 0) {
      throw new Error(`rendererTimings[${index}].durationMs must be 0 for MARK entries`)
    }

    seenNames.add(candidate.name)
    return {
      name: candidate.name,
      entryType: expectedEntryType,
      startTimeMs: candidate.startTimeMs,
      durationMs: candidate.durationMs
    }
  })
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
  /** 用户导出时由 renderer 提供并经 main 校验的 bounded timing summary。 */
  rendererTimings?: RendererPerformanceTiming[]
  /** main process 被动维护的 watcher 与配置扫描指标。 */
  runtimeMetrics: RuntimePerformanceMetrics
}
