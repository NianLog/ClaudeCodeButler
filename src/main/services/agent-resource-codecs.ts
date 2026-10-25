import { applyEdits, findNodeAtLocation, modify, parse, parseTree, type ParseError } from 'jsonc-parser'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { dump, JSON_SCHEMA, load } from 'js-yaml'
import type { ImportToolId, ManagedAgentId } from '@shared/agent-resources'

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function bounded(value: unknown): void {
  const pending = [{ value, depth: 0 }]
  const seen = new WeakSet<object>()
  let nodes = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++nodes > 50_000 || item.depth > 64) throw new Error('配置结构超过安全限制')
    if (item.value && typeof item.value === 'object') {
      if (seen.has(item.value)) throw new Error('配置不允许循环或复用 YAML 别名')
      seen.add(item.value)
      for (const child of Object.values(item.value)) pending.push({ value: child, depth: item.depth + 1 })
    }
  }
}

export function parseJson(content: string): Record<string, unknown> {
  const raw = content.replace(/^\uFEFF/, '')
  const errors: ParseError[] = []
  const tree = parseTree(raw, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length || tree?.type !== 'object') throw new Error('配置必须是有效的 JSON/JSONC 对象')
  const pending = [{ node: tree, depth: 0 }]
  let nodes = 0
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (++nodes > 50_000 || depth > 128) throw new Error('JSON 结构超过安全限制')
    if (node.type === 'object') {
      const keys = node.children?.map(child => child.children?.[0].value) ?? []
      if (new Set(keys).size !== keys.length) throw new Error('JSON 配置包含重复键，不能可靠转换')
      if (keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('JSON 配置包含不安全的 __proto__/constructor/prototype 原型字段')
    }
    pending.push(...(node.children ?? []).map(child => ({ node: child, depth: depth + 1 })))
  }
  const value: unknown = parse(raw, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length || !record(value)) throw new Error('配置必须是有效的 JSON/JSONC 对象')
  bounded(value)
  return value
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export function editJsonSubtree(content: string, keyPath: string[], before: unknown, after: unknown): string {
  if (jsonEqual(before, after)) return content
  if (record(before) && record(after)) {
    let result = content
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) result = editJsonSubtree(result, [...keyPath, key], before[key], after[key])
    return result
  }
  const bom = content.startsWith('\uFEFF')
  const raw = bom ? content.slice(1) : content
  return (bom ? '\uFEFF' : '') + applyEdits(raw, modify(raw, keyPath, after, {}))
}

export function extractJsonSubtree(content: string, keyPath: string[]): string | undefined {
  const raw = content.replace(/^\uFEFF/, '')
  const root = parseTree(raw)
  const node = root && findNodeAtLocation(root, keyPath)
  return node ? raw.slice(node.offset, node.offset + node.length) : undefined
}

export function editRawJsonSubtree(content: string, keyPath: string[], value: string): string {
  const rawValue = value.replace(/^\uFEFF/, '')
  parseJson(rawValue)
  const withPlaceholder = editJsonSubtree(content, keyPath, undefined, {})
  const bom = withPlaceholder.startsWith('\uFEFF')
  const raw = bom ? withPlaceholder.slice(1) : withPlaceholder
  const tree = parseTree(raw)
  const node = tree && findNodeAtLocation(tree, keyPath)
  if (!node) throw new Error('无法定位原生 MCP 配置位置')
  return (bom ? '\uFEFF' : '') + raw.slice(0, node.offset) + rawValue + raw.slice(node.offset + node.length)
}

