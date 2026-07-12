/**
 * 现代化布局组件
 * 采用现代桌面应用设计模式，提供更好的用户体验
 *
 * 说明：自原生标题栏启用后，应用不再渲染自定义 header（避免与原生窗口控件重复）。
 * 原有的 header 工具栏（搜索、主题切换、刷新、通知、帮助等）被重新组织：
 *   - 搜索栏、刷新、通知、帮助/用户菜单 -> Content 顶部工具栏
 *   - 主题切换、侧边栏收起 -> 侧边栏 footer
 */

import React, { useState, useEffect } from 'react'
import { Layout, Button, Space, Badge, Tooltip, Dropdown, Avatar, Typography } from 'antd'
import {
  BellOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  GithubOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  FileTextOutlined,
  RobotOutlined,
  BarChartOutlined,
  ReloadOutlined,
  ProjectOutlined,
  CloudDownloadOutlined,
  ApiOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  RobotOutlined as AgentOutlined,
  AppstoreOutlined as SkillsOutlined,
  CodeOutlined,
  DownOutlined,
  UpOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../store/app-store'
import { useTheme } from '../../hooks/useTheme'
import { useNotificationSettings } from '../../store/settings-store'
import { useConfigListWithNotification } from '../../hooks/useConfigListWithNotification'
import { initializeManagedModeLogListener } from '../../store/managed-mode-log-store'
import { versionService } from '../../services/version-service'
import { useTranslation } from '../../locales/useTranslation'
import { useMessage } from '../../hooks/useMessage'
import UpdateModal from '../Common/UpdateModal'
import type { VersionInfo } from '../../services/version-service'
import ccbLogo from '../../assets/icons/ccb_64.png'
import './ModernLayout.css'

const { Sider, Content } = Layout
const { Text } = Typography

/**
 * 现代化布局组件属性
 */
interface ModernLayoutProps {
  children: React.ReactNode
}

/**
 * 现代化布局组件
 */
const ModernLayout: React.FC<ModernLayoutProps> = ({ children }) => {
  const { t } = useTranslation()
  const { currentTheme } = useTheme()
  const message = useMessage()
  const {
    version,
    notifications,
    sidebarCollapsed,
    expandedMenuGroups,
    activeMainTab,
    toggleSidebar,
    toggleMenuGroup,
    setActiveMainTab,
    addNotification,
    refreshAll
  } = useAppStore(
    // v1.4.0 性能：selector 只订阅用到的字段（store 默认 shallow 比较），避免 store 其他字段
    // （platform/theme/language 等）变化触发本组件不必要的重渲染
    (s) => ({
      version: s.version,
      notifications: s.notifications,
      sidebarCollapsed: s.sidebarCollapsed,
      expandedMenuGroups: s.expandedMenuGroups,
      activeMainTab: s.activeMainTab,
      toggleSidebar: s.toggleSidebar,
      toggleMenuGroup: s.toggleMenuGroup,
      setActiveMainTab: s.setActiveMainTab,
      addNotification: s.addNotification,
      refreshAll: s.refreshAll,
    })
  )

  const notificationSettings = useNotificationSettings()
  // 使用默认值防止设置未加载时出现错误
  const { startupCheckUpdate = true, silentUpdateCheck = true } = notificationSettings || {}

  const [searchValue, setSearchValue] = useState('')
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  // v1.4.0：托管模式状态（用于侧边栏导航项状态标签高亮）
  const [managedModeActive, setManagedModeActive] = useState(false)

  // 查询托管模式状态（activeMainTab 变化时刷新，确保在托管面板启用后返回其他页能看到状态标签）
  useEffect(() => {
    const checkManagedMode = async () => {
      try {
        const result = await window.electronAPI.managedMode?.isEnabled()
        if (result?.success) {
          setManagedModeActive(result.enabled)
        }
      } catch {
        // ignore — 托管模式 API 可能在初始化前不可用
      }
    }
    void checkManagedMode()
  }, [activeMainTab])
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    versionInfo: VersionInfo
  } | null>(null)

  // 使用带通知功能的配置列表store
  useConfigListWithNotification()
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // 初始化版本号
  useEffect(() => {
    versionService.setCurrentVersion(version)
  }, [version])

  // 初始化托管模式日志监听器（应用启动时立即初始化，在后台持续收集日志）
  useEffect(() => {
    const cleanup = initializeManagedModeLogListener()

    return () => {
      cleanup()
    }
  }, [])

  // 应用启动时自动检查更新
  useEffect(() => {
    if (startupCheckUpdate) {
      const performUpdateCheck = async () => {
        try {
          setCheckingUpdate(true)
          const result = await versionService.checkForUpdates()

          if (result.hasUpdate && result.versionInfo) {
            if (!silentUpdateCheck) {
              addNotification({
                type: 'warning',
                title: t('layout.update.newVersionTitle'),
                message: t('layout.update.newVersionMessage', { version: result.latestVersion })
              })
            }
            setUpdateInfo({
              currentVersion: result.currentVersion,
              latestVersion: result.latestVersion,
              versionInfo: result.versionInfo
            })
            setUpdateModalVisible(true)
          } else {
            if (!silentUpdateCheck) {
              addNotification({
                type: 'success',
                title: t('layout.update.latestTitle'),
                message: t('layout.update.latestMessage')
              })
            }
          }
        } catch (error) {
          console.error('自动检查更新失败:', error)
          if (!silentUpdateCheck) {
            addNotification({
              type: 'error',
              title: t('layout.update.checkFailedTitle'),
              message: t('layout.update.checkFailedMessage')
            })
          }
        } finally {
          setCheckingUpdate(false)
        }
      }

      // 延迟执行，避免与应用初始化冲突
      const timer = setTimeout(performUpdateCheck, 3000)
      return () => clearTimeout(timer)
    }
  }, [startupCheckUpdate, silentUpdateCheck, addNotification])

  // v3：主题切换已迁移至 Settings → 高级 → 界面主题（useTheme hook）
  // 旧版 light/dark 切换已废弃，不再覆盖 data-theme 属性

  // 全局刷新
  const handleGlobalRefresh = async () => {
    try {
      await refreshAll()
      addNotification({
        type: 'success',
        title: t('layout.refresh.successTitle'),
        message: t('layout.refresh.successMessage')
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: t('layout.refresh.failedTitle'),
        message: error instanceof Error ? error.message : t('common.unknownError')
      })
    }
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true)
      message.loading({ content: t('layout.update.checking'), key: 'checkUpdate' })

      const result = await versionService.checkForUpdates()

      if (result.hasUpdate && result.versionInfo) {
        message.destroy('checkUpdate')
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          versionInfo: result.versionInfo
        })
        setUpdateModalVisible(true)
      } else {
        message.success({ content: t('layout.update.latestShort'), key: 'checkUpdate' })
      }
    } catch (error) {
      console.log('Error in handleCheckUpdate:', error);
      message.error({
        content: error instanceof Error ? error.message : t('layout.update.checkFailedShort'),
        key: 'checkUpdate'
      })
    } finally {
      setCheckingUpdate(false)
    }
  }

  // 监听原生菜单"帮助 → 检查更新"事件，复用渲染层检查流程
  useEffect(() => {
    window.electronAPI.menu.onCheckUpdate(() => {
      void handleCheckUpdate()
    })
  }, [])

  // 处理更新
  const handleUpdate = async (downloadUrl: string) => {
    try {
      await versionService.openDownloadPage(downloadUrl)
      setUpdateModalVisible(false)
      message.success(t('update.openDownloadSuccess'))
    } catch (error) {
      message.error(t('update.openDownloadFailed'))
    }
  }

  // 访问官网
  const handleVisitWebsite = async () => {
    try {
      await versionService.openDownloadPage()
      setUpdateModalVisible(false)
    } catch (error) {
      message.error(t('update.openWebsiteFailed'))
    }
  }

  // 帮助菜单
  const helpMenuItems = [
    {
      key: 'docs',
      icon: <QuestionCircleOutlined />,
      label: t('layout.help.docs'),
      onClick: async () => {
        try {
          await versionService.openDocsPage()
        } catch (error) {
          message.error(t('update.openDocsFailed'))
        }
      }
    },
    {
      key: 'homepage',
      icon: <ProjectOutlined />,
      label: t('layout.help.homepage'),
      onClick: async () => {
        try {
          await versionService.openDownloadPage()
        } catch (error) {
          message.error(t('update.openWebsiteFailed'))
        }
      }
    },
    {
      key: 'github',
      icon: <GithubOutlined />,
      label: t('layout.help.github'),
      onClick: async () => {
        try {
          await versionService.openGitHubPage()
        } catch (error) {
          message.error(t('update.openGitHubFailed'))
        }
      }
    },
    {
      type: 'divider' as const
    },
    {
      key: 'checkUpdate',
      icon: <CloudDownloadOutlined />,
      label: t('layout.help.checkUpdate'),
      onClick: handleCheckUpdate,
      disabled: checkingUpdate
    },
    {
      key: 'about',
      label: t('layout.help.versionLabel', { version }),
      disabled: true
    }
  ]

  // 用户菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: t('layout.user.profile')
    },
    {
      key: 'preferences',
      icon: <SettingOutlined />,
      label: t('layout.user.preferences')
    },
    {
      type: 'divider' as const
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('layout.user.logout'),
      danger: true
    }
  ]

  return (
    <Layout className="modern-layout">
      {/* 现代化侧边栏 */}
      <Sider
        className="modern-sidebar"
        width={currentTheme.cssVars['--sidebar-width']}
        collapsedWidth={56}
        collapsed={sidebarCollapsed}
        theme={currentTheme.mode === 'light' ? 'light' : 'dark'}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img className="logo-icon" src={ccbLogo} alt="CCB" />
            {!sidebarCollapsed && (
              <div className="logo-text">
                <Text className="logo-title">CCB</Text>
                <Text className="logo-subtitle">Claude Code Butler</Text>
              </div>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          <div className="sidebar-nav">
            <div className="nav-section">
              <div
                className={`nav-item ${activeMainTab === 'ai-tools' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('ai-tools')}
              >
                <div className="nav-icon">
                  <CodeOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.aiTools')}</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'configs' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('configs')}
              >
                <div className="nav-icon">
                  <FileTextOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.configs')}</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'automation' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('automation')}
              >
                <div className="nav-icon">
                  <RobotOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.automation')}</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'statistics' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('statistics')}
              >
                <div className="nav-icon">
                  <BarChartOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.statistics')}</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'projects' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('projects')}
              >
                <div className="nav-icon">
                  <ProjectOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.projects')}</span>}
              </div>
            </div>

            <div className="nav-section">
              <div
                className="nav-section-title"
                onClick={() => !sidebarCollapsed && toggleMenuGroup('advanced')}
                style={{ cursor: sidebarCollapsed ? 'default' : 'pointer' }}
              >
                {!sidebarCollapsed && (
                  <>
                    <span>{t('layout.nav.advanced')}</span>
                    {expandedMenuGroups.advanced ? <UpOutlined /> : <DownOutlined />}
                  </>
                )}
              </div>
              {/* 侧边栏收起时也显示高级功能菜单项 */}
              {(expandedMenuGroups.advanced || sidebarCollapsed) && (
                <>
                  <div
                    className={`nav-item ${activeMainTab === 'mcp-management' ? 'active' : ''}`}
                    onClick={() => setActiveMainTab('mcp-management')}
                  >
                    <div className="nav-icon">
                      <ToolOutlined />
                    </div>
                    {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.mcp')}</span>}
                  </div>
                  <div
                    className={`nav-item ${activeMainTab === 'agents-management' ? 'active' : ''}`}
                    onClick={() => setActiveMainTab('agents-management')}
                  >
                    <div className="nav-icon">
                      <AgentOutlined />
                    </div>
                    {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.agents')}</span>}
                  </div>
                  <div
                    className={`nav-item ${activeMainTab === 'skills-management' ? 'active' : ''}`}
                    onClick={() => setActiveMainTab('skills-management')}
                  >
                    <div className="nav-icon">
                      <SkillsOutlined />
                    </div>
                    {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.skills')}</span>}
                  </div>
                  <div
                    className={`nav-item ${activeMainTab === 'environment-check' ? 'active' : ''}`}
                    onClick={() => setActiveMainTab('environment-check')}
                  >
                    <div className="nav-icon">
                      <CheckCircleOutlined />
                    </div>
                    {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.environmentCheck')}</span>}
                  </div>
                  <div
                    className={`nav-item ${activeMainTab === 'managed-mode' ? 'active' : ''}`}
                    onClick={() => setActiveMainTab('managed-mode')}
                  >
                    <div className="nav-icon" style={{ position: 'relative' }}>
                      <ApiOutlined />
                      {managedModeActive && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--green)',
                            border: '1.5px solid var(--bg-sidebar)'
                          }}
                        />
                      )}
                    </div>
                    {!sidebarCollapsed && (
                      <span
                        className="nav-label"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {t('layout.nav.managedMode')}
                        {managedModeActive && (
                          <span
                            style={{
                              fontSize: 10,
                              lineHeight: '16px',
                              color: 'var(--green)',
                              fontWeight: 600,
                              padding: '0 4px',
                              background: 'var(--green-bg)',
                              borderRadius: 3
                            }}
                          >
                            ON
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="nav-section">
              <div className="nav-section-title">
                {!sidebarCollapsed && <span>{t('layout.nav.tools')}</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('settings')}
              >
                <div className="nav-icon">
                  <SettingOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.settings')}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* 侧边栏底部：收起按钮（主题切换已移至设置页） */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-actions">
            <Tooltip title={sidebarCollapsed ? t('layout.sidebar.expand') : t('layout.sidebar.collapse')}>
              <Button
                type="text"
                className="sidebar-footer-btn"
                icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={toggleSidebar}
              />
            </Tooltip>
          </div>
        </div>
      </Sider>

      <Layout className="modern-main">
        {/* Content 顶部工具栏（替代被移除的自定义 header） */}
        <div className="content-toolbar">
          <div className="toolbar-left">
            <div className="breadcrumb">
              <Text className="breadcrumb-item">
                {activeMainTab === 'configs' && t('layout.breadcrumb.configs')}
                {activeMainTab === 'automation' && t('layout.breadcrumb.automation')}
                {activeMainTab === 'statistics' && t('layout.breadcrumb.statistics')}
                {activeMainTab === 'projects' && t('layout.breadcrumb.projects')}
                {activeMainTab === 'mcp-management' && t('layout.breadcrumb.mcp')}
                {activeMainTab === 'agents-management' && t('layout.breadcrumb.agents')}
                {activeMainTab === 'skills-management' && t('layout.breadcrumb.skills')}
                {activeMainTab === 'environment-check' && t('layout.breadcrumb.environmentCheck')}
                {activeMainTab === 'managed-mode' && t('layout.breadcrumb.managedMode')}
                {activeMainTab === 'settings' && t('layout.breadcrumb.settings')}
              </Text>
              <Text className="breadcrumb-separator">/</Text>
              <Text className="breadcrumb-item active">
                {activeMainTab === 'configs' && t('layout.breadcrumb.configsSub')}
                {activeMainTab === 'automation' && t('layout.breadcrumb.automationSub')}
                {activeMainTab === 'statistics' && t('layout.breadcrumb.statisticsSub')}
                {activeMainTab === 'projects' && t('layout.breadcrumb.projectsSub')}
                {activeMainTab === 'mcp-management' && t('layout.breadcrumb.mcpSub')}
                {activeMainTab === 'agents-management' && t('layout.breadcrumb.agentsSub')}
                {activeMainTab === 'skills-management' && t('layout.breadcrumb.skillsSub')}
                {activeMainTab === 'environment-check' && t('layout.breadcrumb.environmentCheckSub')}
                {activeMainTab === 'managed-mode' && t('layout.breadcrumb.managedModeSub')}
                {activeMainTab === 'settings' && t('layout.breadcrumb.settingsSub')}
              </Text>
            </div>
          </div>

          <div className="toolbar-right">
            <Space size="small">
              {/* 搜索 */}
              <div className="toolbar-search">
                <SearchOutlined className="toolbar-search-icon" />
                <input
                  type="text"
                  placeholder={t('layout.search.placeholder')}
                  className="toolbar-search-input"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                />
              </div>

              {/* 全局刷新 */}
              <Tooltip title={t('layout.tooltip.refreshAll')}>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={handleGlobalRefresh}
                />
              </Tooltip>

              {/* 通知 */}
              <Tooltip title={t('layout.tooltip.notifications')}>
                <Badge count={notifications.length} size="small">
                  <Button type="text" icon={<BellOutlined />} />
                </Badge>
              </Tooltip>

              {/* 帮助菜单 */}
              <Dropdown
                menu={{ items: helpMenuItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Button type="text" icon={<QuestionCircleOutlined />} />
              </Dropdown>

              {/* 用户菜单 */}
              <Dropdown
                menu={{ items: userMenuItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Avatar size="small" icon={<UserOutlined />} />
              </Dropdown>
            </Space>
          </div>
        </div>

        {/* 主内容区域 */}
        <Content className="modern-content">
          <div className="content-wrapper">
            {children}
          </div>
        </Content>
      </Layout>

      {/* 更新提示Modal */}
      {updateInfo && (
        <UpdateModal
          visible={updateModalVisible}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          versionInfo={updateInfo.versionInfo}
          onClose={() => setUpdateModalVisible(false)}
          onUpdate={handleUpdate}
          onVisitWebsite={handleVisitWebsite}
        />
      )}
    </Layout>
  )
}

export default ModernLayout
