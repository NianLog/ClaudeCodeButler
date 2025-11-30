/**
 * MCP管理面板
 * @description 管理Claude Code的MCP服务器配置,支持全局和项目级服务器
 * 使用卡片式设计+JSON编辑器的简洁模式
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
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
import CodeEditor from '../Common/CodeEditor'
import type { MCPServerListItem } from '@shared/types/mcp'
import './MCPManagementPanel.css'

const { Title, Text } = Typography
const { Search } = Input
const { Option } = Select

/**
 * MCP管理面板组件
 */
const MCPManagementPanel: React.FC = () => {
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
    message.success('数据已刷新')
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
        message.error('请输入服务器ID')
        return
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(editingServerId)) {
        message.error('服务器ID只能包含字母、数字、下划线和连字符')
        return
      }

      // 解析JSON
      const newConfig = JSON.parse(editingJson)

      // 验证必填字段
      if (!newConfig.command || !newConfig.command.trim()) {
        message.error('命令字段不能为空')
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

      message.success(isAddMode ? '服务器添加成功' : '服务器更新成功')
      setIsEditModalVisible(false)
      setEditingServer(null)
      setEditingServerId('')
      setIsAddMode(false)
      await loadAllServers()
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('JSON格式错误,请检查')
      } else {
        message.error('保存失败: ' + (error as Error).message)
      }
    }
  }

  // 删除服务器
  const handleDeleteServer = async (server: MCPServerListItem) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除MCP服务器 "${server.id}" 吗?`,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteServer(server.id, server.scope)
          message.success(`服务器 "${server.id}" 已删除`)
        } catch (error) {
          message.error('删除失败: ' + (error as Error).message)
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
      message.success(`服务器已${server.config.disabled ? '启用' : '禁用'}`)
    } catch (error) {
      message.error('切换状态失败: ' + (error as Error).message)
    }
  }

  // 复制服务器
  const handleDuplicateServer = async (server: MCPServerListItem) => {
    const newServerId = `${server.id}-copy`
    try {
      await duplicateServer(server.id, server.scope, newServerId, server.scope)
      message.success(`服务器已复制为 "${newServerId}"`)
    } catch (error) {
      message.error('复制失败: ' + (error as Error).message)
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
        label: '编辑配置',
        onClick: () => handleEditServer(server)
      },
      {
        key: 'duplicate',
        icon: <CopyOutlined />,
        label: '复制服务器',
        onClick: () => handleDuplicateServer(server)
      },
      {
        type: 'divider' as const
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: isEnabled ? '删除服务器' : '删除服务器 (需先启用)',
        danger: true,
        disabled: !isEnabled,
        onClick: () => {
          if (!isEnabled) {
            message.warning('请先启用服务器后再进行删除操作')
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
                    全局
                  </Tag>
                ) : (
                  <Tag icon={<FolderOutlined />} color="purple">
                    项目: {server.scope.split(/[\\/\\]/).pop()}
                  </Tag>
                )}
                <Tag color={isEnabled ? 'success' : 'error'}>
                  {isEnabled ? '已启用' : '已禁用'}
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
              title={isEnabled ? '禁用' : '启用'}
            />
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditServer(server)}
              title="编辑"
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
            <Text type="secondary" style={{ fontSize: 12 }}>命令:</Text>
            <Text code style={{ fontSize: 12, marginLeft: 8 }}>
              {server.config.command}
              {server.config.args && server.config.args.length > 0 && ` ${server.config.args.join(' ')}`}
            </Text>
          </div>
          {server.config.env && Object.keys(server.config.env).length > 0 && (
            <div className="server-env">
              <Tag color="orange" size="small">
                {Object.keys(server.config.env).length} 个环境变量
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
          message="错误"
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
            MCP服务器管理
          </Title>
          <Text type="secondary">
            共 {servers.length} 个服务器
          </Text>
        </div>

        <div className="header-right">
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              loading={isLoading}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddServer}
            >
              添加服务器
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
            placeholder="选择范围"
          >
            <Option value="all">全部</Option>
            <Option value="global">
              <GlobalOutlined /> 全局
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
            placeholder="搜索服务器名称或命令"
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
            <Spin size="large" tip="加载中...">
              <div style={{ minHeight: 100 }} />
            </Spin>
          </div>
        ) : filteredServers.length === 0 ? (
          <Empty
            description={
              searchKeyword
                ? `未找到匹配 "${searchKeyword}" 的服务器`
                : '暂无MCP服务器配置'
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddServer}
            >
              添加第一个服务器
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
            {isAddMode ? '添加新服务器' : `编辑服务器: ${editingServerId}`}
            <Text type="secondary" style={{ fontSize: 12 }}>
              直接编辑JSON配置
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
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {isAddMode && (
          <>
            <Alert
              message="输入服务器信息"
              description="服务器ID是唯一标识符,只能包含字母、数字、下划线和连字符"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <Text strong>服务器ID</Text>
              <Input
                placeholder="例如: my-mcp-server"
                value={editingServerId}
                onChange={(e) => setEditingServerId(e.target.value)}
                autoFocus
              />
            </Space>
          </>
        )}

        <Alert
          message="JSON配置格式"
          description={
            <div>
              <p>配置对象应包含以下字段:</p>
              <ul style={{ marginTop: 8, fontSize: 12 }}>
                <li><code>command</code> (必填): 执行命令,如 "npx", "node", "python"</li>
                <li><code>args</code> (可选): 命令参数数组</li>
                <li><code>type</code> (可选): 传输类型,默认 "stdio"</li>
                <li><code>env</code> (可选): 环境变量对象</li>
                <li><code>disabled</code> (可选): 是否禁用</li>
                <li><code>timeout</code> (可选): 超时时间(ms)</li>
                <li><code>autoApprove</code> (可选): 自动批准工具列表</li>
                <li><code>fromGalleryId</code> (可选): Gallery ID</li>
              </ul>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

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
      </Modal>
    </div>
  )
}

export default MCPManagementPanel
