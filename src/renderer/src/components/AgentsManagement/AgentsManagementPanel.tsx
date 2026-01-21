/**
 * 子Agent管理面板组件
 *
 * 功能:
 * - 显示所有Agent文件列表
 * - 查看Agent详情（元数据和Markdown内容）
 * - 添加/编辑Agent
 * - 批量导入Agent文件
 * - 删除Agent
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Drawer,
  Modal,
  Form,
  Input,
  message,
  Upload,
  Row,
  Col,
  Statistic,
  Divider,
  Typography,
  Popconfirm,
  Tooltip,
  Descriptions,
  Tag
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  RobotOutlined,
  ToolOutlined,
  CodeOutlined,
  BgColorsOutlined,
  InboxOutlined
} from '@ant-design/icons'
import { useAgentsManagementStore } from '@/store/agents-management-store'
import { getUploadFilePath, readUploadFileText } from '@/utils/upload'
import MarkdownRenderer from '@/components/Common/MarkdownRenderer'
import type { AgentFile, AgentFormData } from '@shared/types/agents'
import './AgentsManagementPanel.css'

const { Title, Text } = Typography
const { TextArea } = Input

/**
 * 工具函数：将tools转换为数组格式
 * 支持字符串（逗号分隔）或数组输入
 */
const normalizeTools = (tools: string | string[] | undefined): string[] => {
  if (!tools) return []
  if (Array.isArray(tools)) return tools
  if (typeof tools === 'string') {
    // 分割逗号或空格，过滤空字符串
    return tools.split(/[,，\s]+/).filter(t => t.trim().length > 0)
  }
  return []
}


/**
 * Agent管理面板组件
 */
