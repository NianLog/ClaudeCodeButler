/**
 * OpenRouter API转换器
 *
 * OpenRouter是聚合多个AI服务的平台，支持Claude、GPT等模型
 * API文档: https://openrouter.ai/docs
 *
 * 转换需求：
 * 1. API格式基本兼容OpenAI/Claude格式
 * 2. 需要处理不同的模型名称映射
 * 3. 处理OpenRouter特定的响应头信息
 * 4. 错误码映射
 */

import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types'

export class OpenRouterTransformer extends BaseTransformer {
  name = 'openrouter'

  /**
   * 模型名称映射
   * Claude Code中的模型名 -> OpenRouter中的模型名
   */
  private modelMapping: Record<string, string> = {
    'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
    'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
    'claude-3-opus-20240229': 'anthropic/claude-3-opus',
    'claude-3-sonnet-20240229': 'anthropic/claude-3-sonnet',
    'claude-3-haiku-20240307': 'anthropic/claude-3-haiku'
  }

  /**
   * OpenRouter错误码到Claude错误码的映射
   */
  private errorMapping: Record<string, string> = {
    'invalid_api_key': 'authentication_error',
    'insufficient_credits': 'rate_limit_error',
    'model_not_found': 'invalid_request_error',
    'rate_limit_exceeded': 'rate_limit_error',
    'content_policy_violation': 'content_policy_error'
  }

  /**
   * 转换请求格式
   */
  async transformRequest(request: ClaudeRequest, provider: ApiProvider): Promise<any> {
    const transformed = this.clone(request)

    // 映射模型名称
    if (this.modelMapping[request.model]) {
      transformed.model = this.modelMapping[request.model]
    }

    // 添加OpenRouter特定的请求头（这些通常由HTTP客户端处理）
    // 这里保留文档说明，实际请求头在代理服务器中添加
    const openRouterHeaders = {
      'HTTP-Referer': 'https://claudecodebutler.com', // 可选：告诉OpenRouter您的应用
      'X-Title': 'Claude Code Butler' // 可选：设置应用名称
    }

    // OpenRouter支持stream参数，与Claude兼容
    // 不需要额外转换

    // OpenRouter的max_tokens处理
    if (transformed.max_tokens && typeof transformed.max_tokens === 'number') {
      // OpenRouter的max_tokens应该是正数
      transformed.max_tokens = Math.max(1, transformed.max_tokens)
    }

    return transformed
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: any, provider: ApiProvider): Promise<ClaudeResponse> {
    // OpenRouter响应格式基本与OpenAI兼容
    const transformed: ClaudeResponse = {
      id: response.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: response.model || 'openrouter-default',
      stop_reason: this.mapStopReason(response.choices?.[0]?.finish_reason),
      stop_sequence: response.choices?.[0]?.stop_sequence || null,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0
      }
    }

    // 处理内容
    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0]
      const message = choice.message || {}

      // 确保role总是'assistant'
      transformed.role = 'assistant'

      // 处理内容
      if (message.content) {
        if (typeof message.content === 'string') {
          transformed.content = [{
            type: 'text',
            text: message.content
          }]
        } else if (Array.isArray(message.content)) {
          // 处理多模态内容
          transformed.content = message.content.map((item: any) => {
            if (item.type === 'text') {
              return {
                type: 'text',
                text: item.text
              }
            } else if (item.type === 'image_url') {
              return {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: item.image_url?.url?.startsWith('data:') ?
                    item.image_url.url.split(':')[1].split(';')[0] : 'image/jpeg',
                  data: item.image_url?.url?.split(',')[1] || ''
                }
              }
            }
            return item
          }).filter(Boolean)
        }
      }

      // 设置停止原因
      transformed.stop_reason = this.mapStopReason(choice.finish_reason)
      transformed.stop_sequence = choice.stop_sequence
    }

    // 处理使用情况信息
    if (response.usage) {
      transformed.usage = {
        input_tokens: response.usage.prompt_tokens || 0,
        output_tokens: response.usage.completion_tokens || 0
      }
    }

    // 保留OpenRouter特定的元数据
    if (response.model) {
      transformed.model = response.model
    }

    return transformed
  }

  /**
   * 转换流式响应数据块
   */
  transformStreamChunk(chunk: string, provider: ApiProvider): string | null {
    try {
      // OpenRouter的SSE格式与OpenAI基本兼容
      if (chunk.startsWith('data: ')) {
        const data = chunk.slice(6)

        if (data === '[DONE]') {
          return 'data: [DONE]\n\n'
        }

        const parsed = JSON.parse(data)
        const transformed: any = {}

        // 处理choices
        if (parsed.choices && parsed.choices.length > 0) {
          const choice = parsed.choices[0]
          transformed.choices = [{
            index: choice.index,
            delta: choice.delta || {},
            finish_reason: this.mapStopReason(choice.finish_reason)
          }]
        }

        // 处理usage（通常在最后一个chunk中）
        if (parsed.usage) {
          transformed.usage = {
            prompt_tokens: parsed.usage.prompt_tokens,
            completion_tokens: parsed.usage.completion_tokens,
            total_tokens: parsed.usage.total_tokens
          }
        }

        // 处理模型信息
        if (parsed.model) {
          transformed.model = parsed.model
        }

        // 处理OpenRouter特定的元数据
        if (parsed.id) transformed.id = parsed.id
        if (parsed.created) transformed.created = parsed.created

        return `data: ${JSON.stringify(transformed)}\n\n`
      }

      return chunk
    } catch (error) {
      console.error('OpenRouter stream chunk transform error:', error)
      return chunk
    }
  }

  /**
   * 转换错误格式
   */
  transformError(error: any, provider: ApiProvider): any {
    // OpenRouter错误格式
    if (error.error) {
      const openRouterError = error.error

      const transformedError: any = {
        type: 'error',
        error: {
          type: this.errorMapping[openRouterError.type] || 'api_error',
          message: openRouterError.message || 'OpenRouter API error'
        }
      }

      // 添加错误详情
      if (openRouterError.code) {
        transformedError.error.code = openRouterError.code
      }

      // 添加使用限制信息
      if (openRouterError.ratelimit) {
        transformedError.error.ratelimit = openRouterError.ratelimit
      }

      return transformedError
    }

    // 标准HTTP错误
    if (error.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(error.status),
          message: error.statusText || error.message || 'OpenRouter API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message || 'Unknown OpenRouter error'
      }
    }
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(finishReason?: string): string | null {
    const mapping: Record<string, string> = {
      'stop': 'end_turn',
      'length': 'max_tokens',
      'content_filter': 'stop_sequence',
      'tool_calls': 'tool_use',
      'function_call': 'tool_use'
    }

    return mapping[finishReason || ''] || null
  }

  /**
   * 映射HTTP错误码到Claude错误类型
   */
  private mapHttpError(status: number): string {
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
      errors.push('OpenRouter API地址不能为空')
    }

    if (!provider.apiKey) {
      errors.push('OpenRouter API密钥不能为空')
    }

    // 验证API密钥格式（OpenRouter通常以sk-or开头）
    if (provider.apiKey && !provider.apiKey.startsWith('sk-or')) {
      errors.push('OpenRouter API密钥格式不正确，应该以sk-or开头')
    }

    // 验证API URL
    if (provider.apiBaseUrl && !provider.apiBaseUrl.includes('openrouter.ai')) {
      errors.push('OpenRouter API地址应该包含openrouter.ai')
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
      name: 'OpenRouter',
      type: 'openrouter',
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      transformer: 'openrouter',
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 1000
    }
  }
}