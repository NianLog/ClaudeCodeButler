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
import { useTranslation } from '../../locales/useTranslation'

const { Text } = Typography

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
  const { t } = useTranslation()
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
      message.error(t('privilege.checkFailed'))
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
        message.success(t('privilege.elevateSuccess'))
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      } else {
        message.error(t('privilege.elevateFailed'))
      }
    } catch (error) {
      console.error('权限提升失败:', error)
      message.error(t('privilege.elevateError'))
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
        message.success(t('privilege.relaunchSuccess'))
        // 应用重启后不需要手动关闭模态框
      } else {
        message.error(t('privilege.relaunchFailed'))
      }
    } catch (error) {
      console.error('重启失败:', error)
      message.error(t('privilege.relaunchError'))
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
        <Card loading title={t('privilege.checking')}>
          <div style={{ height: 200 }} />
        </Card>
      )
    }

    return (
      <Card
        title={
          <Space>
            <SecurityScanOutlined />
            {t('privilege.checkResult')}
          </Space>
        }
      >
        <List
          dataSource={[
            {
              title: t('privilege.items.adminTitle'),
              description: privilegeCheck.isRunningAsAdmin ? t('privilege.items.adminYes') : t('privilege.items.adminNo'),
              icon: renderPrivilegeIcon(privilegeCheck.isRunningAsAdmin)
            },
            {
              title: t('privilege.items.fsTitle'),
              description: privilegeCheck.canAccessSystemFiles ? t('privilege.items.fsYes') : t('privilege.items.fsNo'),
              icon: renderPrivilegeIcon(privilegeCheck.canAccessSystemFiles)
            },
            {
              title: t('privilege.items.notifyTitle'),
              description: privilegeCheck.canAccessSystemNotifications ? t('privilege.items.notifyYes') : t('privilege.items.notifyNo'),
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
    <Card title={t('privilege.steps.title')}>
      <Steps
        current={currentStep}
        direction="vertical"
        size="small"
        items={[
          {
            title: t('privilege.steps.chooseTitle'),
            description: t('privilege.steps.chooseDesc'),
            icon: <SettingOutlined />
          },
          {
            title: t('privilege.steps.runTitle'),
            description: t('privilege.steps.runDesc'),
            icon: <RocketOutlined />
          },
          {
            title: t('privilege.steps.verifyTitle'),
            description: t('privilege.steps.verifyDesc'),
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
            {t('privilege.actions.autoElevate')}
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
            {t('privilege.actions.relaunch')}
          </Button>
        </Space>
      )}

      {(currentStep === 1 || currentStep === 2) && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Text>{t('privilege.progress.running')}</Text>
            <Progress
              percent={elevationProgress}
              status={isElevating ? 'active' : 'normal'}
              strokeColor={elevationProgress === 100 ? '#52c41a' : '#1890ff'}
            />
          </div>

          {elevationProgress === 100 && (
            <Alert
              message={currentStep === 1 ? t('privilege.progress.done') : t('privilege.progress.verified')}
              description={
                currentStep === 1
                  ? t('privilege.progress.doneDesc')
                  : t('privilege.progress.verifiedDesc')
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
      t('privilege.recommendations.default1'),
      t('privilege.recommendations.default2')
    ]

    return (
      <Card title={t('privilege.recommendations.title')}>
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
          {t('privilege.title')}
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
          message={t('privilege.alert.title')}
          description={t('privilege.alert.desc')}
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
              {t('privilege.actions.later')}
            </Button>
            {!isElevating && privilegeCheck?.needsElevation && (
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={handleElevate}
                loading={isElevating}
              >
                {t('privilege.actions.elevateNow')}
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  )
}

export default PrivilegeWarningModal