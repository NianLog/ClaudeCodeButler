/**
 * @file src/renderer/src/components/AIToolManagement/AIToolManagementPanel.tsx
 * @description 展示 registry 驱动的 AI 工具检测与 capability-aware 配置资产管理界面。
 *              同工具内 editGroup 相同的 artifacts 在同一编辑面板聚合呈现，保存时由面板
 *              依次调用 per-artifact 授权/校验/备份/原子写链路同步更新多个关联文件。
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
  Tabs,
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
  ConfigArtifactBackup,
  ConfigArtifactContent,
  ConfigArtifactDefinition,
  DiscoveredConfigArtifact,
  ToolDefinition,
  ToolDetectionResult,
  ToolPlatform
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
    backupHistory: '历史备份', emptyBackups: '没有可恢复的备份', restore: '恢复', restoreTitle: '确认恢复备份', restoreContent: '将使用 {time} 的备份覆盖当前配置，是否继续？',
    emptyArtifacts: '未发现当前平台的配置文件', securityTitle: '规则驱动的本地管理', securityDescription: '路径和能力由 effective registry 限定；远程规则不能携带脚本，写入前会重新校验权限。',
    confirmSaveTitle: '确认更新配置', confirmSaveContent: '将原子更新 {path}。如果规则声明 BACKUP，会先自动创建备份。',
    confirmSaveMultiTitle: '确认更新关联配置', confirmSaveMultiContent: '将依次原子更新以下关联文件（声明 BACKUP 的会先自动创建备份）：',
    toBeUpdated: '更新', toBeCreated: '新建', configSetTitle: '配置集', linkedEditTag: '关联编辑',
    missingFileHint: '{path} 尚不存在。修改默认模板后保存，将按 registry 声明创建该文件。',
    loadRegistryError: '加载工具规则库失败', detectError: '检测 AI 工具失败', discoverError: '发现配置资产失败', readError: '读取配置资产失败',
    validateError: '校验配置失败', saveError: '保存配置失败', backupError: '创建备份失败', listBackupsError: '加载备份列表失败', restoreError: '恢复备份失败', valid: '配置校验通过', saved: '配置已安全保存', restored: '配置已从备份恢复', backupCreated: '备份已创建：{id}'
  },
  'en-US': {
    title: 'AI Tool Configuration', subtitle: 'Discover and manage AI agent tool configurations through the local registry without rebuilding the app for every tool.',
    tools: 'Registered tools', artifacts: 'Configuration artifacts', detected: 'Detected', notDetected: 'Not detected; existing configuration files can still be scanned',
    scanArtifacts: 'Scan configs', open: 'Open', readOnly: 'Read only', validate: 'Validate', backup: 'Create backup', emptyTools: 'No tool definitions in the registry',
    backupHistory: 'Backup history', emptyBackups: 'No restorable backups', restore: 'Restore', restoreTitle: 'Confirm backup restore', restoreContent: 'This replaces the current configuration with the backup from {time}. Continue?',
    emptyArtifacts: 'No configuration files found for this platform', securityTitle: 'Registry-driven local management', securityDescription: 'The effective registry constrains paths and capabilities. Remote rules cannot carry scripts, and permissions are revalidated before writes.',
    confirmSaveTitle: 'Confirm configuration update', confirmSaveContent: 'This atomically updates {path}. A backup is created first when the registry declares BACKUP.',
    confirmSaveMultiTitle: 'Confirm updating linked configurations', confirmSaveMultiContent: 'The following linked files are updated atomically in order (a backup is created first when BACKUP is declared):',
    toBeUpdated: 'Update', toBeCreated: 'Create', configSetTitle: 'Configuration set', linkedEditTag: 'Linked editing',
    missingFileHint: '{path} does not exist yet. Edit the default template and save to create it as declared by the registry.',
    loadRegistryError: 'Failed to load the tool registry', detectError: 'Failed to detect AI tools', discoverError: 'Failed to discover configuration artifacts', readError: 'Failed to read the configuration artifact',
    validateError: 'Failed to validate the configuration', saveError: 'Failed to save the configuration', backupError: 'Failed to create the backup', listBackupsError: 'Failed to load backup history', restoreError: 'Failed to restore the backup', valid: 'Configuration validation passed', saved: 'Configuration saved safely', restored: 'Configuration restored from backup', backupCreated: 'Backup created: {id}'
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

/** 推断当前渲染平台（仅用于为缺失文件挑选 registry 声明的候选路径；主进程仍逐次重新授权） */
function inferRendererPlatform(): ToolPlatform {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (userAgent.includes('Win')) return 'WINDOWS'
  if (userAgent.includes('Mac')) return 'MACOS'
  return 'LINUX'
}

