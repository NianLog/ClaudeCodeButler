/**
 * 文件监控器
 * 负责监控配置文件的变化
 */

import chokidar from 'chokidar'
import { EventEmitter } from 'events'
import { join, basename, extname } from 'path'
import { ConfigChangeEvent, ConfigType } from '@shared/types'
import { CONFIG_FILES } from '@shared/constants'
import { logger } from './utils/logger'
import {
  RuntimePerformanceTelemetry,
  runtimePerformanceTelemetry
} from './services/runtime-performance-telemetry'

/** 配置文件 watcher，并被动上报当前 topology 计数。 */
export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null
  private watchPath: string
  private isRunning = false
  private readonly telemetryId = Symbol('file-watcher')

  /**
   * 创建配置文件 watcher。
   * @param watchPath 根监控目录
   * @param performanceTelemetry main runtime metrics provider
   */
  constructor(
    watchPath: string,
    private readonly performanceTelemetry: RuntimePerformanceTelemetry = runtimePerformanceTelemetry
  ) {
    super()
    this.watchPath = watchPath
  }

  /**
   * 启动文件监控
   */
  start(): void {
    if (this.watcher) {
      logger.warn('文件监控已在启动或运行')
      return
    }

    try {
      // 创建文件监控实例
      this.watcher = chokidar.watch(this.watchPath, {
        ignored: [
          /(^|[/\\])\../,  // 忽略隐藏文件
          /node_modules/,
          /.*\.log$/,
          /.*\.tmp$/
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50
        }
      })

      const activeWatcher = this.watcher

      // 设置事件监听器
      this.setupEventListeners(activeWatcher)

      // 启动监控
      activeWatcher.on('ready', () => {
        if (this.watcher !== activeWatcher) {
          return
        }
        this.isRunning = true
        this.performanceTelemetry.markFileWatcherActive(this.telemetryId)
        this.refreshRuntimeMetrics()
        logger.info(`文件监控已启动: ${this.watchPath}`)
      })

      activeWatcher.on('error', (error) => {
        if (this.watcher !== activeWatcher) {
          return
        }
        logger.error('文件监控错误:', error)
        this.emit('error', error)
      })

    } catch (error) {
      logger.error('启动文件监控失败:', error)
      this.emit('error', error)
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(watcher: chokidar.FSWatcher): void {
    // 文件添加
    watcher.on('add', (path) => {
      if (this.watcher !== watcher) return
      if (this.isConfigFile(path)) {
        const event: ConfigChangeEvent = {
          type: 'added',
          path,
          timestamp: new Date()
        }
        logger.debug('配置文件已添加:', path)
        this.emit('change', event)
      }
    })

    // 文件修改
    watcher.on('change', (path) => {
      if (this.watcher !== watcher) return
      if (this.isConfigFile(path)) {
        const event: ConfigChangeEvent = {
          type: 'changed',
          path,
          timestamp: new Date()
        }
        logger.debug('配置文件已修改:', path)
        this.emit('change', event)
      }
    })

    // 文件删除
    watcher.on('unlink', (path) => {
      if (this.watcher !== watcher) return
      if (this.isConfigFile(path)) {
        const event: ConfigChangeEvent = {
          type: 'deleted',
          path,
          timestamp: new Date()
        }
        logger.debug('配置文件已删除:', path)
        this.emit('change', event)
      }
    })

    // 目录添加
    watcher.on('addDir', (path) => {
      if (this.watcher !== watcher) return
      logger.debug('目录已添加:', path)
      this.emit('directory-added', path)
      this.refreshRuntimeMetrics()
    })

    // 目录删除
    watcher.on('unlinkDir', (path) => {
      if (this.watcher !== watcher) return
      logger.debug('目录已删除:', path)
      this.emit('directory-deleted', path)
      this.refreshRuntimeMetrics()
    })
  }

  /**
   * 从 chokidar `getWatched()` 刷新 watcher topology 指标。
   * @description 采集失败只记录 warning 并保留上次值，绝不影响 watcher 事件语义。
   */
  private refreshRuntimeMetrics(): void {
    if (!this.watcher || !this.isRunning) {
      return
    }

    try {
      const watched = this.watcher.getWatched()
      const watchedDirectories = Object.keys(watched)
      const watchedEntryCount = watchedDirectories.reduce(
        (total, directory) => total + (Array.isArray(watched[directory]) ? watched[directory].length : 0),
        0
      )
      this.performanceTelemetry.updateFileWatcher(
        this.telemetryId,
        watchedDirectories.length,
        watchedEntryCount
      )
    } catch (error) {
      logger.warn('读取文件监控性能指标失败，保留上次采样值:', error)
    }
  }

  /**
   * 判断是否为配置文件
   */
  private isConfigFile(filePath: string): boolean {
    const fileName = basename(filePath)
    const ext = extname(filePath).toLowerCase()

    // JSON 文件
    if (ext === '.json') {
      return true
    }

    // Markdown 文件
    if (ext === '.md' && fileName.toLowerCase() === 'claude.md') {
      return true
    }

    // 特定的配置文件
    return (Object.values(CONFIG_FILES) as readonly string[]).includes(fileName)
  }

  /**
   * 获取配置文件类型
   */
  getConfigType(filePath: string): ConfigType {
    const fileName = basename(filePath).toLowerCase()

    if (fileName.includes('claude') && fileName.endsWith('.json')) {
      return 'claude-code'
    }
    if (fileName.includes('mcp') || fileName.includes('server')) {
      return 'mcp-config'
    }
    if (fileName.includes('project') || fileName.includes('workspace')) {
      return 'project-config'
    }
    if (fileName.includes('preference') || fileName.includes('setting')) {
      return 'user-preferences'
    }

    return fileName.endsWith('.json') ? 'claude-code' : 'user-preferences'
  }

  /**
   * 停止文件监控
   */
  stop(): void {
    const watcher = this.watcher
    this.watcher = null
    this.isRunning = false
    this.performanceTelemetry.removeFileWatcher(this.telemetryId)

    if (!watcher) {
      return
    }

    try {
      void watcher.close().catch((error) => {
        logger.error('异步停止文件监控失败:', error)
      })
      logger.info('文件监控已停止')
    } catch (error) {
      logger.error('停止文件监控失败:', error)
    }
  }

  /**
   * 重新启动文件监控
   */
  restart(): void {
    this.stop()
    setTimeout(() => {
      this.start()
    }, 1000)
  }

  /**
   * 添加新的监控路径
   */
  addPath(path: string): void {
    if (!this.watcher) {
      logger.warn('文件监控未启动，无法添加路径')
      return
    }

    this.watcher.add(path)
    logger.info(`已添加监控路径: ${path}`)
  }

  /**
   * 移除监控路径
   */
  removePath(path: string): void {
    if (!this.watcher) {
      return
    }

    this.watcher.unwatch(path)
    logger.info(`已移除监控路径: ${path}`)
  }

  /**
   * 获取监控状态
   */
  isWatching(): boolean {
    return this.isRunning && this.watcher !== null
  }

  /**
   * 获取当前监控的路径
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return []
    }

    return Object.keys(this.watcher.getWatched())
  }

  /**
   * 手动触发扫描
   */
  async scan(): Promise<string[]> {
    const fs = await import('fs/promises')
    const foundFiles: string[] = []

    try {
      const items = await fs.readdir(this.watchPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(this.watchPath, item.name)

        if (item.isFile() && this.isConfigFile(fullPath)) {
          foundFiles.push(fullPath)
        } else if (item.isDirectory()) {
          // 递归扫描子目录
          const subFiles = await this.scanDirectory(fullPath)
          foundFiles.push(...subFiles)
        }
      }

      logger.info(`扫描发现 ${foundFiles.length} 个配置文件`)
      return foundFiles
    } catch (error) {
      logger.error('扫描配置文件失败:', error)
      return []
    }
  }

  /**
   * 递归扫描目录
   */
  private async scanDirectory(dirPath: string): Promise<string[]> {
    const fs = await import('fs/promises')
    const foundFiles: string[] = []

    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true })

      for (const item of items) {
        const fullPath = join(dirPath, item.name)

        if (item.isFile() && this.isConfigFile(fullPath)) {
          foundFiles.push(fullPath)
        } else if (item.isDirectory() && !item.name.startsWith('.')) {
          const subFiles = await this.scanDirectory(fullPath)
          foundFiles.push(...subFiles)
        }
      }
    } catch (error) {
      logger.error(`扫描目录失败 ${dirPath}:`, error)
    }

    return foundFiles
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
    logger.info('文件监控器已销毁')
  }
}
