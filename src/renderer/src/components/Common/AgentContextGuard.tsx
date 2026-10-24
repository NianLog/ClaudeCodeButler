import { Alert, Button, Modal, Space } from 'antd'
import { useEffect } from 'react'
import { useAgentContextStore } from '../../store/agent-context-store'
import { useTranslation } from '../../locales/useTranslation'

declare global {
  interface Window { __CCB_HAS_PENDING_CHANGES__?: boolean }
}

export default function AgentContextGuard(): React.JSX.Element {
  const { t } = useTranslation()
  const pending = useAgentContextStore((s) => s.pendingChange)
  const changing = useAgentContextStore((s) => s.changing)
  const error = useAgentContextStore((s) => s.error)
  const guards = useAgentContextStore((s) => s.guards)
  const cancel = useAgentContextStore((s) => s.cancelChange)
  const proceed = useAgentContextStore((s) => s.continueChange)
  const canSave = [...guards.values()].filter((g) => g.dirty).every((g) => g.save)
  useEffect(() => {
    const updateExitState = (): void => {
      const state = useAgentContextStore.getState()
      window.__CCB_HAS_PENDING_CHANGES__ = state.changing || [...state.guards.values()].some((guard) => guard.dirty || guard.busy)
    }
    updateExitState()
    const unsubscribe = useAgentContextStore.subscribe(updateExitState)
    const requestExit = (): void => { useAgentContextStore.getState().requestChange(() => { void window.electronAPI.app.quit() }) }
    const protectDrafts = (event: BeforeUnloadEvent): void => {
      const state = useAgentContextStore.getState()
      if (![...state.guards.values()].some((guard) => guard.dirty || guard.busy)) return
      event.preventDefault()
      state.requestChange(() => window.close())
    }
    window.addEventListener('beforeunload', protectDrafts)
    window.addEventListener('ccb:request-exit', requestExit)
    return () => {
      unsubscribe()
      window.removeEventListener('beforeunload', protectDrafts)
      window.removeEventListener('ccb:request-exit', requestExit)
    }
  }, [])
  return <>
    {error && !pending && <Alert type="warning" showIcon title={t('agentContext.waitForWrite')} />}
    <Modal open={!!pending} title={t('agentContext.draftTitle')} maskClosable={false}
      closable={!changing} keyboard={!changing} onCancel={cancel} width={520}
      footer={<Space wrap>
        <Button onClick={cancel} disabled={changing}>{t('agentContext.stay')}</Button>
        <Button onClick={() => void proceed(false)} disabled={changing}>{t('agentContext.discardContinue')}</Button>
        <Button type="primary" loading={changing} disabled={!canSave} onClick={() => void proceed(true)}>
          {t('agentContext.saveContinue')}
        </Button>
      </Space>}>
      <p>{t('agentContext.draftDescription')}</p>
      {error && <Alert showIcon type="error" title={t('agentContext.saveFailed')} />}
    </Modal>
  </>
}
