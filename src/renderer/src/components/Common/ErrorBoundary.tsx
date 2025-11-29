/**
 * 错误边界组件
 * 捕获和处理React组件中的错误
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Button, Result } from 'antd'
import {
  ExclamationCircleOutlined,
  ReloadOutlined,
  HomeOutlined
} from '@ant-design/icons'

/**
 * 错误边界组件属性
 */
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * 错误边界组件状态
 */
interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

/**
 * 错误边界组件
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    this.setState({
      error,
      errorInfo
    })

    // 发送错误报告（可选）
    this.reportError(error, errorInfo)
  }

  /**
   * 错误报告
   */
  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    try {
      // 这里可以集成错误监控服务
      console.group('Error Report')
      console.error('Error:', error)
      console.error('Error Info:', errorInfo)
      console.error('Component Stack:', errorInfo.componentStack)
      console.groupEnd()

      // 可以发送到日志服务
      // window.electronAPI.log.error('React Error Boundary', {
      //   error: error.message,
      //   stack: error.stack,
      //   componentStack: errorInfo.componentStack
      // })
    } catch (reportError) {
      console.error('Failed to report error:', reportError)
    }
  }

  /**
   * 重试处理
   */
  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  /**
   * 回到首页
   */
  private handleGoHome = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
    // 这里需要导入useAppStore
  }

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback
      }

      // 默认错误页面
      return (
        <div className="error-boundary">
          <Result
            status="error"
            icon={<ExclamationCircleOutlined />}
            title="应用出现错误"
            subTitle={
              typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'
                ? this.state.error?.message
                : '抱歉，应用遇到了一个意外错误'
            }
            extra={[
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleRetry}
                key="retry"
              >
                重试
              </Button>,
              <Button
                icon={<HomeOutlined />}
                onClick={this.handleGoHome}
                key="home"
              >
                回到首页
              </Button>
            ]}
          >
            {/* 开发环境显示详细错误信息 */}
            {typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' && (
              <div className="error-details">
                <h4>错误详情：</h4>
                <pre style={{
                  textAlign: 'left',
                  background: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {this.state.error?.stack}
                </pre>

                {this.state.errorInfo && (
                  <>
                    <h4>组件堆栈：</h4>
                    <pre style={{
                      textAlign: 'left',
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      maxHeight: '200px',
                      overflow: 'auto'
                    }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            )}
          </Result>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary