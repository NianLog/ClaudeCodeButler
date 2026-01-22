/**
 * CCB托管模式代理服务 - Anthropic转换器
 * @description 处理Anthropic Official API的请求和响应(直通模式)
 */

import { BaseTransformer } from './base.js'
import type { ClaudeRequest, ClaudeResponse, ApiProvider } from '../types.js'

/**
 * Anthropic转换器
 * @description 直通模式,不进行任何转换
 */
export class AnthropicTransformer extends BaseTransformer {
  name = 'anthropic'

  /**
   * 转换请求(直通)
   * @param request Claude API请求
   * @param provider API服务商配置
   * @returns 原始请求
   */
  async transformRequest(request: ClaudeRequest, _provider: ApiProvider): Promise<any> {
    this.log('debug', '请求直通,无需转换', { model: request.model })
    return this.clone(request)
  }

  /**
   * 转换响应(直通)
   * @param response API服务商响应
   * @param provider API服务商配置
   * @returns 原始响应
   */
  async transformResponse(response: any, _provider: ApiProvider): Promise<ClaudeResponse> {
    this.log('debug', '响应直通,无需转换', {
      responseId: response.id,
      model: response.model
    })
    return response as ClaudeResponse
  }

  /**
   * 转换流式响应块(直通)
   * @param chunk 原始数据块
   * @param provider API服务商配置
   * @returns 原始数据块
   */
  transformStreamChunk(chunk: string, _provider: ApiProvider): string | null {
    // 流式响应直接透传
    return chunk
  }
}
