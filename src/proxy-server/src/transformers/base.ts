/**
 * CCB托管模式代理服务 - 转换器基类
 * @description 定义转换器的基本接口和实现
 */

import type { Transformer, ClaudeRequest, ClaudeResponse, ApiProvider } from '../types.js'
import { getLogger } from '../logger.js'

/**
 * 转换器基类
 * @description 提供转换器的默认实现和通用方法
 */
export abstract class BaseTransformer implements Transformer {
  abstract name: string

  protected logger = getLogger()

  /**
   * 转换请求
   * @param request Claude API请求
   * @param provider API服务商配置
   * @returns 转换后的请求
   */
  abstract transformRequest(request: ClaudeRequest, provider: ApiProvider): Promise<any>

  /**
   * 转换响应
   * @param response API服务商响应
   * @param provider API服务商配置
   * @returns 转换后的Claude API响应
   */
  abstract transformResponse(response: any, provider: ApiProvider): Promise<ClaudeResponse>

  /**
   * 转换流式响应块
   * @param chunk 原始数据块
   * @param provider API服务商配置
   * @returns 转换后的数据块,如果返回null则跳过此块
   */
  transformStreamChunk?(chunk: string, provider: ApiProvider): string | null

  /**
   * 复制对象(深拷贝)
   * @param obj 要复制的对象
   * @returns 复制后的对象
   */
  protected clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }

  /**
   * 日志记录
   * @param level 日志级别
   * @param message 日志消息
   * @param meta 附加元数据
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: any): void {
    this.logger.log(level, `[${this.name}] ${message}`, meta)
  }
}