export function parseRole(content: string, tool: ImportToolId, options: { kind?: 'SKILL' | 'SUBAGENT'; name?: string } = {}): { metadata: Record<string, unknown>; prompt: string } {
  const skill = options.kind === 'SKILL'
  const optional = skill && (tool === 'claude-code' || tool === 'cursor')
  if (tool === 'codex-cli' && !skill) {
    const value = parseTomlObject(content)
    bounded(value)
    if (typeof value.name !== 'string' || typeof value.description !== 'string' || typeof value.developer_instructions !== 'string') {
      throw new Error('Codex 角色需要 name、description 和 developer_instructions')
    }
    const { developer_instructions, ...metadata } = value
    return { metadata, prompt: developer_instructions }
  }
  const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) {
    if (optional && !/^---(?:\r?\n|$)/.test(content.replace(/^\uFEFF/, ''))) return { metadata: {}, prompt: content.replace(/^\uFEFF/, '') }
    throw new Error('定义需要 YAML frontmatter 与正文')
  }
  let metadata: unknown
  try { metadata = load(match[1], { schema: JSON_SCHEMA }) }
  catch { throw new Error('YAML frontmatter 语法错误，请检查原生定义') }
  if (metadata === undefined && optional) metadata = {}
  if (!record(metadata)) throw new Error('frontmatter 必须是对象')
  bounded(metadata)
  const fields = !skill && tool === 'opencode' && metadata.name === undefined && options.name ? { ...metadata, name: options.name } : metadata
  if (optional) {
    if (fields.name !== undefined && (typeof fields.name !== 'string' || !fields.name) || fields.description !== undefined && typeof fields.description !== 'string') throw new Error('Skill name/description 提供时必须是字符串')
  } else if (typeof fields.name !== 'string' || typeof fields.description !== 'string' || !fields.name || !fields.description) {
    throw new Error('定义需要 name 和 description')
  }
  return { metadata: fields, prompt: match[2] }
}

export function emitRole(metadata: Record<string, unknown>, prompt: string, target: ManagedAgentId): string {
  if (target === 'codex-cli') return stringifyToml({ ...metadata, developer_instructions: prompt } as Parameters<typeof stringifyToml>[0])
  return `---\n${dump(metadata, { schema: JSON_SCHEMA, lineWidth: -1 }).trimEnd()}\n---\n${prompt}`
}

export function mcpRoot(tool: ImportToolId): string { return tool === 'codex-cli' ? 'mcp_servers' : tool === 'opencode' ? 'mcp' : 'mcpServers' }

function parseTomlObject(content: string): Record<string, unknown> {
  try { return parseToml(content.replace(/^\uFEFF/, '')) as Record<string, unknown> }
  catch { throw new Error('TOML 语法错误，请检查原生定义') }
}

export function parseMcpDocument(content: string, tool: ImportToolId): Record<string, unknown> {
  const value = tool === 'codex-cli' ? parseTomlObject(content) : parseJson(content)
  bounded(value)
  const root = value[mcpRoot(tool)]
  if (root !== undefined && !record(root)) throw new Error('MCP 注册表必须是对象')
  return root as Record<string, unknown> ?? {}
}

export function parseMcpItem(content: string, tool: ImportToolId): Record<string, unknown> {
  const item = tool === 'codex-cli' ? parseTomlObject(content) : parseJson(content)
  bounded(item)
  normalizeMcp(item, tool)
  return item
}

export function emitMcpItem(item: Record<string, unknown>, tool: ImportToolId): string {
  return tool === 'codex-cli' ? stringifyToml(item as Parameters<typeof stringifyToml>[0]) : JSON.stringify(item, null, 2)
}

