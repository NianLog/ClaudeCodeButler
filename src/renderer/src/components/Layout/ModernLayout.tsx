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
  ToolOutlined
} from '@ant-design/icons'
import { useAppStore } from '../../store/app-store'
import { useBasicSettings } from '../../store/settings-store'
import { useConfigListWithNotification } from '../../hooks/useConfigListWithNotification'
import { initializeManagedModeLogListener } from '../../store/managed-mode-log-store'
import { versionService } from '../../services/version-service'
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
  const {
    version,
    notifications,
    theme,
    sidebarCollapsed,
    activeMainTab,
    toggleSidebar,
    setActiveMainTab,
    setTheme,
    addNotification,
    refreshAll
  } = useAppStore()

  const basicSettings = useBasicSettings()
  // 使用默认值防止设置未加载时出现错误
  const { startupCheckUpdate = true, silentUpdateCheck = true } = basicSettings || {}

  const [searchVisible, setSearchVisible] = useState(false)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    versionInfo: VersionInfo
  } | null>(null)

  // 使用带通知功能的配置列表store
  const configListStore = useConfigListWithNotification()
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
                title: '发现新版本',
                message: `新版本 ${result.latestVersion} 可用，点击查看详情`
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
                title: '已是最新版本',
                message: '当前版本已是最新版本'
              })
            }
          }
        } catch (error) {
          console.error('自动检查更新失败:', error)
          if (!silentUpdateCheck) {
            addNotification({
              type: 'error',
              title: '检查更新失败',
              message: '无法连接到更新服务器，请稍后重试'
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
        title: '刷新成功',
        message: '所有数据已更新'
      })
    } catch (error) {
      addNotification({
        type: 'error',
        title: '刷新失败',
        message: error instanceof Error ? error.message : '未知错误'
      })
    }
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true)
      message.loading({ content: '正在检查更新...', key: 'checkUpdate' })

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
        message.success({ content: '当前已是最新版本', key: 'checkUpdate' })
      }
    } catch (error) {
      console.log('Error in handleCheckUpdate:', error);
      message.error({
        content: error instanceof Error ? error.message : '检查更新失败',
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
      message.success('已在浏览器中打开下载页面')
    } catch (error) {
      message.error('打开下载页面失败')
    }
  }

  // 访问官网
  const handleVisitWebsite = async () => {
    try {
      await versionService.openDownloadPage()
      setUpdateModalVisible(false)
    } catch (error) {
      message.error('打开官网失败')
    }
  }

  // 帮助菜单
  const helpMenuItems = [
    {
      key: 'docs',
      icon: <QuestionCircleOutlined />,
      label: '使用文档',
      onClick: async () => {
        try {
          await versionService.openDocsPage()
        } catch (error) {
          message.error('打开文档失败')
        }
      }
    },
    {
      key: 'homepage',
      icon: <ProjectOutlined />,
      label: '访问官网',
      onClick: async () => {
        try {
          await versionService.openDownloadPage()
        } catch (error) {
          message.error('打开官网失败')
        }
      }
    },
    {
      key: 'github',
      icon: <GithubOutlined />,
      label: '作者 GitHub',
      onClick: async () => {
        try {
          await versionService.openGitHubPage()
        } catch (error) {
          message.error('打开 GitHub 失败')
        }
      }
    },
    {
      type: 'divider' as const
    },
    {
      key: 'checkUpdate',
      icon: <CloudDownloadOutlined />,
      label: '检查更新',
      onClick: handleCheckUpdate,
      disabled: checkingUpdate
    },
    {
      key: 'about',
      label: `版本 ${version}`,
      disabled: true
    }
  ]

  // 用户菜单
  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人设置'
    },
    {
      key: 'preferences',
      icon: <SettingOutlined />,
      label: '偏好设置'
    },
    {
      type: 'divider' as const
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
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
                {!sidebarCollapsed && <span className="nav-label">配置管理</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'automation' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('automation')}
              >
                <div className="nav-icon">
                  <RobotOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">自动化规则</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'statistics' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('statistics')}
              >
                <div className="nav-icon">
                  <BarChartOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">统计信息</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'projects' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('projects')}
              >
                <div className="nav-icon">
                  <ProjectOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">项目管理</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'managed-mode' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('managed-mode')}
              >
                <div className="nav-icon">
                  <ApiOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">托管模式</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'mcp-management' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('mcp-management')}
              >
                <div className="nav-icon">
                  <ToolOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">MCP管理</span>}
              </div>
            </div>

            <div className="nav-section">
              <div className="nav-section-title">
                {!sidebarCollapsed && <span>工具</span>}
              </div>
              <div
                className={`nav-item ${activeMainTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveMainTab('settings')}
              >
                <div className="nav-icon">
                  <SettingOutlined />
                </div>
                {!sidebarCollapsed && <span className="nav-label">设置</span>}
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
                {activeMainTab === 'configs' && '配置管理'}
                {activeMainTab === 'automation' && '自动化规则'}
                {activeMainTab === 'statistics' && '统计信息'}
                {activeMainTab === 'projects' && '项目管理'}
                {activeMainTab === 'managed-mode' && '托管模式'}
                {activeMainTab === 'mcp-management' && 'MCP管理'}
                {activeMainTab === 'settings' && '设置'}
              </Text>
              <Text className="breadcrumb-separator">/</Text>
              <Text className="breadcrumb-item active">
                {activeMainTab === 'configs' && '所有配置'}
                {activeMainTab === 'automation' && '规则列表'}
                {activeMainTab === 'statistics' && '数据概览'}
                {activeMainTab === 'projects' && 'Claude Code 项目'}
                {activeMainTab === 'managed-mode' && 'API服务管理'}
                {activeMainTab === 'mcp-management' && 'MCP服务器管理'}
                {activeMainTab === 'settings' && '应用设置'}
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
                    placeholder="搜索配置..."
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
              <Tooltip title="刷新所有数据">
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={handleGlobalRefresh}
                />
              </Tooltip>

              {/* 搜索按钮 */}
              <Tooltip title="搜索">
                <Button
                  type="text"
                  icon={<SearchOutlined />}
                  onClick={() => setSearchVisible(!searchVisible)}
                />
              </Tooltip>

              {/* 通知 */}
              <Tooltip title="通知">
                <Badge count={notifications.length} size="small">
                  <Button type="text" icon={<BellOutlined />} />
                </Badge>
              </Tooltip>

              {/* 主题切换 */}
              <Tooltip title={theme === 'light' ? '切换到暗色主题' : '切换到亮色主题'}>
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
                <Tooltip title="最小化">
                  <Button
                    type="text"
                    size="small"
                    icon={<MinusOutlined />}
                    onClick={handleMinimize}
                  />
                </Tooltip>
                <Tooltip title="最大化">
                  <Button
                    type="text"
                    size="small"
                    icon={<BorderOutlined />}
                    onClick={handleMaximize}
                  />
                </Tooltip>
                <Tooltip title="关闭">
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
