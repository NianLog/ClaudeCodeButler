/**
 * 更新提示组件
 * 显示新版本信息和更新选项
 */

import React, { useState, useEffect } from 'react'
import { Modal, Typography, Space, Button, Descriptions, Tag, Progress, message } from 'antd'
import {
  CloudDownloadOutlined,
  ExclamationCircleOutlined,
  GlobalOutlined,
  LockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import type { VersionInfo } from '../../services/version-service'
import { useTranslation } from '../../locales/useTranslation'

const { Title, Text, Paragraph } = Typography

/**
 * 更新提示Modal属性
 */
export interface UpdateModalProps {
  /** 是否显示 */
  visible: boolean
  /** 当前版本 */
  currentVersion: string
  /** 最新版本 */
  latestVersion: string
  /** 版本信息 */
  versionInfo: VersionInfo
  /** 关闭回调 */
  onClose: () => void
  /** 立即更新回调 */
  onUpdate: (downloadUrl: string) => void
  /** 访问官网回调 */
  onVisitWebsite: () => void
}

/**
 * 更新提示Modal组件
 */
const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  currentVersion,
  latestVersion,
  versionInfo,
  onClose,
  onUpdate,
  onVisitWebsite
}) => {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const [showBrowserButton, setShowBrowserButton] = useState(false)

  /**
   * 格式化更新说明
   */
  const formatUpdateText = (text: string): string[] => {
    return text.replace(/\/n/g, '\n').split('\n').filter(line => line.trim())
  }

  /**
   * 设置下载进度监听
   */
  useEffect(() => {
    if (visible && !downloadComplete) {
      // 监听下载进度
      window.electronAPI.system.onDownloadProgress((progress) => {
        setDownloadProgress(progress.progress)
      })
    }
  }, [visible, downloadComplete])

  /**
   * 处理下载
   */
  const handleDownload = async () => {
    // 防止重复下载：如果已经在下载中，直接返回
    if (downloading) {
      console.log('下载已在进行中，忽略重复点击')
      message.info(t('updateModal.downloadingInProgress'))
      return
    }

    try {
      setDownloading(true)
      setDownloadProgress(0)
      setDownloadError(false)
      setShowBrowserButton(false)

      // 验证下载URL
      console.log('========== 准备下载 ==========')
      console.log('版本信息:', versionInfo)
      console.log('下载URL:', versionInfo.downloadUrl)
      console.log('文件名:', `CCB-${latestVersion}.exe`)

      if (!versionInfo.downloadUrl || typeof versionInfo.downloadUrl !== 'string') {
        throw new Error(t('updateModal.invalidDownloadUrl'))
      }

      // 设置3分钟超时,显示浏览器下载按钮
      const timeoutId = setTimeout(() => {
        if (downloading && !downloadComplete) {
          setShowBrowserButton(true)
        }
      }, 180000) // 3分钟后显示浏览器下载选项

      // 从URL中提取文件名,如果URL包含文件扩展名就使用它
      const urlParts = versionInfo.downloadUrl.split('/')
      const urlFileName = urlParts[urlParts.length - 1]
      const fileName = urlFileName || `CCB-${latestVersion}.zip`

      const result = await window.electronAPI.system.downloadFile(
        versionInfo.downloadUrl,
        fileName
      )

      clearTimeout(timeoutId)

      if (result.success) {
        setDownloadComplete(true)
        setDownloading(false)
        message.success(result.message || t('updateModal.downloadSuccess'))

        // 3秒后自动关闭Modal
        setTimeout(() => {
          onClose()
        }, 3000)
      } else {
        // 检查是否是超时或中断错误，显示浏览器下载按钮
        if (result.error === 'timeout' || result.error === 'interrupted') {
          setShowBrowserButton(true)
          setDownloading(false)
          const errorMessage = result.error === 'timeout'
            ? t('updateModal.downloadTimeout')
            : result.message || t('updateModal.downloadInterrupted')
          message.warning(errorMessage)
        } else {
          setDownloadError(true)
          setDownloading(false)
          message.error(t('updateModal.downloadFailed', { error: result.message || result.error || t('common.unknownError') }))
          setShowBrowserButton(true)
        }
      }
    } catch (error) {
      setDownloadError(true)
      setDownloading(false)
      message.error(t('updateModal.downloadFailed', { error: error instanceof Error ? error.message : t('common.unknownError') }))
      setShowBrowserButton(true)
    }
  }

  /**
   * 使用浏览器下载
   */
  const handleBrowserDownload = async () => {
    try {
      await onUpdate(versionInfo.downloadUrl)
      message.info(t('updateModal.openInBrowserSuccess'))
      onClose()
    } catch (error) {
      message.error(t('updateModal.openBrowserFailed'))
    }
  }

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      centered
      closable={!downloading}
      maskClosable={!downloading}
    >
      <div style={{ padding: '20px 0' }}>
        {/* 头部 */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {downloadComplete ? (
            <CheckCircleOutlined
              style={{
                fontSize: '48px',
                color: '#52c41a',
                marginBottom: '16px'
              }}
            />
          ) : downloadError ? (
            <CloseCircleOutlined
              style={{
                fontSize: '48px',
                color: '#ff4d4f',
                marginBottom: '16px'
              }}
            />
          ) : (
            <ExclamationCircleOutlined
              style={{
                fontSize: '48px',
                color: '#1890ff',
                marginBottom: '16px'
              }}
            />
          )}
          <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>
            {downloadComplete
              ? t('updateModal.title.completed')
              : downloadError
              ? t('updateModal.title.failed')
              : downloading
              ? t('updateModal.title.downloading')
              : t('updateModal.title.available')}
          </Title>
          <Space>
            <Tag color="default">{currentVersion}</Tag>
            <Text type="secondary">→</Text>
            <Tag color="success">{latestVersion}</Tag>
          </Space>
        </div>

        {/* 版本信息 */}
        <Descriptions
          bordered
          column={1}
          size="small"
          style={{ marginBottom: '24px' }}
        >
          <Descriptions.Item label={t('updateModal.labels.currentVersion')}>{currentVersion}</Descriptions.Item>
          <Descriptions.Item label={t('updateModal.labels.latestVersion')}>
            <Tag color="success">{latestVersion}</Tag>
          </Descriptions.Item>
          {versionInfo.zipPassword && (
            <Descriptions.Item
              label={
                <span>
                  <LockOutlined /> {t('updateModal.labels.zipPassword')}
                </span>
              }
            >
              <Text code copyable>
                {versionInfo.zipPassword}
              </Text>
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* 下载进度 */}
        {downloading && !downloadComplete && (
          <div style={{ marginBottom: '24px' }}>
            <Progress percent={downloadProgress} status="active" />
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <Text type="secondary">{t('updateModal.progress.downloading')}</Text>
            </div>
          </div>
        )}

        {/* 更新说明 */}
        {versionInfo.updateText && !downloading && !downloadComplete && !downloadError && (
          <div
            style={{
              marginBottom: '24px',
              padding: '16px',
              background: '#f5f5f5',
              borderRadius: '8px'
            }}
          >
            <Title level={5} style={{ marginTop: 0, marginBottom: '12px' }}>
              {t('updateModal.section.releaseNotes')}
            </Title>
            <div>
              {formatUpdateText(versionInfo.updateText).map((line, index) => (
                <Paragraph
                  key={index}
                  style={{
                    margin: '4px 0',
                    paddingLeft: line.trim().startsWith('·') ? '0' : '16px'
                  }}
                >
                  {line}
                </Paragraph>
              ))}
            </div>
          </div>
        )}

        {/* 下载完成提示 */}
        {downloadComplete && (
          <div
            style={{
              marginBottom: '24px',
              padding: '16px',
              background: '#f6ffed',
              borderRadius: '8px',
              border: '1px solid #b7eb8f',
              textAlign: 'center'
            }}
          >
            <Text style={{ fontSize: '14px' }}>
              {t('updateModal.complete.message')}
              <br />
              {t('updateModal.complete.subMessage')}
            </Text>
          </div>
        )}

        {/* 操作按钮 */}
        <Space style={{ width: '100%', justifyContent: 'center' }} size="middle">
          {!downloading && !downloadComplete ? (
            <>
              <Button onClick={onClose}>{t('updateModal.actions.remindLater')}</Button>
              <Button
                icon={<GlobalOutlined />}
                onClick={onVisitWebsite}
              >
                {t('updateModal.actions.visitWebsite')}
              </Button>
              <Button
                type="primary"
                icon={<CloudDownloadOutlined />}
                onClick={handleDownload}
              >
                {t('updateModal.actions.downloadNow')}
              </Button>
            </>
          ) : downloading && showBrowserButton ? (
            <>
              <Button onClick={onClose}>{t('updateModal.actions.close')}</Button>
              <Button
                type="primary"
                icon={<GlobalOutlined />}
                onClick={handleBrowserDownload}
              >
                {t('updateModal.actions.downloadInBrowser')}
              </Button>
            </>
          ) : downloadError ? (
            <>
              <Button onClick={onClose}>{t('updateModal.actions.close')}</Button>
              <Button onClick={handleDownload}>{t('updateModal.actions.retryDownload')}</Button>
              <Button
                type="primary"
                icon={<GlobalOutlined />}
                onClick={handleBrowserDownload}
              >
                {t('updateModal.actions.downloadInBrowser')}
              </Button>
            </>
          ) : downloadComplete ? (
            <Button type="primary" onClick={onClose}>
              {t('updateModal.actions.close')}
            </Button>
          ) : null}
        </Space>

        {/* 提示文本 */}
        {!downloadComplete && !downloadError && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {downloading
                ? showBrowserButton
                  ? t('updateModal.hint.longDownload')
                  : t('updateModal.hint.downloading')
                : t('updateModal.hint.downloadStart')}
            </Text>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default UpdateModal