// TOML 只修改已解析证明属于所选 MCP 的完整表段；内联表、数组表等布局交给原生编辑器处理。
function mcpTomlRange(content: string, name: string): { start: number; end: number } | undefined {
  const headers: Array<{ start: number; path: string[] }> = []
  let quote = ''
  let offset = 0
  for (const line of content.split(/(?<=\n)/)) {
    if (!quote && /^\s*\[/.test(line)) {
      const header = line.trim().replace(/\s+#.*$/, '')
      if (header.startsWith('[[')) throw new Error('MCP TOML 数组表需要原生编辑')
      try {
        let value: unknown = parseToml(`${header}\n__ccb_probe = true\n`)
        const keys: string[] = []
        while (record(value) && !Object.hasOwn(value, '__ccb_probe')) {
          const entries = Object.entries(value)
          if (entries.length !== 1) throw new Error('无法识别 TOML 表')
          keys.push(entries[0][0]); value = entries[0][1]
        }
        headers.push({ start: offset, path: keys })
      } catch { throw new Error('TOML 表布局无法安全局部修改，请使用原生编辑器') }
    }
    // 跳过多行字符串中的伪表头；单行字符串内的三引号不参与状态。
    let single = ''
    for (let i = 0; i < line.length; i++) {
      if (quote) {
        if (line.slice(i, i + 3) === quote && !(quote === '"""' && line[i - 1] === '\\')) { quote = ''; i += 2 }
      } else if (single) {
        if (line[i] === single && !(single === '"' && line[i - 1] === '\\')) single = ''
      } else if (line[i] === '#') break
      else if (line.slice(i, i + 3) === '"""' || line.slice(i, i + 3) === "'''") { quote = line.slice(i, i + 3); i += 2 }
      else if (line[i] === '"' || line[i] === "'") single = line[i]
    }
    offset += line.length
  }
  const selected = headers.filter(h => h.path[0] === 'mcp_servers' && h.path[1] === name)
  if (!selected.length) return undefined
  const start = selected[0].start
  const end = headers.find(h => h.start > start && !(h.path[0] === 'mcp_servers' && h.path[1] === name))?.start ?? content.length
  if (selected.some(h => h.start >= end)) throw new Error('MCP TOML 表不连续，请使用原生编辑器')
  return { start, end }
}

export function extractMcpItem(content: string, tool: ImportToolId, name: string, value: Record<string, unknown>): string {
  if (tool === 'codex-cli') return emitMcpItem(value, tool)
  const raw = content.replace(/^\uFEFF/, '')
  const tree = parseTree(raw)
  const node = tree && findNodeAtLocation(tree, [mcpRoot(tool), name])
  if (!node) throw new Error('无法定位 MCP 定义')
  return raw.slice(node.offset, node.offset + node.length)
}

export function extractMcpItems(content: string, tool: ImportToolId, definitions: Record<string, unknown>): Map<string, string> {
  const names = Object.keys(definitions)
  if (names.length > 1000) throw new Error('MCP 注册表超过 1000 个定义，请缩小导入文件')
  if (tool === 'codex-cli') return new Map(names.filter(name => record(definitions[name])).map(name => {
    const definition = definitions[name]
    if (!record(definition)) throw new Error('MCP 定义必须是对象')
    return [name, emitMcpItem(definition, tool)]
  }))
  const raw = content.replace(/^\uFEFF/, '')
  const tree = parseTree(raw)
  const root = tree && findNodeAtLocation(tree, [mcpRoot(tool)])
  return new Map((root?.children ?? []).map(property => {
    const key = property.children?.[0]
    const value = property.children?.[1]
    if (!key || !value) throw new Error('无法定位 MCP 条目')
    return [String(key.value), raw.slice(value.offset, value.offset + value.length)]
  }))
}

export function editMcpDocument(content: string, tool: ManagedAgentId, name: string, item?: Record<string, unknown>, rawItem?: string): string {
  const old = parseMcpDocument(content, tool)
  if (tool !== 'codex-cli') {
    const hasBom = content.startsWith('\uFEFF')
    const raw = hasBom ? content.slice(1) : content
    let result = applyEdits(raw, modify(raw, [mcpRoot(tool), name], rawItem === undefined ? item : {}, {}))
    if (rawItem !== undefined) {
      const tree = parseTree(result)
      const node = tree && findNodeAtLocation(tree, [mcpRoot(tool), name])
      if (!node) throw new Error('无法定位 MCP 写入位置')
      result = result.slice(0, node.offset) + rawItem + result.slice(node.offset + node.length)
    }
    parseJson(result)
    return (hasBom ? '\uFEFF' : '') + result
  }
  const range = mcpTomlRange(content, name)
  if (Object.hasOwn(old, name) && !range) throw new Error('现有 MCP 使用内联 TOML，请另名导入或使用原生编辑器')
  const replacement = item === undefined ? '' : stringifyToml({ mcp_servers: { [name]: item } } as Parameters<typeof stringifyToml>[0])
  const result = range ? `${content.slice(0, range.start) + replacement  }\n${  content.slice(range.end)}` : content + (content.endsWith('\n') ? '\n' : '\n\n') + replacement
  const final = parseMcpDocument(result, tool)
  const expected = { ...old }
  if (item === undefined) delete expected[name]
  else expected[name] = item
  if (JSON.stringify(final) !== JSON.stringify(expected)) throw new Error('TOML 局部修改未通过一致性校验')
  return result
}

interface McpDefinition {
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  disabled?: boolean
  timeout?: number
  extras: string[]
}

function stringMap(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!record(value) || Object.values(value).some(v => typeof v !== 'string')) throw new Error(`${label} 必须是字符串映射`)
  return value as Record<string, string>
}

export function normalizeMcp(item: Record<string, unknown>, tool: ImportToolId): McpDefinition {
  const prototype = Object.getPrototypeOf(item)
  if (prototype !== Object.prototype && prototype !== null) throw new Error('MCP 不允许继承原型字段')
  item = Object.assign(Object.create(null) as Record<string, unknown>, item)
  if (item.env !== undefined && item.environment !== undefined || item.headers !== undefined && item.http_headers !== undefined || [item.url, item.httpUrl, item.serverUrl].filter(value => value !== undefined).length > 1) throw new Error('MCP 包含重复或含义不明的原生字段')
  const known = new Set(['type', 'command', 'args', 'env', 'environment', 'url', 'httpUrl', 'serverUrl', 'headers', 'http_headers', 'env_http_headers', 'bearer_token_env_var', 'env_vars', 'disabled', 'enabled', 'timeout', 'timeoutSeconds', 'description', 'name'])
  const extras = Object.keys(item).filter(key => !known.has(key))
  const command = tool === 'opencode' && Array.isArray(item.command) ? item.command[0] : item.command
  const args = tool === 'opencode' && Array.isArray(item.command) ? item.command.slice(1) : item.args
  const url = item.httpUrl ?? item.serverUrl ?? item.url
  const transport = command !== undefined ? 'stdio' : item.type === 'sse' || (tool === 'gemini-cli' && item.url !== undefined && item.httpUrl === undefined) ? 'sse' : 'http'
  if (tool === 'gemini-cli' && item.url !== undefined && item.type !== undefined && item.type !== 'sse') throw new Error('Gemini url 原生字段表示 SSE，与显式 type 不一致')
  if (item.httpUrl !== undefined && item.type === 'sse') throw new Error('httpUrl 与显式 SSE 类型不一致')
  if (item.type !== undefined && !['local', 'remote', 'stdio', 'http', 'sse', 'streamable-http'].includes(String(item.type))) throw new Error('无法识别 MCP 传输协议')
  if (transport === 'stdio' && ['http', 'sse', 'remote', 'streamable-http'].includes(String(item.type)) || transport !== 'stdio' && ['stdio', 'local'].includes(String(item.type))) throw new Error('MCP 传输类型与 command/URL 不一致')
  if (transport === 'stdio') {
    if (typeof command !== 'string' || !command.trim() || /[\0\r\n]/.test(command)) throw new Error('MCP command 必须是非空可执行文件名')
    if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0')))) throw new Error('MCP args 必须是字符串数组')
    if (url !== undefined) throw new Error('MCP 不能同时配置 command 与 URL')
  } else {
    if (typeof url !== 'string' || !url.trim() || /[\0\r\n]/.test(url)) throw new Error('远程 MCP 需要 URL')
    const parsed = new URL(url.replace(/\$\{[^}]+\}|\{env:[^}]+\}/g, 'placeholder'))
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('MCP URL 只允许无内嵌凭据的 HTTP/HTTPS')
    if (args !== undefined) throw new Error('远程 MCP 不能包含 stdio args')
  }
  if (item.disabled !== undefined && typeof item.disabled !== 'boolean' || item.enabled !== undefined && typeof item.enabled !== 'boolean') throw new Error('MCP 启停字段必须是布尔值')
  if (item.disabled !== undefined && item.enabled !== undefined && item.disabled === item.enabled) throw new Error('MCP 启停字段相互矛盾')
  if (item.timeout !== undefined && (typeof item.timeout !== 'number' || !Number.isFinite(item.timeout) || item.timeout <= 0)) throw new Error('MCP timeout 必须是正数')
  if (item.timeoutSeconds !== undefined) {
    if (tool !== 'antigravity' || typeof item.timeoutSeconds !== 'number' || !Number.isInteger(item.timeoutSeconds)) throw new Error('timeoutSeconds 只支持已确认的 Antigravity 整数秒字段')
    if (item.timeoutSeconds <= 0) extras.push('timeoutSeconds 的默认/无限时限语义')
  }
  let env = stringMap(item.env ?? item.environment, 'MCP env')
  let headers = stringMap(item.headers ?? item.http_headers, 'MCP headers')
  if (tool === 'codex-cli') {
    if (item.env_vars !== undefined) {
      if (!Array.isArray(item.env_vars) || item.env_vars.some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw new Error('Codex env_vars 必须是环境变量名列表')
      env = { ...Object.fromEntries(item.env_vars.map(name => [name, `\${${  name  }}`])), ...env }
    }
    const bindings = stringMap(item.env_http_headers, 'Codex env_http_headers')
    if (bindings) {
      headers = { ...headers }
      for (const [name, variable] of Object.entries(bindings)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable) || Object.hasOwn(headers, name)) throw new Error('Codex header 环境绑定无效或冲突')
        headers[name] = `\${${  variable  }}`
      }
    }
    if (item.bearer_token_env_var !== undefined) {
      if (typeof item.bearer_token_env_var !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.bearer_token_env_var) || Object.keys(headers ?? {}).some(name => name.toLowerCase() === 'authorization')) throw new Error('Codex Bearer 环境绑定无效或冲突')
      headers = { ...headers, Authorization: `Bearer \${${  item.bearer_token_env_var  }}` }
    }
  }
  if (headers && Object.entries(headers).some(([k, v]) => /[\r\n\0]/.test(k + v))) throw new Error('MCP headers 含无效字符')
  return { transport, command: command as string | undefined, args: args as string[] | undefined, env, url: url as string | undefined, headers, disabled: item.disabled as boolean | undefined ?? (item.enabled === undefined ? undefined : !item.enabled), timeout: item.timeoutSeconds !== undefined && Number(item.timeoutSeconds) > 0 ? Number(item.timeoutSeconds) * 1000 : item.timeout === undefined ? undefined : Number(item.timeout) * (tool === 'pi' ? 1000 : 1), extras }
}

