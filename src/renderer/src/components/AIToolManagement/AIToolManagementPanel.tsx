/**
 * @file src/renderer/src/components/AIToolManagement/AIToolManagementPanel.tsx
 * @description 展示 registry 驱动的 AI 工具检测与 capability-aware 配置资产管理界面。
 */

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  List,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd'
import {
  CheckCircleOutlined,
  CloudSyncOutlined,
  FileSearchOutlined,
  HddOutlined,
  ReloadOutlined,
  SaveOutlined
} from '@ant-design/icons'
import type {
  ArtifactFormat,
  ConfigArtifactContent,
  DiscoveredConfigArtifact,
  ToolDefinition,
  ToolDetectionResult
} from '@shared/tool-registry'
import { useTranslation } from '../../locales/useTranslation'
import './AIToolManagementPanel.css'

const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
const { Title, Text, Paragraph } = Typography

const PANEL_TEXT = {
  'zh-CN': {
    title: 'AI 工具配置', subtitle: '通过本地规则库发现并管理 AI Agent 工具配置，新增工具无需重写应用。',
    tools: '已注册工具', artifacts: '配置资产', detected: '已检测到', notDetected: '未检测到，可继续检查已存在的配置文件',
    scanArtifacts: '扫描配置', open: '打开', readOnly: '只读', validate: '校验', backup: '创建备份', emptyTools: '规则库中没有工具定义',
    emptyArtifacts: '未发现当前平台的配置文件', securityTitle: '规则驱动的本地管理', securityDescription: '路径和能力由 effective registry 限定；远程规则不能携带脚本，写入前会重新校验权限。',
    confirmSaveTitle: '确认更新配置', confirmSaveContent: '将原子更新 {path}。如果规则声明 BACKUP，会先自动创建备份。',
    loadRegistryError: '加载工具规则库失败', detectError: '检测 AI 工具失败', discoverError: '发现配置资产失败', readError: '读取配置资产失败',
    validateError: '校验配置失败', saveError: '保存配置失败', backupError: '创建备份失败', valid: '配置校验通过', saved: '配置已安全保存', backupCreated: '备份已创建：{id}'
  },
  'en-US': {
    title: 'AI Tool Configuration', subtitle: 'Discover and manage AI agent tool configurations through the local registry without rebuilding the app for every tool.',
    tools: 'Registered tools', artifacts: 'Configuration artifacts', detected: 'Detected', notDetected: 'Not detected; existing configuration files can still be scanned',
    scanArtifacts: 'Scan configs', open: 'Open', readOnly: 'Read only', validate: 'Validate', backup: 'Create backup', emptyTools: 'No tool definitions in the registry',
    emptyArtifacts: 'No configuration files found for this platform', securityTitle: 'Registry-driven local management', securityDescription: 'The effective registry constrains paths and capabilities. Remote rules cannot carry scripts, and permissions are revalidated before writes.',
    confirmSaveTitle: 'Confirm configuration update', confirmSaveContent: 'This atomically updates {path}. A backup is created first when the registry declares BACKUP.',
    loadRegistryError: 'Failed to load the tool registry', detectError: 'Failed to detect AI tools', discoverError: 'Failed to discover configuration artifacts', readError: 'Failed to read the configuration artifact',
    validateError: 'Failed to validate the configuration', saveError: 'Failed to save the configuration', backupError: 'Failed to create the backup', valid: 'Configuration validation passed', saved: 'Configuration saved safely', backupCreated: 'Backup created: {id}'
  }
} as const

/**
 * 将 registry format 映射为现有 Monaco language。
 * @param format UPPERCASE artifact format
 * @returns CodeEditor 支持的 language
 */
function mapEditorLanguage(format: ArtifactFormat): 'json' | 'markdown' | 'plaintext' {
  if (format === 'JSON') return 'json'
  if (format === 'MARKDOWN') return 'markdown'
  return 'plaintext'
}

/**
 * Registry 驱动的 AI 工具配置管理面板。
 * @description 工具、路径和能力完全来自 main process effective registry。
 */
