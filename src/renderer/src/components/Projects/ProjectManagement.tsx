/**
 * Claude Code 项目管理组件
 *
 * 功能:
 * - 显示所有 Claude Code 项目列表
 * - 查看项目的会话历史
 * - 浏览会话的完整对话内容
 * - 支持美观的对话视图和JSON源码视图
 * - 提供"继续此对话"功能
 */

import React, { useState, useEffect, useMemo, useCallback, useTransition, useDeferredValue } from 'react'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Drawer,
  Tabs,
  Descriptions,
  App,
  Empty,
  Typography,
  Spin,
  Statistic,
  Row,
  Col,
  Badge,
  Tooltip,
  Modal,
  Input,
  Select,
  Checkbox
} from 'antd'
import {
  FolderOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  FileTextOutlined,
  CodeOutlined,
  SearchOutlined,
  ConsoleSqlOutlined,
  UpOutlined,
  DownOutlined
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useTerminalStore } from '@/store/terminal-store'
import { useTranslation } from '../../locales/useTranslation'
import type { TerminalConfig, TerminalType } from '@shared/types/terminal'
import './ProjectManagement.css'

const { Title, Text, Paragraph } = Typography
const { Search } = Input

/**
 * 项目信息接口
 */
interface ClaudeProject {
  id: string
  name: string
  path: string
  sessionCount: number
  totalMessages: number
  totalTokens: number
  lastUsed: string | null
  firstUsed: string | null
}

/**
 * 会话信息接口
 */
interface ProjectSession {
  sessionId: string
  projectId: string
  projectPath: string
  startTime: string
  endTime: string
  messageCount: number
  totalTokens: number
  model: string | null
  summary: string | null
  jsonlFile: string
}

/**
 * 消息接口
 */
interface ConversationMessage {
  uuid: string
  parentUuid?: string
  type: 'user' | 'assistant' | 'system' | 'summary' | 'file-history-snapshot'
  timestamp: string
  content?: any
  role?: string
  model?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  costUSD?: number
  durationMs?: number
}

/**
 * 会话对话接口
 */
interface SessionConversation {
  sessionId: string
  messages: ConversationMessage[]
  totalMessages: number
  totalTokens: number
}

/**
 * 终端配置模态框
 */
const TerminalConfigModal: React.FC<{
  visible: boolean
  onCancel: () => void
  onConfirm: (config: { terminal: TerminalType; asAdmin: boolean }) => void
  terminals: TerminalConfig[]
  defaultTerminal: TerminalType
}> = ({ visible, onCancel, onConfirm, terminals, defaultTerminal }) => {
  const { t } = useTranslation()
  const [terminal, setTerminal] = useState<TerminalType>(defaultTerminal)
  const [asAdmin, setAsAdmin] = useState(false)

  useEffect(() => {
    if (visible) {
      setTerminal(defaultTerminal)
    }
  }, [visible, defaultTerminal])

  const terminalOptions = terminals.length > 0
    ? terminals.map(item => ({
      label: item.name || item.type,
      value: item.type
    }))
    : [{ label: t('projects.terminal.autoDetect'), value: 'auto' }]

  const handleConfirm = () => {
    onConfirm({ terminal, asAdmin })
  }

  return (
    <Modal
      title={
        <Space>
          <ConsoleSqlOutlined />
          <span>{t('projects.terminal.selectTitle')}</span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      onOk={handleConfirm}
      okText={t('projects.actions.continue')}
      cancelText={t('common.cancel')}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <div>
          <Text strong>{t('projects.terminal.typeLabel')}</Text>
          <Select
            value={terminal}
            onChange={setTerminal}
            style={{ width: '100%', marginTop: 8 }}
            options={terminalOptions}
          />
        </div>
        <div>
          <Checkbox checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)}>
            {t('projects.terminal.runAsAdmin')}
          </Checkbox>
        </div>
      </Space>
    </Modal>
  )
}

/**
 * 项目管理组件
 */
