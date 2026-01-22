/**
 * 窗口管理器
 * 负责创建和管理应用窗口
 */

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { DEFAULT_SETTINGS, APP_INFO } from '@shared/constants'
import { logger } from './utils/logger'
import { SettingsService } from './services/settings-service'

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  /**
   * 创建主窗口
   */
  async createMainWindow(): Promise<BrowserWindow> {
    // 获取主显示器的工作区
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    // 尝试从设置中获取窗口大小，否则使用默认值
    let windowWidth: number = DEFAULT_SETTINGS.window.width
    let windowHeight: number = DEFAULT_SETTINGS.window.height

    try {
      // 检查是否有自定义窗口设置
      const settingsServiceInstance = new SettingsService()
      const settings = await settingsServiceInstance.loadSettings()

      if (settings?.window?.width && settings?.window?.height) {
        windowWidth = Math.min(settings.window.width, width - 100)
        windowHeight = Math.min(settings.window.height, height - 100)
      } else {
        windowWidth = Math.min(DEFAULT_SETTINGS.window.width, width - 100)
        windowHeight = Math.min(DEFAULT_SETTINGS.window.height, height - 100)
      }
    } catch (error) {
      logger.warn('加载窗口设置失败，使用默认设置:', error)
      windowWidth = Math.min(DEFAULT_SETTINGS.window.width, width - 100)
      windowHeight = Math.min(DEFAULT_SETTINGS.window.height, height - 100)
    }

    // 计算窗口位置（居中）
    const x = Math.floor((width - windowWidth) / 2)
    const y = Math.floor((height - windowHeight) / 2)

    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: windowWidth,
      height: windowHeight,
      x,
      y,
      minWidth: DEFAULT_SETTINGS.window.minWidth,
      minHeight: DEFAULT_SETTINGS.window.minHeight,
      show: false, // 先不显示，等加载完成后再显示
      autoHideMenuBar: true,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      icon: this.getAppIcon(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, '../preload/index.js'),
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false
      }
    })

    logger.info('主窗口创建开始，准备加载渲染器')

    // 加载应用
    if (process.env.NODE_ENV === 'development') {
      // 开发环境加载本地服务器
      logger.info('加载渲染器: http://localhost:5175')
      await this.mainWindow.loadURL('http://localhost:5175')
      // 开发环境打开开发者工具
      this.mainWindow.webContents.openDevTools()
    } else {
      // 生产环境加载本地文件
      logger.info(`加载渲染器文件: ${join(__dirname, '../renderer/index.html')}`)
      await this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 设置窗口事件
    this.setupWindowEvents()

    // 保存窗口状态
    this.setupWindowState()

    logger.info('主窗口创建完成')

    return this.mainWindow
  }

  /**
   * 设置窗口事件
   */
  private setupWindowEvents(): void {
    if (!this.mainWindow) return

    // 窗口准备显示时
    this.mainWindow.once('ready-to-show', () => {
      if (this.mainWindow && !DEFAULT_SETTINGS.startup.startMinimized) {
        this.mainWindow.show()
        this.mainWindow.focus()
      }
    })

    // 窗口关闭事件 - 点击关闭按钮时隐藏而不是销毁
    this.mainWindow.on('close', (event) => {
      if (!this.mainWindow) return

      // 阻止默认的关闭行为
      event.preventDefault()

      // 隐藏窗口而不是销毁
      this.mainWindow.hide()

      logger.debug('窗口已隐藏到托盘')
    })

    // 窗口失去焦点时
    this.mainWindow.on('blur', () => {
      // 可以在这里处理失去焦点的逻辑
    })

    // 窗口获得焦点时
    this.mainWindow.on('focus', () => {
      // 可以在这里处理获得焦点的逻辑
    })

    // 窗口最大化/还原时
    this.mainWindow.on('maximize', () => {
      this.mainWindow?.webContents.send('window:maximized', true)
    })

    this.mainWindow.on('unmaximize', () => {
      this.mainWindow?.webContents.send('window:maximized', false)
    })

    // 页面加载完成时
    this.mainWindow.webContents.on('did-finish-load', () => {
      logger.info('主窗口页面加载完成')
    })

    this.mainWindow.webContents.on('did-start-loading', () => {
      logger.info('主窗口开始加载')
    })

    this.mainWindow.webContents.on('dom-ready', () => {
      logger.info('主窗口 DOM ready')
    })

    this.mainWindow.webContents.on('did-stop-loading', () => {
      logger.info('主窗口停止加载')
    })

    // 页面加载失败时
    this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error(`页面加载失败: ${errorCode} - ${errorDescription}`)
    })

    // 控制台消息
    this.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const payload = { line, source: sourceId }
      switch (level) {
        case 0:
          logger.debug(`[Renderer] ${message}`, payload)
          break
        case 1:
          logger.info(`[Renderer] ${message}`, payload)
          break
        case 2:
          logger.warn(`[Renderer] ${message}`, payload)
          break
        case 3:
          logger.error(`[Renderer] ${message}`, payload)
          break
        default:
          logger.info(`[Renderer] ${message}`, payload)
          break
      }
    })
  }

  /**
   * 设置窗口状态保存
   */
  private setupWindowState(): void {
    if (!this.mainWindow) return

    // 保存窗口状态
    const saveWindowState = () => {
      if (!this.mainWindow) return

      const bounds = this.mainWindow.getBounds()
      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: this.mainWindow.isMaximized()
      }

      // 这里可以保存到配置文件
      logger.debug('保存窗口状态:', state)
    }

    // 定时保存状态
    let saveTimer: NodeJS.Timeout
    const debouncedSave = () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveWindowState, 1000)
    }

    this.mainWindow.on('resize', debouncedSave)
    this.mainWindow.on('move', debouncedSave)
    this.mainWindow.on('maximize', saveWindowState)
    this.mainWindow.on('unmaximize', saveWindowState)

    // 应用退出前保存状态
    this.mainWindow.on('close', saveWindowState)
  }

  /**
   * 获取应用图标
   */
  private getAppIcon(): string {
    try {
      const fs = require('fs')

      // Windows 和 Linux 优先使用 .ico 格式
      if (process.platform !== 'darwin') {
        const icoPath = join(__dirname, '../../resources/icons/ccb.ico')

        if (fs.existsSync(icoPath)) {
          return icoPath
        }
      }

      // macOS 或后备方案：使用 SVG
      const svgPath = join(__dirname, '../../resources/icons/icon.svg')
      if (fs.existsSync(svgPath)) {
        return svgPath
      }

      // 最后的后备方案
      logger.warn('未找到应用图标，使用默认图标')
      return ''
    } catch (error) {
      logger.warn('获取应用图标失败:', error)
      return ''
    }
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  /**
   * 显示主窗口
   */
  showMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore()
      }
      this.mainWindow.show()
      this.mainWindow.focus()
    } else {
      this.createMainWindow()
    }
  }

  /**
   * 隐藏主窗口
   */
  hideMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.hide()
    }
  }

  /**
   * 切换主窗口显示/隐藏
   */
  toggleMainWindow(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideMainWindow()
      } else {
        this.showMainWindow()
      }
    } else {
      this.createMainWindow()
    }
  }

  /**
   * 关闭主窗口
   */
  closeMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.close()
    }
  }

  /**
   * 重新加载主窗口
   */
  reloadMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.reload()
    }
  }

  /**
   * 打开开发者工具
   */
  openDevTools(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.openDevTools()
    }
  }

  /**
   * 关闭开发者工具
   */
  closeDevTools(): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.closeDevTools()
    }
  }

  /**
   * 切换开发者工具
   */
  toggleDevTools(): void {
    if (this.mainWindow) {
      if (this.mainWindow.webContents.isDevToolsOpened()) {
        this.closeDevTools()
      } else {
        this.openDevTools()
      }
    }
  }

  /**
   * 获取窗口信息
   */
  getWindowInfo(): any {
    if (!this.mainWindow) {
      return null
    }

    const bounds = this.mainWindow.getBounds()
    return {
      id: this.mainWindow.id,
      title: this.mainWindow.getTitle(),
      bounds,
      isMaximized: this.mainWindow.isMaximized(),
      isMinimized: this.mainWindow.isMinimized(),
      isVisible: this.mainWindow.isVisible(),
      isFocused: this.mainWindow.isFocused()
    }
  }

  /**
   * 设置窗口标题
   */
  setWindowTitle(title: string): void {
    if (this.mainWindow) {
      this.mainWindow.setTitle(`${title} - ${APP_INFO.FULL_NAME}`)
    }
  }

  /**
   * 发送消息到渲染进程
   */
  sendToRenderer(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  /**
   * 销毁所有窗口
   */
  destroyAllWindows(): void {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.destroy()
      }
    })
    this.mainWindow = null
  }
}