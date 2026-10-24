import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeJsonAtomic } from '../../../src/main/utils/atomic-json-writer'

let directory: string
let target: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-atomic-write-'))
  target = path.join(directory, 'state.json')
  await fs.writeFile(target, '{"original":true}')
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

describe('atomic JSON persistence', () => {
  it('serializes concurrent writes without corrupting JSON or leaving temporary files', async () => {
    await Promise.all(Array.from({ length: 24 }, (_, index) =>
      writeJsonAtomic(target, { index, value: String(index).repeat(1000 + index) })))
    expect(JSON.parse(await fs.readFile(target, 'utf8')).index).toBe(23)
    expect(await fs.readdir(directory)).toEqual(['state.json'])
  })

  it('preserves the original on rename failure and permits the next write', async () => {
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(Object.assign(new Error('disk failure'), { code: 'ENOSPC' }))
    await expect(writeJsonAtomic(target, { changed: true })).rejects.toThrow('disk failure')
    expect(await fs.readFile(target, 'utf8')).toBe('{"original":true}')
    expect(await fs.readdir(directory)).toEqual(['state.json'])
    await writeJsonAtomic(target, { recovered: true })
    expect(JSON.parse(await fs.readFile(target, 'utf8'))).toEqual({ recovered: true })
  })

  it('takes a snapshot before a caller mutates its object', async () => {
    const value = { index: 1 }
    const saved = writeJsonAtomic(target, value)
    value.index = 2
    await saved
    expect(JSON.parse(await fs.readFile(target, 'utf8'))).toEqual({ index: 1 })
  })
})
