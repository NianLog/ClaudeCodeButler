import { randomUUID } from 'crypto'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types.js'
import { RequestValidationError, textContent, validateNativeRequest } from './chat-completions.js'

export function toGeminiRequest(request: ClaudeRequest, provider: ApiProvider): Record<string, unknown> {
  validateNativeRequest(request)
  if (request.tools !== undefined || request.tool_choice !== undefined) {
    throw new RequestValidationError('Gemini 原生转换暂不支持工具调用；请使用 Anthropic 兼容服务商')
  }
  const model = request.model.startsWith('gemini-') ? request.model : provider.models.find(value => value.startsWith('gemini-'))
  if (!model) throw new RequestValidationError('请在服务商中配置明确的 Gemini 模型 ID，不再回退到已退役模型')
  const contents = request.messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: typeof message.content === 'string' ? [{ text: message.content }] : message.content.map(part => {
      if (part.type === 'text' && typeof part.text === 'string') return { text: part.text }
      const source = part.source as { type?: string; media_type?: string; data?: string } | undefined
      if (part.type === 'image' && source?.type === 'base64' && source.media_type && typeof source.data === 'string') {
        return { inlineData: { mimeType: source.media_type, data: source.data } }
      }
      throw new RequestValidationError(`Gemini 原生转换不支持消息内容: ${part.type}`)
    })
  }))
  const generationConfig: Record<string, unknown> = { maxOutputTokens: request.max_tokens }
  if (request.temperature !== undefined) generationConfig.temperature = request.temperature
  if (request.top_p !== undefined) generationConfig.topP = request.top_p
  if (request.top_k !== undefined) generationConfig.topK = request.top_k
  if (request.stop_sequences !== undefined) generationConfig.stopSequences = request.stop_sequences
  return { model, contents, generationConfig, ...(request.system !== undefined ? { systemInstruction: { parts: [{ text: textContent(request.system) }] } } : {}) }
}

export function fromGeminiResponse(response: unknown): ClaudeResponse {
  const resp = response as { responseId?: string; modelVersion?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  const candidate = resp?.candidates?.[0]
  if (!candidate?.content?.parts) throw new Error('Gemini 响应缺少内容，或输入被拒绝')
  const reason = candidate.finishReason?.replace(/^FINISH_REASON_/, '')
  if (reason !== 'STOP' && reason !== 'MAX_TOKENS') throw new Error(`Gemini 未正常完成: ${reason ?? 'unknown'}`)
  return { id: resp.responseId || `msg_${randomUUID()}`, type: 'message', role: 'assistant',
    content: candidate.content.parts.map(part => {
      if (typeof part.text !== 'string' || part.thought) throw new Error('Gemini 原生响应仅支持普通文本')
      return { type: 'text', text: part.text }
    }), model: resp.modelVersion || '', stop_reason: reason === 'STOP' ? 'end_turn' : 'max_tokens', stop_sequence: null,
    usage: { input_tokens: resp.usageMetadata?.promptTokenCount ?? 0, output_tokens: resp.usageMetadata?.candidatesTokenCount ?? 0 } }
}
