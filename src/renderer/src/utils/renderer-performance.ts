/**
 * @file src/renderer/src/utils/renderer-performance.ts
 * @description 提供 renderer 启动性能标记，并在不支持 Performance API 时安全降级。
 */

import {
  RENDERER_PERFORMANCE_ENTRY_NAMES,
  type RendererPerformanceTiming
} from '@shared/performance'

/** renderer 启动性能条目名称。 */
export const RENDERER_PERFORMANCE_ENTRIES = RENDERER_PERFORMANCE_ENTRY_NAMES

/**
 * 启动计时依赖的最小 Performance API contract。
 * @description 通过最小 contract 便于单元测试，也避免 helper 依赖完整浏览器环境。
 */
export interface RendererPerformanceTimeline {
  /** 创建命名时间点。 */
  mark: (name: string) => unknown
  /** 计算两个 mark 之间的耗时。 */
  measure: (name: string, startMark: string, endMark: string) => { duration: number }
  /** 查询指定名称的已有条目。 */
  getEntriesByName: (name: string) => Array<{
    entryType: string
    startTime: number
    duration: number
  }>
}

/**
 * 获取当前运行环境的 Performance timeline。
 * @param timeline 测试或调用方显式注入的 timeline
 * @returns 可用 timeline；不支持时返回 null
 */
function resolvePerformanceTimeline(
  timeline?: RendererPerformanceTimeline | null
): RendererPerformanceTimeline | null {
  if (timeline !== undefined) {
    return timeline
  }

  if (typeof globalThis.performance === 'undefined') {
    return null
  }

  return globalThis.performance as unknown as RendererPerformanceTimeline
}

/**
 * 幂等记录 renderer 初始化起点。
 * @param timeline 可选 Performance timeline
 * @returns 是否成功创建或已存在该 mark
 */
export function markRendererInitializationStart(
  timeline?: RendererPerformanceTimeline | null
): boolean {
  const performanceTimeline = resolvePerformanceTimeline(timeline)
  if (!performanceTimeline) {
    return false
  }

  try {
    if (performanceTimeline.getEntriesByName(RENDERER_PERFORMANCE_ENTRIES.initStart).length === 0) {
      performanceTimeline.mark(RENDERER_PERFORMANCE_ENTRIES.initStart)
    }
    return true
  } catch (error) {
    console.warn('[Performance] Unable to mark renderer initialization start:', error)
    return false
  }
}

/**
 * 幂等记录首屏可交互时间并生成启动耗时 measure。
 * @param timeline 可选 Performance timeline
 * @returns 启动耗时（毫秒）；缺少起点或 API 不可用时返回 null
 */
export function measureRendererInitialization(
  timeline?: RendererPerformanceTimeline | null
): number | null {
  const performanceTimeline = resolvePerformanceTimeline(timeline)
  if (!performanceTimeline) {
    return null
  }

  try {
    const existingMeasure = performanceTimeline.getEntriesByName(
      RENDERER_PERFORMANCE_ENTRIES.initDuration
    )[0]
    if (existingMeasure) {
      return existingMeasure.duration
    }

    if (performanceTimeline.getEntriesByName(RENDERER_PERFORMANCE_ENTRIES.initStart).length === 0) {
      return null
    }

    if (performanceTimeline.getEntriesByName(RENDERER_PERFORMANCE_ENTRIES.interactive).length === 0) {
      performanceTimeline.mark(RENDERER_PERFORMANCE_ENTRIES.interactive)
    }

    return performanceTimeline.measure(
      RENDERER_PERFORMANCE_ENTRIES.initDuration,
      RENDERER_PERFORMANCE_ENTRIES.initStart,
      RENDERER_PERFORMANCE_ENTRIES.interactive
    ).duration
  } catch (error) {
    console.warn('[Performance] Unable to measure renderer initialization:', error)
    return null
  }
}

/**
 * 收集允许跨 IPC 导出的 renderer 启动 timing summary。
 * @param timeline 可选 Performance timeline
 * @returns 仅包含 whitelist 条目的 bounded summary；API 不可用时返回空数组
 */
export function collectRendererPerformanceTimings(
  timeline?: RendererPerformanceTimeline | null
): RendererPerformanceTiming[] {
  const performanceTimeline = resolvePerformanceTimeline(timeline)
  if (!performanceTimeline) {
    return []
  }

  try {
    const definitions = [
      { name: RENDERER_PERFORMANCE_ENTRIES.initStart, entryType: 'MARK' as const },
      { name: RENDERER_PERFORMANCE_ENTRIES.interactive, entryType: 'MARK' as const },
      { name: RENDERER_PERFORMANCE_ENTRIES.initDuration, entryType: 'MEASURE' as const }
    ]

    return definitions.flatMap<RendererPerformanceTiming>(({ name, entryType }) => {
      const entry = performanceTimeline.getEntriesByName(name)[0]
      if (
        !entry ||
        !Number.isFinite(entry.startTime) ||
        entry.startTime < 0 ||
        !Number.isFinite(entry.duration) ||
        entry.duration < 0
      ) {
        return []
      }

      return [{
        name,
        entryType,
        startTimeMs: entry.startTime,
        durationMs: entryType === 'MARK' ? 0 : entry.duration
      }]
    })
  } catch (error) {
    console.warn('[Performance] Unable to collect renderer timing summary:', error)
    return []
  }
}
