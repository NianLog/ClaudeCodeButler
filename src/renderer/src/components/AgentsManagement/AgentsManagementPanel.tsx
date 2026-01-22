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
import { useTranslation } from '@/locales/useTranslation'
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
  const { t } = useTranslation()
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
      messageApi.success(t('agents.message.added'))
      form.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return // 表单验证错误
      }
      messageApi.error(t('agents.message.addFailed', { error: error?.message || t('common.unknownError') }))
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
        messageApi.success(t('agents.message.updated'))
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error(t('agents.message.updateFailed', { error: error?.message || t('common.unknownError') }))
    }
  }

  // 处理删除Agent
  const handleDelete = async (agentId: string) => {
    try {
      await deleteAgent(agentId)
      messageApi.success(t('agents.message.deleted'))
    } catch (error: any) {
      messageApi.error(t('agents.message.deleteFailed', { error: error?.message || t('common.unknownError') }))
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
        messageApi.error(t('agents.message.importFailed', { error: t('common.unknownError') }))
        return
      }
      if (result.success) {
        messageApi.success(t('agents.message.importSuccess', { name: result.agentId ?? '' }))
      } else {
        messageApi.error(t('agents.message.importFailed', { error: result.error || t('common.unknownError') }))
      }
    } catch (error: any) {
      messageApi.error(t('agents.message.importFailed', { error: error.message || t('common.unknownError') }))
    }
  }

  // 处理批量导入
  const handleBatchImport = async () => {
    if (fileList.length === 0) {
      messageApi.warning(t('agents.message.batchImportSelect'))
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
        messageApi.error(t('agents.message.batchImportNoContent'))
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
        messageApi.error(t('agents.message.batchImportFailed', { error: t('common.unknownError') }))
        return
      }
      if (result.success) {
        messageApi.success(t('agents.message.batchImportSuccess', { count: result.imported?.length || 0 }))
        if (result.errors && result.errors.length > 0) {
          messageApi.warning(t('agents.message.batchImportFailedCount', { count: result.errors.length }))
        }
        setFileList([])
        closeImportModal()
      } else {
        messageApi.error(t('agents.message.batchImportFailed', { error: '' }))
      }
    } catch (error: any) {
      messageApi.error(t('agents.message.batchImportFailed', { error: error.message || t('common.unknownError') }))
    }
  }

  // 表格列定义
  const columns = [
    {
      title: t('agents.table.name'),
      dataIndex: ['metadata', 'name'],
      key: 'name',
      render: (name: string, record: AgentFile) => (
        <Space>
          {record.metadata.color && (
            <div
              className="agent-color-badge"
              style={{ backgroundColor: record.metadata.color }}
              title={t('agents.table.customColor')}
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
      title: t('agents.table.tools'),
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
      title: t('agents.table.model'),
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
      title: t('agents.table.fileInfo'),
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
      title: t('agents.table.actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: AgentFile) => (
        <Space size="small">
          <Tooltip title={t('agents.table.viewDetail')}>
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetailDrawer(record)}
            >
              {t('agents.table.view')}
            </Button>
          </Tooltip>
          <Tooltip title={t('agents.table.edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              {t('agents.table.edit')}
            </Button>
          </Tooltip>
          <Popconfirm
            title={t('agents.confirm.deleteTitle')}
            description={t('agents.confirm.deleteDescription')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('agents.table.delete')}
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
        <Title level={3}>{t('agents.title')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadAgents} loading={isLoading}>
            {t('common.refresh')}
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
            <Button icon={<UploadOutlined />}>{t('agents.importFile')}</Button>
          </Upload>
          <Button
            type="primary"
            icon={<InboxOutlined />}
            onClick={openImportModal}
          >
            {t('agents.batchImport')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            {t('agents.create')}
          </Button>
        </Space>
      </div>

      {/* 统计卡片行 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('agents.stats.totalAgents')}
              value={totalAgents}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#7C3AED' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('agents.stats.totalTools')}
              value={totalTools}
              prefix={<ToolOutlined />}
              valueStyle={{ color: '#52C41A' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('agents.stats.modelTypes')}
              value={modelTypes}
              prefix={<CodeOutlined />}
              valueStyle={{ color: '#1890FF' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('agents.stats.customColors')}
              value={customColors}
              prefix={<BgColorsOutlined />}
              valueStyle={{ color: '#FAAD14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Agent列表表格 */}
      <Card variant="borderless" className="agent-list-card">
        <Table
          dataSource={agents}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('agents.table.total', { total })
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <RobotOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">{t('agents.empty.title')}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('agents.empty.subtitle')}
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
            <Divider orientation="left">{t('agents.detail.metadata')}</Divider>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label={t('agents.detail.name')}>
                {selectedAgent.metadata.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.model')}>
                {selectedAgent.metadata.model || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.description')} span={2}>
                {selectedAgent.metadata.description}
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.tools')} span={2}>
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
                      <Text type="secondary">{t('common.none')}</Text>
                    )
                  })()}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.color')} span={2}>
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
              <Descriptions.Item label={t('agents.detail.fileName')} span={2}>
                {selectedAgent.fileName}
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.fileSize')} span={1}>
                {(selectedAgent.fileSize / 1024).toFixed(2)} KB
              </Descriptions.Item>
              <Descriptions.Item label={t('agents.detail.updatedAt')} span={1}>
                {new Date(selectedAgent.updatedAt).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">{t('agents.detail.content')}</Divider>
            <div className="agent-content-markdown">
              <MarkdownRenderer content={selectedAgent.content} />
            </div>
          </>
        )}
      </Drawer>

      {/* 添加/编辑Modal */}
      <Modal
        title={formMode === 'add' ? t('agents.form.createTitle') : t('agents.form.editTitle')}
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
            label={t('agents.form.name')}
            rules={[{ required: true, message: t('agents.form.nameRequired') }]}
          >
            <Input placeholder={t('agents.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('agents.form.description')}
            rules={[{ required: true, message: t('agents.form.descriptionRequired') }]}
          >
            <TextArea rows={2} placeholder={t('agents.form.descriptionPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="tools"
            label={t('agents.form.tools')}
            tooltip={t('agents.form.toolsTip')}
          >
            <Input
              placeholder={t('agents.form.toolsPlaceholder')}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="model"
            label={t('agents.form.model')}
            tooltip={t('agents.form.modelTip')}
          >
            <Input
              placeholder={t('agents.form.modelPlaceholder')}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="color"
            label={t('agents.form.color')}
            tooltip={t('agents.form.colorTip')}
          >
            <Input
              placeholder={t('agents.form.colorPlaceholder')}
              maxLength={7}
              style={{ fontFamily: 'monospace', width: 200 }}
            />
          </Form.Item>

          <Form.Item
            name="content"
            label={t('agents.form.content')}
            rules={[{ required: true, message: t('agents.form.contentRequired') }]}
          >
            <TextArea
              rows={8}
              placeholder={t('agents.form.contentPlaceholder')}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入Modal */}
      <Modal
        title={t('agents.import.title')}
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
          <p className="ant-upload-text">{t('agents.import.tip')}</p>
          <p className="ant-upload-hint">
            {t('agents.import.hint')}
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default AgentsManagementPanel
