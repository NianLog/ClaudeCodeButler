import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.directory } }))
vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }))

let service: import('../../../src/main/services/mcp-archive.service').MCPArchiveService
let file: string
const native = '{"command":"node","args":["server.js"],"unknown":9007199254740993123}'
const original = `{"global":{"old":{"config":${native},"archivedAt":1}},"projects":{},"unknown":9007199254740993999}`

beforeEach(async () => {
  state.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-mcp-archive-'))
  const { MCPArchiveService } = await import('../../../src/main/services/mcp-archive.service')
  service = new MCPArchiveService()
  file = service.getArchivePath()
})

afterEach(async () => { vi.restoreAllMocks(); await fs.rm(state.directory, { recursive: true, force: true }) })

describe('MCP archive persistence', () => {
  it('peeks legacy archives without removing the only copy and recovers original config bytes', async () => {
    await fs.writeFile(file, original)
    const entry = await service.peekServer('old', 'global')
    expect(entry?.rawConfig).toBe(native)
    expect(entry?.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(await service.restoreGlobalServer('old')).toMatchObject({ command: 'node' })
    expect(await fs.readFile(file, 'utf8')).toBe(original)
  })

  it('archives full raw definitions and preserves unrelated integers through subsequent mutations', async () => {
    await fs.writeFile(file, original)
    expect(await service.archiveGlobalServer('new', JSON.parse(native), native)).toEqual({ success: true })
    const next = await fs.readFile(file, 'utf8')
    expect(next).toContain('9007199254740993123')
    expect(next).toContain('9007199254740993999')
    expect((await service.peekServer('new', 'global'))?.rawConfig).toBe(native)
    expect(await fs.readFile(`${file}.backup`, 'utf8')).toBe(original)
    const old = await service.peekServer('old', 'global')
    expect(await service.confirmRestore('old', 'global', old!.revision!)).toEqual({ success: true })
    expect(await service.isArchived('old', 'global')).toBe(false)
    expect((await service.peekServer('new', 'global'))?.rawConfig).toBe(native)
    expect(await fs.readFile(`${file}.backup`, 'utf8')).toBe(next)
  })

  it('keeps both the original archive and backup when atomic replacement fails during restore confirmation', async () => {
    await fs.writeFile(file, original)
    const entry = await service.peekServer('old', 'global')
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === file) throw new Error('ENOSPC fixture')
      await rename(from, to)
    })
    const result = await service.confirmRestore('old', 'global', entry!.revision!)
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('ENOSPC') })
    expect(await fs.readFile(file, 'utf8')).toBe(original)
    expect(await fs.readFile(`${file}.backup`, 'utf8')).toBe(original)
  })

  it('refuses confirmation if the archived entry changed after peek', async () => {
    await fs.writeFile(file, original)
    const entry = await service.peekServer('old', 'global')
    const changed = original.replace('server.js', 'changed.js')
    await fs.writeFile(file, changed)
    expect(await service.confirmRestore('old', 'global', entry!.revision!)).toMatchObject({ success: false, error: expect.stringContaining('发生变化') })
    expect(await fs.readFile(file, 'utf8')).toBe(changed)
  })

  it('does not overwrite external edits made while the backup is being committed', async () => {
    await fs.writeFile(file, original)
    const changed = original.replace('server.js', 'external.js')
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      await rename(from, to)
      if (String(to) === `${file}.backup`) await fs.writeFile(file, changed)
    })
    expect(await service.archiveGlobalServer('new', { command: 'node' })).toMatchObject({ success: false, error: expect.stringContaining('发生变化') })
    expect(await fs.readFile(file, 'utf8')).toBe(changed)
    expect(await fs.readFile(`${file}.backup`, 'utf8')).toBe(original)
  })

  it('serializes independent archive writes without losing either server', async () => {
    const results = await Promise.all([
      service.archiveGlobalServer('one', { command: 'one' }),
      service.archiveGlobalServer('two', { command: 'two' })
    ])
    expect(results.every(result => result.success)).toBe(true)
    expect(Object.keys(await service.getArchivedGlobalServers())).toEqual(['one', 'two'])
  })

  it('rejects unsafe dynamic keys before writing or modifying Object.prototype', async () => {
    expect(await service.archiveProjectServer('safe', '__proto__', { command: 'node' })).toMatchObject({ success: false })
    expect(await service.archiveGlobalServer('__proto__', { command: 'node' })).toMatchObject({ success: false })
    await expect(service.peekServer('constructor', 'global')).rejects.toThrow('原型')
    expect(Object.hasOwn(Object.prototype, 'safe')).toBe(false)
    expect(await fs.readdir(state.directory)).toEqual([])
  })

  it.each(['null', '[]', '{"global":[]}', '{"global":{"broken":{"config":[],"archivedAt":1}}}'])('propagates damaged archives without replacing them: %s', async raw => {
    await fs.writeFile(file, raw)
    await expect(service.getArchivedGlobalServers()).rejects.toThrow()
    expect(await service.archiveGlobalServer('new', { command: 'node' })).toMatchObject({ success: false })
    expect(await fs.readFile(file, 'utf8')).toBe(raw)
  })

  it('does not overwrite an existing different safe copy and only removes a completed project entry', async () => {
    expect(await service.archiveProjectServer('one', '/project', { command: 'first' })).toEqual({ success: true })
    const originalEntry = await service.peekServer('one', '/project')
    expect(await service.archiveProjectServer('one', '/project', { command: 'other' })).toMatchObject({ success: false })
    expect((await service.peekServer('one', '/project'))?.config.command).toBe('first')
    expect(await service.confirmRestore('one', '/project', originalEntry!.revision!)).toEqual({ success: true })
    expect((await service.readArchive()).projects).toEqual({})
  })
})
