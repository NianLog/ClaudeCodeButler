/**
 * Google Gemini API转换器
 *
 * Gemini是Google的多模态AI模型，支持文本、图像等多种输入
 * API文档: https://ai.google.dev/docs
 *
 * 转换需求：
 * 1. Gemini API格式与Claude差异较大，需要大幅转换
 * 2. 处理多模态内容的转换
 * 3. 处理对话历史的格式差异
 * 4. 错误码和响应格式映射
 */

import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types'

export class GeminiTransformer extends BaseTransformer {
  name = 'gemini'

  /**
   * 模型名称映射
   * Claude Code中的模型名 -> Gemini中的模型名
   */
  private modelMapping: Record<string, string> = {
    'claude-3-5-sonnet-20241022': 'gemini-1.5-pro',
    'claude-3-5-haiku-20241022': 'gemini-1.5-flash',
    'claude-3-opus-20240229': 'gemini-1.5-pro',
    'claude-3-sonnet-20240229': 'gemini-1.5-pro',
    'claude-3-haiku-20240307': 'gemini-1.5-flash',
    'gpt-4': 'gemini-1.5-pro',
    'gpt-4-turbo': 'gemini-1.5-pro',
    'gpt-3.5-turbo': 'gemini-1.5-flash'
  }

  /**
   * Gemini错误码到Claude错误码的映射
   */
  private errorMapping: Record<string, string> = {
    'INVALID_ARGUMENT': 'invalid_request_error',
    'PERMISSION_DENIED': 'permission_error',
    'UNAUTHENTICATED': 'authentication_error',
    'RESOURCE_EXHAUSTED': 'rate_limit_error',
    'NOT_FOUND': 'invalid_request_error',
    'ALREADY_EXISTS': 'invalid_request_error',
    'ABORTED': 'api_error',
    'OUT_OF_RANGE': 'invalid_request_error',
    'UNIMPLEMENTED': 'api_error',
    'INTERNAL': 'api_error',
    'UNAVAILABLE': 'api_error',
    'DATA_LOSS': 'api_error'
  }

  /**
   * 转换请求格式
   */
  async transformRequest(request: ClaudeRequest, _provider: ApiProvider): Promise<unknown> {
    const transformed: Record<string, unknown> = {}

    // 映射模型名称
    transformed.model = this.modelMapping[request.model] || 'gemini-1.5-pro'

    // Gemini使用contents而不是messages
    const contents: Array<Record<string, unknown>> = []

    // 转换消息格式
    if (request.messages) {
      for (const message of request.messages) {
        const geminiContent: Record<string, unknown> = {
          parts: [] as Array<Record<string, unknown>>,
          role: this.mapRoleToGemini(message.role)
        }

        // 处理内容
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text') {
              (geminiContent.parts as Array<Record<string, unknown>>).push({
                text: part.text
              })
            } else if (part.type === 'image') {
              // 处理图像
              const imgSource = part.source as { media_type: string; data: string }
              ;(geminiContent.parts as Array<Record<string, unknown>>).push({
                inline_data: {
                  mime_type: imgSource.media_type,
                  data: imgSource.data
                }
              })
            }
          }
        } else if (typeof message.content === 'string') {
          (geminiContent.parts as Array<Record<string, unknown>>).push({
            text: message.content
          })
        }

