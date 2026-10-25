import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Drawer, Empty, Input, Skeleton, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, HistoryOutlined, ImportOutlined, MoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import type { AgentResource, AgentResourceContent, AgentResourceKind, AgentResourceList } from '@shared/agent-resources'
import { useAgentContextStore } from '../../store/agent-context-store'
import { useTranslation } from '../../locales/useTranslation'
import ResourceImportDialog from './ResourceImportDialog'
import './AgentResources.css'

const CodeEditor = lazy(() => import('../Common/CodeEditor'))
const ClaudeMCP = lazy(() => import('../MCP/MCPManagementPanel'))
const ClaudeSkills = lazy(() => import('../SkillsManagement/SkillsManagementPanel'))
const ClaudeAgents = lazy(() => import('../AgentsManagement/AgentsManagementPanel'))

interface ResourceDraft {
  name: string; content: string; baseline: string; baselineName: string
  original?: AgentResourceContent; readOnly: boolean
}

export default function AgentResourcesPage({ kind }: { kind: AgentResourceKind }): React.JSX.Element {
  const { t } = useTranslation()
  const { message, modal } = App.useApp()
  const toolId = useAgentContextStore((s) => s.selectedToolId)
  const contextRevision = useAgentContextStore((s) => s.revision)
  const [list, setList] = useState<AgentResourceList>()
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState<ResourceDraft>()
  const [editorOpen, setEditorOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const generation = useRef(0)
  const dirty = !!draft && !draft.readOnly && (draft.content !== draft.baseline || draft.name !== draft.baselineName)
  const active = list?.resources.find((resource) => resource.resourceId === selected)
  const writable = list?.writable ?? false
  const viewable = !!active && active.status !== 'BLOCKED' && active.status !== 'INVALID'
  const activeWritable = writable && viewable && active?.writable !== false && active?.status !== 'READ_ONLY'
  const guardId = `resource:${toolId}:${kind}`

  const load = useCallback(async (): Promise<void> => {
    const version = ++generation.current
    setLoading(true); setError(''); setList(undefined)
    try {
      const result = await window.electronAPI.agentResources.listResources({ toolId, kind })
      if (version !== generation.current) return
      if (!result.success || !result.data) throw new Error(result.error || t('resources.loadFailed'))
      setList(result.data)
      setSelected((current) => result.data?.resources.some((r) => r.resourceId === current) ? current : result.data?.resources[0]?.resourceId)
    } catch (e) { if (version === generation.current) setError(String(e)) }
    finally { if (version === generation.current) setLoading(false) }
  }, [toolId, kind, t])

  useEffect(() => {
    void load()
    return () => { generation.current++ }
  }, [load, contextRevision])

  const save = async (): Promise<boolean> => {
    if (!draft || draft.readOnly || writing) return false
    setWriting(true); setError('')
    try {
      const result = await window.electronAPI.agentResources.saveResource({ toolId, kind, name: draft.name, content: draft.content,
        resourceId: draft.original?.resourceId, expectedRevision: draft.original?.revision })
      if (!result.success || !result.data) throw new Error(result.error || t('agentContext.saveFailed'))
      setDraft({ name: result.data.name, baselineName: result.data.name, content: result.data.content,
        baseline: result.data.content, original: result.data, readOnly: false })
      setEditorOpen(false)
      message.success(t('resources.saved'))
      await load()
      return true
    } catch (e) { setError(String(e)); return false } finally { setWriting(false) }
  }

  useEffect(() => {
    useAgentContextStore.getState().setGuard(guardId, {
      dirty, busy: writing, save,
      discard: () => { setDraft(undefined); setEditorOpen(false) }
    })
    return () => useAgentContextStore.getState().setGuard(guardId, null)
  })

  const openResource = async (resource: AgentResource, readOnly = false): Promise<void> => {
    const version = ++generation.current
    try {
      const result = await window.electronAPI.agentResources.readResource({ toolId, kind, resourceId: resource.resourceId })
      if (version !== generation.current) return
      if (!result.success || !result.data) throw new Error(result.error)
      setDraft({ name: result.data.name, content: result.data.content, baselineName: result.data.name,
        baseline: result.data.content, original: result.data, readOnly: readOnly || result.data.writable === false || !writable })
      setEditorOpen(true)
    } catch (e) { if (version === generation.current) setError(String(e)) }
  }
  const guarded = (action: () => void): void => { useAgentContextStore.getState().requestChange(action) }
  const create = (): void => {
    const content = kind === 'MCP' ? (toolId === 'codex-cli' ? 'command = ""\nargs = []\n' : '{\n  "command": "",\n  "args": []\n}\n')
      : toolId === 'codex-cli' && kind === 'SUBAGENT' ? 'name = "new-agent"\ndescription = "Describe the task"\ndeveloper_instructions = "Describe the role"\n'
        : `---\nname: new-resource\ndescription: Describe the task\n${toolId === 'gemini-cli' && kind === 'SUBAGENT' ? 'kind: local\n' : ''}---\n\n`
    setDraft({ name: '', baselineName: '', content, baseline: content, readOnly: false })
    setEditorOpen(true)
  }
  const remove = async (resource: AgentResource): Promise<void> => {
    await modal.confirm({ title: t('resources.deleteTitle'), content: <><p>{resource.name}</p><p>{t('resources.deleteHint')}</p></>,
      okText: t('resources.deleteAction'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
      onOk: async () => {
        setWriting(true)
        try {
          const result = await window.electronAPI.agentResources.deleteResource({ toolId, kind, resourceId: resource.resourceId, expectedRevision: resource.revision })
          if (!result.success) throw new Error(result.error)
          message.success(t('resources.deleted')); await load()
        } catch (e) { setError(String(e)); throw e } finally { setWriting(false) }
      }
    })
  }
  const filtered = list?.resources.filter((resource) => `${resource.name} ${resource.description}`.toLowerCase().includes(search.toLowerCase())) || []
  return <section className="agent-resource-page">
    <div className="resource-page-header">
      <div><h1>{t(`resources.${kind}`)}</h1><p>{t('resources.subtitle')}</p></div>
      <Space wrap>
        {draft && dirty && !editorOpen && <Button onClick={() => setEditorOpen(true)}>{t('resources.edit')} •</Button>}
        <Button icon={<PlusOutlined />} disabled={writing || !writable} onClick={() => guarded(create)}>{t('resources.create')}</Button>
        <Button type="primary" icon={<ImportOutlined />} disabled={writing || !writable} onClick={() => guarded(() => setImportOpen(true))}>{t('resources.import')}</Button>
      </Space>
    </div>
    <div className="resource-page-meta"><Typography.Text className="resource-path" ellipsis={{ tooltip: list?.location }} copyable={{ text: list?.location }}>{list?.location}</Typography.Text>
      <Tag>{t('agentContext.userScope')}</Tag>
      {list && !writable && <Tag>{t('resources.readOnly')}</Tag>}
      <Button aria-label={t('common.refresh')} type="text" icon={<ReloadOutlined />} loading={loading} onClick={() => guarded(() => void load())} />
    </div>
    {error && <Alert type="error" showIcon title={error} action={<Button onClick={() => void load()}>{t('common.retry')}</Button>} />}
    {list?.warnings.map((warning) => <Alert key={warning} type="warning" showIcon title={warning} />)}
    <div className="resource-search"><Input.Search aria-label={t('resources.search')} placeholder={t('resources.search')} value={search} onChange={(e) => setSearch(e.target.value)} allowClear />
      <span className="resource-muted">{filtered.length}</span></div>
    {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : list && <div className="resource-master-detail">
      <div className="resource-rows">
        {filtered.length ? filtered.map((resource) => <button key={resource.resourceId} type="button"
          className={`resource-row ${selected === resource.resourceId ? 'selected' : ''}`} onClick={() => setSelected(resource.resourceId)}>
          <span><strong>{resource.name}</strong><small>{resource.description}</small></span>
          <Tag>{resource.format}</Tag><span className="resource-muted">{t(resource.status && resource.status !== 'READY' ? `resources.${resource.status}` : 'resources.configured')}</span>
        </button>) : <Empty description={t('resources.empty')} />}
      </div>
      {active && <aside className="resource-inspector" aria-label={t('resources.details')}>
        <h2>{active.name}</h2><p>{active.description}</p>
        <dl><dt>{t('resources.location')}</dt><dd className="resource-path">{active.location}</dd>
          <dt>{t('resources.state')}</dt><dd>{t(active.status === 'BLOCKED' || active.status === 'INVALID' ? `resources.${active.status}` : 'resources.notVerified')}</dd></dl>
        {active.warnings.map((warning) => <Alert key={warning} type="warning" title={warning} />)}
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button block disabled={!viewable || writing} onClick={() => guarded(() => void openResource(active, true))}>{t('resources.details')}</Button>
          <Button block icon={<EditOutlined />} disabled={!activeWritable || writing} onClick={() => guarded(() => void openResource(active))}>{t('resources.edit')}</Button>
          <Button block danger icon={<DeleteOutlined />} disabled={writing || !activeWritable} onClick={() => guarded(() => remove(active))}>{t('resources.deleteAction')}</Button>
        </Space>
      </aside>}
    </div>}
    <div className="resource-page-footer"><p>{t('resources.statusHint')}</p>
      <Button type="text" icon={<HistoryOutlined />} disabled={writing} onClick={() => guarded(() => setRecoverOpen(true))}>{t('resources.recover')}</Button>
      {toolId === 'claude-code' && <Button type="text" icon={<MoreOutlined />} onClick={() => guarded(() => setAdvanced(true))}>{t('resources.claudeAdvanced')}</Button>}
    </div>
    <Drawer title={`${t(`resources.${kind}`)} · ${draft?.name || t('resources.create')}`} open={editorOpen} width="min(900px, 92vw)"
      maskClosable={false} keyboard={!writing} closable={!writing} onClose={() => setEditorOpen(false)}
      extra={!draft?.readOnly && <Button type="primary" loading={writing} disabled={!dirty || !draft?.name.trim()} onClick={() => void save()}>{t('common.save')}</Button>}>
      {error && <Alert type="error" showIcon title={error} />}
      {draft && <>
        <label className="resource-field-label" htmlFor="resource-name">{t('resources.name')}</label>
        <Input id="resource-name" value={draft.name} readOnly={draft.readOnly || !!draft.original} disabled={writing}
          onChange={(e) => {
            const name = e.target.value
            const content = !draft.original && kind !== 'MCP' && draft.content === draft.baseline
              ? draft.content.replace(/^name\s*[:=].*$/m, `name${toolId === 'codex-cli' && kind === 'SUBAGENT' ? ' = ' : ': '}${JSON.stringify(name)}`)
              : draft.content
            setDraft({ ...draft, name, content, baseline: draft.content === draft.baseline ? content : draft.baseline })
          }} />
        <p className="resource-muted">{t(draft.readOnly ? 'resources.readOnly' : 'resources.keepDraft')}</p>
        <Suspense fallback={<Skeleton active />}><CodeEditor value={draft.content}
          onChange={(content) => setDraft((current) => current ? { ...current, content } : current)}
          language={draft.original?.format === 'TOML' || toolId === 'codex-cli' && kind !== 'SKILL' ? 'plaintext' : kind === 'MCP' ? 'json' : 'markdown'}
          readOnly={writing || draft.readOnly} height="55vh" /></Suspense>
        {draft.original?.files && <details><summary>{t('resources.files')}</summary><ul>
          {draft.original.files.map((file) => <li key={file.name}>{file.name} · {file.bytes} B</li>)}</ul></details>}
      </>}
    </Drawer>
    <Drawer open={advanced} title={t('resources.claudeAdvancedHint')} width="min(1200px, 96vw)" maskClosable={false}
      onClose={() => guarded(() => { setAdvanced(false); void load() })} destroyOnHidden>
      <Suspense fallback={<Skeleton active />}>{kind === 'MCP' ? <ClaudeMCP /> : kind === 'SKILL' ? <ClaudeSkills /> : <ClaudeAgents />}</Suspense>
    </Drawer>
    {importOpen && <ResourceImportDialog toolId={toolId} kind={kind} onClose={() => setImportOpen(false)} onImported={() => void load()} />}
    {recoverOpen && <ResourceImportDialog toolId={toolId} kind={kind} recover onClose={() => setRecoverOpen(false)} onImported={() => void load()} />}
  </section>
}
