/**
 * @file src/renderer/src/components/Config/ToolConfigSetPanel.tsx
 * @description Registry 驱动的多工具"配置集"面板（claude-code 之外工具的配置管理通道）：
 *              对 configSet 分组 artifacts 做命名快照的列表 / 新建 / 激活 / 删除 / 内容编辑。
 *              激活与保存复用 main 侧既有授权/校验/备份/原子写链路，面板不接触任何真实路径。
 */

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography
} from 'antd'
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined
} from '@ant-design/icons'
import type {
  ArtifactFormat,
  ToolConfigSetSummary
} from '@shared/tool-registry'
import { useTranslation } from '../../locales/useTranslation'
import CloudTemplateLibraryModal from './CloudTemplateLibraryModal'

const CodeEditor = React.lazy(() => import('../Common/CodeEditor'))
const { Title, Text } = Typography

const PANEL_TEXT = {
  'zh-CN': {
    subtitle: '对当前生效配置做命名快照，一键整体切换；激活前会统一校验并自动备份。',
    create: '新建配置集', refresh: '刷新', empty: '还没有配置集，可从当前生效配置创建第一个快照',
    inUse: '使用中', files: '{count} 个文件', createdAt: '创建于 {time}',
    activate: '激活', edit: '编辑内容', delete: '删除',
    activateTitle: '确认激活配置集', activateContent: '将把配置集「{name}」覆盖写入该工具的生效配置文件（校验通过后逐文件原子替换，声明 BACKUP 的会先自动备份）。是否继续？',
    activateManaged: '托管模式已开启，不允许切换配置集。请先关闭托管模式再操作。',
    deleteTitle: '确认删除配置集', deleteContent: '将删除配置集「{name}」的快照数据（不影响当前生效配置）。是否继续？',
    createTitle: '新建配置集', createLabel: '配置集名称', createPlaceholder: '例如：工作配置',
    createHint: '将从当前生效配置（缺失文件使用默认模板）创建快照。',
    editTitle: '编辑配置集：{name}', save: '保存', saved: '配置集已保存', activated: '配置集已激活', deleted: '配置集已删除', created: '配置集已创建',
    loadError: '加载配置集列表失败', createError: '创建配置集失败', readError: '读取配置集内容失败',
    saveError: '保存配置集失败', activateError: '激活配置集失败', deleteError: '删除配置集失败',
    managedCheckError: '检查托管模式状态失败', noDirty: '没有未保存的修改',
    searchPlaceholder: '搜索配置集名称...', searchEmpty: '没有匹配的配置集'
  },
  'en-US': {
    subtitle: 'Snapshot the live configuration under a name and switch as a whole; activation validates everything and backs up automatically.',
    create: 'New set', refresh: 'Refresh', empty: 'No configuration sets yet; create the first snapshot from the live configuration',
    inUse: 'In use', files: '{count} files', createdAt: 'Created {time}',
    activate: 'Activate', edit: 'Edit contents', delete: 'Delete',
    activateTitle: 'Confirm activation', activateContent: 'This overwrites the tool\'s live configuration files with set "{name}" (validated first, then atomic per-file replacement; BACKUP-declared artifacts are backed up beforehand). Continue?',
    activateManaged: 'Managed mode is enabled; switching configuration sets is not allowed. Disable managed mode first.',
    deleteTitle: 'Confirm deletion', deleteContent: 'This deletes the snapshot data of set "{name}" (the live configuration is untouched). Continue?',
    createTitle: 'New configuration set', createLabel: 'Set name', createPlaceholder: 'e.g. Work profile',
    createHint: 'A snapshot is created from the live configuration (missing files fall back to default templates).',
    editTitle: 'Edit set: {name}', save: 'Save', saved: 'Configuration set saved', activated: 'Configuration set activated', deleted: 'Configuration set deleted', created: 'Configuration set created',
    loadError: 'Failed to load configuration sets', createError: 'Failed to create the configuration set', readError: 'Failed to read the configuration set',
    saveError: 'Failed to save the configuration set', activateError: 'Failed to activate the configuration set', deleteError: 'Failed to delete the configuration set',
    managedCheckError: 'Failed to check managed mode status', noDirty: 'No unsaved changes',
    searchPlaceholder: 'Search configuration sets...', searchEmpty: 'No matching configuration sets'
  }
} as const

