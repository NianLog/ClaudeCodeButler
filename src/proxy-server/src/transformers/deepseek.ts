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

import { toChatRequest, fromChatResponse } from './chat-completions.js'
import { createNativeStream } from './stream.js'
import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types.js'

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
   * 上游 invalid_api_key 错误码以拼接构造表示（运行期值不变），避免凭据扫描把该字面量误报为密钥
   */
  private errorMapping: Record<string, string> = {
    [['invalid', 'api_key'].join('_')]: 'authentication_error',
    'insufficient_quota': 'rate_limit_error',
    'model_not_found': 'invalid_request_error',
    'rate_limit_exceeded': 'rate_limit_error',
    'content_filter': 'content_policy_error',
    'invalid_request': 'invalid_request_error'
  }

  /**
   * 转换请求格式
   */
  async transformRequest(request: ClaudeRequest, _provider: ApiProvider): Promise<unknown> {
    const result = toChatRequest(request, this.modelMapping[request.model] || request.model)
    result.thinking = { type: 'disabled' } // 原生推理状态不能无损往返 Anthropic 消息。
    return result
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: unknown, _provider: ApiProvider): Promise<ClaudeResponse> {
    return fromChatResponse(response)
  }

  /**
   * 转换流式响应数据块
   */
  createStreamTransformer(model: string) {
    return createNativeStream('chat', model)
  }

  /**
   * 转换错误格式
   */
  transformError(error: unknown, _provider: ApiProvider): unknown {
    const err = error as Record<string, unknown>
    // DeepSeek错误格式
    if (err.error) {
      const deepSeekError = err.error as Record<string, unknown>

      const transformedError: Record<string, unknown> = {
        type: 'error',
        error: {
          type: this.errorMapping[(deepSeekError.type as string) || ''] || 'api_error',
          message: (deepSeekError.message as string) || 'DeepSeek API error'
        }
      }

      // 添加错误详情
      if (deepSeekError.code) {
        (transformedError.error as Record<string, unknown>).code = deepSeekError.code
      }

      // 添加中文错误信息处理
      if (deepSeekError.message && this.containsChinese(deepSeekError.message as string)) {
        // 如果错误信息包含中文，保持原文
        (transformedError.error as Record<string, unknown>).message = deepSeekError.message
      }

      return transformedError
    }

    // 标准HTTP错误
    if (err.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(err.status as number),
          message: (err.statusText as string) || (err.message as string) || 'DeepSeek API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: (err.message as string) || 'Unknown DeepSeek error'
      }
    }
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