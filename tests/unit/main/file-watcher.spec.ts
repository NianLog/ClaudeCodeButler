import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { FSWatcher } from 'chokidar'
import { describe, expect, it, vi } from 'vitest'
import type { ConfigChangeEvent } from '../../../src/shared/types'

vi.mock('../../../src/main/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { FileWatcher } from '../../../src/main/file-watcher'
import { OptimizedFileWatcher } from '../../../src/main/optimized-file-watcher'

describe('配置目录真实文件监控', () => {
  it.each([['FileWatcher', FileWatcher, 'change'], ['OptimizedFileWatcher', OptimizedFileWatcher, 'configChanged']] as const)(
    '%s 能监控 .ccb 内的配置，只忽略监控根目录下的隐藏项',
    async (_name, Watcher, eventName) => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-watch-'))
      const root = path.join(directory, '.ccb', 'claude-configs')
      const file = path.join(root, 'provider-config.json')
      await fs.mkdir(path.join(root, '.ignored'), { recursive: true })
      await fs.writeFile(file, '{"value":1}')
      await fs.writeFile(path.join(root, '.ignored', 'hidden.json'), '{}')
      const watcher = new Watcher(root)
      let native: FSWatcher | null = null
      try {
        watcher.start()
        native = (watcher as unknown as { watcher: FSWatcher }).watcher
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('watcher ready timeout')), 3000)
          native?.once('ready', () => { clearTimeout(timeout); resolve() })
        })
        const watchedPaths = Object.keys(native.getWatched())
        expect(watchedPaths).toContain(root)
        expect(watchedPaths).not.toContain(path.join(root, '.ignored'))
        const changed = new Promise<ConfigChangeEvent>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('configuration change was not observed')), 3000)
          watcher.on(eventName, event => {
            if (event.path === file && event.type === 'changed') {
              clearTimeout(timeout)
              resolve(event)
            }
          })
        })
        await fs.writeFile(file, '{"value":2}')
        expect((await changed).path).toBe(file)
      } finally {
        watcher.stop()
        await native?.close()
        await fs.rm(directory, { recursive: true, force: true })
      }
    }
  )
})
