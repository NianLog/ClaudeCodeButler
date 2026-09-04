/**
 * 现代化配置面板组件
 * 采用卡片式布局和现代化交互设计
 */

import React, { useState, useEffect, Suspense } from 'react'
import {
  Button,
  Space,
  Input,
  Select,
  Tag,
  Dropdown,
  Empty,
  Spin,
  Typography,
  Modal,
  App,
  Alert
} from 'antd'
import type { MenuProps } from 'antd'
import {
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CloudDownloadOutlined,
  DownloadOutlined,
  UploadOutlined,
  EyeOutlined,
  StarOutlined,
  StarFilled,
  FileTextOutlined,
  ReloadOutlined,
  LockOutlined
} from '@ant-design/icons'
import { useConfigListStore } from '../../store/config-list-store'
import { useConfigEditorStore } from '../../store/config-editor-store'
import { ConfigFile } from '@shared/types'
import type { ToolDefinition } from '@shared/tool-registry'
import type { ConfigEditorDraft, ConfigSavePayload } from './ConfigEditor'
const ConfigEditor = React.lazy(() => import('./ConfigEditor'))
const ConfigImportModal = React.lazy(() => import('./ConfigImportModal'))
const ToolConfigSetPanel = React.lazy(() => import('./ToolConfigSetPanel'))
const CloudTemplateLibraryModal = React.lazy(() => import('./CloudTemplateLibraryModal'))
const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
import { useTranslation } from '../../locales/useTranslation'
import {
  type EditorLanguage,
  generateUniqueDuplicateName,
  resolveConfigEditorLanguage
} from '../../utils/config-editor-utils'
import './ModernConfigPanel.css'

const { Title, Text } = Typography
const { Search } = Input
const { Option } = Select

/**
 * 现代化配置面板组件
 */
