/**
 * IPC 处理器
 * 负责处理渲染进程与主进程之间的通信
 */

import { ipcMain, app } from 'electron'
import { ConfigService } from './services/config-service'
import { ruleEngineService } from './services/rule-engine.service'
import { ConfigMigrationService } from './services/config-migration'
import { statisticsService } from './services/statistics-service'
import { claudeCodeAnalyticsService } from './services/claude-code-analytics-service'
import { claudeCodeVersionService } from './services/claude-code-version-service'
import { projectManagementService } from './services/project-management-service'
import { SettingsService } from './services/settings-service'
import { logger } from './utils/logger'
import { logStorageService } from './services/log-storage.service';
import { ruleStorageService } from './services/rule-storage.service';
import { managedModeLogRotationService } from './services/managed-mode-log-rotation.service'


// 服务实例
const configService = new ConfigService()
const settingsService = new SettingsService()

// 导出 configService 供其他模块使用
export { configService, settingsService }

/**
 * 简化的IPC处理器包装器
 */
function createSimpleHandler<T extends any[]>(
  handler: (...args: T) => Promise<any>
) {
  return async (_event: Electron.IpcMainInvokeEvent, ...args: T): Promise<any> => {
    try {
      const result = await handler(...args)
      return { success: true, data: result }
    } catch (error) {
      logger.error('IPC处理器执行失败:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }
}

/**
 * 设置 IPC 处理器
 */
export function setupIpcHandlers(): void {
  logger.info('设置 IPC 处理器')

  setupConfigHandlers()
  setupRuleHandlers()
  setupAppHandlers()
  setupSystemHandlers()
  setupStatisticsHandlers()
  setupClaudeCodeAnalyticsHandlers()
  setupClaudeCodeVersionHandlers()
  setupProjectManagementHandlers()
  setupSettingsHandlers()
  setupManagedModeLogRotationHandlers()

  logger.info('IPC 处理器设置完成')
}

/**
 * 配置管理相关的 IPC 处理器
 */
function setupConfigHandlers(): void {
  ipcMain.handle('config:list', createSimpleHandler(() => configService.scanConfigs()))
  ipcMain.handle('config:get', createSimpleHandler((path: string) => configService.getConfig(path)))
  ipcMain.handle('config:save', createSimpleHandler((path: string, content: any, metadata?: any) => configService.saveConfig(path, content, metadata)))
  ipcMain.handle('config:saveMetadata', createSimpleHandler((path: string, metadata: any) => configService.saveConfigMetadata(path, metadata)))
  ipcMain.handle('config:getMetadata', createSimpleHandler((path: string) => configService.getConfigMetadata(path)))
  ipcMain.handle('config:create', createSimpleHandler(async (name: string, template?: string) => ({ path: await configService.createConfig(name, template) })))
  ipcMain.handle('config:delete', createSimpleHandler((path: string) => configService.deleteConfig(path)))
  ipcMain.handle('config:validate', createSimpleHandler((content: any) => configService.validateConfig(content)))
  ipcMain.handle('config:createBackup', createSimpleHandler((path: string) => configService.createBackup(path)))
  ipcMain.handle('config:restoreBackup', createSimpleHandler((backupId: string) => configService.restoreBackup(backupId)))
  ipcMain.handle('config:listBackups', createSimpleHandler((configPath: string) => configService.listBackups(configPath)))
  ipcMain.handle('config:compare', createSimpleHandler(async (p1: string, p2: string) => ({ isSame: await configService.compareConfigs(p1, p2) })))
  ipcMain.handle('config:checkMatch', createSimpleHandler(async (p: string) => ({ isMatch: await configService.checkConfigMatch(p) })))
  ipcMain.handle('config:compareContent', createSimpleHandler(async (p1: string, p2: string) => ({ isSame: await configService.compareConfigContent(p1, p2) })))
  ipcMain.handle('config:activateConfig', createSimpleHandler((p: string) => configService.activateConfig(p)))
  ipcMain.handle('config:migrateFile', createSimpleHandler(async (p: string) => ({ success: await ConfigMigrationService.migrateConfigFile(p) })))
  ipcMain.handle('config:migrateFiles', createSimpleHandler((paths: string[]) => ConfigMigrationService.migrateConfigFiles(paths)))
  ipcMain.handle('config:checkMigration', createSimpleHandler(async (filePath: string) => {
    try {
      const fs = require('fs/promises')
      const content = await fs.readFile(filePath, 'utf8')
      const config = JSON.parse(content)
      const needsMigration = ConfigMigrationService.isOldFormat(config)
      return { needsMigration }
    } catch (error) {
      return { needsMigration: false, error: error instanceof Error ? error.message : String(error) }
    }
  }))
  ipcMain.handle('config:autoUpdateClaudeCodeStatus', createSimpleHandler(() => configService.autoUpdateClaudeCodeStatus()))

  // 从用户目录导入配置（扫描 ~/.claude 目录）
  ipcMain.handle('config:importFromUserDir', createSimpleHandler(() => configService.importFromUserDir()))
}

/**
 * 规则管理相关的 IPC 处理器
 */
function setupRuleHandlers(): void {
  ipcMain.handle('rule:list', createSimpleHandler(() => ruleEngineService.getAllRules()))
  ipcMain.handle('rule:create', createSimpleHandler((ruleData: any) => ruleEngineService.createRule(ruleData)))
  ipcMain.handle('rule:update', createSimpleHandler((id: string, updates: Partial<any>) => ruleEngineService.updateRule(id, updates)))
  ipcMain.handle('rule:delete', createSimpleHandler((id: string) => ruleEngineService.deleteRule(id)))
  ipcMain.handle('rule:toggle', createSimpleHandler((id: string, enabled: boolean) => ruleEngineService.updateRule(id, { enabled })))
  
  // 实现日志和统计的处理器
  ipcMain.handle('rule:getExecutionLog', createSimpleHandler(() => logStorageService.readLogs()))
  ipcMain.handle('rule:getStats', createSimpleHandler(async () => {
    const rules = await ruleStorageService.readRules();
    const logs = await logStorageService.readLogs();
    const stats = {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.enabled).length,
      totalExecutions: logs.length,
      failedExecutions: logs.filter(l => !l.success).length,
    };
    return stats;
  }))

  // 保留一个空的 execute 处理器以防万一
  ipcMain.handle('rule:execute', createSimpleHandler((id: string) => { 
    logger.warn(`Manual execution for rule ${id} not implemented via this handler.`); 
    return Promise.resolve(); 
  }))
}


/**
 * 应用相关的 IPC 处理器
 */
function setupAppHandlers(): void {
  ipcMain.handle('app:getVersion', createSimpleHandler(() => Promise.resolve(app.getVersion())))
  ipcMain.handle('app:getPath', createSimpleHandler((name: string) => Promise.resolve(app.getPath(name as any))))
  ipcMain.handle('app:quit', createSimpleHandler(() => { app.quit(); return Promise.resolve(); }))
  ipcMain.handle('app:relaunch', createSimpleHandler(() => { app.relaunch(); app.exit(); return Promise.resolve(); }))
  ipcMain.handle('app:getInfo', createSimpleHandler(() => Promise.resolve({
    name: app.getName(),
    version: app.getVersion(),
    path: app.getAppPath(),
    userDataPath: app.getPath('userData')
  })))
}

/**
 * 系统相关的 IPC 处理器
 */
function setupSystemHandlers(): void {
  ipcMain.handle('system:showNotification', createSimpleHandler((title: string, body: string) => {
    const { Notification } = require('electron')
    new Notification({ title, body }).show()
    return Promise.resolve()
  }))
  ipcMain.handle('system:openExternal', createSimpleHandler(async (url: string) => {
    const { shell } = await import('electron')
    await shell.openExternal(url)
  }))
  ipcMain.handle('system:downloadFile', async (event, url: string, fileName?: string) => {
    try {
      const { BrowserWindow, shell, session } = await import('electron')
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      if (!win) {
        return { success: false, error: '未找到活动窗口' }
      }

      logger.info(`========== 开始下载文件 ==========`)
      logger.info(`下载URL: ${url}`)
      logger.info(`文件名: ${fileName || '未指定'}`)

      // 1. 先测试URL是否可访问
      try {
        logger.info(`测试URL访问性...`)
        const https = await import('https')
        const http = await import('http')
        const client = url.startsWith('https') ? https : http

        await new Promise((testResolve, testReject) => {
          const req = client.request(url, { method: 'HEAD' }, (res) => {
            logger.info(`URL测试响应: statusCode=${res.statusCode}, contentType=${res.headers['content-type']}`)
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
              testResolve(true)
            } else {
              testReject(new Error(`HTTP ${res.statusCode}`))
            }
          })
          req.on('error', (err) => {
            logger.error(`URL测试失败:`, err)
            testReject(err)
          })
          req.setTimeout(5000, () => {
            req.destroy()
            testReject(new Error('URL测试超时'))
          })
          req.end()
        })
      } catch (testError) {
        logger.error(`URL不可访问:`, testError)
        return {
          success: false,
          error: 'url_not_accessible',
          message: `无法访问下载地址: ${testError instanceof Error ? testError.message : String(testError)}`
        }
      }

      logger.info(`URL可访问，开始Electron下载流程...`)

      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          logger.warn('下载超时(5分钟)')
          resolve({ success: false, error: 'timeout', message: '下载超时(5分钟)' })
        }, 300000) // 5分钟超时

        // 2. 触发下载前先注册监听器
        let downloadPath = ''
        let downloadStarted = false

        const downloadHandler = async (downloadEvent: Electron.Event, item: Electron.DownloadItem, webContents: Electron.WebContents) => {
          downloadStarted = true
          logger.info(`========== will-download 事件触发 ==========`)
          logger.info(`文件名: ${item.getFilename()}`)
          logger.info(`MIME类型: ${item.getMimeType()}`)
          logger.info(`总大小: ${item.getTotalBytes()} 字节`)

          // 设置保存路径
          const { app } = await import('electron')
          const downloadsPath = app.getPath('downloads')
          const savePath = require('path').join(downloadsPath, fileName || item.getFilename())

          logger.info(`设置保存路径: ${savePath}`)
          item.setSavePath(savePath)
          downloadPath = savePath

          let lastUpdate = Date.now()
          let totalBytes = 0

          item.on('updated', (updateEvent, state) => {
            const now = Date.now()
            if (now - lastUpdate > 500) { // 每500ms更新一次进度
              lastUpdate = now
              totalBytes = item.getTotalBytes()

              if (state === 'interrupted') {
                // 下载中断，不立即返回，等待 done 事件来处理
                logger.warn(`========== 下载状态变更为 interrupted ==========`)
                logger.warn(`已接收: ${item.getReceivedBytes()} / ${totalBytes} 字节`)
              } else if (state === 'progressing') {
                if (item.isPaused()) {
                  clearTimeout(timeoutId)
                  logger.warn('========== 下载已暂停 ==========')
                  win.webContents.session.removeListener('will-download', downloadHandler)
                  resolve({ success: false, error: 'paused', message: '下载已暂停' })
                } else {
                  // 发送进度更新事件
                  const receivedBytes = item.getReceivedBytes()
                  const progress = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0
                  logger.info(`========== 下载进度: ${progress}% (${receivedBytes}/${totalBytes}) ==========`)
                  event.sender.send('download:progress', {
                    progress,
                    receivedBytes,
                    totalBytes
                  })
                }
              }
            }
          })

          item.once('done', async (doneEvent, state) => {
            clearTimeout(timeoutId)
            win.webContents.session.removeListener('will-download', downloadHandler)
            logger.info(`========== 下载完成事件触发 ==========`)
            logger.info(`状态: ${state}`)
            logger.info(`文件路径: ${downloadPath}`)

            if (state === 'completed') {
              // 下载完成,自动打开文件所在文件夹
              try {
                logger.info('下载成功完成，尝试打开文件夹')
                shell.showItemInFolder(downloadPath)
                resolve({
                  success: true,
                  path: downloadPath,
                  message: '下载完成,已打开文件夹'
                })
              } catch (error) {
                logger.warn('打开文件夹失败:', error)
                resolve({
                  success: true,
                  path: downloadPath,
                  message: '下载完成'
                })
              }
            } else if (state === 'interrupted') {
              // 下载中断，提示使用浏览器下载
              const receivedBytes = item.getReceivedBytes()
              const totalBytes = item.getTotalBytes()
              logger.error(`========== 下载中断 ==========`)
              logger.error(`已接收 ${receivedBytes} / ${totalBytes} 字节`)

              // 获取更详细的错误信息
              const lastErrorMessage = item.getLastErrorMessage ? item.getLastErrorMessage() : '未知原因'
              logger.error(`中断原因: ${lastErrorMessage}`)
              logger.error(`URL: ${item.getURL()}`)
              logger.error(`保存路径: ${downloadPath}`)

              resolve({
                success: false,
                error: 'interrupted',
                message: `下载被中断（${lastErrorMessage}），可能是网络问题或文件不可访问，请使用浏览器下载`
              })
            } else if (state === 'cancelled') {
              logger.info('========== 下载已被用户取消 ==========')
              resolve({
                success: false,
                error: 'cancelled',
                message: '下载已取消'
              })
            } else {
              logger.error(`========== 下载失败，未知状态: ${state} ==========`)
              resolve({
                success: false,
                error: state,
                message: `下载失败: ${state}`
              })
            }
          })
        }

        // 3. 注册事件监听器
        win.webContents.session.on('will-download', downloadHandler)

        // 4. 触发下载
        logger.info(`触发downloadURL: ${url}`)
        win.webContents.downloadURL(url)

        // 如果5秒内没有开始下载,返回超时
        setTimeout(() => {
          if (!downloadStarted) {
            clearTimeout(timeoutId)
            win.webContents.session.removeListener('will-download', downloadHandler)
            logger.error('========== 下载启动超时 ==========')
            logger.error('5秒内未触发 will-download 事件')
            logger.error(`URL: ${url}`)
            resolve({ success: false, error: 'timeout', message: '下载启动超时' })
          }
        }, 5000)
      })
    } catch (error) {
      logger.error('下载文件异常:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('system:fetchUrl', async (_, url: string) => {
    try {
      const https = await import('https')
      const http = await import('http')

      return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http

        client.get(url, (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ success: true, data })
            } else {
              resolve({ success: false, error: `HTTP ${res.statusCode}` })
            }
          })
        }).on('error', (error) => {
          resolve({ success: false, error: error.message })
        })
      })
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('system:showItemInFolder', createSimpleHandler(async (fullPath: string) => {
    const { shell } = await import('electron')
    shell.showItemInFolder(fullPath)
  }))
  ipcMain.handle('system:getInfo', createSimpleHandler(async () => {
    const os = await import('os')
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
    }
  }))
  ipcMain.handle('system:getProcessInfo', createSimpleHandler(() => Promise.resolve({
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
  })))
  ipcMain.handle('system:getPlatform', createSimpleHandler(() => Promise.resolve(process.platform)))
}