const AgentsManagementPanel: React.FC = () => {
  const messageApi = message
  const {
    agents,
    isLoading,
    selectedAgent,
    isDetailDrawerOpen,
    isFormModalOpen,
    isImportModalOpen,
    formMode,
    editingAgent,
    loadAgents,
    addAgent,
    updateAgent,
    deleteAgent,
    importAgent,
    importAgentContent,
    batchImportAgents,
    batchImportAgentsContent,
    openDetailDrawer,
    closeDetailDrawer,
    openAddModal,
    openEditModal,
    closeFormModal,
    openImportModal,
    closeImportModal
  } = useAgentsManagementStore()

  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<any[]>([])

  // 初始化加载
  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  // 监听editingAgent变化，更新表单值
  useEffect(() => {
    if (editingAgent && isFormModalOpen && formMode === 'edit') {
      // 提取Agent内容（移除YAML frontmatter）
      const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/
      const match = editingAgent.content.match(frontmatterRegex)
      const content = match ? match[1].trim() : editingAgent.content

      form.setFieldsValue({
        name: editingAgent.metadata.name,
        description: editingAgent.metadata.description,
        tools: Array.isArray(editingAgent.metadata.tools)
          ? editingAgent.metadata.tools.join(', ')
          : editingAgent.metadata.tools || '',
        model: editingAgent.metadata.model || '',
        color: editingAgent.metadata.color || '',
        content: content
      })
    }
  }, [editingAgent, isFormModalOpen, formMode, form])

  // 计算统计数据
  const totalAgents = agents.length
  const totalTools = agents.reduce(
    (sum: number, agent: AgentFile) => sum + normalizeTools(agent.metadata.tools).length,
    0
  )
  const modelTypes = new Set(
    agents.map((agent: AgentFile) => agent.metadata.model).filter(Boolean)
  ).size
  const customColors = agents.filter((agent: AgentFile) => agent.metadata.color).length

  // 处理添加Agent
  const handleAdd = async () => {
    try {
      const values = await form.validateFields()
      // 将tools字符串转换为数组
      const formData: AgentFormData = {
        ...values,
        tools: normalizeTools(values.tools)
      }
      await addAgent(formData)
      messageApi.success('Agent已添加')
      form.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return // 表单验证错误
      }
      messageApi.error('添加失败: ' + (error?.message || '未知错误'))
    }
  }

  // 处理编辑Agent
  const handleEdit = async () => {
    try {
      const values = await form.validateFields()
      if (editingAgent) {
        // 将tools字符串转换为数组
        const formData: AgentFormData = {
          ...values,
          tools: normalizeTools(values.tools)
        }
        await updateAgent(editingAgent.id, formData)
        messageApi.success('Agent已更新')
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error('更新失败: ' + (error?.message || '未知错误'))
    }
  }

  // 处理删除Agent
  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId)
      messageApi.success('Agent已删除')
    } catch (error: any) {
      messageApi.error('删除失败: ' + (error?.message || '未知错误'))
    }
  }

  // 处理单个文件导入
  const handleSingleImport = async (file: any) => {
    try {
      const filePath = getUploadFilePath(file)
      const result = filePath
        ? await importAgent(filePath, { overwrite: false })
        : await importAgentContent(await readUploadFileText(file), { overwrite: false })
      if (!result) {
        messageApi.error('导入失败: 未知错误')
        return
      }
      if (result.success) {
        messageApi.success(`Agent "${result.agentId}" 导入成功`)
      } else {
        messageApi.error(`导入失败: ${result.error || '未知错误'}`)
      }
    } catch (error: any) {
      messageApi.error('导入失败: ' + (error.message || '未知错误'))
    }
  }

  // 处理批量导入
  const handleBatchImport = async () => {
    if (fileList.length === 0) {
      messageApi.warning('请先选择要导入的文件')
      return
    }

    try {
      const filePaths = fileList
        .map(file => getUploadFilePath(file))
        .filter((path): path is string => Boolean(path))
      const contentFiles = await Promise.all(
        fileList
          .filter(file => !getUploadFilePath(file))
          .map(async file => ({
            name: file?.name || file?.originFileObj?.name,
            content: await readUploadFileText(file)
          }))
      )

      if (filePaths.length === 0 && contentFiles.length === 0) {
        messageApi.error('批量导入失败: 未获取到文件内容')
        return
      }

      const results = [] as Array<{
        success: boolean
        imported?: string[]
        errors?: Array<{ path: string; error: string }>
      }>

      if (filePaths.length > 0) {
        results.push(await batchImportAgents(filePaths, { overwrite: false }))
      }
      if (contentFiles.length > 0) {
        results.push(await batchImportAgentsContent(contentFiles, { overwrite: false }))
      }

      const merged = results.reduce<{
        success: boolean
        imported: string[]
        errors: Array<{ path: string; error: string }>
      }>(
        (acc, cur) => {
          acc.imported = acc.imported.concat(cur.imported || [])
          acc.errors = acc.errors.concat(cur.errors || [])
          acc.success = acc.success && cur.success
          return acc
        },
        { success: true, imported: [] as string[], errors: [] as Array<{ path: string; error: string }> }
      )

      const result = merged
      if (!result) {
        messageApi.error('批量导入失败: 未知错误')
        return
      }
      if (result.success) {
        messageApi.success(`成功导入 ${result.imported?.length || 0} 个Agent`)
        if (result.errors && result.errors.length > 0) {
          messageApi.warning(`${result.errors.length} 个文件导入失败`)
        }
        setFileList([])
        closeImportModal()
      } else {
        messageApi.error('批量导入失败')
      }
    } catch (error: any) {
      messageApi.error('批量导入失败: ' + (error.message || '未知错误'))
    }
  }

  // 表格列定义
  const columns = [
    {
      title: 'Agent名称',
      dataIndex: ['metadata', 'name'],
      key: 'name',
      render: (name: string, record: AgentFile) => (
        <Space>
          {record.metadata.color && (
            <div
              className="agent-color-badge"
              style={{ backgroundColor: record.metadata.color }}
              title="自定义颜色"
            />
          )}
          <div style={{ maxWidth: 200 }}>
            <Tooltip title={name}>
              <Text strong ellipsis style={{ display: 'block' }}>
                {name}
              </Text>
            </Tooltip>
            <Tooltip title={record.metadata.description}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', maxWidth: 180 }} ellipsis>
                {record.metadata.description}
              </Text>
            </Tooltip>
          </div>
        </Space>
      )
    },
    {
      title: '可用工具',
      dataIndex: ['metadata', 'tools'],
      key: 'tools',
      render: (tools: string | string[] | undefined) => {
        const toolsArray = normalizeTools(tools)
        return (
          <Space size="small" wrap style={{ maxWidth: 300 }}>
            {toolsArray.length > 0 ? (
              <Tooltip title={toolsArray.join(', ')}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 280 }}>
                  {toolsArray.slice(0, 3).map(tool => (
                    <Tag key={tool} color="blue" icon={<ToolOutlined />}>
                      {tool}
                    </Tag>
                  ))}
                  {toolsArray.length > 3 && (
                    <Tag>+{toolsArray.length - 3}</Tag>
                  )}
                </div>
              </Tooltip>
            ) : (
              <Text type="secondary">-</Text>
            )}
          </Space>
        )
      }
    },
    {
      title: '模型',
      dataIndex: ['metadata', 'model'],
      key: 'model',
      render: (model: string | undefined) => model ? (
        <Tag icon={<CodeOutlined />} color="purple">
          {model}
        </Tag>
      ) : (
        <Text type="secondary">-</Text>
      )
    },
    {
      title: '文件信息',
      key: 'fileInfo',
      render: (_: any, record: AgentFile) => (
        <Space direction="vertical" size="small">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.fileName}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {(record.fileSize / 1024).toFixed(2)} KB
          </Text>
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: AgentFile) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetailDrawer(record)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个Agent吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="agents-management-panel">
      {/* 标题栏 */}
      <div className="page-header">
        <Title level={3}>子Agent管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAgents} loading={isLoading}>
            刷新
          </Button>
          <Upload
            accept=".md"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              handleSingleImport(file)
              return false
            }}
          >
            <Button icon={<UploadOutlined />}>导入文件</Button>
          </Upload>
          <Button
            type="primary"
            icon={<InboxOutlined />}
            onClick={openImportModal}
          >
            批量导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            新建Agent
          </Button>
        </Space>
      </div>

      {/* 统计卡片行 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="总Agent数"
              value={totalAgents}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#7C3AED' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="工具总数"
              value={totalTools}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#52C41A' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="模型类型"
              value={modelTypes}
              prefix={<CodeOutlined />}
              valueStyle={{ color: '#1890FF' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="自定义颜色"
              value={customColors}
              prefix={<BgColorsOutlined />}
              valueStyle={{ color: '#FAAD14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Agent列表表格 */}
      <Card bordered={false} className="agent-list-card">
        <Table
          dataSource={agents}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个Agent`
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <RobotOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">暂无Agent</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    点击"新建Agent"或"批量导入"开始使用
                  </Text>
                </div>
              </div>
            )
          }}
        />
      </Card>

      {/* 详情Drawer */}
      <Drawer
        title={
          <Space>
            {selectedAgent?.metadata.color && (
              <div
                className="agent-color-badge-large"
                style={{ backgroundColor: selectedAgent.metadata.color }}
              />
            )}
            <Text strong>{selectedAgent?.metadata.name}</Text>
          </Space>
        }
        placement="right"
        width={720}
        open={isDetailDrawerOpen}
        onClose={closeDetailDrawer}
      >
        {selectedAgent && (
          <>
            <Divider orientation="left">元数据</Divider>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="名称">
                {selectedAgent.metadata.name}
              </Descriptions.Item>
              <Descriptions.Item label="模型">
                {selectedAgent.metadata.model || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {selectedAgent.metadata.description}
              </Descriptions.Item>
              <Descriptions.Item label="可用工具" span={2}>
                <Space size="small" wrap>
                  {(() => {
                    const toolsArray = normalizeTools(selectedAgent.metadata.tools)
                    return toolsArray.length > 0 ? (
                      toolsArray.map(tool => (
                        <Tag key={tool} color="blue" icon={<ToolOutlined />}>
                          {tool}
                        </Tag>
                      ))
                    ) : (
                      <Text type="secondary">无</Text>
                    )
                  })()}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="颜色" span={2}>
                {selectedAgent.metadata.color ? (
                  <Space>
                    <div
                      className="agent-color-badge-large"
                      style={{ backgroundColor: selectedAgent.metadata.color }}
                    />
                    <Text code>{selectedAgent.metadata.color}</Text>
                  </Space>
                ) : (
                  <Text type="secondary">-</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>
                {selectedAgent.fileName}
              </Descriptions.Item>
              <Descriptions.Item label="文件大小" span={1}>
                {(selectedAgent.fileSize / 1024).toFixed(2)} KB
              </Descriptions.Item>
              <Descriptions.Item label="修改时间" span={1}>
                {new Date(selectedAgent.updatedAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">Agent内容</Divider>
            <div className="agent-content-markdown">
              <MarkdownRenderer content={selectedAgent.content} />
            </div>
          </>
        )}
      </Drawer>

      {/* 添加/编辑Modal */}
      <Modal
        title={formMode === 'add' ? '新建Agent' : '编辑Agent'}
        open={isFormModalOpen}
        onOk={formMode === 'add' ? handleAdd : handleEdit}
        onCancel={closeFormModal}
        width={720}
        afterClose={() => form.resetFields()}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="Agent名称"
            rules={[{ required: true, message: '请输入Agent名称' }]}
          >
            <Input placeholder="例如: code-explorer" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <TextArea rows={2} placeholder="简要描述这个Agent的功能" />
          </Form.Item>

          <Form.Item
            name="tools"
            label="可用工具"
            tooltip="多个工具使用逗号或空格分隔，例如: web-search, file-read, database"
          >
            <Input
              placeholder="例如: web-search, file-read, database"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="model"
            label="使用的模型"
            tooltip="留空则使用默认模型"
          >
            <Input
              placeholder="例如: claude-sonnet-4-20250514 或留空"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="color"
            label="显示颜色"
            tooltip="使用十六进制颜色代码，例如: #7C3AED 或 DEFABC"
          >
            <Input
              placeholder="#7C3AED 或 DEFABC"
              maxLength={7}
              style={{ fontFamily: 'monospace', width: 200 }}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label="Agent内容"
            rules={[{ required: true, message: '请输入Agent内容' }]}
          >
            <TextArea
              rows={8}
              placeholder="输入Agent的系统消息或Prompt内容..."
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入Modal */}
      <Modal
        title="批量导入Agent"
        open={isImportModalOpen}
        onOk={handleBatchImport}
        onCancel={() => {
          setFileList([])
          closeImportModal()
        }}
        width={600}
      >
        <Upload.Dragger
          accept=".md"
          multiple
          fileList={fileList}
          onChange={({ fileList }) => setFileList(fileList)}
          beforeUpload={() => false}
          customRequest={() => {}}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽.md文件到此区域上传</p>
          <p className="ant-upload-hint">
            支持批量上传。每个文件必须包含有效的YAML元数据（name、description必填）。
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default AgentsManagementPanel
