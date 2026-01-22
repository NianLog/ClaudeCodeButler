/**
 * 配置编辑器组件
 * 提供配置文件的编辑功能
 */

import React, { useState, useEffect, Suspense } from 'react'
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
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  FolderOpenOutlined,
  UserOutlined
} from '@ant-design/icons'
import { useConfigEditorStore } from '../../store/config-editor-store'
import { useConfigValidationStore } from '../../store/config-validation-store'
import { useMessage } from '../../hooks/useMessage'
import type { ConfigFile } from '@shared/types'
const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
import MarkdownRenderer from '@/components/Common/MarkdownRenderer'
import { useTranslation } from '../../locales/useTranslation'

const { Option } = Select
const { Text } = Typography

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
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const message = useMessage()
  const [content, setContent] = useState('')
  const [isValid, setIsValid] = useState(true)
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
  useConfigValidationStore()

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
  const handleValidationChange = (isValid: boolean, _errors?: string[]) => {
    setIsValid(isValid)
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
        const fieldError = formError as { errorFields?: Array<{ errors: string[] }> }
        console.error('表单验证失败:', fieldError)
        if (fieldError.errorFields && fieldError.errorFields.length > 0) {
          const firstError = fieldError.errorFields[0]
          message.error(t('configEditor.form.validationFailed', { error: firstError.errors[0] }))
        } else {
          message.error(t('configEditor.form.incomplete'))
        }
        return
      }

      if (!isValid) {
        message.error(t('configEditor.content.invalid'))
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
        message.error(t('configEditor.content.parseFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
        return
      }

      // 构建配置数据：分离内容和元数据
      const configData = {
        content: actualContent, // 纯内容
        metadata: { // 元数据
          name: String(values.name || t('configEditor.defaults.unnamed')),
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
            message.success(t('configEditor.save.systemSuccess'))
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
                message.success(t('configEditor.activate.success'))
                console.log('✅ 配置激活成功')
              } else {
                message.error(t('configEditor.activate.failed'))
                console.error('❌ 配置激活失败')
              }
            }
          } catch (error) {
            console.error('激活配置失败:', error)
            message.error(t('configEditor.activate.failedWithError', { error: error instanceof Error ? error.message : t('common.unknownError') }))
          }
        }

        // 非系统配置保存成功后，关闭编辑器触发父组件刷新
        onClose()
      }
    } catch (error) {
      console.error('Save failed:', error)
      message.error(t('configEditor.save.failed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
    } finally {
      setIsSaving(false)
    }
  }

  // 获取类型提示
  const getTypeDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      'claude-code': t('configEditor.typeDesc.claudeCode'),
      'mcp-config': t('configEditor.typeDesc.mcp'),
      'project-config': t('configEditor.typeDesc.project'),
      'user-preferences': t('configEditor.typeDesc.userPreferences')
    }
    return descriptions[type] || t('configEditor.typeDesc.custom')
  }

  return (
    <>
      <Modal
        title={
          <Space>
            {config ? t('configEditor.title.edit') : t('configEditor.title.create')}
            {isValid ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>{t('configEditor.status.valid')}</Tag>
            ) : (
              <Tag color="error" icon={<ExclamationCircleOutlined />}>{t('configEditor.status.invalid')}</Tag>
            )}
          </Space>
        }
        open={visible}
        onCancel={onClose}
        width={900}
        footer={[
          <Button key="cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>,
          <Button
            key="import"
            icon={<ImportOutlined />}
            onClick={() => {
              setShowUserImport(true)
              loadUserConfigs()
            }}
          >
            {t('configEditor.actions.importFromUser')}
          </Button>,
          <Button
            key="preview"
            icon={<EyeOutlined />}
            onClick={handlePreview}
            disabled={!isValid}
          >
            {t('configEditor.actions.preview')}
          </Button>,
          <Button
            key="save"
            type="primary"
            icon={<SaveOutlined />}
            loading={isSaving}
            onClick={handleSave}
            disabled={!isValid}
          >
            {t('common.save')}
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
                label={t('configEditor.fields.name')}
                name="name"
                rules={[{ required: true, message: t('configEditor.fields.nameRequired') }]}
              >
                <Input
                  placeholder={t('configEditor.fields.namePlaceholder')}
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
                label={t('configEditor.fields.type')}
                name="type"
                rules={[{ required: true, message: t('configEditor.fields.typeRequired') }]}
              >
                <Select
                  placeholder={t('configEditor.fields.typePlaceholder')}
                  disabled={config?.isSystemConfig}
                  style={{
                    backgroundColor: config?.isSystemConfig ? '#f5f5f5' : 'white',
                    cursor: config?.isSystemConfig ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Option value="claude-code">{t('configPanel.types.claudeCode')}</Option>
                  <Option value="mcp-config">{t('configPanel.types.mcp')}</Option>
                  <Option value="project-config">{t('configPanel.types.project')}</Option>
                  <Option value="user-preferences">{t('configPanel.types.userPreferences')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={t('configEditor.fields.description')}
            name="description"
          >
            <Input.TextArea
              placeholder={t('configEditor.fields.descriptionPlaceholder')}
              rows={2}
              disabled={config?.isSystemConfig}
              style={{
                backgroundColor: config?.isSystemConfig ? '#f5f5f5' : 'white',
                cursor: config?.isSystemConfig ? 'not-allowed' : 'text'
              }}
            />
          </Form.Item>

          <Form.Item
            label={t('configEditor.fields.active')}
            name="isActive"
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t('configEditor.fields.activeOn')}
              unCheckedChildren={t('configEditor.fields.activeOff')}
              disabled={config?.isSystemConfig}
              style={{
                cursor: config?.isSystemConfig ? 'not-allowed' : 'pointer'
              }}
            />
          </Form.Item>

          <Divider>{t('configEditor.content.title')}</Divider>

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
            label={t('configEditor.content.label')}
            rules={[{ required: true, message: t('configEditor.content.required') }]}
          >
            <div className="config-editor-wrapper">
              <div className="editor-language-selector">
                <Space>
                  <Text>{t('configEditor.editor.type')}</Text>
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

              <Suspense fallback={<Spin size="large" />}>
                <CodeEditor
                  value={content}
                  onChange={handleContentChange}
                  language={editorLanguage}
                  height={400}
                  onValidate={handleValidationChange}
                  showPreview={false}
                  placeholder={editorLanguage === 'json'
                    ? t('configEditor.content.jsonPlaceholder')
                    : t('configEditor.content.mdPlaceholder')
                  }
                />
              </Suspense>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* 预览模态框 */}
      <Modal
        title={t('configEditor.preview.title')}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={800}
      >
        <Card>
          <div className="config-preview">
            {editorLanguage === 'markdown' ? (
              <div className="markdown-preview-modal">
                <MarkdownRenderer content={content || t('configEditor.preview.empty')} />
              </div>
            ) : (
              (() => {
                try {
                  if (!content || content.trim() === '') {
                    return <pre>{t('configEditor.preview.empty')}</pre>
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
                      {t('configEditor.preview.jsonError', { error: error instanceof Error ? error.message : t('common.unknownError') })}
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
            <span>{t('configEditor.userImport.title')}</span>
          </Space>
        }
        open={showUserImport}
        onCancel={() => setShowUserImport(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowUserImport(false)}>
            {t('common.cancel')}
          </Button>
        ]}
        width={600}
      >
        <div className="user-import-content">
          <Alert
            message={t('configEditor.userImport.alertTitle')}
            description={t('configEditor.userImport.alertDesc')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {loadingUserConfigs ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>{t('configEditor.userImport.scanning')}</div>
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
                      {t('configEditor.userImport.import')}
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
              description={t('configEditor.userImport.empty')}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" onClick={loadUserConfigs}>
                {t('configEditor.userImport.rescan')}
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
        title={t('configEditor.systemConfirm.title')}
        open={systemConfigConfirmVisible}
        onOk={handleSystemConfigConfirm}
        onCancel={handleSystemConfigCancel}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '16px 0' }}>
          <p>
            <strong>{t('configEditor.systemConfirm.warningLabel')}</strong>{t('configEditor.systemConfirm.action', { action: pendingSystemConfigAction?.action === 'load' ? t('configEditor.systemConfirm.actionLoad') : t('configEditor.systemConfirm.actionSave') })}
            <code style={{ margin: '0 4px', padding: '2px 6px', background: '#f5f5f5', borderRadius: '4px' }}>
              {config?.name}
            </code>
          </p>
          <p>{t('configEditor.systemConfirm.risk')}</p>
          {pendingSystemConfigAction?.action === 'save' && (
            <p><strong>{t('configEditor.systemConfirm.noteLabel')}</strong>{t('configEditor.systemConfirm.note')}</p>
          )}
          <p>{t('configEditor.systemConfirm.confirm')}</p>
        </div>
      </Modal>
    </>
  )
}

export default ConfigEditor