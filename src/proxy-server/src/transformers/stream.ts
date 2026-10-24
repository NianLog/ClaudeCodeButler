import { randomUUID } from 'crypto'
import { stopReason, toolInput } from './chat-completions.js'
import type { StreamTransformer } from '../types.js'

export function sseEvent(type: string, fields: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`
}

// 每个请求独立持有帧缓冲和消息状态，不能存入共享 transformer 单例。
export function createNativeStream(protocol: 'chat' | 'gemini', requestedModel: string): StreamTransformer {
  let buffer = ''
  let started = false
  let done = false
  let textOpen = false
  let reason: string | null = null
  let model = requestedModel
  let inputTokens = 0
  let outputTokens = 0
  let toolBytes = 0
  const tools = new Map<number, { id: string; name: string; arguments: string }>()
  const start = (id?: string): string => {
    if (started) return ''
    started = true
    return sseEvent('message_start', { message: { id: id || `msg_${randomUUID()}`, type: 'message', role: 'assistant', model,
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } } })
  }
  const text = (value: string): string => {
    if (!value) return ''
    let result = ''
    if (!textOpen) {
      textOpen = true
      result += sseEvent('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
    }
    return result + sseEvent('content_block_delta', { index: 0, delta: { type: 'text_delta', text: value } })
  }
  const frame = (raw: string): string => {
    const data = raw.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n')
    if (!data) return ''
    if (done) throw new Error('上游在结束帧后继续发送数据')
    if (data === '[DONE]') { done = true; return '' }
    const value = JSON.parse(data)
    if (value.error) throw new Error('上游流式响应报告错误')
    let result = ''
    if (protocol === 'chat') {
      model = value.model || model
      inputTokens = value.usage?.prompt_tokens ?? inputTokens
      outputTokens = value.usage?.completion_tokens ?? outputTokens
      result += start(value.id)
      const choice = value.choices?.[0]
      if (!choice) return result
      if (choice.finish_reason) {
        reason = stopReason(choice.finish_reason)
        if (!reason) throw new Error(`上游不支持的结束原因: ${choice.finish_reason}`)
      }
      if (choice.delta?.content != null) {
        if (typeof choice.delta.content !== 'string') throw new Error('上游流式文本格式无效')
        result += text(choice.delta.content)
      }
      for (const call of choice.delta?.tool_calls ?? []) {
        if (!Number.isInteger(call.index) || call.index < 0 || call.index >= 64) throw new Error('上游工具索引无效')
        const tool = tools.get(call.index) ?? { id: '', name: '', arguments: '' }
        tool.id += call.id ?? ''
        tool.name += call.function?.name ?? ''
        tool.arguments += call.function?.arguments ?? ''
        toolBytes += Buffer.byteLength(JSON.stringify(call))
        if (toolBytes > 4 * 1024 * 1024) throw new Error('上游工具调用超过 4 MiB')
        tools.set(call.index, tool)
      }
    } else {
      model = value.modelVersion || model
      inputTokens = value.usageMetadata?.promptTokenCount ?? inputTokens
      outputTokens = value.usageMetadata?.candidatesTokenCount ?? outputTokens
      result += start(value.responseId)
      const candidate = value.candidates?.[0]
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part.text !== 'string' || part.thought) throw new Error('Gemini 流式响应仅支持普通文本')
        result += text(part.text)
      }
      if (candidate?.finishReason) {
        reason = ({ STOP: 'end_turn', MAX_TOKENS: 'max_tokens' } as Record<string, string>)[candidate.finishReason] ?? null
        if (!reason) throw new Error(`Gemini 未正常完成: ${candidate.finishReason}`)
      }
      if (value.promptFeedback?.blockReason) throw new Error('Gemini 拒绝了输入内容')
    }
    return result
  }
  return {
    push(chunk: string): string {
      buffer = (buffer + chunk).replace(/\r\n/g, '\n')
      let result = ''
      let separator = buffer.indexOf('\n\n')
      while (separator >= 0) {
        if (Buffer.byteLength(buffer.slice(0, separator)) > 1024 * 1024) throw new Error('上游 SSE 帧超过 1 MiB')
        result += frame(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
        separator = buffer.indexOf('\n\n')
      }
      if (Buffer.byteLength(buffer) > 1024 * 1024) throw new Error('上游 SSE 帧超过 1 MiB')
      return result
    },
    end(): string {
      if (buffer.trim() || !reason || (protocol === 'chat' && !done)) throw new Error('上游流式响应意外中断')
      if (reason === 'tool_use' && !tools.size) throw new Error('上游缺少工具调用内容')
      let result = start()
      if (textOpen) result += sseEvent('content_block_stop', { index: 0 })
      let index = textOpen ? 1 : 0
      // 并行工具参数可能交错；等收齐后按块输出，避免客户端拼错工具参数。
      for (const [, tool] of [...tools.entries()].sort(([first], [second]) => first - second)) {
        if (!tool.id || !tool.name) throw new Error('上游工具调用不完整')
        toolInput(tool.arguments)
        result += sseEvent('content_block_start', { index, content_block: { type: 'tool_use', id: tool.id, name: tool.name, input: {} } })
        result += sseEvent('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: tool.arguments } })
        result += sseEvent('content_block_stop', { index })
        index++
      }
      result += sseEvent('message_delta', { delta: { stop_reason: reason, stop_sequence: null }, usage: { input_tokens: inputTokens, output_tokens: outputTokens } })
      return result + sseEvent('message_stop')
    }
  }
}
