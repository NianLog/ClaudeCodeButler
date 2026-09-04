/**
 * @file StatisticsService 生命周期回归测试
 * @description 验证初始化事件合并、非阻塞定时器和幂等 shutdown 行为。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureDir, pathExists, readJSON, writeJSON } = vi.hoisted(() => ({
  ensureDir: vi.fn(),
  pathExists: vi.fn(),
  readJSON: vi.fn(),
  writeJSON: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\test-user-data')
  }
}))

vi.mock('fs-extra', () => ({
  ensureDir,
  pathExists,
  readJSON,
  writeJSON
}))

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn()
    }))
  }
}))

/**
 * 创建一个由测试显式释放的 deferred Promise。
 */
function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise!: (value: T) => void
  const promise = new Promise<T>(resolve => {
    resolvePromise = resolve
  })

  return { promise, resolve: resolvePromise }
}

/**
 * 重新加载模块并关闭模块级 singleton，隔离被测实例的生命周期。
 */
async function loadStatisticsModule(): Promise<typeof import('../../../src/main/services/statistics-service')> {
  vi.resetModules()
  const statisticsModule = await import('../../../src/main/services/statistics-service')
  await statisticsModule.statisticsService.shutdown()
  vi.clearAllMocks()
  configureResolvedFileSystem()
  return statisticsModule
}

/**
 * 配置默认的成功文件系统响应。
 */
function configureResolvedFileSystem(): void {
  ensureDir.mockResolvedValue(undefined)
  pathExists.mockResolvedValue(false)
  readJSON.mockResolvedValue([])
  writeJSON.mockResolvedValue(undefined)
}

describe('StatisticsService lifecycle', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    configureResolvedFileSystem()
  })

  it('自动保存 interval 不应阻止主进程退出', async () => {
    const statisticsModule = await loadStatisticsModule()
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const service = new statisticsModule.StatisticsService()

    await service.getSummary()

    const timer = setIntervalSpy.mock.results.at(-1)?.value as NodeJS.Timeout
    expect(timer).toBeDefined()
    expect(timer.hasRef()).toBe(false)

    await service.shutdown()
  })

  it('初始化期间记录的事件应与磁盘历史合并', async () => {
    const statisticsModule = await loadStatisticsModule()
    const deferredEvents = createDeferred<Array<{ type: string; timestamp: number }>>()
    const historicalEvent = {
      type: statisticsModule.StatEventType.CONFIG_SWITCH,
      timestamp: Date.now() - 1000
    }

    pathExists.mockResolvedValue(true)
    readJSON.mockReturnValue(deferredEvents.promise)

    const service = new statisticsModule.StatisticsService()
    service.recordEvent(statisticsModule.StatEventType.CONFIG_EDIT, { configPath: 'C:\\config.json' })
    const shutdownPromise = service.shutdown()

    expect(writeJSON).not.toHaveBeenCalled()
    deferredEvents.resolve([historicalEvent])
    await shutdownPromise

    const eventsWrite = writeJSON.mock.calls.find(([filePath]) => String(filePath).endsWith('events.json'))
    const persistedEvents = eventsWrite?.[1] as Array<{ type: string }>
    expect(persistedEvents.map(event => event.type)).toEqual([
      statisticsModule.StatEventType.CONFIG_SWITCH,
      statisticsModule.StatEventType.CONFIG_EDIT,
      statisticsModule.StatEventType.APP_START,
      statisticsModule.StatEventType.APP_CLOSE
    ])
  })

  it('并发 shutdown 只应记录一次关闭事件', async () => {
    const statisticsModule = await loadStatisticsModule()
    const service = new statisticsModule.StatisticsService()

    await Promise.all([service.shutdown(), service.shutdown(), service.shutdown()])

    const eventsWrites = writeJSON.mock.calls.filter(([filePath]) => String(filePath).endsWith('events.json'))
    const finalEvents = eventsWrites.at(-1)?.[1] as Array<{ type: string }>
    expect(finalEvents.filter(event => event.type === statisticsModule.StatEventType.APP_CLOSE)).toHaveLength(1)
  })
})
