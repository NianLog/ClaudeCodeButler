/**
 * 系统托盘管理器
 * 负责创建和管理系统托盘图标及菜单
 */

import { Tray, Menu, nativeImage, BrowserWindow, Notification, app, dialog, type NativeImage } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { APP_INFO } from '@shared/constants'
import type { ToolConfigSetSummary } from '@shared/tool-registry'
import { logger } from './utils/logger'
import { configService, managedModeService } from './ipc-handlers'
import { toolRegistryService } from './services/tool-registry-service'
import { toolConfigSetService } from './services/tool-config-set-service'

interface TrayConfigSummary {
  name: string
  path: string
  isInUse: boolean
}

/** 非内置 claude 通道的工具配置集分组（托盘快速切换用） */
interface TrayToolSetGroup {
  toolId: string
  label: string
  sets: ToolConfigSetSummary[]
}

export class TrayManager {
  private tray: Tray | null = null
  private initialMenuRefreshTimer: NodeJS.Timeout | null = null

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

      // 启动阶段先使用占位菜单，避免与首屏同时扫描配置目录。
      this.setTrayMenu(null, [])

      // 设置托盘事件
      this.setupTrayEvents()
      this.scheduleInitialMenuRefresh()

      logger.info('系统托盘创建完成')
    } catch (error) {
      logger.error('创建系统托盘失败', error)
    }
  }

  /**
   * 获取托盘图标
   */
  private getTrayIcon(): NativeImage {
    try {
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

    // claude-code 走遗留配置通道，其余工具走 registry 配置集通道
    const [configs, toolGroups] = await Promise.all([this.loadClaudeCodeConfigs(), this.loadToolSetGroups()])
    this.setTrayMenu(configs, toolGroups)
  }

  /**
   * 设置托盘菜单内容
   * @description 启动期可传入 `null` 展示占位菜单，等首屏稳定后再异步填充真实配置项。
   */
  private setTrayMenu(configs: TrayConfigSummary[] | null, toolGroups: TrayToolSetGroup[]): void {
    if (!this.tray) return

    const buildConfigSetItems = (group: TrayToolSetGroup): Electron.MenuItemConstructorOptions => ({
      label: group.label,
      submenu:
        group.sets.length > 0
          ? group.sets.map(set => ({
              label: set.isInUse ? `● ${set.name}` : `  ${set.name}`,
              click: () => {
                void this.switchToolConfigSet(group.toolId, group.label, set.setId, set.name)
              }
            }))
          : [{ label: '(无配置集)', enabled: false }]
    })

    let quickSwitchSubmenu: Electron.MenuItemConstructorOptions[]
    if (configs === null) {
      quickSwitchSubmenu = [{ label: '加载配置中...', enabled: false }]
    } else {
      quickSwitchSubmenu = [
        {
          label: 'Claude Code',
          submenu:
            configs.length > 0
              ? configs.map(config => ({
                  label: config.isInUse ? `● ${config.name}` : `  ${config.name}`,
                  click: () => {
                    this.switchConfig(config.name, config.path)
                  }
                }))
              : [{ label: '(无可用配置)', enabled: false }]
        },
        ...toolGroups.map(buildConfigSetItems)
      ]
    }

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
        submenu: quickSwitchSubmenu
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
   * 延迟刷新托盘菜单
   * @description 避免在主窗口首屏加载阶段再次触发配置目录扫描。
   */
  private scheduleInitialMenuRefresh(): void {
    if (this.initialMenuRefreshTimer) {
      clearTimeout(this.initialMenuRefreshTimer)
    }

    this.initialMenuRefreshTimer = setTimeout(() => {
      this.initialMenuRefreshTimer = null
      void this.updateTrayMenu()
    }, 2500)
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
  private async loadClaudeCodeConfigs(): Promise<TrayConfigSummary[]> {
    try {
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
   * 加载所有声明 configSet 分组的 registry 工具及其配置集列表
   * @description claude-code 走遗留通道不在此列；单个工具加载失败仅跳过，不影响整体菜单。
   */
  private async loadToolSetGroups(): Promise<TrayToolSetGroup[]> {
    try {
      const snapshot = await toolRegistryService.getSnapshot()
      const groups: TrayToolSetGroup[] = []
      for (const tool of snapshot.tools) {
        if (!tool.artifacts.some(artifact => artifact.configSet)) continue
        let sets: ToolConfigSetSummary[] = []
        try {
          sets = await toolConfigSetService.listConfigSets(tool.toolId)
        } catch (error) {
          logger.warn(`加载工具 ${tool.toolId} 配置集列表失败`, error)
        }
        groups.push({
          toolId: tool.toolId,
          label: tool.displayName['zh-CN'] || tool.displayName['en-US'] || tool.toolId,
          sets
        })
      }
      return groups
    } catch (error) {
      logger.error('加载 registry 工具快照失败:', error)
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
   * @description 托管模式开启时禁止从托盘切换配置，仅弹出系统通知提示用户。
   */
  private async switchConfig(configName: string, configPath: string): Promise<void> {
    try {
      // 托管模式拦截：开启托管模式时不允许通过托盘切换配置（任务 4c）
      if (managedModeService.isManagedModeEnabled()) {
        this.showManagedModeBlockedNotification(configName)
        logger.info(`托管模式已开启，已拦截托盘切换配置: ${configName} (${configPath})`)
        return
      }

      // activateConfig 返回 void，如果没有抛出异常就表示成功
      await configService.activateConfig(configPath)

      // 激活成功，发送切换配置事件给渲染进程以刷新UI
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('tray:switch-config', { name: configName, path: configPath })
      }

      // 显示成功通知
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
        icon: iconPath || undefined
      }).show()

      logger.info(`切换配置成功: ${configName} (${configPath})`)
    } catch (error) {
      logger.error('切换配置失败:', error)

      // 显示失败通知
      new Notification({
        title: '配置切换失败',
        body: error instanceof Error ? error.message : String(error)
      }).show()
    }
  }

  /**
   * 切换 registry 工具配置集（claude-code 之外的通用通道）
   * @description 托管模式开启时同样拦截，仅弹出系统通知提示用户。
   */
  private async switchToolConfigSet(toolId: string, toolLabel: string, setId: string, setName: string): Promise<void> {
    try {
      if (managedModeService.isManagedModeEnabled()) {
        this.showManagedModeBlockedNotification(setName)
        logger.info(`托管模式已开启，已拦截托盘切换配置集: ${toolId}/${setName} (${setId})`)
        return
      }

      await toolConfigSetService.activateConfigSet(toolId, setId)

      // 激活成功，发送切换配置事件给渲染进程以刷新UI
      const mainWindow = BrowserWindow.getAllWindows()[0]
      if (mainWindow) {
        mainWindow.webContents.send('tray:switch-config', { name: setName, path: '', toolId })
      }

      new Notification({
        title: '配置切换',
        body: `已切换 ${toolLabel} 配置集: ${setName}`,
        icon: this.getNotificationIcon()
      }).show()

      logger.info(`切换配置集成功: ${toolId}/${setName} (${setId})`)
    } catch (error) {
      logger.error('切换配置集失败:', error)

      new Notification({
        title: '配置切换失败',
        body: error instanceof Error ? error.message : String(error)
      }).show()
    }
  }

  /**
   * 系统通知图标路径（Windows 用 ico，其余平台由系统回退）
   */
  private getNotificationIcon(): string {
    if (process.platform === 'win32') {
      const icoPath = join(__dirname, '../../resources/icons/ccb.ico')
      if (fs.existsSync(icoPath)) {
        return icoPath
      }
    }
    return ''
  }

  /**
   * 托管模式拦截托盘切换配置时的系统通知
   * @param configName 被拦截切换的配置名称
   */
  private showManagedModeBlockedNotification(configName: string): void {
    try {
      // 获取图标路径（与 switchConfig 保持一致）
      let iconPath = ''
      if (process.platform === 'win32') {
        const icoPath = join(__dirname, '../../resources/icons/ccb.ico')
        if (fs.existsSync(icoPath)) {
          iconPath = icoPath
        }
      }

      new Notification({
        title: '配置切换被拦截',
        body: `托管模式已开启，不允许切换到配置: ${configName}。请先关闭托管模式再操作。`,
        icon: iconPath || undefined
      }).show()
    } catch (error) {
      logger.error('显示托管模式拦截通知失败:', error)
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
    app.quit()
  }

  /**
   * 更新托盘菜单（动态加载 claude-code 配置与 registry 工具配置集）
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
      // Windows 支持托盘图标闪烁（类型声明不包含此方法，使用运行时检测）
      const trayWithHighlight = this.tray as unknown as { setHighlightMode?: (mode: 'always' | 'never') => void }
      trayWithHighlight.setHighlightMode?.(flash ? 'always' : 'never')
    }
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.initialMenuRefreshTimer) {
      clearTimeout(this.initialMenuRefreshTimer)
      this.initialMenuRefreshTimer = null
    }

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
