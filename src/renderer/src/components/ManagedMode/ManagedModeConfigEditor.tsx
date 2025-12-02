/**
 * 托管模式配置编辑器
 * @description 针对托管模式的专用配置编辑器，支持GUI和JSON源视图模式
 */

import React, { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  Typography,
  Divider,
  Alert,
  Row,
  Col,
  Select,
  Tooltip,
  message,
  Tabs,
  Badge
} from 'antd'
import {
  SaveOutlined,
  CopyOutlined,
  ReloadOutlined,
  SettingOutlined,
  EyeOutlined,
  CodeOutlined,
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LockOutlined,
  UnlockOutlined,
  ApiOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons'
import { useConfigListStore } from '../../store/config-list-store'
import type { ConfigFile, ManagedModeConfig } from '@shared/types'
import CodeEditor from '../Common/CodeEditor'
import './ManagedModeConfigEditor.css'

const { TextArea } = Input
const { Option } = Select
const { Title, Text, Paragraph } = Typography

/**
 * 托管模式配置编辑器属性
 */
interface ManagedModeConfigEditorProps {
  managedModeConfig: ManagedModeConfig | null
  configs: ConfigFile[]
  onConfigChange: (config: any) => void
  onRestartService: () => Promise<void>
}

/**
 * 生成基于配置内容的稳定MD5 ID
 * @description 使用配置的name、apiBaseUrl、apiKey拼接后计算MD5，确保ID稳定
 */
const generateStableConfigId = (name: string, apiBaseUrl: string, apiKey: string): string => {
  const content = `${name}|${apiBaseUrl}|${apiKey}`
  const hash = Array.from(new TextEncoder().encode(content))
    .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')

  // 简化版MD5（使用Web Crypto API的SHA-256代替，因为浏览器环境更容易实现）
  // 但为了保持简单，这里使用一个简单的哈希算法
  let hashValue = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hashValue = ((hashValue << 5) - hashValue) + char
    hashValue = hashValue & hashValue // Convert to 32bit integer
  }
  return Math.abs(hashValue).toString(16).padStart(8, '0')
}

/**
 * 托管模式配置编辑器组件
 */
