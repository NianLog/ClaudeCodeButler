import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe.skipIf(process.platform !== 'win32')('release signature exception', () => {
  let directory: string
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ccb-signing-policy-'))
    fs.mkdirSync(path.join(directory, 'scripts'))
    fs.copyFileSync(path.resolve('scripts/verify-release.ps1'), path.join(directory, 'scripts/verify-release.ps1'))
    fs.mkdirSync(path.join(directory, 'release/win-unpacked/resources'), { recursive: true })
    for (const file of ['CCB-Portable-1.5.1.exe', 'CCB-Setup-1.5.1.exe', 'win-unpacked/CCB.exe', 'win-unpacked/resources/app.asar']) {
      fs.writeFileSync(path.join(directory, 'release', file), 'fixture')
    }
    execFileSync('pwsh.exe', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory(${quote(path.join(directory, 'release/win-unpacked'))}, ${quote(path.join(directory, 'release/CCB-1.5.1-win.zip'))})`
    ], { windowsHide: true })
  }, 30000)
  afterAll(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }) })

  it.each([
    ['1.5.1', 'NotSigned', false, false],
    ['1.5.1', 'NotSigned', true, true],
    ['1.5.1', 'HashMismatch', true, false],
    ['1.5.1', 'Valid', false, true],
    ['1.5.2', 'NotSigned', true, false]
  ] as const)('%s / %s / exception %s succeeds: %s', (version, signature, allow, succeeds) => {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version }))
    const command = `$ErrorActionPreference='Stop'; function Get-AuthenticodeSignature { param($LiteralPath) [pscustomobject]@{Status=${quote(signature)}} }; & ${quote(path.join(directory, 'scripts/verify-release.ps1'))} -OutputDirectory ${quote(path.join(directory, 'release'))} ${allow ? '-AllowUnsigned' : ''}`
    const result = spawnSync('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
    expect(result.error).toBeUndefined()
    expect(result.status === 0, result.stdout + result.stderr).toBe(succeeds)
    if (!succeeds) expect(result.stderr).toContain(version === '1.5.1' ? 'Invalid Authenticode signature' : 'Unsigned exception is restricted')
  }, 25000)
})