/**
 * 统计相关的 IPC 处理器
 */
function setupStatisticsHandlers(): void {
  ipcMain.handle('statistics:getSummary', createSimpleHandler((timeRange?: { start: number; end: number }) => statisticsService.getSummary(timeRange)))
  ipcMain.handle('statistics:getConfigUsage', createSimpleHandler((timeRange?: { start: number; end: number }) => statisticsService.getConfigUsageStats(timeRange)))
  ipcMain.handle('statistics:getRuleExecution', createSimpleHandler((timeRange?: { start: number; end: number }) => statisticsService.getRuleExecutionStats(timeRange)))
  ipcMain.handle('statistics:getSystem', createSimpleHandler((timeRange?: { start: number; end: number }) => statisticsService.getSystemStats(timeRange)))
  ipcMain.handle('statistics:generate', createSimpleHandler((timeRange?: { start: number; end: number }) => statisticsService.generateSummary(timeRange)))
  ipcMain.handle('statistics:export', createSimpleHandler((exportPath: string) => statisticsService.exportStats(exportPath)))
  ipcMain.handle('statistics:cleanup', createSimpleHandler((daysToKeep?: number) => statisticsService.cleanup(daysToKeep)))
}

/**
 * 设置 Claude Code 分析相关的 IPC 处理器
 */
