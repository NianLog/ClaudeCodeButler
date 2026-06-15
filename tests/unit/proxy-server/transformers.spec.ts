/**
 * 托管模式代理服务 - API 转换器单元测试
 * @description 覆盖 Anthropic / OpenRouter / DeepSeek / Gemini 四种 provider 转换器，
 *              以及转换器工厂的路由逻辑。转换器负责 Claude API 格式与各上游 provider
 *              格式之间的双向转换，是托管模式数据链路的核心，且涉及 API 密钥与请求体
 *              透传，属于高安全敏感模块，需重点回归保护。
 *
 * 覆盖维度：
 *  - 模型名称映射（Claude 模型名 → 各 provider 模型名）
 *  - 请求/响应格式转换（消息结构、usage、stop_reason）
 *  - 流式响应块转换（SSE [DONE] 与正常 data 帧）
 *  - 错误码映射（provider 错误 → Claude 错误类型）
 *  - 配置校验（API 密钥前缀、URL 域名校验）
 *  - 工厂路由（默认/回退/注册/列举）
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock 代理服务的 logger，避免转换器实例化时触发真实 winston 初始化
vi.mock('../../../src/proxy-server/src/logger', () => ({
  getLogger: () => ({
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

// 各 provider 转换器内部通过相对路径 '../logger.js' 引入 logger，
// 由于解析后指向同一文件，上述 mock 同样生效。

/** 构造一个满足 ApiProvider 接口的最小 provider 配置 */
function buildProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    type: 'custom' as const,
    apiBaseUrl: 'https://example.com/api',
    apiKey: 'sk-test-key',
    models: [],
    enabled: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

describe('AnthropicTransformer（直通模式）', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('transformRequest 应返回请求的深拷贝，修改副本不影响原始请求', async () => {
    const { AnthropicTransformer } = await import('../../../src/proxy-server/src/transformers/anthropic')
    const transformer = new AnthropicTransformer()
    const request = { model: 'claude-3-5-sonnet-20241022', messages: [], max_tokens: 1024 }
    const result = await transformer.transformRequest(request as any, buildProvider() as any)

    // 修改返回的副本，原始对象不应被改动（验证 clone 而非引用透传）
    ;(result as any).model = 'modified'
    expect(request.model).toBe('claude-3-5-sonnet-20241022')
    expect(result.model).toBe('modified')
  })

  it('transformResponse 应原样返回响应', async () => {
    const { AnthropicTransformer } = await import('../../../src/proxy-server/src/transformers/anthropic')
    const transformer = new AnthropicTransformer()
    const response = { id: 'msg_1', model: 'claude-3', content: [] }
    const result = await transformer.transformResponse(response, buildProvider() as any)

    expect(result).toBe(response)
  })

  it('transformStreamChunk 应原样透传数据块', async () => {
    const { AnthropicTransformer } = await import('../../../src/proxy-server/src/transformers/anthropic')
    const transformer = new AnthropicTransformer()
    const chunk = 'data: {"type":"message_start"}\n\n'

    expect(transformer.transformStreamChunk!(chunk, buildProvider() as any)).toBe(chunk)
  })
})

