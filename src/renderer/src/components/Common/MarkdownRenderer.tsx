/**
 * 统一的Markdown渲染组件
 */

import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownRendererProps {
  content: string
  className?: string
}

type SyntaxModule = {
  SyntaxHighlighter: any
  theme: Record<string, React.CSSProperties>
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  const [syntaxModule, setSyntaxModule] = useState<SyntaxModule | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [{ Prism }, themeModule] = await Promise.all([
          import('react-syntax-highlighter'),
          import('react-syntax-highlighter/dist/esm/styles/prism')
        ])
        if (!cancelled) {
          setSyntaxModule({
            SyntaxHighlighter: Prism,
            theme: themeModule.vscDarkPlus as Record<string, React.CSSProperties>
          })
        }
      } catch {
        // ignore
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const components = useMemo(() => ({
    code({ className: codeClassName, children, node, ...rest }: any) {
      const match = /language-(\w+)/.exec(codeClassName || '')
      const codeText = String(children).replace(/\n$/, '')
      if (match && syntaxModule?.SyntaxHighlighter) {
        const SyntaxHighlighter = syntaxModule.SyntaxHighlighter
        return (
          <SyntaxHighlighter
            style={syntaxModule.theme}
            language={match[1]}
            PreTag="div"
          >
            {codeText}
          </SyntaxHighlighter>
        )
      }
      return (
        <code className={codeClassName} {...rest}>
          {codeText}
        </code>
      )
    }
  }), [syntaxModule])

  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  )
}

export default MarkdownRenderer
