/**
 * 系统托盘管理器
 * 负责创建和管理系统托盘图标及菜单
 */

import { Tray, Menu, nativeImage, BrowserWindow, Notification } from 'electron'
import { join } from 'path'
import { APP_INFO } from '@shared/constants'
import { logger } from './utils/logger'

export class TrayManager {
  private tray: Tray | null = null

  /**
   * 创建系统托盘
   */
  async createTray(): Promise<void> {
    try {
      // 获取托盘图标
      const icon = this.getTrayIcon()

      // 创建托盘实例
      this.tray = new Tray(icon)

      // 设置托盘提示
      this.tray.setToolTip(APP_INFO.FULL_NAME)

      // 创建托盘菜单（等待异步加载配置）
      await this.createTrayMenu()

      // 设置托盘事件
      this.setupTrayEvents()

      logger.info('系统托盘创建完成')
    } catch (error) {
      logger.error('创建系统托盘失败', error)
    }
  }

  /**
   * 获取托盘图标
   */
  private getTrayIcon(): nativeImage {
    try {
      const fs = require('fs')
      const { nativeImage } = require('electron')

      // 优先使用专用的托盘图标
      const trayIconPath = join(__dirname, '../../resources/icons/tray.png')
      if (fs.existsSync(trayIconPath)) {
        return nativeImage.createFromPath(trayIconPath)
      }

      // Windows 系统使用 ICO 图标
      if (process.platform === 'win32') {
        const icoPath = join(__dirname, '../../resources/icons/ccb.ico')
        if (fs.existsSync(icoPath)) {
          return nativeImage.createFromPath(icoPath)
        }
      }

      // 后备方案：使用普通图标
      const pngPath = join(__dirname, '../../resources/icons/icon.png')
      if (fs.existsSync(pngPath)) {
        return nativeImage.createFromPath(pngPath)
      }

      // 如果都找不到，创建一个简单的图标
      logger.warn('未找到托盘图标，创建默认图标')
      return nativeImage.createEmpty()
    } catch (error) {
      logger.error('加载托盘图标失败', error)
      return nativeImage.createEmpty()
    }
  }

