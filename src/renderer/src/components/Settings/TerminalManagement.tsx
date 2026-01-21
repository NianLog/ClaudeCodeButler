/**
 * 终端管理组件
 * 管理全局终端配置
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
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
  AppleOutlined,
  LinuxOutlined
} from '@ant-design/icons'
import { useTerminalStore } from '../../store/terminal-store'
import type { TerminalConfig, TerminalType } from '@shared/types/terminal'
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
        message.error('请输入自定义终端类型')
        return
      }

      if (!editingTerminal && existingTypes.has(resolvedType)) {
        message.error('该终端类型已存在，请编辑现有配置')
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
      message.success('终端保存成功')
      setModalVisible(false)
    } catch (error) {
      console.error('保存终端失败:', error)
    }
  }

  // 设置默认终端
  const handleSetDefault = async (type: TerminalType) => {
    try {
      await setDefaultTerminal(type)
      message.success('默认终端设置成功')
    } catch (error) {
      console.error('设置默认终端失败:', error)
    }
  }

  // 终端表格行渲染
  const renderTerminalRow = (record: TerminalConfig, index: number) => {
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
                默认
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
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openTerminalModal(record)}
                  />
                </Tooltip>
                {!isDefault && (
                  <Tooltip title="设为默认">
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
                  title="确认删除"
                  description="确定要删除此终端配置吗？"
                  onConfirm={async () => {
                    try {
                      await deleteTerminal(record.type)
                      message.success('删除成功')
                    } catch (error) {
                      console.error('删除终端失败:', error)
                    }
                  }}
                  okText="确定"
                  cancelText="取消"
                >
                  <Tooltip title="删除">
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
      'auto': '自动检测'
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
        bordered={false}
        className="terminal-management-card"
        bodyStyle={{ padding: 0 }}
      >
        <div className="terminal-header">
          <div className="terminal-header-left">
            <Title level={4} style={{ margin: 0, color: '#1f2937' }}>
              <DesktopOutlined style={{ marginRight: 8, color: '#7C3AED' }} />
              终端配置
            </Title>
            <Text type="secondary" style={{ fontSize: 14, marginLeft: 8 }}>
              配置全局默认终端，所有命令执行都将使用此终端
            </Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openTerminalModal()}
            size="large"
          >
            添加终端
          </Button>
        </div>

        <table className="terminal-table">
          <thead>
            <tr>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                终端名称
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                类型
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>
                路径
              </th>
              <th style={{ padding: '14px 20px', fontSize: 13, fontWeight: 600, color: '#6b7280', textAlign: 'right' }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                  加载中...
                </td>
              </tr>
            ) : terminals.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '40px', textAlign: 'center' }}>
                  <Text type="secondary">暂无终端配置</Text>
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
        title={editingTerminal ? '编辑终端' : '添加终端'}
        open={modalVisible}
        onOk={saveTerminal}
        onCancel={() => setModalVisible(false)}
        confirmLoading={isSaving}
        width={560}
        okText="确定"
        cancelText="取消"
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
            label="终端类型"
            rules={[{ required: true, message: '请选择终端类型' }]}
          >
            <Select
              disabled={!!editingTerminal}
              placeholder="请选择终端类型"
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
                  自定义
                </Space>
              </Option>
            </Select>
          </Form.Item>

          <Form.Item shouldUpdate={(prev, next) => prev.type !== next.type} noStyle>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'custom' ? (
                <Form.Item
                  name="customType"
                  label="自定义终端类型"
                  rules={[{ required: true, message: '请输入自定义终端类型' }]}
                >
                  <Input placeholder="例如: wezterm" size="large" />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            name="name"
            label="终端名称"
            rules={[{ required: true, message: '请输入终端名称' }]}
          >
            <Input placeholder="例如: Git Bash (Custom)" size="large" />
          </Form.Item>

          <Form.Item
            name="path"
            label="终端路径"
            rules={[{ required: true, message: '请输入终端路径' }]}
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                例如: C:\Program Files\Git\bin\bash.exe
              </Text>
            }
          >
            <Input placeholder="终端可执行文件的完整路径" size="large" />
          </Form.Item>

          <Form.Item
            name="args"
            label="启动参数（可选）"
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                例如: -c 或 --login -i（多个参数用空格分隔）
              </Text>
            }
          >
            <Input placeholder="例如: -c" size="large" />
          </Form.Item>

          <Form.Item
            name="initialDirectory"
            label="初始工作目录（可选）"
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                终端启动时使用的工作目录，留空使用系统默认
              </Text>
            }
          >
            <Input placeholder="例如: C:\Projects" size="large" />
          </Form.Item>

          <Form.Item
            name="isDefault"
            label="设为默认终端"
            valuePropName="checked"
          >
            <Select size="large" defaultValue={false}>
              <Option value={true}>是</Option>
              <Option value={false}>否</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TerminalManagement