        contents.push(geminiContent)
      }
    }
    transformed.contents = contents

    // Gemini使用generationConfig而不是其他参数
    transformed.generationConfig = {}

    if (request.max_tokens) {
      transformed.generationConfig = { maxOutputTokens: request.max_tokens }
    }

    if (request.temperature !== undefined) {
      transformed.generationConfig = { ...(transformed.generationConfig as object), temperature: request.temperature }
    }

    if (request.top_p !== undefined) {
      transformed.generationConfig = { ...(transformed.generationConfig as object), topP: request.top_p }
    }

    // Gemini使用safetySettings
    transformed.safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE"
      }
    ]

    // 处理系统指令
    if (request.system) {
      transformed.systemInstruction = request.system
    }

    // 流式传输
    if (request.stream) {
      transformed.generationConfig = { ...(transformed.generationConfig as object), candidateCount: 1 }
    }

    return transformed
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: unknown, _provider: ApiProvider): Promise<ClaudeResponse> {
    const resp = response as Record<string, unknown>
    const candidates = resp.candidates as Array<Record<string, unknown>> | undefined
    const firstCandidate = candidates?.[0]
    const usageMetadata = resp.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined

    const transformed: ClaudeResponse = {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: (resp.modelVersion as string) || 'gemini-1.5-pro',
      stop_reason: this.mapFinishReason(firstCandidate?.finishReason as string | undefined),
      stop_sequence: (firstCandidate?.finishMessage as string | null | undefined) || null,
      usage: {
        input_tokens: usageMetadata?.promptTokenCount || 0,
        output_tokens: usageMetadata?.candidatesTokenCount || 0
      }
    }

    // Gemini响应格式处理
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0]

      // 处理内容
      const candidateContent = candidate.content as { parts?: Array<Record<string, unknown>> } | undefined
      if (candidateContent && candidateContent.parts) {
        for (const part of candidateContent.parts) {
          if (part.text) {
            transformed.content.push({
              type: 'text',
              text: part.text as string
            })
          } else if (part.inline_data) {
            // 处理图像响应
            const inlineData = part.inline_data as { mime_type?: string; data?: string }
            transformed.content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: inlineData.mime_type,
                data: inlineData.data
              }
            })
          }
        }
      }

      // 处理停止原因
      transformed.stop_reason = this.mapFinishReason(candidate.finishReason as string | undefined)
      transformed.stop_sequence = (candidate.finishMessage as string | null | undefined) ?? null

      // 处理安全评级
      if (candidate.safetyRatings) {
        // 可以在这里记录安全评级信息
      }
    }

    // 处理使用情况信息
    if (usageMetadata) {
      transformed.usage = {
        input_tokens: usageMetadata.promptTokenCount || 0,
        output_tokens: usageMetadata.candidatesTokenCount || 0
      }
    }

    // Gemini版本信息
    transformed.model = (resp.modelVersion as string) || 'gemini-1.5-pro'

    return transformed
  }

  /**
   * 转换流式响应数据块
   */
  transformStreamChunk(chunk: string, _provider: ApiProvider): string | null {
    try {
      // Gemini的流式响应格式
      if (chunk.includes('"candidates"')) {
        const parsed = JSON.parse(chunk) as Record<string, unknown>

        const transformed: Record<string, unknown> = {
          candidates: []
        }

        const parsedCandidates = parsed.candidates as Array<Record<string, unknown>> | undefined
        if (parsedCandidates && parsedCandidates.length > 0) {
          const candidate = parsedCandidates[0]
          const transformedCandidate: Record<string, unknown> = {
            content: {
              parts: [] as Array<Record<string, unknown>>
            }
          }

          const candidateContent = candidate.content as { parts?: Array<Record<string, unknown>> } | undefined
          if (candidateContent && candidateContent.parts) {
            for (const part of candidateContent.parts) {
              (transformedCandidate.content as { parts: Array<Record<string, unknown>> }).parts.push(part)
            }
          }

          if (candidate.finishReason) {
            transformedCandidate.finishReason = this.mapFinishReason(candidate.finishReason as string)
          }

          (transformed.candidates as Array<Record<string, unknown>>).push(transformedCandidate)
        }

        // 处理使用情况
        if (parsed.usageMetadata) {
          transformed.usageMetadata = parsed.usageMetadata
        }

        return JSON.stringify(transformed)
      }

      return chunk
    } catch (error) {
      console.error('Gemini stream chunk transform error:', error)
      return chunk
    }
  }

  /**
   * 转换错误格式
   */
  transformError(error: unknown, _provider: ApiProvider): unknown {
    const err = error as Record<string, unknown>
    // Gemini错误格式
    if (err.error) {
      const geminiError = err.error as Record<string, unknown>

      const transformedError: Record<string, unknown> = {
        type: 'error',
        error: {
          type: this.errorMapping[(geminiError.status as string) || ''] || 'api_error',
          message: (geminiError.message as string) || 'Gemini API error'
        }
      }

      // 添加错误详情
      if (geminiError.status) {
        (transformedError.error as Record<string, unknown>).code = geminiError.status
      }

      if (geminiError.details && (geminiError.details as unknown[]).length > 0) {
        (transformedError.error as Record<string, unknown>).details = geminiError.details
      }

      return transformedError
    }

    // 标准HTTP错误
    if (err.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(err.status as number),
          message: (err.statusText as string) || (err.message as string) || 'Gemini API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: (err.message as string) || 'Unknown Gemini error'
      }
    }
  }

  /**
   * 映射角色到Gemini格式
   */
  private mapRoleToGemini(role: string): string {
    if (role === 'assistant') return 'model'
    if (role === 'user') return 'user'
    return 'user' // 默认为用户
  }

  /**
   * 映射完成原因
   */
  private mapFinishReason(reason?: string): string | null {
    const mapping: Record<string, string> = {
      'FINISH_REASON_STOP': 'end_turn',
      'FINISH_REASON_MAX_TOKENS': 'max_tokens',
      'FINISH_REASON_SAFETY': 'stop_sequence',
      'FINISH_REASON_RECITATION': 'stop_sequence',
      'FINISH_REASON_OTHER': 'end_turn'
    }

    return mapping[reason || ''] || null
  }

  /**
   * 映射HTTP错误码到Claude错误类型
   */
  private mapHttpError(status: number): string {
    if (status === 400) return 'invalid_request_error'
    if (status === 401) return 'authentication_error'
    if (status === 403) return 'permission_error'
    if (status === 404) return 'invalid_request_error'
    if (status === 429) return 'rate_limit_error'
    if (status >= 500) return 'api_error'
    return 'api_error'
  }

  /**
   * 验证配置
   */
  validateConfig(provider: ApiProvider): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!provider.apiBaseUrl) {
      errors.push('Gemini API地址不能为空')
    }

    if (!provider.apiKey) {
      errors.push('Gemini API密钥不能为空')
    }

    // 验证API URL
    if (provider.apiBaseUrl && !provider.apiBaseUrl.includes('generativelanguage.googleapis.com')) {
      errors.push('Gemini API地址应该包含generativelanguage.googleapis.com')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 获取推荐配置
   */
  getDefaultConfig(): Partial<ApiProvider> {
    return {
      name: 'Google Gemini',
      type: 'gemini',
      apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      transformer: 'gemini',
      timeout: 90000, // Gemini可能需要更长的超时时间
      maxRetries: 2,
      retryDelay: 2000
    }
  }
}