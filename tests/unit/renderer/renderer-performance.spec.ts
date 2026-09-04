/**
 * @file tests/unit/renderer/renderer-performance.spec.ts
 * @description 验证 renderer 启动性能标记的幂等、降级与异常隔离语义。
 */

import { describe, expect, it, vi } from 'vitest'
import {
  markRendererInitializationStart,
  measureRendererInitialization,
  collectRendererPerformanceTimings,
  RENDERER_PERFORMANCE_ENTRIES,
  type RendererPerformanceTimeline
} from '../../../src/renderer/src/utils/renderer-performance'

/**
 * 创建可预测的内存 Performance timeline。
 * @returns timeline 与底层 spy
 */
function createTimeline(): {
  timeline: RendererPerformanceTimeline
  mark: ReturnType<typeof vi.fn>
  measure: ReturnType<typeof vi.fn>
} {
  let currentTime = 10
  const entries = new Map<string, Array<{
    entryType: string
    startTime: number
    duration: number
  }>>()
  const mark = vi.fn((name: string) => {
    entries.set(name, [{ entryType: 'mark', startTime: currentTime, duration: 0 }])
    currentTime += 100
  })
  const measure = vi.fn((name: string) => {
    const entry = { entryType: 'measure', startTime: 10, duration: 248.5 }
    entries.set(name, [entry])
    return entry
  })

  return {
    timeline: {
      mark,
      measure,
      getEntriesByName: (name: string) => entries.get(name) || []
    },
    mark,
    measure
  }
}

describe('renderer performance timeline', () => {
  it('只创建一次初始化起点', () => {
    const { timeline, mark } = createTimeline()

    expect(markRendererInitializationStart(timeline)).toBe(true)
    expect(markRendererInitializationStart(timeline)).toBe(true)
    expect(mark).toHaveBeenCalledOnce()
    expect(mark).toHaveBeenCalledWith(RENDERER_PERFORMANCE_ENTRIES.initStart)
  })

  it('在存在起点时创建 interactive mark 和 duration measure', () => {
    const { timeline, mark, measure } = createTimeline()
    markRendererInitializationStart(timeline)

    expect(measureRendererInitialization(timeline)).toBe(248.5)
    expect(mark).toHaveBeenLastCalledWith(RENDERER_PERFORMANCE_ENTRIES.interactive)
    expect(measure).toHaveBeenCalledWith(
      RENDERER_PERFORMANCE_ENTRIES.initDuration,
      RENDERER_PERFORMANCE_ENTRIES.initStart,
      RENDERER_PERFORMANCE_ENTRIES.interactive
    )
  })

  it('重复完成初始化时复用已有 measure', () => {
    const { timeline, measure } = createTimeline()
    markRendererInitializationStart(timeline)

    expect(measureRendererInitialization(timeline)).toBe(248.5)
    expect(measureRendererInitialization(timeline)).toBe(248.5)
    expect(measure).toHaveBeenCalledOnce()
  })

  it('收集 bounded mark/measure summary 供 snapshot 导出', () => {
    const { timeline } = createTimeline()
    markRendererInitializationStart(timeline)
    measureRendererInitialization(timeline)

    expect(collectRendererPerformanceTimings(timeline)).toEqual([
      {
        name: RENDERER_PERFORMANCE_ENTRIES.initStart,
        entryType: 'MARK',
        startTimeMs: 10,
        durationMs: 0
      },
      {
        name: RENDERER_PERFORMANCE_ENTRIES.interactive,
        entryType: 'MARK',
        startTimeMs: 110,
        durationMs: 0
      },
      {
        name: RENDERER_PERFORMANCE_ENTRIES.initDuration,
        entryType: 'MEASURE',
        startTimeMs: 10,
        durationMs: 248.5
      }
    ])
  })

  it('measure 尚未生成时只导出已存在条目且不阻塞', () => {
    const { timeline } = createTimeline()
    markRendererInitializationStart(timeline)

    expect(collectRendererPerformanceTimings(timeline)).toEqual([
      {
        name: RENDERER_PERFORMANCE_ENTRIES.initStart,
        entryType: 'MARK',
        startTimeMs: 10,
        durationMs: 0
      }
    ])
    expect(collectRendererPerformanceTimings(null)).toEqual([])
  })

  it('缺少起点或 Performance API 时安全降级', () => {
    const { timeline, measure } = createTimeline()

    expect(measureRendererInitialization(timeline)).toBeNull()
    expect(measure).not.toHaveBeenCalled()
    expect(markRendererInitializationStart(null)).toBe(false)
    expect(measureRendererInitialization(null)).toBeNull()
  })

  it('隔离 Performance API 异常，不影响应用初始化', () => {
    const timeline: RendererPerformanceTimeline = {
      mark: vi.fn(),
      measure: vi.fn(() => ({ entryType: 'measure', startTime: 0, duration: 0 })),
      getEntriesByName: vi.fn(() => {
        throw new Error('timeline unavailable')
      })
    }

    expect(markRendererInitializationStart(timeline)).toBe(false)
    expect(measureRendererInitialization(timeline)).toBeNull()
  })
})
