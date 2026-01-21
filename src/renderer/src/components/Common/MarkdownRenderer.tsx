/**
 * 统一的Markdown渲染组件
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface MarkdownRendererProps {
  content: string
  className?: string
}

const syntaxTheme = vscDarkPlus as Record<string, React.CSSProperties>

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => (
  <ReactMarkdown
    className={className}
    remarkPlugins={[remarkGfm]}
    components={{
      code({ className: codeClassName, children, node, ...rest }) {
        const match = /language-(\w+)/.exec(codeClassName || '')
        const codeText = String(children).replace(/\n$/, '')
        if (match) {
          return (
            <SyntaxHighlighter
              style={syntaxTheme}
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
    }}
  >
    {content}
  </ReactMarkdown>
)

export default MarkdownRenderer
