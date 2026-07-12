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
import { useTranslation } from './locales/useTranslation'
import { scheduleStartupBatches, withTimeout } from './utils/startup-scheduler'
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
const AIToolManagementPanel = React.lazy(() => import('./components/AIToolManagement/AIToolManagementPanel'))
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
  const { t } = useTranslation()
  const {
    activeMainTab,
    notifications,
    initialize,
    removeNotification
  } = useAppStore(
    // v1.4.0 性能：selector 只订阅用到的字段（store 默认 shallow 比较），避免 store
    // 其他字段变化触发 App 顶层组件不必要的重渲染（连锁触发整棵树）
    (s) => ({
      activeMainTab: s.activeMainTab,
      notifications: s.notifications,
      initialize: s.initialize,
      removeNotification: s.removeNotification,
    })
  )

  // 单值 selector 订阅 action 函数（引用稳定），避免对应 store 数据变化触发 App 重渲染
  const initializeSettings = useSettingsStore((s) => s.initialize)
  const refreshConfigs = useConfigListStore((s) => s.refreshConfigs)
  const { refreshRules, loadExecutionLogs, loadStats } = useRuleStore((s) => ({
    refreshRules: s.refreshRules,
    loadExecutionLogs: s.loadExecutionLogs,
    loadStats: s.loadStats,
  }))

  // 权限警告状态
  const [privilegeWarningVisible, setPrivilegeWarningVisible] = useState(false)
  const [privilegeWarning] = useState<unknown>(null)
  
  // 全局加载状态
  const [isAppLoading, setIsAppLoading] = useState(true)

  // 权限警告监听
  useEffect(() => {
    // 托盘配置切换监听
    const handleTraySwitchConfig = () => {
      // 刷新配置列表以更新UI
      refreshConfigs()
    }

    // v1.4.0 修复：保存 unsubscribe，cleanup 时调用，避免托盘切换监听器在 refreshConfigs 变化时累积
    const unsubscribe = window.electronAPI.tray?.onSwitchConfig?.(handleTraySwitchConfig)

    // 监听权限警告事件
    // 移除安全警告监听

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [refreshConfigs])

  // 应用初始化
  useEffect(() => {
    let cancelled = false
    let cancelBackgroundTasks: (() => void) | undefined

    const initApp = async () => {
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
        // 首屏关键链路：仅保留应用基础信息和设置加载
        const criticalTasks = [
          safeInit(initialize, 'AppStore'),
          safeInit(initializeSettings, 'Settings')
        ]

        await Promise.allSettled(criticalTasks)

        if (cancelled) {
          return
        }

        setIsAppLoading(false)

        // 非关键数据在首屏完成后分批加载，降低 IPC 与磁盘 I/O 的启动竞争。
        const backgroundSchedule = scheduleStartupBatches([
          [
            () => safeInit(refreshConfigs, 'Configs'),
            () => safeInit(refreshRules, 'Rules')
          ],
          [
            () => safeInit(loadExecutionLogs, 'ExecutionLogs'),
            () => safeInit(loadStats, 'Stats')
          ]
        ])
        cancelBackgroundTasks = backgroundSchedule.cancel
      } catch (error) {
        if (cancelled) {
          return
        }

        setIsAppLoading(false)

        message?.error?.(t('app.init.startupFailed', {
          error: error instanceof Error ? error.message : String(error)
        }))

        console.error('Failed to initialize app:', error)
      }
    }

    void initApp()

    return () => {
      cancelled = true
      cancelBackgroundTasks?.()
    }
  }, [initialize, initializeSettings, loadExecutionLogs, loadStats, message, refreshConfigs, refreshRules, t])

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
      case 'ai-tools':
        return <AIToolManagementPanel />
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
      <LoadingScreen
        visible={isAppLoading}
        text={t('app.init.loading')}
      />

      {/* 权限警告模态框 */}
      <PrivilegeWarningModal
        visible={privilegeWarningVisible}
        warning={privilegeWarning as never}
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
