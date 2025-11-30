/**
 * 终端日志组件
 * @description 用于显示托管模式API请求和响应的实时日志
 * @note 从全局store读取日志数据，确保即使组件未挂载，日志也在后台持续收集
 * @performance 使用react-window虚拟滚动优化大量日志渲染性能
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { VariableSizeList } from 'react-window'
import {
  Card,
  Input,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  Select,
  Switch,
  Badge,
  Empty,
  Alert
} from 'antd'
import {
  ClearOutlined,
  DownloadOutlined,
  SearchOutlined,
  CopyOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  FilterOutlined,
  EyeOutlined,
  BugOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ApiOutlined
} from '@ant-design/icons'
import type { LogLevel } from '@shared/types/managed-mode'
import { useManagedModeLogStore, type LogEntry } from '../../store/managed-mode-log-store'
import './TerminalLogViewer.css'

const { Text } = Typography
const { Search } = Input
const { Option } = Select

/**
 * 终端日志查看器属性
 */
interface TerminalLogViewerProps {
  debugMode?: boolean
  maxEntries?: number
  height?: string
  /**
   * 日志类型过滤器
   * - 'all': 显示所有日志
   * - 'request-response': 只显示请求和响应日志（用于实时日志）
   * - 'system': 只显示系统日志（用于运行日志）
   */
  logTypeFilter?: 'all' | 'request-response' | 'system'
}

/**
 * 终端日志查看器组件
 */
