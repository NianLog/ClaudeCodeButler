/**
 * Claude Code使用分析组件
 * 展示Claude Code的模型使用、项目统计和Token消耗
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Empty,
  Typography,
  Button,
  Spin,
  message,
  Tooltip,
  Space,
  Alert
} from 'antd'
import {
  ThunderboltOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ProjectOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ClearOutlined,
  CloudDownloadOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useTranslation } from '../../locales/useTranslation'

const { Title, Text } = Typography

/**
 * Claude Code分析数据接口
 */
interface ClaudeCodeAnalytics {
  modelStats: Array<{
    modelName: string
    usageCount: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheReadTokens: number
    totalCacheCreationTokens: number
    lastUsed: string
  }>
  projectStats: Array<{
    projectPath: string
    projectName: string
    sessionCount: number
    totalMessages: number
    totalTokens: number
    firstUsed: string
    lastUsed: string
    models: Record<string, number>
  }>
  totalSessions: number
  totalMessages: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheTokens: number
  firstActivity: string | null
  lastActivity: string | null
  lastUpdated: string
}

/**
 * 颜色配置
 */
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1']

/**
 * Claude Code分析组件
 */
const ClaudeCodeAnalytics: React.FC = () => {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [analytics, setAnalytics] = useState<ClaudeCodeAnalytics | null>(null)
  const [versionInfo, setVersionInfo] = useState<any>(null)
  const [versionLoading, setVersionLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    loadAnalytics()
    loadVersionInfo()
  }, [])

  /**
   * 加载分析数据
   */
  const loadAnalytics = async (forceRefresh = false) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.claudeCode.getAnalytics(forceRefresh)

      if (result.success) {
        setAnalytics(result.data)
        if (forceRefresh) {
          message.success(t('claudeAnalytics.messages.refreshed'))
        }
      } else {
        throw new Error(result.error || t('claudeAnalytics.messages.fetchFailed'))
      }
    } catch (error) {
      console.error(t('claudeAnalytics.messages.loadFailed'), error)
      message.error(`${t('claudeAnalytics.messages.loadFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 清除缓存
   */
  const clearCache = async () => {
    try {
      await window.electronAPI.claudeCode.clearCache()
      message.success(t('claudeAnalytics.messages.cacheCleared'))
      await loadAnalytics(true)
    } catch (error) {
      console.error(t('claudeAnalytics.messages.clearCacheFailed'), error)
      message.error(t('claudeAnalytics.messages.clearCacheFailed'))
    }
  }

  /**
   * 加载版本信息
   */
  const loadVersionInfo = async (forceRefresh = false) => {
    setVersionLoading(true)
    try {
      const result = await window.electronAPI.claudeCodeVersion.checkUpdates(forceRefresh)

      if (result.success) {
        setVersionInfo(result.data)
      } else {
        console.error(t('claudeAnalytics.messages.versionFetchFailed'), result.error)
      }
    } catch (error) {
      console.error(t('claudeAnalytics.messages.versionLoadFailed'), error)
    } finally {
      setVersionLoading(false)
    }
  }

  /**
   * 执行更新
   */
  const handleUpdate = async () => {
    setUpdating(true)
    try {
      const result = await window.electronAPI.claudeCodeVersion.update()

      if (result.success) {
        if (result.data.success) {
          message.success(result.data.message || t('claudeAnalytics.messages.updateSuccess'))
          // 更新完成后刷新版本信息
          await loadVersionInfo(true)
        } else {
          message.error(result.data.message || t('claudeAnalytics.messages.updateFailed'))
        }
      } else {
        message.error(result.error || t('claudeAnalytics.messages.updateFailed'))
      }
    } catch (error) {
      console.error(t('claudeAnalytics.messages.updateFailed'), error)
      message.error(`${t('claudeAnalytics.messages.updateFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setUpdating(false)
    }
  }

  /**
   * 格式化数字
   */
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toString()
  }

  /**
   * 格式化模型名称 - 智能提取版本号
   * 示例:
   * - claude-sonnet-4-5-20250929 -> Sonnet 4.5
   * - claude-sonnet-4-20250514 -> Sonnet 4
   * - claude-opus-3-5-20241022 -> Opus 3.5
   * - claude-haiku-3-5-20240307 -> Haiku 3.5
   */
  const formatModelName = (modelName: string): string => {
    const lowerName = modelName.toLowerCase()

    // 提取模型类型 (sonnet, opus, haiku)
    let modelType = ''
    if (lowerName.includes('sonnet')) {
      modelType = 'Sonnet'
    } else if (lowerName.includes('opus')) {
      modelType = 'Opus'
    } else if (lowerName.includes('haiku')) {
      modelType = 'Haiku'
    } else {
      // 未知类型,返回原始名称
      return modelName
    }

    // 针对Claude命名规则的特定匹配模式
    // 格式: claude-{type}-{major}-{minor?}-{date}
    // 例如: claude-sonnet-4-5-20250929, claude-sonnet-4-20250514
    const claudePattern = /(?:claude-)?(?:sonnet|opus|haiku)-(\d+)(?:-(\d+))?-\d{8}/i
    const match = modelName.match(claudePattern)

    if (match) {
      const major = match[1]
      const minor = match[2]

      if (minor) {
        // 有小版本号: claude-sonnet-4-5-20250929 -> Sonnet 4.5
        return `${modelType} ${major}.${minor}`
      } else {
        // 只有主版本号: claude-sonnet-4-20250514 -> Sonnet 4
        return `${modelType} ${major}`
      }
    }

    // 通用版本号匹配 (兜底方案)
    const generalPattern = /(\d+)[.-_](\d+)/
    const generalMatch = modelName.match(generalPattern)

    if (generalMatch) {
      return `${modelType} ${generalMatch[1]}.${generalMatch[2]}`
    }

    // 如果没有找到版本号,只返回模型类型
    return modelType
  }

  /**
   * 格式化Y轴数字(Token数量)
   */
  const formatYAxisNumber = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`
    }
    return value.toString()
  }

  /**
   * 模型使用表格列配置
   */
  const modelColumns: ColumnsType<any> = [
    {
      title: t('claudeAnalytics.models.columns.name'),
      dataIndex: 'modelName',
      key: 'modelName',
      render: (name: string) => (
        <Space>
          <RobotOutlined style={{ color: '#3b82f6' }} />
          <Tooltip title={name}>
            <Text strong>{formatModelName(name)}</Text>
          </Tooltip>
        </Space>
      )
    },
    {
      title: t('claudeAnalytics.models.columns.usageCount'),
      dataIndex: 'usageCount',
      key: 'usageCount',
      sorter: (a, b) => a.usageCount - b.usageCount,
      render: (count: number) => (
        <Tag color="blue">{t('claudeAnalytics.units.times', { count: formatNumber(count) })}</Tag>
      )
    },
    {
      title: t('claudeAnalytics.models.columns.inputTokens'),
      dataIndex: 'totalInputTokens',
      key: 'totalInputTokens',
      sorter: (a, b) => a.totalInputTokens - b.totalInputTokens,
      render: (tokens: number) => formatNumber(tokens)
    },
    {
      title: t('claudeAnalytics.models.columns.outputTokens'),
      dataIndex: 'totalOutputTokens',
      key: 'totalOutputTokens',
      sorter: (a, b) => a.totalOutputTokens - b.totalOutputTokens,
      render: (tokens: number) => formatNumber(tokens)
    },
    {
      title: t('claudeAnalytics.models.columns.cacheTokens'),
      dataIndex: 'totalCacheReadTokens',
      key: 'cacheTokens',
      sorter: (a, b) => (a.totalCacheReadTokens + a.totalCacheCreationTokens) - (b.totalCacheReadTokens + b.totalCacheCreationTokens),
      render: (_, record) => formatNumber(record.totalCacheReadTokens + record.totalCacheCreationTokens)
    },
    {
      title: t('claudeAnalytics.models.columns.lastUsed'),
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      sorter: (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm')
    }
  ]

  /**
   * 项目使用表格列配置
   */
  const projectColumns: ColumnsType<any> = [
    {
      title: t('claudeAnalytics.projects.columns.name'),
      dataIndex: 'projectName',
      key: 'projectName',
      render: (name: string, record) => (
        <Space direction="vertical" size={0}>
          <Space>
            <ProjectOutlined style={{ color: '#10b981' }} />
            <Text strong>{name}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: '12px' }}>{record.projectPath}</Text>
        </Space>
      )
    },
    {
      title: t('claudeAnalytics.projects.columns.sessionCount'),
      dataIndex: 'sessionCount',
      key: 'sessionCount',
      sorter: (a, b) => a.sessionCount - b.sessionCount,
      render: (count: number) => <Tag color="purple">{t('claudeAnalytics.units.items', { count })}</Tag>
    },
    {
      title: t('claudeAnalytics.projects.columns.messageCount'),
      dataIndex: 'totalMessages',
      key: 'totalMessages',
      sorter: (a, b) => a.totalMessages - b.totalMessages,
      render: (count: number) => formatNumber(count)
    },
    {
      title: t('claudeAnalytics.projects.columns.totalTokens'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      sorter: (a, b) => a.totalTokens - b.totalTokens,
      render: (tokens: number) => formatNumber(tokens)
    },
    {
      title: t('claudeAnalytics.projects.columns.models'),
      dataIndex: 'models',
      key: 'models',
      render: (models: Record<string, number>) => (
        <Space wrap>
          {Object.entries(models).slice(0, 2).map(([model, count]) => (
            <Tooltip key={model} title={`${model}: ${t('claudeAnalytics.units.times', { count })}`}>
              <Tag color="geekblue" style={{ fontSize: '11px' }}>
                {formatModelName(model)}
              </Tag>
            </Tooltip>
          ))}
          {Object.keys(models).length > 2 && (
            <Tooltip title={Object.entries(models).slice(2).map(([m, c]) => `${m}: ${t('claudeAnalytics.units.times', { count: c })}`).join('\n')}>
              <Tag style={{ fontSize: '11px' }}>+{Object.keys(models).length - 2}</Tag>
            </Tooltip>
          )}
        </Space>
      )
    },
    {
      title: t('claudeAnalytics.projects.columns.lastUsed'),
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      sorter: (a, b) => new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm')
    }
  ]

  if (loading && !analytics) {
    return (
      <div style={{
        padding: '24px',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Spin size="large" spinning={true} tip="" />
      </div>
    )
  }

  if (!analytics) {
    return (
      <Empty
        description={t('claudeAnalytics.empty.description')}
        style={{ padding: '48px' }}
      />
    )
  }

  // 准备图表数据
  const modelChartData = analytics.modelStats.map(stat => ({
    name: formatModelName(stat.modelName),
    value: stat.usageCount,
    fullName: stat.modelName
  }))

  const tokenChartData = analytics.modelStats.map(stat => ({
    name: formatModelName(stat.modelName),
    input: stat.totalInputTokens,
    output: stat.totalOutputTokens,
    cache: stat.totalCacheReadTokens + stat.totalCacheCreationTokens
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 头部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            <RobotOutlined /> {t('claudeAnalytics.title')}
          </Title>
          <Text type="secondary">
            {t('claudeAnalytics.lastUpdated')}: {dayjs(analytics.lastUpdated).format('YYYY-MM-DD HH:mm:ss')}
          </Text>
        </Space>
        <Space>
          <Button
            icon={<ClearOutlined />}
            onClick={clearCache}
          >
            {t('claudeAnalytics.actions.clearCache')}
          </Button>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => loadAnalytics(true)}
          >
            {t('claudeAnalytics.actions.refresh')}
          </Button>
        </Space>
      </div>

      {/* Claude Code版本信息 */}
      {versionInfo && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space direction="vertical" size={4}>
              <Space>
                <RobotOutlined style={{ fontSize: '20px', color: '#3b82f6' }} />
                <Text strong style={{ fontSize: '16px' }}>{t('claudeAnalytics.version.title')}</Text>
              </Space>

              {versionInfo.current ? (
                <Space size="large">
                  <div>
                    <Text type="secondary">{t('claudeAnalytics.version.current')}: </Text>
                    <Tag color="blue">{versionInfo.current}</Tag>
                  </div>
                  {versionInfo.latest && (
                    <div>
                      <Text type="secondary">{t('claudeAnalytics.version.latest')}: </Text>
                      <Tag color={versionInfo.updateAvailable ? 'orange' : 'green'}>
                        {versionInfo.latest}
                      </Tag>
                    </div>
                  )}
                </Space>
              ) : (
                <Alert
                  message={t('claudeAnalytics.version.notDetected')}
                  description={t('claudeAnalytics.version.notDetectedDesc')}
                  type="warning"
                  showIcon
                  icon={<WarningOutlined />}
                  style={{ marginTop: '8px' }}
                />
              )}
            </Space>

            <Space>
              {versionInfo.updateAvailable && (
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  loading={updating}
                  onClick={handleUpdate}
                >
                  {t('claudeAnalytics.version.updateTo', { version: versionInfo.latest })}
                </Button>
              )}
              {versionInfo.current && !versionInfo.updateAvailable && (
                <Button
                  icon={<CheckCircleOutlined />}
                  disabled
                >
                  {t('claudeAnalytics.version.upToDate')}
                </Button>
              )}
              <Button
                icon={<ReloadOutlined />}
                loading={versionLoading}
                onClick={() => loadVersionInfo(true)}
              >
                {t('claudeAnalytics.version.checkUpdates')}
              </Button>
            </Space>
          </div>
        </Card>
      )}

      {/* 概览统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('claudeAnalytics.metrics.totalSessions')}
              value={analytics.totalSessions}
              prefix={<DatabaseOutlined />}
              valueStyle={{ color: '#3b82f6' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('claudeAnalytics.metrics.totalMessages')}
              value={analytics.totalMessages}
              prefix={<FireOutlined />}
              valueStyle={{ color: '#8b5cf6' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('claudeAnalytics.metrics.inputTokens')}
              value={formatNumber(analytics.totalInputTokens)}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#10b981' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t('claudeAnalytics.metrics.outputTokens')}
              value={formatNumber(analytics.totalOutputTokens)}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 */}
      <Row gutter={[16, 16]}>
        {/* 模型使用分布 */}
        <Col xs={24} lg={12}>
          <Card title={t('claudeAnalytics.sections.modelDistribution')} variant="borderless">
            {modelChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={modelChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {modelChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description={t('claudeAnalytics.empty.modelUsage')} />
            )}
          </Card>
        </Col>

        {/* Token使用对比 */}
        <Col xs={24} lg={12}>
          <Card title={t('claudeAnalytics.sections.tokenComparison')} variant="borderless">
            {tokenChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={tokenChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={formatYAxisNumber} />
                  <RechartsTooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                  <Bar dataKey="input" fill="#3b82f6" name={t('claudeAnalytics.charts.input')} />
                  <Bar dataKey="output" fill="#10b981" name={t('claudeAnalytics.charts.output')} />
                  <Bar dataKey="cache" fill="#8b5cf6" name={t('claudeAnalytics.charts.cache')} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty description={t('claudeAnalytics.empty.tokenUsage')} />
            )}
          </Card>
        </Col>
      </Row>

      {/* 模型使用详情表格 */}
      <Card title={t('claudeAnalytics.sections.modelDetails')} variant="borderless">
        <Table
          dataSource={analytics.modelStats}
          columns={modelColumns}
          rowKey="modelName"
          pagination={{ pageSize: 5, showSizeChanger: true, showTotal: (total) => t('claudeAnalytics.pagination.modelsTotal', { total }) }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 项目使用详情表格 */}
      <Card title={t('claudeAnalytics.sections.projectDetails')} variant="borderless">
        <Table
          dataSource={analytics.projectStats}
          columns={projectColumns}
          rowKey="projectPath"
          pagination={{ pageSize: 5, showSizeChanger: true, showTotal: (total) => t('claudeAnalytics.pagination.projectsTotal', { total }) }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* 活动时间范围 */}
      {analytics.firstActivity && analytics.lastActivity && (
        <Card>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space>
              <ClockCircleOutlined />
              <Text strong>{t('claudeAnalytics.sections.activityRange')}</Text>
            </Space>
            <Row gutter={16}>
              <Col span={12}>
                <Text type="secondary">{t('claudeAnalytics.sections.firstActivity')}: </Text>
                <Text>{dayjs(analytics.firstActivity).format('YYYY-MM-DD HH:mm:ss')}</Text>
              </Col>
              <Col span={12}>
                <Text type="secondary">{t('claudeAnalytics.sections.lastActivity')}: </Text>
                <Text>{dayjs(analytics.lastActivity).format('YYYY-MM-DD HH:mm:ss')}</Text>
              </Col>
            </Row>
          </Space>
        </Card>
      )}
    </div>
  )
}

export default ClaudeCodeAnalytics
