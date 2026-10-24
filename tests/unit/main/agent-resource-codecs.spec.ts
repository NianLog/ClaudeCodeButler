import { describe, expect, it } from 'vitest'
import { parse as parseToml } from 'smol-toml'
import type { ImportToolId, ManagedAgentId } from '../../../src/shared/agent-resources'
import { convertMcp, convertRole, editMcpDocument, normalizeMcp, parseJson, parseRole, redactPreview, validateSkill } from '../../../src/main/services/agent-resource-codecs'

const tools: ImportToolId[] = ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity', 'cursor', 'qoder', 'workbuddy', 'trae', 'pi', 'opencode']
const targets: ManagedAgentId[] = ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity']
const role = (metadata = '') => `---\nname: reviewer\ndescription: Review changes\n${metadata}---\nCheck the patch.\n`

describe('agent resource codecs', () => {
  it.each(tools)('%s stdio definitions preserve executable and argv into all managed targets', source => {
    const original = source === 'opencode' ? { type: 'local', command: ['node', 'server.js', '--space=a b'], environment: { MODE: 'local' } } : { command: 'node', args: ['server.js', '--space=a b'], env: { MODE: 'local' } }
    for (const target of targets) {
      const actual = normalizeMcp(convertMcp(original, source, target), target)
      expect(actual.command).toBe('node')
      expect(actual.args).toEqual(['server.js', '--space=a b'])
      expect(actual.env).toEqual({ MODE: 'local' })
    }
  })

  it('maps native remote fields without guessing from URL suffixes', () => {
    expect(convertMcp({ type: 'http', url: 'https://example.com/sse' }, 'claude-code', 'gemini-cli')).toEqual({ httpUrl: 'https://example.com/sse' })
    expect(convertMcp({ httpUrl: 'https://example.com/mcp' }, 'gemini-cli', 'antigravity')).toEqual({ serverUrl: 'https://example.com/mcp' })
    expect(() => convertMcp({ url: 'https://example.com/mcp' }, 'gemini-cli', 'codex-cli')).toThrow('SSE')
    expect(() => convertMcp({ type: 'ws', url: 'ws://example.com' }, 'qoder', 'claude-code')).toThrow('协议')
  })

  it('converts Pi timeout seconds and refuses incompatible Codex deadline semantics', () => {
    expect(convertMcp({ command: 'node', timeout: 5 }, 'pi', 'gemini-cli').timeout).toBe(5000)
    expect(() => convertMcp({ command: 'node', timeout: 5 }, 'pi', 'codex-cli')).toThrow('超时')
    expect(() => convertMcp({ command: 'node', startup_timeout_sec: 30 }, 'codex-cli', 'claude-code')).toThrow('startup_timeout_sec')
    expect(convertMcp({ command: 'node', timeout: 5 }, 'pi', 'antigravity').timeoutSeconds).toBe(5)
    expect(convertMcp({ command: 'node', timeoutSeconds: 30 }, 'antigravity', 'gemini-cli').timeout).toBe(30_000)
    expect(() => convertMcp({ command: 'node', timeout: 1500 }, 'gemini-cli', 'antigravity')).toThrow('整数秒')
    expect(() => convertMcp({ command: 'node', disabled: true }, 'antigravity', 'gemini-cli')).toThrow('启停')
  })

  it('keeps credential references symbolic and maps Codex native environment bindings', () => {
    const native = convertMcp({ type: 'http', url: 'https://example.com', headers: { Authorization: 'Bearer ${env:TOKEN}', 'X-Secret': '${env:SECRET}' } }, 'cursor', 'codex-cli')
    expect(native.bearer_token_env_var).toBe('TOKEN')
    expect(native.env_http_headers).toEqual({ 'X-Secret': 'SECRET' })
    expect(convertMcp(native, 'codex-cli', 'claude-code').headers).toEqual({ 'X-Secret': '${SECRET}', Authorization: 'Bearer ${TOKEN}' })
    const stdio = convertMcp({ command: 'node', env: { API_KEY: '${env:API_KEY}' } }, 'cursor', 'codex-cli')
    expect(stdio.env_vars).toEqual(['API_KEY'])
    expect(convertMcp(stdio, 'codex-cli', 'claude-code').env).toEqual({ API_KEY: '${API_KEY}' })
    expect(convertMcp({ command: 'node', env: { API_KEY: '$API_KEY' } }, 'gemini-cli', 'codex-cli').env_vars).toEqual(['API_KEY'])
    expect(() => convertMcp({ command: 'node', env: { API_KEY: '${API_KEY:-fallback}' } }, 'claude-code', 'gemini-cli')).toThrow('变量默认值')
    expect(() => convertMcp({ command: 'node', args: ['${workspaceFolder}/mcp.js'] }, 'cursor', 'claude-code')).toThrow('工作区')
  })

  it('does not discard trust, auto-approval or OAuth policy during conversion', () => {
    for (const field of ['autoApprove', 'trust', 'oauth', 'includeTools']) expect(() => convertMcp({ command: 'node', [field]: true }, 'qoder', 'claude-code')).toThrow(field)
  })

  it('rejects prototype poisoning before JSONC object construction and cannot inherit executable commands', () => {
    expect(() => parseJson('{"__proto__":{"command":"node"}}')).toThrow('__proto__')
    expect(() => parseJson('{"env":{"__proto__":{"TOKEN":"private"}}}')).toThrow('__proto__')
    expect(() => convertMcp(Object.create({ command: 'node', args: ['server.js'] }) as Record<string, unknown>, 'cursor', 'claude-code')).toThrow('原型')
    expect(({} as Record<string, unknown>).command).toBeUndefined()
  })

  it('edits only selected JSONC bytes, retaining comments and unknown large integers', () => {
    const raw = '{\n// Keep this comment\n"large":9007199254740993123,"mcpServers":{"a":{"command":"old"}},"unknown":{"unchanged":true},\n}\n'
    const selected = '{"command":"node","custom":9007199254740993999}'
    const edited = editMcpDocument(raw, 'claude-code', 'a', parseJson(selected), selected)
    expect(edited).toContain('// Keep this comment')
    expect(edited).toContain('9007199254740993123')
    expect(edited).toContain('9007199254740993999')
    expect(edited).toContain('"unknown":{"unchanged":true}')
    expect(parseJson(edited).mcpServers).toMatchObject({ a: { command: 'node' } })
    expect(() => parseJson('{"mcpServers":{}, "mcpServers":{}}')).toThrow('重复键')
  })

  it('preserves unrelated TOML including multiline string fake headers', () => {
    const text = '# user preferences\nmodel="my-model"\nnote="""\n[mcp_servers.fake]\n"""\n\n[mcp_servers.a]\ncommand="old"\n[mcp_servers.a.env]\nKEY="value"\n\n[features]\nkeep=true\n'
    const edited = editMcpDocument(text, 'codex-cli', 'a', { command: 'node', args: ['a b'] })
    expect(edited).toContain('# user preferences')
    expect(edited).toContain('note="""\n[mcp_servers.fake]\n"""')
    expect(edited).toContain('[features]\nkeep=true')
    expect(parseToml(edited).mcp_servers).toEqual({ a: { command: 'node', args: ['a b'] } })
    expect(() => editMcpDocument('mcp_servers={ a={command="node"} }\n', 'codex-cli', 'a', { command: 'new' })).toThrow('内联')
  })

  it('converts native roles and blocks permission broadening', () => {
    const converted = convertRole(role(), 'claude-code', 'codex-cli')
    expect(parseToml(converted)).toMatchObject({ name: 'reviewer', developer_instructions: 'Check the patch.\n' })
    expect(parseRole(convertRole(role('tools: [Read, Grep]\n'), 'claude-code', 'gemini-cli'), 'gemini-cli').metadata.tools).toEqual(['read_file', 'grep_search'])
    for (const target of ['codex-cli', 'antigravity'] as const) expect(() => convertRole(role('readonly: true\n'), 'cursor', target)).toThrow('权限')
    expect(parseRole(convertRole(role('readonly: true\n'), 'cursor', 'claude-code'), 'claude-code').metadata.tools).toEqual(['Read', 'Glob', 'Grep'])
    expect(() => convertRole(role('permission: {edit: deny}\n'), 'opencode', 'claude-code')).toThrow('permission')
    expect(() => convertRole(role('mode: primary\n'), 'opencode', 'gemini-cli')).toThrow('primary')
    expect(() => convertRole(role('kind: remote\n'), 'gemini-cli', 'claude-code')).toThrow('远程')
  })

  it('keeps Skill invocation and permission differences explicit', () => {
    expect(() => validateSkill(role('disable-model-invocation: true\n'), 'claude-code', 'codex-cli')).toThrow('调用或权限')
    expect(() => validateSkill(role(), 'cursor', 'gemini-cli')).not.toThrow()
    for (const source of ['trae', 'pi'] as const) expect(() => convertRole(role(), source, 'claude-code')).toThrow('通用子 Agent')
  })

  it('masks literal secrets without replacing original conversion bytes', () => {
    const raw = '{"command":"node","env":{"UNUSUAL":"private-value","API_KEY":"${API_KEY}"},"headers":{"Cookie":"private-cookie","Authorization":"Bearer ${TOKEN}"}}'
    const preview = redactPreview(raw)
    expect(preview).not.toContain('private-value')
    expect(preview).not.toContain('private-cookie')
    expect(preview).toContain('${API_KEY}')
    expect(preview).toContain('${TOKEN}')
    expect(raw).toContain('private-value')
    const toml = redactPreview('command="node"\n[env]\nUNUSUAL="private-value"\n')
    expect(toml).not.toContain('private-value')
    expect(redactPreview('{"url":"https://example.com/mcp?api%5Fkey=private-url-secret&token=${TOKEN}"}')).not.toContain('private-url-secret')
    const argv = redactPreview(JSON.stringify({ command: 'node', args: ['server.js', '--api-key', 'private-cli-secret', '--token=private-inline-secret', '--client-secret=${SECRET}', '-H', 'Authorization: Bearer private-header-secret', 'API_KEY=private-env-secret'] }))
    expect(argv).not.toContain('private-')
    expect(argv).toContain('server.js')
    expect(argv).toContain('${SECRET}')
  })
})
