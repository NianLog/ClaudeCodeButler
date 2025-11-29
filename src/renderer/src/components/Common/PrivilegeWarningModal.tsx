/**
 * 权限警告模态框组件
 * 用于显示权限不足警告并提供权限提升选项
 */

import React, { useState, useEffect } from 'react'
import {
  Modal,
  Button,
  Alert,
  Space,
  Typography,
  List,
  Steps,
  Card,
  Divider,
  Progress
} from 'antd'
import { useMessage } from '../../hooks/useMessage'
import {
  ExclamationCircleOutlined,
  SecurityScanOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  RocketOutlined,
  SettingOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { Step } = Steps

/**
 * 权限警告数据类型
 */
interface PrivilegeWarning {
  privilegeLevel: string
  missingPermissions: string[]
  recommendations: string[]
}

/**
 * 权限检查结果
 */
interface PrivilegeCheckResult {
  isRunningAsAdmin: boolean
  privilegeLevel: string
  needsElevation: boolean
  canAccessSystemFiles: boolean
  canAccessSystemNotifications: boolean
}

/**
 * 权限警告模态框属性
 */
interface PrivilegeWarningModalProps {
  visible: boolean
  warning?: PrivilegeWarning
  onClose: () => void
  onElevate: () => Promise<boolean>
  onRelaunchAsAdmin: () => Promise<boolean>
}

/**
 * 权限警告模态框组件
 */
const PrivilegeWarningModal: React.FC<PrivilegeWarningModalProps> = ({
  visible,
  warning,
  onClose,
  onElevate,
  onRelaunchAsAdmin
}) => {
  const message = useMessage()
  const [currentStep, setCurrentStep] = useState(0)
  const [isElevating, setIsElevating] = useState(false)
  const [privilegeCheck, setPrivilegeCheck] = useState<PrivilegeCheckResult | null>(null)
  const [elevationProgress, setElevationProgress] = useState(0)

  // 组件挂载时检查权限状态
  useEffect(() => {
    if (visible) {
      checkPrivileges()
    }
  }, [visible])

  // 检查权限状态
  const checkPrivileges = async () => {
    try {
      const result = await window.electronAPI.privilege.check()
      setPrivilegeCheck(result)
    } catch (error) {
      console.error('权限检查失败:', error)
      message.error('权限检查失败')
    }
  }

  // 权限提升
  const handleElevate = async () => {
    setIsElevating(true)
    setElevationProgress(0)

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setElevationProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 100)

      const success = await onElevate()

      clearInterval(progressInterval)
      setElevationProgress(success ? 100 : 0)

      if (success) {
        message.success('权限提升成功')
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        message.error('权限提升失败，请尝试手动以管理员身份运行')
      }
    } catch (error) {
      console.error('权限提升失败:', error)
      message.error('权限提升过程中发生错误')
    } finally {
      setIsElevating(false)
      setTimeout(() => setElevationProgress(0), 2000)
    }
  }

  // 以管理员身份重启
  const handleRelaunchAsAdmin = async () => {
    setIsElevating(true)
    setElevationProgress(0)

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setElevationProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 15
        })
      }, 100)

      const success = await onRelaunchAsAdmin()

      clearInterval(progressInterval)
      setElevationProgress(success ? 100 : 0)

      if (success) {
        message.success('应用将以管理员权限重启')
        // 应用重启后不需要手动关闭模态框
      } else {
        message.error('重启失败，请手动以管理员身份运行应用')
      }
    } catch (error) {
      console.error('重启失败:', error)
      message.error('重启过程中发生错误')
    } finally {
      setIsElevating(false)
      setTimeout(() => setElevationProgress(0), 2000)
    }
  }

  // 渲染权限状态图标
  const renderPrivilegeIcon = (hasPermission: boolean) => {
    return hasPermission ? (
      <CheckCircleOutlined style={{ color: '#52c41a' }} />
    ) : (
      <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
    )
  }

  // 渲染权限检查结果
  const renderPrivilegeCheck = () => {
    if (!privilegeCheck) {
      return (
        <Card loading title="正在检查权限状态...">
          <div style={{ height: 200 }} />
        </Card>
      )
    }

    return (
      <Card
        title={
          <Space>
            <SecurityScanOutlined />
            权限检查结果
          </Space>
        }
      >
        <List
          dataSource={[
            {
              title: '管理员权限',
              description: privilegeCheck.isRunningAsAdmin ? '当前具有管理员权限' : '当前以普通用户权限运行',
              icon: renderPrivilegeIcon(privilegeCheck.isRunningAsAdmin)
            },
            {
              title: '文件系统访问',
              description: privilegeCheck.canAccessSystemFiles ? '可以访问系统文件' : '无法访问系统文件',
              icon: renderPrivilegeIcon(privilegeCheck.canAccessSystemFiles)
            },
            {
              title: '系统通知',
              description: privilegeCheck.canAccessSystemNotifications ? '可以发送系统通知' : '无法发送系统通知',
              icon: renderPrivilegeIcon(privilegeCheck.canAccessSystemNotifications)
            }
          ]}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                avatar={item.icon}
                title={item.title}
                description={item.description}
              />
            </List.Item>
          )}
        />
      </Card>
    )
  }

  // 渲染权限提升步骤
  const renderElevationSteps = () => (
    <Card title="权限提升步骤">
      <Steps
        current={currentStep}
        direction="vertical"
        size="small"
        items={[
          {
            title: '选择提升方式',
            description: '选择自动提升或手动重启',
            icon: <SettingOutlined />
          },
          {
            title: '执行权限提升',
            description: '系统将请求管理员权限',
            icon: <RocketOutlined />
          },
          {
            title: '完成验证',
            description: '验证权限提升是否成功',
            icon: <CheckCircleOutlined />
          }
        ]}
      />

      <Divider />

      {currentStep === 0 && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            size="large"
            block
            icon={<RocketOutlined />}
            onClick={() => {
              setCurrentStep(1)
              handleElevate()
            }}
            loading={isElevating}
          >
            自动提升权限
          </Button>

          <Button
            size="large"
            block
            icon={<SettingOutlined />}
            onClick={() => {
              setCurrentStep(1)
              handleRelaunchAsAdmin()
            }}
            loading={isElevating}
          >
            以管理员身份重启
          </Button>
        </Space>
      )}

      {(currentStep === 1 || currentStep === 2) && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text>正在执行权限提升...</Text>
            <Progress
              percent={elevationProgress}
              status={isElevating ? 'active' : 'normal'}
              strokeColor={elevationProgress === 100 ? '#52c41a' : '#1890ff'}
            />
          </div>

          {elevationProgress === 100 && (
            <Alert
              message={currentStep === 1 ? '权限提升完成' : '验证成功'}
              description={
                currentStep === 1
                  ? '权限提升成功，应用功能将完全可用'
                  : '权限验证通过，所有功能正常'
              }
              type="success"
              showIcon
            />
          )}
        </div>
      )}
    </Card>
  )

  // 渲染推荐操作
  const renderRecommendations = () => {
    const recommendations = warning?.recommendations || [
      '右键点击应用图标，选择"以管理员身份运行"',
      '或在设置中手动授予必要权限'
    ]

    return (
      <Card title="推荐操作">
        <List
          dataSource={recommendations}
          renderItem={(item, index) => (
            <List.Item>
              <Space>
                <Text strong>{index + 1}.</Text>
                <Text>{item}</Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          权限不足警告
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={600}
      footer={null}
      maskClosable={!isElevating}
      closable={!isElevating}
    >
      <div style={{ minHeight: 400 }}>
        <Alert
          message="应用权限不足"
          description="CCB 需要管理员权限才能正常运行全部功能。缺少权限可能导致某些功能无法使用。"
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {renderPrivilegeCheck()}
          {privilegeCheck?.needsElevation && renderElevationSteps()}
          {renderRecommendations()}
        </Space>

        <Divider />

        <div style={{ textAlign: 'center' }}>
          <Space>
            <Button onClick={onClose}>
              稍后处理
            </Button>
            {!isElevating && privilegeCheck?.needsElevation && (
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={handleElevate}
                loading={isElevating}
              >
                立即提升权限
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  )
}

export default PrivilegeWarningModal