describe('OpenRouterTransformer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('transformRequest 应将 Claude 模型名映射为 OpenRouter 模型名', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()
    const request = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [],
      max_tokens: 1024
    }
    const result = await transformer.transformRequest(request as any, buildProvider() as any)

    expect(result.model).toBe('anthropic/claude-3.5-sonnet')
  })

  it('transformRequest 对未在映射表中的模型应保持原名', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()
    const result = await transformer.transformRequest(
      { model: 'unknown-model', messages: [], max_tokens: 100 } as any,
      buildProvider() as any
    )

    expect(result.model).toBe('unknown-model')
  })

  it('transformRequest 应保证 max_tokens 至少为 1', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()
    const result = await transformer.transformRequest(
      { model: 'x', messages: [], max_tokens: 0 } as any,
      buildProvider() as any
    )

    expect(result.max_tokens).toBe(1)
  })

  it('transformResponse 应将 OpenAI 风格 usage/stop_reason 转换为 Claude 格式', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()
    const openRouterResponse = {
      id: 'or_123',
      model: 'anthropic/claude-3.5-sonnet',
      choices: [
        {
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'hello' }
        }
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    }
    const result = await transformer.transformResponse(openRouterResponse, buildProvider() as any)

    expect(result.id).toBe('or_123')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 20 })
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('transformResponse 应将 length/stop 等多种 finish_reason 正确映射', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()

    const mapFinish = async (finishReason: string) => {
      const r = await transformer.transformResponse(
        { choices: [{ finish_reason: finishReason }] } as any,
        buildProvider() as any
      )
      return r.stop_reason
    }

    expect(await mapFinish('stop')).toBe('end_turn')
    expect(await mapFinish('length')).toBe('max_tokens')
    expect(await mapFinish('tool_calls')).toBe('tool_use')
    expect(await mapFinish('unknown_reason')).toBeNull()
  })

  it('transformStreamChunk 应将 [DONE] 帧规范化为 SSE 结束帧', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()

    expect(transformer.transformStreamChunk!('data: [DONE]', buildProvider() as any)).toBe('data: [DONE]\n\n')
  })

  it('transformStreamChunk 应转换正常 data 帧并保留 usage/model', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()
    const chunk = 'data: ' + JSON.stringify({
      id: 'chatcmpl-1',
      model: 'anthropic/claude-3.5-sonnet',
      created: 1700000000,
      choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }
    })

    const result = transformer.transformStreamChunk!(chunk, buildProvider() as any)
    expect(result).toMatch(/^data: /)
    const payload = JSON.parse(result!.slice(6).trim())
    expect(payload.model).toBe('anthropic/claude-3.5-sonnet')
    expect(payload.usage.total_tokens).toBe(12)
    expect(payload.choices[0].finish_reason).toBe('end_turn')
  })

  it('transformStreamChunk 对非法 JSON 应原样返回（容错降级）', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()

    expect(transformer.transformStreamChunk!('data: {invalid', buildProvider() as any)).toBe('data: {invalid')
  })

  it('validateConfig 应校验 OpenRouter 密钥前缀与 URL 域名', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()

    const valid = transformer.validateConfig(buildProvider({
      apiKey: 'sk-or-xxx', apiBaseUrl: 'https://openrouter.ai/api/v1'
    }) as any)
    expect(valid.valid).toBe(true)

    const invalidKey = transformer.validateConfig(buildProvider({
      apiKey: 'sk-wrong', apiBaseUrl: 'https://openrouter.ai/api/v1'
    }) as any)
    expect(invalidKey.valid).toBe(false)
    expect(invalidKey.errors.join()).toMatch(/sk-or/)
  })

  it('transformError 应将 provider 错误类型映射为 Claude 错误类型', async () => {
    const { OpenRouterTransformer } = await import('../../../src/proxy-server/src/transformers/openrouter')
    const transformer = new OpenRouterTransformer()

    const result = transformer.transformError(
      { error: { type: 'invalid_api_key', message: 'bad key' } },
      buildProvider() as any
    )
    expect(result.error.type).toBe('authentication_error')

    const httpResult = transformer.transformError({ status: 429, statusText: 'Too Many Requests' }, buildProvider() as any)
    expect(httpResult.error.type).toBe('rate_limit_error')
  })
})

describe('DeepSeekTransformer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('transformRequest 应将 Claude 模型映射为 deepseek-chat', async () => {
    const { DeepSeekTransformer } = await import('../../../src/proxy-server/src/transformers/deepseek')
    const transformer = new DeepSeekTransformer()
    const result = await transformer.transformRequest(
      { model: 'claude-3-opus-20240229', messages: [], max_tokens: 100 } as any,
      buildProvider() as any
    )

    expect(result.model).toBe('deepseek-chat')
  })

  it('transformRequest 应将 max_tokens 截断到 4096 上限', async () => {
    const { DeepSeekTransformer } = await import('../../../src/proxy-server/src/transformers/deepseek')
    const transformer = new DeepSeekTransformer()
    const result = await transformer.transformRequest(
      { model: 'x', messages: [], max_tokens: 99999 } as any,
      buildProvider() as any
    )

    expect(result.max_tokens).toBe(4096)
  })

  it('transformRequest 应将多模态消息内容降级为纯文本拼接', async () => {
    const { DeepSeekTransformer } = await import('../../../src/proxy-server/src/transformers/deepseek')
    const transformer = new DeepSeekTransformer()
    const result = await transformer.transformRequest(
      {
        model: 'x',
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '第一段' },
              { type: 'text', text: '第二段' },
              { type: 'image', source: { data: 'ignored' } }
            ]
          }
        ]
      } as any,
      buildProvider() as any
    )

    // 仅保留文本部分并用换行连接，图像内容被丢弃
    expect(result.messages[0].content).toBe('第一段\n第二段')
  })

  it('transformResponse 应将字符串内容包装为 Claude 文本块', async () => {
    const { DeepSeekTransformer } = await import('../../../src/proxy-server/src/transformers/deepseek')
    const transformer = new DeepSeekTransformer()
    const result = await transformer.transformResponse(
      {
        id: 'ds_1',
        model: 'deepseek-chat',
        choices: [{ finish_reason: 'stop', message: { content: '你好' } }],
        usage: { prompt_tokens: 3, completion_tokens: 5 }
      },
      buildProvider() as any
    )

    expect(result.content).toEqual([{ type: 'text', text: '你好' }])
    expect(result.usage).toEqual({ input_tokens: 3, output_tokens: 5 })
  })

  it('validateConfig 应校验 DeepSeek 密钥以 sk- 开头', async () => {
    const { DeepSeekTransformer } = await import('../../../src/proxy-server/src/transformers/deepseek')
    const transformer = new DeepSeekTransformer()

    expect(
      transformer.validateConfig(buildProvider({
        apiKey: 'sk-deepseek-xxx', apiBaseUrl: 'https://api.deepseek.com/v1'
      }) as any).valid
    ).toBe(true)

    expect(
      transformer.validateConfig(buildProvider({
        apiKey: 'wrong-key', apiBaseUrl: 'https://api.deepseek.com/v1'
      }) as any).valid
    ).toBe(false)
  })
})