function setupClaudeCodeAnalyticsHandlers(): void {
  ipcMain.handle('claudeCode:getAnalytics', createSimpleHandler((forceRefresh?: boolean) => claudeCodeAnalyticsService.getAnalytics(forceRefresh)))
  ipcMain.handle('claudeCode:clearCache', createSimpleHandler(() => { claudeCodeAnalyticsService.clearCache(); return Promise.resolve({ message: '缓存已清除' }); }))
}

/**
 * 设置 Claude Code 版本管理相关的 IPC 处理器
 */
function setupClaudeCodeVersionHandlers(): void {
  ipcMain.handle('claudeCodeVersion:checkUpdates', createSimpleHandler((forceRefresh?: boolean) => claudeCodeVersionService.checkForUpdates(forceRefresh)))
  ipcMain.handle('claudeCodeVersion:getCurrentVersion', createSimpleHandler(() => claudeCodeVersionService.getCurrentVersion()))
  ipcMain.handle('claudeCodeVersion:getLatestVersion', createSimpleHandler(() => claudeCodeVersionService.getLatestVersion()))
  ipcMain.handle('claudeCodeVersion:update', createSimpleHandler(() => claudeCodeVersionService.update()))
  ipcMain.handle('claudeCodeVersion:isInstalled', createSimpleHandler(() => claudeCodeVersionService.isInstalled()))
  ipcMain.handle('claudeCodeVersion:clearCache', createSimpleHandler(() => { claudeCodeVersionService.clearCache(); return Promise.resolve({ message: '版本缓存已清除' }); }))
}

