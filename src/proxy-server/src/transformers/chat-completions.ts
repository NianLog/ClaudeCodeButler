import { randomUUID } from 'crypto'
import type { ClaudeRequest, ClaudeResponse } from '../types.js'

export class RequestValidationError extends Error {}

type Block = { type: string; [key: string]: unknown }
export function textContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content) || content.some(part => part?.type !== 'text' || typeof part.text !== 'string')) {
    throw new RequestValidationError('当前协议仅支持文本系统指令和文本工具结果')
  }
  return content.map(part => part.text).join('\n')
}

export function validateNativeRequest(request: ClaudeRequest): void {
  const supported = new Set(['model', 'messages', 'max_tokens', 'stream', 'system', 'temperature', 'top_p', 'top_k', 'stop_sequences', 'tools', 'tool_choice', 'metadata'])
  const unsupported = Object.keys(request).find(key => !supported.has(key))
  if (unsupported) throw new RequestValidationError(`当前协议不支持请求字段: ${unsupported}`)
  const blocks: unknown[] = [request.system, request.tools, ...request.messages.map(message => message.content)]
  if (blocks.some(value => Array.isArray(value) && value.some(block => block?.cache_control !== undefined))) {
    throw new RequestValidationError('原生转换不支持 cache_control；请使用 Anthropic 兼容服务商')
  }
}

export function toChatRequest(request: ClaudeRequest, model: string): Record<string, unknown> {
  validateNativeRequest(request)
  if (request.top_k !== undefined) throw new RequestValidationError('Chat Completions 不支持 top_k')
  const messages: Record<string, unknown>[] = []
  if (request.system !== undefined) messages.push({ role: 'system', content: textContent(request.system) })
  for (const message of request.messages) {
    if (typeof message.content === 'string') {
      messages.push({ role: message.role, content: message.content })
      continue
    }
    const parts: Record<string, unknown>[] = []
    const calls: Record<string, unknown>[] = []
    // 工具结果必须先于同一 user 消息的后续文本，保持调用顺序。
    for (const block of message.content) {
      if (block.type === 'tool_result' && message.role === 'user') {
        if (typeof block.tool_use_id !== 'string') throw new RequestValidationError('工具结果缺少 tool_use_id')
        messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: `${block.is_error ? 'Tool execution failed:\n' : ''}${textContent(block.content ?? '')}` })
      } else if (block.type === 'tool_use' && message.role === 'assistant') {
        if (typeof block.id !== 'string' || typeof block.name !== 'string' || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) {
          throw new RequestValidationError('工具调用格式无效')
        }
        calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } })
      } else if (block.type === 'text' && typeof block.text === 'string') {
        parts.push({ type: 'text', text: block.text })
      } else if (block.type === 'image' && message.role === 'user') {
        const source = block.source as Record<string, unknown> | undefined
        if (source?.type !== 'base64' || typeof source.media_type !== 'string' || typeof source.data !== 'string') {
          throw new RequestValidationError('当前协议仅支持 Base64 图片')
        }
        parts.push({ type: 'image_url', image_url: { url: `data:${source.media_type};base64,${source.data}` } })
      } else {
        throw new RequestValidationError(`当前协议不支持消息内容: ${block.type}`)
      }
    }
    if (parts.length || calls.length) {
      const content = parts.every(part => part.type === 'text') ? parts.map(part => part.text).join('\n') : parts
      messages.push({ role: message.role, content: content || null, ...(calls.length ? { tool_calls: calls } : {}) })
    }
  }
  const result: Record<string, unknown> = { model, messages, max_tokens: request.max_tokens, stream: request.stream ?? false }
  if (request.stream) result.stream_options = { include_usage: true }
  if (request.temperature !== undefined) result.temperature = request.temperature
  if (request.top_p !== undefined) result.top_p = request.top_p
  if (request.stop_sequences !== undefined) result.stop = request.stop_sequences
  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools)) throw new RequestValidationError('tools 必须是数组')
    result.tools = request.tools.map(tool => {
      if (!tool || typeof tool.name !== 'string' || !tool.input_schema || (tool.type && tool.type !== 'custom')) throw new RequestValidationError('当前协议仅支持自定义函数工具')
      return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }
    })
  }
  if (request.tool_choice !== undefined) {
    const choice = request.tool_choice as { type?: string; name?: string; disable_parallel_tool_use?: boolean }
    if (!choice || !['auto', 'any', 'none', 'tool'].includes(choice.type || '') || (choice.type === 'tool' && !choice.name)) {
      throw new RequestValidationError('tool_choice 格式无效')
    }
    result.tool_choice = choice.type === 'tool' ? { type: 'function', function: { name: choice.name } } : choice.type === 'any' ? 'required' : choice.type
    if (choice.disable_parallel_tool_use !== undefined) result.parallel_tool_calls = !choice.disable_parallel_tool_use
  }
  return result
}

export function stopReason(reason?: string): string | null {
  return ({ stop: 'end_turn', length: 'max_tokens', tool_calls: 'tool_use', function_call: 'tool_use' } as Record<string, string>)[reason || ''] ?? null
}

export function toolInput(value: string): Record<string, unknown> {
  const input: unknown = JSON.parse(value)
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('上游返回的工具参数必须是 JSON 对象')
  return input as Record<string, unknown>
}

export function fromChatResponse(response: unknown): ClaudeResponse {
  const resp = response as { id?: string; model?: string; choices?: Array<{ finish_reason?: string; message?: { content?: unknown; tool_calls?: Array<{ id: string; type?: string; function: { name: string; arguments: string } }> } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }
  const choice = resp?.choices?.[0]
  if (!choice?.message) throw new Error('上游响应缺少 message')
  if (choice.finish_reason === 'content_filter') throw new Error('上游因内容过滤拒绝生成')
  const reason = stopReason(choice.finish_reason)
  if (!reason) throw new Error('上游没有正常完成消息')
  const content: Block[] = []
  if (typeof choice.message.content === 'string' && choice.message.content) content.push({ type: 'text', text: choice.message.content })
  else if (choice.message.content != null && typeof choice.message.content !== 'string') throw new Error('上游返回了不支持的消息内容')
  for (const call of choice.message.tool_calls ?? []) {
    if (!call.id || !call.function?.name || (call.type && call.type !== 'function')) throw new Error('上游工具调用格式无效')
    content.push({ type: 'tool_use', id: call.id, name: call.function.name, input: toolInput(call.function.arguments) })
  }
  if (reason === 'tool_use' && !choice.message.tool_calls?.length) throw new Error('上游缺少工具调用内容')
  return { id: resp.id || `msg_${randomUUID()}`, type: 'message', role: 'assistant', content,
    model: resp.model || '', stop_reason: reason, stop_sequence: null,
    usage: { input_tokens: resp.usage?.prompt_tokens ?? 0, output_tokens: resp.usage?.completion_tokens ?? 0 } }
}
