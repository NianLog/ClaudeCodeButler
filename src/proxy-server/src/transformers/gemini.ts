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
  async transformRequest(request: ClaudeRequest, provider: ApiProvider): Promise<any> {
    const transformed: any = {}

    // 映射模型名称
    transformed.model = this.modelMapping[request.model] || 'gemini-1.5-pro'

    // Gemini使用contents而不是messages
    transformed.contents = []

    // 转换消息格式
    if (request.messages) {
      for (const message of request.messages) {
        const geminiContent: any = {
          parts: [],
          role: this.mapRoleToGemini(message.role)
        }

        // 处理内容
        if (Array.isArray(message.content)) {
          for (const part of message.content) {
            if (part.type === 'text') {
              geminiContent.parts.push({
                text: part.text
              })
            } else if (part.type === 'image') {
              // 处理图像
              geminiContent.parts.push({
                inline_data: {
                  mime_type: part.source.media_type,
                  data: part.source.data
                }
              })
            }
          }
        } else if (typeof message.content === 'string') {
          geminiContent.parts.push({
            text: message.content
          })
        }

        transformed.contents.push(geminiContent)
      }
    }

    // Gemini使用generationConfig而不是其他参数
    transformed.generationConfig = {}

    if (request.max_tokens) {
      transformed.generationConfig.maxOutputTokens = request.max_tokens
    }

    if (request.temperature !== undefined) {
      transformed.generationConfig.temperature = request.temperature
    }

    if (request.top_p !== undefined) {
      transformed.generationConfig.topP = request.top_p
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
      transformed.generationConfig.candidateCount = 1
    }

    return transformed
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: any, provider: ApiProvider): Promise<ClaudeResponse> {
    const transformed: ClaudeResponse = {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: response.modelVersion || 'gemini-1.5-pro',
      stop_reason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
      stop_sequence: response.candidates?.[0]?.finishMessage || null,
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount || 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount || 0
      }
    }

    // Gemini响应格式处理
    if (response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0]

      // 处理内容
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            transformed.content.push({
              type: 'text',
              text: part.text
            })
          } else if (part.inline_data) {
            // 处理图像响应
            transformed.content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: part.inline_data.mime_type,
                data: part.inline_data.data
              }
            })
          }
        }
      }

      // 处理停止原因
      transformed.stop_reason = this.mapFinishReason(candidate.finishReason)
      transformed.stop_sequence = candidate.finishMessage

      // 处理安全评级
      if (candidate.safetyRatings) {
        // 可以在这里记录安全评级信息
      }
    }

    // 处理使用情况信息
    if (response.usageMetadata) {
      transformed.usage = {
        input_tokens: response.usageMetadata.promptTokenCount || 0,
        output_tokens: response.usageMetadata.candidatesTokenCount || 0
      }
    }

    // Gemini版本信息
    transformed.model = response.modelVersion || 'gemini-1.5-pro'

    return transformed
  }

  /**
   * 转换流式响应数据块
   */
  transformStreamChunk(chunk: string, provider: ApiProvider): string | null {
    try {
      // Gemini的流式响应格式
      if (chunk.includes('"candidates"')) {
        const parsed = JSON.parse(chunk)

        const transformed: any = {
          candidates: []
        }

        if (parsed.candidates && parsed.candidates.length > 0) {
          const candidate = parsed.candidates[0]
          const transformedCandidate: any = {
            content: {
              parts: []
            }
          }

          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              transformedCandidate.content.parts.push(part)
            }
          }

          if (candidate.finishReason) {
            transformedCandidate.finishReason = this.mapFinishReason(candidate.finishReason)
          }

          transformed.candidates.push(transformedCandidate)
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
  transformError(error: any, provider: ApiProvider): any {
    // Gemini错误格式
    if (error.error) {
      const geminiError = error.error

      const transformedError: any = {
        type: 'error',
        error: {
          type: this.errorMapping[geminiError.status] || 'api_error',
          message: geminiError.message || 'Gemini API error'
        }
      }

      // 添加错误详情
      if (geminiError.status) {
        transformedError.error.code = geminiError.status
      }

      if (geminiError.details && geminiError.details.length > 0) {
        transformedError.error.details = geminiError.details
      }

      return transformedError
    }

    // 标准HTTP错误
    if (error.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(error.status),
          message: error.statusText || error.message || 'Gemini API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message || 'Unknown Gemini error'
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