/**
 * 配置编辑器组件
 * 提供配置文件的编辑功能
 */

import React, { useState, useEffect } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Divider,
  Alert,
  Row,
  Col,
  Card,
  Tag,
  List,
  Empty,
  Spin
} from 'antd'
import {
  SaveOutlined,
  EyeOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  FolderOpenOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useConfigEditorStore } from '../../store/config-editor-store'
import { useConfigValidationStore } from '../../store/config-validation-store'
import { useMessage } from '../../hooks/useMessage'
import type { ConfigFile, ConfigType } from '@shared/types'
import CodeEditor from '../Common/CodeEditor'
import MarkdownRenderer from '@/components/Common/MarkdownRenderer'

const { TextArea } = Input
const { Option } = Select
const { Title, Text } = Typography

/**
 * 配置编辑器属性
 */
interface ConfigEditorProps {
  visible: boolean
  config?: ConfigFile | null
  onClose: () => void
  onSave: (configData: Partial<ConfigFile>) => Promise<void>
}

/**
 * 配置编辑器组件
 */
const ConfigEditor: React.FC<ConfigEditorProps> = ({
  visible,
  config,
  onClose,
  onSave
}) => {
  const [form] = Form.useForm()
  const message = useMessage()
  const [content, setContent] = useState('')
  const [isValid, setIsValid] = useState(true)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [previewVisible, setPreviewVisible] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showUserImport, setShowUserImport] = useState(false)
  const [userConfigs, setUserConfigs] = useState<any[]>([])
  const [loadingUserConfigs, setLoadingUserConfigs] = useState(false)
  const [editorLanguage, setEditorLanguage] = useState<'json' | 'markdown'>('json')
  const [systemConfigConfirmVisible, setSystemConfigConfirmVisible] = useState(false)
  const [pendingSystemConfigAction, setPendingSystemConfigAction] = useState<{
    action: 'load' | 'save'
    callback: () => void
  } | null>(null)

  const { editorContent, loadConfigContent } = useConfigEditorStore()
  const { validateConfig } = useConfigValidationStore()

  // 初始化表单数据
  useEffect(() => {
    if (visible) {
      if (config) {
        // 编辑模式 - 设置表单字段
        form.setFieldsValue({
          name: config.name || '',
          description: config.description || '',
          type: config.type || 'claude-code',
          isActive: config.isActive || false
        })

        // 加载配置内容
        if (config.isSystemConfig) {
          // 系统配置文件需要二次确认
          setPendingSystemConfigAction({
            action: 'load',
            callback: () => loadConfigContent(config)
          })
          setSystemConfigConfirmVisible(true)
        } else {
          loadConfigContent(config)
        }
      } else {
        // 新建模式
        const defaultContent = JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "Claude Code TokenKey",
            ANTHROPIC_BASE_URL: "Claude Code API URL",
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
          },
          permissions: {
            allow: [],
            deny: []
          }
        }, null, 2)
        form.setFieldsValue({
          name: '',
          description: '',
          type: 'claude-code',
          isActive: false
        })
        setContent(defaultContent)
        setEditorLanguage('json')
      }
    }
  }, [visible, config, form, loadConfigContent])

  // 从store的editorContent加载内容（统一架构：只处理纯内容）
  useEffect(() => {
    if (config && visible && editorContent) {
      // 统一处理：editorContent已经是纯内容，不再包含元数据
      let contentStr: string
      let language: 'json' | 'markdown' = 'json'

      const isMDFile = config.type === 'claude-md' || config.type === 'user-preferences' ||
                       config.path?.endsWith('.md') || config.path?.endsWith('CLAUDE.md')

      if (typeof editorContent === 'string') {
        // 字符串内容（MD文件）
        contentStr = editorContent
        language = isMDFile ? 'markdown' : 'json'
      } else {
        // 对象内容（JSON文件）
        contentStr = JSON.stringify(editorContent, null, 2)
        language = 'json'
      }

      setContent(contentStr)
      setEditorLanguage(language)
    }
  }, [editorContent, config, visible])

  // 处理内容变化
  const handleContentChange = (value: string) => {
    setContent(value)
  }

  // 处理验证变化
  const handleValidationChange = (isValid: boolean, errors?: string[]) => {
    setIsValid(isValid)
    setValidationErrors(errors || [])
  }

  // 确认系统配置操作
  const handleSystemConfigConfirm = () => {
    if (pendingSystemConfigAction) {
      pendingSystemConfigAction.callback()
    }
    setSystemConfigConfirmVisible(false)
    setPendingSystemConfigAction(null)
  }

  // 取消系统配置操作
  const handleSystemConfigCancel = () => {
    setSystemConfigConfirmVisible(false)
    setPendingSystemConfigAction(null)
    if (pendingSystemConfigAction?.action === 'load') {
      // 如果是加载操作被取消，关闭编辑器
      onClose()
    }
  }

  // 从用户目录加载配置
  const loadUserConfigs = async () => {
    try {
      setLoadingUserConfigs(true)
      const response = await window.electronAPI.config.importFromUserDir()
      if (response && typeof response === 'object' && 'success' in response && response.success) {
        setUserConfigs((response as any).data || [])
      } else {
        console.error('加载用户配置失败:', (response as any).error)
      }
    } catch (error) {
      console.error('加载用户配置失败:', error)
    } finally {
      setLoadingUserConfigs(false)
    }
  }

  // 导入用户配置
  const importUserConfig = (userConfig: any) => {
    try {
      let contentStr: string
      let language: 'json' | 'markdown' = 'json'

      // 根据配置类型判断内容格式
      if (userConfig.type === 'user-preferences' || userConfig.type === 'claude-md') {
        // MD文件：确保内容是字符串
        contentStr = typeof userConfig.content === 'string' ? userConfig.content : String(userConfig.content || '')
        language = 'markdown'
      } else {
        // JSON文件：序列化内容
        contentStr = typeof userConfig.content === 'string' ? userConfig.content : JSON.stringify(userConfig.content || {}, null, 2)
        language = 'json'
      }

      setContent(contentStr)
      setEditorLanguage(language)
      form.setFieldsValue({
        name: `导入_${userConfig.name}`,
        description: userConfig.description,
        type: userConfig.type
      })
      setShowUserImport(false)
    } catch (error) {
      console.error('导入用户配置失败:', error)
    }
  }

  // 预览配置
  const handlePreview = () => {
    if (isValid) {
      setPreviewVisible(true)
    }
  }

  // 保存配置（统一架构）
  const handleSave = async () => {
    try {
      // 验证表单
      let values
      try {
        values = await form.validateFields()
      } catch (formError) {
        console.error('表单验证失败:', formError)
        if (formError.errorFields && formError.errorFields.length > 0) {
          const firstError = formError.errorFields[0]
          message.error(`表单验证失败: ${firstError.errors[0]}`)
        } else {
          message.error('请检查表单是否填写完整')
        }
        return
      }

      if (!isValid) {
        message.error('配置内容格式不正确，请先修正')
        return
      }

      setIsSaving(true)

      // 处理内容
      let actualContent: any
      try {
        if (editorLanguage === 'markdown') {
          // Markdown文件直接存储为字符串内容
          actualContent = content
        } else {
          // JSON配置解析
          const cleanContent = content.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
          actualContent = JSON.parse(cleanContent)
        }
      } catch (error) {
        console.error('内容解析失败:', error)
        message.error(`配置内容解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
        return
      }

      // 构建配置数据：分离内容和元数据
      const configData = {
        content: actualContent, // 纯内容
        metadata: { // 元数据
          name: String(values.name || '未命名配置'),
          description: String(values.description || ''),
          type: values.type || 'claude-code',
          isActive: Boolean(values.isActive)
        }
      }

      // 保存配置
      if (config?.isSystemConfig) {
        // 系统配置文件需要二次确认，直接保存到原路径
        setPendingSystemConfigAction({
          action: 'save',
          callback: async () => {
            await window.electronAPI.config.save(config.path, actualContent)
            message.success('系统配置文件已保存')
            // 系统配置保存后关闭编辑器，触发父组件刷新
            onClose()
          }
        })
        setSystemConfigConfirmVisible(true)
      } else {
        // 非系统配置文件通过onSave处理
        await onSave(configData)

        // 检查是否需要手动激活配置
        if (config && values.isActive && config.type === 'claude-code') {
          try {
            console.log(`🔄 用户激活配置: ${config.name}`)
            const activateResponse = await window.electronAPI.config.activateConfig(config.path)

            if (activateResponse && typeof activateResponse === 'object' && 'success' in activateResponse) {
              if (activateResponse.success) {
                message.success('配置已激活并应用到系统settings')
                console.log('✅ 配置激活成功')
              } else {
                message.error('配置激活失败')
                console.error('❌ 配置激活失败')
              }
            }
          } catch (error) {
            console.error('激活配置失败:', error)
            message.error(`激活配置失败: ${error instanceof Error ? error.message : '未知错误'}`)
          }
        }

        // 非系统配置保存成功后，关闭编辑器触发父组件刷新
        onClose()
      }
    } catch (error) {
      console.error('Save failed:', error)
      message.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsSaving(false)
    }
  }

  // 获取类型提示
  const getTypeDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      'claude-code': 'Claude Code 主配置文件，包含工具链、项目设置等',
      'mcp-config': 'MCP (Model Context Protocol) 服务器配置',
      'project-config': '项目特定的配置文件',
      'user-preferences': '用户个人偏好设置'
    }
    return descriptions[type] || '自定义配置文件'
  }

  return (
    <>
      <Modal
        title={
          <Space>
            {config ? '编辑配置' : '新建配置'}
            {isValid ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>格式正确</Tag>
            ) : (
              <Tag color="error" icon={<ExclamationCircleOutlined />}>格式错误</Tag>
            )}
          </Space>
        }
        open={visible}
        onCancel={onClose}
        width={900}
        footer={[
          <Button key="cancel" onClick={onClose}>
            取消
          </Button>,
          <Button
            key="import"
            icon={<ImportOutlined />}
            onClick={() => {
              setShowUserImport(true)
              loadUserConfigs()
            }}
          >
            从用户目录导入
          </Button>,
          <Button
            key="preview"
            icon={<EyeOutlined />}
            onClick={handlePreview}
            disabled={!isValid}
          >
            预览
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            loading={isSaving}
            onClick={handleSave}
            disabled={!isValid}
          >
            保存
          </Button>
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            type: 'claude-code',
            isActive: false
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="配置名称"
                name="name"
                rules={[{ required: true, message: '请输入配置名称' }]}
              >
                <Input
                  placeholder="输入配置文件名称"
                  disabled={config?.isSystemConfig}
                  style={{
                    backgroundColor: config?.isSystemConfig ? '#f5f5f5' : 'white',
                    cursor: config?.isSystemConfig ? 'not-allowed' : 'text'
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="配置类型"
                name="type"
                rules={[{ required: true, message: '请选择配置类型' }]}
              >
                <Select
                  placeholder="选择配置类型"
                  disabled={config?.isSystemConfig}
                  style={{
                    backgroundColor: config?.isSystemConfig ? '#f5f5f5' : 'white',
                    cursor: config?.isSystemConfig ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Option value="claude-code">Claude Code</Option>
                  <Option value="mcp-config">MCP配置</Option>
                  <Option value="project-config">项目配置</Option>
                  <Option value="user-preferences">用户偏好</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="描述"
            name="description"
          >
            <Input.TextArea
              placeholder="输入配置文件的描述信息"
              rows={2}
              disabled={config?.isSystemConfig}
              style={{
                backgroundColor: config?.isSystemConfig ? '#f5f5f5' : 'white',
                cursor: config?.isSystemConfig ? 'not-allowed' : 'text'
              }}
            />
          </Form.Item>

          <Form.Item
            label="激活状态"
            name="isActive"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="激活"
              unCheckedChildren="未激活"
              disabled={config?.isSystemConfig}
              style={{
                cursor: config?.isSystemConfig ? 'not-allowed' : 'pointer'
              }}
            />
          </Form.Item>

          <Divider>配置内容</Divider>

          {/* 类型描述 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.type !== curr.type}>
            {({ getFieldValue }) => {
              const type = getFieldValue('type')
              return (
                <Alert
                  message={getTypeDescription(type)}
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )
            }}
          </Form.Item>

          {/* 代码编辑器 */}
          <Form.Item
            label="配置内容"
            rules={[{ required: true, message: '请输入配置内容' }]}
          >
            <div className="config-editor-wrapper">
              <div className="editor-language-selector">
                <Space>
                  <Text>编辑器类型:</Text>
                  <Select
                    value={editorLanguage}
                    onChange={(value) => setEditorLanguage(value)}
                    style={{ width: 120 }}
                  >
                    <Option value="json">JSON</Option>
                    <Option value="markdown">Markdown</Option>
                  </Select>
                </Space>
              </div>

              <CodeEditor
                value={content}
                onChange={handleContentChange}
                language={editorLanguage}
                height={400}
                onValidate={handleValidationChange}
                showPreview={false}
                placeholder={editorLanguage === 'json'
                  ? '输入JSON格式的配置内容'
                  : '输入Markdown格式的配置内容'
                }
              />
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 预览模态框 */}
      <Modal
        title="配置预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        <Card>
          <div className="config-preview">
            {editorLanguage === 'markdown' ? (
              <div className="markdown-preview-modal">
                <MarkdownRenderer content={content || '内容为空'} />
              </div>
            ) : (
              (() => {
                try {
                  if (!content || content.trim() === '') {
                    return <pre>内容为空</pre>
                  }
                  const parsed = JSON.parse(content)
                  const formatted = JSON.stringify(parsed, null, 2)
                  return (
                    <pre>
                      <code className="language-json">
                        {formatted}
                      </code>
                    </pre>
                  )
                } catch (error) {
                  return (
                    <pre className="error-preview">
                      JSON解析错误: {error instanceof Error ? error.message : '未知错误'}
                    </pre>
                  )
                }
              })()
            )}
          </div>
        </Card>
      </Modal>

      {/* 用户配置导入模态框 */}
      <Modal
        title={
          <Space>
            <UserOutlined />
            <span>从用户目录导入配置</span>
          </Space>
        }
        open={showUserImport}
        onCancel={() => setShowUserImport(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowUserImport(false)}>
            取消
          </Button>
        ]}
        width={600}
      >
        <div className="user-import-content">
          <Alert
            message="从用户目录导入"
            description="从 ~/.claude 目录导入 settings.json 和 CLAUDE.md 等配置文件"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {loadingUserConfigs ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>正在扫描用户配置...</div>
            </div>
          ) : userConfigs.length > 0 ? (
            <List
              dataSource={userConfigs}
              renderItem={(item) => (
                <List.Item
                  key={item.name}
                  actions={[
                    <Button
                      type="primary"
                      size="small"
                      icon={<ImportOutlined />}
                      onClick={() => importUserConfig(item)}
                    >
                      导入
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<FolderOpenOutlined />}
                    title={item.name}
                    description={item.description}
                  />
                </List.Item>
              )}
            />
          ) : (
            <Empty
              description="未找到用户配置文件"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={loadUserConfigs}>
                重新扫描
              </Button>
            </Empty>
          )}
        </div>

        <style>{`
          .user-import-content {
            min-height: 300px;
          }

          .config-editor-wrapper {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .editor-language-selector {
            padding: 8px 0;
          }

          .config-preview {
            background: #f5f5f5;
            border-radius: 4px;
            padding: 16px;
            max-height: 400px;
            overflow: auto;
          }

          .config-preview pre {
            margin: 0;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 13px;
            line-height: 1.4;
            white-space: pre-wrap;
            word-break: break-all;
          }

          .config-preview code.language-json {
            color: #333;
          }

          .config-preview .error-preview {
            color: #f5222d;
            background: #fff2f0;
            border: 1px solid #ffccc7;
            border-radius: 4px;
            padding: 12px;
          }

          .markdown-preview-modal {
            line-height: 1.6;
            color: #333;
          }

          .markdown-preview-modal h1,
          .markdown-preview-modal h2,
          .markdown-preview-modal h3,
          .markdown-preview-modal h4,
          .markdown-preview-modal h5,
          .markdown-preview-modal h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
          }

          .markdown-preview-modal h1:first-child {
            margin-top: 0;
          }

          .markdown-preview-modal pre {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 16px 0;
          }

          .markdown-preview-modal code {
            background: #f5f5f5;
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
          }

          .markdown-preview-modal blockquote {
            border-left: 4px solid #d9d9d9;
            padding-left: 16px;
            margin: 16px 0;
            color: #666;
          }

          .markdown-preview-modal ul,
          .markdown-preview-modal ol {
            margin: 16px 0;
            padding-left: 24px;
          }

          .markdown-preview-modal li {
            margin: 8px 0;
          }

          .markdown-preview-modal table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
          }

          .markdown-preview-modal th,
          .markdown-preview-modal td {
            border: 1px solid #d9d9d9;
            padding: 8px 12px;
            text-align: left;
          }

          .markdown-preview-modal th {
            background: #fafafa;
            font-weight: 600;
          }
        `}</style>
      </Modal>

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
            <strong>警告：</strong>您正在尝试{pendingSystemConfigAction?.action === 'load' ? '读取' : '修改'}系统配置文件
            <code style={{ margin: '0 4px', padding: '2px 6px', background: '#f5f5f5', borderRadius: '4px' }}>
              {config?.name}
            </code>
          </p>
          <p>系统配置文件是应用的核心配置，错误的修改可能导致Claude Code无法正常工作。</p>
          {pendingSystemConfigAction?.action === 'save' && (
            <p><strong>注意：</strong>系统配置文件只能修改现有字段，不能添加新字段。</p>
          )}
          <p>请确认您了解此操作的风险，并确保您知道如何恢复配置。</p>
        </div>
      </Modal>
    </>
  )
}

export default ConfigEditor