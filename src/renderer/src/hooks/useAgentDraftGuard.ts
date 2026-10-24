import { useEffect } from 'react'
import { useAgentContextStore, type AgentDraftGuard } from '../store/agent-context-store'

export function useAgentDraftGuard(id: string, guard: AgentDraftGuard): void {
  useEffect(() => {
    useAgentContextStore.getState().setGuard(id, guard)
    return () => useAgentContextStore.getState().setGuard(id, null)
  })
}
