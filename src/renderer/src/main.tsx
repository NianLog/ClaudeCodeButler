/**
 * React 应用主入口
 * 负责应用初始化和路由配置
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntApp, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import App from './App'
import './styles/globals.css'
import { useTranslation } from './locales/useTranslation'
import { formatTranslation, getCurrentLanguage, languageResources } from './locales'
import { useTheme } from './hooks/useTheme'

/**
 * 隐藏加载屏幕，显示应用
 */
const hideLoadingAndShowApp = () => {
  const loadingDiv = document.getElementById('loading')
  const appDiv = document.getElementById('app')

  console.info('[Renderer] hideLoadingAndShowApp')
  if (loadingDiv) {
    loadingDiv.style.transition = 'opacity 0.3s ease'
    loadingDiv.style.opacity = '0'
    setTimeout(() => {
      loadingDiv.style.display = 'none'
    }, 300)
  }
  if (appDiv) {
    appDiv.style.display = 'block'
  }

  if (typeof window !== 'undefined') {
    window.__APP_BOOTSTRAPPED__ = true
    if (window.__APP_BOOT_TIMEOUT__) {
      clearTimeout(window.__APP_BOOT_TIMEOUT__)
    }
  }
}

/**
 * 显示错误页面
 */
const showError = (message: string) => {
  const loadingDiv = document.getElementById('loading')
  const errorDiv = document.getElementById('error')
  const errorMessage = document.getElementById('errorMessage')

  if (loadingDiv) loadingDiv.style.display = 'none'
  if (errorDiv) {
    errorDiv.style.display = 'flex'
    if (errorMessage) errorMessage.textContent = message
  }

  if (typeof window !== 'undefined') {
    window.__APP_BOOTSTRAPPED__ = true
    if (window.__APP_BOOT_TIMEOUT__) {
      clearTimeout(window.__APP_BOOT_TIMEOUT__)
    }
  }
}

const translate = (key: string, variables: Record<string, string | number> = {}) => {
  const language = getCurrentLanguage()
  const dictionary = languageResources[language] || languageResources['zh-CN']
  const translation = dictionary[key]

  if (typeof translation !== 'string') {
    return key
  }

  return formatTranslation(translation, variables)
}

const RootApp: React.FC = () => {
  const { language } = useTranslation()
  const locale = language === 'en-US' ? enUS : zhCN
  const { currentTheme } = useTheme()

  console.info('[Renderer] RootApp render start', { language, theme: currentTheme.id })

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: currentTheme.mode === 'light' ? theme.defaultAlgorithm : theme.darkAlgorithm,
        token: {
          colorPrimary: currentTheme.antdTokens.colorPrimary,
          colorBgContainer: currentTheme.antdTokens.colorBgContainer,
          colorBgElevated: currentTheme.antdTokens.colorBgElevated,
          colorBgLayout: currentTheme.antdTokens.colorBgLayout,
          colorText: currentTheme.antdTokens.colorText,
          colorTextSecondary: currentTheme.antdTokens.colorTextSecondary,
          colorBorder: currentTheme.antdTokens.colorBorder,
          colorBorderSecondary: currentTheme.antdTokens.colorBorderSecondary,
          borderRadius: currentTheme.antdTokens.borderRadius,
          borderRadiusSM: currentTheme.antdTokens.borderRadiusSM,
          fontSize: currentTheme.antdTokens.fontSize,
          fontSizeSM: currentTheme.antdTokens.fontSizeSM,
          controlHeight: currentTheme.antdTokens.controlHeight,
          controlHeightSM: currentTheme.antdTokens.controlHeightSM,
          controlItemBgHover: currentTheme.antdTokens.controlItemBgHover,
          controlItemBgActive: currentTheme.antdTokens.controlItemBgActive,
        },
      }}
    >
      <AntApp
        message={{
          top: 80,
          maxCount: 3,
          duration: 4.5,
          rtl: false,
        }}
      >
        <App />
      </AntApp>
    </ConfigProvider>
  )
}

// 初始化应用
const initApp = async () => {
  console.info('[Renderer] initApp start')
  // 等待 electronAPI 可用（最多等待 5 秒）
  let attempts = 0
  const maxAttempts = 50
  while (!window.electronAPI && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100))
    attempts++
  }

  if (!window.electronAPI) {
    console.warn('Electron API not available after timeout, continuing anyway...')
  } else {
    console.info('[Renderer] electronAPI ready')
  }

  // 设置全局错误处理
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error)
  })

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
  })

  console.log('React app initializing...')
}

// 渲染应用
const renderApp = () => {
  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Root container not found')
  }

  console.info('[Renderer] renderApp')

  const root = createRoot(container)

  root.render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  )

  // 渲染完成后立即隐藏loading
  // 使用 requestAnimationFrame 确保在下一帧渲染后执行
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      console.info('[Renderer] renderApp complete, hide loading')
      hideLoadingAndShowApp()
    })
  })
}

// 启动应用
const bootstrap = async () => {
  try {
    await initApp()
    renderApp()
    console.log('CCB application started successfully')
  } catch (error) {
    console.error('Failed to bootstrap application:', error)
    showError(translate('app.init.startupFailed', {
      error: error instanceof Error ? error.message : String(error)
    }))
  }
}

// 设置超时保护：10秒后无论如何都隐藏loading
setTimeout(() => {
  const loadingDiv = document.getElementById('loading')
  if (loadingDiv && loadingDiv.style.display !== 'none') {
    console.info('Loading fallback triggered (10s elapsed) — hiding loading screen')
    hideLoadingAndShowApp()
  }
}, 10000)

// 启动应用
bootstrap()