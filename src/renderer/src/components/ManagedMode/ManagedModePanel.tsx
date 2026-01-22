/**
 * 优化的托管模式管理面板
 * @description 基于项目UI设计系统重构的现代化托管模式管理界面
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Card,
  Button,
  Switch,
  Table,
  Modal,
  Input,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
  Tabs,
  Alert,
  Typography,
  Badge,
  Statistic,
  Row,
  Col,
  Progress,
  Divider,
  Dropdown,
  MenuProps,
  Empty,
  Spin
} from 'antd'
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  ClearOutlined,
  DownloadOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  MonitorOutlined,
  BugOutlined,
  GlobalOutlined,
  CloudServerOutlined,
  DashboardOutlined
} from '@ant-design/icons'
import type {
  ManagedModeStatus,
  ManagedModeConfig
} from '@shared/types/managed-mode'
import type { ConfigFile } from '@shared/types'
import ManagedModeConfigEditor from './ManagedModeConfigEditor'
import TerminalLogViewer from './TerminalLogViewer'
import { useManagedModeLogStore } from '../../store/managed-mode-log-store'
import { useTranslation } from '../../locales/useTranslation'
import './ManagedModePanel.css'

const { Text, Title, Paragraph } = Typography

/**
 * 托管模式管理面板组件
 */
