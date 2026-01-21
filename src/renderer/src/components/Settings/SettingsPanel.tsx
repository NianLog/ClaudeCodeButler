/**
 * 设置面板组件
 * 提供应用设置和偏好配置功能
 */

import React, { useEffect, useState, useRef } from 'react'
import { Card, Form, Switch, Input, InputNumber, Select, Button, Space, Typography, Tabs, Row, Col, Alert, Descriptions, Tag, message, Divider, Modal } from 'antd'
import {
  SaveOutlined,
  ReloadOutlined,
  ExportOutlined,
  ImportOutlined,
  SettingOutlined,
  BellOutlined,
  DatabaseOutlined,
  CodeOutlined,
  InfoCircleOutlined,
  CloudDownloadOutlined,
  GlobalOutlined,
  GithubOutlined,
  DesktopOutlined
} from '@ant-design/icons'
import { useSettingsStore, useBasicSettings, useEditorSettings, useNotificationSettings, useAdvancedSettings, useWindowSettings, useSettingsActions, useUnsavedChanges } from '../../store/settings-store'
import { useAppStore } from '../../store/app-store'
import { useTranslation } from '../../locales/useTranslation'
import { versionService } from '../../services/version-service'
import UpdateModal from '../Common/UpdateModal'
import Logo from '../Common/Logo'
import TerminalManagement from './TerminalManagement'
import type { VersionInfo } from '../../services/version-service'

const { Title, Text } = Typography
const { Option } = Select

/**
 * 设置面板组件
 */
