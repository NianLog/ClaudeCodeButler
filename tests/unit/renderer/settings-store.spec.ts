import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '../../../src/renderer/src/store/settings-store'

beforeEach(() => {
  useSettingsStore.setState({ settings: structuredClone(useSettingsStore.getState().getDefaultSettings()), unsavedChanges: new Set(['basic']), lastSaved: null, lastError: null })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('settings persistence feedback', () => {
  it('imports through IPC and refreshes already initialized state', async () => {
    const settings = structuredClone(useSettingsStore.getState().getDefaultSettings())
    settings.basic.language = 'en-US'
    useSettingsStore.setState({ isInitialized: true })
    vi.stubGlobal('window', { electronAPI: { settings: {
      import: vi.fn().mockResolvedValue({ success: true }),
      loadSettings: vi.fn().mockResolvedValue({ success: true, data: settings })
    } } })
    await useSettingsStore.getState().importSettings('{}')
    expect(useSettingsStore.getState().settings.basic.language).toBe('en-US')
  })

  it('exports JSON text from the IPC result', async () => {
    vi.stubGlobal('window', { electronAPI: { settings: {
      export: vi.fn().mockResolvedValue({ success: true, data: '{"basic":{}}' })
    } } })
    expect(await useSettingsStore.getState().exportSettings()).toBe('{"basic":{}}')
  })

  it('reports import failure and preserves current state', async () => {
    const before = useSettingsStore.getState().settings
    vi.stubGlobal('window', { electronAPI: { settings: {
      import: vi.fn().mockResolvedValue({ success: false, error: 'invalid settings' })
    } } })
    await expect(useSettingsStore.getState().importSettings('{}')).rejects.toThrow('invalid settings')
    expect(useSettingsStore.getState().settings).toBe(before)
  })

  it('retains current settings and reports a failed load', async () => {
    const before = useSettingsStore.getState().settings
    vi.stubGlobal('window', { electronAPI: { settings: {
      loadSettings: vi.fn().mockResolvedValue({ success: false, error: 'invalid JSON' })
    } } })
    await expect(useSettingsStore.getState().loadSettings()).rejects.toThrow('invalid JSON')
    expect(useSettingsStore.getState().settings).toBe(before)
    expect(useSettingsStore.getState().lastError).toBe('invalid JSON')
  })

  it.each(['basic', undefined] as const)('retains unsaved changes after a failed IPC save: %s', async tab => {
    vi.stubGlobal('window', { electronAPI: { settings: {
      saveTab: vi.fn().mockResolvedValue({ success: false, error: 'disk full' }),
      saveAll: vi.fn().mockResolvedValue({ success: false, error: 'disk full' })
    } } })
    await expect(useSettingsStore.getState().saveSettings(tab)).rejects.toThrow('disk full')
    expect(useSettingsStore.getState().unsavedChanges.has('basic')).toBe(true)
    expect(useSettingsStore.getState().lastSaved).toBe(null)
    expect(useSettingsStore.getState().lastError).toBe('disk full')
  })

  it('retains edits made while a save is pending', async () => {
    let finish!: (value: { success: boolean }) => void
    vi.stubGlobal('window', { electronAPI: { settings: { saveTab: () => new Promise(resolve => { finish = resolve }) } } })
    const saved = useSettingsStore.getState().saveSettings('basic')
    useSettingsStore.getState().updateSetting('basic', 'language', 'en-US')
    finish({ success: true })
    await saved
    expect(useSettingsStore.getState().unsavedChanges.has('basic')).toBe(true)
    expect(useSettingsStore.getState().settings.basic.language).toBe('en-US')
  })

  it('retains unsaved changes if localStorage fallback fails', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('storage full') } })
    await expect(useSettingsStore.getState().saveSettings('basic')).rejects.toThrow('storage full')
    expect(useSettingsStore.getState().unsavedChanges.has('basic')).toBe(true)
  })
})
