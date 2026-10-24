import { create } from 'zustand'
import { MANAGED_AGENT_IDS, type ManagedAgentId } from '@shared/agent-resources'

export const AGENT_LABELS = {
  'claude-code': 'Claude Code', 'codex-cli': 'Codex CLI', 'gemini-cli': 'Gemini CLI', antigravity: 'Antigravity'
}

export interface AgentDraftGuard {
  dirty: boolean
  busy: boolean
  save?: () => Promise<boolean>
  discard: () => void
}

interface AgentContextState {
  selectedToolId: ManagedAgentId
  revision: number
  guards: Map<string, AgentDraftGuard>
  pendingChange: (() => void) | null
  changing: boolean
  error: boolean
  setGuard: (id: string, guard: AgentDraftGuard | null) => void
  requestChange: (change: () => void) => boolean
  selectTool: (toolId: ManagedAgentId) => void
  refresh: () => void
  cancelChange: () => void
  continueChange: (save: boolean) => Promise<void>
}

export const useAgentContextStore = create<AgentContextState>((set, get) => ({
  selectedToolId: 'claude-code',
  revision: 0,
  guards: new Map(),
  pendingChange: null,
  changing: false,
  error: false,
  setGuard: (id, guard) => set((state) => {
    const guards = new Map(state.guards)
    if (guard) guards.set(id, guard)
    else guards.delete(id)
    return { guards, ...(!state.pendingChange && !state.changing && ![...guards.values()].some((item) => item.busy) ? { error: false } : {}) }
  }),
  requestChange: (change) => {
    if (get().changing || [...get().guards.values()].some((guard) => guard.busy)) {
      set({ error: true })
      return false
    }
    if ([...get().guards.values()].some((guard) => guard.dirty)) {
      set({ pendingChange: change, error: false })
      return false
    }
    set({ error: false })
    change()
    return true
  },
  selectTool: (toolId) => {
    if (!MANAGED_AGENT_IDS.includes(toolId) || toolId === get().selectedToolId) return
    get().requestChange(() => set((state) => ({ selectedToolId: toolId, revision: state.revision + 1 })))
  },
  refresh: () => { get().requestChange(() => set((state) => ({ revision: state.revision + 1 }))) },
  cancelChange: () => { if (!get().changing) set({ pendingChange: null, error: false }) },
  continueChange: async (save) => {
    const change = get().pendingChange
    if (!change || get().changing) return
    set({ changing: true, error: false })
    try {
      for (const guard of get().guards.values()) {
        if (!guard.dirty) continue
        if (save) {
          if (!guard.save || !await guard.save()) {
            set({ error: true })
            return
          }
        } else guard.discard()
      }
      set({ pendingChange: null, guards: new Map() })
      change()
    } catch {
      set({ error: true })
    } finally {
      set({ changing: false })
    }
  }
}))
