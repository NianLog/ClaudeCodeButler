/**
 * 代码编辑器组件
 * 支持语法高亮、自动修正、JSON/Markdown格式化
 */

import React, { useRef, useEffect, useState, useCallback } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import { Button, Space, Typography, Alert, Select, Switch } from 'antd'
import { useAppStore } from '../../store/app-store'
import {
  FormatPainterOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BgColorsOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as monaco from 'monaco-editor'

// 配置Monaco Editor使用本地资源,避免CDN依赖
loader.config({ monaco })

// 配置 Monaco Editor 的 worker 环境
// 这对于 Electron 环境下的生产构建至关重要
if (typeof window !== 'undefined') {
  (window as any).MonacoEnvironment = {
    getWorker(_: any, label: string) {
      // 返回一个简单的 Worker,Monaco Editor 会在主线程中回退运行
      // 这对于 Electron 应用是可以接受的性能折衷
      return new Worker(
        URL.createObjectURL(
          new Blob(['self.MonacoEnvironment = { baseUrl: "" };'], {
            type: 'text/javascript'
          })
        )
      )
    }
  }
}

const { Text } = Typography
const { Option } = Select

/**
 * 代码编辑器属性
 */
interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'markdown' | 'plaintext'
  height?: number | string
  readonly?: boolean
  showPreview?: boolean
  onValidate?: (isValid: boolean, errors?: string[]) => void
  placeholder?: string
}

/**
 * 代码编辑器组件
 */
