/**
 * CCB 主进程入口文件
 * 负责应用生命周期管理、窗口创建和系统级功能
 */

import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { execSync } from 'child_process'
import { WindowManager } from './window-manager'
import { TrayManager } from './tray-manager'
import { FileWatcher } from './file-watcher'
import { TaskScheduler } from './task-scheduler'
import { setupIpcHandlers } from './ipc-handlers'
import { privilegeManager } from './utils/privilege-manager'
import { statisticsService } from './services/statistics-service'
import { ruleEngineService } from './services/rule-engine.service' // 导入规则引擎
import { registerManagedModeHandlers, initializeManagedMode, disposeManagedMode } from './ipc/managed-mode-handlers' // 导入托管模式处理程序
import { APP_INFO } from '@shared/constants'
import { logger, LogLevel } from './utils/logger'
import { updateService } from './services/update-service';
import { pathManager } from './utils/path-manager'

/**
 * 主窗口管理器
 */
class CCBApp {
  private windowManager: WindowManager
  private trayManager: TrayManager
  private fileWatcher: FileWatcher
  private taskScheduler: TaskScheduler
  private ruleEngine: typeof ruleEngineService // 添加规则引擎属性
  private enableDevTools: boolean // 是否启用开发者工具

  constructor() {
    this.windowManager = new WindowManager()
    this.trayManager = new TrayManager()
    // 使用正确的路径引用,稍后在 onReady 中动态初始化
    this.fileWatcher = null as any // 临时赋值,在 onReady 中初始化
    this.taskScheduler = new TaskScheduler()
    this.ruleEngine = ruleEngineService // 实例化

    // 检查命令行参数是否启用开发者工具
    this.enableDevTools =
      process.argv.includes('--dev-tools') ||
      process.argv.includes('--debug') ||
      process.argv.includes('-debug') ||
      process.env.NODE_ENV === 'development'

    this.setupAppEvents()
    this.setupIpcHandlers()
  }

  /**
   * 设置应用事件监听
   */
  private setupAppEvents(): void {
    app.whenReady().then(() => {
      this.onReady()
    })

    app.on('window-all-closed', () => {
      // 在 Windows 上，通常不会在所有窗口关闭时退出应用
      // 保持应用在系统托盘运行
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.windowManager.createMainWindow()
      } else {
        // 如果窗口存在但被隐藏，则显示它
        const mainWindow = this.windowManager.getMainWindow()
        if (mainWindow && !mainWindow.isVisible()) {
          mainWindow.show()
        }
      }
    })