/** registry format → Monaco language（与 AIToolManagementPanel 保持一致） */
function mapEditorLanguage(format: ArtifactFormat): 'json' | 'markdown' | 'plaintext' {
  if (format === 'JSON') return 'json'
  if (format === 'MARKDOWN') return 'markdown'
  return 'plaintext'
}

interface ToolConfigSetPanelProps {
  toolId: string
  toolLabel: string
}

/**
 * 多工具配置集面板。
 * @description 全部数据经 preload toolRegistry API 获取；保存/激活由 main 侧统一校验后落盘。
 */
const ToolConfigSetPanel: React.FC<ToolConfigSetPanelProps> = ({ toolId, toolLabel }) => {
  const { t, language } = useTranslation()
  const panelText = PANEL_TEXT[language]
  const formatPanelText = (value: string, variables: Record<string, string> = {}): string =>
    Object.entries(variables).reduce((result, [key, replacement]) => result.replace(`{${key}}`, replacement), value)
  const { message, modal } = App.useApp()

  const [sets, setSets] = useState<ToolConfigSetSummary[]>([])
  const [loading, setLoading] = useState(true)
  /** 正在编辑内容的配置集（编辑 Modal 打开时非空） */
  const [editingSet, setEditingSet] = useState<ToolConfigSetSummary | null>(null)
  /** 编辑器页签草稿（artifactId → content）与保存基线 */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [baselines, setBaselines] = useState<Record<string, string>>({})
  const [editTabs, setEditTabs] = useState<Array<{ artifactId: string; format: ArtifactFormat }>>([])
  const [activeTabId, setActiveTabId] = useState('')
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [managedModeEnabled, setManagedModeEnabled] = useState(false)
  /** 云模板库弹窗开关（清单拉取/过滤/导入由共享 CloudTemplateLibraryModal 负责） */
  const [cloudOpen, setCloudOpen] = useState(false)
  /** 配置集名称搜索（与 Claude 配置面板的搜索工具栏对齐） */
  const [searchText, setSearchText] = useState('')

  const loadSets = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await window.electronAPI.toolRegistry.listConfigSets(toolId)
      if (!response.success) throw new Error(response.error || panelText.loadError)
      setSets(response.data ?? [])
    } catch (error) {
      setSets([])
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [message, panelText.loadError, toolId])

  useEffect(() => {
    void loadSets()
    void window.electronAPI.managedMode.isEnabled().then((result) => {
      if (result.success) setManagedModeEnabled(result.enabled)
    }).catch(() => {
      message.warning(panelText.managedCheckError)
    })
  }, [loadSets, message, panelText.managedCheckError])

  // 托盘/其他入口切换本工具配置集后刷新列表
  useEffect(() => {
    const unsubscribe = window.electronAPI.tray?.onSwitchConfig?.((payload) => {
      if (payload?.toolId === toolId) void loadSets()
    })
    return () => {
      unsubscribe?.()
    }
  }, [loadSets, toolId])

  const refreshTrayMenu = (): void => {
    void window.electronAPI.tray?.updateMenu?.()
  }

  const dirty = useMemo(
    () => editTabs.some((tab) => drafts[tab.artifactId] !== baselines[tab.artifactId]),
    [baselines, drafts, editTabs]
  )

  /** 打开编辑 Modal：读取配置集内容为草稿 */
  const openEditor = async (set: ToolConfigSetSummary): Promise<void> => {
    try {
      const response = await window.electronAPI.toolRegistry.readConfigSet(toolId, set.setId)
      if (!response.success || !response.data) throw new Error(response.error || panelText.readError)
      setEditingSet(set)
      setEditTabs(response.data.files.map((file) => ({ artifactId: file.artifactId, format: file.format })))
      setDrafts(Object.fromEntries(response.data.files.map((file) => [file.artifactId, file.content])))
      setBaselines(Object.fromEntries(response.data.files.map((file) => [file.artifactId, file.content])))
      setActiveTabId(response.data.files[0]?.artifactId ?? '')
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    }
  }

  const closeEditor = (): void => {
    setEditingSet(null)
    setEditTabs([])
    setDrafts({})
    setBaselines({})
    setActiveTabId('')
  }

  /** 保存草稿到快照目录（main 侧统一校验全部文件后原子写入，不触碰生效配置） */
  const saveDrafts = async (): Promise<void> => {
    if (!editingSet || !dirty) return
    setSaving(true)
    try {
      const response = await window.electronAPI.toolRegistry.saveConfigSetContent(
        toolId,
        editingSet.setId,
        editTabs.map((tab) => ({ artifactId: tab.artifactId, content: drafts[tab.artifactId] ?? '' }))
      )
      if (!response.success) throw new Error(response.error || panelText.saveError)
      setBaselines({ ...drafts })
      message.success(panelText.saved)
      await loadSets()
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  /** 激活配置集（托管模式拦截与托盘一致；成功后同步托盘菜单） */
  const activateSet = (set: ToolConfigSetSummary): void => {
    if (managedModeEnabled) {
      message.warning(panelText.activateManaged)
      return
    }
    modal.confirm({
      title: panelText.activateTitle,
      content: formatPanelText(panelText.activateContent, { name: set.name }),
      okText: panelText.activate,
      cancelText: language === 'zh-CN' ? '取消' : 'Cancel',
      onOk: async () => {
        const response = await window.electronAPI.toolRegistry.activateConfigSet(toolId, set.setId)
        if (!response.success) {
          throw new Error(response.error || panelText.activateError)
        }
        message.success(panelText.activated)
        refreshTrayMenu()
        await loadSets()
      }
    })
  }

  const deleteSet = (set: ToolConfigSetSummary): void => {
    modal.confirm({
      title: panelText.deleteTitle,
      content: formatPanelText(panelText.deleteContent, { name: set.name }),
      okText: panelText.delete,
      okButtonProps: { danger: true },
      cancelText: language === 'zh-CN' ? '取消' : 'Cancel',
      onOk: async () => {
        const response = await window.electronAPI.toolRegistry.deleteConfigSet(toolId, set.setId)
        if (!response.success) {
          throw new Error(response.error || panelText.deleteError)
        }
        message.success(panelText.deleted)
        refreshTrayMenu()
        await loadSets()
      }
    })
  }

  const submitCreate = async (): Promise<void> => {
    const name = createName.trim()
    if (!name) return
    setCreating(true)
    try {
      const response = await window.electronAPI.toolRegistry.createConfigSet(toolId, name)
      if (!response.success || !response.data) throw new Error(response.error || panelText.createError)
      message.success(panelText.created)
      setCreateOpen(false)
      setCreateName('')
      refreshTrayMenu()
      await loadSets()
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error))
    } finally {
      setCreating(false)
    }
  }

  /** 按名称过滤配置集（搜索工具栏与 Claude 配置面板对齐） */
  const visibleSets = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    if (!keyword) return sets
    return sets.filter((set) => set.name.toLowerCase().includes(keyword))
  }, [searchText, sets])

  const formatDate = (iso: string): string => new Date(iso).toLocaleString()

  return (
    <div className="tool-config-set-panel">
      <div className="config-panel-header">
        <div className="header-left">
          <Title level={3} className="panel-title">{toolLabel}</Title>
          <Text type="secondary">{panelText.subtitle}</Text>
        </div>
        <div className="header-right">
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadSets()}>
              {panelText.refresh}
            </Button>
            <Button icon={<CloudDownloadOutlined />} onClick={() => setCloudOpen(true)}>
              {t('configPanel.actions.cloud')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              {panelText.create}
            </Button>
          </Space>
        </div>
      </div>

      {/* 搜索工具栏（与 Claude 配置面板布局对齐） */}
      <div className="config-panel-toolbar">
        <div className="toolbar-left">
          <Input
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={panelText.searchPlaceholder}
            prefix={<SearchOutlined />}
            style={{ flex: '0 1 300px', minWidth: 180 }}
          />
        </div>
      </div>

      <div className="config-panel-content">
        {loading ? (
          <div className="config-panel-loading">
            <Spin size="large" />
          </div>
        ) : sets.length === 0 ? (
          <div className="config-panel-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<div>{panelText.empty}</div>}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                {panelText.create}
              </Button>
            </Empty>
          </div>
        ) : visibleSets.length === 0 ? (
          <div className="config-panel-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<div>{panelText.searchEmpty}</div>} />
          </div>
        ) : (
          <div className="config-list list-view">
            <div className="list-container">
              {visibleSets.map((set) => (
                <div
                  key={set.setId}
                  className={[
                    'config-list-item',
                    set.isInUse ? 'active-config-highlight' : ''
                  ].filter(Boolean).join(' ')}
                >
                  <div className="list-item-icon">
                    {set.isInUse ? <CheckCircleOutlined /> : <EditOutlined />}
                  </div>
                  <div className="list-item-content">
                    <div className="list-item-header">
                      <Title level={5} className="list-item-name">{set.name}</Title>
                      <div className="list-item-actions">
                        <Button
                          size="small"
                          type={set.isInUse ? 'default' : 'primary'}
                          icon={<ThunderboltOutlined />}
                          disabled={set.isInUse}
                          onClick={() => activateSet(set)}
                        >
                          {panelText.activate}
                        </Button>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => void openEditor(set)}
                        >
                          {panelText.edit}
                        </Button>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => deleteSet(set)}
                        />
                      </div>
                    </div>
                    <div className="list-item-meta">
                      <div className="list-item-badges">
                        {set.isInUse && <Tag color="green">{panelText.inUse}</Tag>}
                        <Text type="secondary">
                          {formatPanelText(panelText.files, { count: String(set.files.length) })}
                        </Text>
                        <Text type="secondary">
                          {formatPanelText(panelText.createdAt, { time: formatDate(set.createdAt) })}
                        </Text>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 新建配置集 */}
      <Modal
        title={panelText.createTitle}
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setCreateName('')
        }}
        onOk={() => void submitCreate()}
        confirmLoading={creating}
        okText={panelText.create}
        cancelText={language === 'zh-CN' ? '取消' : 'Cancel'}
        centered
      >
        <Space direction="vertical" style={{ width: '100%', padding: '12px 0' }}>
          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onPressEnter={() => void submitCreate()}
            placeholder={panelText.createPlaceholder}
            maxLength={48}
            autoFocus
          />
          <Text type="secondary">{panelText.createHint}</Text>
        </Space>
      </Modal>

      {/* 编辑配置集内容 */}
      <Modal
        title={formatPanelText(panelText.editTitle, { name: editingSet?.name ?? '' })}
        open={editingSet !== null}
        onCancel={closeEditor}
        width={920}
        centered
        styles={{ body: { height: '560px', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
        footer={[
          <Button key="cancel" onClick={closeEditor}>
            {language === 'zh-CN' ? '关闭' : 'Close'}
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={saving}
            disabled={!dirty}
            onClick={() => void saveDrafts()}
          >
            {panelText.save}
          </Button>
        ]}
      >
        {editTabs.length > 0 && (
          <Tabs
            activeKey={activeTabId}
            onChange={setActiveTabId}
            style={{ flex: 1, minHeight: 0 }}
            items={editTabs.map((tab) => ({
              key: tab.artifactId,
              label: tab.artifactId,
              children: (
                <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, height: '480px', overflow: 'hidden' }}>
                  <Suspense fallback={<Spin size="large" style={{ marginTop: 120 }} />}>
                    <CodeEditor
                      value={drafts[tab.artifactId] ?? ''}
                      language={mapEditorLanguage(tab.format)}
                      height="100%"
                      options={{
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        fontSize: 13,
                        lineHeight: 1.6
                      }}
                      onChange={(value: string | undefined) => {
                        setDrafts((current) => ({ ...current, [tab.artifactId]: value ?? '' }))
                      }}
                    />
                  </Suspense>
                </div>
              )
            }))}
          />
        )}
      </Modal>

      {/* 云模板库（共享组件：按当前工具过滤显示/导入） */}
      <CloudTemplateLibraryModal
        open={cloudOpen}
        toolId={toolId}
        toolLabel={toolLabel}
        onClose={() => setCloudOpen(false)}
        onImported={(info) => {
          if (info.kind === 'CONFIG_SET') {
            refreshTrayMenu()
            void loadSets()
          }
        }}
      />
    </div>
  )
}

export default ToolConfigSetPanel
