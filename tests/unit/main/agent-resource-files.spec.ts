import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'path'

const filesystem = vi.hoisted(() => ({ lstat: vi.fn(), readlink: vi.fn(), realpath: vi.fn() }))
vi.mock('fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('fs/promises')>(), ...filesystem }))
import { assertNoLinks, resolveLocalReference } from '../../../src/main/services/agent-resource-files'

const base = path.join(path.parse(process.cwd()).root, 'ccb-reference-fixture')
const link = path.join(base, 'link')
const child = path.join(link, 'child', 'definition.md')

beforeEach(() => {
  vi.clearAllMocks()
  filesystem.lstat.mockImplementation(async file => ({ isSymbolicLink: () => file === link }))
  filesystem.readlink.mockResolvedValue(path.join(base, 'target'))
  filesystem.realpath.mockImplementation(async value => value)
})

describe('local reference path boundaries', () => {
  it('rejects an ancestor junction before inspecting any descendant file', async () => {
    await expect(assertNoLinks(child)).rejects.toThrow('链接')
    expect(filesystem.lstat).toHaveBeenCalledWith(link)
    expect(filesystem.lstat).not.toHaveBeenCalledWith(path.join(link, 'child'))
    expect(filesystem.lstat).not.toHaveBeenCalledWith(child)
  })

  it('rejects a UNC link target string before realpath or any target/descendant access', async () => {
    const unc = '\\\\never-access.invalid\\share\\definition'
    filesystem.readlink.mockResolvedValue(unc)
    await expect(resolveLocalReference(child)).rejects.toThrow('UNC')
    expect(filesystem.realpath).not.toHaveBeenCalled()
    expect(filesystem.lstat.mock.calls.some(([value]) => String(value).startsWith('\\\\'))).toBe(false)
    expect(filesystem.lstat).not.toHaveBeenCalledWith(child)
  })

  it('rejects a second link in the target chain before resolving or touching its children', async () => {
    const target = path.join(base, 'target')
    filesystem.lstat.mockImplementation(async file => ({ isSymbolicLink: () => file === link || file === target }))
    await expect(resolveLocalReference(child)).rejects.toThrow('链接')
    expect(filesystem.readlink).toHaveBeenCalledTimes(1)
    expect(filesystem.realpath).not.toHaveBeenCalled()
    expect(filesystem.lstat).not.toHaveBeenCalledWith(path.join(target, 'child'))
  })

  it('only canonicalizes a local target after verifying its full ancestor chain', async () => {
    const target = path.join(base, 'target', 'child', 'definition.md')
    expect(await resolveLocalReference(child)).toBe(target)
    const inspected = filesystem.lstat.mock.calls.map(([value]) => value)
    expect(inspected).toContain(path.join(base, 'target'))
    expect(filesystem.realpath).toHaveBeenCalledWith(target)
    expect(filesystem.lstat.mock.invocationCallOrder.find((_, index) => filesystem.lstat.mock.calls[index][0] === target)).toBeLessThan(filesystem.realpath.mock.invocationCallOrder[0])
  })
})
