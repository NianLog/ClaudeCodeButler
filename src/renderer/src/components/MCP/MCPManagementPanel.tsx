/**
 * MCP管理面板
 * @description 管理Claude Code的MCP服务器配置,支持全局和项目级服务器
 * 使用卡片式设计+JSON编辑器的简洁模式
 */

import React, { useEffect, useState, Suspense } from 'react'
import {
  Button,
  Empty,
  Spin,
  Alert,
  Space,
  Input,
  Select,
  Typography,
  message,
  Modal,
  Tag,
  Dropdown,
  Tooltip
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  GlobalOutlined,
  FolderOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MoreOutlined,
  ThunderboltOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useMCPManagementStore } from '../../store/mcp-management-store'
import { useTranslation } from '../../locales/useTranslation'
const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
import type { MCPServerListItem } from '@shared/types/mcp'
import './MCPManagementPanel.css'

const { Title, Text } = Typography
const { Search } = Input
const { Option } = Select

/**
 * MCP管理面板组件
 */
const MCPManagementPanel: React.FC = () => {
  const { t } = useTranslation()
  // Zustand状态 - 使用selector避免类型错误,确保所有数组类型都有类型检查
  const servers = useMCPManagementStore(state => Array.isArray(state.servers) ? state.servers : [])
  const projectPaths = useMCPManagementStore(state => Array.isArray(state.projectPaths) ? state.projectPaths : [])
  const selectedScope = useMCPManagementStore(state => state.selectedScope)
  const isLoading = useMCPManagementStore(state => state.isLoading)
  const error = useMCPManagementStore(state => state.error)
  const loadAllServers = useMCPManagementStore(state => state.loadAllServers)
  const loadProjectPaths = useMCPManagementStore(state => state.loadProjectPaths)
  const deleteServer = useMCPManagementStore(state => state.deleteServer)
  const toggleServer = useMCPManagementStore(state => state.toggleServer)
  const duplicateServer = useMCPManagementStore(state => state.duplicateServer)
  const setSelectedScope = useMCPManagementStore(state => state.setSelectedScope)
  const clearError = useMCPManagementStore(state => state.clearError)

  // 本地状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [editingServer, setEditingServer] = useState<MCPServerListItem | null>(null)
  const [editingServerId, setEditingServerId] = useState('')
  const [editingJson, setEditingJson] = useState('')
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [isAddMode, setIsAddMode] = useState(false)

  // 组件挂载时加载数据
  useEffect(() => {
    loadInitialData()
  }, [])

  // 加载初始数据
  const loadInitialData = async () => {
    await Promise.all([
      loadAllServers(),
      loadProjectPaths()
    ])
  }

  // 过滤服务器列表
  const filteredServers = servers.filter(server => {
    const matchesScope = selectedScope === 'all' ||
                         (selectedScope === 'global' && server.isGlobal) ||
                         (selectedScope !== 'all' && selectedScope !== 'global' && server.scope === selectedScope)

    const matchesKeyword = !searchKeyword ||
                           server.id.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                           server.config.command.toLowerCase().includes(searchKeyword.toLowerCase())

    return matchesScope && matchesKeyword
  })

  // 刷新数据
  const handleRefresh = async () => {
    await loadInitialData()
    message.success(t('mcp.messages.refreshed'))
  }

  // 打开编辑模态框
  const handleEditServer = (server: MCPServerListItem) => {
    setIsAddMode(false)
    setEditingServer(server)
    setEditingServerId(server.id)
    // 将服务器配置转换为JSON格式
    setEditingJson(JSON.stringify(server.config, null, 2))
    setIsEditModalVisible(true)
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    try {
      // 验证服务器ID
      if (isAddMode && !editingServerId.trim()) {
        message.error(t('mcp.validation.serverIdRequired'))
        return
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(editingServerId)) {
        message.error(t('mcp.validation.serverIdInvalid'))
        return
      }

      // 解析JSON
      const newConfig = JSON.parse(editingJson)

      // 验证必填字段
      if (!newConfig.command || !newConfig.command.trim()) {
        message.error(t('mcp.validation.commandRequired'))
        return
      }

      // 调用API更新服务器配置
      await window.electronAPI.mcp.addOrUpdateServer({
        id: editingServerId.trim(),
        command: newConfig.command,
        type: newConfig.type || 'stdio',
        argsText: newConfig.args ? newConfig.args.join('\n') : undefined,
        envText: newConfig.env ? JSON.stringify(newConfig.env, null, 2) : undefined,
        disabled: newConfig.disabled || false,
        timeout: newConfig.timeout,
        autoApproveText: newConfig.autoApprove ? newConfig.autoApprove.join(', ') : undefined,
        fromGalleryId: newConfig.fromGalleryId,
        targetScope: editingServer?.scope || (selectedScope === 'all' ? 'global' : selectedScope)
      })

      message.success(isAddMode ? t('mcp.messages.addSuccess') : t('mcp.messages.updateSuccess'))
      setIsEditModalVisible(false)
      setEditingServer(null)
      setEditingServerId('')
      setIsAddMode(false)
      await loadAllServers()
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error(t('mcp.errors.jsonInvalid'))
      } else {
        message.error(t('mcp.errors.saveFailed', { error: (error as Error).message }))
      }
    }
  }

  // 删除服务器
  const handleDeleteServer = async (server: MCPServerListItem) => {
    Modal.confirm({
      title: t('mcp.confirm.deleteTitle'),
      content: t('mcp.confirm.deleteContent', { id: server.id }),
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteServer(server.id, server.scope)
          message.success(t('mcp.messages.deleteSuccess', { id: server.id }))
        } catch (error) {
          message.error(t('mcp.errors.deleteFailed', { error: (error as Error).message }))
        }
      }
    })
  }

  // 切换服务器状态
  const handleToggleServer = async (server: MCPServerListItem) => {
    try {
      // toggleServer 会自动重新加载服务器列表
      await toggleServer(server.id, server.scope)
      // 根据当前状态显示切换后的状态
      message.success(server.config.disabled ? t('mcp.messages.enabled') : t('mcp.messages.disabled'))
    } catch (error) {
      message.error(t('mcp.errors.toggleFailed', { error: (error as Error).message }))
    }
  }

  // 复制服务器
  const handleDuplicateServer = async (server: MCPServerListItem) => {
    const newServerId = `${server.id}-copy`
    try {
      await duplicateServer(server.id, server.scope, newServerId, server.scope)
      message.success(t('mcp.messages.duplicateSuccess', { id: newServerId }))
    } catch (error) {
      message.error(t('mcp.errors.duplicateFailed', { error: (error as Error).message }))
    }
  }

  // 添加新服务器
  const handleAddServer = () => {
    setIsAddMode(true)
    setEditingServer(null)
    setEditingServerId('')
    setEditingJson(JSON.stringify({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-example'],
      env: {},
      disabled: false
    }, null, 2))
    setIsEditModalVisible(true)
  }

  // 获取传输类型图标
  const getTransportTypeIcon = (type?: string) => {
    switch (type) {
      case 'stdio':
        return <ThunderboltOutlined />
      case 'sse':
      case 'http':
        return <ApiOutlined />
      default:
        return <ThunderboltOutlined />
    }
  }

  // 渲染服务器列表项
  const renderServerItem = (server: MCPServerListItem) => {
    const isEnabled = !server.config.disabled

    const menuItems = [
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: t('mcp.menu.editConfig'),
        onClick: () => handleEditServer(server)
      },
      {
        key: 'duplicate',
        icon: <CopyOutlined />,
        label: t('mcp.menu.duplicateServer'),
        onClick: () => handleDuplicateServer(server)
      },
      {
        type: 'divider' as const
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: isEnabled ? t('mcp.menu.deleteServer') : t('mcp.menu.deleteServerDisabled'),
        danger: true,
        disabled: !isEnabled,
        onClick: () => {
          if (!isEnabled) {
            message.warning(t('mcp.messages.deleteDisabled'))
            return
          }
          handleDeleteServer(server)
        }
      }
    ]

    return (
      <div key={`${server.scope}-${server.id}`} className="mcp-server-item">
        <div className="server-item-header">
          <div className="server-item-title">
            <div className="server-icon">
              {getTransportTypeIcon(server.config.type)}
            </div>
            <div className="server-info">
              <Title level={5} className="server-name">
                {server.id}
              </Title>
              <Space size="small">
                {server.isGlobal ? (
                  <Tag icon={<GlobalOutlined />} color="blue">
                    {t('mcp.tags.global')}
                  </Tag>
                ) : (
                  <Tag icon={<FolderOutlined />} color="purple">
                    {t('mcp.tags.project', { name: server.scope.split(/[\/\\]/).pop() || '' })}
                  </Tag>
                )}
                <Tag color={isEnabled ? 'success' : 'error'}>
                  {isEnabled ? t('mcp.tags.enabled') : t('mcp.tags.disabled')}
                </Tag>
                <Tag color="default">
                  {server.config.type?.toUpperCase() || 'STDIO'}
                </Tag>
              </Space>
            </div>
          </div>
          <div className="server-item-actions">
            <Button
              type="text"
              size="small"
              icon={isEnabled ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              onClick={() => handleToggleServer(server)}
              title={isEnabled ? t('mcp.actions.disable') : t('mcp.actions.enable')}
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditServer(server)}
              title={t('mcp.actions.edit')}
            />
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
              placement="bottomRight"
            >
              <Button type="text" size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </div>
        </div>
        <div className="server-item-content">
          <div className="server-command">
            <Text type="secondary" style={{ fontSize: 12 }}>{t('mcp.labels.command')}</Text>
            <Text code style={{ fontSize: 12, marginLeft: 8 }}>
              {server.config.command}
              {server.config.args && server.config.args.length > 0 && ` ${server.config.args.join(' ')}`}
            </Text>
          </div>
          {server.config.env && Object.keys(server.config.env).length > 0 && (
            <div className="server-env">
              <Tag color="orange">
                {t('mcp.labels.envVars', { count: Object.keys(server.config.env).length })}
              </Tag>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mcp-management-panel">
      {/* 错误提示 */}
      {error && (
        <Alert
          message={t('common.error')}
          description={error}
          type="error"
          closable
          onClose={clearError}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 顶部工具栏 */}
      <div className="mcp-panel-header">
        <div className="header-left">
          <Title level={3} className="panel-title">
            {t('mcp.title')}
          </Title>
          <Text type="secondary">
            {t('mcp.subtitle.totalServers', { count: servers.length })}
          </Text>
        </div>

        <div className="header-right">
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={isLoading}
            >
              {t('mcp.actions.refresh')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddServer}
            >
              {t('mcp.actions.addServer')}
            </Button>
          </Space>
        </div>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="mcp-panel-toolbar">
        <Space size="middle">
          <Select
            value={selectedScope}
            onChange={setSelectedScope}
            style={{ width: 200 }}
            placeholder={t('mcp.filters.scopePlaceholder')}
          >
            <Option value="all">{t('mcp.filters.scopeAll')}</Option>
            <Option value="global">
              <GlobalOutlined /> {t('mcp.filters.scopeGlobal')}
            </Option>
            {projectPaths.map(path => {
              const folderName = path.split(/[\\/\\]/).pop() || path
              return (
                <Option key={path} value={path} title={path}>
                  <Tooltip title={path} placement="right">
                    <span>
                      <FolderOutlined /> {folderName}
                    </span>
                  </Tooltip>
                </Option>
              )
            })}
          </Select>

          <Search
            placeholder={t('mcp.search.placeholder')}
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onSearch={setSearchKeyword}
            style={{ width: 300 }}
            prefix={<SearchOutlined />}
          />
        </Space>
      </div>

      {/* 服务器列表 */}
      <div className="mcp-panel-content">
        {isLoading ? (
          <div className="mcp-panel-loading">
            <Spin size="large" tip={t('common.loading')}>
              <div style={{ minHeight: 100 }} />
            </Spin>
          </div>
        ) : filteredServers.length === 0 ? (
          <Empty
            description={
              searchKeyword
                ? t('mcp.empty.noResults', { keyword: searchKeyword })
                : t('mcp.empty.noServers')
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddServer}
            >
              {t('mcp.actions.addFirstServer')}
            </Button>
          </Empty>
        ) : (
          <div className="mcp-server-list">
            {filteredServers.map(renderServerItem)}
          </div>
        )}
      </div>

      {/* JSON编辑模态框 */}
      <Modal
        title={
          <Space>
            {isAddMode ? t('mcp.modal.addTitle') : t('mcp.modal.editTitle', { id: editingServerId })}
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('mcp.modal.subtitle')}
            </Text>
          </Space>
        }
        open={isEditModalVisible}
        onOk={handleSaveEdit}
        onCancel={() => {
          setIsEditModalVisible(false)
          setEditingServer(null)
          setEditingServerId('')
          setIsAddMode(false)
        }}
        width={800}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        {isAddMode && (
          <>
            <Alert
              message={t('mcp.alert.inputInfoTitle')}
              description={t('mcp.alert.inputInfoDesc')}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Text strong>{t('mcp.labels.serverId')}</Text>
              <Input
                placeholder={t('mcp.placeholders.serverId')}
                value={editingServerId}
                onChange={(e) => setEditingServerId(e.target.value)}
                autoFocus
              />
            </Space>
          </>
        )}

        <Alert
          message={t('mcp.alert.jsonTitle')}
          description={
            <div>
              <p>{t('mcp.alert.jsonDesc')}</p>
              <ul style={{ marginTop: 8, fontSize: 12 }}>
                <li><code>command</code> {t('mcp.jsonFields.required')}: {t('mcp.jsonFields.commandDesc')}</li>
                <li><code>args</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.argsDesc')}</li>
                <li><code>type</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.typeDesc')}</li>
                <li><code>env</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.envDesc')}</li>
                <li><code>disabled</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.disabledDesc')}</li>
                <li><code>timeout</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.timeoutDesc')}</li>
                <li><code>autoApprove</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.autoApproveDesc')}</li>
                <li><code>fromGalleryId</code> {t('mcp.jsonFields.optional')}: {t('mcp.jsonFields.fromGalleryIdDesc')}</li>
              </ul>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Suspense fallback={<Spin size="large" />}>
          <CodeEditor
            value={editingJson}
            onChange={setEditingJson}
            language="json"
            height="400px"
            options={{
              minimap: { enabled: false },
              lineNumbers: 'on',
              formatOnPaste: true,
              formatOnType: true,
              scrollBeyondLastLine: false
            }}
          />
        </Suspense>
      </Modal>
    </div>
  )
}

export default MCPManagementPanel
