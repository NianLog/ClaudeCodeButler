/**
 * Electron API 类型定义
 * 为渲染进程提供 window.electronAPI 的类型支持
 */

import type { ElectronAPI } from '../../../preload/index'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
