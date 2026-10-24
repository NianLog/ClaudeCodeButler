import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { ConfigService } from '../../../src/main/services/config-service'

let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (directory) await fs.rm(directory, { recursive: true, force: true })
})

describe('legacy config safety', () => {
  it('does not overwrite a system config if its backup fails', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-config-safety-'))
    const target = path.join(directory, 'settings.json')
    await fs.writeFile(target, '{"original":true}')
    const service = new ConfigService()
    vi.spyOn(service as unknown as { claudeDir: string }, 'claudeDir', 'get').mockReturnValue(directory)
    vi.spyOn(service, 'createBackup').mockRejectedValue(new Error('backup denied'))
    await expect(service.saveConfig(target, { changed: true })).rejects.toThrow('backup denied')
    expect(await fs.readFile(target, 'utf8')).toBe('{"original":true}')
  })
})
