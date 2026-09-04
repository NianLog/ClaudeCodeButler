/**
 * @file Artifact-specific template settings
 * @description 管理 registry template、embedded baseline 与本地 user override，并提供逐行 diff preview。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Modal, Popconfirm, Select, Space, Spin, Tag, Typography } from 'antd'
import { DeleteOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons'
import type { ArtifactFormat, ArtifactTemplateEntry } from '@shared/tool-registry'
import { createTemplateLineDiff } from '@shared/config-template'
import { useMessage } from '../../hooks/useMessage'
import { useTranslation } from '../../locales/useTranslation'
import { useSettingsStore } from '../../store/settings-store'
import CodeEditor from '../Common/CodeEditor'
import './ArtifactTemplateSettings.css'

const { Text } = Typography

const COPY = {
  'zh-CN': {
    title: '按配置资产管理模板',
    help: '用户覆盖 > 已安装规则库 > 应用内置模板。规则库更新或回滚不会覆盖你的本地模板。',
    select: '选择配置资产',
    source: '当前来源',
    save: '保存用户覆盖',
    remove: '移除用户覆盖',
    preview: '差异预览',
    saved: '模板覆盖已保存',
    removed: '已恢复使用规则库或内置模板',
    loadFailed: '加载模板目录失败',
    saveFailed: '保存模板失败',
    removeFailed: '移除模板覆盖失败',
    noTemplates: '当前规则库没有可管理的模板',
    diffTitle: '模板差异预览',
    diffBase: '比较基线：规则库优先，否则使用应用内置模板',
    unchanged: '未修改',
    added: '新增',
    removedLine: '删除'
  },
  'en-US': {
    title: 'Artifact-specific templates',
    help: 'User override > installed registry > embedded template. Registry updates and rollbacks never overwrite local templates.',
    select: 'Select artifact',
    source: 'Effective source',
    save: 'Save user override',
    remove: 'Remove user override',
    preview: 'Preview diff',
    saved: 'Template override saved',
    removed: 'Restored registry or embedded template',
    loadFailed: 'Failed to load template catalog',
    saveFailed: 'Failed to save template',
    removeFailed: 'Failed to remove template override',
    noTemplates: 'The current registry has no manageable templates',
    diffTitle: 'Template diff preview',
    diffBase: 'Baseline: registry template, falling back to the embedded template',
    unchanged: 'Unchanged',
    added: 'Added',
    removedLine: 'Removed'
  }
} as const

/** 将 artifact format 映射为 CodeEditor language。 */
function getEditorLanguage(format: ArtifactFormat): 'json' | 'markdown' | 'plaintext' {
  if (format === 'JSON' || format === 'JSONC') return 'json'
  if (format === 'MARKDOWN') return 'markdown'
  return 'plaintext'
}

