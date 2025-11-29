/**
 * CCB托管模式代理服务 - 转换器工厂
 * @description 负责创建和管理转换器实例
 */

import type { Transformer } from '../types.js'
import { AnthropicTransformer } from './anthropic.js'
import { OpenRouterTransformer } from './openrouter.js'
import { DeepSeekTransformer } from './deepseek.js'
import { GeminiTransformer } from './gemini.js'

/**
 * 转换器注册表
 */
const transformerRegistry = new Map<string, Transformer>()

/**
 * 注册内置转换器
 */
function registerBuiltinTransformers(): void {
  transformerRegistry.set('anthropic', new AnthropicTransformer())
  transformerRegistry.set('openrouter', new OpenRouterTransformer())
  transformerRegistry.set('deepseek', new DeepSeekTransformer())
  transformerRegistry.set('gemini', new GeminiTransformer())
}

// 初始化时注册内置转换器
registerBuiltinTransformers()

/**
 * 获取转换器
 * @param name 转换器名称
 * @returns 转换器实例,如果不存在则返回Anthropic转换器(默认)
 */
export function getTransformer(name?: string): Transformer {
  if (!name) {
    return transformerRegistry.get('anthropic')!
  }

  const transformer = transformerRegistry.get(name)
  if (!transformer) {
    console.warn(`转换器 "${name}" 不存在,使用默认转换器(anthropic)`)
    return transformerRegistry.get('anthropic')!
  }

  return transformer
}

/**
 * 注册自定义转换器
 * @param name 转换器名称
 * @param transformer 转换器实例
 */
export function registerTransformer(name: string, transformer: Transformer): void {
  if (transformerRegistry.has(name)) {
    console.warn(`转换器 "${name}" 已存在,将被覆盖`)
  }
  transformerRegistry.set(name, transformer)
}

/**
 * 获取所有已注册的转换器名称
 * @returns 转换器名称列表
 */
export function getTransformerNames(): string[] {
  return Array.from(transformerRegistry.keys())
}
