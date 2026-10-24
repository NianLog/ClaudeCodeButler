import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
let directory: string
let service: typeof import('../../../src/main/services/skills-management-service')['skillsManagementService']
const markdown = '---\nname: fixture\ndescription: fixture description\n---\n\nnew content'
const files = (content = markdown) => ({ rootDirName: 'fixture', files: [{ relativePath: 'SKILL.md', contentBase64: Buffer.from(content).toString('base64') }] })
const target = () => path.join(directory, '.claude/skills/fixture')
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-skills-import-'))
  await fs.mkdir(target(), { recursive: true })
  await fs.writeFile(path.join(target(), 'SKILL.md'), 'original skill bytes')
  await fs.writeFile(path.join(target(), 'keep.bin'), Buffer.from([0, 255, 1]))
  vi.spyOn(os, 'homedir').mockReturnValue(directory)
  vi.resetModules()
  service = (await import('../../../src/main/services/skills-management-service')).skillsManagementService
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})
async function expectOriginal(): Promise<void> {
  expect(await fs.readFile(path.join(target(), 'SKILL.md'), 'utf8')).toBe('original skill bytes')
  expect(await fs.readFile(path.join(target(), 'keep.bin'))).toEqual(Buffer.from([0, 255, 1]))
}

describe('transactional Skill import', () => {
  it('keeps every original byte when replacement metadata is invalid', async () => {
    await expect(service.importSkillFiles(files('invalid'), { overwrite: true })).rejects.toThrow(/SKILL.md/)
    await expectOriginal()
  })
  it('validates all relative paths before overwriting', async () => {
    const payload = files()
    payload.files.push({ relativePath: '../escape', contentBase64: 'YQ==' })
    await expect(service.importSkillFiles(payload, { overwrite: true })).rejects.toThrow()
    await expectOriginal()
    await expect(fs.access(path.join(directory, '.claude/skills/escape'))).rejects.toThrow()
  })
  it('keeps the original when a staging file cannot be written', async () => {
    vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC'))
    await expect(service.importSkillFiles(files(), { overwrite: true })).rejects.toThrow('ENOSPC')
    await expectOriginal()
  })
  it('restores the original if installing the staged directory fails', async () => {
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (String(source).endsWith(`${path.sep}staged`) && destination === target()) throw new Error('install failed')
      return rename(source, destination)
    })
    await expect(service.importSkillFiles(files(), { overwrite: true })).rejects.toThrow('install failed')
    await expectOriginal()
  })
  it('replaces only the requested Skill and rejects an existing target by default', async () => {
    await expect(service.importSkillFiles(files())).rejects.toThrow(/已存在/)
    await expectOriginal()
    expect(await service.importSkillFiles(files(), { overwrite: true })).toBe('fixture')
    expect(await fs.readFile(path.join(target(), 'SKILL.md'), 'utf8')).toBe(markdown)
    await expect(fs.access(path.join(target(), 'keep.bin'))).rejects.toThrow()
  })
  it('uses the same staging protection for source-directory imports and preserves nested binary files', async () => {
    const source = path.join(directory, 'source')
    await fs.mkdir(path.join(source, 'assets'), { recursive: true })
    await fs.writeFile(path.join(source, 'SKILL.md'), markdown)
    const binary = Buffer.from([0, 128, 255, 10])
    await fs.writeFile(path.join(source, 'assets/data.bin'), binary)
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('copy failed'))
    await expect(service.importSkill(source, { overwrite: true })).rejects.toThrow('copy failed')
    await expectOriginal()
    vi.restoreAllMocks()
    vi.spyOn(os, 'homedir').mockReturnValue(directory)
    expect(await service.importSkill(source, { overwrite: true })).toBe('fixture')
    expect(await fs.readFile(path.join(target(), 'assets/data.bin'))).toEqual(binary)
  })
  it('preserves a recoverable backup and reports its path if rollback also fails', async () => {
    const rename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (destination === target()) throw new Error('disk unavailable')
      return rename(source, destination)
    })
    await expect(service.importSkillFiles(files(), { overwrite: true })).rejects.toThrow(/原文件保留在/)
    const transactions = (await fs.readdir(path.dirname(target()))).filter(name => name.startsWith('.ccb-import-'))
    expect(transactions).toHaveLength(1)
    expect(await fs.readFile(path.join(path.dirname(target()), transactions[0], 'original/SKILL.md'), 'utf8')).toBe('original skill bytes')
    expect(await fs.readFile(path.join(path.dirname(target()), transactions[0], 'original/keep.bin'))).toEqual(Buffer.from([0, 255, 1]))
  })
  it('serializes concurrent imports instead of merging their files', async () => {
    const first = files(markdown.replace('new content', 'first'))
    first.files.push({ relativePath: 'first.txt', contentBase64: 'YQ==' })
    const second = files(markdown.replace('new content', 'second'))
    second.files.push({ relativePath: 'second.txt', contentBase64: 'Yg==' })
    await Promise.all([service.importSkillFiles(first, { overwrite: true }), service.importSkillFiles(second, { overwrite: true })])
    expect(await fs.readFile(path.join(target(), 'SKILL.md'), 'utf8')).toContain('second')
    await expect(fs.access(path.join(target(), 'first.txt'))).rejects.toThrow()
    expect(await fs.readFile(path.join(target(), 'second.txt'), 'utf8')).toBe('b')
    expect(await fs.readdir(path.dirname(target()))).toEqual(['fixture'])
  })
  it.each(['../escape', 'C:\\outside', '\\\\host\\share', 'nested/../SKILL.md', 'file:stream', 'NUL', 'CON.data.more', 'COM¹.txt', 'name.'])('rejects unsafe relative path %s', async relativePath => {
    const payload = files()
    payload.files.push({ relativePath, contentBase64: 'YQ==' })
    await expect(service.importSkillFiles(payload, { overwrite: true })).rejects.toThrow()
    await expectOriginal()
  })
  it('rejects duplicate paths, malformed Base64 and oversized input before replacement', async () => {
    const duplicate = files()
    duplicate.files.push({ relativePath: 'skill.md', contentBase64: 'YQ==' })
    await expect(service.importSkillFiles(duplicate, { overwrite: true })).rejects.toThrow(/重复/)
    const malformed = files()
    malformed.files[0].contentBase64 = 'not base64!'
    await expect(service.importSkillFiles(malformed, { overwrite: true })).rejects.toThrow(/Base64/)
    await expect(service.importSkillFiles({ rootDirName: 'fixture', files: Array.from({ length: 2001 }, () => files().files[0]) }, { overwrite: true })).rejects.toThrow(/2000/)
    const tooLarge = files()
    tooLarge.files[0].contentBase64 = 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 3) * 4 + 4)
    await expect(service.importSkillFiles(tooLarge, { overwrite: true })).rejects.toThrow(/10 MiB/)
    await expectOriginal()
  })
  it('rejects directory junctions at the destination and inside source folders', async () => {
    const outside = path.join(directory, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep'), 'outside bytes')
    const linked = path.join(directory, '.claude/skills/linked')
    await fs.symlink(outside, linked, 'junction')
    await expect(service.importSkillFiles({ ...files(), rootDirName: 'linked' }, { overwrite: true })).rejects.toThrow(/链接/)
    const source = path.join(directory, 'source')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'SKILL.md'), markdown)
    await fs.symlink(outside, path.join(source, 'link'), 'junction')
    await expect(service.importSkill(source, { overwrite: true })).rejects.toThrow(/链接/)
    await expectOriginal()
    expect(await fs.readFile(path.join(outside, 'keep'), 'utf8')).toBe('outside bytes')
  })
  it('rejects an empty slug instead of writing to the skills root', async () => {
    const source = path.join(directory, 'source')
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, 'SKILL.md'), markdown.replace('name: fixture', 'name: 中文'))
    await expect(service.importSkill(source, { overwrite: true })).rejects.toThrow(/不能为空/)
    await expectOriginal()
  })
  it('reserves transaction-directory names on case-insensitive filesystems', async () => {
    await expect(service.importSkillFiles({ ...files(), rootDirName: '.CCB-IMPORT-existing' }, { overwrite: true })).rejects.toThrow(/目录名无效/)
    await expectOriginal()
  })
  it('rejects UNC source paths before filesystem access', async () => {
    const source = '\\\\fixture.invalid\\share\\skill'
    const read = vi.spyOn(fs, 'lstat')
    await expect(service.importSkill(source, { overwrite: true })).rejects.toThrow(/本地绝对路径/)
    expect(read).not.toHaveBeenCalledWith(source)
    await expectOriginal()
  })
})
