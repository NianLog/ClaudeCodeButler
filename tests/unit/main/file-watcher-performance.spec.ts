/**
 * @file tests/unit/main/file-watcher-performance.spec.ts
 * @description 验证 FileWatcher 在既有生命周期事件上被动更新 runtime metrics。
 */

import { describe, expect, it, vi } from 'vitest'

type WatcherEventHandler = (value?: unknown) => void

const watcherFixture = vi.hoisted(() => {
  const handlers = new Map<string, WatcherEventHandler>()
  const watchedState: { value: Record<string, string[]> } = {
    value: {
      'C:\\configs': ['a.json', 'nested'],
      'C:\\configs\\nested': ['b.json']
    }
  }
  const close = vi.fn(async () => undefined)
  const fakeWatcher = {
    on: vi.fn((eventName: string, handler: WatcherEventHandler) => {
      handlers.set(eventName, handler)
      return fakeWatcher
    }),
    getWatched: vi.fn(() => watchedState.value),
    close,
    add: vi.fn(),
    unwatch: vi.fn()
  }
  const watch = vi.fn(() => fakeWatcher)

  return { handlers, watchedState, close, fakeWatcher, watch }
})

vi.mock('chokidar', () => ({
  default: { watch: watcherFixture.watch }
}))

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { FileWatcher } from '../../../src/main/file-watcher'
import { RuntimePerformanceTelemetry } from '../../../src/main/services/runtime-performance-telemetry'

describe('FileWatcher runtime metrics', () => {
  it('在 ready/addDir/unlinkDir/stop 时同步 getWatched topology', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const fileWatcher = new FileWatcher('C:\\configs', telemetry)

    fileWatcher.start()
    watcherFixture.handlers.get('ready')?.()
    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 1,
      watchedDirectoryCount: 2,
      watchedEntryCount: 3
    })

    watcherFixture.watchedState.value = {
      'C:\\configs': ['a.json']
    }
    watcherFixture.handlers.get('unlinkDir')?.('C:\\configs\\nested')
    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 1,
      watchedDirectoryCount: 1,
      watchedEntryCount: 1
    })

    watcherFixture.watchedState.value = {
      'C:\\configs': ['a.json', 'new'],
      'C:\\configs\\new': []
    }
    watcherFixture.handlers.get('addDir')?.('C:\\configs\\new')
    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 1,
      watchedDirectoryCount: 2,
      watchedEntryCount: 2
    })

    fileWatcher.stop()
    expect(telemetry.getSnapshot()).toMatchObject({
      activeWatcherCount: 0,
      watchedDirectoryCount: 0,
      watchedEntryCount: 0
    })
    expect(watcherFixture.close).toHaveBeenCalledOnce()
  })

  it('getWatched 失败时保留上次指标且不改变事件语义', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const fileWatcher = new FileWatcher('C:\\configs', telemetry)
    const directoryAdded = vi.fn()
    fileWatcher.on('directory-added', directoryAdded)
    fileWatcher.start()
    watcherFixture.handlers.get('ready')?.()
    const previousSnapshot = telemetry.getSnapshot()

    watcherFixture.fakeWatcher.getWatched.mockImplementationOnce(() => {
      throw new Error('getWatched unavailable')
    })
    expect(() => watcherFixture.handlers.get('addDir')?.('C:\\configs\\other')).not.toThrow()

    expect(directoryAdded).toHaveBeenCalledWith('C:\\configs\\other')
    expect(telemetry.getSnapshot()).toEqual(previousSnapshot)
    fileWatcher.stop()
  })

  it('ready 前 stop 也会关闭底层 watcher 且不注册 active metric', () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const fileWatcher = new FileWatcher('C:\\configs', telemetry)
    fileWatcher.start()

    fileWatcher.stop()

    expect(telemetry.getSnapshot().activeWatcherCount).toBe(0)
    expect(watcherFixture.close).toHaveBeenCalled()

    watcherFixture.handlers.get('ready')?.()
    expect(telemetry.getSnapshot().activeWatcherCount).toBe(0)
  })
})