const ModernConfigPanel: React.FC = () => {
  const { t, language } = useTranslation()
  // v1.4.0：使用 App context 的 message/modal 替代静态 message/Modal.confirm/info，消除 antd 静态函数警告
  const { message, modal } = App.useApp()

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
  // 注意：托管开关的开启/关闭已迁移至「托管模式面板」，配置页仅保留状态用于：
  // 1) 拦截系统 settings 配置编辑（见 handleEditConfig）
  // 2) 拦截配置切换/激活（见 handleConfigSave）
  const [managedModeEnabled, setManagedModeEnabled] = useState(false)
  // hasBackup 用于检查备份状态，当前仅设置但未读取（预留为后续功能）
  const [, setHasBackup] = useState(false)

  // 多工具配置管理：claude-code 走遗留工作区通道，其余 registry 工具走配置集通道
  const [manageToolId, setManageToolId] = useState('claude-code')
  const [configSetTools, setConfigSetTools] = useState<Array<{ toolId: string; label: string }>>([])
  // Claude 面板的云模板库入口（共享弹窗，按 toolId=claude-code 过滤）
  const [cloudTemplateOpen, setCloudTemplateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadConfigSetTools = async (): Promise<void> => {
      try {
        const response = await window.electronAPI.toolRegistry.getSnapshot()
        if (!response.success || !response.data || cancelled) return
        setConfigSetTools(
          response.data.tools
            .filter((tool: ToolDefinition) => tool.artifacts.some((artifact) => artifact.configSet))
            .map((tool: ToolDefinition) => ({
              toolId: tool.toolId,
              label: tool.displayName[language] || tool.toolId
            }))
        )
      } catch {
        // 快照加载失败时保留 claude-code 单工具视图，不阻塞配置页
      }
    }
    void loadConfigSetTools()
    return () => {
      cancelled = true
    }
  }, [language])

  const [editorVisible, setEditorVisible] = useState(false)
  const [importVisible, setImportVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState<ConfigFile | null>(null)
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [editorInitialDraft, setEditorInitialDraft] = useState<ConfigEditorDraft | null>(null)
  const [systemConfigConfirmVisible, setSystemConfigConfirmVisible] = useState(false)
  const [pendingSystemConfigAction, setPendingSystemConfigAction] = useState<{
    config: ConfigFile
    action: 'edit' | 'delete'
  } | null>(null)
  // 预览模态框状态
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [previewConfig, setPreviewConfig] = useState<ConfigFile | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewLanguage, setPreviewLanguage] = useState<EditorLanguage>('json')

  useEffect(() => {
    if (configs.length === 0 && !isLoading) {
      void refreshConfigs()
    }

    // 加载托管模式状态
    void loadManagedModeStatus()
  }, [configs.length, isLoading, refreshConfigs])

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
              content: t('configPanel.managedMode.backupWarning'),
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
   * 显示配置预览模态框
   */
  const showConfigPreviewModal = async (config: ConfigFile) => {
    setPreviewConfig(config)
    setPreviewModalVisible(true)
    setPreviewLanguage(resolveConfigEditorLanguage(config))

    try {
      // 使用正确的API加载配置内容
      const configData = await window.electronAPI.config.get(config.path)
      if (configData.success && Object.prototype.hasOwnProperty.call(configData, 'data')) {
        const content: unknown = (configData.data as { content?: unknown } | undefined)?.content ?? configData.data
        // 格式化JSON内容以便显示
        if (typeof content === 'object' && content !== null) {
          setPreviewContent(JSON.stringify(content, null, 2))
        } else if (typeof content === 'string') {
          setPreviewContent(content)
        } else {
          setPreviewContent(String(content ?? ''))
        }
      } else {
        setPreviewContent(t('configPanel.preview.loadFailed'))
      }
    } catch (error) {
      console.error('加载配置内容失败:', error)
      setPreviewContent(t('configPanel.preview.loadFailed'))
    }
  }

  /**
   * 关闭预览模态框
   */
  const closePreviewModal = () => {
    setPreviewModalVisible(false)
    setPreviewConfig(null)
    setPreviewContent('')
    setPreviewLanguage('json')
  }

  // 处理配置选择
  const handleConfigSelect = (config: ConfigFile) => {
    setSelectedConfig(config)
  }

  // 处理新建配置
  const handleCreateConfig = () => {
    setEditorMode('create')
    setEditingConfig(null)
    setEditorInitialDraft(null)
    setEditorVisible(true)
  }

  // 处理编辑配置
  const handleEditConfig = (config: ConfigFile) => {
    // 检查是否为系统settings配置文件以及托管模式是否启用
    const isSystemSettingsConfig = config.path.endsWith('settings.json') &&
      (config.path.includes('.claude') || config.path.includes('~/.claude'))

    if (isSystemSettingsConfig && managedModeEnabled) {
      // 如果是系统settings配置且托管模式已启用，显示提示信息
      modal.info({
        title: t('configPanel.locked.title'),
        icon: React.createElement(LockOutlined, { style: { color: 'var(--accent)' } }),
        width: 480,
        content: (
          <div style={{ padding: '16px 0' }}>
            <p>
              <strong>{t('configPanel.locked.fileLabel')}</strong>
              <Text code>{config.name}</Text>
            </p>
            <p>{t('configPanel.locked.description')}</p>
            <div style={{
              background: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: '6px',
              padding: '12px',
              marginTop: '12px'
            }}>
              <Text style={{ color: 'var(--green)', fontWeight: 500 }}>
                {t('configPanel.locked.hint')}
              </Text>
            </div>
          </div>
        ),
        okText: t('configPanel.locked.ok'),
        centered: true
      })
      return
    }

    if (config.isSystemConfig) {
      // 其他系统配置文件需要二次确认
      setPendingSystemConfigAction({ config, action: 'edit' })
      setSystemConfigConfirmVisible(true)
    } else {
      setEditorMode('edit')
      setEditorInitialDraft(null)
      setEditingConfig(config)
      setEditorVisible(true)
    }
  }

  // 处理复制配置
  const handleDuplicateConfig = async (config: ConfigFile) => {
    try {
      const configData = await window.electronAPI.config.get(config.path)
      if (!configData.success) {
        throw new Error(configData.error || t('configPanel.preview.loadFailed'))
      }

      const duplicatedName = generateUniqueDuplicateName(
        config.name,
        t('configPanel.duplicateSuffix'),
        configs.map((item) => item.name)
      )

      setEditorMode('duplicate')
      setEditingConfig(null)
      setEditorInitialDraft({
        name: duplicatedName,
        description: config.description || '',
        type: config.type || 'claude-code',
        isActive: false,
        content: configData.data?.content ?? configData.data,
        language: resolveConfigEditorLanguage(config)
      })
      setEditorVisible(true)
    } catch (error) {
      console.error('复制配置失败:', error)
      message.error(
        t('configEditor.save.failed', {
          error: error instanceof Error ? error.message : t('common.unknownError')
        })
      )
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
        setEditorMode('edit')
        setEditorInitialDraft(null)
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
  const handleConfigSave = async (configData: ConfigSavePayload) => {
    try {
      if (editorMode === 'edit' && editingConfig) {
        // 更新现有配置 - 直接保存纯内容和元数据
        await window.electronAPI.config.save(editingConfig.path, configData.content, configData.metadata)
      } else {
        // 创建新配置
        await createConfigWithData(configData)
      }
      setEditorVisible(false)
      setEditorMode('create')
      setEditingConfig(null)
      setEditorInitialDraft(null)
      await refreshConfigs()

      // 托管模式拦截：当用户开启了「创建后自动切换到此配置」(isActive=true) 且托管模式已开启时，
      // 仅保存配置但不允许自动切换/激活。配置页本身只负责保存，激活动作实际由 ConfigEditor 内部触发，
      // 这里给出明确的用户提示以覆盖托管模式下的切换限制（任务 4c/4d）。
      const isActiveRequested = Boolean(configData?.metadata?.isActive)
      if (isActiveRequested && managedModeEnabled) {
        if (editorMode === 'edit' && editingConfig) {
          // 编辑场景：托管开启时不允许通过保存切换激活（任务 4c）
          message.warning(t('configPanel.managedMode.switchBlockedEdit'))
        } else {
          // 新建场景：已保存但未自动切换（任务 4d）
          message.info(t('configPanel.managedMode.switchBlockedCreate'))
        }
      }
    } catch (error) {
      console.error('保存配置失败:', error)
    }
  }

  // 处理配置导入
  const handleConfigImport = async (configData: Partial<ConfigFile>) => {
    try {
      await importConfig({
        name: configData.name,
        description: configData.description,
        type: configData.type,
        isActive: configData.isActive,
        content: configData.content
      })
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
  const handleFilterChange = (key: keyof typeof filters, value: unknown) => {
    setFilters({ [key]: value } as Partial<typeof filters>)
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
    message.info(t('configPanel.filters.resetSuccess'))
  }

  // 获取配置类型中文标签
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'settings': t('configPanel.types.settings'),
      'settings-local': t('configPanel.types.settingsLocal'),
      'claude-json': t('configPanel.types.claudeJson'),
      'claude-md': t('configPanel.types.claudeMd'),
      'claude-code': t('configPanel.types.claudeCode'),
      'user-preferences': t('configPanel.types.userPreferences'),
      'mcp-config': t('configPanel.types.mcp'),
      'project-config': t('configPanel.types.project'),
      'custom': t('configPanel.types.custom'),
      'system': t('configPanel.types.system')
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
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // 格式化时间
  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return t('configPanel.time.today')
    if (days === 1) return t('configPanel.time.yesterday')
    if (days < 7) return t('configPanel.time.daysAgo', { days })
    if (days < 30) return t('configPanel.time.weeksAgo', { weeks: Math.floor(days / 7) })
    return date.toLocaleDateString()
  }

  // 配置操作菜单
  const getConfigMenuItems = (config: ConfigFile): MenuProps['items'] => {
    const isSystemSettingsConfig = config.path.endsWith('settings.json') &&
      (config.path.includes('.claude') || config.path.includes('~/.claude'))

    const menuItems: MenuProps['items'] = [
      {
        key: 'view',
        icon: <EyeOutlined />,
        label: t('configPanel.menu.view'),
        onClick: () => handlePreviewConfig(config)
      },
      {
        key: 'edit',
        icon: isSystemSettingsConfig && managedModeEnabled ? <LockOutlined /> : <EditOutlined />,
        label: isSystemSettingsConfig && managedModeEnabled ? t('configPanel.menu.locked') : t('configPanel.menu.edit'),
        onClick: () => handleEditConfig(config),
        disabled: isSystemSettingsConfig && managedModeEnabled
      },
      {
        key: 'duplicate',
        icon: <CopyOutlined />,
        label: t('configPanel.menu.duplicate'),
        onClick: () => handleDuplicateConfig(config)
      },
      {
        type: 'divider' as const
      },
      {
        key: 'export',
        icon: <DownloadOutlined />,
        label: t('configPanel.menu.export'),
        onClick: () => console.log('导出配置', config.id)
      }
    ]

    // 在托管模式下禁用收藏切换
    if (!managedModeEnabled) {
      menuItems.push({
        key: 'favorite',
        icon: config.isInUse ? <StarFilled /> : <StarOutlined />,
        label: config.isInUse ? t('configPanel.menu.unfavorite') : t('configPanel.menu.favorite'),
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
        label: t('configPanel.menu.delete'),
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
                      ? t('configPanel.locked.tooltipManaged')
                      : isSystemSettingsConfig
                      ? t('configPanel.locked.tooltipSystem')
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
                  <Tag color="red">{t('configPanel.tags.system')}</Tag>
                )}
                {config.isInUse && (
                  <Tag color="green">{t('configPanel.tags.inUse')}</Tag>
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

  /**
   * 工具选择下拉框：claude-code（遗留工作区配置）+ registry 声明 configSet 的工具
   */
  const renderToolSelector = () => (
    <Select
      value={manageToolId}
      style={{ width: 200 }}
      onChange={(value) => setManageToolId(value)}
    >
      <Option value="claude-code">Claude Code</Option>
      {configSetTools.map((tool) => (
        <Option key={tool.toolId} value={tool.toolId}>
          {tool.label}
        </Option>
      ))}
    </Select>
  )

  // 非 claude-code 工具：渲染 registry 配置集面板（遗留 store 的错误不影响通用视图）
  if (manageToolId !== 'claude-code') {
    const activeTool = configSetTools.find((tool) => tool.toolId === manageToolId)
    return (
      <div className="modern-config-panel">
        <div className="config-panel-toolbar">
          <div className="toolbar-left">{renderToolSelector()}</div>
        </div>
        {activeTool ? (
          <Suspense fallback={<Spin size="large" />}>
            <ToolConfigSetPanel toolId={activeTool.toolId} toolLabel={activeTool.label} />
          </Suspense>
        ) : (
          <div className="config-panel-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div>{t('configPanel.empty')}</div>
                  <Button
                    type="primary"
                    style={{ marginTop: 16 }}
                    onClick={() => setManageToolId('claude-code')}
                  >
                    Claude Code
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className="config-panel-error">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div>{error}</div>
              <Button type="primary" onClick={refreshConfigs} style={{ marginTop: 16 }}>
                {t('configPanel.actions.reload')}
              </Button>
            </div>
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
            {t('configPanel.title')}
          </Title>
          <Text type="secondary">
            {t('configPanel.subtitle', { count: configs.length })}
          </Text>
        </div>
        
        <div className="header-right">
          <Space wrap>
            {renderToolSelector()}
            <Button
              icon={<ReloadOutlined />}
              onClick={async () => {
                await refreshConfigs()
                message.success(t('configPanel.refreshSuccess'))
              }}
            >
              {t('common.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateConfig}
            >
              {t('configPanel.actions.create')}
            </Button>
            <Button
              icon={<UploadOutlined />}
              onClick={handleImportConfig}
            >
              {t('configPanel.actions.import')}
            </Button>
            <Button
              icon={<CloudDownloadOutlined />}
              onClick={() => setCloudTemplateOpen(true)}
            >
              {t('configPanel.actions.cloud')}
            </Button>
          </Space>
        </div>
      </div>


      {/* 搜索和筛选栏 */}
      <div className="config-panel-toolbar">
        <div className="toolbar-left">
          <Search
            placeholder={t('configPanel.search.placeholder')}
            allowClear
            value={filters.search}
            style={{ flex: '0 1 300px', minWidth: 180 }}
            onSearch={handleSearch}
            onChange={(e) => handleSearch(e.target.value)}
          />

          <Select
            placeholder={t('configPanel.filters.typePlaceholder')}
            allowClear
            value={filters.type}
            style={{ flex: '0 1 150px', minWidth: 120 }}
            onChange={(value) => handleFilterChange('type', value)}
          >
            <Option value="__system__">{t('configPanel.types.system')}</Option>
            <Option value="__in_use__">{t('configPanel.tags.inUse')}</Option>
            <Option value="settings">{t('configPanel.types.settings')}</Option>
            <Option value="settings-local">{t('configPanel.types.settingsLocal')}</Option>
            <Option value="claude-json">{t('configPanel.types.claudeJson')}</Option>
            <Option value="claude-md">{t('configPanel.types.claudeMd')}</Option>
            <Option value="claude-code">{t('configPanel.types.claudeCode')}</Option>
            <Option value="user-preferences">{t('configPanel.types.userPreferences')}</Option>
            <Option value="mcp-config">{t('configPanel.types.mcp')}</Option>
            <Option value="project-config">{t('configPanel.types.project')}</Option>
            <Option value="custom">{t('configPanel.types.custom')}</Option>
          </Select>

          <Select
            placeholder={t('configPanel.filters.sortPlaceholder')}
            value={filters.sort}
            style={{ flex: '0 1 120px', minWidth: 110 }}
            onChange={handleSortChange}
          >
            <Option value="name">{t('configPanel.sort.name')}</Option>
            <Option value="lastModified">{t('configPanel.sort.lastModified')}</Option>
            <Option value="size">{t('configPanel.sort.size')}</Option>
            <Option value="type">{t('configPanel.sort.type')}</Option>
          </Select>

          {(filters.search || filters.type) && (
            <Button size="small" onClick={handleResetFilters}>
              {t('configPanel.filters.reset')}
            </Button>
          )}
        </div>
      </div>

      {/* 配置列表 */}
      <div className="config-panel-content">
        {isLoading ? (
          <div className="config-panel-loading">
            <Spin size="large" />
            <Text type="secondary" style={{ marginTop: 16 }}>
              {t('configPanel.loading')}
            </Text>
          </div>
        ) : filteredConfigsList.length === 0 ? (
          <div className="config-panel-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div>{t('configPanel.empty')}</div>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateConfig} style={{ marginTop: 16 }}>
                    {t('configPanel.actions.createFirst')}
                  </Button>
                </div>
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
      {editorVisible && (
        <Suspense fallback={<Spin size="large" />}>
          <ConfigEditor
            visible={editorVisible}
            mode={editorMode}
            config={editingConfig}
            initialDraft={editorInitialDraft}
            onClose={async () => {
              setEditorVisible(false)
              setEditorMode('create')
              setEditingConfig(null)
              setEditorInitialDraft(null)
              // 关闭编辑器时刷新配置列表
              await refreshConfigs()
            }}
            onSave={handleConfigSave}
          />
        </Suspense>
      )}

      {/* 配置导入模态框 */}
      {importVisible && (
        <Suspense fallback={<Spin size="large" />}>
          <ConfigImportModal
            visible={importVisible}
            onClose={() => setImportVisible(false)}
            onImport={handleConfigImport}
          />
        </Suspense>
      )}

      {/* 系统配置操作确认模态框 */}
      <Modal
        title={t('configPanel.systemConfirm.title')}
        open={systemConfigConfirmVisible}
        onOk={handleSystemConfigConfirm}
        onCancel={handleSystemConfigCancel}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '16px 0' }}>
          <p>
            <strong>{t('configPanel.systemConfirm.warningLabel')}</strong>{t('configPanel.systemConfirm.warningText')}
            <code style={{ margin: '0 4px', padding: '2px 6px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
              {pendingSystemConfigAction?.config.name}
            </code>
          </p>
          <p>{t('configPanel.systemConfirm.risk')}</p>
          <p>{t('configPanel.systemConfirm.confirm')}</p>
        </div>
      </Modal>

      {/* 配置预览模态框 */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>{t('configPanel.preview.title', { name: previewConfig?.name || '' })}</span>
            {previewConfig?.isSystemConfig && (
              <Tag color="red">{t('configPanel.tags.system')}</Tag>
            )}
          </Space>
        }
        open={previewModalVisible}
        onCancel={closePreviewModal}
        footer={[
          <Button key="close" onClick={closePreviewModal}>
            {t('common.close')}
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
          message={t('configPanel.preview.alertTitle')}
          description={t('configPanel.preview.alertDesc')}
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
          <Suspense fallback={<Spin size="large" />}>
            <CodeEditor
              value={previewContent}
              language={previewLanguage}
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
          </Suspense>
        </div>
      </Modal>

      {/* 云模板库（共享弹窗：仅显示/导入 claude-code 的云模板） */}
      {cloudTemplateOpen && (
        <Suspense fallback={<Spin size="large" />}>
          <CloudTemplateLibraryModal
            open={cloudTemplateOpen}
            toolId="claude-code"
            toolLabel="Claude Code"
            onClose={() => setCloudTemplateOpen(false)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default ModernConfigPanel
