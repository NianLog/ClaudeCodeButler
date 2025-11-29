/**
 * CCB托管模式代理服务 - 入口文件
 * @description 代理服务的启动入口
 */

import { loadConfig, createServerConfig } from './config.js'
import { initLogger, getLogger } from './logger.js'
import { startProxyServer } from './server.js'

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    // 加载配置
    const managedConfig = await loadConfig()

    // 初始化日志
    initLogger(
      managedConfig.logging?.level || 'info',
      managedConfig.logging?.enabled !== false
    )

    const logger = getLogger()

    // 检查是否启用托管模式
    if (!managedConfig.enabled) {
      logger.warn('托管模式未启用')
      process.exit(0)
    }

    // 检查是否配置了服务商
    if (managedConfig.providers.length === 0) {
      logger.error('未配置任何API服务商,请在CCB中添加服务商配置')
      process.exit(1)
    }

    // 检查当前服务商是否存在
    const currentProvider = managedConfig.providers.find(
      p => p.id === managedConfig.currentProvider
    )

    if (!currentProvider) {
      logger.error('当前服务商不存在', {
        currentProvider: managedConfig.currentProvider,
        availableProviders: managedConfig.providers.map(p => p.id)
      })
      process.exit(1)
    }

    logger.info('CCB托管模式代理服务', {
      version: '1.1.0',
      currentProvider: currentProvider.name,
      port: managedConfig.port
    })

    // 创建服务器配置
    const serverConfig = createServerConfig(managedConfig)

    // 启动代理服务器
    await startProxyServer(serverConfig)

    // 优雅关闭处理
    process.on('SIGINT', () => {
      logger.info('收到 SIGINT 信号,正在关闭服务器...')
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      logger.info('收到 SIGTERM 信号,正在关闭服务器...')
      process.exit(0)
    })
  } catch (error: any) {
    console.error('服务启动失败:', error.message)
    process.exit(1)
  }
}

// 运行主函数
main()