function mapReferences(value: string, source: ImportToolId, target: ManagedAgentId): string {
  const normalized = source === 'cursor' ? value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, '${$1}') : source === 'opencode' ? value.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, '${$1}') : value
  if (/\$\{(?:workspaceFolder|userHome|config:|input:)|\{file:/.test(normalized)) throw new Error('来源包含工作区/文件变量，目标语义未确认')
  if ([...normalized.matchAll(/\$\{([^}]+)\}/g)].some(match => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(match[1]))) throw new Error('变量默认值、嵌套或命名空间语法没有可靠目标映射，请先确认原生定义')
  if (target === 'codex-cli' && /\$\{[^}]+\}/.test(normalized)) throw new Error('Codex 不展开此位置的环境变量引用，请在目标工具配置原生环境绑定')
  return normalized
}

export function convertMcp(item: Record<string, unknown>, source: ImportToolId, target: ManagedAgentId, sourceDisabled = false): Record<string, unknown> {
  const value = normalizeMcp(item, source)
  if (sourceDisabled) value.disabled = true
  if (value.disabled && (target === 'claude-code' || target === 'gemini-cli')) throw new Error('目标启停依赖独立或按项目状态，不能用 server.disabled 伪造；请在原生工具确认后导入')
  if (source === target) return item
  if (value.extras.length) throw new Error(`不能丢弃来源字段或约束：${value.extras.join('、')}`)
  if (value.transport === 'sse' && target !== 'claude-code' && target !== 'gemini-cli') throw new Error('目标没有已确认的旧 SSE 配置映射')
  if ((target === 'codex-cli' || target === 'claude-code') && value.timeout !== undefined) throw new Error('目标没有已确认等价的单服务器通用超时语义，请手工确认')
  const result: Record<string, unknown> = {}
  if (value.transport === 'stdio') {
    result.command = mapReferences(value.command!, source, target)
    if (value.args) result.args = value.args.map(arg => mapReferences(arg, source, target))
    if (value.env) {
      const entries = Object.entries(value.env).map(([k, v]) => {
        let expandedSyntax = v
        if (source === 'gemini-cli') {
          expandedSyntax = v.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, '${$1}')
          if (process.platform === 'win32') expandedSyntax = expandedSyntax.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, '${$1}')
        }
        return [k, mapReferences(expandedSyntax, source, target === 'codex-cli' ? 'claude-code' : target)]
      })
      if (target === 'codex-cli') {
        const inherited: string[] = []
        const literal: Record<string, string> = {}
        for (const [key, raw] of entries) {
          if (raw === `\${${  key  }}`) inherited.push(key)
          else literal[key] = mapReferences(raw, 'claude-code', target)
        }
        if (inherited.length) result.env_vars = inherited
        if (Object.keys(literal).length) result.env = literal
      } else result.env = Object.fromEntries(entries)
    }
    if (target === 'claude-code') result.type = 'stdio'
  } else {
    result[target === 'gemini-cli' && value.transport === 'http' ? 'httpUrl' : target === 'antigravity' ? 'serverUrl' : 'url'] = mapReferences(value.url!, source, target)
    if (target === 'claude-code') result.type = value.transport
    if (value.headers) {
      const mapped = Object.entries(value.headers).map(([k, v]) => [k, mapReferences(v, source, target === 'codex-cli' ? 'claude-code' : target)])
      if (target === 'codex-cli') {
        const literal: Record<string, string> = {}
        const bindings: Record<string, string> = {}
        for (const [name, raw] of mapped) {
          const bearer = name.toLowerCase() === 'authorization' && raw.match(/^Bearer \$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
          const variable = raw.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/)
          if (bearer) result.bearer_token_env_var = bearer[1]
          else if (variable) bindings[name] = variable[1]
          else literal[name] = mapReferences(raw, 'claude-code', target)
        }
        if (Object.keys(literal).length) result.http_headers = literal
        if (Object.keys(bindings).length) result.env_http_headers = bindings
      } else result.headers = Object.fromEntries(mapped)
    }
  }
  if (value.disabled !== undefined && (target === 'codex-cli' || target === 'antigravity')) result[target === 'codex-cli' ? 'enabled' : 'disabled'] = target === 'codex-cli' ? !value.disabled : value.disabled
  if (value.timeout !== undefined) {
    if (target === 'antigravity') {
      if (!Number.isInteger(value.timeout / 1000)) throw new Error('此毫秒超时不能无损转换为 Antigravity 整数秒')
      result.timeoutSeconds = value.timeout / 1000
    } else result.timeout = value.timeout
  }
  normalizeMcp(result, target)
  return result
}

