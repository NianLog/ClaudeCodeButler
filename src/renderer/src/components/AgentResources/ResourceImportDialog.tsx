import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Collapse, Empty, Input, Modal, Select, Skeleton, Space, Steps, Tag } from 'antd'
import { FolderOpenOutlined, ImportOutlined, ReloadOutlined } from '@ant-design/icons'
import type { AgentResource, AgentResourceKind, ApplyResourceImportInput, ImportSource, ImportToolId, ManagedAgentId, ResourceImportPreview, ResourceImportReceipt } from '@shared/agent-resources'
import { useTranslation } from '../../locales/useTranslation'
import { useAgentContextStore } from '../../store/agent-context-store'

const IMPORT_TOOLS: Array<{ value: ImportToolId; label: string }> = [
  { value: 'claude-code', label: 'Claude Code' }, { value: 'codex-cli', label: 'Codex CLI' },
  { value: 'gemini-cli', label: 'Gemini CLI' }, { value: 'antigravity', label: 'Antigravity' },
  { value: 'cursor', label: 'Cursor' }, { value: 'qoder', label: 'Qoder' },
  { value: 'workbuddy', label: 'WorkBuddy' }, { value: 'trae', label: 'TRAE' },
  { value: 'pi', label: 'Pi' }, { value: 'opencode', label: 'OpenCode' }
]

