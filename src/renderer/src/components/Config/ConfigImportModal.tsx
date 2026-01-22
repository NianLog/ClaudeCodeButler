/**
 * 配置导入模态框组件
 * 提供配置文件的导入功能
 */

import React, { useState } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Upload,
  Button,
  Typography,
  Alert,
  Steps,
  Card,
  Divider,
  Progress
} from 'antd'
import {
  InboxOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  EyeOutlined
} from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import type { ConfigFile } from '@shared/types'
import { useTranslation } from '../../locales/useTranslation'

const { TextArea } = Input
const { Option } = Select
const { Title, Paragraph } = Typography
const { Dragger } = Upload
const { Step } = Steps

/**
 * 配置导入模态框属性
 */
interface ConfigImportModalProps {
  visible: boolean
  onClose: () => void
  onImport: (configData: Partial<ConfigFile>) => Promise<void>
}

/**
 * 导入数据类型
 */
interface ImportData {
  name: string
  description: string
  type: string
  content: any
  isValid: boolean
  error?: string
}

/**
 * 配置导入模态框组件
 */
const ConfigImportModal: React.FC<ConfigImportModalProps> = ({
  visible,
  onClose,
  onImport
}) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [currentStep, setCurrentStep] = useState(0)
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])

  // 重置状态
  const resetState = () => {
    setCurrentStep(0)
    setImportData(null)
    setFileList([])
    form.resetFields()
  }

  // 处理模态框关闭
  const handleClose = () => {
    resetState()
    onClose()
  }

  // 处理文件上传
  const handleFileUpload: UploadProps['beforeUpload'] = async (file) => {
    try {
      setIsLoading(true)
      const text = await file.text()
      const parsedContent = JSON.parse(text)

      // 检查是否为多层JSON格式
      let actualContent = parsedContent
      let configName = file.name.replace(/\.json$/i, '')
      let configDescription = t('configImport.defaults.fromFile', { file: file.name })
      let configType = 'claude-code'

      if (parsedContent && typeof parsedContent === 'object') {
        // 如果是多层JSON格式（包含name, type, content字段）
        if (parsedContent.name && parsedContent.type && parsedContent.content !== undefined) {
          actualContent = parsedContent.content
          configName = parsedContent.name
          configDescription = parsedContent.description || configDescription
          configType = parsedContent.type
        } else {
          // 普通JSON格式，自动检测类型
          configType = detectConfigType(parsedContent)
        }
      }

      const data: ImportData = {
        name: configName,
        description: configDescription,
        type: configType,
        content: actualContent,
        isValid: true
      }

      setImportData(data)
      form.setFieldsValue({
        name: data.name,
        description: data.description,
        type: data.type
      })

      setCurrentStep(1)
    } catch (error) {
      const data: ImportData = {
        name: '',
        description: '',
        type: 'claude-code',
        content: null,
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      }
      setImportData(data)
    } finally {
      setIsLoading(false)
    }

    return false // 阻止默认上传行为
  }

  // 自动检测配置类型
  const detectConfigType = (content: any): string => {
    if (typeof content !== 'object' || content === null) {
      return 'claude-code'
    }

    // 检测MCP配置
    if (content.mcpServers || content.servers) {
      return 'mcp-config'
    }

    // 检测项目配置
    if (content.projects || content.workspace) {
      return 'project-config'
    }

    // 检测用户偏好
    if (content.preferences || content.settings || content.theme) {
      return 'user-preferences'
    }

    // 默认为Claude Code配置
    return 'claude-code'
  }

  // 处理手动输入JSON
  const handleManualInput = () => {
    setCurrentStep(2)
  }

  // 处理JSON内容变化
  const handleJsonContentChange = (value: string) => {
    try {
      const parsedContent = JSON.parse(value)
      
      // 检查是否为多层JSON格式
      let actualContent = parsedContent
      let configType = 'claude-code'

      if (parsedContent && typeof parsedContent === 'object') {
        // 如果是多层JSON格式（包含name, type, content字段）
        if (parsedContent.name && parsedContent.type && parsedContent.content !== undefined) {
          actualContent = parsedContent.content
          configType = parsedContent.type
        } else {
          // 普通JSON格式，自动检测类型
          configType = detectConfigType(parsedContent)
        }
      }

      setImportData({
        name: form.getFieldValue('name') || t('configImport.defaults.manualName'),
        description: form.getFieldValue('description') || t('configImport.defaults.manualDescription'),
        type: configType,
        content: actualContent,
        isValid: true
      })

      form.setFieldsValue({ type: configType })
    } catch (error) {
      setImportData({
        name: form.getFieldValue('name') || '',
        description: form.getFieldValue('description') || '',
        type: form.getFieldValue('type') || 'claude-code',
        content: null,
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // 预览配置
  const handlePreview = () => {
    if (importData && importData.isValid) {
      // 可以打开预览模态框
      console.log('Preview config:', importData)
    }
  }

  // 确认导入
  const handleImport = async () => {
    try {
      const values = await form.validateFields()

      if (!importData || !importData.isValid) {
        return
      }

      const configData: Partial<ConfigFile> = {
        name: values.name,
        description: values.description,
        type: values.type,
        content: importData.content,
        isActive: false
      }

      await onImport(configData)
      handleClose()
    } catch (error) {
      console.error('Import failed:', error)
    }
  }

  // 渲染文件上传步骤
  const renderFileUpload = () => (
    <div className="import-file-upload">
      <Title level={4}>{t('configImport.file.title')}</Title>
      <Paragraph type="secondary">{t('configImport.file.desc')}</Paragraph>

      <Dragger
        name="configFile"
        accept=".json"
        beforeUpload={handleFileUpload}
        fileList={fileList}
        onRemove={() => {
          setFileList([])
          setImportData(null)
        }}
        showUploadList={false}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{t('configImport.file.dragText')}</p>
        <p className="ant-upload-hint">
          {t('configImport.file.hint')}
        </p>
      </Dragger>

      <Divider>{t('configImport.file.or')}</Divider>

      <Button
        type="default"
        icon={<FileTextOutlined />}
        onClick={handleManualInput}
        block
      >
        {t('configImport.file.manualButton')}
      </Button>
    </div>
  )

  // 渲染配置确认步骤
  const renderConfigConfirm = () => (
    <div className="import-config-confirm">
      <Title level={4}>{t('configImport.confirm.title')}</Title>

      {importData?.isValid ? (
        <Alert
          message={t('configImport.confirm.parseSuccess')}
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          message={t('configImport.confirm.parseFailed')}
          description={importData?.error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          label={t('configImport.fields.name')}
          name="name"
          rules={[{ required: true, message: t('configImport.fields.nameRequired') }]}
        >
          <Input placeholder={t('configImport.fields.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          label={t('configImport.fields.type')}
          name="type"
          rules={[{ required: true, message: t('configImport.fields.typeRequired') }]}
        >
          <Select placeholder={t('configImport.fields.typePlaceholder')}>
            <Option value="claude-code">{t('configImport.types.claudeCode')}</Option>
            <Option value="mcp-config">{t('configImport.types.mcp')}</Option>
            <Option value="project-config">{t('configImport.types.project')}</Option>
            <Option value="user-preferences">{t('configImport.types.userPreferences')}</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={t('configImport.fields.description')}
          name="description"
        >
          <TextArea
            placeholder={t('configImport.fields.descriptionPlaceholder')}
            rows={3}
          />
        </Form.Item>
      </Form>

      {importData?.isValid && (
        <Card
          title={t('configImport.preview.title')}
          size="small"
          extra={
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={handlePreview}
            >
              {t('configImport.preview.detail')}
            </Button>
          }
        >
          <pre className="config-preview">
            {JSON.stringify(importData.content, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  )

  // 渲染手动输入步骤
  const renderManualInput = () => (
    <div className="import-manual-input">
      <Title level={4}>{t('configImport.manual.title')}</Title>
      <Paragraph type="secondary">{t('configImport.manual.desc')}</Paragraph>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          type: 'claude-code'
        }}
      >
        <Form.Item
          label={t('configImport.fields.name')}
          name="name"
          rules={[{ required: true, message: t('configImport.fields.nameRequired') }]}
        >
          <Input placeholder={t('configImport.fields.namePlaceholder')} />
        </Form.Item>

        <Form.Item
          label={t('configImport.fields.type')}
          name="type"
          rules={[{ required: true, message: t('configImport.fields.typeRequired') }]}
        >
          <Select placeholder={t('configImport.fields.typePlaceholder')}>
            <Option value="claude-code">{t('configImport.types.claudeCode')}</Option>
            <Option value="mcp-config">{t('configImport.types.mcp')}</Option>
            <Option value="project-config">{t('configImport.types.project')}</Option>
            <Option value="user-preferences">{t('configImport.types.userPreferences')}</Option>
          </Select>
        </Form.Item>

        <Form.Item
          label={t('configImport.manual.jsonContent')}
        >
          <TextArea
            placeholder={t('configImport.manual.jsonPlaceholder')}
            rows={12}
            onChange={(e) => handleJsonContentChange(e.target.value)}
            className={`json-input ${importData?.isValid === false ? 'error' : ''}`}
          />
        </Form.Item>

        {importData?.error && (
          <Alert
            message={importData.error}
            type="error"
            showIcon
          />
        )}
      </Form>
    </div>
  )

  return (
    <Modal
      title={t('configImport.title')}
      open={visible}
      onCancel={handleClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="back"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          {t('configImport.back')}
        </Button>,
        <Button
          key="next"
          type="primary"
          onClick={() => {
            if (currentStep === 1) {
              handleImport()
            } else if (currentStep === 2) {
              setCurrentStep(1)
            }
          }}
          disabled={!importData?.isValid}
          loading={isLoading}
        >
          {currentStep === 1 ? t('configImport.import') : t('configImport.next')}
        </Button>
      ]}
    >
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        <Step title={t('configImport.steps.selectFile')} icon={<InboxOutlined />} />
        <Step title={t('configImport.steps.confirmInfo')} icon={<CheckCircleOutlined />} />
        <Step title={t('configImport.steps.manualInput')} icon={<FileTextOutlined />} />
      </Steps>

      <div className="import-content">
        {currentStep === 0 && renderFileUpload()}
        {currentStep === 1 && renderConfigConfirm()}
        {currentStep === 2 && renderManualInput()}
      </div>

      {isLoading && (
        <div className="import-loading">
          <Progress percent={100} status="active" showInfo={false} />
        </div>
      )}

      <style>{`
        .import-content {
          min-height: 400px;
        }

        .config-preview {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          font-size: 12px;
          overflow-x: auto;
          max-height: 200px;
          overflow-y: auto;
        }

        .json-input.error {
          border-color: #ff4d4f !important;
        }

        .import-loading {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 16px;
        }
      `}</style>
    </Modal>
  )
}

export default ConfigImportModal