const TOOL_NAMES: Record<string, Record<'claude-code' | 'gemini-cli', string>> = {
  Read: { 'claude-code': 'Read', 'gemini-cli': 'read_file' }, Glob: { 'claude-code': 'Glob', 'gemini-cli': 'glob' }, Grep: { 'claude-code': 'Grep', 'gemini-cli': 'grep_search' },
  Write: { 'claude-code': 'Write', 'gemini-cli': 'write_file' }, Edit: { 'claude-code': 'Edit', 'gemini-cli': 'replace' }, Bash: { 'claude-code': 'Bash', 'gemini-cli': 'run_shell_command' }
}

export function convertRole(content: string, source: ImportToolId, target: ManagedAgentId, name?: string): string {
  if (source === 'trae' || source === 'pi') throw new Error('尚无已确认的通用子 Agent 文件规范，请使用已验证的扩展 profile')
  const { metadata, prompt } = parseRole(content, source, { name })
  if (source === target) return content
  const allowed = new Set(['name', 'description', 'model', 'tools', 'readonly', 'is_background', 'kind', 'mode', 'color'])
  const unknown = Object.keys(metadata).filter(k => !allowed.has(k))
  if (unknown.length) throw new Error(`目标无法保持角色约束或字段：${unknown.join('、')}`)
  if (metadata.kind !== undefined && metadata.kind !== 'local') throw new Error('远程角色不能转换为本地角色')
  if (metadata.mode !== undefined && metadata.mode !== 'subagent') throw new Error('OpenCode primary 模式不能当作子 Agent 导入')
  if (metadata.model !== undefined && metadata.model !== 'inherit') throw new Error('模型标识依赖目标供应商，请在目标原生定义中确认后导入')
  const result: Record<string, unknown> = { name: metadata.name, description: metadata.description }
  if (metadata.color !== undefined && target === 'claude-code') result.color = metadata.color
  if (metadata.readonly !== undefined && typeof metadata.readonly !== 'boolean') throw new Error('readonly 必须是布尔值')
  if (metadata.is_background !== undefined && typeof metadata.is_background !== 'boolean') throw new Error('is_background 必须是布尔值')
  if (metadata.readonly && (target === 'codex-cli' || target === 'antigravity')) throw new Error('目标角色不能独立设置等价只读权限，禁止用提示词代替沙箱')
  if (metadata.is_background) {
    if (target !== 'claude-code') throw new Error('目标缺少等价后台角色开关')
    result.background = true
  }
  let tools = metadata.tools
  if (typeof tools === 'string') tools = tools.split(',').map(v => v.trim()).filter(Boolean)
  if (tools !== undefined && (!Array.isArray(tools) || tools.some(t => typeof t !== 'string'))) throw new Error('tools 需要工具名称列表')
  if (metadata.readonly && tools === undefined) tools = ['Read', 'Glob', 'Grep']
  if (tools !== undefined) {
    if (target === 'codex-cli' || target === 'antigravity') throw new Error('目标角色没有已确认的独立工具权限映射')
    result.tools = (tools as string[]).map(name => {
      const canonical = Object.values(TOOL_NAMES).find(pair => Object.values(pair).includes(name))
      if (!canonical) throw new Error(`工具权限没有可靠映射：${name}`)
      if (metadata.readonly && !['Read', 'Glob', 'Grep'].includes(canonical['claude-code'])) throw new Error('只读角色包含写入或命令权限')
      return canonical[target]
    })
  }
  if (target === 'gemini-cli') result.kind = 'local'
  return emitRole(result, prompt, target)
}

