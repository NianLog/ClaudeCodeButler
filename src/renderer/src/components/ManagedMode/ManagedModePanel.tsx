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
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
  Tabs,
  Descriptions,
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
  KeyOutlined,
  GlobalOutlined,
  LockOutlined,
  UnlockOutlined,
  EllipsisOutlined,
  WarningOutlined,
  CloudServerOutlined,
  DashboardOutlined
} from '@ant-design/icons'
import type {
  ManagedModeStatus,
  ManagedModeConfig,
  ApiProvider
} from '../../../shared/types/managed-mode'
import type { ConfigFile } from '@shared/types'
import ManagedModeConfigEditor from './ManagedModeConfigEditor'
import TerminalLogViewer from './TerminalLogViewer'
import { useManagedModeLogStore } from '../../store/managed-mode-log-store'
import './ManagedModePanel.css'

const { Text, Title, Paragraph } = Typography
const { Search } = Input
const { Option } = Select

/**
 * 托管模式管理面板组件
 */
const ManagedModePanel: React.FC = () => {
  // 从全局store读取日志统计数据（用于动态计算健康度）
  const { normalLogCount, errorLogCount } = useManagedModeLogStore()

  // 状态管理
  const [status, setStatus] = useState<ManagedModeStatus | null>(null)
  const [config, setConfig] = useState<ManagedModeConfig | null>(null)
  const [configs, setConfigs] = useState<ConfigFile[]>([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [providerModalVisible, setProviderModalVisible] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ApiProvider | null>(null)
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [uptime, setUptime] = useState<string>('0分钟')
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
      setConfigs(configsData?.data || [])
    } catch (error: any) {
      message.error(`加载数据失败: ${error.message}`)
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
          setUptime(`${minutes}分钟`)
        } else {
          const hours = Math.floor(minutes / 60)
          const remainingMinutes = minutes % 60
          setUptime(`${hours}小时${remainingMinutes}分钟`)
        }
      } else {
        setUptime('0分钟')
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
        message.success(result.message || '托管模式已启用')
        await loadData()
      } else {
        message.error(result.error || '启用托管模式失败')
      }
    } catch (error: any) {
      message.error(`启用托管模式失败: ${error.message}`)
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
        message.success(result.message || '托管模式已禁用')
        await loadData()
      } else {
        message.error(result.error || '禁用托管模式失败')
      }
    } catch (error: any) {
      message.error(`禁用托管模式失败: ${error.message}`)
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
      message.success('托管服务已重启')
      await loadData()
    } catch (error: any) {
      message.error(`重启托管服务失败: ${error.message}`)
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
          throw new Error(updateResult.error || '更新托管模式配置失败')
        }
      }

      // 2. 等待服务重启完成
      await new Promise(resolve => setTimeout(resolve, 500))

      // 3. 更新系统settings.json配置
      const result = await window.electronAPI.managedMode.updateSettingsConfig(configData)

      if (!result.success) {
        throw new Error(result.error || '写入系统配置失败')
      }

      // 4. 等待一小段时间确保文件写入完成
      await new Promise(resolve => setTimeout(resolve, 100))

      // 5. 重新加载托管模式状态和配置
      await loadData()

      // 6. 强制刷新配置列表（如果有变更）
      if (typeof window.electronAPI.config !== 'undefined') {
        try {
          await window.electronAPI.config.refreshConfigs?.()
        } catch (error) {
          // 忽略刷新配置列表的错误，不影响主流程
          console.log('刷新配置列表失败:', error)
        }
      }

      message.success('托管服务配置已更新并重启')

    } catch (error: any) {
      console.error('更新配置失败:', error)
      message.error(`更新配置失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 计算运行时长
   */
  const calculateUptime = useCallback((startTime: number) => {
    const minutes = Math.floor((Date.now() - startTime) / 1000 / 60)
    if (minutes < 60) return `${minutes}分钟`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}小时${remainingMinutes}分钟`
  }, [])

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
      providerName: providerInfo?.name || '未配置',
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
   * 格式化访问令牌显示(已废弃,保留以防兼容性问题)
   */
  const formatToken = (token: string) => {
    if (!token || token.length < 7) return token
    return `${token.substring(0, 3)}***${token.substring(token.length - 3)}`
  }

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
        : '未启用'
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
          <span>概览</span>
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
          <span>配置</span>
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
          <span>运行日志</span>
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
              <div>加载托管模式状态...</div>
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
                title="运行状态"
                value={status?.running ? "运行中" : "已停止"}
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
                title="监听端口"
                value={status?.port || 8487}
                prefix={<ApiOutlined />}
                valueStyle={{ fontSize: '18px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title="进程ID"
                value={status?.pid || '-'}
                prefix={<DatabaseOutlined />}
                valueStyle={{ fontSize: '18px', fontWeight: 'bold' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
              <Statistic
                title="运行时长"
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
                  <span>服务状态</span>
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
                      停用托管模式
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleEnableManagedMode}
                      loading={loading}
                    >
                      启用托管模式
                    </Button>
                  )}
                  {status?.running && (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleRestartService}
                      loading={loading}
                    >
                      重启服务
                    </Button>
                  )}
                </Space>
              }
              style={{ borderRadius: '12px' }}
            >
              {status?.running && (
                <div style={{ marginBottom: '16px' }}>
                  <Text strong>服务健康度</Text>
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
                        日志统计: 正常 {normalLogCount} / 错误 {errorLogCount}
                      </Text>
                    </div>
                  )}
                </div>
              )}

              <Alert
                type={status?.running ? 'success' : 'info'}
                message={status?.running ? '托管模式正在运行' : '托管模式已停止'}
                description={
                  status?.running ? (
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <div style={{ marginBottom: '12px' }}>
                        <Space>
                          <ApiOutlined style={{ color: '#1890ff' }} />
                          <Text strong>托管代理服务</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>代理地址:</Text>
                            <Text code copyable>{getEnhancedServiceInfo().proxyUrl}</Text>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>访问密钥:</Text>
                            <Text code copyable>{getEnhancedServiceInfo().proxyToken}</Text>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <Space>
                          <CloudServerOutlined style={{ color: '#52c41a' }} />
                          <Text strong>上游服务</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>服务名称:</Text>
                            <Text code>{getEnhancedServiceInfo().providerName}</Text>
                          </div>
                          {getEnhancedServiceInfo().providerUrl && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>上游地址:</Text>
                              <Text code copyable>{getEnhancedServiceInfo().providerUrl}</Text>
                            </div>
                          )}
                          {getEnhancedServiceInfo().providerKey && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>上游密钥:</Text>
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
                          <Text strong>网络代理</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>代理状态:</Text>
                            <Tag color={getEnhancedServiceInfo().networkProxy.enabled ? 'green' : 'default'}>
                              {getEnhancedServiceInfo().networkProxy.enabled ? '已启用' : '未启用'}
                            </Tag>
                          </div>
                          {getEnhancedServiceInfo().networkProxy.enabled && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text>代理地址:</Text>
                              <Text code>{getEnhancedServiceInfo().networkProxyDisplay}</Text>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Space>
                          <DashboardOutlined style={{ color: '#fa8c16' }} />
                          <Text strong>运行状态</Text>
                        </Space>
                        <Divider style={{ margin: '8px 0' }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>运行时长:</Text>
                            <Text code>{uptime}</Text>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Text>健康评分:</Text>
                            <Text strong>{getHealthScore()}%</Text>
                          </div>
                        </div>
                      </div>
                    </Space>
                  ) : (
                    <Text>点击"启用托管模式"按钮启动托管服务</Text>
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
                      <span>网络代理</span>
                    </Space>
                  }
                  size="small"
                  style={{ borderRadius: '12px' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>网络代理状态</Text>
                      <Tag color={getEnhancedServiceInfo().networkProxy.enabled ? 'green' : 'default'}>
                        {getEnhancedServiceInfo().networkProxy.enabled ? '已启用' : '已禁用'}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>代理地址</Text>
                      <Text code>{getEnhancedServiceInfo().networkProxyDisplay}</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>监听端口</Text>
                      <Text code>{config?.port || 8487}</Text>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>连接状态</Text>
                      <Tag color={status?.running ? 'green' : 'default'}>
                        {status?.running ? '正常' : '断开'}
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
                      <span>安全状态</span>
                    </Space>
                  }
                  size="small"
                  style={{ borderRadius: '12px' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>访问令牌</Text>
                      <Tag color={config?.accessToken ? 'green' : 'orange'}>
                        {config?.accessToken ? '已设置' : '未设置'}
                      </Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>加密状态</Text>
                      <Tag color="green">已启用</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>访问控制</Text>
                      <Tag color="green">已启用</Tag>
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
              <span>实时日志</span>
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
              <span>运行日志</span>
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
          托管模式
        </Title>
        <Paragraph style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          通过本地托管服务统一管理API服务商，实现配置热切换和请求转发
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