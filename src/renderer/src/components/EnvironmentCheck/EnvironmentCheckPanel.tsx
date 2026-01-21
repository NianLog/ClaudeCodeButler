/**
 * 环境检测面板组件
 *
 * 功能:
 * - 显示预定义环境检查（UV、Claude Code、Node.js、NPM、NPX）
 * - 支持自定义环境检查
 * - 提供版本信息显示和状态徽章
 * - 支持单个刷新和全部刷新
 * - Claude Code版本信息置顶显示
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Space,
  Row,
  Col,
  Badge,
  Table,
  Modal,
  Form,
  Input,
  message,
  Statistic,
  Tooltip,
  Typography
} from 'antd'
import {
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  CodeOutlined,
  NodeIndexOutlined,
  DownloadOutlined,
  ToolOutlined
} from '@ant-design/icons'
import { useEnvironmentCheckStore } from '@/store/environment-check-store'
import type { CustomCheckFormData } from '@shared/types/environment'
import { EnvironmentCheckStatus, PredefinedCheckType } from '@shared/types/environment'
import './EnvironmentCheckPanel.css'

const { Title, Text } = Typography

/**
 * 环境检测面板组件
 */
const EnvironmentCheckPanel: React.FC = () => {
  const messageApi = message
  const {
    predefinedResults,
    customChecks,
    customResults,
    claudeCodeVersion,
    summary,
    isChecking,
    isCustomCheckModalOpen,
    editingCustomCheck,
    checkAllPredefined,
    checkOne,
    refreshAll,
    loadCustomChecks,
    addCustomCheck,
    updateCustomCheck,
    deleteCustomCheck,
    loadClaudeCodeVersion,
    openCustomCheckModal,
    closeCustomCheckModal
  } = useEnvironmentCheckStore()

  const [customCheckForm] = Form.useForm()

  // 监听editingCustomCheck变化，更新表单值
  useEffect(() => {
    if (editingCustomCheck && isCustomCheckModalOpen) {
      customCheckForm.setFieldsValue({
        name: editingCustomCheck.name,
        command: editingCustomCheck.command,
        outputTemplate: editingCustomCheck.outputTemplate,
        description: editingCustomCheck.description,
        icon: editingCustomCheck.icon
      })
    }
  }, [editingCustomCheck, isCustomCheckModalOpen, customCheckForm])

  // 初始化加载数据
  useEffect(() => {
    const initializeData = async () => {
      // 先加载自定义检查配置
      await loadCustomChecks()
      // 然后刷新所有检查（包括预定义和自定义）
      await refreshAll()
    }
    initializeData()
  }, [])

  // 状态映射
  const statusMap = {
    [EnvironmentCheckStatus.OK]: 'success',
    [EnvironmentCheckStatus.WARNING]: 'warning',
    [EnvironmentCheckStatus.ERROR]: 'error',
    [EnvironmentCheckStatus.NOT_FOUND]: 'default',
    [EnvironmentCheckStatus.CHECKING]: 'processing'
  } as const

  const statusTextMap = {
    [EnvironmentCheckStatus.OK]: '正常',
    [EnvironmentCheckStatus.WARNING]: '警告',
    [EnvironmentCheckStatus.ERROR]: '错误',
    [EnvironmentCheckStatus.NOT_FOUND]: '未找到',
    [EnvironmentCheckStatus.CHECKING]: '检查中'
  }

  // 预定义检查表格列定义
  const predefinedCheckColumns = [
    {
      title: '检查项',
      key: 'name',
      render: (_: any, record: any) => (
        <Space>
          {record.icon && <span style={{ fontSize: 18 }}>{record.icon}</span>}
          <Text strong>{record.name}</Text>
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: EnvironmentCheckStatus) => (
        <Badge
          status={statusMap[status] as any}
          text={statusTextMap[status]}
        />
      )
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (version: string) => version ? (
        <Text code>{version}</Text>
      ) : (
        <Text type="secondary">-</Text>
      )
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (error: string) => error ? (
        <Text type="danger" style={{ fontSize: 12 }}>
          {error}
        </Text>
      ) : (
        <Text type="secondary">-</Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Tooltip title="刷新">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={record.status === EnvironmentCheckStatus.CHECKING}
            onClick={() => checkOne(record.type, record.id)}
          />
        </Tooltip>
      )
    }
  ]

  // 处理全部刷新
  const handleRefreshAll = async () => {
    await refreshAll()
    messageApi.success('已刷新所有检查')
  }

  // 处理添加自定义检查
  const handleAddCustomCheck = async () => {
    try {
      const values = await customCheckForm.validateFields()
      if (editingCustomCheck) {
        // 编辑模式
        await updateCustomCheck(editingCustomCheck.id, values)
        messageApi.success('自定义检查已更新')
      } else {
        // 新建模式
        await addCustomCheck(values)
        messageApi.success('自定义检查已添加')
      }
      customCheckForm.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return // 表单验证错误
      }
      messageApi.error('操作失败: ' + (error.message || '未知错误'))
    }
  }

  // 处理删除自定义检查
  const handleDeleteCustomCheck = async (checkId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个自定义检查吗？',
      onOk: async () => {
        try {
          await deleteCustomCheck(checkId)
          messageApi.success('已删除')
        } catch (error: any) {
          messageApi.error('删除失败: ' + (error.message || '未知错误'))
        }
      }
    })
  }

  // 自定义检查表格列
  const customCheckColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: '检查命令',
      dataIndex: 'command',
      key: 'command',
      render: (command: string) => (
        <Text code style={{ fontSize: 12 }}>
          {command}
        </Text>
      )
    },
    {
      title: '输出模板',
      dataIndex: 'outputTemplate',
      key: 'outputTemplate',
      render: (template: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {template}
        </Text>
      )
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: { id: string }) => {
        const result = customResults.find(r => r.id === record.id)
        return result ? (
          <Badge
            status={statusMap[result.status] as any}
            text={statusTextMap[result.status]}
          />
        ) : (
          <Text type="secondary">未检查</Text>
        )
      }
    },
    {
      title: '版本',
      key: 'version',
      render: (_: any, record: { id: string }) => {
        const result = customResults.find(r => r.id === record.id)
        return result?.version ? (
          <Text code style={{ fontSize: 12 }}>
            {result.version}
          </Text>
        ) : result?.error ? (
          <Text type="danger" style={{ fontSize: 12 }}>
            {result.error}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        )
      }
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: { id: string; name: string }) => (
        <Space size="small">
          <Tooltip title="刷新">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={isChecking}
              onClick={() => checkOne('custom', record.id)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                const check = customChecks.find(c => c.id === record.id)
                if (check) {
                  useEnvironmentCheckStore.getState().editCustomCheck(check)
                }
              }}
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              danger
              onClick={() => handleDeleteCustomCheck(record.id)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ]

  return (
    <div className="environment-check-panel">
      {/* 标题栏 */}
      <div className="page-header">
        <Title level={3}>环境排查</Title>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCustomCheckModal}
          >
            添加自定义检查
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={isChecking}
            onClick={handleRefreshAll}
          >
            全部刷新
          </Button>
        </Space>
      </div>

      {/* 汇总统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card bordered={false} className="stat-card">
              <Statistic
                title="总检查项"
                value={summary.total}
                valueStyle={{ color: '#7C3AED' }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card bordered={false} className="stat-card success-stat">
              <Statistic
                title="正常"
                value={summary.ok}
                valueStyle={{ color: '#52C41A' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card bordered={false} className="stat-card warning-stat">
              <Statistic
                title="警告"
                value={summary.warning}
                valueStyle={{ color: '#FAAD14' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card bordered={false} className="stat-card error-stat">
              <Statistic
                title="错误"
                value={summary.error}
                valueStyle={{ color: '#FF4D4F' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card bordered={false} className="stat-card notfound-stat">
              <Statistic
                title="未找到"
                value={summary.notFound}
                valueStyle={{ color: '#8C8C8C' }}
                prefix={<QuestionCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Claude Code版本卡片（置顶） */}
      {claudeCodeVersion && (
        <Card
          bordered={false}
          className="claude-code-version-card"
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              {claudeCodeVersion.updateAvailable && (
                <Button
                  type="primary"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => window.open('https://claude.ai/code', '_blank')}
                >
                  更新可用
                </Button>
              )}
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={isChecking}
                onClick={() => loadClaudeCodeVersion()}
              >
                刷新
              </Button>
            </Space>
          }
          title={
            <Space>
              <CodeOutlined style={{ color: '#7C3AED' }} />
              <Text strong>Claude Code</Text>
              {claudeCodeVersion.updateAvailable && (
                <Badge status="warning" text="有新版本" />
              )}
            </Space>
          }
        >
          <Row gutter={16}>
            <Col span={6}>
              <Text type="secondary">当前版本</Text>
              <br />
              <Title level={4} style={{ color: '#7C3AED', marginTop: 8 }}>
                {claudeCodeVersion.current || claudeCodeVersion.version || '未知'}
              </Title>
            </Col>
            {claudeCodeVersion.latest && (
              <Col span={6}>
                <Text type="secondary">最新版本</Text>
                <br />
                <Title level={4} style={{ color: claudeCodeVersion.updateAvailable ? '#FAAD14' : '#52C41A', marginTop: 8 }}>
                  {claudeCodeVersion.latest}
                </Title>
              </Col>
            )}
            <Col span={claudeCodeVersion.latest ? 12 : 18}>
              <Text type="secondary">配置路径</Text>
              <br />
              <Text
                code
                ellipsis={{ tooltip: claudeCodeVersion.path || '~/.claude/' }}
                style={{ fontSize: 12, marginTop: 8, display: 'block' }}
              >
                {claudeCodeVersion.path || '~/.claude/'}
              </Text>
            </Col>
          </Row>
        </Card>
      )}

      {/* 预定义环境检查列表 */}
      <Card
        title={<Text strong>预定义环境检查</Text>}
        bordered={false}
        style={{ marginBottom: 16 }}
      >
        <Table
          dataSource={predefinedResults.filter(r => r.type !== PredefinedCheckType.CLAUDE_CODE)}
          columns={predefinedCheckColumns}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      </Card>

      {/* 自定义环境检查表格 */}
      <Card
        title={<Text strong>自定义环境检查</Text>}
        bordered={false}
      >
        <Table
          dataSource={customChecks}
          columns={customCheckColumns}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Text type="secondary">暂无自定义检查</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  点击"添加自定义检查"创建环境检测
                </Text>
              </div>
            )
          }}
        />
      </Card>

      {/* 添加自定义检查Modal */}
      <Modal
        title={editingCustomCheck ? '编辑自定义检查' : '添加自定义检查'}
        open={isCustomCheckModalOpen}
        onOk={handleAddCustomCheck}
        onCancel={closeCustomCheckModal}
        width={600}
        afterClose={() => customCheckForm.resetFields()}
      >
        <Form
          form={customCheckForm}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="检查项名称"
            rules={[{ required: true, message: '请输入检查项名称' }]}
          >
            <Input placeholder="例如: Java" />
          </Form.Item>

          <Form.Item
            name="command"
            label="检查命令"
            rules={[{ required: true, message: '请输入检查命令' }]}
            extra="命令将在终端中执行"
          >
            <Input placeholder="例如: java -version" />
          </Form.Item>

          <Form.Item
            name="outputTemplate"
            label="输出格式模板"
            rules={[{ required: true, message: '请输入输出格式模板' }]}
            extra="使用 {ver} 作为版本号占位符"
          >
            <Input placeholder='例如: java version "{ver}"' />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选的描述信息" />
          </Form.Item>

          <Form.Item name="icon" label="图标（可选）">
            <Input placeholder="例如: ☕" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default EnvironmentCheckPanel
