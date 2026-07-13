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
import { useEditorSettings } from '../../store/settings-store'
import { useMessage } from '../../hooks/useMessage'
import type { ConfigFile } from '@shared/types'
import {
  applyResolvedTemplateIfUntouched,
  normalizeNewConfigTemplate
} from '@shared/config-template'
import {
  type EditorLanguage,
  resolveConfigEditorLanguage
} from '../../utils/config-editor-utils'
const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
import MarkdownRenderer from '@/components/Common/MarkdownRenderer'
import { useTranslation } from '../../locales/useTranslation'

const { Option } = Select
const { Text } = Typography

/**
 * 清理 JSON 输入中的控制字符
 * @param rawContent 原始编辑器内容
 * @returns 去除控制字符后的字符串
 */
const sanitizeJsonInput = (rawContent: string): string => {
  return Array.from(rawContent)
    .filter((character) => {
      const codePoint = character.charCodeAt(0)
      return !((codePoint >= 0 && codePoint <= 31) || (codePoint >= 127 && codePoint <= 159))
    })
    .join('')
}

/**
 * 配置保存载荷：分离纯内容和元数据
 */
export interface ConfigSavePayload {
  content: unknown
  metadata: {
    name: string
    description: string
    type: string
    isActive: boolean
  }
}

/**
 * 配置编辑器属性
 */
interface ConfigEditorProps {
  visible: boolean
  config?: ConfigFile | null
  mode?: 'create' | 'edit' | 'duplicate'
  initialDraft?: ConfigEditorDraft | null
  onClose: () => void
  onSave: (configData: ConfigSavePayload) => Promise<void>
}

/**
 * 配置编辑器初始化草稿
 */
export interface ConfigEditorDraft {
  /** 配置名称 */
  name: string
  /** 配置描述 */
  description?: string
  /** 配置类型 */
  type: string
  /** 是否激活 */
  isActive?: boolean
  /** 初始内容 */
  content: unknown
  /** 初始语言 */
  language?: EditorLanguage
}

/**
 * 配置编辑器组件
 */
