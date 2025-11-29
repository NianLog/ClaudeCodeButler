/**
 * 通知容器组件
 * 显示和管理应用通知
 */

import React from 'react'
import { App, Button } from 'antd'
import {
  InfoCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined
} from '@ant-design/icons'

/**
 * 通知项类型
 */
export interface NotificationItem {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: Date
}

/**
 * 通知容器组件属性
 */
interface NotificationContainerProps {
  notifications: NotificationItem[]
  onRemove: (id: string) => void
}

/**
 * 获取通知图标
 */
const getNotificationIcon = (type: NotificationItem['type']) => {
  switch (type) {
    case 'success':
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    case 'warning':
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
    case 'error':
      return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
    case 'info':
    default:
      return <InfoCircleOutlined style={{ color: '#1890ff' }} />
  }
}

/**
 * 格式化时间
 */
const formatTime = (date: Date) => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 60) {
    return '刚刚'
  } else if (minutes < 60) {
    return `${minutes}分钟前`
  } else if (hours < 24) {
    return `${hours}小时前`
  } else {
    return date.toLocaleDateString()
  }
}

/**
 * 通知容器组件
 */
const NotificationContainer: React.FC<NotificationContainerProps> = ({
  notifications,
  onRemove
}) => {
  const { notification } = App.useApp()
  
  // 显示单个通知
  const showNotification = (item: NotificationItem) => {
    notification.open({
      key: item.id,
      message: (
        <div className="notification-header">
          {getNotificationIcon(item.type)}
          <span className="notification-title">{item.title}</span>
        </div>
      ),
      description: (
        <div className="notification-content">
          <p className="notification-message">{item.message}</p>
          <span className="notification-time">{formatTime(item.timestamp)}</span>
        </div>
      ),
      duration: 5,
      placement: 'topRight',
      closeIcon: (
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={() => onRemove(item.id)}
        />
      ),
      className: `app-notification notification-${item.type}`,
      onClose: () => onRemove(item.id)
    })
  }

  // 当通知列表变化时，显示通知
  React.useEffect(() => {
    notifications.forEach(item => {
      // 检查通知是否已经显示
      if (!notification[item.id]) {
        showNotification(item)
      }
    })
  }, [notifications])

  // 清除所有通知
  const clearAllNotifications = () => {
    notifications.forEach(item => {
      notification.destroy(item.id)
    })
  }

  return (
    <div className="notification-container">
      {/* 通知计数徽章可以在这里实现 */}
      {notifications.length > 0 && (
        <div className="notification-indicator">
          <span className="notification-count">{notifications.length}</span>
        </div>
      )}
    </div>
  )
}

export default NotificationContainer