export default function ResourceImportDialog({ toolId, kind, recover = false, onClose, onImported }: {
  toolId: ManagedAgentId; kind: AgentResourceKind; recover?: boolean; onClose: () => void; onImported: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [sources, setSources] = useState<ImportSource[]>([])
  const [sourceId, setSourceId] = useState<string>()
  const [manualTool, setManualTool] = useState<ImportToolId>('cursor')
  const [resources, setResources] = useState<AgentResource[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<ResourceImportPreview>()
  const [decisions, setDecisions] = useState<ApplyResourceImportInput['decisions']>([])
  const [receipt, setReceipt] = useState<ResourceImportReceipt>()
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState('')
  const [readRevision, setReadRevision] = useState(0)
  const generation = useRef(0)
  const autoCandidates = useRef<string[]>([])
  const activeSource = sources.find((s) => s.sourceId === sourceId)
  const usableSources = sources.filter((source) => source.kinds.includes(kind) && (!source.status || source.status === 'FOUND'))
  const toolSources = usableSources.filter((source) => recover || source.toolId === manualTool)
  const sourceOptions = activeSource && !toolSources.some((source) => source.sourceId === activeSource.sourceId) ? [...toolSources, activeSource] : toolSources
  const diagnostics = sources.filter((source) => source.status && source.status !== 'FOUND' && (recover || source.toolId === manualTool))
  const stage = receipt ? 2 : preview ? 1 : 0

  const selectSources = (nextSources: ImportSource[], preferred?: ImportToolId, onlyPreferred = false): void => {
    const candidates = nextSources.filter((source) => source.kinds.includes(kind) && (!source.status || source.status === 'FOUND') && (!onlyPreferred || source.toolId === preferred))
    candidates.sort((a, b) => Number(b.toolId === preferred) - Number(a.toolId === preferred) || Number(a.toolId === toolId) - Number(b.toolId === toolId))
    autoCandidates.current = candidates.map((source) => source.sourceId)
    const first = autoCandidates.current.shift()
    setSourceId(first)
    setReadRevision((version) => version + 1)
    const found = candidates.find((source) => source.sourceId === first)
    if (found) setManualTool(found.toolId)
    if (!first) { setResources([]); setSelected([]); setLoading(false) }
  }

  const scanDefaults = async (): Promise<void> => {
    setLoading(true); setError(''); setSelected([]); setResources([]); setSourceId(undefined)
    try {
      const result = recover ? await window.electronAPI.agentResources.discoverResourceBackups({ toolId, kind })
        : await window.electronAPI.agentResources.discoverImportSources({ kind })
      if (!result.success) throw new Error(result.error || t('resources.loadFailed'))
      const next = result.data || []
      setSources(next); selectSources(next, manualTool)
    } catch (error) { setError(String(error)); setLoading(false) }
  }

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setSourceId(undefined); setResources([]); setSelected([])
    const discovery = recover ? window.electronAPI.agentResources.discoverResourceBackups({ toolId, kind })
      : window.electronAPI.agentResources.discoverImportSources({ kind })
    void discovery.then((result) => {
      if (!active) return
      if (!result.success) setError(result.error || t('resources.loadFailed'))
      else { const next = result.data || []; setSources(next); selectSources(next, 'cursor') }
    }).catch((e: unknown) => { if (active) setError(String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; generation.current++ }
  }, [t, recover, toolId, kind])

  useEffect(() => {
    const version = ++generation.current
    setResources([]); setSelected([]); setError('')
    if (!sourceId) return
    setLoading(true)
    let advancing = false
    const advance = (): boolean => {
      const next = autoCandidates.current.shift()
      if (!next) return false
      advancing = true
      setSourceId(next)
      const source = sources.find((item) => item.sourceId === next)
      if (source) setManualTool(source.toolId)
      return true
    }
    void window.electronAPI.agentResources.listImportResources({ sourceId, kind }).then((result) => {
      if (version !== generation.current) return
      if (!result.success || !result.data) throw new Error(result.error || t('resources.loadFailed'))
      if (!result.data.resources.some((resource) => resource.status !== 'BLOCKED' && resource.status !== 'INVALID') && advance()) return
      autoCandidates.current = []
      setResources(result.data.resources)
    }).catch((e: unknown) => {
      if (version !== generation.current) return
      const detail = e instanceof Error ? e.message : String(e)
      setSources((current) => current.map((source) => source.sourceId === sourceId ? { ...source, status: 'INVALID', warnings: [...source.warnings, detail] } : source))
      if (!advance()) setError(detail)
    }).finally(() => { if (version === generation.current && !advancing) setLoading(false) })
  }, [sourceId, kind, t, readRevision])

  useEffect(() => {
    useAgentContextStore.getState().setGuard('resource-import', { dirty: false, busy: writing, discard: onClose })
    return () => useAgentContextStore.getState().setGuard('resource-import', null)
  }, [writing, onClose])

  const chooseProject = async (): Promise<void> => {
    setError(''); setLoading(true)
    try {
      const picked = await window.electronAPI.agentResources.chooseImportProject()
      if (!picked.success) throw new Error(picked.error)
      if (!picked.data) return
      const result = await window.electronAPI.agentResources.discoverImportSources({ ...picked.data, kind })
      if (!result.success) throw new Error(result.error)
      const projectSources = (result.data || []).filter((s) => s.scope === 'PROJECT')
      setSources((current) => [...current.filter((s) => s.scope !== 'PROJECT'), ...projectSources])
      selectSources(projectSources, manualTool)
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const chooseFile = async (): Promise<void> => {
    setError(''); setLoading(true)
    try {
      const result = await window.electronAPI.agentResources.chooseImportFile({ toolId: manualTool, kind })
      if (!result.success) throw new Error(result.error)
      if (result.data) {
        const source = result.data
        setSources((current) => [...current.filter((s) => s.sourceId !== source.sourceId), source])
        autoCandidates.current = []
        setSourceId(source.sourceId)
        setReadRevision((version) => version + 1)
      }
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const loadPreview = async (): Promise<void> => {
    if (!sourceId) return
    setLoading(true); setError('')
    try {
      const result = await window.electronAPI.agentResources.previewResourceImport({ sourceId, targetToolId: toolId, kind, resourceIds: selected })
      if (!result.success || !result.data) throw new Error(result.error)
      setPreview(result.data)
      setDecisions(result.data.items.map((item) => ({ resourceId: item.resourceId,
        action: item.status === 'READY' && !item.conflict ? 'IMPORT' : 'SKIP' })))
    } catch (e) { setError(String(e)) } finally { setLoading(false) }
  }
  const apply = async (): Promise<void> => {
    if (!preview || writing) return
    setWriting(true); setError('')
    try {
      const result = await window.electronAPI.agentResources.applyResourceImport({ previewId: preview.previewId, decisions })
      if (!result.success || !result.data) throw new Error(result.error)
      setReceipt(result.data); onImported()
    } catch (e) { setError(String(e)) } finally { setWriting(false) }
  }

  return <Modal open title={t(recover ? 'resources.recover' : 'resourceImport.title')} width={920} maskClosable={false}
    keyboard={!writing} closable={!writing} onCancel={onClose} footer={<Space>
      {preview && !receipt && <Button disabled={writing} onClick={() => { setPreview(undefined); setError('') }}>{t('resourceImport.back')}</Button>}
      <Button disabled={writing} onClick={onClose}>{t('common.close')}</Button>
      {stage === 0 && <Button type="primary" loading={loading} disabled={!selected.length} onClick={() => void loadPreview()}>{t('resourceImport.next')}</Button>}
      {stage === 1 && <Button type="primary" loading={writing} disabled={!decisions.some((d) => d.action !== 'SKIP')}
        onClick={() => void apply()}>{t('resourceImport.apply')}</Button>}
    </Space>}>
    <Steps size="small" current={stage} items={['source', 'preview', 'result'].map((step) => ({ title: t(`resourceImport.${step}`) }))} />
    <Alert type="info" showIcon title={t('resourceImport.safety')} className="resource-notice" />
    {error && <Alert type="error" showIcon title={error} className="resource-notice" />}
    {stage === 0 && <>
      {!recover && <Space wrap className="resource-import-pickers">
        <Button icon={<FolderOpenOutlined />} disabled={loading} onClick={() => void chooseProject()}>{t('resourceImport.chooseProject')}</Button>
        <Select aria-label={t('resourceImport.tool')} value={manualTool} options={IMPORT_TOOLS} onChange={(tool) => { setManualTool(tool); setError(''); selectSources(sources, tool, true) }} style={{ width: 145 }} />
        <Button icon={<ImportOutlined />} disabled={loading} onClick={() => void chooseFile()}>{t('resourceImport.chooseFile')}</Button>
      </Space>}
      <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => void scanDefaults()}>{t('common.refresh')}</Button>
      <label className="resource-field-label" htmlFor="resource-source">{t('resourceImport.source')}</label>
      <Select id="resource-source" value={sourceId} onChange={(id) => { autoCandidates.current = []; setSourceId(id) }} style={{ width: '100%' }}
        options={sourceOptions.map((source) => ({ value: source.sourceId, label: `${source.label} · ${source.scope} · ${source.location}`, disabled: !!source.status && source.status !== 'FOUND' }))} />
      {activeSource?.warnings.map((warning) => <Alert key={warning} type="warning" title={warning} />)}
      {diagnostics.length > 0 && <Collapse size="small" className="resource-scan-results" items={[{ key: 'scan', label: t('resourceImport.scanResults', { count: diagnostics.length }), children: diagnostics.map((source) => <div key={source.sourceId} className="resource-scan-row">
        <Tag color={source.status === 'BLOCKED' || source.status === 'INVALID' ? 'warning' : 'default'}>{t(`resourceImport.${source.status}`)}</Tag>
        <span className="resource-path">{source.location}</span>
        {source.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </div>) }]} />}
      <div className="resource-import-selection">
        {loading ? <Skeleton active /> : resources.length ? <Checkbox.Group value={selected} onChange={(ids) => setSelected(ids.map(String))}>
          {resources.map((resource) => <Checkbox key={resource.resourceId} value={resource.resourceId} disabled={resource.status === 'BLOCKED' || resource.status === 'INVALID'}>
            <strong>{resource.name}</strong><span className="resource-muted"> {resource.description}</span>
            {resource.status && resource.status !== 'READY' && <Tag>{t(`resources.${resource.status}`)}</Tag>}
            {resource.warnings.map((warning) => <span key={warning} className="resource-muted"> · {warning}</span>)}
          </Checkbox>)}
        </Checkbox.Group> : <Empty description={activeSource?.status === 'BLOCKED' || activeSource?.status === 'INVALID' ? t('resourceImport.sourceUnavailable') : sourceId ? t('resourceImport.sourceEmpty') : diagnostics.some((source) => source.status === 'BLOCKED' || source.status === 'INVALID') ? t('resourceImport.sourceUnavailable') : t(recover ? 'resources.noBackups' : 'resourceImport.noSource')} />}
      </div>
    </>}
    {preview && !receipt && <>
      <p className="resource-path">{t('resourceImport.target')}: {preview.targetLocation}</p>
      {preview.warnings.map((warning) => <Alert key={warning} type="warning" showIcon title={warning} />)}
      <Collapse items={preview.items.map((item) => {
        const decision = decisions.find((d) => d.resourceId === item.resourceId)
        return { key: item.resourceId, label: <Space><strong>{item.name}</strong>
          {item.status !== 'READY' && <Tag>{t(item.requiresRename ? 'resourceImport.needsRename' : item.status === 'BLOCKED' ? 'resourceImport.blocked' : 'resourceImport.identical')}</Tag>}
          {item.conflict && <Tag color="warning">{t('resourceImport.conflict')}</Tag>}</Space>,
        children: <>
          {item.errors.map((text) => <Alert key={text} type="error" title={text} />)}
          {item.warnings.map((text) => <Alert key={text} type="warning" title={text} />)}
          {(item.status === 'READY' || item.requiresRename) && <Space wrap className="resource-decision">
            <Select aria-label={item.name} value={decision?.action} style={{ minWidth: 180 }} options={[
              { value: 'SKIP', label: t('resourceImport.keep') },
              ...(!item.requiresRename ? [{ value: item.conflict ? 'REPLACE' : 'IMPORT', label: t(item.conflict ? 'resourceImport.replace' : 'resourceImport.new') }] : []),
              { value: 'RENAME', label: t('resourceImport.rename') }
            ]} onChange={(action) => setDecisions((current) => current.map((d) => d.resourceId === item.resourceId ? { ...d, action } : d))} />
            {decision?.action === 'RENAME' && <Input value={decision.name} placeholder={t('resourceImport.renamePlaceholder')}
              onChange={(e) => setDecisions((current) => current.map((d) => d.resourceId === item.resourceId ? { ...d, name: e.target.value } : d))} />}
          </Space>}
          <div className="resource-diff"><div><h4>{t('resourceImport.sourceContent')}</h4><pre>{item.sourceContent}</pre></div>
            <div><h4>{t('resourceImport.targetContent')}</h4><pre>{item.proposedContent}</pre></div></div>
          {item.targetContent !== undefined && <details><summary>{t('resourceImport.existingContent')}</summary><pre>{item.targetContent}</pre></details>}
          {item.files && <details><summary>{t('resources.files')} ({item.files.length})</summary><ul>{item.files.map((file) => <li key={file.name}>{file.name} · {file.bytes} B</li>)}</ul></details>}
        </> }
      })} />
    </>}
    {receipt && <><Alert type={receipt.results.some((r) => r.status === 'FAILED') ? 'warning' : 'success'}
      showIcon title={t('resourceImport.resultHint')} />
      <ul className="resource-receipts">{receipt.results.map((result, index) => <li key={`${result.name}-${index}`}>
        <strong>{result.name}</strong><Tag color={result.status === 'FAILED' ? 'error' : 'default'}>{t(`resourceImport.${result.status}`)}</Tag>
        {result.error && <span>{result.error}</span>}
      </li>)}</ul></>}
  </Modal>
}