export function validateSkill(content: string, source: ImportToolId, target: ManagedAgentId): void {
  const { metadata } = parseRole(content, source, { kind: 'SKILL' })
  if (source === target) return
  try { parseRole(content, target, { kind: 'SKILL' }) }
  catch (error) { throw new Error(`目标 Skill 格式需要补充字段：${error instanceof Error ? error.message : '请核对目标要求'}`) }
  const common = new Set(['name', 'description', 'license', 'compatibility', 'metadata'])
  const extra = Object.keys(metadata).filter(key => !common.has(key))
  if (extra.length && target !== 'claude-code') throw new Error(`目标未确认支持 Skill 调用或权限字段：${extra.join('、')}`)
  const claude = new Set([...common, 'allowed-tools', 'disable-model-invocation', 'user-invocable', 'argument-hint', 'context', 'agent'])
  if (extra.some(key => !claude.has(key))) throw new Error(`未知 Skill 约束不能静默丢弃：${extra.join('、')}`)
}

export function redactPreview(content: string): string {
  const maskUrl = (value: string): string => value.replace(/([?&])([^=&#\s]+)=([^&#\s]*)/g, (whole, separator: string, key: string, raw: string) => {
    let name = key
    let data = raw
    try { name = decodeURIComponent(key); data = decodeURIComponent(raw) } catch { /* 无效转义不解释为凭据引用。 */ }
    if (!/api[_-]?key|^key$|token|secret|password|signature|credential|authorization|cookie|session|^auth$/i.test(name)) return whole
    const references = data.match(/\$\{[^}]+\}|\{env:[^}]+\}/g)
    return `${separator}${key}=${references ? references.join(' ') : '••••••'}`
  })
  const credentialName = (value: string): boolean => /api[_-]?key|^key$|token|secret|password|credential|authorization|cookie|session/i.test(value.replace(/^--?/, '')) || /^--?headers?$|^-H$/.test(value)
  const hide = (value: unknown, sensitive = false): unknown => {
    if (typeof value === 'string') {
      if (!sensitive || /^(?:\$\{[^}]+\}|\{env:[^}]+\})$/.test(value)) return maskUrl(value)
      const references = value.match(/\$\{[^}]+\}|\{env:[^}]+\}/g)
      return references ? `•••••• ${references.join(' ')}` : '••••••'
    }
    if (Array.isArray(value)) {
      let protectNext = false
      return value.map(item => {
        const protect = sensitive || protectNext
        protectNext = typeof item === 'string' && /^--?[^=\s]+$/.test(item) && credentialName(item)
        if (typeof item === 'string' && !protect) {
          const assignment = item.match(/^((?:--?)?[A-Za-z_][A-Za-z0-9_-]*)=([\s\S]*)$/)
          if (assignment && credentialName(assignment[1])) return `${assignment[1]}=${String(hide(assignment[2], true))}`
          const header = item.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*([\s\S]*)$/)
          if (header && credentialName(header[1])) return `${header[1]}: ${String(hide(header[2], true))}`
        }
        return hide(item, protect)
      })
    }
    if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, hide(child, sensitive || /env|headers|authorization|key|token|secret|password|cookie/i.test(key))]))
    return value
  }
  try { return JSON.stringify(hide(parseJson(content)), null, 2) } catch { /* Markdown 或 TOML 继续按原生结构处理。 */ }
  try { return stringifyToml(hide(parseTomlObject(content)) as Parameters<typeof stringifyToml>[0]) } catch { /* Markdown 保持原文并遮盖常见凭据赋值。 */ }
  return content.replace(/((?:["']?(?:authorization|api[_-]?key|access[_-]?token|token|password|secret|[A-Z_]*(?:KEY|TOKEN|SECRET))["']?)\s*[:=]\s*)(["'])(?!\$\{|\{env:)([^\r\n]*?)\2/gi, '$1$2••••••$2')
}