const TerminalLogViewer: React.FC<TerminalLogViewerProps> = ({
  debugMode = false,
  maxEntries = 1000,
  height = '400px',
  logTypeFilter = 'all'
}) => {
  // 从全局store读取日志数据（确保即使组件未挂载，日志也在后台持续收集）
  const { logs, clearLogs: clearGlobalLogs } = useManagedModeLogStore()

  // 本地状态管理（仅用于UI控制和过滤）
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [searchText, setSearchText] = useState('')
  const [logFilter, setLogFilter] = useState<LogLevel | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'request' | 'response' | 'system' | 'error'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  // 展开状态管理：使用Set存储已展开的日志ID
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())


  // 过滤日志
  useEffect(() => {
    let filtered = logs

    // 按logTypeFilter过滤（组件级别的过滤）
    if (logTypeFilter === 'request-response') {
      // 请求-响应过滤器：包含请求、响应和错误日志
      filtered = filtered.filter(log => log.type === 'request' || log.type === 'response' || log.type === 'error')
    } else if (logTypeFilter === 'system') {
      // 系统过滤器：包含系统日志和错误日志
      filtered = filtered.filter(log => log.type === 'system' || log.type === 'error')
    }

    // 按级别过滤
    if (logFilter !== 'all') {
      filtered = filtered.filter(log => log.level === logFilter)
    }

    // 按类型过滤
    if (typeFilter !== 'all') {
      filtered = filtered.filter(log => log.type === typeFilter)
    }

    // 按状态码过滤
    if (statusFilter !== 'all') {
      filtered = filtered.filter(log => {
        if (log.data?.statusCode) {
          const status = log.data.statusCode.toString()
          return status.startsWith(statusFilter)
        }
        return false
      })
    }

    // 搜索过滤
    if (searchText) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchText.toLowerCase()) ||
        (log.data?.url && log.data.url.toLowerCase().includes(searchText.toLowerCase())) ||
        (log.data?.method && log.data.method.toLowerCase().includes(searchText.toLowerCase()))
      )
    }

    setFilteredLogs(filtered)
  }, [logs, logFilter, typeFilter, statusFilter, searchText, logTypeFilter])

  // 虚拟滚动列表引用
  const listRef = useRef<VariableSizeList>(null)

  /**
   * 切换日志详情展开/收起
   * @param logId 日志ID
   * @param index 日志索引
   */
  const toggleLogExpand = (logId: string, index: number) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(logId)) {
        newSet.delete(logId)
      } else {
        newSet.add(logId)
      }
      return newSet
    })
    // 重要：调用resetAfterIndex触发VariableSizeList重新计算高度
    // 参考: https://github.com/bvaughn/react-window/issues/92
    if (listRef.current) {
      listRef.current.resetAfterIndex(index)
    }
  }

  /**
   * 获取日志条目高度
   * @param index 日志索引
   * @returns 高度（像素）
   * @description 根据展开状态动态返回不同高度
   * 参考最佳实践: https://pankajtime12.medium.com/killer-way-to-use-react-window-for-variable-size-list-53c68d75c152
   */
  const getItemSize = useCallback((index: number): number => {
    const log = filteredLogs[index]
    if (!log) return 90 // 默认高度(降低以改善美观度)

    const isExpanded = expandedLogs.has(log.id)

    // 基础高度：包含日志头部、消息、URL等
    let baseHeight = 90 // 从120降至90,更美观

    // 如果展开详情，需要额外空间
    if (isExpanded && log.data) {
      // 详情内容的预估高度：JSON字符串行数 * 行高 + padding
      const jsonStr = JSON.stringify(log.data, null, 2)
      const lines = jsonStr.split('\n').length
      const detailsHeight = Math.min(lines * 16 + 60, 300) // 最大300px，避免过高
      baseHeight += detailsHeight
    }

    return baseHeight
  }, [filteredLogs, expandedLogs])

  // 自动滚动到最新日志
  useEffect(() => {
    if (autoScroll && listRef.current && !isPaused && filteredLogs.length > 0) {
      listRef.current.scrollToItem(filteredLogs.length - 1, 'end')
    }
  }, [filteredLogs, autoScroll, isPaused])

  /**
   * 清空日志（调用全局store的清空方法）
   */
  const clearLogs = () => {
    clearGlobalLogs()
    setFilteredLogs([])
  }

  /**
   * 导出日志
   */
  const exportLogs = () => {
    const logText = filteredLogs
      .map(log => {
        const timestamp = new Date(log.timestamp).toISOString()
        const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : ''
        const sourceStr = log.source ? ` [${log.source}]` : ''
        return `[${timestamp}] ${log.level.toUpperCase()}${sourceStr} [${log.type.toUpperCase()}]: ${log.message}${dataStr}`
      })
      .join('\n\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `managed-mode-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 复制日志内容
   */
  const copyLog = (log: LogEntry) => {
    const logText = `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()} [${log.type.toUpperCase()}]: ${log.message}`
    navigator.clipboard.writeText(logText)
  }

  /**
   * 获取日志级别颜色
   */
  const getLogLevelColor = (level: LogLevel): string => {
    switch (level) {
      case 'debug': return 'default'
      case 'info': return 'blue'
      case 'warn': return 'orange'
      case 'error': return 'red'
      default: return 'default'
    }
  }

  /**
   * 获取日志类型颜色
   */
  const getLogTypeColor = (type: LogEntry['type']): string => {
    switch (type) {
      case 'request': return 'green'
      case 'response': return 'blue'
      case 'system': return 'purple'
      case 'error': return 'red'
      default: return 'default'
    }
  }

  /**
   * 获取状态码颜色
   */
  const getStatusCodeColor = (statusCode?: number): string => {
    if (!statusCode) return 'default'
    if (statusCode >= 200 && statusCode < 300) return 'green'
    if (statusCode >= 300 && statusCode < 400) return 'blue'
    if (statusCode >= 400 && statusCode < 500) return 'orange'
    if (statusCode >= 500) return 'red'
    return 'default'
  }

  /**
   * 获取日志级别图标
   */
  const getLogLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'debug': return <BugOutlined />
      case 'info': return <InfoCircleOutlined />
      case 'warn': return <ExclamationCircleOutlined />
      case 'error': return <CloseCircleOutlined />
      default: return <InfoCircleOutlined />
    }
  }

  /**
   * 获取日志类型图标
   */
  const getLogTypeIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'request': return <ApiOutlined style={{ transform: 'rotate(-45deg)' }} />
      case 'response': return <ApiOutlined />
      case 'system': return <ClockCircleOutlined />
      case 'error': return <ExclamationCircleOutlined />
      default: return <InfoCircleOutlined />
    }
  }

  /**
   * 虚拟滚动行渲染器
   * @description 渲染单个日志条目，用于react-window虚拟滚动，支持动态高度
   */
  const LogRow = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const log = filteredLogs[index]
    const isExpanded = expandedLogs.has(log.id)

    return (
      <div style={{ ...style, padding: '0 8px' }} className={`log-entry log-${log.type} log-${log.level}`}>
        <div className="log-header">
          <Space className="log-meta">
            <Tag color={getLogLevelColor(log.level)} size="small" icon={getLogLevelIcon(log.level)}>
              {log.level.toUpperCase()}
            </Tag>
            <Tag color={getLogTypeColor(log.type)} size="small" icon={getLogTypeIcon(log.type)}>
              {log.type.toUpperCase()}
            </Tag>
            {log.data?.statusCode && (
              <Tag color={getStatusCodeColor(log.data.statusCode)} size="small">
                {log.data.statusCode}
              </Tag>
            )}
            <Text type="secondary" className="log-timestamp">
              {new Date(log.timestamp).toLocaleTimeString()}
            </Text>
          </Space>

          <Space className="log-actions">
            {log.data?.duration && (
              <Text type="secondary" className="log-duration">
                {log.data.duration}ms
              </Text>
            )}
            <Tooltip title="复制日志">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyLog(log)}
              />
            </Tooltip>
          </Space>
        </div>

        <div className="log-message">
          <Text>{log.message}</Text>
          {log.data?.url && (
            <Text code className="log-url">
              {log.data.method} {log.data.url}
            </Text>
          )}
        </div>

        {log.data && (
          <div className="log-details">
            <div
              className="log-details-summary"
              onClick={() => toggleLogExpand(log.id, index)}
              style={{ cursor: 'pointer' }}
            >
              <EyeOutlined /> {isExpanded ? '收起详情' : '查看详情'}
            </div>
            {isExpanded && (
              <pre className="log-details-content">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!debugMode) {
    return (
      <div className="terminal-log-viewer">
        <Alert
          type="info"
          message="调试模式未开启"
          description="开启调试模式后，此页面将显示托管模式的实时API请求和响应日志。"
          icon={<BugOutlined />}
        />
      </div>
    )
  }

  return (
    <div className="terminal-log-viewer">
      {/* 工具栏 */}
      <div className="log-toolbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        padding: '8px 12px',
        background: '#fafafa',
        borderRadius: '6px',
        border: '1px solid #f0f0f0'
      }}>
        <div className="log-stats">
          <Space split={<span>|</span>}>
            <Text type="secondary">总计: {logs.length}</Text>
            <Text type="secondary">已过滤: {filteredLogs.length}</Text>
            <Text type="secondary">错误: {logs.filter(log => log.level === 'error').length}</Text>
            {isPaused && <Text type="warning">已暂停</Text>}
          </Space>
        </div>

        <Space size="small">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 90 }}
            size="small"
          >
            <Option value="all">全部类型</Option>
            <Option value="request">请求</Option>
            <Option value="response">响应</Option>
            <Option value="system">系统</Option>
            <Option value="error">错误</Option>
          </Select>

          <Search
            placeholder="搜索..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 120 }}
            size="small"
            allowClear
          />

          <Switch
            checked={autoScroll}
            onChange={setAutoScroll}
            size="small"
            checkedChildren="自动"
            unCheckedChildren="手动"
          />

          <Tooltip title={isPaused ? "继续接收日志" : "暂停接收日志"}>
            <Button
              type={isPaused ? 'primary' : 'default'}
              size="small"
              icon={isPaused ? <PlayCircleOutlined /> : <PauseOutlined />}
              onClick={() => setIsPaused(!isPaused)}
            />
          </Tooltip>

          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={clearLogs}
            disabled={logs.length === 0}
          />

          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={exportLogs}
            disabled={filteredLogs.length === 0}
          />
        </Space>
      </div>

      {/* 日志容器 */}
      <div
        className="log-container"
        style={{
          height,
          border: '1px solid #f0f0f0',
          borderRadius: '6px',
          background: '#fff'
        }}
      >
        {filteredLogs.length === 0 ? (
          <Empty
            description="暂无日志"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <VariableSizeList
            ref={listRef}
            height={parseInt(height) || 400}
            itemCount={filteredLogs.length}
            itemSize={getItemSize}
            width="100%"
            overscanCount={10}
          >
            {LogRow}
          </VariableSizeList>
        )}
      </div>
    </div>
  )
}

export default TerminalLogViewer