import path from 'path'
import fs from 'fs'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

const lint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../../..') })
const guardRules = new Set(['no-restricted-globals', 'no-restricted-imports', 'no-restricted-modules', 'no-restricted-syntax', 'no-restricted-properties'])
beforeAll(async () => {
  // 冷加载 TypeScript parser 属于初始化，不占用单条规则用例的五秒预算。
  await lint.lintText('', { filePath: 'src/main/runtime-guard-fixture.ts' })
}, 60_000)
async function violations(code: string, filePath: string): Promise<number> {
  const [result] = await lint.lintText(code, { filePath })
  expect(result.fatalErrorCount).toBe(0)
  return result.messages.filter(message => guardRules.has(message.ruleId ?? '')).length
}

describe.each(['src/main/runtime-guard-fixture.ts', 'src/proxy-server/src/runtime-guard-fixture.ts'])('Node network boundary: %s', filePath => {
  it.each([
    "fetch('https://example.invalid')",
    "globalThis.fetch('https://example.invalid')",
    "global['fetch']('https://example.invalid')",
    'const request = globalThis.fetch; request()',
    'const { fetch: request } = globalThis; request()',
    "new WebSocket('wss://example.invalid')",
    "new globalThis.WebSocket('wss://example.invalid')",
    "new EventSource('https://example.invalid')",
    'const { EventSource: Source } = globalThis; new Source()',
    "import { resolve4 as lookup } from 'dns'; lookup('example.invalid')",
    "import { Resolver } from 'node:dns/promises'; new Resolver()",
    "import dns from 'dns'; dns.resolve4('example.invalid')",
    "import * as dns from 'dns/promises'; dns.resolve4('example.invalid')",
    "import { fetch as request } from 'undici'; request('https://example.invalid')",
    "export { resolve4 as lookup } from 'node:dns'",
    "const { resolve4: lookup } = require('dns'); lookup('example.invalid')",
    "const dns = require('node:dns/promises'); dns.resolve4('example.invalid')",
    "const client = require('undici'); client.fetch('https://example.invalid')",
    "const dns = await import('node:dns'); dns.resolve4('example.invalid')",
    "const client = await import('undici'); client.fetch('https://example.invalid')",
    "import { startupSnapshot as snapshot } from 'node:v8'; snapshot.addSerializeCallback(() => {})",
    "const { startupSnapshot } = await import('v8'); startupSnapshot.addSerializeCallback(() => {})",
    "const dns = process.getBuiltinModule('dns'); dns.resolve4('example.invalid')"
  ])('rejects %s', async code => {
    expect(await violations(code, filePath)).toBeGreaterThan(0)
  })

  it.each([
    "import { lookup } from 'dns/promises'; lookup('localhost')",
    "import { lookup as lookupHost } from 'node:dns'; lookupHost('localhost', () => {})",
    "import { net } from 'electron'; net.fetch('https://example.invalid')",
    "import { checkServerIdentity } from 'tls'; checkServerIdentity('localhost', {})",
    'const fetch = () => 1; fetch()',
    'const client = { fetch: () => 1 }; client.fetch()',
    "import { getHeapStatistics } from 'node:v8'; getHeapStatistics()"
  ])('allows reviewed API %s', async code => {
    expect(await violations(code, filePath)).toBe(0)
  })
})

it('preserves renderer browser networking', async () => {
  expect(await violations("fetch('https://example.invalid'); new WebSocket('wss://example.invalid'); new EventSource('https://example.invalid')", 'src/renderer/src/runtime-guard-fixture.ts')).toBe(0)
})

it('keeps unsupported Node snapshot, SEA and Permission Model flags out of supported builds', () => {
  const root = path.resolve(import.meta.dirname, '../../..')
  const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const launchConfig = JSON.stringify({ scripts: packageConfig.scripts, build: packageConfig.build }) + fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
  expect(launchConfig).not.toMatch(/--(?:build-snapshot|build-snapshot-config|snapshot-blob|experimental-sea-config|permission|experimental-permission)(?=[\s="']|$)/)
})
