/**
 * @file src/main/services/tool-artifact-codec-service.ts
 * @description 提供规则驱动配置资产的内置、不可下载 format codecs。
 */

import yaml from 'js-yaml'
import type {
  ArtifactFormat,
  ConfigArtifactValidationResult
} from '@shared/tool-registry'

const CODEC_MAX_DEPTH = 64
const CODEC_MAX_NODES = 50_000

/**
 * 限制 parsed configuration 的深度和节点数，避免 YAML/JSON 结构耗尽资源。
 * @param root parsed configuration value
 */
function assertBoundedStructure(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const visited = new WeakSet<object>()
  let nodes = 0
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) break
    nodes += 1
    if (nodes > CODEC_MAX_NODES) throw new Error(`配置结构超过 ${CODEC_MAX_NODES} nodes`)
    if (current.depth > CODEC_MAX_DEPTH) throw new Error(`配置结构超过 ${CODEC_MAX_DEPTH} levels`)
    if (typeof current.value !== 'object' || current.value === null) continue
    if (visited.has(current.value)) continue
    visited.add(current.value)
    for (const value of Object.values(current.value as Record<string, unknown>)) {
      stack.push({ value, depth: current.depth + 1 })
    }
  }
}

/**
 * 移除 JSONC comments，同时保留 string literal 内容与换行位置。
 * @param content JSONC 原始文本
 * @returns 不包含 comments 的 JSON-compatible 文本
 */
function stripJsonComments(content: string): string {
  let output = ''
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    const nextCharacter = content[index + 1]
    if (lineComment) {
      if (character === '\n' || character === '\r') {
        lineComment = false
        output += character
      } else {
        output += ' '
      }
      continue
    }
    if (blockComment) {
      if (character === '*' && nextCharacter === '/') {
        output += '  '
        blockComment = false
        index += 1
      } else {
        output += character === '\n' || character === '\r' ? character : ' '
      }
      continue
    }
    if (inString) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      output += character
    } else if (character === '/' && nextCharacter === '/') {
      lineComment = true
      output += '  '
      index += 1
    } else if (character === '/' && nextCharacter === '*') {
      blockComment = true
      output += '  '
      index += 1
    } else {
      output += character
    }
  }
  if (blockComment) throw new Error('JSONC block comment 未闭合')
  return output
}

/**
 * 移除 JSONC object/array 尾逗号，不修改 string literal。
 * @param content 已移除 comments 的文本
 * @returns strict JSON 文本
 */
function stripTrailingCommas(content: string): string {
  let output = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]
    if (inString) {
      output += character
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      output += character
      continue
    }
    if (character === ',') {
      let lookahead = index + 1
      while (/\s/.test(content[lookahead] ?? '')) lookahead += 1
      if (content[lookahead] === '}' || content[lookahead] === ']') {
        output += ' '
        continue
      }
    }
    output += character
  }
  return output
}

/**
 * 校验文本不包含 NUL，避免配置编辑链处理 binary data。
 * @param content UTF-8 文本
 */
function validateText(content: string): void {
  if (content.includes('\0')) throw new Error('配置文本不能包含 NUL character')
}

/**
 * 内置配置资产 codec service。
 * @description 远程 registry 只能声明 format，不能注入 parser 或 executable code。
 */
export class ToolArtifactCodecService {
  /**
   * 按 format 校验原始配置文本。
   * @param format registry 声明的 UPPERCASE format
   * @param content 原始 UTF-8 文本
   * @returns 可序列化 validation 结果
   */
  public validate(format: ArtifactFormat, content: string): ConfigArtifactValidationResult {
    try {
      validateText(content)
      let parsedValue: unknown
      if (format === 'JSON') parsedValue = JSON.parse(content)
      else if (format === 'JSONC') parsedValue = JSON.parse(stripTrailingCommas(stripJsonComments(content)))
      else if (format === 'YAML') parsedValue = yaml.load(content, { schema: yaml.JSON_SCHEMA })
      else if (format === 'TOML') throw new Error('当前版本尚未注册可信 TOML validation codec')
      if (parsedValue !== undefined) assertBoundedStructure(parsedValue)
      return { valid: true, format, errors: [] }
    } catch (error) {
      return {
        valid: false,
        format,
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }
}

/** 默认内置配置资产 codec service */
export const toolArtifactCodecService = new ToolArtifactCodecService()