const ManagedModeConfigEditor: React.FC<ManagedModeConfigEditorProps> = ({
  managedModeConfig,
  configs,
  onConfigChange,
  onRestartService
}) => {
  // 状态管理
  const [configMode, setConfigMode] = useState<'gui' | 'json'>('gui')
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [jsonContent, setJsonContent] = useState('')
  const [debugMode, setDebugMode] = useState(false)
  const [networkProxyEnabled, setNetworkProxyEnabled] = useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState<string>('') // 稳定的provider ID（格式：config-{hash}）
  const [accessToken, setAccessToken] = useState('')
  const [servicePort, setServicePort] = useState(8487)
  const [customFields, setCustomFields] = useState<Array<{ key: string; value: any; type: string }>>([])
  const [networkProxyHost, setNetworkProxyHost] = useState('127.0.0.1')
  const [networkProxyPort, setNetworkProxyPort] = useState(8080)
  const [localProviders, setLocalProviders] = useState<ApiProvider[]>([]) // 本地providers列表

  // 初始化标记：确保只初始化一次，防止无限刷新
  const hasInitialized = React.useRef(false)

  // 从托管模式配置的 providers 列表获取可选配置（优先使用本地状态）
  const availableProviders = localProviders.length > 0 ? localProviders : (managedModeConfig?.providers || [])

  // 监听managedModeConfig变化，初始化表单和JSON编辑器（仅初始化一次，不做实时同步）
  useEffect(() => {
    // 只在第一次挂载且数据可用时初始化，防止无限刷新
    if (!hasInitialized.current && managedModeConfig && availableProviders.length > 0) {
      hasInitialized.current = true  // 标记已初始化，防止重复执行
      console.log('=== 开始初始化托管模式配置（仅执行一次） ===')
      console.log('managedModeConfig:', managedModeConfig)
      console.log('availableProviders数量:', availableProviders.length)

      // 初始化表单数据
      setServicePort(managedModeConfig.port || 8487)
      setAccessToken(managedModeConfig.accessToken || '')
      setDebugMode(managedModeConfig.logging?.enabled || false)

      // 初始化当前选择的 provider ID（直接使用 currentProvider）
      const initialProviderId = managedModeConfig.currentProvider || ''
      setSelectedProviderId(initialProviderId)
      console.log('初始currentProvider:', initialProviderId)

      // 初始化网络代理配置
      if (managedModeConfig.networkProxy) {
        setNetworkProxyEnabled(managedModeConfig.networkProxy.enabled || false)
        setNetworkProxyHost(managedModeConfig.networkProxy.host || '127.0.0.1')
        setNetworkProxyPort(managedModeConfig.networkProxy.port || 8080)
      }

      // 初始化配置内容
      const initialConfig = managedModeConfig.configData || {
        env: {
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${managedModeConfig.port || 8487}`,
          ANTHROPIC_AUTH_TOKEN: managedModeConfig.accessToken || '',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
        },
        permissions: {
          defaultMode: 'bypassPermissions'
        },
        statusLine: {
          type: 'command',
          command: 'ccline',
          padding: 0
        }
      }

      // 提取自定义字段
      const standardFields = ['env', 'permissions', 'statusLine']
      const initialCustomFields: Array<{ key: string; value: any; type: string }> = []

      Object.keys(initialConfig).forEach(key => {
        if (!standardFields.includes(key)) {
          const value = initialConfig[key]
          const type = Array.isArray(value) ? 'array' : typeof value
          initialCustomFields.push({
            key,
            value: typeof value === 'object' ? JSON.stringify(value) : String(value),
            type
          })
        }
      })

      if (initialCustomFields.length > 0) {
        setCustomFields(initialCustomFields)
        console.log('初始化自定义字段:', initialCustomFields)
      } else {
        setCustomFields([])
      }

      setJsonContent(JSON.stringify(initialConfig, null, 2))
      form.setFieldsValue(initialConfig)

      console.log('=== 初始化完成 ===')
    }
  }, [])  // 空依赖数组：仅在组件挂载时执行一次，防止无限刷新

  /**
   * 处理配置切换
   * @description 简化版：直接切换到选中的 provider，不需要读取配置文件或添加 provider（providers 由后端自动同步）
   */
  const handleConfigSwitch = async (providerId: string) => {
    setSelectedProviderId(providerId)

    if (!providerId) return

    try {
      setLoading(true)

      // 找到选中的 provider
      const selectedProvider = availableProviders.find(p => p.id === providerId)
      if (!selectedProvider) {
        message.error('未找到选中的配置')
        return
      }

      // 切换到该provider（会自动重启服务）
      await window.electronAPI.managedMode.switchProvider(providerId)

      message.success(`已切换到配置: ${selectedProvider.name}，服务正在重启`)

      // 等待服务重启完成后刷新状态
      setTimeout(() => {
        onRestartService()
      }, 1000)
    } catch (error) {
      console.error('切换配置失败:', error)
      message.error('切换配置失败')
    } finally {
      setLoading(false)
    }
  }

  /**
   * 处理下拉框显示/隐藏
   * @description 每次打开下拉框时重新同步providers列表
   */
  const handleDropdownOpen = async (open: boolean) => {
    if (open) {
      try {
        // 打开下拉框时重新同步providers
        const result = await window.electronAPI.managedMode.syncProviders()
        if (result.success && result.config) {
          // 更新本地providers列表
          setLocalProviders(result.config.providers || [])
          console.log('下拉框打开：已同步providers列表', result.config.providers?.length)
        }
      } catch (error) {
        console.error('同步providers失败:', error)
      }
    }
  }

  /**
   * 生成访问令牌
   */
  const generateAccessToken = () => {
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const newToken = `ccb-sk-${randomPart}`
    setAccessToken(newToken)

    // 更新JSON配置中的令牌
    updateConfigField('env.ANTHROPIC_AUTH_TOKEN', newToken)
  }

  /**
   * 更新配置字段
   */
  const updateConfigField = (fieldPath: string, value: any) => {
    const config = { ...form.getFieldsValue() }
    const pathParts = fieldPath.split('.')

    let current = config
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) {
        current[pathParts[i]] = {}
      }
      current = current[pathParts[i]]
    }

    current[pathParts[pathParts.length - 1]] = value
    form.setFieldsValue(config)
    setJsonContent(JSON.stringify(cleanEmptyFields(config), null, 2))
  }

  /**
   * 清理空字段
   */
  const cleanEmptyFields = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    const cleaned: any = {}
    for (const key in obj) {
      const value = obj[key]
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'object') {
          const cleanedValue = cleanEmptyFields(value)
          if (Object.keys(cleanedValue).length > 0) {
            cleaned[key] = cleanedValue
          }
        } else {
          cleaned[key] = value
        }
      }
    }
    return cleaned
  }

  /**
   * 添加自定义字段
   */
  const addCustomField = () => {
    const newField = {
      key: '',
      value: '',
      type: 'string'
    }
    setCustomFields([...customFields, newField])
  }

  /**
   * 删除自定义字段
   */
  const removeCustomField = (index: number) => {
    const updatedFields = customFields.filter((_, i) => i !== index)
    setCustomFields(updatedFields)
  }

  /**
   * 更新自定义字段
   */
  const updateCustomField = (index: number, field: string, value: any) => {
    const updatedFields = [...customFields]
    updatedFields[index] = { ...updatedFields[index], [field]: value }
    setCustomFields(updatedFields)
  }

  /**
   * 处理配置保存（手动保存机制）
   * @description 用户点击保存按钮时触发：
   * 1. 根据当前模式（GUI/JSON）读取配置
   * 2. GUI模式：从表单构建配置，并同步更新JSON视图
   * 3. JSON模式：解析JSON，并同步更新表单和自定义字段
   * 4. 保存配置到后端
   * 5. 触发服务重启和settings覆写
   * 6. 提示用户需要重启CC终端
   */
  const handleSave = async () => {
    setLoading(true)
    try {
      let configData: any

      if (configMode === 'gui') {
        // GUI模式：从表单和自定义字段构建配置
        const formData = form.getFieldsValue(true)

        // 只包含标准字段，确保删除的自定义字段不会残留
        configData = {
          env: {
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${servicePort}`,
            ANTHROPIC_AUTH_TOKEN: accessToken,
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
            ...formData.env
          },
          permissions: formData.permissions || {
            defaultMode: 'bypassPermissions'
          },
          statusLine: formData.statusLine || {
            type: 'command',
            command: 'ccline',
            padding: 0
          }
        }

        // 只添加当前customFields中的字段（删除的字段不会被添加）
        customFields.forEach(field => {
          if (field.key && field.value) {
            try {
              // 尝试解析JSON字符串
              configData[field.key] = JSON.parse(field.value)
            } catch {
              // 如果解析失败，保持原始字符串
              configData[field.key] = field.value
            }
          }
        })

        console.log('GUI模式保存：构建的配置数据（只包含标准字段和当前自定义字段）', configData)

        // 同步更新JSON视图
        setJsonContent(JSON.stringify(configData, null, 2))
        console.log('GUI模式保存：已同步更新JSON视图')
      } else {
        // JSON模式：解析JSON内容
        try {
          configData = JSON.parse(jsonContent)
        } catch (error: any) {
          message.error(`JSON格式错误: ${error.message}`)
          return
        }

        // 同步更新表单
        form.setFieldsValue(configData)

        // 提取并更新自定义字段
        const standardFields = ['env', 'permissions', 'statusLine']
        const extractedCustomFields: Array<{ key: string; value: any; type: string }> = []

        Object.keys(configData).forEach(key => {
          if (!standardFields.includes(key)) {
            const value = configData[key]
            const type = Array.isArray(value) ? 'array' : typeof value
            extractedCustomFields.push({
              key,
              value: typeof value === 'object' ? JSON.stringify(value) : String(value),
              type
            })
          }
        })

        setCustomFields(extractedCustomFields)
        console.log('JSON模式保存：已同步更新表单和自定义字段', extractedCustomFields)
      }

      // 确保必填字段
      if (!configData.env) {
        configData.env = {}
      }

      configData.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${servicePort}`
      configData.env.ANTHROPIC_AUTH_TOKEN = accessToken

      // 构建完整的托管模式配置
      const completeConfig = {
        port: servicePort,
        accessToken: accessToken,
        logging: {
          enabled: debugMode,
          level: debugMode ? 'debug' : 'info'
        },
        // 使用稳定的provider ID，如果为空则保留原有的currentProvider
        currentProvider: selectedProviderId || managedModeConfig?.currentProvider || '',
        networkProxy: {
          enabled: networkProxyEnabled,
          host: networkProxyHost,
          port: networkProxyPort
        },
        configData
      }

      console.log('保存配置数据:', { completeConfig, configData })

      // 调用配置变更处理（包含状态同步和服务重启）
      await onConfigChange(completeConfig)

      // 显示成功消息并提醒用户
      message.success({
        content: (
          <div>
            <div>托管模式配置已保存并重启服务</div>
            <div style={{ fontSize: '12px', marginTop: '8px', color: '#faad14' }}>
              ⚠️ 重要提示：配置已更新settings.json，请在所有使用此配置的Claude Code终端中执行重启命令，新配置才能生效。
            </div>
          </div>
        ),
        duration: 6 // 显示6秒
      })
    } catch (error: any) {
      console.error('保存配置失败:', error)
      message.error(`保存失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 复制配置到剪贴板
   */
  const copyConfig = async () => {
    try {
      const config = configMode === 'gui' ? form.getFieldsValue() : JSON.parse(jsonContent)
      await navigator.clipboard.writeText(JSON.stringify(cleanEmptyFields(config), null, 2))
      message.success('配置已复制到剪贴板')
    } catch (error) {
      message.error('复制失败')
    }
  }

  /**
   * 处理JSON内容变化（仅更新JSON状态，不触发自动同步）
   * @description 用户编辑JSON时，只更新JSON内容状态，不同步到GUI。同步操作只在保存时进行。
   */
  const handleJsonContentChange = (value: string) => {
    setJsonContent(value)
  }

  /**
   * 渲染GUI模式编辑器
   */
  const renderGuiEditor = () => (
    <div className="managed-mode-gui-editor">
      <Form form={form} layout="vertical">
        {/* 环境变量配置 */}
        <Card
          title={
            <Space>
              <ApiOutlined />
              <span>环境变量 (env)</span>
              <Badge status="processing" text="必填" />
            </Space>
          }
          className="config-section"
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    <span>ANTHROPIC_BASE_URL</span>
                    <Tooltip title="代理服务的基础URL">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
              >
                <Input
                  value={`http://127.0.0.1:${servicePort}`}
                  disabled
                  addonAfter={
                    <Tooltip title="端口号可在基础配置中修改">
                      <SettingOutlined />
                    </Tooltip>
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    <span>ANTHROPIC_AUTH_TOKEN</span>
                    <Tooltip title="访问令牌，用于验证托管服务请求">
                      <SafetyCertificateOutlined />
                    </Tooltip>
                  </Space>
                }
              >
                <Input
                  value={accessToken}
                  readOnly
                  addonAfter={
                    <Space>
                      <Tooltip title="生成新令牌">
                        <Button
                          type="link"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={generateAccessToken}
                        />
                      </Tooltip>
                      <Tooltip title="复制令牌">
                        <Button
                          type="link"
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() => navigator.clipboard.writeText(accessToken)}
                        />
                      </Tooltip>
                    </Space>
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC">
            <Input value="1" disabled />
          </Form.Item>
        </Card>

        {/* 权限配置 */}
        <Card
          title={
            <Space>
              <LockOutlined />
              <span>权限配置 (permissions)</span>
              <Badge status="default" text="选填" />
            </Space>
          }
          className="config-section"
        >
          <Form.Item
            name={['permissions', 'defaultMode']}
            label="默认模式"
            initialValue="bypassPermissions"
            tooltip="选择Claude Code的权限模式，控制AI的操作权限范围"
          >
            <Select>
              <Option value="default">Default模式 - 谨慎小心的AI编程安全专家</Option>
              <Option value="acceptEdits">AcceptEdits模式 - 果断高效的代码协作伙伴</Option>
              <Option value="plan">Plan模式 - 只分析不执行的智能顾问</Option>
              <Option value="bypassPermissions">BypassPermissions模式 - 完全自主的AI编程执行专家</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name={['permissions', 'customMode']}
            label="自定义模式"
            tooltip="如果需要使用自定义权限模式，请在此输入模式名称"
          >
            <Input placeholder="输入自定义权限模式名称（可选）" allowClear />
          </Form.Item>
        </Card>

        {/* 状态行配置 */}
        <Card
          title={
            <Space>
              <EyeOutlined />
              <span>状态行配置 (statusLine)</span>
              <Badge status="default" text="选填" />
            </Space>
          }
          className="config-section"
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name={['statusLine', 'type']}
                label="类型"
                initialValue="command"
              >
                <Select>
                  <Option value="command">命令</Option>
                  <Option value="text">文本</Option>
                  <Option value="hidden">隐藏</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['statusLine', 'command']}
                label="命令"
                initialValue="ccline"
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['statusLine', 'padding']}
                label="内边距"
                initialValue={0}
              >
                <InputNumber
                  min={0}
                  max={20}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 自定义字段 */}
        <Card
          title={
            <Space>
              <SettingOutlined />
              <span>自定义字段</span>
              <Badge status="default" text="选填" />
            </Space>
          }
          className="config-section"
        >
          {customFields.map((field, index) => (
            <Row key={index} gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Input
                  placeholder="字段名"
                  value={field.key}
                  onChange={(e) => updateCustomField(index, 'key', e.target.value)}
                />
              </Col>
              <Col span={6}>
                <Select
                  value={field.type}
                  onChange={(value) => updateCustomField(index, 'type', value)}
                  style={{ width: '100%' }}
                >
                  <Option value="string">字符串</Option>
                  <Option value="number">数字</Option>
                  <Option value="boolean">布尔值</Option>
                  <Option value="object">对象</Option>
                </Select>
              </Col>
              <Col span={10}>
                <Input
                  placeholder="字段值"
                  value={field.value}
                  onChange={(e) => updateCustomField(index, 'value', e.target.value)}
                />
              </Col>
              <Col span={2}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeCustomField(index)}
                />
              </Col>
            </Row>
          ))}

          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={addCustomField}
            style={{ width: '100%' }}
          >
            添加自定义字段
          </Button>
        </Card>
      </Form>
    </div>
  )

  /**
   * 渲染JSON模式编辑器
   */
  const renderJsonEditor = () => (
    <div className="managed-mode-json-editor">
      <Alert
        type="info"
        message="JSON源视图"
        description="直接编辑JSON格式的配置。保存后将自动清理空字段。"
        style={{ marginBottom: 16 }}
      />

      <div className="json-editor-container">
        <CodeEditor
          value={jsonContent}
          onChange={handleJsonContentChange}
          language="json"
          height="400px"
        />
      </div>
    </div>
  )

  return (
    <div className="managed-mode-config-editor">
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>托管模式配置</span>
            {managedModeConfig?.enabled && (
              <Badge status="processing" text="已启用" />
            )}
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={copyConfig}
            >
              复制配置
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={loading}
              onClick={handleSave}
            >
              保存并重启服务
            </Button>
          </Space>
        }
      >
        {/* 基础配置 */}
        <div className="basic-config">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="服务端口">
                <InputNumber
                  value={servicePort}
                  onChange={(value) => setServicePort(value || 8487)}
                  min={1024}
                  max={65535}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="调试模式">
                <Switch
                  checked={debugMode}
                  onChange={setDebugMode}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="网络代理">
                <Switch
                  checked={networkProxyEnabled}
                  onChange={setNetworkProxyEnabled}
                  checkedChildren="启用"
                  unCheckedChildren="禁用"
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={24}>
              <Form.Item label="当前服务配置">
                <Select
                  value={selectedProviderId}
                  onChange={handleConfigSwitch}
                  onOpenChange={handleDropdownOpen}
                  placeholder="选择要使用的配置"
                  style={{ width: '100%' }}
                  optionFilterProp="children"
                  showSearch
                  filterOption={(input, option) =>
                    option?.children?.toString().toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {availableProviders.map(provider => (
                    <Option key={provider.id} value={provider.id} title={provider.name}>
                      {provider.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 网络代理详细配置 */}
          {networkProxyEnabled && (
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Form.Item label="代理主机">
                  <Input
                    value={networkProxyHost}
                    onChange={(e) => setNetworkProxyHost(e.target.value)}
                    placeholder="代理服务器地址"
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="代理端口">
                  <InputNumber
                    value={networkProxyPort}
                    onChange={(value) => setNetworkProxyPort(value || 8080)}
                    min={1}
                    max={65535}
                    style={{ width: '100%' }}
                    placeholder="代理服务器端口"
                  />
                </Form.Item>
              </Col>
            </Row>
          )}
        </div>

        <Divider />

        <Alert
          type="info"
          message="配置说明"
          description={
            <Space direction="vertical" size="small">
              <Text>• GUI配置模式：使用表单界面编辑托管模式的settings.json配置，支持标准字段的可视化编辑</Text>
              <Text>• JSON源码模式：直接编辑JSON格式配置，支持高级自定义字段</Text>
              <Text strong style={{ color: '#1890ff' }}>
                💡 提示：GUI和JSON作为独立编辑器，互不干扰。点击"保存并重启服务"按钮后，会自动同步两种视图并应用配置。
              </Text>
              <Text strong style={{ color: '#fa8c16' }}>
                ⚠️ 重要：保存后会更新settings.json，需要在所有使用此配置的Claude Code终端中执行重启命令，新配置才能生效。
              </Text>
            </Space>
          }
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* 配置编辑器 */}
        <Tabs
          activeKey={configMode}
          onChange={setConfigMode}
          type="card"
          items={[
            {
              key: 'gui',
              label: (
                <Space>
                  <SettingOutlined />
                  <span>GUI配置</span>
                </Space>
              ),
              children: renderGuiEditor()
            },
            {
              key: 'json',
              label: (
                <Space>
                  <CodeOutlined />
                  <span>JSON源码</span>
                </Space>
              ),
              children: renderJsonEditor()
            }
          ]}
        />
      </Card>
    </div>
  )
}

export default ManagedModeConfigEditor