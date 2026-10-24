import type { ApiProvider, ClaudeRequest } from './types.js'

export function upstreamTransport(provider: ApiProvider, protocol: string, request: ClaudeRequest, model: unknown): { url: string; headers: Record<string, string> } {
  const url = new URL(provider.apiBaseUrl)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('服务商地址必须是无凭据、查询参数和 fragment 的 HTTP(S) 基础地址')
  }
  const base = url.pathname.replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (protocol === 'anthropic') {
    url.pathname = base.endsWith('/v1/messages') ? base : `${base}${base.endsWith('/v1') ? '/messages' : '/v1/messages'}`
    headers['x-api-key'] = provider.apiKey
  } else if (protocol === 'deepseek' || protocol === 'openrouter') {
    url.pathname = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
    headers.Authorization = `Bearer ${provider.apiKey}`
  } else if (protocol === 'gemini') {
    if (typeof model !== 'string' || !/^gemini-[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Gemini 模型 ID 无效')
    const versionedBase = base || '/v1beta'
    url.pathname = `${versionedBase}/models/${model}:${request.stream ? 'streamGenerateContent' : 'generateContent'}`
    if (request.stream) url.searchParams.set('alt', 'sse')
    headers['x-goog-api-key'] = provider.apiKey
  } else {
    throw new Error(`独立代理不支持传输协议: ${protocol}`)
  }
  return { url: url.toString(), headers }
}
