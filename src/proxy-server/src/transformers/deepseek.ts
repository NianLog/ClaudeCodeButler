/**
 * DeepSeek API转换器
 *
 * DeepSeek是中国的AI服务提供商，提供类GPT的对话模型
 * API文档: https://platform.deepseek.com/api-docs/
 *
 * 转换需求：
 * 1. API格式基本兼容OpenAI格式
 * 2. 需要处理DeepSeek特定的模型名称
 * 3. 处理中文支持和特殊字符
 * 4. 错误码映射
 */

import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types'

export class DeepSeekTransformer extends BaseTransformer {
  name = 'deepseek'

  /**
   * 模型名称映射
   * Claude Code中的模型名 -> DeepSeek中的模型名
   */
  private modelMapping: Record<string, string> = {
    // DeepSeek主要使用自己的模型
    'claude-3-5-sonnet-20241022': 'deepseek-chat',
    'claude-3-5-haiku-20241022': 'deepseek-chat',
    'claude-3-opus-20240229': 'deepseek-chat',
    'claude-3-sonnet-20240229': 'deepseek-chat',
    'claude-3-haiku-20240307': 'deepseek-chat',
    'gpt-4': 'deepseek-chat',
    'gpt-4-turbo': 'deepseek-chat',
    'gpt-3.5-turbo': 'deepseek-chat'
    // DeepSeek特定的模型
    // 'deepseek-coder': 'deepseek-coder' // 专门用于代码生成
  }

  /**
   * DeepSeek错误码到Claude错误码的映射
   */
  private errorMapping: Record<string, string> = {
    'invalid_api_key': 'authentication_error',
    'insufficient_quota': 'rate_limit_error',
    'model_not_found': 'invalid_request_error',
    'rate_limit_exceeded': 'rate_limit_error',
    'content_filter': 'content_policy_error',
    'invalid_request': 'invalid_request_error'
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

    // DeepSeek不支持Claude的某些参数，需要移除
    delete transformed.stream // DeepSeek使用不同的流式参数
    delete transformed.temperature // 如果DeepSeek不支持

    // DeepSeek特定的参数调整
    if (transformed.max_tokens && typeof transformed.max_tokens === 'number') {
      // DeepSeek的max_tokens限制可能不同
      transformed.max_tokens = Math.min(transformed.max_tokens, 4096)
    }

    // 处理消息格式
    if (transformed.messages) {
      transformed.messages = transformed.messages.map((msg: any) => {
        const newMsg: any = {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }

        // 处理内容格式
        if (Array.isArray(msg.content)) {
          // 将Claude的多模态内容转换为DeepSeek支持的格式
          const textContent = msg.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('\n')

          newMsg.content = textContent
        }

        return newMsg
      })
    }

    // DeepSeek的流式参数
    if (request.stream) {
      transformed.stream = true
    }

    return transformed
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: any, provider: ApiProvider): Promise<ClaudeResponse> {
    const transformed: ClaudeResponse = {
      id: response.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: response.model || 'deepseek-chat',
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
          // 处理多模态内容（DeepSeek可能不支持）
          transformed.content = message.content.map((item: any) => {
            if (item.type === 'text') {
              return {
                type: 'text',
                text: item.text
              }
            }
            // DeepSeek可能不支持图像，忽略非文本内容
            return null
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

    // 保留DeepSeek特定的元数据
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
      // DeepSeek的SSE格式与OpenAI基本兼容
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

        // 处理usage
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

        // 处理ID和时间戳
        if (parsed.id) transformed.id = parsed.id
        if (parsed.created) transformed.created = parsed.created

        return `data: ${JSON.stringify(transformed)}\n\n`
      }

      return chunk
    } catch (error) {
      console.error('DeepSeek stream chunk transform error:', error)
      return chunk
    }
  }

  /**
   * 转换错误格式
   */
  transformError(error: any, provider: ApiProvider): any {
    // DeepSeek错误格式
    if (error.error) {
      const deepSeekError = error.error

      const transformedError: any = {
        type: 'error',
        error: {
          type: this.errorMapping[deepSeekError.type] || 'api_error',
          message: deepSeekError.message || 'DeepSeek API error'
        }
      }

      // 添加错误详情
      if (deepSeekError.code) {
        transformedError.error.code = deepSeekError.code
      }

      // 添加中文错误信息处理
      if (deepSeekError.message && this.containsChinese(deepSeekError.message)) {
        // 如果错误信息包含中文，保持原文
        transformedError.error.message = deepSeekError.message
      }

      return transformedError
    }

    // 标准HTTP错误
    if (error.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(error.status),
          message: error.statusText || error.message || 'DeepSeek API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: error.message || 'Unknown DeepSeek error'
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
   * 检查字符串是否包含中文字符
   */
  private containsChinese(str: string): boolean {
    return /[\u4e00-\u9fff]/.test(str)
  }

  /**
   * 验证配置
   */
  validateConfig(provider: ApiProvider): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!provider.apiBaseUrl) {
      errors.push('DeepSeek API地址不能为空')
    }

    if (!provider.apiKey) {
      errors.push('DeepSeek API密钥不能为空')
    }

    // 验证API密钥格式（DeepSeek通常以sk开头）
    if (provider.apiKey && !provider.apiKey.startsWith('sk-')) {
      errors.push('DeepSeek API密钥格式不正确，应该以sk-开头')
    }

    // 验证API URL
    if (provider.apiBaseUrl && !provider.apiBaseUrl.includes('deepseek.com')) {
      errors.push('DeepSeek API地址应该包含deepseek.com')
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
      name: 'DeepSeek',
      type: 'deepseek',
      apiBaseUrl: 'https://api.deepseek.com/v1',
      transformer: 'deepseek',
      timeout: 60000,
      maxRetries: 3,
      retryDelay: 1000
    }
  }
}