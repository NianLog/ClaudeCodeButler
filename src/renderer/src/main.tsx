/**
 * React 应用主入口
 * 负责应用初始化和路由配置
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/globals.css'

// 初始化应用
const initApp = async () => {
  try {
    // 确保 Electron API 可用
    if (!window.electronAPI) {
      throw new Error('Electron API 不可用')
    }

    // 设置全局错误处理
    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error)
    })

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason)
    })

    console.log('React app initializing...')
  } catch (error) {
    console.error('Failed to initialize app:', error)
    throw error
  }
}

// 渲染应用
const renderApp = () => {
  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Root container not found')
  }

  const root = createRoot(container)

  root.render(
    <React.StrictMode>
      <AntApp
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#3b82f6',
            borderRadius: 8,
            fontSize: 14
          }
        }}
        locale={zhCN}
        message={{
          top: 80,
          maxCount: 3,
          duration: 4.5,
          rtl: false,
        }}
      >
        <App />
      </AntApp>
    </React.StrictMode>
  )
}

// 启动应用
const bootstrap = async () => {
  try {
    await initApp()
    renderApp()
    console.log('CCB application started successfully')
  } catch (error) {
    console.error('Failed to bootstrap application:', error)

    // 显示错误页面
    const errorDiv = document.getElementById('error')
    const loadingDiv = document.getElementById('loading')
    const appDiv = document.getElementById('app')

    if (loadingDiv) loadingDiv.style.display = 'none'
    if (appDiv) appDiv.style.display = 'none'
    if (errorDiv) {
      errorDiv.style.display = 'flex'
      const errorMessage = document.getElementById('errorMessage')
      if (errorMessage) {
        errorMessage.textContent = `应用启动失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

// 启动应用
bootstrap()