/** 编辑面板中的单个（可能是聚合分组成员的）artifact 加载状态 */
interface EditorPart {
  definition: ConfigArtifactDefinition
  /** 已存在文件的内容；文件尚不存在时为 undefined（保存时按 registry 声明路径创建） */
  content?: ConfigArtifactContent
  /** 展示用 registry 声明候选路径模板；IPC 调用对缺失文件统一传空串，由主进程解析主候选路径 */
  candidatePath: string
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
  const [editorParts, setEditorParts] = useState<EditorPart[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [baselines, setBaselines] = useState<Record<string, string>>({})
  const [activeTabId, setActiveTabId] = useState('')
  const [backups, setBackups] = useState<ConfigArtifactBackup[]>([])
  const [backupHistoryOpen, setBackupHistoryOpen] = useState(false)
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingArtifacts, setLoadingArtifacts] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.toolId === selectedToolId),
    [selectedToolId, tools]
  )
  const activePart = useMemo(
    () => editorParts.find((part) => part.definition.artifactId === activeTabId),
    [activeTabId, editorParts]
  )
  const canEdit = activePart?.definition.capabilities.includes('EDIT') ?? false
  const canValidate = activePart?.definition.capabilities.includes('VALIDATE') ?? false
  const canBackup = activePart?.definition.capabilities.includes('BACKUP') ?? false
  const canRestore = activePart?.definition.capabilities.includes('RESTORE') ?? false
  /** 存在未保存草稿的分组成员（保存动作的目标） */
  const dirtyParts = useMemo(
    () => editorParts.filter((part) => drafts[part.definition.artifactId] !== baselines[part.definition.artifactId]),
    [baselines, drafts, editorParts]
  )
  const compositeMode = editorParts.length > 1

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
    setEditorParts([])
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

  /**
   * 打开配置资产编辑面板；artifact 声明 editGroup 时聚合同组成员为多个编辑页签。
   * @param artifact 从 discovery 结果打开的配置资产
   */
  const openArtifact = async (artifact: DiscoveredConfigArtifact): Promise<void> => {
    const tool = tools.find((candidate) => candidate.toolId === artifact.toolId)
    const definition = tool?.artifacts.find((item) => item.artifactId === artifact.artifactId)
    if (!tool || !definition) return
    const group = definition.editGroup
      ? tool.artifacts.filter((item) => item.editGroup === definition.editGroup)
      : [definition]
    const platform = inferRendererPlatform()
    const parts: EditorPart[] = []
    const nextDrafts: Record<string, string> = {}
    const nextBaselines: Record<string, string> = {}
    for (const member of group) {
      const discovered = artifacts.find(
        (item) => item.toolId === tool.toolId && item.artifactId === member.artifactId
      )
      const candidatePath = discovered?.path ?? member.paths[platform]?.[0] ?? ''
      if (!candidatePath) continue
      if (discovered) {
        const response = await window.electronAPI.toolRegistry.readArtifact(
          tool.toolId,
          member.artifactId,
          discovered.path
        )
        if (!response.success || !response.data) {
          message.error(response.error || panelText.readError)
          return
        }
        parts.push({ definition: member, content: response.data, candidatePath })
        nextDrafts[member.artifactId] = response.data.content
        nextBaselines[member.artifactId] = response.data.content
      } else {
        parts.push({ definition: member, candidatePath })
        const template = member.defaultTemplate ?? ''
        nextDrafts[member.artifactId] = template
        nextBaselines[member.artifactId] = template
      }
    }
    if (parts.length === 0) return
    setEditorParts(parts)
    setDrafts(nextDrafts)
    setBaselines(nextBaselines)
    setActiveTabId(artifact.artifactId)
  }

  /** 更新单个分组成员保存后的 content 与草稿基线 */
  const applySavedContent = (artifactId: string, content: ConfigArtifactContent): void => {
    setEditorParts((current) => current.map((part) => part.definition.artifactId === artifactId
      ? { ...part, content }
      : part))
    setDrafts((current) => ({ ...current, [artifactId]: content.content }))
    setBaselines((current) => ({ ...current, [artifactId]: content.content }))
  }

  /** 使用 main process codec 验证当前页签草稿 */
  const validateDraft = async (): Promise<boolean> => {
    if (!activePart) return false
    const artifactId = activePart.definition.artifactId
    const response = await window.electronAPI.toolRegistry.validateArtifact(
      selectedToolId ?? '',
      artifactId,
      activePart.content?.path ?? '',
      drafts[artifactId] ?? ''
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

  /**
   * 明确确认后保存全部未保存草稿：先统一校验，再按分组成员顺序原子写入各文件。
   * 每个文件独立走 per-artifact 授权/自动备份/原子替换，注释与原始格式天然保留。
   */
  const saveDraft = (): void => {
    if (!selectedToolId || dirtyParts.length === 0) return
    const editableParts = dirtyParts.filter((part) => part.definition.capabilities.includes('EDIT'))
    if (editableParts.length === 0) return
    const toolId = selectedToolId
    const fileList = editableParts
      .map((part) => `${part.content ? panelText.toBeUpdated : panelText.toBeCreated} · ${part.content?.path ?? part.candidatePath}`)
      .join('\n')
    modal.confirm({
      title: compositeMode ? panelText.confirmSaveMultiTitle : panelText.confirmSaveTitle,
      content: compositeMode
        ? `${panelText.confirmSaveMultiContent}\n${fileList}`
        : formatPanelText(panelText.confirmSaveContent, { path: editableParts[0].content?.path ?? editableParts[0].candidatePath }),
      okText: t('common.save'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSaving(true)
        try {
          for (const part of editableParts) {
            if (!part.definition.capabilities.includes('VALIDATE')) continue
            const artifactId = part.definition.artifactId
            const response = await window.electronAPI.toolRegistry.validateArtifact(
              toolId,
              artifactId,
              part.content?.path ?? '',
              drafts[artifactId] ?? ''
            )
            if (!response.success || !response.data?.valid) {
              const errors = response.success && response.data && !response.data.valid
                ? response.data.errors.join('; ')
                : response.error || panelText.validateError
              throw new Error(`${part.definition.displayName[language]}: ${errors}`)
            }
          }
          for (const part of editableParts) {
            const artifactId = part.definition.artifactId
            const response = await window.electronAPI.toolRegistry.editArtifact(
              toolId,
              artifactId,
              part.content?.path ?? '',
              drafts[artifactId] ?? ''
            )
            if (!response.success || !response.data) {
              throw new Error(`${part.definition.displayName[language]}: ${response.error || panelText.saveError}`)
            }
            applySavedContent(artifactId, response.data)
          }
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

  /** 显式创建当前页签配置备份 */
  const createBackup = async (): Promise<void> => {
    if (!activePart?.content || !canBackup || !selectedToolId) return
    const response = await window.electronAPI.toolRegistry.createArtifactBackup(
      selectedToolId,
      activePart.definition.artifactId,
      activePart.content.path
    )
    if (!response.success || !response.data) {
      message.error(response.error || panelText.backupError)
      return
    }
    message.success(formatPanelText(panelText.backupCreated, { id: response.data.backupId }))
  }

  /** 按需加载当前页签 artifact 可恢复的备份 */
  const openBackupHistory = async (): Promise<void> => {
    if (!activePart?.content || !canRestore || !selectedToolId) return
    setLoadingBackups(true)
    setBackupHistoryOpen(true)
    try {
      const response = await window.electronAPI.toolRegistry.listArtifactBackups(
        selectedToolId,
        activePart.definition.artifactId,
        activePart.content.path
      )
      if (!response.success) throw new Error(response.error || panelText.listBackupsError)
      setBackups(response.data ?? [])
    } catch (error) {
      setBackups([])
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingBackups(false)
    }
  }

  /** 二次确认后恢复备份并刷新对应分组成员的编辑器快照 */
  const restoreBackup = (backup: ConfigArtifactBackup): void => {
    modal.confirm({
      title: panelText.restoreTitle,
      content: formatPanelText(panelText.restoreContent, {
        time: new Date(backup.createdAt).toLocaleString(language)
      }),
      okText: panelText.restore,
      cancelText: t('common.cancel'),
      onOk: async () => {
        const response = await window.electronAPI.toolRegistry.restoreArtifactBackup(backup.backupId)
        if (!response.success || !response.data) {
          const error = new Error(response.error || panelText.restoreError)
          message.error(error.message)
          throw error
        }
        applySavedContent(response.data.artifactId, response.data)
        setBackupHistoryOpen(false)
        message.success(panelText.restored)
      }
    })
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
                        className="ccb-list-item-structured"
                        actions={[
                          <Button key="open" type="link" onClick={() => void openArtifact(artifact)}>
                            {panelText.open}
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={<HddOutlined />}
                          title={definition?.displayName[language] ?? artifact.artifactId}
                          description={(
                            <div className="artifact-meta-description">
                              <Text className="artifact-path" copyable title={artifact.path}>
                                {artifact.path}
                              </Text>
                              <div className="artifact-capabilities" aria-label="Capabilities">
                                <Tag>{artifact.format}</Tag>
                                {definition?.editGroup && <Tag color="geekblue">{panelText.linkedEditTag}</Tag>}
                                {definition?.capabilities.map((capability) => <Tag key={capability}>{capability}</Tag>)}
                              </div>
                            </div>
                          )}
                        />
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
        title={compositeMode
          ? `${selectedTool?.displayName[language] ?? ''} · ${panelText.configSetTitle}`
          : activePart?.definition.displayName[language] ?? activePart?.definition.artifactId}
        open={editorParts.length > 0}
        width="min(1100px, 92vw)"
        footer={null}
        destroyOnHidden
        onCancel={() => setEditorParts([])}
      >
        {activePart && (
          <>
            {compositeMode && (
              <Tabs
                activeKey={activeTabId}
                onChange={setActiveTabId}
                items={editorParts.map((part) => ({
                  key: part.definition.artifactId,
                  label: (
                    <span>
                      {part.definition.displayName[language]}
                      {drafts[part.definition.artifactId] !== baselines[part.definition.artifactId] && ' •'}
                    </span>
                  )
                }))}
              />
            )}
            {!activePart.content && (
              <Alert
                showIcon
                type="warning"
                message={formatPanelText(panelText.missingFileHint, { path: activePart.candidatePath })}
                style={{ marginBottom: 12 }}
              />
            )}
            <Space wrap className="artifact-actions">
              <Tag>{activePart.definition.format}</Tag>
              {!canEdit && <Tag color="gold">{panelText.readOnly}</Tag>}
              {canValidate && <Button onClick={() => void validateDraft()}>{panelText.validate}</Button>}
              {canBackup && activePart.content && <Button onClick={() => void createBackup()}>{panelText.backup}</Button>}
              {canRestore && activePart.content && <Button onClick={() => void openBackupHistory()}>{panelText.backupHistory}</Button>}
              {canEdit && dirtyParts.length > 0 && (
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={saveDraft}>
                  {t('common.save')}
                </Button>
              )}
            </Space>
            <Suspense fallback={<Spin />}>
              <CodeEditor
                value={drafts[activePart.definition.artifactId] ?? ''}
                onChange={(value: string) => setDrafts((current) => ({
                  ...current,
                  [activePart.definition.artifactId]: value
                }))}
                language={mapEditorLanguage(activePart.definition.format)}
                readOnly={!canEdit}
                showPreview={activePart.definition.format === 'MARKDOWN'}
                height="55vh"
              />
            </Suspense>
          </>
        )}
      </Modal>

      <Modal
        title={panelText.backupHistory}
        open={backupHistoryOpen}
        footer={null}
        width={720}
        destroyOnHidden
        onCancel={() => setBackupHistoryOpen(false)}
      >
        <Spin spinning={loadingBackups}>
          <List
            dataSource={backups}
            locale={{ emptyText: <Empty description={panelText.emptyBackups} /> }}
            renderItem={(backup) => (
              <List.Item
                className="ccb-list-item-structured"
                actions={[
                  <Button key="restore" type="link" onClick={() => restoreBackup(backup)}>
                    {panelText.restore}
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={new Date(backup.createdAt).toLocaleString(language)}
                  description={(
                    <div className="backup-meta-description">
                      <Text className="artifact-path" title={backup.originalPath}>{backup.originalPath}</Text>
                      <Tag>{Math.max(1, Math.ceil(backup.size / 1024))} KB</Tag>
                    </div>
                  )}
                />
              </List.Item>
            )}
          />
        </Spin>
      </Modal>
    </div>
  )
}

export default AIToolManagementPanel
