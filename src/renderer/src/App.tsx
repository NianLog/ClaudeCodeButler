/**
 * React 主应用组件
 * 提供应用布局和路由功能
 */

import React, { useEffect, useState } from 'react'
import { App as AntdApp } from 'antd'
import { useAppStore } from './store/app-store'
import { useSettingsStore } from './store/settings-store'
import { useConfigListStore } from './store/config-list-store'
import { useRuleStore } from './store/rule-store'
import ModernLayout from './components/Layout/ModernLayout'
import ModernConfigPanel from './components/Config/ModernConfigPanel'
import AutomationPanel from './components/Automation/AutomationPanel'
import StatisticsPanel from './components/Statistics/StatisticsPanel'
import SettingsPanel from './components/Settings/SettingsPanel'
import ProjectManagement from './components/Projects/ProjectManagement'
import ManagedModePanel from './components/ManagedMode/ManagedModePanel'
import MCPManagementPanel from './components/MCP/MCPManagementPanel'
import LoadingScreen from './components/Common/LoadingScreen'
import ErrorBoundary from './components/Common/ErrorBoundary'
import NotificationContainer from './components/Common/NotificationContainer'
import PrivilegeWarningModal from './components/Common/PrivilegeWarningModal'
import './styles/App.css'
import './styles/design-system.css'

// 移除Layout引用，使用ModernLayout

/**
 * 内部应用组件，在 AntdApp context 中
 */
const AppContent: React.FC = () => {
  const { message } = AntdApp.useApp()
  const {
    activeMainTab,
    sidebarCollapsed,
    notifications,
    initialize,
    removeNotification
  } = useAppStore()

  const { initialize: initializeSettings } = useSettingsStore()
  const { refreshConfigs } = useConfigListStore()
  const { refreshRules, loadExecutionLogs, loadStats } = useRuleStore()

  // 权限警告状态
  const [privilegeWarningVisible, setPrivilegeWarningVisible] = useState(false)
  const [privilegeWarning, setPrivilegeWarning] = useState<any>(null)
  
  // 全局加载状态
  const [isAppLoading, setIsAppLoading] = useState(true)

  // 权限警告监听
  useEffect(() => {
    const handlePrivilegeWarning = (event: any) => {
      setPrivilegeWarning(event)
      setPrivilegeWarningVisible(true)
    }

    // 托盘配置切换监听
    const handleTraySwitchConfig = () => {
      // 刷新配置列表以更新UI
      refreshConfigs()
    }

    // 监听托盘配置切换事件
    window.electronAPI.tray?.onSwitchConfig?.(handleTraySwitchConfig)

    // 监听权限警告事件
    // 移除安全警告监听

    return () => {
      // 清理事件监听
    }
  }, [refreshConfigs])

  // 应用初始化
  useEffect(() => {
    const initApp = async () => {
      let loadingMessage: (() => void) | null = null

      try {
        // 安全检查message API
        if (!message || typeof message.loading !== 'function') {
          console.error('Message API not available')
          return
        }

        // 显示加载状态
        loadingMessage = message.loading('正在初始化应用...', 0)

        // 并行初始化各个模块
        await Promise.all([
          initialize(),
          initializeSettings(),
          refreshConfigs(),
          refreshRules(),
          loadExecutionLogs(),
          loadStats()
        ])

        // 关闭加载消息
        if (loadingMessage) loadingMessage()
        
        // 设置应用加载完成
        setIsAppLoading(false)

        // 安全地调用message方法
        if (message && typeof message.success === 'function') {
          message.success('CCB 应用初始化完成')
        }
      } catch (error) {
        // 关闭加载消息
        if (loadingMessage) loadingMessage()
        
        // 设置应用加载完成（即使失败也要关闭加载屏幕）
        setIsAppLoading(false)

        // 安全地调用message方法
        if (message && typeof message.error === 'function') {
          message.error(`应用初始化失败: ${error instanceof Error ? error.message : String(error)}`)
        }

        console.error('Failed to initialize app:', error)
      }
    }

    initApp()
  }, [initialize, initializeSettings, refreshConfigs, refreshRules, loadExecutionLogs, loadStats])

  // 权限提升处理
  const handleElevatePrivileges = async (): Promise<boolean> => {
    try {
      return await window.electronAPI.privilege.elevate()
    } catch (error) {
      console.error('权限提升失败:', error)
      return false
    }
  }

  // 以管理员身份重启
  const handleRelaunchAsAdmin = async (): Promise<boolean> => {
    try {
      return await window.electronAPI.privilege.relaunchAsAdmin()
    } catch (error) {
      console.error('以管理员身份重启失败:', error)
      return false
    }
  }

  // 渲染内容区域
  const renderContent = () => {
    switch (activeMainTab) {
      case 'configs':
        return <ModernConfigPanel />
      case 'automation':
        return <AutomationPanel />
      case 'statistics':
        return <StatisticsPanel />
      case 'projects':
        return <ProjectManagement />
      case 'managed-mode':
        return <ManagedModePanel />
      case 'mcp-management':
        return <MCPManagementPanel />
      case 'settings':
        return <SettingsPanel />
      default:
        return <ModernConfigPanel />
    }
  }

  return (
    <ModernLayout>
      {renderContent()}

      {/* 通知容器 */}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />

      {/* 全局加载屏幕 */}
      <LoadingScreen visible={isAppLoading} />

      {/* 权限警告模态框 */}
      <PrivilegeWarningModal
        visible={privilegeWarningVisible}
        warning={privilegeWarning}
        onClose={() => setPrivilegeWarningVisible(false)}
        onElevate={handleElevatePrivileges}
        onRelaunchAsAdmin={handleRelaunchAsAdmin}
      />
    </ModernLayout>
  )
}

/**
 * 主应用组件
 */
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AntdApp>
        <AppContent />
      </AntdApp>
    </ErrorBoundary>
  )
}

export default App