const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language = 'json',
  height = 400,
  readonly = false,
  showPreview = false,
  onValidate,
  placeholder = ''
}) => {
  const editorRef = useRef<any>(null)
  const [isValid, setIsValid] = useState(true)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [wordWrap, setWordWrap] = useState(true)
  const [previewMode, setPreviewMode] = useState<'raw' | 'rendered'>('rendered')
  
  // 获取应用主题
  const { theme } = useAppStore()

  // Monaco编辑器配置
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: showLineNumbers ? 'on' : 'off',
    wordWrap: wordWrap ? 'on' : 'off',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    readOnly: readonly,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    formatOnType: true,
    // 增强功能
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true
    },
    renderWhitespace: 'selection',
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    contextmenu: true,
    mouseWheelZoom: true,
    // 主题配置
    theme: theme === 'dark' ? 'vs-dark' : 'vs', // 根据应用主题动态切换
    // 代码折叠
    folding: true,
    foldingStrategy: 'indentation',
    showFoldingControls: 'always',
    // 错误标记
    renderValidationDecorations: 'on'
  }

  // 验证JSON内容
  const validateJSON = useCallback((content: string) => {
    try {
      if (!content.trim()) {
        setIsValid(true)
        setValidationErrors([])
        onValidate?.(true)
        return
      }

      JSON.parse(content)
      setIsValid(true)
      setValidationErrors([])
      onValidate?.(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setIsValid(false)
      setValidationErrors([errorMessage])
      onValidate?.(false, [errorMessage])
    }
  }, [onValidate])

  // 安全的JSON字符串转义
  const safeStringify = (obj: any): string => {
    try {
      return JSON.stringify(obj, null, 2)
    } catch (error) {
      return '{}'
    }
  }

  // 自动修正功能已移除，仅保留错误提示
  const autoFixJSON = useCallback(() => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    const content = model.getValue()

    try {
      // 尝试解析当前内容
      JSON.parse(content)
      // 如果已经是有效的JSON，不需要修正
      return
    } catch (error) {
      // 只显示错误提示，不进行自动修正
      console.error('JSON格式错误:', error)
      // 可以在这里添加显示错误提示的逻辑
    }
  }, [])

  // 格式化代码
  const formatCode = useCallback(() => {
    if (!editorRef.current) return

    const editor = editorRef.current
    const model = editor.getModel()
    if (!model) return

    const content = model.getValue()

    try {
      if (language === 'json') {
        const parsed = JSON.parse(content)
        const formatted = JSON.stringify(parsed, null, 2)
        model.setValue(formatted)
        validateJSON(formatted)
      } else if (language === 'markdown') {
        // 简单的Markdown格式化
        const lines = content.split('\n').filter(line => line.trim())
        model.setValue(lines.join('\n\n'))
      }
    } catch (error) {
      console.error('Format failed:', error)
    }
  }, [language, validateJSON])

  // 验证Markdown
  const validateMarkdown = useCallback((content: string) => {
    // 简单的Markdown验证
    const errors: string[] = []

    // 检查是否有可能的格式问题
    if (content.includes('```') && content.split('```').length % 2 === 0) {
      errors.push('代码块标记不匹配')
    }

    if (content.includes('**') && content.split('**').length % 2 === 0) {
      errors.push('粗体标记不匹配')
    }

    if (content.includes('*') && content.split('*').filter(s => s).length % 2 === 0) {
      errors.push('斜体标记不匹配')
    }

    if (errors.length > 0) {
      setIsValid(false)
      setValidationErrors(errors)
      onValidate?.(false, errors)
    } else {
      setIsValid(true)
      setValidationErrors([])
      onValidate?.(true)
    }
  }, [onValidate])

  // 编辑器挂载后的处理
  const handleEditorDidMount = useCallback((editor: any) => {
    editorRef.current = editor

    // 设置初始验证
    if (language === 'json') {
      validateJSON(value)
    } else if (language === 'markdown') {
      validateMarkdown(value)
    }

    // 添加快捷键
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      formatCode()
    })
  }, [language, value, validateJSON, validateMarkdown, formatCode])

  // 内容变化处理
  const handleEditorChange = useCallback((value: string | undefined) => {
    const newValue = value || ''
    onChange(newValue)

    if (language === 'json') {
      validateJSON(newValue)
    } else if (language === 'markdown') {
      validateMarkdown(newValue)
    }
  }, [language, onChange, validateJSON, validateMarkdown])

  // 渲染预览内容
  const renderPreview = () => {
    if (language === 'markdown' && previewMode === 'rendered') {
      return (
        <div className="markdown-preview">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value}
          </ReactMarkdown>
        </div>
      )
    }

    return (
      <pre className="code-preview">
        <code>{value || placeholder}</code>
      </pre>
    )
  }

  // 处理预览模式切换
  const handlePreviewModeChange = (mode: 'raw' | 'rendered') => {
    setPreviewMode(mode)
  }

  return (
    <div className="code-editor-container" style={{ display: 'flex', flexDirection: 'column', height: typeof height === 'number' ? `${height + 100}px` : `calc(${height} + 100px)` }}>
      {/* 工具栏 */}
      <div className="editor-toolbar" style={{ flexShrink: 0 }}>
        <Space>
          {/* 语言指示器 */}
          <div className="language-indicator">
            <FileTextOutlined />
            <Text strong>{language.toUpperCase()}</Text>
          </div>

          {/* 编辑器选项 */}
          <div className="editor-options">
            <Switch
              size="small"
              checked={showLineNumbers}
              onChange={setShowLineNumbers}
              checkedChildren="行号"
              unCheckedChildren="无行号"
            />
            <Switch
              size="small"
              checked={wordWrap}
              onChange={setWordWrap}
              checkedChildren="换行"
              unCheckedChildren="不换行"
            />
          </div>

          {/* 操作按钮 */}
          <Space>
            {/* 自动修正按钮已移除 */}

            <Button
              size="small"
              icon={<FormatPainterOutlined />}
              onClick={formatCode}
            >
              格式化
            </Button>

            {showPreview && language === 'markdown' && (
              <Select
                size="small"
                value={previewMode}
                onChange={setPreviewMode}
                style={{ width: 100 }}
              >
                <Option value="raw">原始</Option>
                <Option value="rendered">渲染</Option>
              </Select>
            )}
          </Space>
        </Space>

        {/* 验证状态 */}
        <div className="validation-status">
          {isValid ? (
            <Text type="success">
              <CheckCircleOutlined /> 格式正确
            </Text>
          ) : (
            <Text type="error">
              <ExclamationCircleOutlined /> 格式错误
            </Text>
          )}
        </div>
      </div>

      {/* 验证错误提示 */}
      {!isValid && validationErrors.length > 0 && (
        <Alert
          message="格式验证失败"
          description={
            <ul>
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          }
          type="error"
          showIcon
          style={{ marginBottom: 16, flexShrink: 0 }}
          action={
            language === 'json' && (
              <Button size="small" onClick={autoFixJSON}>
                自动修正
              </Button>
            )
          }
        />
      )}

      {/* 编辑器和预览 */}
      <div className={`editor-content ${showPreview ? 'with-preview' : ''}`} style={{ flex: 1, minHeight: 0 }}>
        <div className="editor-panel">
          <Editor
            height="100%"
            language={language}
            value={value}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            options={editorOptions}
            theme="vs-light"
            loading={<div>加载编辑器...</div>}
          />
        </div>

        {showPreview && (
          <div className="preview-panel">
            <div className="preview-header">
              <Text strong>预览</Text>
            </div>
            <div className="preview-content">
              {renderPreview()}
            </div>
          </div>
        )}
      </div>

          <style>{`
        .code-editor-container {
          border: 1px solid #d9d9d9;
          border-radius: 6px;
          overflow: hidden;
        }

        .editor-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #fafafa;
          border-bottom: 1px solid #d9d9d9;
        }

        .language-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .editor-options {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .validation-status {
          font-size: 12px;
        }

        .editor-content {
          display: flex;
          overflow: hidden;
        }

        .editor-content.with-preview {
          border-right: 1px solid #d9d9d9;
        }

        .editor-panel {
          flex: 1;
          height: 100%;
          position: relative;
          overflow: hidden;
        }

        /* 强制Monaco Editor占据全部高度 */
        .editor-panel > div {
          height: 100% !important;
        }

        .preview-panel {
          width: 50%;
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #fff;
        }

        .preview-header {
          padding: 12px;
          border-bottom: 1px solid #d9d9d9;
          background: #fafafa;
        }

        .preview-content {
          flex: 1;
          overflow: auto;
          padding: 16px;
        }

        .markdown-preview {
          line-height: 1.6;
        }

        .markdown-preview h1,
        .markdown-preview h2,
        .markdown-preview h3,
        .markdown-preview h4,
        .markdown-preview h5,
        .markdown-preview h6 {
          margin-top: 24px;
          margin-bottom: 16px;
        }

        .markdown-preview h1:first-child {
          margin-top: 0;
        }

        .markdown-preview pre {
          background: #f5f5f5;
          padding: 16px;
          border-radius: 4px;
          overflow-x: auto;
        }

        .markdown-preview code {
          background: #f5f5f5;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .code-preview {
          background: #f5f5f5;
          padding: 16px;
          border-radius: 4px;
          overflow: auto;
          height: 100%;
          margin: 0;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 13px;
          line-height: 1.4;
        }
      `}</style>
    </div>
  )
}

export default CodeEditor