const SettingsPanel: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    versionInfo: VersionInfo
  } | null>(null)

  // 使用新的设置 store
  const basicSettings = useBasicSettings()
  const editorSettings = useEditorSettings()
  const notificationSettings = useNotificationSettings()
  const advancedSettings = useAdvancedSettings()
  const windowSettings = useWindowSettings()
  const { isLoading, isSaving, saveSettings, resetSettings: resetAppSettings, initialize } = useSettingsStore()
  const { setTabSettings, markTabSaved } = useSettingsActions()
  const unsavedChanges = useUnsavedChanges()

  
  const { theme, setTheme, version } = useAppStore()
  const { t, language, setLanguage, availableLanguages } = useTranslation()

  useEffect(() => {
    // 初始化设置
    initialize()
  }, [initialize])

  // 使用ref来追踪是否已经初始化，避免每次组件重新挂载时重置
  const isInitializedRef = useRef(false)

  useEffect(() => {
    console.log('📋 [SettingsPanel] useEffect触发')
    console.log('📋 [SettingsPanel] isInitializedRef.current:', isInitializedRef.current)
    console.log('📋 [SettingsPanel] basicSettings:', basicSettings)
    console.log('📋 [SettingsPanel] editorSettings:', editorSettings)
    console.log('📋 [SettingsPanel] notificationSettings:', notificationSettings)
    console.log('📋 [SettingsPanel] advancedSettings:', advancedSettings)
    console.log('📋 [SettingsPanel] windowSettings:', windowSettings)

    // 根据当前标签页设置表单值 - 只在首次加载时设置，避免覆盖用户修改
    // 检查所有设置是否都有实际内容(不是空对象)
    const hasBasicSettings = basicSettings && Object.keys(basicSettings).length > 0
    const hasEditorSettings = editorSettings && Object.keys(editorSettings).length > 0
    const hasNotificationSettings = notificationSettings && Object.keys(notificationSettings).length > 0
    const hasAdvancedSettings = advancedSettings && Object.keys(advancedSettings).length > 0
    const hasWindowSettings = windowSettings && Object.keys(windowSettings).length > 0

    console.log('📋 [SettingsPanel] 设置检查:', {
      hasBasicSettings,
      hasEditorSettings,
      hasNotificationSettings,
      hasAdvancedSettings,
      hasWindowSettings
    })

    if (!isInitializedRef.current && hasBasicSettings && hasEditorSettings && hasNotificationSettings && hasAdvancedSettings && hasWindowSettings) {
      const formValues = {
        basic: basicSettings,
        editor: editorSettings,
        notifications: notificationSettings,
        advanced: advancedSettings,
        window: windowSettings
      }
      console.log('📋 [SettingsPanel] 设置表单值:', formValues)
      form.setFieldsValue(formValues)
      isInitializedRef.current = true
      console.log('📋 [SettingsPanel] 表单初始化完成')
    } else {
      console.log('📋 [SettingsPanel] 跳过表单初始化，条件不满足')
    }
  }, [basicSettings, editorSettings, notificationSettings, advancedSettings, windowSettings, form])

  
  useEffect(() => {
    // 初始化版本号
    versionService.setCurrentVersion(version)
  }, [version])

  // 按标签页保存设置
  const handleSaveTab = async (tab: string) => {
    try {
      console.log('🔧 开始保存标签页:', tab)
      setLoading(true)
      const values = await form.validateFields()
      console.log('🔧 表单验证通过，获取到的值:', values)

      // 对于basic标签页，需要特殊处理嵌套的window设置
      let tabData: any = { [tab]: {} }
      if (tab === 'basic') {
        // 提取basic设置
        tabData[tab] = values.basic || {}
        // 确保window设置也被包含
        if (values.window) {
          tabData.window = values.window
        }
      } else {
        // 其他标签页直接使用原有逻辑
        tabData = { [tab]: values[tab] || values }
      }
      console.log('🔧 准备保存的标签页数据:', tabData)

      // 先获取当前表单值
      const currentFormValues = form.getFieldsValue()
      console.log('🔧 当前表单值:', currentFormValues)

      // 先更新store中的设置
      console.log('🔧 更新store中的设置...')
      if (tab === 'basic') {
        // 对于basic标签页，分别更新basic和window设置
        setTabSettings(tab as any, values.basic || {})
        if (values.window) {
          setTabSettings('window' as any, values.window)
        }
      } else {
        setTabSettings(tab as any, values[tab] || values)
      }

      // 然后保存
      console.log('🔧 调用saveSettings函数...')
      await saveSettings(tab as any)

      // 保存成功后，确保表单显示最新的值
      console.log('🔧 保存成功，更新表单显示')
      form.setFieldsValue(currentFormValues)

      // 如果是basic标签页且有window设置，也需要单独保存window设置
      if (tab === 'basic' && values.window) {
        console.log('🔧 保存window设置...')
        // 确保包含所有必填字段
        const completeWindowSettings = {
          width: values.window.width || windowSettings?.width || 1200,
          height: values.window.height || windowSettings?.height || 800,
          minWidth: values.window.minWidth || windowSettings?.minWidth || 800,
          minHeight: values.window.minHeight || windowSettings?.minHeight || 600,
          rememberPosition: values.window.rememberPosition !== undefined ? values.window.rememberPosition : (windowSettings?.rememberPosition ?? true)
        }
        setTabSettings('window' as any, completeWindowSettings)
        await saveSettings('window' as any)
      }

      console.log('🔧 saveSettings函数执行完成')
      markTabSaved(tab as any)
      message.success(t('message.settings.saved', { tab: getTabName(tab) }))
      console.log('🔧 标签页保存成功:', tab)
    } catch (error) {
      console.error('🔧 保存标签页失败:', error)
      message.error(t('message.settings.saveFailed', { tab: getTabName(tab) }))
    } finally {
      setLoading(false)
    }
  }

  // 保存当前标签页设置
  const handleSave = async () => {
    console.log('🔧 保存按钮被点击，当前标签页:', activeTab)
    console.log('🔧 表单数据:', await form.validateFields().catch(e => ({ error: e.message })))
    await handleSaveTab(activeTab)
  }

  // 重置当前标签页设置
  const handleReset = async () => {
    // 显示确认对话框
    Modal.confirm({
      title: '确认重置设置',
      content: `您确定要重置"${getTabName(activeTab)}"标签页的所有设置吗？此操作无法撤销。`,
      okText: '确认重置',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await resetAppSettings(activeTab as any)
          message.success(t('message.settings.reset', { tab: getTabName(activeTab) }))
        } catch (error) {
          message.error(t('message.settings.resetFailed', { tab: getTabName(activeTab) }))
        }
      },
      onCancel: () => {
        // 用户取消操作
      }
    })
  }

  // 获取标签页中文名称
  const getTabName = (tab: string): string => {
    const names: Record<string, string> = {
      basic: t('settings.basic'),
      editor: t('settings.editor'),
      notifications: t('settings.notifications'),
      advanced: t('settings.advanced')
    }
    return names[tab] || tab
  }

  const handleExport = async () => {
    try {
      const content = await window.electronAPI.settings.export()

      // 创建下载链接
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `claude-code-butler-settings-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      message.success(t('message.settings.exported'))
    } catch (error) {
      message.error(t('message.settings.exportFailed'))
    }
  }

  const handleImport = async () => {
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const content = await file.text()
          await window.electronAPI.settings.import(content, false) // 不合并，完全替换
          await initialize() // 重新加载设置
          message.success(t('message.settings.imported'))
        }
      }
      input.click()
    } catch (error) {
      message.error(t('message.settings.importFailed'))
    }
  }

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  // 语言变更处理
  const handleLanguageChange = async (newLanguage: 'zh-CN' | 'en-US') => {
    setLanguage(newLanguage)
    setTabSettings('basic', { language: newLanguage })
    // 立即保存语言设置
    try {
      await saveSettings('basic')
      message.success('语言设置已保存')
    } catch (error) {
      message.error('保存语言设置失败')
    }
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true)
      message.loading({ content: '正在检查更新...', key: 'checkUpdate' })

      const result = await versionService.checkForUpdates()

      if (result.hasUpdate && result.versionInfo) {
        message.destroy('checkUpdate')
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          versionInfo: result.versionInfo
        })
        setUpdateModalVisible(true)
      } else {
        message.success({ content: '当前已是最新版本', key: 'checkUpdate' })
      }
    } catch (error) {
      message.error({
        content: error instanceof Error ? error.message : '检查更新失败',
        key: 'checkUpdate'
      })
    } finally {
      setCheckingUpdate(false)
    }
  }

  // 处理更新
  const handleUpdate = async (downloadUrl: string) => {
    try {
      await versionService.openDownloadPage(downloadUrl)
      setUpdateModalVisible(false)
      message.success('已在浏览器中打开下载页面')
    } catch (error) {
      message.error('打开下载页面失败')
    }
  }

  // 访问官网
  const handleVisitWebsite = async () => {
    try {
      await versionService.openDownloadPage()
      setUpdateModalVisible(false)
    } catch (error) {
      message.error('打开官网失败')
    }
  }

  const generalSettings = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card title="基本设置" style={{ borderRadius: '12px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'language']}
              label="语言"
              tooltip="选择应用界面语言"
            >
              <Select onChange={handleLanguageChange}>
                <Option value="zh-CN">简体中文</Option>
                <Option value="en-US">English</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'theme']}
              label="主题"
              tooltip="选择应用主题"
            >
              <Select value={theme} onChange={handleThemeChange}>
                <Option value="light">浅色主题</Option>
                <Option value="dark">深色主题</Option>
                <Option value="auto">跟随系统</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'autoSave']}
              label="自动保存"
              tooltip="自动保存配置更改"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'startupCheck']}
              label="启动时检查更新"
              tooltip="应用启动时自动检查更新"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['window', 'width']}
              label="窗口宽度"
              tooltip="应用启动时的窗口宽度"
            >
              <InputNumber min={800} max={1920} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['window', 'height']}
              label="窗口高度"
              tooltip="应用启动时的窗口高度"
            >
              <InputNumber min={600} max={1080} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        {/* 隐藏的必填字段，确保验证时包含所有必需数据 */}
        <Form.Item name={['window', 'minWidth']} style={{ display: 'none' }}>
          <Input />
        </Form.Item>
        <Form.Item name={['window', 'minHeight']} style={{ display: 'none' }}>
          <Input />
        </Form.Item>
        <Form.Item name={['window', 'rememberPosition']} style={{ display: 'none' }}>
          <Input />
        </Form.Item>
      </Card>
    </div>
  )

  const notificationSettingsContent = (
    <Card title="通知设置" style={{ borderRadius: '12px' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'enabled']}
            label="启用通知"
            tooltip="启用系统通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'sound']}
            label="通知声音"
            tooltip="通知时播放声音"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'configChanges']}
            label="配置变更通知"
            tooltip="配置变更时发送通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'errors']}
            label="错误通知"
            tooltip="发生错误时发送通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'startupCheckUpdate']}
            label="启动时检查更新"
            tooltip="应用启动时自动检查版本更新"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'silentUpdateCheck']}
            label="静默更新检查"
            tooltip="网络失败时不显示错误通知，仅在发现更新时提醒"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )


  const editorSettingsPanel = (
    <Card title="编辑器设置" style={{ borderRadius: '12px' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'fontSize']}
            label="字体大小"
            tooltip="编辑器字体大小"
          >
            <InputNumber min={10} max={24} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'tabSize']}
            label="Tab 大小"
            tooltip="Tab 键缩进大小"
          >
            <InputNumber min={2} max={8} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'wordWrap']}
            label="自动换行"
            tooltip="编辑器自动换行"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['editor', 'minimap']}
            label="显示小地图"
            tooltip="显示代码小地图"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['editor', 'lineNumbers']}
            label="显示行号"
            tooltip="显示行号"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )

  const advancedSettingsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card title="高级设置" style={{ borderRadius: '12px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'logLevel']}
              label="日志级别"
              tooltip="设置日志输出级别"
            >
              <Select>
                <Option value="error">错误</Option>
                <Option value="warn">警告</Option>
                <Option value="info">信息</Option>
                <Option value="debug">调试</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'cacheSize']}
              label="缓存大小(MB)"
              tooltip="设置缓存大小"
            >
              <InputNumber min={10} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'autoBackup']}
              label="自动备份"
              tooltip="自动备份配置文件"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'telemetry']}
              label="遥测数据"
              tooltip="发送匿名使用数据帮助改进"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="数据管理" style={{ borderRadius: '12px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message="数据管理"
            description="管理应用数据和配置"
            type="info"
            showIcon
          />

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              导出设置
            </Button>
            <Button icon={<ImportOutlined />} onClick={handleImport}>
              导入设置
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset} danger>
              重置设置
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  )

  const aboutSettings = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card title={t('about.app.info')} style={{ borderRadius: '12px' }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ marginBottom: '16px' }}>
            <img
              src={new URL('../../assets/icons/ccb_256.png', import.meta.url).href}
              alt="Claude Code Butler"
              style={{ width: 128, height: 128 }}
            />
          </div>
          <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>
            {t('about.app.name')}
          </Title>
          <Text type="secondary">{t('about.app.description')}</Text>
        </div>

        <Divider />

        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label={t('common.settings')}>{t('about.app.name')} (CCB)</Descriptions.Item>
          <Descriptions.Item label={t('about.app.currentVersion')}>
            <Tag color="blue">{version}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('about.app.author')}>NianSir</Descriptions.Item>
          <Descriptions.Item label={t('about.app.license')}>MIT License</Descriptions.Item>
          <Descriptions.Item label={t('about.app.techStack')}>
            {t('about.app.techStack.value')}
          </Descriptions.Item>
        </Descriptions>

        <Divider />

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            type="primary"
            icon={<CloudDownloadOutlined />}
            onClick={handleCheckUpdate}
            loading={checkingUpdate}
            block
          >
            {t('update.check')}
          </Button>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              icon={<GlobalOutlined />}
              onClick={async () => {
                try {
                  await versionService.openDownloadPage()
                } catch (error) {
                  message.error('打开官网失败')
                }
              }}
            >
              {t('update.visitWebsite')}
            </Button>
            <Button
              icon={<InfoCircleOutlined />}
              onClick={async () => {
                try {
                  await versionService.openDocsPage()
                } catch (error) {
                  message.error('打开文档失败')
                }
              }}
            >
              {t('update.docs')}
            </Button>
            <Button
              icon={<GithubOutlined />}
              onClick={async () => {
                try {
                  await versionService.openGitHubPage()
                } catch (error) {
                  message.error('打开 GitHub 失败')
                }
              }}
            >
              {t('update.github')}
            </Button>
          </div>
        </Space>
      </Card>

      <Card title={t('changelog.title')} style={{ borderRadius: '12px' }}>
        <Alert
          message={t('changelog.version')}
          description={
            <div>
              <p>{t('changelog.description')}</p>
              <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                {(Array.isArray(t('changelog.features', { returnObjects: true }))
                  ? t('changelog.features', { returnObjects: true })
                  : []
                ).map((feature: string, index: number) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            </div>
          }
          type="info"
          showIcon
        />
      </Card>
    </div>
  )

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>{t('settings.title')}</Title>
          <Text type="secondary">{t('settings.subtitle')}</Text>
        </div>

        <Space>
          <Button onClick={handleReset}>
            {t('settings.data.reset')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading || isSaving}>
            {t('common.save')}
          </Button>
        </Space>
      </div>

      {/* 设置内容 */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Form form={form} layout="vertical" style={{ height: '100%' }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'basic',
                label: (
                  <span>
                    <SettingOutlined />
                    基本设置
                  </span>
                ),
                children: generalSettings
              },
              {
                key: 'editor',
                label: (
                  <span>
                    <CodeOutlined />
                    编辑器设置
                  </span>
                ),
                children: editorSettingsPanel
              },
              {
                key: 'notifications',
                label: (
                  <span>
                    <BellOutlined />
                    通知设置
                  </span>
                ),
                children: notificationSettingsContent
              },
              {
                key: 'advanced',
                label: (
                  <span>
                    <DatabaseOutlined />
                    高级设置
                  </span>
                ),
                children: advancedSettingsContent
              },
              {
                key: 'terminal',
                label: (
                  <span>
                    <DesktopOutlined />
                    终端管理
                  </span>
                ),
                children: <TerminalManagement />
              },
              {
                key: 'about',
                label: (
                  <span>
                    <InfoCircleOutlined />
                    关于
                  </span>
                ),
                children: aboutSettings
              }
            ]}
            style={{ height: '100%', overflow: 'auto' }}
            tabBarStyle={{ marginBottom: '16px' }}
          />
        </Form>
      </div>

      {/* 更新提示Modal */}
      {updateInfo && (
        <UpdateModal
          visible={updateModalVisible}
          currentVersion={updateInfo.currentVersion}
          latestVersion={updateInfo.latestVersion}
          versionInfo={updateInfo.versionInfo}
          onClose={() => setUpdateModalVisible(false)}
          onUpdate={handleUpdate}
          onVisitWebsite={handleVisitWebsite}
        />
      )}
    </div>
  )
}

export default SettingsPanel