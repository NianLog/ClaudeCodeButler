/**
 * CCB托管模式代理服务 - 配置加载模块
 * @description 负责加载和管理代理服务配置
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { ManagedModeConfig, ProxyServerConfig } from './types.js'

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ManagedModeConfig = {
  enabled: true,
  port: 8487,
  currentProvider: '',
  providers: [],
  logging: {
    enabled: true,
    level: 'info'
  }
}

/**
 * 配置文件路径
 */
export const CONFIG_PATH = path.join(os.homedir(), '.ccb', 'managed-mode-config.json')

/**
 * 加载配置文件
 * @returns 托管模式配置
 */
export async function loadConfig(): Promise<ManagedModeConfig> {
  try {
    // 检查配置文件是否存在
    await fs.access(CONFIG_PATH)

    // 读取配置文件
    const data = await fs.readFile(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(data) as ManagedModeConfig

    // 合并默认配置
    return {
      ...DEFAULT_CONFIG,
      ...config,
      logging: {
        enabled: config.logging?.enabled ?? true,
        level: config.logging?.level ?? 'info'
      }
    }
  } catch (error: any) {
    // 配置文件不存在或读取失败,返回默认配置
    console.warn(`配置文件加载失败: ${error.message}, 使用默认配置`)
    return DEFAULT_CONFIG
  }
}

/**
 * 保存配置文件
 * @param config 托管模式配置
 */
export async function saveConfig(config: ManagedModeConfig): Promise<void> {
  try {
    // 确保配置目录存在
    const configDir = path.dirname(CONFIG_PATH)
    await fs.mkdir(configDir, { recursive: true })

    // 写入配置文件
    await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error: any) {
    console.error(`配置文件保存失败: ${error.message}`)
    throw error
  }
}

/**
 * 监听配置文件变化
 * @param callback 配置变化回调函数
 */
export function watchConfig(callback: (config: ManagedModeConfig) => void): void {
  // 简化实现，暂时不监听文件变化
  // TODO: 实现配置文件监听
}

/**
 * 创建代理服务器配置
 * @param managedConfig 托管模式配置
 * @returns 代理服务器配置
 */
export function createServerConfig(managedConfig: ManagedModeConfig): ProxyServerConfig {
  return {
    port: managedConfig.port || DEFAULT_CONFIG.port,
    host: '127.0.0.1', // 仅监听本地
    managedMode: managedConfig
  }
}