const ProjectManagement: React.FC = () => {
  const { message } = App.useApp()
  const { terminals, defaultTerminal, loadTerminals } = useTerminalStore()
  const { t } = useTranslation()

  // 状态管理
  const [projects, setProjects] = useState<ClaudeProject[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionsDrawerVisible, setSessionsDrawerVisible] = useState(false)
  const [conversationDrawerVisible, setConversationDrawerVisible] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ClaudeProject | null>(null)
  const [sessions, setSessions] = useState<ProjectSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ProjectSession | null>(null)
  const [conversation, setConversation] = useState<SessionConversation | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [conversationViewMode, setConversationViewMode] = useState<'chat' | 'json'>('chat')
  const [searchText, setSearchText] = useState('')
  const [terminalModalVisible, setTerminalModalVisible] = useState(false)
  const [pendingSessionInfo, setPendingSessionInfo] = useState<{
    projectId: string
    sessionId: string
    projectPath?: string
  } | null>(null)
  const [searchResults, setSearchResults] = useState<{
    messageId: string
    matchCount: number
    preview: string
    jsonLineNumbers: number[]  // 添加JSON行号
  }[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const [debouncedSearchText, setDebouncedSearchText] = useState('')
  const [loadingAbortController, setLoadingAbortController] = useState<AbortController | null>(null)
  const [isPending, startTransition] = useTransition()

  const getTerminalDisplayName = (type: TerminalType) => {
    const matched = terminals.find(item => item.type === type)
    if (matched?.name) return matched.name
    if (type === 'git-bash') return 'Git Bash'
    if (type === 'powershell') return 'PowerShell'
    if (type === 'cmd') return 'CMD'
    if (type === 'wsl') return 'WSL'
    if (type === 'auto') return t('projects.terminal.systemDefault')
    return type
  }

  // 使用 useDeferredValue 延迟JSON渲染,避免阻塞UI
  const deferredConversation = useDeferredValue(conversation)
  const deferredSearchText = useDeferredValue(debouncedSearchText)

  // 加载项目列表
  const loadProjects = async () => {
    try {
      setLoading(true)
      const result = await window.electronAPI.projectManagement.scanProjects()

      if (result.success) {
        setProjects(result.data || [])
      } else {
        message.error(t('projects.messages.loadProjectsFailed', { error: result.error }))
      }
    } catch (error) {
      message.error(t('projects.messages.loadProjectsFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
    } finally {
      setLoading(false)
    }
  }

  // 加载会话列表
  const loadSessions = async (projectId: string) => {
    try {
      setLoadingSessions(true)
      const result = await window.electronAPI.projectManagement.getProjectSessions(projectId)

      if (result.success) {
        setSessions(result.data || [])
      } else {
        message.error(t('projects.messages.loadSessionsFailed', { error: result.error }))
      }
    } catch (error) {
      message.error(t('projects.messages.loadSessionsFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
    } finally {
      setLoadingSessions(false)
    }
  }

  // 加载会话对话
  const loadConversation = async (projectId: string, sessionId: string) => {
    // 取消之前的加载操作
    if (loadingAbortController) {
      loadingAbortController.abort()
    }

    const abortController = new AbortController()
    setLoadingAbortController(abortController)

    try {
      setLoadingConversation(true)
      setConversation(null) // 清空之前的数据

      const result = await window.electronAPI.projectManagement.getSessionConversation(
        projectId,
        sessionId,
        500 // 最多加载500条消息
      )

      // 检查是否被取消
      if (abortController.signal.aborted) {
        message.info(t('projects.messages.loadCancelled'))
        return
      }

      if (result.success) {
        // 使用 startTransition 进行非阻塞状态更新
        startTransition(() => {
          setConversation(result.data)
        })
        message.success(t('projects.messages.loadConversationSuccess', { count: result.data?.totalMessages || 0 }))
      } else {
        message.error(t('projects.messages.loadConversationFailed', { error: result.error }))
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        message.info(t('projects.messages.loadCancelled'))
      } else {
        message.error(t('projects.messages.loadConversationFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
      }
    } finally {
      setLoadingConversation(false)
      setLoadingAbortController(null)
    }
  }

  // 取消加载对话
  const cancelLoadConversation = () => {
    if (loadingAbortController) {
      loadingAbortController.abort()
      setLoadingAbortController(null)
      message.info(t('projects.messages.cancellingLoad'))
    }
  }

  // 显示终端配置模态框
  const showTerminalConfig = (projectId: string, sessionId: string, projectPath?: string) => {
    setPendingSessionInfo({ projectId, sessionId, projectPath })
    setTerminalModalVisible(true)
  }

  // 继续会话
  const continueSession = async (config: { terminal: TerminalType; asAdmin: boolean }) => {
    if (!pendingSessionInfo) return

    try {
      const result = await window.electronAPI.projectManagement.continueSession(
        pendingSessionInfo.projectId,
        pendingSessionInfo.sessionId,
        pendingSessionInfo.projectPath,
        config.terminal,
        config.asAdmin
      )

      if (result.success) {
        message.success(t('projects.messages.continueSuccess', {
          terminal: getTerminalDisplayName(config.terminal),
          adminSuffix: config.asAdmin ? t('projects.messages.adminSuffix') : ''
        }))
      } else {
        message.error(t('projects.messages.continueFailed', { error: result.error }))
      }
    } catch (error) {
      message.error(t('projects.messages.continueFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
    } finally {
      setTerminalModalVisible(false)
      setPendingSessionInfo(null)
    }
  }

  // 查看项目会话
  const handleViewSessions = async (project: ClaudeProject) => {
    setSelectedProject(project)
    setSessionsDrawerVisible(true)
    await loadSessions(project.id)
  }

  // 查看会话对话
  const handleViewConversation = async (session: ProjectSession) => {
    setSelectedSession(session)
    setConversationDrawerVisible(true)
    if (selectedProject) {
      await loadConversation(selectedProject.id, session.sessionId)
    }
  }

  // 组件加载时获取项目列表
  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    loadTerminals()
  }, [loadTerminals])

  // 搜索文本防抖处理
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText)
    }, 300) // 300ms 防抖延迟

    return () => clearTimeout(timer)
  }, [searchText])

  // 当防抖后的搜索文本变化时,自动执行搜索
  useEffect(() => {
    if (debouncedSearchText && conversation) {
      performSearch()
    } else if (!debouncedSearchText) {
      // 清空搜索时清除结果
      setSearchResults([])
      setCurrentSearchIndex(0)
    }
  }, [debouncedSearchText, conversation])

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F 聚焦搜索框
      if (e.ctrlKey && e.key === 'f' && conversationDrawerVisible) {
        e.preventDefault()
        const searchInput = document.querySelector('.conversation-search-input input') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }

      // Enter 下一个结果
      if (e.key === 'Enter' && !e.shiftKey && searchResults.length > 0 && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        gotoNextResult()
      }

      // Shift+Enter 上一个结果
      if (e.key === 'Enter' && e.shiftKey && searchResults.length > 0) {
        e.preventDefault()
        gotoPreviousResult()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [conversationDrawerVisible, searchResults, currentSearchIndex])

  // 过滤对话消息 - 不再过滤,改为标记是否匹配
  const getFilteredMessages = () => {
    if (!conversation) return []
    // 始终返回所有消息,不进行过滤
    return conversation.messages
  }

  // 搜索并生成结果列表
  const performSearch = useCallback(() => {
    if (!conversation || !debouncedSearchText) {
      setSearchResults([])
      setCurrentSearchIndex(0)
      return
    }

    const lowerSearch = debouncedSearchText.toLowerCase()
    const results: { messageId: string; matchCount: number; preview: string; jsonLineNumbers: number[] }[] = []

    // 同时生成JSON字符串用于行号匹配
    const jsonString = JSON.stringify(conversation, null, 2)
    const jsonLines = jsonString.split('\n')

    conversation.messages.forEach(msg => {
      if (msg.type !== 'user' && msg.type !== 'assistant') return

      let matchCount = 0
      let preview = ''
      const jsonLineNumbers: number[] = []

      // 检查内容
      if (msg.content) {
        const contentStr = JSON.stringify(msg.content)
        const lowerContent = contentStr.toLowerCase()

        // 计算匹配次数
        let pos = 0
        while ((pos = lowerContent.indexOf(lowerSearch, pos)) !== -1) {
          matchCount++
          pos += lowerSearch.length
        }

        // 生成预览文本(提取匹配位置的上下文)
        if (matchCount > 0) {
          const firstMatchPos = lowerContent.indexOf(lowerSearch)
          const start = Math.max(0, firstMatchPos - 50)
          const end = Math.min(contentStr.length, firstMatchPos + lowerSearch.length + 50)
          preview = '...' + contentStr.substring(start, end) + '...'

          // 在JSON中查找包含此消息UUID的行号
          const msgUuid = msg.uuid
          jsonLines.forEach((line, lineIndex) => {
            if (line.includes(msgUuid) || line.toLowerCase().includes(lowerSearch)) {
              jsonLineNumbers.push(lineIndex)
            }
          })
        }
      }

      if (matchCount > 0) {
        results.push({
          messageId: msg.uuid,
          matchCount,
          preview,
          jsonLineNumbers
        })
      }
    })

    setSearchResults(results)
    setCurrentSearchIndex(0)

    // 自动跳转到第一个结果
    if (results.length > 0) {
      scrollToMessage(results[0].messageId)
    }
  }, [conversation, debouncedSearchText])

  // 滚动到指定消息
  const scrollToMessage = useCallback((messageId: string, index?: number) => {
    // 根据当前视图模式选择不同的滚动目标
    if (conversationViewMode === 'json') {
      // JSON视图:滚动到JSON行
      // 使用传入的index参数,如果没有则使用currentSearchIndex
      const targetIndex = index !== undefined ? index : currentSearchIndex
      const currentResult = searchResults[targetIndex]
      if (currentResult && currentResult.jsonLineNumbers.length > 0) {
        const lineNumber = currentResult.jsonLineNumbers[0]
        // 使用setTimeout确保DOM已更新
        setTimeout(() => {
          const element = document.getElementById(`json-line-${lineNumber}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            // 添加高亮效果
            element.style.transition = 'background-color 0.5s'
            element.style.backgroundColor = 'rgba(255, 235, 59, 0.3)'
            setTimeout(() => {
              element.style.backgroundColor = 'rgba(255, 235, 59, 0.1)'
            }, 2000)
          }
        }, 100)
        return
      }
    }

    // 对话视图:滚动到消息
    const element = document.getElementById(`msg-${messageId}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 添加高亮效果
      element.classList.add('message-highlight')
      setTimeout(() => {
        element.classList.remove('message-highlight')
      }, 2000)
    }
  }, [conversationViewMode, searchResults, currentSearchIndex])

  // 导航到上一个搜索结果
  const gotoPreviousResult = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = currentSearchIndex > 0 ? currentSearchIndex - 1 : searchResults.length - 1
    setCurrentSearchIndex(newIndex)
    // 传递newIndex参数,确保使用最新的索引
    scrollToMessage(searchResults[newIndex].messageId, newIndex)
  }, [searchResults, currentSearchIndex, scrollToMessage])

  // 导航到下一个搜索结果
  const gotoNextResult = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = currentSearchIndex < searchResults.length - 1 ? currentSearchIndex + 1 : 0
    setCurrentSearchIndex(newIndex)
    // 传递newIndex参数,确保使用最新的索引
    scrollToMessage(searchResults[newIndex].messageId, newIndex)
  }, [searchResults, currentSearchIndex, scrollToMessage])

  // 高亮显示文本 - 使用 useCallback 优化性能
  const highlightText = useCallback((text: string, highlight: string) => {
    if (!highlight.trim()) {
      return text
    }

    const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '0 2px', borderRadius: '2px' }}>
          {part}
        </mark>
      ) : (
        part
      )
    )
  }, [])

  // 项目表格列定义
  const projectColumns = [
    {
      title: t('projects.columns.projectName'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: ClaudeProject) => (
        <Space>
          <FolderOutlined />
          <div>
            <div><Text strong>{name}</Text></div>
            <div><Text type="secondary" style={{ fontSize: '12px' }}>{record.path}</Text></div>
          </div>
        </Space>
      )
    },
    {
      title: t('projects.columns.sessionCount'),
      dataIndex: 'sessionCount',
      key: 'sessionCount',
      width: 100,
      render: (count: number) => <Badge count={count} showZero color="blue" />
    },
    {
      title: t('projects.columns.messageCount'),
      dataIndex: 'totalMessages',
      key: 'totalMessages',
      width: 100,
      render: (count: number) => <Text>{count.toLocaleString()}</Text>
    },
    {
      title: t('projects.columns.totalTokens'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      width: 120,
      render: (tokens: number) => (
        <Tag color="orange">{tokens.toLocaleString()}</Tag>
      )
    },
    {
      title: t('projects.columns.lastUsed'),
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      width: 180,
      render: (time: string) => (
        <Space size="small">
          <ClockCircleOutlined />
          <Text>{time ? new Date(time).toLocaleString() : '-'}</Text>
        </Space>
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: ClaudeProject) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewSessions(record)}
          >
            {t('projects.actions.viewSessions')}
          </Button>
        </Space>
      )
    }
  ]

  // 会话表格列定义
  const sessionColumns = [
    {
      title: t('projects.columns.sessionId'),
      dataIndex: 'sessionId',
      key: 'sessionId',
      ellipsis: true,
      render: (id: string) => (
        <Tooltip title={id}>
          <Text code>{id.substring(0, 16)}...</Text>
        </Tooltip>
      )
    },
    {
      title: t('projects.columns.model'),
      dataIndex: 'model',
      key: 'model',
      width: 180,
      render: (model: string | null) => (
        model ? <Tag color="green" icon={<RobotOutlined />}>{model}</Tag> : <Text type="secondary">-</Text>
      )
    },
    {
      title: t('projects.columns.messageCount'),
      dataIndex: 'messageCount',
      key: 'messageCount',
      width: 100,
      render: (count: number) => (
        <Badge count={count} showZero />
      )
    },
    {
      title: t('projects.columns.tokens'),
      dataIndex: 'totalTokens',
      key: 'totalTokens',
      width: 100,
      render: (tokens: number) => (
        <Text>{tokens.toLocaleString()}</Text>
      )
    },
    {
      title: t('projects.columns.startTime'),
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      render: (time: string) => (
        <Text>{new Date(time).toLocaleString()}</Text>
      )
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 220,
      render: (_: any, record: ProjectSession) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewConversation(record)}
          >
            {t('projects.actions.viewConversation')}
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => showTerminalConfig(record.projectId, record.sessionId, record.projectPath)}
          >
            {t('projects.actions.continue')}
          </Button>
        </Space>
      )
    }
  ]

  // 渲染消息内容
  const renderMessageContent = useCallback((msg: ConversationMessage) => {
    if (!msg.content) return <Text type="secondary">{t('projects.messages.noContent')}</Text>

    const shouldHighlight = debouncedSearchText && debouncedSearchText.trim().length > 0

    // 如果content是数组(Claude API格式)
    if (Array.isArray(msg.content)) {
      return msg.content.map((item: any, index: number) => {
        if (item.type === 'text') {
          const textContent = item.text || ''

          return (
            <div key={`${msg.uuid}-content-${index}`} className="message-text-content">
              <ReactMarkdown
                components={{
                  // 文本节点高亮处理
                  p({ children }) {
                    if (shouldHighlight && typeof children === 'string') {
                      return <p>{highlightText(children, debouncedSearchText)}</p>
                    }
                    return <p>{children}</p>
                  },
                  li({ children }) {
                    if (shouldHighlight && typeof children === 'string') {
                      return <li>{highlightText(children, debouncedSearchText)}</li>
                    }
                    return <li>{children}</li>
                  },
                  // 代码块处理
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '')
                    const isInline = Boolean(props.inline)
                    return !isInline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus as Record<string, React.CSSProperties>}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {shouldHighlight && typeof children === 'string'
                          ? highlightText(String(children), debouncedSearchText)
                          : children
                        }
                      </code>
                    )
                  }
                }}
              >
                {textContent}
              </ReactMarkdown>
            </div>
          )
        } else if (item.type === 'tool_use') {
          return (
            <div key={`${msg.uuid}-tool-${index}`} className="message-tool-use">
              <Tag icon={<ThunderboltOutlined />} color="processing">
                {t('projects.messages.toolCall', { name: item.name })}
              </Tag>
            </div>
          )
        }
        return null
      })
    }

    // 如果content是字符串
    if (typeof msg.content === 'string') {
      return (
        <div className="message-text-content">
          <ReactMarkdown
            components={{
              p({ children }) {
                if (shouldHighlight && typeof children === 'string') {
                  return <p>{highlightText(children, debouncedSearchText)}</p>
                }
                return <p>{children}</p>
              }
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      )
    }

    // 其他情况显示JSON
    return <pre>{JSON.stringify(msg.content, null, 2)}</pre>
  }, [debouncedSearchText, highlightText])

  // 渲染对话视图
  const renderChatView = () => {
    const filteredMessages = getFilteredMessages()

    if (!conversation || filteredMessages.length === 0) {
      return <Empty description={t('projects.empty.conversation')} />
    }

    return (
      <div className="conversation-chat-view">
        {filteredMessages.map((msg) => {
          // 只显示用户和助手消息
          if (msg.type !== 'user' && msg.type !== 'assistant') {
            return null
          }

          return (
            <div
              key={msg.uuid}
              className={`chat-message ${msg.type === 'user' ? 'user-message' : 'assistant-message'}`}
              id={`msg-${msg.uuid}`}
            >
              <div className="message-header">
                <Space>
                  {msg.type === 'user' ? (
                    <>
                      <MessageOutlined />
                      <Text strong>{t('projects.labels.user')}</Text>
                    </>
                  ) : (
                    <>
                      <RobotOutlined />
                      <Text strong>Claude</Text>
                      {msg.model && <Tag color="green">{msg.model}</Tag>}
                    </>
                  )}
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {new Date(msg.timestamp).toLocaleString()}
                  </Text>
                </Space>
                {msg.usage && (
                  <Space size="small" style={{ marginLeft: 'auto' }}>
                    {msg.usage.input_tokens && (
                      <Tag>{t('projects.labels.inputTokens', { count: msg.usage.input_tokens.toLocaleString() })}</Tag>
                    )}
                    {msg.usage.output_tokens && (
                      <Tag>{t('projects.labels.outputTokens', { count: msg.usage.output_tokens.toLocaleString() })}</Tag>
                    )}
                  </Space>
                )}
              </div>
              <div className="message-body">
                {renderMessageContent(msg)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 渲染JSON视图 - 使用 deferredValue 避免阻塞
  const renderJsonView = useMemo(() => {
    if (!deferredConversation) {
      return <Empty description={t('projects.empty.conversation')} />
    }

    const jsonString = JSON.stringify(deferredConversation, null, 2)

    // 如果有搜索关键词,高亮显示
    if (deferredSearchText && deferredSearchText.trim()) {
      // 转义特殊字符
      const escapedSearch = deferredSearchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      const highlightedJson = jsonString.split('\n').map((line, index) => {
        // 检查是否包含搜索关键词
        const lowerLine = line.toLowerCase()
        const lowerSearch = deferredSearchText.toLowerCase()

        if (lowerLine.includes(lowerSearch)) {
          // 创建高亮标记的正则
          const highlightRegex = new RegExp(`(${escapedSearch})`, 'gi')
          const parts = line.split(highlightRegex)

          return (
            <div
              key={index}
              id={`json-line-${index}`}
              style={{
                backgroundColor: 'rgba(255, 235, 59, 0.1)',
                lineHeight: '1.5',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                whiteSpace: 'pre'
              }}
            >
              {parts.map((part, i) => {
                const checkRegex = new RegExp(`^${escapedSearch}$`, 'i')
                return checkRegex.test(part) ? (
                  <mark key={i} style={{
                    backgroundColor: '#ffeb3b',
                    padding: '0 2px',
                    borderRadius: '2px',
                    color: '#000'
                  }}>
                    {part}
                  </mark>
                ) : (
                  <span key={i}>{part}</span>
                )
              })}
            </div>
          )
        }
        return (
          <div
            key={index}
            id={`json-line-${index}`}
            style={{
              lineHeight: '1.5',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              whiteSpace: 'pre'
            }}
          >
            {line}
          </div>
        )
      })

      return (
        <div className="conversation-json-view">
          <div style={{
            margin: 0,
            padding: '16px',
            borderRadius: '4px',
            fontSize: '13px',
            backgroundColor: '#1e1e1e',
            color: '#d4d4d4',
            overflow: 'auto'
          }}>
            {highlightedJson}
          </div>
        </div>
      )
    }

    // 无搜索关键词,直接显示纯文本(更快)
    return (
      <div className="conversation-json-view">
        <pre style={{
          margin: 0,
          padding: '16px',
          borderRadius: '4px',
          fontSize: '13px',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          overflow: 'auto',
          fontFamily: 'Consolas, Monaco, "Courier New", monospace'
        }}>
          {jsonString}
        </pre>
      </div>
    )
  }, [deferredConversation, deferredSearchText])

  // Tabs items配置
  const conversationTabItems = useMemo(() => {
    const isStale = deferredConversation !== conversation || deferredSearchText !== debouncedSearchText

    return [
      {
        key: 'chat',
        label: (
          <span>
            <MessageOutlined /> {t('projects.tabs.chat')}
          </span>
        ),
        children: (
          <Spin
            spinning={loadingConversation || isPending}
            tip={
              <div style={{ marginTop: 8 }}>
                <div>{loadingConversation ? t('projects.loading.conversation') : t('projects.loading.chatRender')}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>
                  {loadingConversation
                    ? t('projects.loading.conversationHint')
                    : t('projects.loading.chatRenderHint')
                  }
                </div>
              </div>
            }
          >
            {renderChatView()}
          </Spin>
        )
      },
      {
        key: 'json',
        label: (
          <span>
            <CodeOutlined /> {t('projects.tabs.json')} {isStale && <Text type="secondary" style={{ fontSize: '12px' }}>({t('projects.tabs.updating')})</Text>}
          </span>
        ),
        children: (
          <Spin
            spinning={loadingConversation || isPending}
            tip={
              <div style={{ marginTop: 8 }}>
                <div>{loadingConversation ? t('projects.loading.conversation') : t('projects.loading.jsonRender')}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>
                  {loadingConversation
                    ? t('projects.loading.conversationHint')
                    : t('projects.loading.jsonRenderHint')
                  }
                </div>
              </div>
            }
          >
            <div style={{ opacity: isStale ? 0.6 : 1, transition: 'opacity 0.3s' }}>
              {renderJsonView}
            </div>
          </Spin>
        )
      }
    ]
  }, [loadingConversation, conversation, debouncedSearchText, isPending, deferredConversation, deferredSearchText, renderChatView, renderJsonView])

  return (
    <div className="project-management-container">
      {/* 标题栏 */}
      <div className="page-header">
        <div className="header-left">
          <Title level={3}>
            <FolderOutlined /> {t('projects.title')}
          </Title>
          <Text type="secondary">{t('projects.subtitle')}</Text>
        </div>
        <div className="header-actions">
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadProjects}
            loading={loading}
          >
            {t('projects.actions.refreshProjects')}
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('projects.stats.totalProjects')}
              value={projects.length}
              prefix={<FolderOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('projects.stats.totalSessions')}
              value={projects.reduce((sum, p) => sum + p.sessionCount, 0)}
              prefix={<MessageOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('projects.stats.totalMessages')}
              value={projects.reduce((sum, p) => sum + p.totalMessages, 0)}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={t('projects.stats.totalTokens')}
              value={projects.reduce((sum, p) => sum + p.totalTokens, 0)}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 项目列表 */}
      <Card>
        <Table
          dataSource={projects}
          columns={projectColumns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('projects.pagination.projectsTotal', { total })
          }}
        />
      </Card>

      {/* 会话列表抽屉 */}
      <Drawer
        title={
          <Space>
            <FolderOutlined />
            <span>{t('projects.sessions.title')}</span>
            {selectedProject && <Text type="secondary">({selectedProject.name})</Text>}
          </Space>
        }
        width={1000}
        open={sessionsDrawerVisible}
        onClose={() => setSessionsDrawerVisible(false)}
      >
        {selectedProject && (
          <>
            <Descriptions bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('projects.details.projectName')}>{selectedProject.name}</Descriptions.Item>
              <Descriptions.Item label={t('projects.details.totalSessions')}>{selectedProject.sessionCount}</Descriptions.Item>
              <Descriptions.Item label={t('projects.details.projectPath')} span={2}>{selectedProject.path}</Descriptions.Item>
              <Descriptions.Item label={t('projects.details.totalMessages')}>{selectedProject.totalMessages.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label={t('projects.details.totalTokens')}>{selectedProject.totalTokens.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label={t('projects.details.firstUsed')}>
                {selectedProject.firstUsed ? new Date(selectedProject.firstUsed).toLocaleString() : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('projects.details.lastUsed')}>
                {selectedProject.lastUsed ? new Date(selectedProject.lastUsed).toLocaleString() : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Table
              dataSource={sessions}
              columns={sessionColumns}
              rowKey="sessionId"
              loading={loadingSessions}
              pagination={{
                pageSize: 10,
                showTotal: (total) => t('projects.pagination.sessionsTotal', { total })
              }}
            />
          </>
        )}
      </Drawer>

      {/* 对话内容抽屉 */}
      <Drawer
        title={
          <Space>
            <MessageOutlined />
            <span>{t('projects.conversation.title')}</span>
            {selectedSession && (
              <Text type="secondary" code>
                {selectedSession.sessionId.substring(0, 16)}...
              </Text>
            )}
          </Space>
        }
        width="80%"
        open={conversationDrawerVisible}
        onClose={() => {
          setConversationDrawerVisible(false)
          setSearchText('')
          // 清理加载控制器
          if (loadingAbortController) {
            loadingAbortController.abort()
            setLoadingAbortController(null)
          }
        }}
        extra={
          <Space>
            {loadingConversation && (
              <Button
                danger
                icon={<ReloadOutlined />}
                onClick={cancelLoadConversation}
              >
                {t('projects.actions.cancelLoad')}
              </Button>
            )}
            <Button
              icon={<PlayCircleOutlined />}
              type="primary"
              onClick={() => {
                if (selectedSession) {
                  showTerminalConfig(
                    selectedSession.projectId,
                    selectedSession.sessionId,
                    selectedSession.projectPath
                  )
                }
              }}
            >
              {t('projects.actions.continueInTerminal')}
            </Button>
          </Space>
        }
      >
        {selectedSession && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label={t('projects.sessionDetails.model')}>{selectedSession.model || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('projects.sessionDetails.messageCount')}>{selectedSession.messageCount}</Descriptions.Item>
              <Descriptions.Item label={t('projects.sessionDetails.totalTokens')}>{selectedSession.totalTokens.toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label={t('projects.sessionDetails.duration')}>
                {Math.ceil(
                  (new Date(selectedSession.endTime).getTime() -
                   new Date(selectedSession.startTime).getTime()) / 60000
                )} {t('projects.units.minutes')}
              </Descriptions.Item>
              {selectedSession.summary && (
                <Descriptions.Item label={t('projects.sessionDetails.summary')} span={2}>
                  <Paragraph ellipsis={{ rows: 2, expandable: true }}>
                    {selectedSession.summary}
                  </Paragraph>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* 搜索框 */}
            <div style={{ marginBottom: 16 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Search
                  className="conversation-search-input"
                  placeholder={t('projects.search.placeholder')}
                  allowClear
                  enterButton={
                    <Button type="primary" icon={<SearchOutlined />}>
                      {t('projects.actions.search')}
                    </Button>
                  }
                  size="large"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onSearch={performSearch}
                  style={{ maxWidth: 600 }}
                />
                {searchResults.length > 0 && (
                  <Space style={{ marginLeft: 12 }}>
                    <Text type="secondary">
                      {currentSearchIndex + 1} / {searchResults.length}
                    </Text>
                    <Button
                      icon={<UpOutlined />}
                      onClick={gotoPreviousResult}
                      title={t('projects.search.prevResult')}
                    />
                    <Button
                      icon={<DownOutlined />}
                      onClick={gotoNextResult}
                      title={t('projects.search.nextResult')}
                    />
                  </Space>
                )}
              </Space.Compact>
            </div>

            <Card>
              <Tabs
                activeKey={conversationViewMode}
                onChange={(key) => setConversationViewMode(key as 'chat' | 'json')}
                items={conversationTabItems}
                tabBarExtraContent={
                  conversation && (
                    <Space>
                      <Text type="secondary">
                        {t('projects.summary.totalMessages', { count: conversation.totalMessages })}
                      </Text>
                      <Text type="secondary">|</Text>
                      <Text type="secondary">
                        {t('projects.summary.totalTokens', { count: conversation.totalTokens.toLocaleString() })}
                      </Text>
                    </Space>
                  )
                }
              />
            </Card>
          </>
        )}
      </Drawer>

      {/* 终端配置模态框 */}
      <TerminalConfigModal
        visible={terminalModalVisible}
        onCancel={() => {
          setTerminalModalVisible(false)
          setPendingSessionInfo(null)
        }}
        onConfirm={continueSession}
        terminals={terminals}
        defaultTerminal={defaultTerminal}
      />
    </div>
  )
}

export default ProjectManagement