/**
 * 设置项目管理相关的 IPC 处理器
 */
function setupProjectManagementHandlers(): void {
  ipcMain.handle('projectManagement:scanProjects', createSimpleHandler(() => projectManagementService.scanProjects()))
  ipcMain.handle('projectManagement:getProjectSessions', createSimpleHandler((projectId: string) => projectManagementService.getProjectSessions(projectId)))
  ipcMain.handle('projectManagement:getSessionConversation', createSimpleHandler((projectId: string, sessionId: string, limit?: number) => projectManagementService.getSessionConversation(projectId, sessionId, limit)))
  ipcMain.handle('projectManagement:continueSession', createSimpleHandler((projectId: string, sessionId: string, projectPath?: string, terminal?: string, asAdmin?: boolean) => projectManagementService.continueSession(projectId, sessionId, projectPath, terminal, asAdmin)))
  ipcMain.handle('projectManagement:getProjectSummary', createSimpleHandler((projectId: string) => projectManagementService.getProjectSummary(projectId)))
}

/**
 * 应用设置相关的 IPC 处理器
 */
function setupSettingsHandlers(): void {
  // 获取所有设置
  ipcMain.handle('settings:getAll', createSimpleHandler(() => settingsService.getSettings()))

  // 获取特定标签页设置
  ipcMain.handle('settings:getTab', createSimpleHandler((tab: string) => settingsService.getTabSettings(tab as any)))

  // 保存特定标签页设置
  ipcMain.handle('settings:saveTab', createSimpleHandler(async (tab: string, data: any, options?: any) => {
    const newSettingsService = new SettingsService() // 创建新实例以更新设置
    await newSettingsService.loadSettings() // 先加载现有设置
    await newSettingsService.saveSettings(tab as any, data, options)
  }))

  // 保存所有设置
  ipcMain.handle('settings:saveAll', createSimpleHandler(async (data: any) => {
    const newSettingsService = new SettingsService() // 创建新实例以更新设置
    await newSettingsService.loadSettings() // 先加载现有设置
    await newSettingsService.saveSettings('basic', data)
    await newSettingsService.saveSettings('editor', data)
    await newSettingsService.saveSettings('notifications', data)
    await newSettingsService.saveSettings('advanced', data)
    await newSettingsService.saveSettings('window', data)
  }))

  // 重置设置
  ipcMain.handle('settings:reset', createSimpleHandler(async (tab?: string) => {
    await settingsService.resetSettings(tab as any)
  }))

  // 导出设置
  ipcMain.handle('settings:export', createSimpleHandler(async (filePath?: string) => {
    return await settingsService.exportSettings(filePath)
  }))

  // 导入设置
  ipcMain.handle('settings:import', createSimpleHandler(async (content: string, merge?: boolean) => {
    await settingsService.importSettings(content, merge)
  }))

  // 加载设置（启动时调用）
  ipcMain.handle('settings:load', createSimpleHandler(async () => {
    return await settingsService.loadSettings()
  }))
}

