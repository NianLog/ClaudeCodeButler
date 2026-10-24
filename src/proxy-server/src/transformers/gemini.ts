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

import { toGeminiRequest, fromGeminiResponse } from './gemini-content.js'
import { createNativeStream } from './stream.js'
import { BaseTransformer } from './base.js'
import type { ApiProvider, ClaudeRequest, ClaudeResponse } from '../types.js'

export class GeminiTransformer extends BaseTransformer {
  name = 'gemini'

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
  async transformRequest(request: ClaudeRequest, provider: ApiProvider): Promise<unknown> {
    return toGeminiRequest(request, provider)
  }

  /**
   * 转换响应格式
   */
  async transformResponse(response: unknown, _provider: ApiProvider): Promise<ClaudeResponse> {
    return fromGeminiResponse(response)
  }

  /**
   * 转换流式响应数据块
   */
  createStreamTransformer(model: string) {
    return createNativeStream('gemini', model)
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