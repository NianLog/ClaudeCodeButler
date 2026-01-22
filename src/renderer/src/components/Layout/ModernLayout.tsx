/**
 * 现代化布局组件
 * 采用现代桌面应用设计模式，提供更好的用户体验
 */

import React, { useState, useEffect } from 'react'
import { Layout, Button, Space, Badge, Tooltip, Dropdown, Avatar, Typography, message } from 'antd'
import {
  BellOutlined,
  SettingOutlined,
  MinusOutlined,
  BorderOutlined,
  CloseOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  GithubOutlined,
  MoonOutlined,
  SunOutlined,
  SearchOutlined,
  UserOutlined,
  LogoutOutlined,
  FileTextOutlined,
  RobotOutlined,
  BarChartOutlined,
  FolderOutlined,
  ReloadOutlined,
  ProjectOutlined,
  CloudDownloadOutlined,
  ApiOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  RobotOutlined as AgentOutlined,
  AppstoreOutlined as SkillsOutlined,
  DownOutlined,
  UpOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../store/app-store'
import { useNotificationSettings } from '../../store/settings-store'
import { useConfigListWithNotification } from '../../hooks/useConfigListWithNotification'
import { initializeManagedModeLogListener } from '../../store/managed-mode-log-store'
import { versionService } from '../../services/version-service'
import { useTranslation } from '../../locales/useTranslation'
import UpdateModal from '../Common/UpdateModal'
import type { VersionInfo } from '../../services/version-service'
import './ModernLayout.css'

const { Header: AntHeader, Sider, Content } = Layout
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
  const {
    version,
    notifications,
    theme,
    sidebarCollapsed,
    expandedMenuGroups,
    activeMainTab,
    toggleSidebar,
    toggleMenuGroup,
    setActiveMainTab,
    setTheme,
    addNotification,
    refreshAll
  } = useAppStore()

  const notificationSettings = useNotificationSettings()
  // 使用默认值防止设置未加载时出现错误
  const { startupCheckUpdate = true, silentUpdateCheck = true } = notificationSettings || {}

  const [searchVisible, setSearchVisible] = useState(false)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
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
    console.log('[ModernLayout] 初始化托管模式日志监听器')
    const cleanup = initializeManagedModeLogListener()

    return () => {
      console.log('[ModernLayout] 清理托管模式日志监听器')
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

  // 窗口控制操作
  const handleMinimize = () => {
    window.electronAPI.window.minimize()
  }

  const handleMaximize = () => {
    window.electronAPI.window.maximize()
  }

  const handleClose = () => {
    window.electronAPI.window.close()
  }

  // 主题切换
  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

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
        width={280}
        collapsedWidth={64}
        collapsed={sidebarCollapsed}
        theme="dark"
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">⚡</div>
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
                    <div className="nav-icon">
                      <ApiOutlined />
                    </div>
                    {!sidebarCollapsed && <span className="nav-label">{t('layout.nav.managedMode')}</span>}
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

        <div className="sidebar-footer">
          <div className="sidebar-toggle" onClick={toggleSidebar}>
            {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </div>
      </Sider>

      <Layout className="modern-main">
        {/* 现代化头部 */}
        <AntHeader className="modern-header">
          <div className="header-left">
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

          <div className="header-center">
            {searchVisible && (
              <div className="search-container">
                <div className="search-input-wrapper">
                  <SearchOutlined className="search-icon" />
                  <input
                    type="text"
                    placeholder={t('layout.search.placeholder')}
                    className="search-input"
                    autoFocus
                  />
                </div>
                <Button
                  type="text"
                  size="small"
                  onClick={() => setSearchVisible(false)}
                >
                  ✕
                </Button>
              </div>
            )}
          </div>

          <div className="header-right">
            <Space size="small">
              {/* 全局刷新 */}
              <Tooltip title={t('layout.tooltip.refreshAll')}>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={handleGlobalRefresh}
                />
              </Tooltip>

              {/* 搜索按钮 */}
              <Tooltip title={t('common.search')}>
                <Button
                  type="text"
                  icon={<SearchOutlined />}
                  onClick={() => setSearchVisible(!searchVisible)}
                />
              </Tooltip>

              {/* 通知 */}
              <Tooltip title={t('layout.tooltip.notifications')}>
                <Badge count={notifications.length} size="small">
                  <Button type="text" icon={<BellOutlined />} />
                </Badge>
              </Tooltip>

              {/* 主题切换 */}
              <Tooltip title={theme === 'light' ? t('layout.tooltip.themeDark') : t('layout.tooltip.themeLight')}>
                <Button
                  type="text"
                  icon={theme === 'light' ? <MoonOutlined /> : <SunOutlined />}
                  onClick={handleThemeToggle}
                />
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

              {/* 窗口控制 */}
              <div className="window-controls">
                <Tooltip title={t('layout.window.minimize')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<MinusOutlined />}
                    onClick={handleMinimize}
                  />
                </Tooltip>
                <Tooltip title={t('layout.window.maximize')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<BorderOutlined />}
                    onClick={handleMaximize}
                  />
                </Tooltip>
                <Tooltip title={t('layout.window.close')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={handleClose}
                    danger
                  />
                </Tooltip>
              </div>
            </Space>
          </div>
        </AntHeader>

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