const AIToolManagementPanel: React.FC = () => {
  const { t, language } = useTranslation()
  const panelText = PANEL_TEXT[language]
  const formatPanelText = (value: string, variables: Record<string, string> = {}): string =>
    Object.entries(variables).reduce((result, [key, replacement]) => result.replace(`{${key}}`, replacement), value)
  const { message, modal } = App.useApp()
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [detections, setDetections] = useState<Record<string, ToolDetectionResult>>({})
  const [selectedToolId, setSelectedToolId] = useState<string>()
  const [artifacts, setArtifacts] = useState<DiscoveredConfigArtifact[]>([])
  const [activeContent, setActiveContent] = useState<ConfigArtifactContent>()
  const [draftContent, setDraftContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.toolId === selectedToolId),
    [selectedToolId, tools]
  )
  const activeDefinition = useMemo(
    () => selectedTool?.artifacts.find((artifact) => artifact.artifactId === activeContent?.artifactId),
    [activeContent?.artifactId, selectedTool]
  )
  const canEdit = activeDefinition?.capabilities.includes('EDIT') ?? false
  const canValidate = activeDefinition?.capabilities.includes('VALIDATE') ?? false
  const canBackup = activeDefinition?.capabilities.includes('BACKUP') ?? false

  /** 加载 effective registry 与工具检测结果 */
  const loadTools = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [snapshotResponse, detectionResponse] = await Promise.all([
        window.electronAPI.toolRegistry.getSnapshot(),
        window.electronAPI.toolRegistry.detectTools()
      ])
      if (!snapshotResponse.success || !snapshotResponse.data) {
        throw new Error(snapshotResponse.error || panelText.loadRegistryError)
      }
      if (!detectionResponse.success || !detectionResponse.data) {
        throw new Error(detectionResponse.error || panelText.detectError)
      }
      setTools(snapshotResponse.data.tools)
      setDetections(Object.fromEntries(
        detectionResponse.data.map((result) => [result.toolId, result])
      ))
      setSelectedToolId((current) => current ?? snapshotResponse.data?.tools[0]?.toolId)
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [message, panelText.detectError, panelText.loadRegistryError])

  /** 加载当前工具已存在的配置资产 */
  const loadArtifacts = useCallback(async (toolId: string): Promise<void> => {
    setLoadingArtifacts(true)
    setActiveContent(undefined)
    try {
      const response = await window.electronAPI.toolRegistry.discoverArtifacts(toolId)
      if (!response.success) throw new Error(response.error || panelText.discoverError)
      setArtifacts(response.data ?? [])
    } catch (error) {
      setArtifacts([])
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingArtifacts(false)
    }
  }, [message, panelText.discoverError])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  useEffect(() => {
    if (selectedToolId) void loadArtifacts(selectedToolId)
  }, [loadArtifacts, selectedToolId])

  /** 读取选定配置资产 */
  const openArtifact = async (artifact: DiscoveredConfigArtifact): Promise<void> => {
    const response = await window.electronAPI.toolRegistry.readArtifact(
      artifact.toolId,
      artifact.artifactId,
      artifact.path
    )
    if (!response.success || !response.data) {
      message.error(response.error || panelText.readError)
      return
    }
    setActiveContent(response.data)
    setDraftContent(response.data.content)
  }

  /** 使用 main process codec 验证 draft */
  const validateDraft = async (): Promise<boolean> => {
    if (!activeContent) return false
    const response = await window.electronAPI.toolRegistry.validateArtifact(
      activeContent.toolId,
      activeContent.artifactId,
      activeContent.path,
      draftContent
    )
    if (!response.success || !response.data) {
      message.error(response.error || panelText.validateError)
      return false
    }
    if (!response.data.valid) {
      message.error(response.data.errors.join('; '))
      return false
    }
    message.success(panelText.valid)
    return true
  }

  /** 明确确认后原子保存配置 */
  const saveDraft = (): void => {
    if (!activeContent || !canEdit) return
    modal.confirm({
      title: panelText.confirmSaveTitle,
      content: formatPanelText(panelText.confirmSaveContent, { path: activeContent.path }),
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSaving(true)
        try {
          const response = await window.electronAPI.toolRegistry.editArtifact(
            activeContent.toolId,
            activeContent.artifactId,
            activeContent.path,
            draftContent
          )
          if (!response.success || !response.data) {
            throw new Error(response.error || panelText.saveError)
          }
          setActiveContent(response.data)
          setDraftContent(response.data.content)
          message.success(panelText.saved)
        } catch (error) {
          message.error(error instanceof Error ? error.message : String(error))
          throw error
        } finally {
          setSaving(false)
        }
      }
    })
  }

  /** 显式创建配置备份 */
  const createBackup = async (): Promise<void> => {
    if (!activeContent || !canBackup) return
    const response = await window.electronAPI.toolRegistry.createArtifactBackup(
      activeContent.toolId,
      activeContent.artifactId,
      activeContent.path
    )
    if (!response.success || !response.data) {
      message.error(response.error || panelText.backupError)
      return
    }
    message.success(formatPanelText(panelText.backupCreated, { id: response.data.backupId }))
  }

  return (
    <div className="ai-tool-management-panel">
      <div className="ai-tool-header">
        <div>
          <Title level={2}>{panelText.title}</Title>
          <Paragraph type="secondary">{panelText.subtitle}</Paragraph>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadTools()} loading={loading}>
          {t('common.refresh')}
        </Button>
      </div>

      <Alert showIcon type="info" message={panelText.securityTitle} description={panelText.securityDescription} />

      <Spin spinning={loading}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card title={panelText.tools}>
              <List
                dataSource={tools}
                locale={{ emptyText: <Empty description={panelText.emptyTools} /> }}
                renderItem={(tool) => {
                  const detection = detections[tool.toolId]
                  const selected = tool.toolId === selectedToolId
                  return (
                    <List.Item
                      className={selected ? 'ai-tool-list-item selected' : 'ai-tool-list-item'}
                      onClick={() => setSelectedToolId(tool.toolId)}
                    >
                      <List.Item.Meta
                        avatar={detection?.detected ? <CheckCircleOutlined className="detected-icon" /> : <CloudSyncOutlined />}
                        title={tool.displayName[language]}
                        description={detection?.detected ? panelText.detected : panelText.notDetected}
                      />
                    </List.Item>
                  )
                }}
              />
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              title={selectedTool?.displayName[language] ?? panelText.artifacts}
              extra={selectedToolId && (
                <Button size="small" icon={<FileSearchOutlined />} onClick={() => void loadArtifacts(selectedToolId)}>
                  {panelText.scanArtifacts}
                </Button>
              )}
            >
              <Spin spinning={loadingArtifacts}>
                <List
                  dataSource={artifacts}
                  locale={{ emptyText: <Empty description={panelText.emptyArtifacts} /> }}
                  renderItem={(artifact) => {
                    const definition = selectedTool?.artifacts.find((item) => item.artifactId === artifact.artifactId)
                    return (
                      <List.Item
                        actions={[
                          <Button key="open" type="link" onClick={() => void openArtifact(artifact)}>
                            {panelText.open}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<HddOutlined />}
                          title={definition?.displayName[language] ?? artifact.artifactId}
                          description={<Text copyable ellipsis>{artifact.path}</Text>}
                        />
                        <Space wrap>
                          <Tag>{artifact.format}</Tag>
                          {definition?.capabilities.map((capability) => <Tag key={capability}>{capability}</Tag>)}
                        </Space>
                      </List.Item>
                    )
                  }}
                />
              </Spin>
            </Card>
          </Col>
        </Row>
      </Spin>

      <Modal
        title={activeDefinition?.displayName[language] ?? activeContent?.artifactId}
        open={Boolean(activeContent)}
        width="min(1100px, 92vw)"
        footer={null}
        destroyOnClose
        onCancel={() => setActiveContent(undefined)}
      >
        {activeContent && (
          <>
            <Space wrap className="artifact-actions">
              <Tag>{activeContent.format}</Tag>
              {!canEdit && <Tag color="gold">{panelText.readOnly}</Tag>}
              {canValidate && <Button onClick={() => void validateDraft()}>{panelText.validate}</Button>}
              {canBackup && <Button onClick={() => void createBackup()}>{panelText.backup}</Button>}
              {canEdit && (
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveDraft}>
                  {t('common.save')}
                </Button>
              )}
            </Space>
            <Suspense fallback={<Spin />}>
              <CodeEditor
                value={draftContent}
                onChange={setDraftContent}
                language={mapEditorLanguage(activeContent.format)}
                readOnly={!canEdit}
                showPreview={activeContent.format === 'MARKDOWN'}
                height="55vh"
              />
            </Suspense>
          </>
        )}
      </Modal>
    </div>
  )
}

export default AIToolManagementPanel