const ConfigEditor: React.FC<ConfigEditorProps> = ({
  visible,
  config,
  mode = 'create',
  initialDraft,
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
  const [userConfigs, setUserConfigs] = useState<Array<Record<string, unknown>>>([])
  const [loadingUserConfigs, setLoadingUserConfigs] = useState(false)
  const [editorLanguage, setEditorLanguage] = useState<EditorLanguage>('json')
  const [systemConfigConfirmVisible, setSystemConfigConfirmVisible] = useState(false)
  const [pendingSystemConfigAction, setPendingSystemConfigAction] = useState<{
    action: 'load' | 'save'
    callback: () => void
  } | null>(null)

  const { editorContent, loadConfigContent } = useConfigEditorStore()
  const editorSettings = useEditorSettings()
  useConfigValidationStore()

  // 初始化表单数据
  useEffect(() => {
    let cancelled = false
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
      } else if (initialDraft) {
        const language = initialDraft.language || resolveConfigEditorLanguage({
          type: initialDraft.type,
          name: initialDraft.name,
          path: initialDraft.name
        })
        const initialContent = typeof initialDraft.content === 'string'
          ? initialDraft.content
          : JSON.stringify(initialDraft.content ?? {}, null, 2)

        form.setFieldsValue({
          name: initialDraft.name || '',
          description: initialDraft.description || '',
          type: initialDraft.type || 'claude-code',
          isActive: Boolean(initialDraft.isActive)
        })
        setContent(initialContent)
        setEditorLanguage(language)
      } else {
        // 新建模式
        const fallbackContent = normalizeNewConfigTemplate(editorSettings.defaultConfigTemplate)
        form.setFieldsValue({
          name: '',
          description: '',
          type: 'claude-code',
          isActive: false
        })
        setContent(fallbackContent)
        setEditorLanguage('json')

        // v1.5.0：由 main process 统一解析 USER_OVERRIDE > REGISTRY > EMBEDDED ownership。
        void window.electronAPI.toolRegistry.resolveArtifactTemplate('claude-code', 'user-settings')
          .then((response) => {
            if (!cancelled && response.success && response.data) {
              setContent((currentContent) =>
                applyResolvedTemplateIfUntouched(
                  currentContent,
                  fallbackContent,
                  response.data?.effectiveTemplate ?? currentContent
                )
              )
            }
          })
          .catch((error) => {
            console.warn('加载 artifact-specific template 失败，使用 legacy fallback:', error)
          })
      }
    }

    return () => {
      cancelled = true
    }
  }, [visible, config, initialDraft, form, loadConfigContent, editorSettings.defaultConfigTemplate])

  // 从store的editorContent加载内容（统一架构：只处理纯内容）
  useEffect(() => {
    if (config && visible && editorContent) {
      // 统一处理：editorContent已经是纯内容，不再包含元数据
      let contentStr: string
      let language: EditorLanguage = resolveConfigEditorLanguage(config)

      if (typeof editorContent === 'string') {
        // 字符串内容（MD文件）
        contentStr = editorContent
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
        const data = (response as { data?: Array<Record<string, unknown>> }).data || []
        setUserConfigs(data)
      } else {
        console.error('加载用户配置失败:', (response as { error?: unknown }).error)
      }
    } catch (error) {
      console.error('加载用户配置失败:', error)
    } finally {
      setLoadingUserConfigs(false)
    }
  }

  // 导入用户配置
  const importUserConfig = (userConfig: Record<string, unknown>) => {
    try {
      let contentStr: string
      let language: 'json' | 'markdown' = 'json'

      const configType = String(userConfig.type ?? '')
      const configContent = userConfig.content

      // 根据配置类型判断内容格式
      if (configType === 'user-preferences' || configType === 'claude-md') {
        // MD文件：确保内容是字符串
        contentStr = typeof configContent === 'string' ? configContent : String(configContent || '')
        language = 'markdown'
      } else {
        // JSON文件：序列化内容
        contentStr = typeof configContent === 'string' ? configContent : JSON.stringify(configContent ?? {}, null, 2)
        language = 'json'
      }

      setContent(contentStr)
      setEditorLanguage(language)
      form.setFieldsValue({
        name: `导入_${String(userConfig.name ?? '')}`,
        description: userConfig.description as string | undefined,
        type: configType
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
        values = await form.validateFields() as {
          name?: string
          description?: string
          type?: string
          isActive?: boolean
        }
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
      let actualContent: unknown
      try {
        if (editorLanguage === 'markdown') {
          // Markdown文件直接存储为字符串内容
          actualContent = content
        } else {
          // JSON配置解析
          const cleanContent = sanitizeJsonInput(content)
          actualContent = JSON.parse(cleanContent)
        }
      } catch (error) {
        console.error('内容解析失败:', error)
        message.error(t('configEditor.content.parseFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
        return
      }

      // 构建配置数据：分离内容和元数据
      const configData: ConfigSavePayload = {
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
            {config
              ? t('configEditor.title.edit')
              : mode === 'duplicate'
                ? t('configEditor.title.duplicate')
                : t('configEditor.title.create')}
            {isValid ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>{t('configEditor.status.valid')}</Tag>
            ) : (
              <Tag color="error" icon={<ExclamationCircleOutlined />}>{t('configEditor.status.invalid')}</Tag>
            )}
          </Space>
        }
        open={visible}
        onCancel={onClose}
        destroyOnHidden
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
                    backgroundColor: config?.isSystemConfig ? 'var(--bg-elevated)' : 'var(--bg-input)',
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
                    backgroundColor: config?.isSystemConfig ? 'var(--bg-elevated)' : 'var(--bg-input)',
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
                backgroundColor: config?.isSystemConfig ? 'var(--bg-elevated)' : 'var(--bg-input)',
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
                  key={String(item.name ?? '')}
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
                    title={String(item.name ?? '')}
                    description={item.description as string | undefined}
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
            background: var(--bg-input);
            border-radius: var(--radius-sm);
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
            color: var(--text-primary);
          }

          .config-preview .error-preview {
            color: var(--red);
            background: color-mix(in srgb, var(--red) 12%, transparent);
            border: 1px solid var(--red);
            border-radius: var(--radius-sm);
            padding: 12px;
          }

          .markdown-preview-modal {
            line-height: 1.6;
            color: var(--text-primary);
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
            background: var(--bg-input);
            padding: 16px;
            border-radius: var(--radius-sm);
            overflow-x: auto;
            margin: 16px 0;
          }

          .markdown-preview-modal code {
            background: var(--bg-input);
            padding: 2px 4px;
            border-radius: var(--radius-sm);
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.9em;
          }

          .markdown-preview-modal blockquote {
            border-left: 4px solid var(--border-light);
            padding-left: 16px;
            margin: 16px 0;
            color: var(--text-secondary);
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
            border: 1px solid var(--border-light);
            padding: 8px 12px;
            text-align: left;
          }

          .markdown-preview-modal th {
            background: var(--bg-elevated);
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
            <code style={{ margin: '0 4px', padding: '2px 6px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
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
