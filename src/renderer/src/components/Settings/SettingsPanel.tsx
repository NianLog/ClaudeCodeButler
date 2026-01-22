/**
 * 设置面板组件
 * 提供应用设置和偏好配置功能
 */

import React, { useEffect, useState, useRef } from 'react'
import { Card, Form, Switch, Input, InputNumber, Select, Button, Space, Typography, Tabs, Row, Col, Alert, Descriptions, Tag, message, Divider } from 'antd'
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
import TerminalManagement from './TerminalManagement'
import type { VersionInfo } from '../../services/version-service'

const { Title, Text } = Typography
const { Option } = Select

const SettingsPanel: React.FC = () => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateModalVisible, setUpdateModalVisible] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [latestVersionStatus, setLatestVersionStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle')
  const [changelogStatus, setChangelogStatus] = useState<'idle' | 'loading' | 'ready' | 'offline'>('idle')
  const [changelogLines, setChangelogLines] = useState<string[]>([])
  const [updateInfo, setUpdateInfo] = useState<{
    currentVersion: string
    latestVersion: string
    versionInfo: VersionInfo
  } | null>(null)

  const basicSettings = useBasicSettings()
  const editorSettings = useEditorSettings()
  const notificationSettings = useNotificationSettings()
  const advancedSettings = useAdvancedSettings()
  const windowSettings = useWindowSettings()
  const { isSaving, saveSettings, resetSettings: resetAppSettings, initialize } = useSettingsStore()
  const { setTabSettings, markTabSaved } = useSettingsActions()
  useUnsavedChanges()

  const { theme, setTheme, version } = useAppStore()
  const { t, setLanguage, availableLanguages } = useTranslation()

  useEffect(() => {
    initialize()
  }, [initialize])

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

  useEffect(() => {
    if (activeTab !== 'about' || latestVersionStatus === 'loading' || changelogStatus === 'loading') {
      return
    }

    if (latestVersionStatus === 'ready' && changelogStatus === 'ready') {
      return
    }

    const fetchLatestVersion = async () => {
      try {
        setLatestVersionStatus('loading')
        setChangelogStatus('loading')
        const info = await versionService.fetchVersionInfo()
        setLatestVersion(info.appId)
        const formatted = versionService.formatUpdateText(info.updateText || '')
        const lines = formatted
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean)
        setChangelogLines(lines)
        setLatestVersionStatus('ready')
        setChangelogStatus('ready')
      } catch (error) {
        setLatestVersionStatus('offline')
        setChangelogStatus('offline')
      }
    }

    fetchLatestVersion()
  }, [activeTab, latestVersionStatus, changelogStatus])

  // 获取标签页中文名称
  function getTabName(tab: string): string {
    const names: Record<string, string> = {
      basic: t('settings.basic'),
      editor: t('settings.editor'),
      notifications: t('settings.notifications'),
      advanced: t('settings.advanced')
    }
    return names[tab] || tab
  }

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
          rememberPosition: values.window.rememberPosition !== undefined
            ? values.window.rememberPosition
            : (windowSettings?.rememberPosition ?? true)
        }
        setTabSettings('window' as any, completeWindowSettings)
        await saveSettings('window' as any)
        markTabSaved('window' as any)
      }

      markTabSaved(tab as any)
      message.success(t('message.settings.saved', { tab: getTabName(tab) }))
    } catch (error) {
      message.error(t('message.settings.saveFailed', { tab: getTabName(tab) }))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    await handleSaveTab(activeTab)
  }

  const handleReset = async () => {
    const tabName = getTabName(activeTab)
    try {
      await resetAppSettings(activeTab as any)
      await initialize()
      message.success(t('message.settings.reset', { tab: tabName }))
    } catch (error) {
      message.error(t('message.settings.resetFailed', { tab: tabName }))
    }
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

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'auto') => {
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
      message.success(t('settings.messages.languageSaved'))
    } catch (error) {
      message.error(t('settings.messages.languageSaveFailed'))
    }
  }

  // 检查更新
  const handleCheckUpdate = async () => {
    try {
      setCheckingUpdate(true)
      message.loading({ content: t('update.checking'), key: 'checkUpdate' })

      const result = await versionService.checkForUpdates()

      setLatestVersion(result.latestVersion)
      setLatestVersionStatus('ready')

      if (result.hasUpdate && result.versionInfo) {
        message.destroy('checkUpdate')
        setUpdateInfo({
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          versionInfo: result.versionInfo
        })
        setUpdateModalVisible(true)
      } else {
        message.success({ content: t('update.latest'), key: 'checkUpdate' })
      }
    } catch (error) {
      message.error({
        content: error instanceof Error ? error.message : t('update.failed'),
        key: 'checkUpdate'
      })
      setLatestVersionStatus('offline')
    } finally {
      setCheckingUpdate(false)
    }
  }

  // 处理更新
  const handleUpdate = async (downloadUrl: string) => {
    try {
      await versionService.openDownloadPage(downloadUrl)
      setUpdateModalVisible(false)
      message.success(t('update.openDownloadSuccess'))
    } catch (error) {
      message.error(t('update.openDownloadFailed'))
    }
  }

  // 访问官网
  const handleVisitWebsite = async () => {
    try {
      await versionService.openDownloadPage()
      setUpdateModalVisible(false)
    } catch (error) {
      message.error(t('update.openWebsiteFailed'))
    }
  }

  const generalSettings = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Card title={t('settings.basic')} style={{ borderRadius: '12px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'language']}
              label={t('settings.basic.language')}
              tooltip={t('settings.basic.language.tooltip')}
            >
              <Select onChange={handleLanguageChange}>
                {availableLanguages.map((lang) => (
                  <Option key={lang.code} value={lang.code}>
                    {lang.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'theme']}
              label={t('settings.basic.theme')}
              tooltip={t('settings.basic.theme.tooltip')}
            >
              <Select<'light' | 'dark' | 'auto'> value={theme} onChange={handleThemeChange}>
                <Option value="light">{t('settings.basic.theme.light')}</Option>
                <Option value="dark">{t('settings.basic.theme.dark')}</Option>
                <Option value="auto">{t('settings.basic.theme.auto')}</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'autoSave']}
              label={t('settings.basic.autoSave')}
              tooltip={t('settings.basic.autoSave.tooltip')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['basic', 'startupCheck']}
              label={t('settings.basic.startupCheck')}
              tooltip={t('settings.basic.startupCheck.tooltip')}
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
              label={t('settings.basic.windowWidth')}
              tooltip={t('settings.basic.windowWidth.tooltip')}
            >
              <InputNumber min={800} max={1920} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['window', 'height']}
              label={t('settings.basic.windowHeight')}
              tooltip={t('settings.basic.windowHeight.tooltip')}
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
    <Card title={t('settings.notifications')} style={{ borderRadius: '12px' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'enabled']}
            label={t('settings.notifications.enabled')}
            tooltip={t('settings.notifications.enabled.tooltip')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'sound']}
            label={t('settings.notifications.sound')}
            tooltip={t('settings.notifications.sound.tooltip')}
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
            label={t('settings.notifications.configChanges')}
            tooltip={t('settings.notifications.configChanges.tooltip')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'errors']}
            label={t('settings.notifications.errors')}
            tooltip={t('settings.notifications.errors.tooltip')}
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
            label={t('settings.notifications.startupCheckUpdate')}
            tooltip={t('settings.notifications.startupCheckUpdate.tooltip')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['notifications', 'silentUpdateCheck']}
            label={t('settings.notifications.silentUpdateCheck')}
            tooltip={t('settings.notifications.silentUpdateCheck.tooltip')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )

  const editorSettingsPanel = (
    <Card title={t('settings.editor')} style={{ borderRadius: '12px' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'fontSize']}
            label={t('settings.editor.fontSize')}
            tooltip={t('settings.editor.fontSize.tooltip')}
          >
            <InputNumber min={10} max={24} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'tabSize']}
            label={t('settings.editor.tabSize')}
            tooltip={t('settings.editor.tabSize.tooltip')}
          >
            <InputNumber min={2} max={8} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={['editor', 'wordWrap']}
            label={t('settings.editor.wordWrap')}
            tooltip={t('settings.editor.wordWrap.tooltip')}
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
            label={t('settings.editor.minimap')}
            tooltip={t('settings.editor.minimap.tooltip')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item
            name={['editor', 'lineNumbers']}
            label={t('settings.editor.lineNumbers')}
            tooltip={t('settings.editor.lineNumbers.tooltip')}
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
      <Card title={t('settings.advanced')} style={{ borderRadius: '12px' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'logLevel']}
              label={t('settings.advanced.logLevel')}
              tooltip={t('settings.advanced.logLevel.tooltip')}
            >
              <Select>
                <Option value="error">{t('common.error')}</Option>
                <Option value="warn">{t('common.warning')}</Option>
                <Option value="info">{t('common.info')}</Option>
                <Option value="debug">DEBUG</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'cacheSize']}
              label={t('settings.advanced.cacheSize')}
              tooltip={t('settings.advanced.cacheSize.tooltip')}
            >
              <InputNumber min={10} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'autoBackup']}
              label={t('settings.advanced.autoBackup')}
              tooltip={t('settings.advanced.autoBackup.tooltip')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name={['advanced', 'telemetry']}
              label={t('settings.advanced.telemetry')}
              tooltip={t('settings.advanced.telemetry.tooltip')}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title={t('settings.data.title')} style={{ borderRadius: '12px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            message={t('settings.data.title')}
            description={t('settings.data.description')}
            type="info"
            showIcon
          />

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              {t('settings.data.export')}
            </Button>
            <Button icon={<ImportOutlined />} onClick={handleImport}>
              {t('settings.data.import')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={handleReset} danger>
              {t('settings.data.reset')}
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
                  message.error(t('update.openWebsiteFailed'))
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
                  message.error(t('update.openDocsFailed'))
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
                  message.error(t('update.openGitHubFailed'))
                }
              }}
            >
              {t('update.github')}
            </Button>
          </div>
        </Space>

        <Divider />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary">{t('about.latestVersion')}</Text>
          {latestVersionStatus === 'ready' && latestVersion && (
            <Tag color="green">{latestVersion}</Tag>
          )}
          {latestVersionStatus === 'loading' && (
            <Tag color="processing">{t('about.latestVersion.loading')}</Tag>
          )}
          {latestVersionStatus === 'offline' && (
            <Tag color="default">{t('about.latestVersion.offline')}</Tag>
          )}
        </div>
      </Card>

      <Card title={t('changelog.title')} style={{ borderRadius: '12px' }}>
        {changelogStatus === 'loading' && (
          <Alert
            message={t('changelog.loading')}
            type="info"
            showIcon
          />
        )}
        {changelogStatus === 'offline' && (
          <Alert
            message={t('changelog.networkError')}
            type="warning"
            showIcon
          />
        )}
        {changelogStatus === 'ready' && (
          <Alert
            message={latestVersion ? `${t('changelog.version')} ${latestVersion}` : t('changelog.version')}
            description={
              <div>
                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                  {(changelogLines.length > 0 ? changelogLines : [t('update.latest')]).map((feature, index) => (
                    <li key={index}>{feature}</li>
                  ))}
                </ul>
              </div>
            }
            type="info"
            showIcon
          />
        )}
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
                    {t('settings.basic')}
                  </span>
                ),
                children: generalSettings
              },
              {
                key: 'editor',
                label: (
                  <span>
                    <CodeOutlined />
                    {t('settings.editor')}
                  </span>
                ),
                children: editorSettingsPanel
              },
              {
                key: 'notifications',
                label: (
                  <span>
                    <BellOutlined />
                    {t('settings.notifications')}
                  </span>
                ),
                children: notificationSettingsContent
              },
              {
                key: 'advanced',
                label: (
                  <span>
                    <DatabaseOutlined />
                    {t('settings.advanced')}
                  </span>
                ),
                children: advancedSettingsContent
              },
              {
                key: 'terminal',
                label: (
                  <span>
                    <DesktopOutlined />
                    {t('settings.terminal')}
                  </span>
                ),
                children: <TerminalManagement />
              },
              {
                key: 'about',
                label: (
                  <span>
                    <InfoCircleOutlined />
                    {t('settings.about')}
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