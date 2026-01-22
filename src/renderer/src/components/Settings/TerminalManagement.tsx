/**
 * 终端管理组件
 * 管理全局终端配置
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Button,
  Form,
  Input,
  Select,
  Modal,
  Space,
  Typography,
  Tag,
  message,
  Tooltip,
  Popconfirm
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  DesktopOutlined,
  WindowsOutlined,
  LinuxOutlined
} from '@ant-design/icons'
import { useTerminalStore } from '../../store/terminal-store'
import type { TerminalConfig, TerminalType } from '@shared/types/terminal'
import { useTranslation } from '../../locales/useTranslation'
import './TerminalManagement.css'

const { Title, Text } = Typography
const { Option } = Select

/**
 * 终端图标映射
 */
const getTerminalIcon = (type: TerminalType) => {
  const iconMap: Record<string, React.ReactNode> = {
    'git-bash': <CodeOutlined />,
    'powershell': <WindowsOutlined />,
    'cmd': <WindowsOutlined />,
    'wsl': <LinuxOutlined />,
    'auto': <DesktopOutlined />
  }
  return iconMap[type] || <DesktopOutlined />
}

/**
 * 终端管理组件
 */
const TerminalManagement: React.FC = () => {
  const [form] = Form.useForm()
  const { t } = useTranslation()

  const {
    terminals,
    defaultTerminal,
    isLoading,
    isSaving,
    error,
    loadTerminals,
    upsertTerminal,
    deleteTerminal,
    setDefaultTerminal
  } = useTerminalStore()

  const [modalVisible, setModalVisible] = useState(false)
  const [editingTerminal, setEditingTerminal] = useState<TerminalConfig | null>(null)
  const [localError, setLocalError] = useState<string | null>(error)
  const existingTypes = new Set(terminals.map(terminal => terminal.type))
  const presetTypes = new Set(['git-bash', 'powershell', 'cmd', 'wsl', 'auto'])

  useEffect(() => {
    loadTerminals()
  }, [loadTerminals])

  useEffect(() => {
    setLocalError(error)
  }, [error])

  // 打开新增/编辑终端对话框
  const openTerminalModal = (terminal?: TerminalConfig) => {
    if (terminal) {
      const isCustomType = !presetTypes.has(terminal.type)
      setEditingTerminal(terminal)
      form.setFieldsValue({
        ...terminal,
        type: isCustomType ? 'custom' : terminal.type,
        customType: isCustomType ? terminal.type : undefined,
        args: terminal.args ? terminal.args.join(' ') : undefined,
        isDefault: terminal.type === defaultTerminal
      })
    } else {
      setEditingTerminal(null)
      form.resetFields()
      form.setFieldsValue({ isDefault: false })
    }
    setModalVisible(true)
  }

  // 保存终端
  const saveTerminal = async () => {
    try {
      const values = await form.validateFields()

      const resolvedType = values.type === 'custom'
        ? (values.customType || '').trim()
        : values.type

      if (!resolvedType) {
        message.error(t('terminal.messages.customTypeRequired'))
        return
      }

      if (!editingTerminal && existingTypes.has(resolvedType)) {
        message.error(t('terminal.messages.typeExists'))
        return
      }

      const config: TerminalConfig = {
        type: editingTerminal?.type || resolvedType,
        name: values.name,
        path: values.path,
        initialDirectory: values.initialDirectory || undefined,
        args: values.args
          ? String(values.args).split(/\s+/).filter((item: string) => item.length > 0)
          : undefined,
        isDefault: values.isDefault
      }

      await upsertTerminal(config)
      message.success(t('terminal.messages.saveSuccess'))
      setModalVisible(false)
    } catch (error) {
      console.error(t('terminal.messages.saveFailed'), error)
    }
  }

  // 设置默认终端
  const handleSetDefault = async (type: TerminalType) => {
    try {
      await setDefaultTerminal(type)
      message.success(t('terminal.messages.setDefaultSuccess'))
    } catch (error) {
      console.error(t('terminal.messages.setDefaultFailed'), error)
    }
  }

  // 终端表格行渲染
  const renderTerminalRow = (record: TerminalConfig) => {
    const isDefault = record.type === defaultTerminal

    return (
      <tr
        key={record.type}
        className={isDefault ? 'terminal-row-default' : 'terminal-row'}
      >
        <td style={{ padding: '16px 20px' }}>
          <Space size="middle">
            <span style={{ fontSize: 18, color: '#7C3AED' }}>
              {getTerminalIcon(record.type)}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>
                {record.name}
              </div>
            </div>
            {isDefault && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                {t('terminal.labels.default')}
              </Tag>
            )}
          </Space>
        </td>
        <td style={{ padding: '16px 20px' }}>
          <Tag color={getTerminalTypeColor(record.type)}>
            {getTerminalTypeLabel(record.type)}
          </Tag>
        </td>
        <td style={{ padding: '16px 20px' }}>
          {record.path ? (
            <Tooltip title={record.path}>
              <Text
                ellipsis
                style={{
                  maxWidth: 350,
                  fontSize: 13,
                  color: '#6b7280',
                  fontFamily: 'Consolas, Monaco, monospace'
                }}
              >
                {record.path}
              </Text>
            </Tooltip>
          ) : (
            <Text type="secondary">-</Text>
          )}
        </td>
        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
          <Space size="small">
            {record.type !== 'auto' && (
              <>
                <Tooltip title={t('terminal.actions.edit')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openTerminalModal(record)}
                  />
                </Tooltip>
                {!isDefault && (
                  <Tooltip title={t('terminal.actions.setDefault')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleSetDefault(record.type)}
                      style={{ color: '#52c41a' }}
                    />
                  </Tooltip>
                )}
                <Popconfirm
                  title={t('terminal.confirm.deleteTitle')}
                  description={t('terminal.confirm.deleteDescription')}
                  onConfirm={async () => {
                    try {
                      await deleteTerminal(record.type)
                      message.success(t('terminal.messages.deleteSuccess'))
                    } catch (error) {
                      console.error(t('terminal.messages.deleteFailed'), error)
                    }
                  }}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                >
                  <Tooltip title={t('terminal.actions.delete')}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                    />
                  </Tooltip>
                </Popconfirm>
              </>
            )}
          </Space>
        </td>
      </tr>
    )
  }

  const getTerminalTypeLabel = (type: TerminalType): string => {
    const labels: Record<string, string> = {
      'git-bash': 'Git Bash',
      'powershell': 'PowerShell',
      'cmd': 'CMD',
      'wsl': 'WSL',
      'auto': t('terminal.labels.autoDetect')
    }
    return labels[type] || type
  }

  const getTerminalTypeColor = (type: TerminalType): string => {
    const colors: Record<string, string> = {
      'git-bash': 'blue',
      'powershell': 'cyan',
      'cmd': 'geekblue',
      'wsl': 'orange',
      'auto': 'default'
    }
    return colors[type] || 'default'
  }

  return (
    <div className="terminal-management-container">
      {localError && (
        <div
          style={{
            marginBottom: 20,
            padding: '14px 18px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: '8px',
            color: '#cf1322',
            fontSize: 14
          }}
        >
          {localError}
        </div>
      )}

      <Card
        variant="borderless"
        className="terminal-management-card"
        styles={{ body: { padding: 0 } }}
      >
        <div className="terminal-header">
          <div className="terminal-header-left">
            <Title level={4} style={{ margin: 0, color: '#1f2937' }}>
              <DesktopOutlined style={{ marginRight: 8, color: '#7C3AED' }} />
              {t('terminal.title')}
            </Title>
            <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
              {t('terminal.subtitle')}
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openTerminalModal()}
            size="large"
          >
            {t('terminal.actions.add')}
          </Button>
        </div>

        <table className="terminal-table">
          <thead>
            <tr>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                {t('terminal.table.name')}
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                {t('terminal.table.type')}
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                {t('terminal.table.path')}
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>
                {t('terminal.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : terminals.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                  <Text type="secondary">{t('terminal.empty')}</Text>
                </td>
              </tr>
            ) : (
              terminals.map(renderTerminalRow)
            )}
          </tbody>
        </table>
      </Card>

      {/* 终端编辑对话框 */}
      <Modal
        title={editingTerminal ? t('terminal.modal.editTitle') : t('terminal.modal.addTitle')}
        open={modalVisible}
        onOk={saveTerminal}
        onCancel={() => setModalVisible(false)}
        confirmLoading={isSaving}
        width={560}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ size: 'large' }}
        cancelButtonProps={{ size: 'large' }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ isDefault: false }}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="type"
            label={t('terminal.form.type')}
            rules={[{ required: true, message: t('terminal.form.typeRequired') }]}
          >
            <Select
              disabled={!!editingTerminal}
              placeholder={t('terminal.form.typePlaceholder')}
              size="large"
            >
              <Option value="git-bash" disabled={!editingTerminal && existingTypes.has('git-bash')}>
                <Space>
                  <CodeOutlined />
                  Git Bash
                </Space>
              </Option>
              <Option value="powershell" disabled={!editingTerminal && existingTypes.has('powershell')}>
                <Space>
                  <WindowsOutlined />
                  PowerShell
                </Space>
              </Option>
              <Option value="cmd" disabled={!editingTerminal && existingTypes.has('cmd')}>
                <Space>
                  <WindowsOutlined />
                  CMD
                </Space>
              </Option>
              <Option value="wsl" disabled={!editingTerminal && existingTypes.has('wsl')}>
                <Space>
                  <LinuxOutlined />
                  WSL
                </Space>
              </Option>
              <Option value="custom">
                <Space>
                  <DesktopOutlined />
                  {t('terminal.form.customTypeOption')}
                </Space>
              </Option>
            </Select>
          </Form.Item>

          <Form.Item shouldUpdate={(prev, next) => prev.type !== next.type} noStyle>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'custom' ? (
                <Form.Item
                  name="customType"
                  label={t('terminal.form.customTypeLabel')}
                  rules={[{ required: true, message: t('terminal.form.customTypeRequired') }]}
                >
                  <Input placeholder={t('terminal.form.customTypePlaceholder')} size="large" />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            name="name"
            label={t('terminal.form.name')}
            rules={[{ required: true, message: t('terminal.form.nameRequired') }]}
          >
            <Input placeholder={t('terminal.form.namePlaceholder')} size="large" />
          </Form.Item>

          <Form.Item
            name="path"
            label={t('terminal.form.path')}
            rules={[{ required: true, message: t('terminal.form.pathRequired') }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('terminal.form.pathExtra')}
              </Text>
            }
          >
            <Input placeholder={t('terminal.form.pathPlaceholder')} size="large" />
          </Form.Item>

          <Form.Item
            name="args"
            label={t('terminal.form.args')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('terminal.form.argsExtra')}
              </Text>
            }
          >
            <Input placeholder={t('terminal.form.argsPlaceholder')} size="large" />
          </Form.Item>

          <Form.Item
            name="initialDirectory"
            label={t('terminal.form.initialDirectory')}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('terminal.form.initialDirectoryExtra')}
              </Text>
            }
          >
            <Input placeholder={t('terminal.form.initialDirectoryPlaceholder')} size="large" />
          </Form.Item>

          <Form.Item
            name="isDefault"
            label={t('terminal.form.isDefault')}
            valuePropName="checked"
          >
            <Select size="large" defaultValue={false}>
              <Option value={true}>{t('common.yes')}</Option>
              <Option value={false}>{t('common.no')}</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TerminalManagement
