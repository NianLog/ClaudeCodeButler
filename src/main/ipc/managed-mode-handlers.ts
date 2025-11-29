/**
 * 托管模式IPC处理程序
 * @description 处理渲染进程发来的托管模式相关请求
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants'
import { managedModeService } from '../services/managed-mode-service'
import type {
  ManagedModeConfig,
  ManagedModeStatus,
  ApiProvider,
  EnvCommand
} from '../../shared/types/managed-mode'

/**
 * 注册托管模式IPC处理程序
 */
export function registerManagedModeHandlers(): void {
  // 启动代理服务
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_START,
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.start()

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 停止代理服务
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_STOP,
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.stop()

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 重启代理服务
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_RESTART,
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.restart()

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 获取服务状态
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_GET_STATUS,
    async (): Promise<ManagedModeStatus> => {
      return managedModeService.getStatus()
    }
  )

  // 获取配置
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_GET_CONFIG,
    async (): Promise<ManagedModeConfig | null> => {
      return managedModeService.getConfig()
    }
  )

  // 更新配置
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_UPDATE_CONFIG,
    async (
      _event,
      config: Partial<ManagedModeConfig>
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.updateConfig(config)

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 切换服务商
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_SWITCH_PROVIDER,
    async (_event, providerId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.switchProvider(providerId)

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 添加服务商
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_ADD_PROVIDER,
    async (_event, provider: ApiProvider): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.addProvider(provider)
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 更新服务商
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_UPDATE_PROVIDER,
    async (_event, provider: ApiProvider): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.updateProvider(provider)

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 删除服务商
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_DELETE_PROVIDER,
    async (_event, providerId: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await managedModeService.deleteProvider(providerId)
        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 获取环境变量命令
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_GET_ENV_COMMAND,
    async (): Promise<EnvCommand[]> => {
      return managedModeService.getEnvCommand()
    }
  )

  // 重置访问令牌
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_RESET_ACCESS_TOKEN,
    async (): Promise<{ success: boolean; data?: { accessToken: string }; error?: string }> => {
      try {
        const newAccessToken = await managedModeService.resetAccessToken()
        return { success: true, data: { accessToken: newAccessToken } }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 获取当前访问令牌
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_GET_ACCESS_TOKEN,
    async (): Promise<{ success: boolean; data?: { accessToken: string }; error?: string }> => {
      try {
        const accessToken = managedModeService.getAccessToken()
        return {
          success: true,
          data: {
            accessToken: accessToken || '未设置'
          }
        }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 启用托管模式
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_ENABLE,
    async (): Promise<{ success: boolean; message?: string; error?: string }> => {
      try {
        const result = await managedModeService.enableManagedMode()

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return result
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 禁用托管模式
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_DISABLE,
    async (): Promise<{ success: boolean; message?: string; error?: string }> => {
      try {
        const result = await managedModeService.disableManagedMode()

        // 通知所有窗口状态变化
        notifyStatusChanged()

        return result
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // 检查托管模式是否已启用
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_IS_ENABLED,
    async (): Promise<{ success: boolean; enabled: boolean }> => {
      try {
        const enabled = managedModeService.isManagedModeEnabled()
        return { success: true, enabled }
      } catch (error: any) {
        return { success: false, enabled: false }
      }
    }
  )

  // 检查是否存在系统设置备份
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_CHECK_BACKUP,
    async (): Promise<{ success: boolean; hasBackup: boolean }> => {
      try {
        const hasBackup = await managedModeService.checkSystemSettingsBackup()
        return { success: true, hasBackup }
      } catch (error: any) {
        return { success: false, hasBackup: false }
      }
    }
  )

  // 更新系统settings配置
  ipcMain.handle(
    IPC_CHANNELS.MANAGED_MODE_UPDATE_SETTINGS_CONFIG,
    async (_event, configData: any): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await managedModeService.updateSettingsConfig(configData)
        return result
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )
}

/**
 * 通知所有窗口状态变化
 */
function notifyStatusChanged(): void {
  const status = managedModeService.getStatus()
  const windows = BrowserWindow.getAllWindows()

  windows.forEach((window) => {
    window.webContents.send(IPC_CHANNELS.MANAGED_MODE_STATUS_CHANGED, status)
  })
}

/**
 * 初始化托管模式服务
 */
export async function initializeManagedMode(): Promise<void> {
  try {
    await managedModeService.initialize()

    // 监听配置更新事件
    managedModeService.on('config-updated', (data) => {
      // 获取所有窗口并发送事件
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (window.webContents && !window.isDestroyed()) {
          window.webContents.send('managed-mode:config-updated', data)
        }
      })
    })

    // 监听日志事件
    managedModeService.on('log', (logData) => {
      // 获取所有窗口并发送日志事件
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (window.webContents && !window.isDestroyed()) {
          window.webContents.send('managed-mode:log', logData)
        }
      })
    })

    console.log('托管模式事件监听器已设置')
  } catch (error: any) {
    console.error('托管模式初始化失败:', error.message)
  }
}

/**
 * 清理托管模式服务
 */
export async function disposeManagedMode(): Promise<void> {
  try {
    await managedModeService.dispose()
  } catch (error: any) {
    console.error('托管模式清理失败:', error.message)
  }
}