    app.on('before-quit', async () => {
      // 允许真正退出
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow) {
        mainWindow.removeAllListeners('close')
      }
      await this.cleanup()
    })

    if (process.env.NODE_ENV === 'development') {
      app.on('certificate-error', () => {
        // 开发环境忽略证书错误
      })
    }
  }

  /**
   * 设置 IPC 处理器
   */
  private setupIpcHandlers(): void {
    setupIpcHandlers()
    registerManagedModeHandlers() // 注册托管模式IPC处理程序

    ipcMain.handle('window:minimize', () => {
      this.windowManager.getMainWindow()?.minimize()
    })

    ipcMain.handle('window:maximize', () => {
      const mainWindow = this.windowManager.getMainWindow()
      if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow?.maximize()
      }
    })

    ipcMain.handle('window:close', () => {
      this.windowManager.getMainWindow()?.hide()
    })

    ipcMain.handle('notification:show', (_event, { title, body }: { title: string, body: string }) => {
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

      const notification = new Notification({
        title,
        body,
        icon: iconPath || undefined,
        // Windows 系统需要通过 toastXml 设置 appUserModelId 来显示正确的应用名称
        ...(process.platform === 'win32' && {
          appUserModelId: APP_INFO.FULL_NAME
        })
      })
      notification.show()
      return notification
    })

    ipcMain.handle('privilege:check', async () => {
      return await privilegeManager.checkPrivileges()
    })

    ipcMain.handle('privilege:elevate', async () => {
      return await privilegeManager.elevatePrivileges()
    })

    ipcMain.handle('privilege:relaunch-as-admin', async () => {
      return await privilegeManager.relaunchAsAdmin()
    })

    // 更新托盘菜单（配置列表刷新时调用）
    ipcMain.handle('tray:updateMenu', async () => {
      await this.trayManager.updateTrayMenu()
    })
  }

  /**
   * 应用准备就绪处理
   */
  private async onReady(): Promise<void> {
    try {
      // 设置应用名称
      app.name = APP_INFO.FULL_NAME

      logger.info(`应用启动: ${APP_INFO.FULL_NAME} v${APP_INFO.VERSION}`)
      logger.info(`进程: ${process.pid}, 平台: ${process.platform}, 版本: ${process.versions.electron}`)
      logger.info(`启动参数: ${process.argv.join(' ')}`)

      await this.checkAndElevatePrivileges()
      await this.ensureDirectories()

      this.fileWatcher = new FileWatcher(pathManager.claudeConfigsDir)

      await this.windowManager.createMainWindow()
      await this.trayManager.createTray()

      this.fileWatcher.start()
      this.taskScheduler.start()
      await this.ruleEngine.start() // 启动规则引擎
      await initializeManagedMode() // 初始化托管模式

      this.setupMenu()

      // 启动后检查更新
      updateService.checkForUpdates();

      logger.info('应用启动完成')
      logger.info(`配置目录: ${pathManager.claudeConfigsDir}`)
    } catch (error) {
      logger.error('应用启动失败:', error)
      app.quit()
    }
  }

  /**
   * 确保必要目录存在
   */
  private async ensureDirectories(): Promise<void> {
    const fs = await import('fs/promises')

    const directories = [
      pathManager.appDataDir,      // 主目录 ~/.ccb
      pathManager.dataDir,          // 数据目录
      pathManager.backupDir,        // 备份目录
      pathManager.logDir,           // 日志目录
      pathManager.cacheDir,         // 缓存目录
      pathManager.configDir,        // 配置目录
      pathManager.claudeConfigsDir  // Claude配置目录 (新增)
    ]

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true })
        logger.debug(`确保目录存在: ${dir}`)
      } catch (error) {
        logger.error(`创建目录失败 ${dir}:`, error)
      }
    }
  }

  /**
   * 设置应用菜单
   */
  private setupMenu(): void {
    const viewSubmenu: Electron.MenuItemConstructorOptions[] = [
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' }
    ]

    // 只在开发模式或使用 --dev-tools 参数时显示开发者工具
    if (this.enableDevTools) {
      viewSubmenu.push({ role: 'toggleDevTools', label: '开发者工具' })
    }

    viewSubmenu.push(
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' }
    )

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '文件',
        submenu: [
          {
            label: '新建配置',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.windowManager.getMainWindow()?.webContents.send('menu:new-config')
            }
          },
          {
            label: '打开配置目录',
            click: async () => {
              const { shell } = await import('electron')
              await shell.openPath(pathManager.claudeConfigsDir)
            }
          },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit()
            }
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '视图',
        submenu: viewSubmenu
      },
      {
        label: '工具',
        submenu: [
          {
            label: '配置验证',
            click: () => {
              this.windowManager.getMainWindow()?.webContents.send('menu:validate-configs')
            }
          },
          {
            label: '清理缓存',
            click: async () => {
              await this.clearCache()
            }
          },
          {
            label: '导出配置',
            click: () => {
              this.windowManager.getMainWindow()?.webContents.send('menu:export-configs')
            }
          }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => {
              this.showAboutDialog()
            }
          },
          {
            label: '用户手册',
            click: async () => {
              const { shell } = await import('electron')
              await shell.openExternal('https://dev.niansir.com/software/ccb/docs')
            }
          }
        ]
      }
    ]

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  }

  /**
   * 显示关于对话框
   */
  private showAboutDialog(): void {
    const { dialog } = require('electron')

    dialog.showMessageBox(this.windowManager.getMainWindow()!, {
      type: 'info',
      title: `关于 ${APP_INFO.FULL_NAME}`,
      message: APP_INFO.FULL_NAME,
      detail: `${APP_INFO.DESCRIPTION}\n\n版本: ${APP_INFO.VERSION}\n作者: NianLog (github.com/NianLog)\n官网: https://dev.niansir.com/software/ccb`,
      buttons: ['确定']
    })
  }

  /**
   * 清理缓存
   */
  private async clearCache(): Promise<void> {
    try {
      const fs = await import('fs/promises')
      await fs.rm(pathManager.cacheDir, { recursive: true, force: true })
      await fs.mkdir(pathManager.cacheDir, { recursive: true })

      logger.info('缓存清理完成')

      const { Notification } = require('electron')
      const { join } = require('path')
      const fsSync = require('fs')

      // 获取图标路径
      let iconPath = ''
      if (process.platform === 'win32') {
        const icoPath = join(__dirname, '../../resources/icons/ccb.ico')
        if (fsSync.existsSync(icoPath)) {
          iconPath = icoPath
        }
      }

      new Notification({
        title: '缓存清理',
        body: '缓存已成功清理',
        icon: iconPath || undefined,
        ...(process.platform === 'win32' && {
          appUserModelId: APP_INFO.FULL_NAME
        })
      }).show()
    } catch (error) {
      logger.error('清理缓存失败:', error)
    }
  }

  /**
   * 检查并提升权限
   */
  private async checkAndElevatePrivileges(): Promise<void> {
    try {
      logger.info('正在检查应用权限...')

      const privilegeCheck = await privilegeManager.checkPrivileges()

      if (privilegeCheck.isRunningAsAdmin) {
        logger.info('检测到管理员权限，无需提升')
        return
      }

      if (privilegeCheck.needsElevation) {
        logger.warn('检测到权限不足，尝试提升权限...')

        const elevated = await privilegeManager.elevatePrivileges({
          forceElevation: false,
          elevationMethod: 'relaunch',
          showWarning: true,
          retryOnFailure: false
        })

        if (!elevated) {
          logger.warn('权限提升失败，将以普通权限模式运行')

          setTimeout(() => {
            this.windowManager.getMainWindow()?.webContents.send('privilege:warning', {
              privilegeLevel: privilegeCheck.privilegeLevel,
              missingPermissions: [
                ...(privilegeCheck.canAccessSystemFiles ? [] : ['文件系统访问']),
                ...(privilegeCheck.canAccessSystemNotifications ? [] : ['系统通知'])
              ],
              recommendations: [
                '右键点击应用图标，选择"以管理员身份运行"',
                '或在设置中手动授予必要权限',
                '或使用 npm run start:admin 命令启动'
              ]
            })
          }, 3000)
        }
      } else {
        logger.info('权限检查通过，当前权限充足')
      }
    } catch (error) {
      logger.error('权限检查失败:', error)
    }
  }

  /**
   * 清理资源
   */
  private async cleanup(): Promise<void> {
    logger.info('正在清理应用资源...')

    try {
      await statisticsService.shutdown()
      this.ruleEngine.stop() // 停止规则引擎
      await disposeManagedMode() // 清理托管模式
      this.fileWatcher?.stop()
      this.taskScheduler?.stop()
      this.trayManager?.destroy()

      logger.info('应用资源清理完成')
    } catch (error) {
      logger.error('清理资源失败:', error)
    }
  }
}

/**
 * 调试模式配置（用于生产包调试）
 */
const isDebugMode = process.argv.includes('--debug') || process.argv.includes('-debug')

if (isDebugMode) {
  if (process.platform === 'win32' && process.stdout?.isTTY) {
    try {
      execSync('chcp 65001', { stdio: 'ignore' })
    } catch (error) {
      // 忽略设置失败
    }
  }
  // 启用 Electron 级别日志输出
  process.env.ELECTRON_ENABLE_LOGGING = 'true'
  process.env.ELECTRON_ENABLE_STACK_DUMPING = 'true'
  app.commandLine.appendSwitch('enable-logging')
  app.commandLine.appendSwitch('v', '1')

  // 提升应用日志级别
  logger.setLogLevel(LogLevel.DEBUG)
  logger.info('调试模式已启用（-debug）')
}

// 创建应用实例
const ccbApp = new CCBApp()

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error)
  app.quit()
})

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的 Promise 拒绝:', reason)
})

// 导出供测试使用
export default ccbApp