/** Artifact template ownership 设置组件。 */
const ArtifactTemplateSettings: React.FC = () => {
  const { language } = useTranslation()
  const copy = COPY[language]
  const message = useMessage()
  const reloadSettings = useSettingsStore((state) => state.loadSettings)
  const [entries, setEntries] = useState<ArtifactTemplateEntry[]>([])
  const [selectedKey, setSelectedKey] = useState<string>()
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [diffVisible, setDiffVisible] = useState(false)

  const selected = useMemo(
    () => entries.find((entry) => entry.key === selectedKey),
    [entries, selectedKey]
  )

  /** 加载 main-process 解析后的 template catalog。 */
  const loadEntries = useCallback(async (preferredKey?: string) => {
    setLoading(true)
    try {
      const response = await window.electronAPI.toolRegistry.listArtifactTemplates()
      if (!response.success || !response.data) throw new Error(response.error || copy.loadFailed)
      setEntries(response.data)
      const nextKey = response.data.some((entry) => entry.key === preferredKey)
        ? preferredKey
        : response.data[0]?.key
      setSelectedKey(nextKey)
      const nextEntry = response.data.find((entry) => entry.key === nextKey)
      setDraft(nextEntry?.userOverride ?? nextEntry?.effectiveTemplate ?? '')
    } catch (error) {
      message.error(`${copy.loadFailed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [copy.loadFailed, message])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  /** 切换 artifact 并加载其 user/effective template。 */
  const handleSelect = (key: string) => {
    const entry = entries.find((candidate) => candidate.key === key)
    setSelectedKey(key)
    setDraft(entry?.userOverride ?? entry?.effectiveTemplate ?? '')
  }

  /** 保存当前 artifact 的独立 user override。 */
  const handleSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const response = await window.electronAPI.toolRegistry.saveArtifactTemplateOverride(
        selected.toolId,
        selected.artifactId,
        draft
      )
      if (!response.success) throw new Error(response.error || copy.saveFailed)
      await reloadSettings()
      message.success(copy.saved)
      await loadEntries(selected.key)
    } catch (error) {
      message.error(`${copy.saveFailed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  /** 删除当前 artifact 的 user override，并恢复 registry/embedded ownership。 */
  const handleRemove = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const response = await window.electronAPI.toolRegistry.removeArtifactTemplateOverride(
        selected.toolId,
        selected.artifactId
      )
      if (!response.success) throw new Error(response.error || copy.removeFailed)
      await reloadSettings()
      message.success(copy.removed)
      await loadEntries(selected.key)
    } catch (error) {
      message.error(`${copy.removeFailed}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setSaving(false)
    }
  }

  const baseline = selected?.registryTemplate ?? selected?.embeddedTemplate ?? ''
  const diffResult = useMemo(() => {
    if (!diffVisible) return { lines: [], error: undefined }
    try {
      return { lines: createTemplateLineDiff(baseline, draft), error: undefined }
    } catch (error) {
      return { lines: [], error: error instanceof Error ? error.message : String(error) }
    }
  }, [baseline, diffVisible, draft])

  if (loading) {
    return <div className="artifact-template-loading"><Spin /></div>
  }

  if (entries.length === 0) {
    return <Empty description={copy.noTemplates} />
  }

  return (
    <Card title={copy.title} className="artifact-template-settings">
      <Alert type="info" showIcon message={copy.help} />
      <div className="artifact-template-toolbar">
        <Select
          value={selectedKey}
          onChange={handleSelect}
          aria-label={copy.select}
          options={entries.map((entry) => ({
            value: entry.key,
            label: `${entry.toolDisplayName[language]} / ${entry.artifactDisplayName[language]}`
          }))}
        />
        {selected && (
          <Space>
            <Text type="secondary">{copy.source}</Text>
            <Tag color={selected.source === 'USER_OVERRIDE' ? 'gold' : selected.source === 'REGISTRY' ? 'blue' : 'default'}>
              {selected.source}
            </Tag>
          </Space>
        )}
      </div>

      {selected && (
        <>
          <CodeEditor
            value={draft}
            onChange={setDraft}
            language={getEditorLanguage(selected.format)}
            height={360}
            showPreview={false}
          />
          <div className="artifact-template-actions">
            <Button icon={<EyeOutlined />} onClick={() => setDiffVisible(true)}>
              {copy.preview}
            </Button>
            <Popconfirm title={copy.remove} onConfirm={() => void handleRemove()} disabled={!selected.userOverride}>
              <Button danger icon={<DeleteOutlined />} disabled={!selected.userOverride} loading={saving}>
                {copy.remove}
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => void handleSave()} loading={saving}>
              {copy.save}
            </Button>
          </div>
        </>
      )}

      <Modal
        title={copy.diffTitle}
        open={diffVisible}
        onCancel={() => setDiffVisible(false)}
        footer={<Button onClick={() => setDiffVisible(false)}>OK</Button>}
        width={900}
        destroyOnHidden
      >
        <Text type="secondary">{copy.diffBase}</Text>
        {diffResult.error ? (
          <Alert type="warning" showIcon message={diffResult.error} className="artifact-template-diff-error" />
        ) : (
          <div className="artifact-template-diff" role="log" aria-label={copy.diffTitle}>
            {diffResult.lines.map((line, index) => (
              <div key={`${index}-${line.type}`} className={`artifact-template-diff-line is-${line.type.toLowerCase()}`}>
                <span className="artifact-template-diff-marker">
                  {line.type === 'ADDED' ? '+' : line.type === 'REMOVED' ? '-' : ' '}
                </span>
                <code>{line.content || ' '}</code>
              </div>
            ))}
          </div>
        )}
        <Space wrap>
          <Tag>{copy.unchanged}</Tag>
          <Tag color="green">{copy.added}</Tag>
          <Tag color="red">{copy.removedLine}</Tag>
        </Space>
      </Modal>
    </Card>
  )
}

export default ArtifactTemplateSettings
