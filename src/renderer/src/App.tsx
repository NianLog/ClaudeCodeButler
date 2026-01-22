/**
 * React 主应用组件
 * 提供应用布局和路由功能
 */

import React, { useEffect, useState, Suspense } from 'react'
import { App as AntdApp, Spin } from 'antd'
import { useAppStore } from './store/app-store'
import { useSettingsStore } from './store/settings-store'
import { useConfigListStore } from './store/config-list-store'
import { useRuleStore } from './store/rule-store'
import ModernLayout from './components/Layout/ModernLayout'
const ModernConfigPanel = React.lazy(() => import('./components/Config/ModernConfigPanel'))
const AutomationPanel = React.lazy(() => import('./components/Automation/AutomationPanel'))
const StatisticsPanel = React.lazy(() => import('./components/Statistics/StatisticsPanel'))
const SettingsPanel = React.lazy(() => import('./components/Settings/SettingsPanel'))
const ProjectManagement = React.lazy(() => import('./components/Projects/ProjectManagement'))
const ManagedModePanel = React.lazy(() => import('./components/ManagedMode/ManagedModePanel'))
const MCPManagementPanel = React.lazy(() => import('./components/MCP/MCPManagementPanel'))
const AgentsManagementPanel = React.lazy(() => import('./components/AgentsManagement/AgentsManagementPanel'))
const SkillsManagementPanel = React.lazy(() => import('./components/SkillsManagement/SkillsManagementPanel'))
const EnvironmentCheckPanel = React.lazy(() => import('./components/EnvironmentCheck/EnvironmentCheckPanel'))
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
    notifications,
    initialize,
    removeNotification
  } = useAppStore()

  const { initialize: initializeSettings } = useSettingsStore()
  const { refreshConfigs } = useConfigListStore()
  const { refreshRules, loadExecutionLogs, loadStats } = useRuleStore()

  // 权限警告状态
  const [privilegeWarningVisible, setPrivilegeWarningVisible] = useState(false)
  const [privilegeWarning, _setPrivilegeWarning] = useState<any>(null)
  
  // 全局加载状态
  const [isAppLoading, setIsAppLoading] = useState(true)

  // 权限警告监听
  useEffect(() => {
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

      // 带超时的 Promise 包装
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(`${name} 初始化超时 (${timeoutMs}ms)`)), timeoutMs)
          )
        ])
      }

      // 安全执行初始化函数
      const safeInit = async (fn: () => Promise<void>, name: string): Promise<void> => {
        try {
          await withTimeout(fn(), 15000, name)
        } catch (error) {
          console.warn(`${name} 初始化失败:`, error)
          // 不抛出错误，允许其他初始化继续
        }
      }

      try {
        // 安全检查message API
        if (!message || typeof message.loading !== 'function') {
          console.error('Message API not available')
          setIsAppLoading(false)
          return
        }

        // 显示加载状态
        loadingMessage = message.loading('正在初始化应用...', 0)

        // 使用 Promise.allSettled 确保所有初始化都尝试执行
        await Promise.allSettled([
          safeInit(initialize, 'AppStore'),
          safeInit(initializeSettings, 'Settings'),
          safeInit(refreshConfigs, 'Configs'),
          safeInit(refreshRules, 'Rules'),
          safeInit(loadExecutionLogs, 'ExecutionLogs'),
          safeInit(loadStats, 'Stats')
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
      case 'mcp-management':
        return <MCPManagementPanel />
      case 'agents-management':
        return <AgentsManagementPanel />
      case 'skills-management':
        return <SkillsManagementPanel />
      case 'environment-check':
        return <EnvironmentCheckPanel />
      case 'managed-mode':
        return <ManagedModePanel />
      case 'settings':
        return <SettingsPanel />
      default:
        return <ModernConfigPanel />
    }
  }

  return (
    <ModernLayout>
      <Suspense
        fallback={(
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <Spin size="large" />
          </div>
        )}
      >
        {renderContent()}
      </Suspense>

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