/**
 * 托管模式日志轮转相关的 IPC 处理器
 * @description 提供日志持久化、历史查询等功能
 */
function setupManagedModeLogRotationHandlers(): void {
  // 持久化日志到文件
  ipcMain.handle('managedModeLogRotation:persistLogs', createSimpleHandler((logs: any[]) =>
    managedModeLogRotationService.persistLogs(logs)
  ))

  // 获取历史日志文件列表
  ipcMain.handle('managedModeLogRotation:getLogFileList', createSimpleHandler(() =>
    managedModeLogRotationService.getLogFileList()
  ))

  // 读取指定日志文件
  ipcMain.handle('managedModeLogRotation:readLogFile', createSimpleHandler((filename: string) =>
    managedModeLogRotationService.readLogFile(filename)
  ))

  // 按时间范围查询日志
  ipcMain.handle('managedModeLogRotation:queryLogsByTimeRange', createSimpleHandler((startTime: number, endTime: number) =>
    managedModeLogRotationService.queryLogsByTimeRange(startTime, endTime)
  ))

  // 获取配置
  ipcMain.handle('managedModeLogRotation:getConfig', createSimpleHandler(() =>
    managedModeLogRotationService.getConfig()
  ))

  // 更新配置
  ipcMain.handle('managedModeLogRotation:updateConfig', createSimpleHandler((config: any) =>
    managedModeLogRotationService.updateConfig(config)
  ))
}
