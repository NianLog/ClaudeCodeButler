const RESERVED_MCP_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function assertSafeMcpKeys(...keys: unknown[]): void {
  if (keys.some(key => typeof key !== 'string' || !key.trim() || /[\0\r\n]/.test(key) || RESERVED_MCP_KEYS.has(key.trim()))) throw new Error('MCP 服务或范围标识包含无效或保留的原型字段')
}

export function createMcpDictionary<T>(): Record<string, T> { return Object.create(null) as Record<string, T> }

/** 原生 JSON reviver 保留普通 JSON 值，把动态键字典变为无原型对象；危险键必须拒绝。 */
export function mcpJsonReviver(key: string, value: unknown): unknown {
  if (RESERVED_MCP_KEYS.has(key)) throw new Error('MCP 配置包含保留的原型字段')
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.assign(createMcpDictionary<unknown>(), value)
  return value
}
