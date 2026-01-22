/**
 * 优化版文件监控器
 * 提供更好的性能和内存管理
 */

import chokidar from 'chokidar'
import { EventEmitter } from 'events'
import { basename, extname } from 'path'
import { ConfigChangeEvent } from '@shared/types'
import { CONFIG_FILES } from '@shared/constants'
import { logger } from './utils/logger'

interface FileChangeEvent {
  path: string
  type: 'added' | 'changed' | 'deleted'
  timestamp: Date
}

export class OptimizedFileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null
  private watchPath: string
  private isRunning = false
  private changeQueue: FileChangeEvent[] = []
  private processingTimer: NodeJS.Timeout | null = null
  private readonly BATCH_DELAY = 500 // 批量处理延迟
  private readonly MAX_QUEUE_SIZE = 100 // 最大队列大小

  constructor(watchPath: string) {
    super()
    this.watchPath = watchPath
  }

  /**
   * 启动文件监控
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('文件监控已在运行')
      return
    }

    try {
      // 创建文件监控实例，优化配置
      this.watcher = chokidar.watch(this.watchPath, {
        ignored: [
          /(^|[\/\\])\../,  // 忽略隐藏文件
          /node_modules/,
          /.*\.log$/,
          /.*\.tmp$/,
          /.*\.cache$/,
          /.*\.lock$/
        ],
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200, // 增加稳定性阈值
          pollInterval: 100
        },
        depth: 3, // 限制监控深度
        followSymlinks: false, // 不跟踪符号链接
        atomic: true // 原子操作
      })

      // 设置事件监听器
      this.setupEventListeners()
      this.isRunning = true
      logger.info(`文件监控已启动: ${this.watchPath}`)

    } catch (error) {
      logger.error('启动文件监控失败:', error)
      throw error
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.watcher) return

    // 文件添加事件
    this.watcher.on('add', (path) => {
      this.queueChange(path, 'added')
    })

    // 文件变化事件
    this.watcher.on('change', (path) => {
      this.queueChange(path, 'changed')
    })

    // 文件删除事件
    this.watcher.on('unlink', (path) => {
      this.queueChange(path, 'deleted')
    })

    // 错误处理
    this.watcher.on('error', (error) => {
      logger.error('文件监控错误:', error)
      this.emit('error', error)
    })

    // 准备就绪事件
    this.watcher.on('ready', () => {
      logger.info('文件监控准备就绪')
      this.emit('ready')
    })
  }

  /**
   * 将文件变化事件加入队列
   */
  private queueChange(path: string, type: 'added' | 'changed' | 'deleted'): void {
    // 检查队列大小，防止内存泄漏
    if (this.changeQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn('文件变化队列已满，丢弃旧事件')
      this.changeQueue.shift()
    }

    // 检查是否为配置文件
    if (!this.isConfigFile(path)) {
      return
    }

    // 添加到队列
    this.changeQueue.push({
      path,
      type,
      timestamp: new Date()
    })

    // 启动批量处理定时器
    this.startBatchProcessing()
  }

  /**
   * 启动批量处理
   */
  private startBatchProcessing(): void {
    if (this.processingTimer) {
      return // 已有定时器在运行
    }

    this.processingTimer = setTimeout(() => {
      this.processBatch()
    }, this.BATCH_DELAY)
  }

  /**
   * 批量处理文件变化
   */
  private processBatch(): void {
    if (this.changeQueue.length === 0) {
      this.processingTimer = null
      return
    }

    // 处理队列中的所有事件
    const events = [...this.changeQueue]
    this.changeQueue = []
    this.processingTimer = null

    // 按路径分组，去重
    const groupedEvents = this.groupEventsByPath(events)

    // 发送事件
    groupedEvents.forEach(event => {
      this.emitConfigChange(event)
    })

    logger.debug(`批量处理了 ${events.length} 个文件变化事件`)
  }

  /**
   * 按路径分组事件，去重
   */
  private groupEventsByPath(events: FileChangeEvent[]): ConfigChangeEvent[] {
    const pathMap = new Map<string, ConfigChangeEvent>()

    events.forEach(event => {
      const existing = pathMap.get(event.path)
      
      if (!existing) {
        // 新事件
        pathMap.set(event.path, {
          type: event.type,
          path: event.path,
          timestamp: event.timestamp
        })
      } else {
        // 更新现有事件
        if (event.type === 'deleted' || existing.type === 'added') {
          // 删除事件优先级最高，添加事件次之
          existing.type = event.type
        }
        existing.timestamp = event.timestamp
      }
    })

    return Array.from(pathMap.values())
  }

  /**
   * 发送配置变化事件
   */
  private emitConfigChange(event: ConfigChangeEvent): void {
    try {
      // 验证文件路径
      if (!this.isValidConfigPath(event.path)) {
        return
      }

      // 发送事件
      this.emit('configChanged', event)
      logger.debug(`配置文件变化: ${event.type} - ${event.path}`)

    } catch (error) {
      logger.error('发送配置变化事件失败:', error)
    }
  }

  /**
   * 检查是否为配置文件
   */
  private isConfigFile(path: string): boolean {
    const fileName = basename(path)
    const ext = extname(path).toLowerCase()

    // 检查文件扩展名
    if (ext !== '.json') {
      return false
    }

    // 检查是否为已知的配置文件
    const knownFiles = new Set(Object.values(CONFIG_FILES) as string[])
    return knownFiles.has(fileName) ||
           fileName.startsWith('.claude') ||
           fileName.includes('config')
  }

  /**
   * 验证配置路径
   */
  private isValidConfigPath(path: string): boolean {
    try {
      // 检查路径是否在监控范围内
      return path.startsWith(this.watchPath)
    } catch {
      return false
    }
  }

  /**
   * 停止文件监控
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    // 清理定时器
    if (this.processingTimer) {
      clearTimeout(this.processingTimer)
      this.processingTimer = null
    }

    // 停止监控器
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    // 清空队列
    this.changeQueue = []
    this.isRunning = false
    logger.info('文件监控已停止')
  }

  /**
   * 重启文件监控
   */
  restart(): void {
    this.stop()
    // 使用更短的延迟
    setTimeout(() => {
      this.start()
    }, 500)
  }

  /**
   * 获取监控状态
   */
  getStatus(): {
    isRunning: boolean
    watchPath: string
    queueSize: number
  } {
    return {
      isRunning: this.isRunning,
      watchPath: this.watchPath,
      queueSize: this.changeQueue.length
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stop()
    this.removeAllListeners()
  }
}
