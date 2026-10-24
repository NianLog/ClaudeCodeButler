import { createRequire } from 'module'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { writeChecksums } = createRequire(import.meta.url)('../../../scripts/release-metadata.cjs') as {
  writeChecksums(directory: string, names: string[]): Promise<void>
}

describe('release checksums', () => {
  let directory: string
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-release-')) })
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }) })

  it('使用文件真实内容的 SHA-256，并保留文件名', async () => {
    await fs.writeFile(path.join(directory, 'artifact.exe'), 'abc')
    await writeChecksums(directory, ['artifact.exe'])
    expect(await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  artifact.exe\n')
  })

  it('缺少任一资产时失败，不产生不完整的校验清单', async () => {
    await fs.writeFile(path.join(directory, 'artifact.exe'), 'abc')
    await expect(writeChecksums(directory, ['artifact.exe', 'missing.zip'])).rejects.toThrow()
    await expect(fs.access(path.join(directory, 'SHA256SUMS.txt'))).rejects.toThrow()
  })
})