  /**
   * 创建托盘菜单
   */
  private async createTrayMenu(): Promise<void> {
    if (!this.tray) return

    // 加载 claude-code 类型的配置列表
    const configs = await this.loadClaudeCodeConfigs()

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '显示主窗口',
        click: () => {
          this.showMainWindow()
        }
      },
      {
        label: '隐藏主窗口',
        click: () => {
          this.hideMainWindow()
        }
      },
      { type: 'separator' },
      {
        label: '快速切换配置',
        submenu: configs.length > 0 ? configs.map(config => ({
          label: config.isInUse ? `● ${config.name}` : `  ${config.name}`,
          click: () => {
            this.switchConfig(config.name, config.path)
          }
        })) : [
          {
            label: '(无可用配置)',
            enabled: false
          }
        ]
      },
      { type: 'separator' },
      {
        label: '重新加载',
        click: () => {
          this.reloadApp()
        }
      },
      { type: 'separator' },
      {
        label: '关于',
        click: () => {
          this.showAbout()
        }
      },
      {
        label: '退出',
        click: () => {
          this.quitApp()
        }
      }
    ]

    const contextMenu = Menu.buildFromTemplate(template)
    this.tray.setContextMenu(contextMenu)
  }

  /**
   * 设置托盘事件
   */
  private setupTrayEvents(): void {
    if (!this.tray) return

    // 双击托盘图标显示/隐藏主窗口
    this.tray.on('double-click', () => {
      this.toggleMainWindow()
    })

    // 右键点击显示菜单（Windows）
    if (process.platform === 'win32') {
      this.tray.on('right-click', () => {
        // Windows 会自动显示上下文菜单
      })
    }
  }

  /**
   * 加载 claude-code 类型的配置列表
   */
  private async loadClaudeCodeConfigs(): Promise<Array<{ name: string; path: string; isInUse: boolean }>> {
    try {
      // 动态导入 configService 以避免循环依赖问题
      const { configService } = await import('./ipc-handlers')
      const allConfigs = await configService.scanConfigs()

      // 只返回 claude-code 类型的配置，包括 isInUse 状态
      return allConfigs
        .filter(config => config.type === 'claude-code')
        .map(config => ({
          name: config.name,
          path: config.path,
          isInUse: config.isInUse || false
        }))
    } catch (error) {
      logger.error('加载配置列表失败:', error)
      return []
    }
  }

  /**
   * 显示主窗口
   */
  private showMainWindow(): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  }

  /**
   * 隐藏主窗口
   */
  private hideMainWindow(): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.hide()
    }
  }

  /**
   * 切换主窗口显示/隐藏
   */
  private toggleMainWindow(): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        this.hideMainWindow()
      } else {
        this.showMainWindow()
      }
    }
  }

  /**
   * 切换配置（实际激活配置文件）
   */
  private async switchConfig(configName: string, configPath: string): Promise<void> {
    try {
      // 动态导入 configService 以实际激活配置
      const { configService } = await import('./ipc-handlers')

      // activateConfig 返回 void，如果没有抛出异常就表示成功
      await configService.activateConfig(configPath)

      // 激活成功，发送切换配置事件给渲染进程以刷新UI
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('tray:switch-config', { name: configName, path: configPath })
      }

      // 显示成功通知
      const { Notification } = require('electron')
      const { join } = require('path')
      const fs = require('fs')

      // 获取图标路径
      let iconPath = ''
      if (process.platform === 'win32') {
        const icoPath = join(__dirname, '../../resources/icons/ccb.ico')
        if (fs.existsSync(icoPath)) {
          iconPath = icoPath
        }
      }

      new Notification({
        title: '配置切换',
        body: `已切换到配置: ${configName}`,
        icon: iconPath || undefined,
        ...(process.platform === 'win32' && {
          appUserModelId: APP_INFO.FULL_NAME
        })
      }).show()

      logger.info(`切换配置成功: ${configName} (${configPath})`)
    } catch (error) {
      logger.error('切换配置失败:', error)

      // 显示失败通知
      const { Notification } = require('electron')
      new Notification({
        title: '配置切换失败',
        body: error instanceof Error ? error.message : String(error),
        ...(process.platform === 'win32' && {
          appUserModelId: APP_INFO.FULL_NAME
        })
      }).show()
    }
  }

  /**
   * 重新加载应用
   */
  private reloadApp(): void {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.reload()
    }
  }

  /**
   * 显示关于对话框
   */
  private showAbout(): void {
    const { dialog } = require('electron')
    const mainWindow = BrowserWindow.getAllWindows()[0]

    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: `关于 ${APP_INFO.FULL_NAME}`,
      message: APP_INFO.FULL_NAME,
      detail: `${APP_INFO.DESCRIPTION}\n\n版本: ${APP_INFO.VERSION}\n作者: ${APP_INFO.AUTHOR}\n\n${APP_INFO.HOMEPAGE}`,
      buttons: ['确定']
    })
  }

  /**
   * 退出应用
   */
  private quitApp(): void {
    const { app } = require('electron')
    app.quit()
  }

  /**
   * 更新托盘菜单（动态加载 claude-code 类型配置）
   */
  async updateTrayMenu(): Promise<void> {
    if (!this.tray) return

    // 重新加载配置并更新菜单
    await this.createTrayMenu()
  }

  /**
   * 显示托盘通知
   */
  showNotification(title: string, body: string): void {
    if (!this.tray) return

    // Electron 的 Tray 在 Windows 和 macOS 上支持显示通知
    if (process.platform === 'win32' || process.platform === 'darwin') {
      this.tray.displayBalloon({
        title,
        content: body,
        icon: this.getTrayIcon()
      })
    }

    // 同时使用系统通知
    const notification = new Notification({
      title,
      body,
      icon: this.getTrayIcon()
    })
    notification.show()
  }

  /**
   * 设置托盘闪烁
   */
  setFlashing(flash: boolean): void {
    if (this.tray && process.platform === 'win32') {
      // Windows 支持托盘图标闪烁
      this.tray.setHighlightMode(flash ? 'always' : 'never')
    }
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
      logger.info('系统托盘已销毁')
    }
  }

  /**
   * 检查托盘是否存在
   */
  isExists(): boolean {
    return this.tray !== null && !this.tray.isDestroyed()
  }
}