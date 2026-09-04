/**
 * @file src/renderer/src/components/Config/CloudTemplateLibraryModal.tsx
 * @description 共享云模板库弹窗（Claude 配置面板与多工具配置集面板共用）：
 *              仅显示当前所选工具（toolId）的云模板，其他工具的模板不可见也不可导入，
 *              避免跨工具的无效导入。清单拉取与导入全部经 main 侧验签链（Ed25519 → SHA-256 →
 *              schema → minAppVersion），弹窗本身不接触任何 URL 或模板内容。
 */

import React, { useEffect, useMemo, useState } from 'react'
import { App, Button, Empty, List, Modal, Space, Spin, Tag, Typography } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { TemplateCloudItemMeta } from '@shared/template-cloud'
import { useTranslation } from '../../locales/useTranslation'

const { Text } = Typography

/** 导入成功回传给父面板的信息（CONFIG_SET 导入后父面板可刷新列表/托盘） */
export interface CloudTemplateImportedInfo {
  kind: 'CONFIG_SET' | 'ARTIFACT'
  configSetName?: string
}

interface CloudTemplateLibraryModalProps {
  open: boolean
  toolId: string
  toolLabel: string
  onClose: () => void
  onImported?: (info: CloudTemplateImportedInfo) => void
}

/**
 * 云模板库弹窗组件。
 * @description 每次打开重新拉取并验签清单；导入结果：CONFIG_SET → 本地配置集快照，
 *              ARTIFACT → 该工具默认模板 override。两者均不直接修改生效配置。
 */
const CloudTemplateLibraryModal: React.FC<CloudTemplateLibraryModalProps> = ({
  open,
  toolId,
  toolLabel,
  onClose,
  onImported
}) => {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TemplateCloudItemMeta[]>([])
  const [indexVersion, setIndexVersion] = useState('')
  const [importingTemplateId, setImportingTemplateId] = useState('')

  // 每次打开重新拉取清单（main 侧验签），关闭时清空旧数据
  useEffect(() => {
    if (!open) {
      setItems([])
      setIndexVersion('')
      return
    }
    let cancelled = false
    setLoading(true)
    const loadIndex = async (): Promise<void> => {
      try {
        const response = await window.electronAPI.toolRegistry.listCloudTemplates()
        if (cancelled) return
        if (!response.success || !response.data) {
          throw new Error(response.error || t('configPanel.cloud.loadError'))
        }
        setItems(response.data.items)
        setIndexVersion(response.data.templatesVersion)
      } catch (error) {
        if (cancelled) return
        setItems([])
        message.error(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadIndex()
    return () => {
      cancelled = true
    }
  }, [open, message, t])

  // 按当前工具过滤：跨工具模板既不显示也不可导入
  const toolItems = useMemo(
    () => items.filter((item) => item.toolId === toolId),
    [items, toolId]
  )

  /** 导入云模板：CONFIG_SET → 本地配置集；ARTIFACT → 默认模板 override */
  const importTemplate = async (item: TemplateCloudItemMeta): Promise<void> => {
    setImportingTemplateId(item.templateId)
    try {
      const response = await window.electronAPI.toolRegistry.importCloudTemplate(item.templateId)
      if (!response.success || !response.data) {
        throw new Error(response.error || t('configPanel.cloud.importError'))
      }
      if (response.data.kind === 'CONFIG_SET') {
        message.success(t('configPanel.cloud.importedSet', { name: response.data.configSet.name }))
        onImported?.({ kind: 'CONFIG_SET', configSetName: response.data.configSet.name })
      } else {
        message.success(t('configPanel.cloud.importedArtifact'))
        onImported?.({ kind: 'ARTIFACT' })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setImportingTemplateId('')
    }
  }

  return (
    <Modal
      title={t('configPanel.cloud.title')}
      open={open}
      footer={null}
      onCancel={onClose}
      width={680}
      centered
    >
      <Space direction="vertical" style={{ width: '100%', padding: '12px 0' }}>
        <Text type="secondary">
          {t('configPanel.cloud.hint', { tool: toolLabel })}
          {indexVersion && ` · ${t('configPanel.cloud.indexVersion', { version: indexVersion })}`}
        </Text>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin size="large" />
          </div>
        ) : toolItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<div>{t('configPanel.cloud.empty', { tool: toolLabel })}</div>}
          />
        ) : (
          <List
            dataSource={toolItems}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="import"
                    size="small"
                    type="primary"
                    icon={<DownloadOutlined />}
                    loading={importingTemplateId === item.templateId}
                    onClick={() => void importTemplate(item)}
                  >
                    {t('configPanel.cloud.import')}
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={8}>
                      <span>{item.name}</span>
                      <Tag color={item.kind === 'CONFIG_SET' ? 'blue' : 'purple'}>
                        {item.kind === 'CONFIG_SET'
                          ? t('configPanel.cloud.kindConfigSet')
                          : t('configPanel.cloud.kindArtifact')}
                      </Tag>
                    </Space>
                  }
                  description={item.description}
                />
              </List.Item>
            )}
          />
        )}
      </Space>
    </Modal>
  )
}

export default CloudTemplateLibraryModal