const ManagedModePanel: React.FC = () => {
  const { t } = useTranslation()
  // 从全局store读取日志统计数据（用于动态计算健康度）
  const { normalLogCount, errorLogCount } = useManagedModeLogStore()

  // 状态管理
  const [status, setStatus] = useState<ManagedModeStatus | null>(null)
  const [config, setConfig] = useState<ManagedModeConfig | null>(null)
  const [configs, setConfigs] = useState<ConfigFile[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [uptime, setUptime] = useState<string>(t('managedMode.time.zero'))
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      const [statusData, configData, configsData] = await Promise.all([
        window.electronAPI.managedMode.getStatus(),
        window.electronAPI.managedMode.getConfig(),
        window.electronAPI.config.list()
      ])
      setStatus(statusData)
      setConfig(configData)
      const resolvedConfigs = (configsData as any)?.data || configsData || []
      setConfigs(Array.isArray(resolvedConfigs) ? resolvedConfigs : [])
    } catch (error: any) {
      message.error(t('managedMode.messages.loadFailed', { error: error.message }))
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // 监听状态变化
    const unsubscribe = window.electronAPI.managedMode.onStatusChanged?.((newStatus) => {
      setStatus(newStatus)
    });

    // 监听配置更新事件
    const unsubscribeConfigUpdate = window.electronAPI.managedMode.onConfigUpdated?.(() => {
      console.log('收到配置更新事件，重新加载数据')
      loadData()
    })

    return () => {
      if (unsubscribe) unsubscribe()
      if (unsubscribeConfigUpdate) unsubscribeConfigUpdate()
    }
  }, [loadData])

  // 运行时长更新定时器
  useEffect(() => {
    // 清理之前的定时器
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    // 定义更新运行时间的函数
    const updateUptime = () => {
      if (status?.startTime && status.enabled) {
        const minutes = Math.floor((Date.now() - status.startTime) / 1000 / 60)
        if (minutes < 60) {
          setUptime(t('managedMode.time.minutes', { minutes }))
        } else {
          const hours = Math.floor(minutes / 60)
          const remainingMinutes = minutes % 60
          setUptime(t('managedMode.time.hoursMinutes', { hours, minutes: remainingMinutes }))
        }
      } else {
        setUptime(t('managedMode.time.zero'))
      }
    }

    // 立即更新一次
    updateUptime()

    // 只有在服务运行时才设置定时器
    if (status?.enabled && status?.startTime) {
      intervalRef.current = setInterval(updateUptime, 30000) // 每30秒更新一次
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [status?.startTime, status?.enabled])

  /**
   * 启用托管模式
   */
  const handleEnableManagedMode = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.managedMode.enable()
      if (result.success) {
        message.success(result.message || t('managedMode.messages.enabled'))
        await loadData()
      } else {
        message.error(result.error || t('managedMode.messages.enableFailed'))
      }
    } catch (error: any) {
      message.error(t('managedMode.messages.enableFailedWithError', { error: error.message }))
    } finally {
      setLoading(false)
    }
  }

  /**
   * 禁用托管模式
   */
  const handleDisableManagedMode = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.managedMode.disable()
      if (result.success) {
        message.success(result.message || t('managedMode.messages.disabled'))
        await loadData()
      } else {
        message.error(result.error || t('managedMode.messages.disableFailed'))
      }
    } catch (error: any) {
      message.error(t('managedMode.messages.disableFailedWithError', { error: error.message }))
    } finally {
      setLoading(false)
    }
  }

  /**
   * 重启托管服务
   */
  const handleRestartService = async () => {
    setLoading(true)
    try {
      message.success(t('managedMode.messages.restartSuccess'))
      await loadData()
    } catch (error: any) {
      message.error(t('managedMode.messages.restartFailed', { error: error.message }))
    } finally {
      setLoading(false)
    }
  }

  /**
   * 配置变更处理
   * @description 处理托管模式配置变更，确保配置更新、服务重启和状态同步的正确顺序
   */
  const handleConfigChange = async (newConfig: any) => {
    try {
      setLoading(true)

      const configData = newConfig.configData || {}

      // 1. 先更新托管模式配置（端口、令牌、日志、服务商等）
      // 提取托管模式配置字段
      const managedConfig: any = {}
      if (newConfig.port !== undefined) managedConfig.port = newConfig.port
      if (newConfig.accessToken !== undefined) managedConfig.accessToken = newConfig.accessToken
      if (newConfig.logging !== undefined) managedConfig.logging = newConfig.logging
      if (newConfig.currentProvider !== undefined) managedConfig.currentProvider = newConfig.currentProvider
      if (newConfig.networkProxy !== undefined) managedConfig.networkProxy = newConfig.networkProxy
      // 添加 configData 到托管模式配置中，以便持久化
      if (newConfig.configData !== undefined) managedConfig.configData = newConfig.configData

      // 更新托管模式配置（会自动重启服务）
      if (Object.keys(managedConfig).length > 0) {
        console.log('更新托管模式配置:', managedConfig)
        const updateResult = await window.electronAPI.managedMode.updateConfig(managedConfig)
        if (!updateResult.success) {
          throw new Error(updateResult.error || t('managedMode.messages.updateConfigFailed'))
        }
      }

      // 2. 等待服务重启完成
      await new Promise(resolve => setTimeout(resolve, 500))

      // 3. 更新系统settings.json配置
      const result = await window.electronAPI.managedMode.updateSettingsConfig(configData)

      if (!result.success) {
        throw new Error(result.error || t('managedMode.messages.writeSystemConfigFailed'))
      }

      // 4. 等待一小段时间确保文件写入完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 5. 重新加载托管模式状态和配置
      await loadData()

      message.success(t('managedMode.messages.updateSuccess'))

    } catch (error: any) {
      console.error('更新配置失败:', error)
      message.error(t('managedMode.messages.updateFailed', { error: error.message }))
    } finally {
      setLoading(false)
    }
  }

  /**
   * 获取当前服务信息
   * @description 简化版服务信息获取，直接使用status中的provider详情
   */
  const getCurrentServiceInfo = useCallback(() => {
    // 托管代理基础信息
    const proxyUrl = `http://127.0.0.1:${status?.port || 8487}`
    const proxyToken = status?.accessToken || config?.accessToken || ''

    // 上游服务信息(从status.currentProviderInfo获取)
    const providerInfo = status?.currentProviderInfo

    return {
      // 托管代理信息
      proxyUrl,
      proxyToken,
      // 上游服务信息
        providerName: providerInfo?.name || t('managedMode.provider.unconfigured'),
      providerUrl: providerInfo?.apiBaseUrl || '',
      providerKey: providerInfo?.apiKey || '', // 已经是格式化后的
      providerRawKey: providerInfo?.rawApiKey || '',
      // 网络代理信息
      networkProxy: {
        enabled: status?.networkProxy?.enabled || config?.networkProxy?.enabled || false,
        host: status?.networkProxy?.host || config?.networkProxy?.host || '127.0.0.1',
        port: status?.networkProxy?.port || config?.networkProxy?.port || 8080
      }
    }
  }, [status, config])

  /**
   * 获取增强的服务状态显示信息(简化版)
   */
  const getEnhancedServiceInfo = useCallback(() => {
    const serviceInfo = getCurrentServiceInfo()

    return {
      ...serviceInfo,
      // 网络代理显示地址
      networkProxyDisplay: serviceInfo.networkProxy.enabled
        ? `${serviceInfo.networkProxy.host}:${serviceInfo.networkProxy.port}`
        : t('managedMode.network.notEnabled')
    }
  }, [getCurrentServiceInfo])

  /**
   * 获取服务状态颜色
   */
  const getStatusColor = () => {
    return status?.running ? '#52c41a' : '#ff4d4f'
  }

  /**
   * 获取服务健康度
   * @description 根据日志的正常/异常比例动态计算健康度
   * 默认100分，根据错误率降低分数
   */
  const getHealthScore = () => {
    if (!status?.running) return 0

    const totalLogs = normalLogCount + errorLogCount

    // 如果还没有日志记录，返回默认100分
    if (totalLogs === 0) {
      return 100
    }

    // 计算错误率
    const errorRate = errorLogCount / totalLogs

    // 健康度 = 100 - (错误率 * 100)
    // 确保健康度在0-100之间
    const healthScore = Math.max(0, Math.min(100, 100 - Math.floor(errorRate * 100)))

    return healthScore
  }

  /**
   * 标签页项目配置
   */
  const tabItems = [
    {
      key: 'overview',
      label: (
        <Space>
          <MonitorOutlined />
          <span>{t('managedMode.tabs.overview')}</span>
          {status?.running && (
            <Badge status="processing" />
          )}
        </Space>
      ),
      children: renderOverviewPage()
    },
    {
      key: 'config',
      label: (
        <Space>
          <SettingOutlined />
          <span>{t('managedMode.tabs.config')}</span>
          {config?.enabled && (
            <Badge status="processing" />
          )}
        </Space>
      ),
      children: renderConfigPage()
    },
    {
      key: 'logs',
      label: (
        <Space>
          <BugOutlined />
          <span>{t('managedMode.tabs.logs')}</span>
          {config?.logging?.enabled && (
            <Badge dot />
          )}
        </Space>
      ),
      children: renderLogsPage()
    }
  ]

  /**
   * 渲染概览页面
   */
  function renderOverviewPage() {
    if (initialLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <Spin size="large">
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <div>{t('managedMode.loading.status')}</div>
            </div>
          </Spin>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '8px' }}>
        {/* 核心状态指标 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title={t('managedMode.stats.status')}
                value={status?.running ? t('managedMode.status.running') : t('managedMode.status.stopped')}
                prefix={status?.running ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                valueStyle={{
                  color: getStatusColor(),
                  fontSize: '18px',
                  fontWeight: 'bold'
                }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title={t('managedMode.stats.port')}
                value={status?.port || 8487}
                prefix={<ApiOutlined />}
                valueStyle={{ fontSize: '18px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title={t('managedMode.stats.pid')}
                value={status?.pid || '-'}
                prefix={<DatabaseOutlined />}
                valueStyle={{ fontSize: '18px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title={t('managedMode.stats.uptime')}
                value={uptime}
                prefix={<ClockCircleOutlined />}
                valueStyle={{ fontSize: '18px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
        </Row>

        {/* 服务健康度和服务控制 */}
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={16}>
            <Card
              title={
                <Space>
                  <MonitorOutlined />
                  <span>{t('managedMode.service.title')}</span>
                </Space>
              }
              extra={
                <Space>
                  {status?.running ? (
                    <Button
                      type="primary"
                      danger
                      icon={<StopOutlined />}
                      onClick={handleDisableManagedMode}
                      loading={loading}
                    >
                      {t('managedMode.buttons.disable')}
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleEnableManagedMode}
                      loading={loading}
                    >
                      {t('managedMode.buttons.enable')}
                    </Button>
                  )}
                  {status?.running && (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleRestartService}
                      loading={loading}
                    >
                      {t('managedMode.buttons.restart')}
                    </Button>
                  )}
                </Space>
              }
              style={{ borderRadius: '12px' }}
            >
              {status?.running && (
                <div style={{ marginBottom: '16px' }}>
                  <Text strong>{t('managedMode.health.title')}</Text>
                  <Progress
                    percent={getHealthScore()}
                    status={getHealthScore() >= 90 ? 'success' : getHealthScore() >= 70 ? 'normal' : 'exception'}
                    strokeColor={
                      getHealthScore() >= 90
                        ? '#52c41a' // 绿色：健康
                        : getHealthScore() >= 70
                        ? '#faad14' // 黄色：警告
                        : '#ff4d4f' // 红色：异常
                    }
                    style={{ marginTop: '8px' }}
                  />
                  {normalLogCount + errorLogCount > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      <Text type="secondary">
                        {t('managedMode.health.logStats', { normal: normalLogCount, error: errorLogCount })}
                      </Text>
                    </div>
                  )}
                </div>
              )}

              <Alert
                type={status?.running ? 'success' : 'info'}
                message={status?.running ? t('managedMode.alert.running') : t('managedMode.alert.stopped')}
                description={
                  status?.running ? (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <Space>
                          <ApiOutlined style={{ color: '#1890ff' }} />
                          <Text strong>{t('managedMode.proxy.title')}</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.proxy.address')}</Text>
                            <Text code copyable>{getEnhancedServiceInfo().proxyUrl}</Text>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.proxy.token')}</Text>
                            <Text code copyable>{getEnhancedServiceInfo().proxyToken}</Text>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <Space>
                          <CloudServerOutlined style={{ color: '#52c41a' }} />
                          <Text strong>{t('managedMode.upstream.title')}</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.upstream.name')}</Text>
                            <Text code>{getEnhancedServiceInfo().providerName}</Text>
                          </div>
                          {getEnhancedServiceInfo().providerUrl && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>{t('managedMode.upstream.address')}</Text>
                              <Text code copyable>{getEnhancedServiceInfo().providerUrl}</Text>
                            </div>
                          )}
                          {getEnhancedServiceInfo().providerKey && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>{t('managedMode.upstream.key')}</Text>
                              <Text code copyable={{ text: getEnhancedServiceInfo().providerRawKey }}>
                                {getEnhancedServiceInfo().providerKey}
                              </Text>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <Space>
                          <GlobalOutlined style={{ color: '#722ed1' }} />
                          <Text strong>{t('managedMode.network.title')}</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.network.status')}</Text>
                            <Tag color={getEnhancedServiceInfo().networkProxy.enabled ? 'green' : 'default'}>
                              {getEnhancedServiceInfo().networkProxy.enabled ? t('managedMode.status.enabled') : t('managedMode.status.disabled')}
                            </Tag>
                          </div>
                          {getEnhancedServiceInfo().networkProxy.enabled && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>{t('managedMode.network.address')}</Text>
                              <Text code>{getEnhancedServiceInfo().networkProxyDisplay}</Text>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Space>
                          <DashboardOutlined style={{ color: '#fa8c16' }} />
                          <Text strong>{t('managedMode.runtime.title')}</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.runtime.uptime')}</Text>
                            <Text code>{uptime}</Text>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>{t('managedMode.runtime.health')}</Text>
                            <Text strong>{getHealthScore()}%</Text>
                          </div>
                        </div>
                      </div>
                    </Space>
                  ) : (
                    <Text>{t('managedMode.hint.enable')}</Text>
                  )
                }
                showIcon
              />
            </Card>
          </Col>

          <Col xs={24} lg={8}>
            <Row gutter={[16, 16]}>
              <Col xs={24}>
                <Card
                  title={
                    <Space>
                      <GlobalOutlined />
                      <span>{t('managedMode.cards.network.title')}</span>
                    </Space>
                  }
                  size="small"
                  style={{ borderRadius: '12px' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.network.status')}</Text>
                      <Tag color={getEnhancedServiceInfo().networkProxy.enabled ? 'green' : 'default'}>
                        {getEnhancedServiceInfo().networkProxy.enabled ? t('managedMode.status.enabled') : t('managedMode.status.disabled')}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.network.address')}</Text>
                      <Text code>{getEnhancedServiceInfo().networkProxyDisplay}</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.network.port')}</Text>
                      <Text code>{config?.port || 8487}</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.network.connection')}</Text>
                      <Tag color={status?.running ? 'green' : 'default'}>
                        {status?.running ? t('managedMode.connection.normal') : t('managedMode.connection.disconnected')}
                      </Tag>
                    </div>
                  </Space>
                </Card>
              </Col>

              <Col xs={24}>
                <Card
                  title={
                    <Space>
                      <SafetyCertificateOutlined />
                      <span>{t('managedMode.cards.security.title')}</span>
                    </Space>
                  }
                  size="small"
                  style={{ borderRadius: '12px' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.security.accessToken')}</Text>
                      <Tag color={config?.accessToken ? 'green' : 'orange'}>
                        {config?.accessToken ? t('managedMode.status.set') : t('managedMode.status.unset')}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.security.encryption')}</Text>
                      <Tag color="green">{t('managedMode.status.enabled')}</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{t('managedMode.cards.security.accessControl')}</Text>
                      <Tag color="green">{t('managedMode.status.enabled')}</Tag>
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Col>
        </Row>

        {/* 实时日志 */}
        <Card
          title={
            <Space>
              <BugOutlined />
              <span>{t('managedMode.logs.realtime')}</span>
              <Badge dot={config?.logging?.enabled} />
            </Space>
          }
          style={{ borderRadius: '12px' }}
        >
          <TerminalLogViewer
            debugMode={config?.logging?.enabled || false}
            height="300px"
            maxEntries={100}
            logTypeFilter="request-response"
          />
        </Card>
      </div>
    )
  }

  /**
   * 渲染配置页面
   */
  function renderConfigPage() {
    return (
      <div style={{ padding: '8px' }}>
        <ManagedModeConfigEditor
          managedModeConfig={config}
          configs={configs}
          onConfigChange={handleConfigChange}
          onRestartService={handleRestartService}
        />
      </div>
    )
  }

  /**
   * 渲染运行日志页面
   */
  function renderLogsPage() {
    return (
      <div style={{ padding: '8px' }}>
        <Card
          title={
            <Space>
              <BugOutlined />
              <span>{t('managedMode.logs.title')}</span>
            </Space>
          }
          style={{ borderRadius: '12px' }}
        >
          <TerminalLogViewer
            debugMode={true}
            height="600px"
            maxEntries={2000}
            logTypeFilter="system"
          />
        </Card>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh', background: '#f5f5f5' }}>
      <style>{`
        /* 修复Card标题溢出问题 */
        .ant-card-head {
          overflow: hidden;
        }

        .ant-card-head-title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ant-card-extra {
          flex-shrink: 0;
          margin-left: 8px;
        }
      `}</style>

      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ color: '#1890ff', marginBottom: '8px' }}>
          {t('managedMode.title')}
        </Title>
        <Paragraph style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          {t('managedMode.subtitle')}
        </Paragraph>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
        }}
        items={tabItems}
      />
    </div>
  )
}

export default ManagedModePanel