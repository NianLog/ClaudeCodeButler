/**
 * 统计面板组件
 * 提供使用统计和分析功能
 */

import React, { useEffect, useState, Suspense } from 'react'
import {
  Col,
  Statistic,
  Select,
  DatePicker,
  Space,
  Table,
  Progress,
  Row,
  Tag,
  Empty,
  Typography,
  Button,
  Spin,
  App,
  Tabs,
  Card
} from 'antd'
import {
  BarChartOutlined,
  LineChartOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  FireOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  DownloadOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { RangePickerProps } from 'antd/es/date-picker'
import dayjs from 'dayjs'
import { useTranslation } from '../../locales/useTranslation'

const { Option } = Select
const { RangePicker } = DatePicker
const { Text, Title } = Typography
const ClaudeCodeAnalytics = React.lazy(() => import('./ClaudeCodeAnalytics'))
/**
 * 统计数据接口
 */
interface StatisticsData {
  system: {
    totalConfigs: number
    totalRules: number
    totalConfigSwitches: number
    totalRuleExecutions: number
    totalErrors: number
    appStartCount: number
    totalUptime: number
    lastStartTime: number
    avgResponseTime: number
  }
  configUsage: Array<{
    configName: string
    configPath: string
    switchCount: number
    lastUsed: number
    totalDuration: number
    editCount: number
  }>
  ruleExecution: Array<{
    ruleId: string
    ruleName: string
    totalExecutions: number
    successCount: number
    failureCount: number
    avgDuration: number
    lastExecuted: number
  }>
  timeRange: {
    start: number
    end: number
  }
}

/**
 * 统计面板组件
 */
const StatisticsPanel: React.FC = () => {
  const { message: antdMessage } = App.useApp()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(false)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'custom'>('30d')
  const [dateRange, setDateRange] = useState<RangePickerProps['value']>(null)
  const [statistics, setStatistics] = useState<StatisticsData | null>(null)

  useEffect(() => {
    loadStatistics()
  }, [timeRange, dateRange])

  /**
   * 计算时间范围
   */
  const getTimeRange = (): { start: number; end: number } | undefined => {
    const now = Date.now()

    if (timeRange === 'custom' && dateRange && dateRange[0] && dateRange[1]) {
      return {
        start: dateRange[0].valueOf(),
        end: dateRange[1].valueOf()
      }
    }

    const ranges: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    }

    if (timeRange in ranges) {
      return {
        start: now - ranges[timeRange as keyof typeof ranges],
        end: now
      }
    }

    return undefined
  }

  /**
   * 加载统计数据
   */
  const loadStatistics = async () => {
    setLoading(true)
    try {
      const range = getTimeRange()
      const response = await window.electronAPI.statistics.getSummary(range)

      if (response && response.success) {
        setStatistics(response.data)
      } else {
        antdMessage.error(response?.error || t('statistics.messages.loadFailed'))
      }
    } catch (error) {
      console.error(t('statistics.messages.loadFailed'), error)
      antdMessage.error(t('statistics.messages.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  /**
   * 刷新统计数据
   */
  const handleRefresh = async () => {
    await loadStatistics()
    antdMessage.success(t('statistics.messages.refreshed'))
  }

  /**
   * 导出统计数据
   */
  const handleExport = async () => {
    try {
      const exportPath = `statistics_${Date.now()}.json`
      await window.electronAPI.statistics.export(exportPath)
      antdMessage.success(t('statistics.messages.exported'))
    } catch (error) {
      console.error(t('statistics.messages.exportFailed'), error)
      antdMessage.error(t('statistics.messages.exportFailed'))
    }
  }

  /**
   * 处理时间范围变化
   */
  const handleTimeRangeChange = (value: '7d' | '30d' | '90d' | 'custom') => {
    setTimeRange(value)
    if (value !== 'custom') {
      setDateRange(null)
    }
  }

  /**
   * 处理日期范围变化
   */
  const handleDateRangeChange = (dates: RangePickerProps['value']) => {
    setDateRange(dates)
    if (dates && dates[0] && dates[1]) {
      setTimeRange('custom')
    }
  }

  /**
   * 格式化运行时长
   */
  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return t('statistics.uptime.daysHours', { days, hours: hours % 24 })
    if (hours > 0) return t('statistics.uptime.hoursMinutes', { hours, minutes: minutes % 60 })
    if (minutes > 0) return t('statistics.uptime.minutes', { minutes })
    return t('statistics.uptime.seconds', { seconds })
  }

  /**
   * 配置使用表格列定义
   */
  const configColumns: ColumnsType<any> = [
    {
      title: t('statistics.config.columns.name'),
      dataIndex: 'configName',
      key: 'configName',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <Text strong>{text}</Text>
        </div>
      )
    },
    {
      title: t('statistics.config.columns.switchCount'),
      dataIndex: 'switchCount',
      key: 'switchCount',
      sorter: (a, b) => a.switchCount - b.switchCount,
      render: (value: number) => (
        <Tag color="blue">{t('statistics.units.times', { count: value })}</Tag>
      )
    },
    {
      title: t('statistics.config.columns.editCount'),
      dataIndex: 'editCount',
      key: 'editCount',
      sorter: (a, b) => a.editCount - b.editCount,
      render: (value: number) => (
        <Tag color="green">{t('statistics.units.times', { count: value })}</Tag>
      )
    },
    {
      title: t('statistics.config.columns.lastUsed'),
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      sorter: (a, b) => a.lastUsed - b.lastUsed,
      render: (timestamp: number) => (
        <Text type="secondary">
          {timestamp > 0 ? dayjs(timestamp).format('YYYY-MM-DD HH:mm') : t('statistics.messages.neverUsed')}
        </Text>
      )
    }
  ]

  /**
   * 规则执行表格列定义
   */
  const ruleColumns: ColumnsType<any> = [
    {
      title: t('statistics.rules.columns.name'),
      dataIndex: 'ruleName',
      key: 'ruleName',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ThunderboltOutlined style={{ color: '#fa8c16' }} />
          <Text strong>{text}</Text>
        </div>
      )
    },
    {
      title: t('statistics.rules.columns.totalExecutions'),
      dataIndex: 'totalExecutions',
      key: 'totalExecutions',
      sorter: (a, b) => a.totalExecutions - b.totalExecutions,
      render: (value: number) => (
        <Tag color="blue">{t('statistics.units.times', { count: value })}</Tag>
      )
    },
    {
      title: t('statistics.rules.columns.successRate'),
      dataIndex: 'successRate',
      key: 'successRate',
      sorter: (a, b) => {
        const rateA = a.totalExecutions > 0 ? (a.successCount / a.totalExecutions) * 100 : 0
        const rateB = b.totalExecutions > 0 ? (b.successCount / b.totalExecutions) * 100 : 0
        return rateA - rateB
      },
      render: (_, record) => {
        const rate = record.totalExecutions > 0
          ? ((record.successCount / record.totalExecutions) * 100).toFixed(1)
          : '0.0'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Progress
              percent={parseFloat(rate)}
              size="small"
              strokeColor={parseFloat(rate) >= 80 ? '#52c41a' : '#faad14'}
              style={{ width: '100px' }}
              showInfo={false}
            />
            <Text>{rate}%</Text>
          </div>
        )
      }
    },
    {
      title: t('statistics.rules.columns.lastExecuted'),
      dataIndex: 'lastExecuted',
      key: 'lastExecuted',
      sorter: (a, b) => a.lastExecuted - b.lastExecuted,
      render: (timestamp: number) => (
        <Text type="secondary">
          {timestamp > 0 ? dayjs(timestamp).format('YYYY-MM-DD HH:mm') : t('statistics.messages.neverExecuted')}
        </Text>
      )
    }
  ]

  if (loading && !statistics) {
    return (
      <div style={{
        padding: '24px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Spin size="large" tip="" />
      </div>
    )
  }

  /**
   * 渲染应用统计标签页内容
   */
  const renderAppStatistics = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 头部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
            {t('statistics.actions.refresh')}
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            {t('statistics.actions.export')}
          </Button>
        </Space>
      </div>

      {/* 时间范围选择 */}
      <Card style={{ borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Text strong>{t('statistics.timeRange.label')}</Text>
          <Select
            value={timeRange}
            onChange={handleTimeRangeChange}
            style={{ width: 120 }}
          >
            <Option value="7d">{t('statistics.timeRange.last7Days')}</Option>
            <Option value="30d">{t('statistics.timeRange.last30Days')}</Option>
            <Option value="90d">{t('statistics.timeRange.last90Days')}</Option>
            <Option value="custom">{t('statistics.timeRange.custom')}</Option>
          </Select>
          {timeRange === 'custom' && (
            <RangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              placeholder={[t('statistics.timeRange.startDate'), t('statistics.timeRange.endDate')]}
              format="YYYY-MM-DD"
            />
          )}
        </div>
      </Card>

      {statistics ? (
        <>
          {/* 核心指标 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
                <Statistic
                  title={t('statistics.metrics.totalConfigs')}
                  value={statistics.system.totalConfigs}
                  prefix={<FileTextOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
                <Statistic
                  title={t('statistics.metrics.configSwitches')}
                  value={statistics.system.totalConfigSwitches}
                  suffix={t('statistics.units.timesSuffix')}
                  prefix={<FireOutlined style={{ color: '#ff4d4f' }} />}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
                <Statistic
                  title={t('statistics.metrics.totalRules')}
                  value={statistics.system.totalRules}
                  prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ borderRadius: '12px', textAlign: 'center' }}>
                <Statistic
                  title={t('statistics.metrics.ruleExecutions')}
                  value={statistics.system.totalRuleExecutions}
                  suffix={t('statistics.units.timesSuffix')}
                  prefix={<TrophyOutlined style={{ color: '#faad14' }} />}
                  valueStyle={{ color: '#faad14' }}
                />
              </Card>
            </Col>
          </Row>

          {/* 性能指标 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <Card style={{ borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: '#52c41a', marginBottom: '4px' }}>
                    {statistics.system.appStartCount}
                  </div>
                  <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <CheckCircleOutlined />
                    {t('statistics.metrics.appStarts')}
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card style={{ borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: '#13c2c2', marginBottom: '4px' }}>
                    {formatUptime(statistics.system.totalUptime)}
                  </div>
                  <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <ClockCircleOutlined />
                    {t('statistics.metrics.uptime')}
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card style={{ borderRadius: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: statistics.system.totalErrors > 0 ? '#f5222d' : '#52c41a', marginBottom: '4px' }}>
                    {statistics.system.totalErrors}
                  </div>
                  <div style={{ color: '#666', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {statistics.system.totalErrors > 0 ? <CloseCircleOutlined /> : <CheckCircleOutlined />}
                    {t('statistics.metrics.errorCount')}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 配置使用排行 */}
          {statistics.configUsage && statistics.configUsage.length > 0 && (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChartOutlined />
                  <span>{t('statistics.sections.configUsage')}</span>
                </div>
              }
              style={{ borderRadius: '12px' }}
            >
              <Table
                columns={configColumns}
                dataSource={statistics.configUsage}
                pagination={{ pageSize: 10 }}
                rowKey="configPath"
                size="small"
              />
            </Card>
          )}

          {/* 规则执行统计 */}
          {statistics.ruleExecution && statistics.ruleExecution.length > 0 && (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <LineChartOutlined />
                  <span>{t('statistics.sections.ruleExecution')}</span>
                </div>
              }
              style={{ borderRadius: '12px' }}
            >
              <Table
                columns={ruleColumns}
                dataSource={statistics.ruleExecution}
                pagination={{ pageSize: 10 }}
                rowKey="ruleId"
                size="small"
              />
            </Card>
          )}
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div style={{ marginBottom: 12 }}>{t('statistics.empty.description')}</div>
                  <Button type="primary" onClick={handleRefresh}>
                    {t('statistics.empty.refresh')}
                  </Button>
                </div>
              }
          />
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{ marginBottom: '24px' }}>
        <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>{t('statistics.title')}</Title>
        <Text type="secondary">{t('statistics.subtitle')}</Text>
      </div>

      {/* 标签页 */}
      <Tabs
        defaultActiveKey="app"
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: 'app',
            label: (
              <span>
                <BarChartOutlined />
                {t('statistics.tabs.app')}
              </span>
            ),
            children: loading && !statistics ? (
              <div style={{
                height: '400px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Spin size="large" spinning={true} tip={t('statistics.messages.loading')} />
              </div>
            ) : (
              <div style={{ height: 'calc(100vh - 200px)', overflow: 'auto', paddingRight: '8px' }}>
                {renderAppStatistics()}
              </div>
            )
          },
          {
            key: 'claudeCode',
            label: (
              <span>
                <RobotOutlined />
                {t('statistics.tabs.claudeCode')}
              </span>
            ),
            children: (
              <div style={{ height: 'calc(100vh - 200px)', overflow: 'auto', paddingRight: '8px' }}>
                <Suspense fallback={<Spin size="large" />}>
                  <ClaudeCodeAnalytics />
                </Suspense>
              </div>
            )
          }
        ]}
      />
    </div>
  )
}

export default StatisticsPanel
