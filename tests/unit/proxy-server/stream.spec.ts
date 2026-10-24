import { describe, expect, it } from 'vitest'
import { createNativeStream } from '../../../src/proxy-server/src/transformers/stream'
import { fromChatResponse, toChatRequest } from '../../../src/proxy-server/src/transformers/chat-completions'

const frame = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`
const parse = (value: string) => value.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
describe('native protocol semantics', () => {
  it('rejects cache controls that cannot preserve native billing semantics', () => {
    expect(() => toChatRequest({ model: 'fixture', max_tokens: 10, messages: [{ role: 'user', content: [{ type: 'text', text: 'cached', cache_control: { type: 'ephemeral' } }] }] }, 'fixture')).toThrow(/cache_control/)
  })
  it('converts function definitions, calls and results without losing their IDs', () => {
    const result = toChatRequest({ model: 'fixture', max_tokens: 12,
      tools: [{ name: 'lookup', description: 'lookup', input_schema: { type: 'object' } }],
      tool_choice: { type: 'tool', name: 'lookup', disable_parallel_tool_use: true },
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'call-1', name: 'lookup', input: { name: '中文' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call-1', content: [{ type: 'text', text: 'result' }] }, { type: 'text', text: 'continue' }] }]
    }, 'fixture')
    expect(result.tools).toEqual([{ type: 'function', function: { name: 'lookup', description: 'lookup', parameters: { type: 'object' } } }])
    expect(result.tool_choice).toEqual({ type: 'function', function: { name: 'lookup' } })
    expect(result.parallel_tool_calls).toBe(false)
    expect(result.messages).toEqual([{ role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"name":"中文"}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: 'result' }, { role: 'user', content: 'continue' }])
    const response = fromChatResponse({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"name":"中文"}' } }] } }] })
    expect(response).toMatchObject({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'call-1', name: 'lookup', input: { name: '中文' } }] })
  })
  it('keeps one message state across split frames and coalesced CRLF frames', () => {
    const stream = createNativeStream('chat', 'fixture')
    const source = ': keepalive\r\n\r\n' + frame({ id: 'msg-1', model: 'fixture', choices: [{ delta: { content: '中文' }, finish_reason: 'stop' }] }) + frame({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 7 } }) + 'data: [DONE]\r\n\r\n'
    let output = ''
    for (const character of source) output += stream.push(character)
    output += stream.end()
    const events = parse(output)
    expect(events.filter(event => event.type === 'message_start')).toHaveLength(1)
    expect(events.find(event => event.type === 'content_block_delta').delta.text).toBe('中文')
    expect(events.find(event => event.type === 'message_delta').usage).toEqual({ input_tokens: 3, output_tokens: 7 })
    expect(events.at(-1).type).toBe('message_stop')
  })
  it('keeps parallel tool fragments separate and emits valid Anthropic JSON deltas', () => {
    const stream = createNativeStream('chat', 'fixture')
    stream.push(frame({ choices: [{ delta: { tool_calls: [
      { index: 0, id: 'a', function: { name: 'first', arguments: '{"value":' } },
      { index: 1, id: 'b', function: { name: 'second', arguments: '{"name":' } }
    ] } }] }))
    stream.push(frame({ choices: [{ delta: { tool_calls: [
      { index: 1, function: { arguments: '"中文"}' } }, { index: 0, function: { arguments: '2}' } }
    ] }, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n')
    const events = parse(stream.end())
    expect(events.filter(event => event.type === 'content_block_start').map(event => event.content_block)).toEqual([
      { type: 'tool_use', id: 'a', name: 'first', input: {} }, { type: 'tool_use', id: 'b', name: 'second', input: {} }
    ])
    expect(events.filter(event => event.type === 'content_block_delta').map(event => JSON.parse(event.delta.partial_json))).toEqual([{ value: 2 }, { name: '中文' }])
  })
  it('does not share state between concurrent streams', () => {
    const first = createNativeStream('chat', 'a')
    const second = createNativeStream('chat', 'b')
    first.push(frame({ choices: [{ delta: { content: 'a' }, finish_reason: 'stop' }] }))
    const result = second.push(frame({ choices: [{ delta: { content: 'b' }, finish_reason: 'length' }] }) + 'data: [DONE]\n\n') + second.end()
    expect(result).not.toContain('"text":"a"')
    expect(result).toContain('"stop_reason":"max_tokens"')
    first.push('data: [DONE]\n\n')
    expect(first.end()).toContain('"stop_reason":"end_turn"')
  })
  it.each(['data: {invalid\n\n', 'data: {"error":{"message":"failure"}}\n\n', frame({ choices: [{ delta: {}, finish_reason: 'content_filter' }] })])('fails visibly on malformed/error streams', source => {
    expect(() => createNativeStream('chat', 'fixture').push(source)).toThrow()
  })
  it('rejects partial or unfinished streams and oversize frames', () => {
    const stream = createNativeStream('chat', 'fixture')
    stream.push(frame({ choices: [{ delta: { content: 'partial' } }] }))
    expect(() => stream.end()).toThrow(/中断/)
    expect(() => createNativeStream('chat', 'fixture').push('data: ' + '中'.repeat(350000))).toThrow(/1 MiB/)
  })
  it('converts Gemini SSE and rejects unsupported function-call parts', () => {
    const stream = createNativeStream('gemini', 'gemini-fixture')
    const result = stream.push(frame({ modelVersion: 'gemini-fixture', candidates: [{ content: { parts: [{ text: '你好' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 } })) + stream.end()
    expect(result).toContain('"text":"你好"')
    expect(result).toContain('"stop_reason":"end_turn"')
    expect(() => createNativeStream('gemini', 'gemini-fixture').push(frame({ candidates: [{ content: { parts: [{ functionCall: { name: 'unsupported' } }] } }] }))).toThrow(/普通文本/)
  })
})
