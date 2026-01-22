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

import React, { useEffect } from 'react'
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
  CodeOutlined,
  DownloadOutlined
} from '@ant-design/icons'
import { useEnvironmentCheckStore } from '@/store/environment-check-store'
import { useTranslation } from '../../locales/useTranslation'
import { EnvironmentCheckStatus, PredefinedCheckType } from '@shared/types/environment'
import './EnvironmentCheckPanel.css'

const { Title, Text } = Typography

/**
 * 环境检测面板组件
 */
const EnvironmentCheckPanel: React.FC = () => {
  const messageApi = message
  const { t } = useTranslation()
  const {
    predefinedResults,
    customChecks,
    customResults,
    claudeCodeVersion,
    summary,
    isChecking,
    isCustomCheckModalOpen,
    editingCustomCheck,
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
    [EnvironmentCheckStatus.OK]: t('environment.status.ok'),
    [EnvironmentCheckStatus.WARNING]: t('environment.status.warning'),
    [EnvironmentCheckStatus.ERROR]: t('environment.status.error'),
    [EnvironmentCheckStatus.NOT_FOUND]: t('environment.status.notFound'),
    [EnvironmentCheckStatus.CHECKING]: t('environment.status.checking')
  }

  const handleClaudeCodeUpdate = async () => {
    try {
      messageApi.loading({ content: t('environment.messages.updateStarted'), key: 'claudeUpdate', duration: 0 })
      const result = await window.electronAPI.terminal.executeCommand('claude update', {
        timeout: 10 * 60 * 1000
      })

      if (!result?.success) {
        throw new Error(result?.error || t('environment.messages.updateFailed'))
      }

      messageApi.success({ content: t('environment.messages.updateSuccess'), key: 'claudeUpdate' })
      const outputText = [result?.data?.stdout, result?.data?.stderr].filter(Boolean).join('\n').trim()
      Modal.success({
        title: t('environment.messages.updateOutputTitle'),
        content: (
          <pre style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {outputText || t('environment.messages.updateNoOutput')}
          </pre>
        )
      })
      await loadClaudeCodeVersion()
    } catch (error) {
      messageApi.error({ content: t('environment.messages.updateFailed'), key: 'claudeUpdate' })
    }
  }

  // 预定义检查表格列定义
  const predefinedCheckColumns = [
    {
      title: t('environment.predefined.columns.name'),
      key: 'name',
      render: (_: any, record: any) => (
        <Space>
          {record.icon && <span style={{ fontSize: 18 }}>{record.icon}</span>}
          <Text strong>{record.name}</Text>
        </Space>
      )
    },
    {
      title: t('environment.predefined.columns.status'),
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
      title: t('environment.predefined.columns.version'),
      dataIndex: 'version',
      key: 'version',
      render: (version: string) => version ? (
        <Text code>{version}</Text>
      ) : (
        <Text type="secondary">-</Text>
      )
    },
    {
      title: t('environment.predefined.columns.error'),
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
      title: t('environment.predefined.columns.actions'),
      key: 'actions',
      render: (_: any, record: any) => (
        <Tooltip title={t('environment.actions.refresh')}>
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
    messageApi.success(t('environment.messages.refreshAllSuccess'))
  }

  // 处理添加自定义检查
  const handleAddCustomCheck = async () => {
    try {
      const values = await customCheckForm.validateFields()
      if (editingCustomCheck) {
        // 编辑模式
        await updateCustomCheck(editingCustomCheck.id, values)
        messageApi.success(t('environment.messages.customUpdated'))
      } else {
        // 新建模式
        await addCustomCheck(values)
        messageApi.success(t('environment.messages.customAdded'))
      }
      customCheckForm.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return // 表单验证错误
      }
      messageApi.error(`${t('environment.messages.actionFailed')}: ${error.message || t('common.unknownError')}`)
    }
  }

  // 处理删除自定义检查
  const handleDeleteCustomCheck = async (checkId: string) => {
    Modal.confirm({
      title: t('environment.messages.confirmDeleteTitle'),
      content: t('environment.messages.confirmDeleteContent'),
      onOk: async () => {
        try {
          await deleteCustomCheck(checkId)
          messageApi.success(t('environment.messages.deleteSuccess'))
        } catch (error: any) {
          messageApi.error(`${t('environment.messages.deleteFailed')}: ${error.message || t('common.unknownError')}`)
        }
      }
    })
  }

  // 自定义检查表格列
  const customCheckColumns = [
    {
      title: t('environment.custom.columns.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>
    },
    {
      title: t('environment.custom.columns.command'),
      dataIndex: 'command',
      key: 'command',
      render: (command: string) => (
        <Text code style={{ fontSize: 12 }}>
          {command}
        </Text>
      )
    },
    {
      title: t('environment.custom.columns.outputTemplate'),
      dataIndex: 'outputTemplate',
      key: 'outputTemplate',
      render: (template: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {template}
        </Text>
      )
    },
    {
      title: t('environment.custom.columns.status'),
      key: 'status',
      render: (_: any, record: { id: string }) => {
        const result = customResults.find(r => r.id === record.id)
        return result ? (
          <Badge
            status={statusMap[result.status] as any}
            text={statusTextMap[result.status]}
          />
        ) : (
          <Text type="secondary">{t('environment.status.notChecked')}</Text>
        )
      }
    },
    {
      title: t('environment.custom.columns.version'),
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
      title: t('environment.custom.columns.actions'),
      key: 'actions',
      render: (_: any, record: { id: string; name: string }) => (
        <Space size="small">
          <Tooltip title={t('environment.actions.refresh')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={isChecking}
              onClick={() => checkOne('custom', record.id)}
            />
          </Tooltip>
          <Tooltip title={t('environment.actions.edit')}>
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
              {t('environment.actions.edit')}
            </Button>
          </Tooltip>
          <Tooltip title={t('environment.actions.delete')}>
            <Button
              size="small"
              danger
              onClick={() => handleDeleteCustomCheck(record.id)}
            >
              {t('environment.actions.delete')}
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
        <Title level={3}>{t('environment.title')}</Title>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCustomCheckModal}
          >
            {t('environment.actions.addCustom')}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={isChecking}
            onClick={handleRefreshAll}
          >
            {t('environment.actions.refreshAll')}
          </Button>
        </Space>
      </div>

      {/* 汇总统计卡片 */}
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card variant="borderless" className="stat-card">
              <Statistic
                title={t('environment.summary.total')}
                value={summary.total}
                valueStyle={{ color: '#7C3AED' }}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card variant="borderless" className="stat-card success-stat">
              <Statistic
                title={t('environment.summary.ok')}
                value={summary.ok}
                valueStyle={{ color: '#52C41A' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card variant="borderless" className="stat-card warning-stat">
              <Statistic
                title={t('environment.summary.warning')}
                value={summary.warning}
                valueStyle={{ color: '#FAAD14' }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card variant="borderless" className="stat-card error-stat">
              <Statistic
                title={t('environment.summary.error')}
                value={summary.error}
                valueStyle={{ color: '#FF4D4F' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={5}>
            <Card variant="borderless" className="stat-card notfound-stat">
              <Statistic
                title={t('environment.summary.notFound')}
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
          variant="borderless"
          className="claude-code-version-card"
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              {claudeCodeVersion.updateAvailable && (
                <Button
                  type="primary"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={handleClaudeCodeUpdate}
                >
                  {t('environment.actions.updateAvailable')}
                </Button>
              )}
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={isChecking}
                onClick={() => loadClaudeCodeVersion()}
              >
                {t('environment.actions.refresh')}
              </Button>
            </Space>
          }
          title={
            <Space>
              <CodeOutlined style={{ color: '#7C3AED' }} />
              <Text strong>Claude Code</Text>
              {claudeCodeVersion.updateAvailable && (
                <Badge status="warning" text={t('environment.messages.newVersionAvailable')} />
              )}
            </Space>
          }
        >
          <Row gutter={16}>
            <Col span={6}>
              <Text type="secondary">{t('environment.claude.currentVersion')}</Text>
              <br />
              <Title level={4} style={{ color: '#7C3AED', marginTop: 8 }}>
                {claudeCodeVersion.current || claudeCodeVersion.version || t('common.unknown')}
              </Title>
            </Col>
            {claudeCodeVersion.latest && (
              <Col span={6}>
                <Text type="secondary">{t('environment.claude.latestVersion')}</Text>
                <br />
                <Title level={4} style={{ color: claudeCodeVersion.updateAvailable ? '#FAAD14' : '#52C41A', marginTop: 8 }}>
                  {claudeCodeVersion.latest}
                </Title>
              </Col>
            )}
            <Col span={claudeCodeVersion.latest ? 12 : 18}>
              <Text type="secondary">{t('environment.claude.configPath')}</Text>
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
        title={<Text strong>{t('environment.predefined.title')}</Text>}
        variant="borderless"
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
        title={<Text strong>{t('environment.custom.title')}</Text>}
        variant="borderless"
      >
        <Table
          dataSource={customChecks}
          columns={customCheckColumns}
          rowKey="id"
          pagination={false}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <Text type="secondary">{t('environment.custom.emptyTitle')}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('environment.custom.emptyDescription')}
                </Text>
              </div>
            )
          }}
        />
      </Card>

      {/* 添加自定义检查Modal */}
      <Modal
        title={editingCustomCheck ? t('environment.custom.editTitle') : t('environment.custom.addTitle')}
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
            label={t('environment.form.nameLabel')}
            rules={[{ required: true, message: t('environment.form.nameRequired') }]}
          >
            <Input placeholder={t('environment.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="command"
            label={t('environment.form.commandLabel')}
            rules={[{ required: true, message: t('environment.form.commandRequired') }]}
            extra={t('environment.form.commandExtra')}
          >
            <Input placeholder={t('environment.form.commandPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="outputTemplate"
            label={t('environment.form.outputTemplateLabel')}
            rules={[{ required: true, message: t('environment.form.outputTemplateRequired') }]}
            extra={t('environment.form.outputTemplateExtra')}
          >
            <Input placeholder={t('environment.form.outputTemplatePlaceholder')} />
          </Form.Item>

          <Form.Item name="description" label={t('environment.form.descriptionLabel')}>
            <Input.TextArea rows={3} placeholder={t('environment.form.descriptionPlaceholder')} />
          </Form.Item>

          <Form.Item name="icon" label={t('environment.form.iconLabel')}>
            <Input placeholder={t('environment.form.iconPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default EnvironmentCheckPanel