describe('GeminiTransformer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('transformRequest 应将 messages 转换为 contents，并把 assistant 角色映射为 model', async () => {
    const { GeminiTransformer } = await import('../../../src/proxy-server/src/transformers/gemini')
    const transformer = new GeminiTransformer()
    const result = await transformer.transformRequest(
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '您好' }
        ]
      } as any,
      buildProvider() as any
    )

    // Gemini 用 contents 结构，角色映射 user→user, assistant→model
    expect(result.contents).toHaveLength(2)
    expect(result.contents[0].role).toBe('user')
    expect(result.contents[1].role).toBe('model')
    expect(result.contents[0].parts).toEqual([{ text: '你好' }])
  })

  it('transformRequest 应将 max_tokens/temperature/top_p 转入 generationConfig', async () => {
    const { GeminiTransformer } = await import('../../../src/proxy-server/src/transformers/gemini')
    const transformer = new GeminiTransformer()
    const result = await transformer.transformRequest(
      {
        model: 'x',
        max_tokens: 256,
        temperature: 0.7,
        top_p: 0.9,
        messages: []
      } as any,
      buildProvider() as any
    )

    expect(result.generationConfig.maxOutputTokens).toBe(256)
    expect(result.generationConfig.temperature).toBe(0.7)
    expect(result.generationConfig.topP).toBe(0.9)
  })

  it('transformRequest 对未知模型应回退到默认 gemini-1.5-pro', async () => {
    const { GeminiTransformer } = await import('../../../src/proxy-server/src/transformers/gemini')
    const transformer = new GeminiTransformer()
    const result = await transformer.transformRequest(
      { model: 'totally-unknown', messages: [] } as any,
      buildProvider() as any
    )

    expect(result.model).toBe('gemini-1.5-pro')
  })

  it('transformRequest 应携带 4 项 BLOCK_NONE 安全设置与系统指令', async () => {
    const { GeminiTransformer } = await import('../../../src/proxy-server/src/transformers/gemini')
    const transformer = new GeminiTransformer()
    const result = await transformer.transformRequest(
      { model: 'x', messages: [], system: '你是助手' } as any,
      buildProvider() as any
    )

    expect(result.safetySettings).toHaveLength(4)
    expect(result.safetySettings.every((s: any) => s.threshold === 'BLOCK_NONE')).toBe(true)
    expect(result.systemInstruction).toBe('你是助手')
  })

  it('transformResponse 应将 candidates 内容与 usageMetadata 转换为 Claude 格式', async () => {
    const { GeminiTransformer } = await import('../../../src/proxy-server/src/transformers/gemini')
    const transformer = new GeminiTransformer()
    const result = await transformer.transformResponse(
      {
        modelVersion: 'gemini-1.5-pro',
        candidates: [
          {
            finishReason: 'FINISH_REASON_STOP',
            content: { parts: [{ text: '回复' }] }
          }
        ],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 12 }
      },
      buildProvider() as any
    )

    expect(result.model).toBe('gemini-1.5-pro')
    expect(result.stop_reason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: '回复' }])
    expect(result.usage).toEqual({ input_tokens: 8, output_tokens: 12 })
  })
})

describe('转换器工厂（getTransformer / registerTransformer）', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getTransformer 无参时应返回默认的 anthropic 转换器', async () => {
    const { getTransformer } = await import('../../../src/proxy-server/src/transformers')
    const transformer = getTransformer()

    expect(transformer.name).toBe('anthropic')
  })

  it('getTransformer 应按名称返回对应转换器', async () => {
    const { getTransformer } = await import('../../../src/proxy-server/src/transformers')
    expect(getTransformer('gemini').name).toBe('gemini')
    expect(getTransformer('openrouter').name).toBe('openrouter')
    expect(getTransformer('deepseek').name).toBe('deepseek')
  })

  it('getTransformer 对未知名称应回退到 anthropic（保证链路不中断）', async () => {
    const { getTransformer } = await import('../../../src/proxy-server/src/transformers')
    const transformer = getTransformer('non-exist')

    expect(transformer.name).toBe('anthropic')
  })

  it('getTransformerNames 应返回全部内置转换器名称', async () => {
    const { getTransformerNames } = await import('../../../src/proxy-server/src/transformers')
    const names = getTransformerNames()

    expect(names).toEqual(expect.arrayContaining(['anthropic', 'openrouter', 'deepseek', 'gemini']))
    expect(names).toHaveLength(4)
  })

  it('registerTransformer 应注册自定义转换器并可被获取', async () => {
    const { registerTransformer, getTransformer } = await import('../../../src/proxy-server/src/transformers')
    const customTransformer = {
      name: 'custom-test',
      transformRequest: vi.fn(),
      transformResponse: vi.fn()
    }

    registerTransformer('custom-test', customTransformer as any)
    expect(getTransformer('custom-test')).toBe(customTransformer)
  })
})
