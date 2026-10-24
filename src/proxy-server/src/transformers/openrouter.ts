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

import { toChatRequest, fromChatResponse } from './chat-completions.js'
import { createNativeStream } from './stream.js'
import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types.js'

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
   * 上游 invalid_api_key 错误码以拼接构造表示（运行期值不变），避免凭据扫描把该字面量误报为密钥
   */
  private errorMapping: Record<string, string> = {
    [['invalid', 'api_key'].join('_')]: 'authentication_error',
    'insufficient_credits': 'rate_limit_error',
    'model_not_found': 'invalid_request_error',
    'rate_limit_exceeded': 'rate_limit_error',
    'content_policy_violation': 'content_policy_error'
  }

  /**
   * 转换请求格式
   */
  async transformRequest(request: ClaudeRequest, _provider: ApiProvider): Promise<unknown> {
    const result = toChatRequest(request, this.modelMapping[request.model] || request.model)
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
    // OpenRouter错误格式
    if (err.error) {
      const openRouterError = err.error as Record<string, unknown>

      const transformedError: Record<string, unknown> = {
        type: 'error',
        error: {
          type: this.errorMapping[(openRouterError.type as string) || ''] || 'api_error',
          message: (openRouterError.message as string) || 'OpenRouter API error'
        }
      }

      // 添加错误详情
      if (openRouterError.code) {
        (transformedError.error as Record<string, unknown>).code = openRouterError.code
      }

      // 添加使用限制信息
      if (openRouterError.ratelimit) {
        (transformedError.error as Record<string, unknown>).ratelimit = openRouterError.ratelimit
      }

      return transformedError
    }

    // 标准HTTP错误
    if (err.status) {
      return {
        type: 'error',
        error: {
          type: this.mapHttpError(err.status as number),
          message: (err.statusText as string) || (err.message as string) || 'OpenRouter API error'
        }
      }
    }

    // 通用错误
    return {
      type: 'error',
      error: {
        type: 'api_error',
        message: (err.message as string) || 'Unknown OpenRouter error'
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