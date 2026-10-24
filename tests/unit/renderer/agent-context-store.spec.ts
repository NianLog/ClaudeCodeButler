import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentContextStore } from '../../../src/renderer/src/store/agent-context-store'
import { agentResourceMessages } from '../../../src/renderer/src/locales/agent-resources'

beforeEach(() => {
  useAgentContextStore.setState({ selectedToolId: 'claude-code', revision: 0, guards: new Map(), pendingChange: null, changing: false, error: false })
})

describe('global agent context', () => {
  it('keeps the latest target and refreshes without applying configurations', () => {
    const state = useAgentContextStore.getState()
    state.selectTool('codex-cli'); state.selectTool('gemini-cli'); state.selectTool('antigravity')
    expect(useAgentContextStore.getState()).toMatchObject({ selectedToolId: 'antigravity', revision: 3 })
    state.refresh()
    expect(useAgentContextStore.getState().revision).toBe(4)
  })
  it('cancelling a switch keeps both target and draft', () => {
    const discard = vi.fn()
    const state = useAgentContextStore.getState()
    state.setGuard('editor', { dirty: true, busy: false, discard })
    state.selectTool('codex-cli'); state.cancelChange()
    expect(useAgentContextStore.getState().selectedToolId).toBe('claude-code')
    expect(useAgentContextStore.getState().guards.get('editor')?.dirty).toBe(true)
    expect(discard).not.toHaveBeenCalled()
  })
  it.each([false, 'throw'])('a failed save (%s) preserves the target and keeps the decision open', async (outcome) => {
    const state = useAgentContextStore.getState()
    state.setGuard('editor', { dirty: true, busy: false, discard: vi.fn(), save: async () => { if (outcome === 'throw') throw Error('disk full'); return false } })
    state.selectTool('codex-cli'); await state.continueChange(true)
    expect(useAgentContextStore.getState()).toMatchObject({ selectedToolId: 'claude-code', error: true, changing: false })
    expect(useAgentContextStore.getState().pendingChange).toBeTypeOf('function')
    expect(useAgentContextStore.getState().guards.get('editor')?.dirty).toBe(true)
  })
  it('commits a switch only after every dirty editor saves successfully', async () => {
    const state = useAgentContextStore.getState(), save = vi.fn(async () => true)
    state.setGuard('first', { dirty: true, busy: false, discard: vi.fn(), save })
    state.setGuard('second', { dirty: true, busy: false, discard: vi.fn(), save })
    state.selectTool('codex-cli'); await state.continueChange(true)
    expect(save).toHaveBeenCalledTimes(2)
    expect(useAgentContextStore.getState()).toMatchObject({ selectedToolId: 'codex-cli', pendingChange: null, changing: false })
  })
  it('blocks switching and navigation while a write is pending', () => {
    const state = useAgentContextStore.getState(), navigate = vi.fn()
    state.setGuard('import', { dirty: false, busy: true, discard: vi.fn() })
    state.selectTool('codex-cli'); expect(state.requestChange(navigate)).toBe(false)
    expect(useAgentContextStore.getState().selectedToolId).toBe('claude-code')
    expect(navigate).not.toHaveBeenCalled()
    expect(useAgentContextStore.getState().error).toBe(true)
    state.setGuard('import', { dirty: false, busy: false, discard: vi.fn() })
    expect(useAgentContextStore.getState().error).toBe(false)
  })
  it('discarding closes editors before changing context', async () => {
    const state = useAgentContextStore.getState(), discard = vi.fn()
    state.setGuard('editor', { dirty: true, busy: false, discard })
    state.selectTool('codex-cli'); await state.continueChange(false)
    expect(discard).toHaveBeenCalledOnce()
    expect(useAgentContextStore.getState().selectedToolId).toBe('codex-cli')
  })
  it('ships the same new UI messages in both languages', () => {
    expect(Object.keys(agentResourceMessages['zh-CN']).sort()).toEqual(Object.keys(agentResourceMessages['en-US']).sort())
  })
})
