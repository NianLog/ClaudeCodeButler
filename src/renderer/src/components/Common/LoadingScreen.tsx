/**
 * 全局加载屏幕组件
 * 在应用初始化或执行长时间操作时显示
 */

import React from 'react'
import { Spin } from 'antd'
import { DatabaseOutlined } from '@ant-design/icons'

/**
 * 加载屏幕组件属性
 */
interface LoadingScreenProps {
  visible?: boolean
  text?: string
  icon?: React.ReactNode
  size?: 'small' | 'default' | 'large'
}

/**
 * 加载屏幕组件
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
  visible = true,
  text = '正在加载...',
  icon = <DatabaseOutlined />,
  size = 'large'
}) => {
  if (!visible) {
    return null
  }

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-icon">
          <Spin
            size={size}
            indicator={icon}
            spinning={true}
          />
        </div>
        <div className="loading-text">
          {text}
        </div>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen