/**
 * 现代化配置面板组件
 * 采用卡片式布局和现代化交互设计
 */

import React, { useState, useEffect } from 'react'
import {
  Button,
  Space,
  Input,
  Select,
  Tag,
  Tooltip,
  Dropdown,
  Empty,
  Spin,
  Typography,
  Divider,
  Modal,
  App,
  Card,
  Switch,
  Alert
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  DownloadOutlined,
  UploadOutlined,
  EyeOutlined,
  StarOutlined,
  StarFilled,
  FileTextOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  CloudOutlined,
  LockOutlined,
  UnlockOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { useConfigListStore } from '../../store/config-list-store'
import { useConfigEditorStore } from '../../store/config-editor-store'
import { ConfigFile } from '@shared/types'
import ConfigEditor from './ConfigEditor'
import ConfigImportModal from './ConfigImportModal'
import CodeEditor from '../Common/CodeEditor'
import './ModernConfigPanel.css'

const { Title, Text } = Typography
const { Search } = Input
const { Option } = Select

/**
 * 现代化配置面板组件
 */
const ModernConfigPanel: React.FC = () => {
  const { message } = App.useApp()

  const {
    configs,
    selectedConfig,
    isLoading,
    error,
    filters,
    setFilters,
    resetFilters,
    setSelectedConfig,
    refreshConfigs,
    deleteConfig,
    filteredConfigs
  } = useConfigListStore()

  const {
    // createConfig, // 暂时注释，等待实现
    createConfigWithData,
    importConfig
  } = useConfigEditorStore()

  // 托管模式相关状态
  const [managedModeEnabled, setManagedModeEnabled] = useState(false)
  const [managedModeLoading, setManagedModeLoading] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)

  const [editorVisible, setEditorVisible] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigFile | null>(null)
  const [systemConfigConfirmVisible, setSystemConfigConfirmVisible] = useState(false)
  const [pendingSystemConfigAction, setPendingSystemConfigAction] = useState<{
    config: ConfigFile
    action: 'edit' | 'delete'
  } | null>(null)
  // 预览模态框状态
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewConfig, setPreviewConfig] = useState<ConfigFile | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')

  useEffect(() => {
    refreshConfigs()
    // 加载托管模式状态
    loadManagedModeStatus()
  }, [refreshConfigs])

  // 单独处理托管模式警告消息，避免在渲染中直接调用
  useEffect(() => {
    const checkManagedModeWarning = async () => {
      try {
        // 检查是否存在系统设置备份
        const backupResult = await window.electronAPI.managedMode.checkBackup()
        if (backupResult.success && backupResult.hasBackup && !managedModeEnabled) {
          // 延迟显示警告，避免在渲染中直接调用
          setTimeout(() => {
            message.warning({
              content: '检测到系统设置备份文件，建议在启用托管模式前手动处理或重新启用托管模式以自动还原。',
              duration: 6, // 显示6秒
              key: 'managed-mode-backup-warning' // 使用key避免重复显示
            })
          }, 100)
        }
      } catch (error) {
        console.error('检查托管模式备份状态失败:', error)
      }
    }

    if (managedModeEnabled === false) {
      checkManagedModeWarning()
    }
  }, [managedModeEnabled])

  /**
   * 加载托管模式状态
   */
  const loadManagedModeStatus = async () => {
    try {
      // 检查托管模式是否启用
      const enabledResult = await window.electronAPI.managedMode.isEnabled()
      if (enabledResult.success) {
        setManagedModeEnabled(enabledResult.enabled)
      }

      // 检查是否存在系统设置备份
      const backupResult = await window.electronAPI.managedMode.checkBackup()
      if (backupResult.success) {
        setHasBackup(backupResult.hasBackup)
      }
    } catch (error) {
      console.error('加载托管模式状态失败:', error)
    }
  }

  /**
   * 启用托管模式
   */
  const handleEnableManagedMode = async () => {
    setManagedModeLoading(true)
    try {
      const result = await window.electronAPI.managedMode.enable()
      if (result.success) {
        setManagedModeEnabled(true)
        message.success(result.message || '托管模式已启用')
        await refreshConfigs()
      } else {
        message.error(result.error || '启用托管模式失败')
      }
    } catch (error: any) {
      message.error(`启用托管模式失败: ${error.message}`)
    } finally {
      setManagedModeLoading(false)
    }
  }

  /**
   * 禁用托管模式
   */
  const handleDisableManagedMode = async () => {
    setManagedModeLoading(true)
    try {
      const result = await window.electronAPI.managedMode.disable()
      if (result.success) {
        setManagedModeEnabled(false)
        message.success(result.message || '托管模式已禁用')
        await refreshConfigs()
      } else {
        message.error(result.error || '禁用托管模式失败')
      }
    } catch (error: any) {
      message.error(`禁用托管模式失败: ${error.message}`)
    } finally {
      setManagedModeLoading(false)
    }
  }

  /**
   * 处理托管模式开关切换
   */
  const handleManagedModeToggle = async (enabled: boolean) => {
    if (enabled) {
      // 启用前确认
      Modal.confirm({
        title: '启用托管模式',
        icon: <WarningOutlined />,
        content: (
          <div>
            <p>启用托管模式将会：</p>
            <ul>
              <li>备份当前系统 settings.json 配置文件</li>
              <li>启动本地代理服务（端口 8487）</li>
              <li>禁用配置列表中的切换激活功能</li>
              <li>不允许编辑 ~/.claude/settings.json 文件</li>
            </ul>
            <p>您确定要启用托管模式吗？</p>
          </div>
        ),
        okText: '确认启用',
        cancelText: '取消',
        onOk: handleEnableManagedMode
      })
    } else {
      // 禁用前确认
      Modal.confirm({
        title: '禁用托管模式',
        icon: <WarningOutlined />,
        content: (
          <div>
            <p>禁用托管模式将会：</p>
            <ul>
              <li>停止本地代理服务</li>
              <li>从备份中还原系统 settings.json 配置</li>
              <li>重新启用配置切换功能</li>
            </ul>
            <p>您确定要禁用托管模式吗？</p>
          </div>
        ),
        okText: '确认禁用',
        cancelText: '取消',
        onOk: handleDisableManagedMode
      })
    }
  }

  /**
   * 显示配置预览模态框
   */
  const showConfigPreviewModal = async (config: ConfigFile) => {
    setPreviewConfig(config)
    setPreviewModalVisible(true)

    try {
      // 使用正确的API加载配置内容
      const configData = await window.electronAPI.config.get(config.path)
      if (configData.success && configData.data) {
        const content = configData.data.content || configData.data
        // 格式化JSON内容以便显示
        if (typeof content === 'object') {
          setPreviewContent(JSON.stringify(content, null, 2))
        } else {
          setPreviewContent(content)
        }
      } else {
        setPreviewContent('// 无法加载配置内容')
      }
    } catch (error) {
      console.error('加载配置内容失败:', error)
      setPreviewContent('// 加载配置内容失败')
    }
  }

  /**
   * 关闭预览模态框
   */
  const closePreviewModal = () => {
    setPreviewModalVisible(false)
    setPreviewConfig(null)
    setPreviewContent('')
  }

  // 处理配置选择
  const handleConfigSelect = (config: ConfigFile) => {
    setSelectedConfig(config)
  }

  // 处理新建配置
  const handleCreateConfig = () => {
    setEditingConfig(null)
    setEditorVisible(true)
  }

  // 处理编辑配置
  const handleEditConfig = (config: ConfigFile) => {
    // 检查是否为系统settings配置文件以及托管模式是否启用
    const isSystemSettingsConfig = config.path.endsWith('settings.json') &&
      (config.path.includes('.claude') || config.path.includes('~/.claude'))

    if (isSystemSettingsConfig && managedModeEnabled) {
      // 如果是系统settings配置且托管模式已启用，显示提示信息
      Modal.info({
        title: '配置已锁定',
        icon: React.createElement(LockOutlined, { style: { color: '#1890ff' } }),
        width: 480,
        content: (
          <div style={{ padding: '16px 0' }}>
            <p>
              <strong>配置文件：</strong>
              <Text code>{config.name}</Text>
            </p>
            <p>当前已启用托管模式，系统settings配置文件已被托管服务管理。</p>
            <div style={{
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: '6px',
              padding: '12px',
              marginTop: '12px'
            }}>
              <Text style={{ color: '#52c41a', fontWeight: 500 }}>
                💡 如需修改settings配置，请前往「托管模式」页面的「配置」标签页进行设置。
              </Text>
            </div>
          </div>
        ),
        okText: '知道了',
        centered: true
      })
      return
    }

    if (config.isSystemConfig) {
      // 其他系统配置文件需要二次确认
      setPendingSystemConfigAction({ config, action: 'edit' })
      setSystemConfigConfirmVisible(true)
    } else {
      setEditingConfig(config)
      setEditorVisible(true)
    }
  }

  // 处理复制配置
  const handleDuplicateConfig = async (config: ConfigFile) => {
    try {
      const duplicatedConfig = {
        ...config,
        name: `${config.name} - 副本`,
        id: undefined, // 让系统生成新的ID
        path: undefined, // 让系统生成新的路径
        isSystemConfig: false, // 复制的配置不是系统配置
        isInUse: false
      }
      await createConfigWithData(duplicatedConfig)
      await refreshConfigs()
    } catch (error) {
      console.error('复制配置失败:', error)
    }
  }

  // 处理预览配置
  const handlePreviewConfig = (config: ConfigFile) => {
    // 对所有配置都显示预览模态框
    showConfigPreviewModal(config)
  }

  // 处理双击配置
  const handleConfigDoubleClick = (config: ConfigFile) => {
    handlePreviewConfig(config)
  }

  // 处理删除配置
  const handleDeleteConfig = async (config: ConfigFile) => {
    // 系统配置文件不允许删除
    if (config.isSystemConfig) {
      console.warn('系统配置文件不允许删除')
      return
    }

    try {
      await deleteConfig(config)
      await refreshConfigs()
    } catch (error) {
      console.error('删除配置失败:', error)
    }
  }

  // 确认系统配置操作
  const handleSystemConfigConfirm = () => {
    if (pendingSystemConfigAction) {
      if (pendingSystemConfigAction.action === 'edit') {
        setEditingConfig(pendingSystemConfigAction.config)
        setEditorVisible(true)
      }
      // 删除操作已经在菜单中被禁用，这里不需要处理
    }
    setSystemConfigConfirmVisible(false)
    setPendingSystemConfigAction(null)
  }

  // 取消系统配置操作
  const handleSystemConfigCancel = () => {
    setSystemConfigConfirmVisible(false)
    setPendingSystemConfigAction(null)
  }

  // 处理导入配置
  const handleImportConfig = () => {
    setImportVisible(true)
  }

  // 处理配置保存（统一架构）
  const handleConfigSave = async (configData: any) => {
    try {
      if (editingConfig) {
        // 更新现有配置 - 直接保存纯内容和元数据
        await window.electronAPI.config.save(editingConfig.path, configData.content, configData.metadata)
      } else {
        // 创建新配置
        await createConfigWithData(configData)
      }
      setEditorVisible(false)
      setEditingConfig(null)
      await refreshConfigs()
    } catch (error) {
      console.error('保存配置失败:', error)
    }
  }

  // 处理配置导入
  const handleConfigImport = async (configData: any) => {
    try {
      await importConfig(configData)
      setImportVisible(false)
      await refreshConfigs()
    } catch (error) {
      console.error('导入配置失败:', error)
    }
  }

  /**
   * 处理搜索输入变化
   */
  const handleSearch = (value: string) => {
    setFilters({ search: value })
  }

  /**
   * 处理筛选条件变化
   */
  const handleFilterChange = (key: keyof typeof filters, value: any) => {
    setFilters({ [key]: value })
  }

  /**
   * 处理排序方式变化
   */
  const handleSortChange = (value: 'name' | 'lastModified' | 'size' | 'type') => {
    setFilters({ sort: value })
  }

  /**
   * 重置所有筛选条件
   */
  const handleResetFilters = () => {
    resetFilters()
    message.info('已重置所有筛选条件')
  }

  // 获取配置类型中文标签
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'settings': '设置配置',
      'settings-local': '本地设置',
      'claude-json': 'Claude配置',
      'claude-md': '记忆配置',
      'claude-code': '代码配置',
      'user-preferences': '用户偏好',
      'mcp-config': 'MCP配置',
      'project-config': '项目配置',
      'custom': '自定义配置',
      'system': '系统配置'
    }
    return labels[type] || type
  }

  // 获取配置类型标签颜色
  const getTypeTagColor = (type: string) => {
    const colors: Record<string, string> = {
      'settings': 'blue',
      'settings-local': 'cyan',
      'claude-json': 'green',
      'claude-md': 'purple',
      'claude-code': 'orange',
      'user-preferences': 'magenta',
      'mcp-config': 'cyan',
      'project-config': 'blue',
      'custom': 'default',
      'system': 'red'
    }
    return colors[type] || 'default'
  }

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // 格式化时间
  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    return date.toLocaleDateString()
  }

  // 配置操作菜单
  const getConfigMenuItems = (config: ConfigFile) => {
    const isSystemSettingsConfig = config.path.endsWith('settings.json') &&
      (config.path.includes('.claude') || config.path.includes('~/.claude'))

    const menuItems = [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: '查看详情',
        onClick: () => handlePreviewConfig(config)
      },
      {
        key: 'edit',
        icon: isSystemSettingsConfig && managedModeEnabled ? <LockOutlined /> : <EditOutlined />,
        label: isSystemSettingsConfig && managedModeEnabled ? '已锁定' : '编辑配置',
        onClick: () => handleEditConfig(config),
        disabled: isSystemSettingsConfig && managedModeEnabled
      },
      {
        key: 'duplicate',
        icon: <CopyOutlined />,
        label: '复制配置',
        onClick: () => handleDuplicateConfig(config)
      },
      {
        type: 'divider' as const
      },
      {
        key: 'export',
        icon: <DownloadOutlined />,
        label: '导出配置',
        onClick: () => console.log('导出配置', config.id)
      }
    ]

    // 在托管模式下禁用收藏切换
    if (!managedModeEnabled) {
      menuItems.push({
        key: 'favorite',
        icon: config.isInUse ? <StarFilled /> : <StarOutlined />,
        label: config.isInUse ? '取消收藏' : '添加收藏',
        onClick: () => console.log('切换收藏', config.id)
      })
    }

    menuItems.push(
      {
        type: 'divider' as const
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除配置',
        danger: true,
        disabled: config.isSystemConfig, // 系统配置文件不允许删除
        onClick: () => handleDeleteConfig(config)
      }
    )

    return menuItems
  }

  // 渲染配置列表项
  const renderConfigListItem = (config: ConfigFile) => {
    // 检查是否为系统settings配置文件
    const isSystemSettingsConfig = config.path.endsWith('settings.json') &&
      (config.path.includes('.claude') || config.path.includes('~/.claude'))

    // 构建className
    const className = [
      'config-list-item',
      selectedConfig?.id === config.id ? 'selected' : '',
      config.isSystemConfig ? 'system-config-highlight' : '',
      config.isInUse && !config.isSystemConfig ? 'active-config-highlight' : ''
    ].filter(Boolean).join(' ')

    return (
      <Dropdown
        key={config.id}
        menu={{ items: getConfigMenuItems(config) }}
        trigger={['contextMenu']}
      >
        <div
          className={className}
          onClick={() => handleConfigSelect(config)}
          onDoubleClick={() => handleConfigDoubleClick(config)}
        >
          <div className="list-item-icon">
            <FileTextOutlined />
          </div>
          <div className="list-item-content">
            <div className="list-item-header">
              <Title level={5} className="list-item-name">
                {config.name}
              </Title>
              <div className="list-item-actions">
                <Button
                  type="text"
                  icon={isSystemSettingsConfig && managedModeEnabled ? <LockOutlined /> : <EditOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEditConfig(config)
                  }}
                  disabled={isSystemSettingsConfig && managedModeEnabled}
                  title={
                    isSystemSettingsConfig && managedModeEnabled
                      ? '托管模式下已锁定，请前往托管模式页面设置'
                      : isSystemSettingsConfig
                      ? '系统settings配置，启用托管模式后将被锁定'
                      : undefined
                  }
                />
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDuplicateConfig(config)
                  }}
                />
                <Dropdown
                  menu={{ items: getConfigMenuItems(config) }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
              </div>
            </div>
            <div className="list-item-meta">
              <Text type="secondary" className="list-item-path">
                {config.path}
              </Text>
              <div className="list-item-badges">
                <Tag color={getTypeTagColor(config.type)}>
                  {getTypeLabel(config.type)}
                </Tag>
                {config.isSystemConfig && (
                  <Tag color="red">系统配置</Tag>
                )}
                {config.isInUse && (
                  <Tag color="green">正在使用</Tag>
                )}
                <Text type="secondary">{formatTime(config.lastModified)}</Text>
                <Text type="secondary">{formatFileSize(config.size || 0)}</Text>
              </div>
            </div>
          </div>
        </div>
      </Dropdown>
    )
  }

  if (error) {
    return (
      <div className="config-panel-error">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={error}
          extra={
            <Button type="primary" onClick={refreshConfigs}>
              重新加载
            </Button>
          }
        />
      </div>
    )
  }

  const filteredConfigsList = filteredConfigs()

  return (
    <div className="modern-config-panel">
      {/* 头部工具栏 */}
      <div className="config-panel-header">
        <div className="header-left">
          <Title level={3} className="panel-title">
            配置管理
          </Title>
          <Text type="secondary">
            共 {configs.length} 个配置文件
          </Text>
        </div>
        
        <div className="header-right">
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={async () => {
                await refreshConfigs()
                message.success('配置列表已刷新')
              }}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateConfig}
            >
              新建配置
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={handleImportConfig}
            >
              导入
            </Button>
          </Space>
        </div>
      </div>


      {/* 搜索和筛选栏 */}
      <div className="config-panel-toolbar">
        <div className="toolbar-left">
          <Search
            placeholder="搜索配置名称或路径..."
            allowClear
            value={filters.search}
            style={{ width: 300 }}
            onSearch={handleSearch}
            onChange={(e) => handleSearch(e.target.value)}
          />

          <Select
            placeholder="筛选类型"
            allowClear
            value={filters.type}
            style={{ width: 150 }}
            onChange={(value) => handleFilterChange('type', value)}
          >
            <Option value="__system__">系统配置</Option>
            <Option value="__in_use__">正在使用</Option>
            <Option value="settings">设置配置</Option>
            <Option value="settings-local">本地设置</Option>
            <Option value="claude-json">Claude配置</Option>
            <Option value="claude-md">记忆配置</Option>
            <Option value="claude-code">代码配置</Option>
            <Option value="user-preferences">用户偏好</Option>
            <Option value="mcp-config">MCP配置</Option>
            <Option value="project-config">项目配置</Option>
            <Option value="custom">自定义配置</Option>
          </Select>

          <Select
            placeholder="排序方式"
            value={filters.sort}
            style={{ width: 120 }}
            onChange={handleSortChange}
          >
            <Option value="name">按名称</Option>
            <Option value="lastModified">按修改时间</Option>
            <Option value="size">按大小</Option>
            <Option value="type">按类型</Option>
          </Select>

          {(filters.search || filters.type) && (
            <Button size="small" onClick={handleResetFilters}>
              重置筛选
            </Button>
          )}
        </div>
      </div>

      {/* 配置列表 */}
      <div className="config-panel-content">
        {/* 托管模式启用卡片 */}
        <Card
          className="managed-mode-card"
          style={{
            background: managedModeEnabled ? '#f6ffed' : '#fafafa',
            border: managedModeEnabled ? '1px solid #b7eb8f' : '1px solid #f0f0f0'
          }}
        >
          <div className="managed-mode-card-content">
            <div className="managed-mode-card-left">
              <div className="managed-mode-card-header">
                <CloudOutlined
                  style={{
                    fontSize: 18,
                    color: managedModeEnabled ? '#52c41a' : '#1890ff',
                    marginRight: 8
                  }}
                />
                <div>
                  <Title level={5} style={{ margin: 0, fontSize: 14 }}>
                    托管模式配置
                  </Title>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {managedModeEnabled
                      ? '托管服务运行中，配置已托管'
                      : '启用托管服务和配置热切换'
                    }
                  </Text>
                </div>
              </div>
            </div>

            <div className="managed-mode-card-right">
              <Space size="small" align="center">
                {managedModeEnabled && (
                  <Tag color="success" size="small" style={{ fontSize: 11 }}>
                    代理服务运行中
                  </Tag>
                )}
                <Switch
                  size="small"
                  checked={managedModeEnabled}
                  onChange={handleManagedModeToggle}
                  loading={managedModeLoading}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                />
              </Space>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="config-panel-loading">
            <Spin size="large" />
            <Text type="secondary" style={{ marginTop: 16 }}>
              加载配置文件中...
            </Text>
          </div>
        ) : filteredConfigsList.length === 0 ? (
          <div className="config-panel-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有找到匹配的配置文件"
              extra={
                <Button type="primary" icon={<PlusOutlined />}>
                  创建第一个配置
                </Button>
              }
            />
          </div>
        ) : (
          <div className="config-list list-view">
            <div className="list-container">
              {filteredConfigsList.map(renderConfigListItem)}
            </div>
          </div>
        )}
      </div>

      {/* 配置编辑器模态框 */}
      <ConfigEditor
        visible={editorVisible}
        config={editingConfig}
        onClose={async () => {
          setEditorVisible(false)
          setEditingConfig(null)
          // 关闭编辑器时刷新配置列表
          await refreshConfigs()
        }}
        onSave={handleConfigSave}
      />

      {/* 配置导入模态框 */}
      <ConfigImportModal
        visible={importVisible}
        onClose={() => setImportVisible(false)}
        onImport={handleConfigImport}
      />

      {/* 系统配置操作确认模态框 */}
      <Modal
        title="系统配置文件操作确认"
        open={systemConfigConfirmVisible}
        onOk={handleSystemConfigConfirm}
        onCancel={handleSystemConfigCancel}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '16px 0' }}>
          <p>
            <strong>警告：</strong>您正在尝试编辑系统配置文件
            <code style={{ margin: '0 4px', padding: '2px 6px', background: '#f5f5f5', borderRadius: '4px' }}>
              {pendingSystemConfigAction?.config.name}
            </code>
          </p>
          <p>系统配置文件是应用的核心配置，错误的修改可能导致应用无法正常工作。</p>
          <p>请确认您了解此操作的风险，并确保您知道如何恢复配置。</p>
        </div>
      </Modal>

      {/* 配置预览模态框 */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>配置预览 - {previewConfig?.name}</span>
            {previewConfig?.isSystemConfig && (
              <Tag color="red">系统配置</Tag>
            )}
          </Space>
        }
        open={previewModalVisible}
        onCancel={closePreviewModal}
        footer={[
          <Button key="close" onClick={closePreviewModal}>
            关闭
          </Button>
        ]}
        width={900}
        centered
        styles={{
          body: {
            padding: '16px',
            height: '700px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }
        }}
      >
        <Alert
          message="配置预览"
          description="当前为只读预览模式。如需编辑此配置，请在配置列表中点击编辑按钮。"
          type="info"
          showIcon
          style={{ marginBottom: 16, flexShrink: 0 }}
        />

        <div style={{
          border: '1px solid #d9d9d9',
          borderRadius: '6px',
          flex: 1,
          height: '550px', // 明确设置固定高度
          overflow: 'hidden',
          position: 'relative'
        }}>
          <CodeEditor
            value={previewContent}
            language="json"
            height="100%"
            readOnly={true}
            options={{
              minimap: { enabled: false },
              readOnly: true,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fontSize: 14,
              lineHeight: 1.6
            }}
          />
        </div>
      </Modal>
    </div>
  )
}

export default ModernConfigPanel
