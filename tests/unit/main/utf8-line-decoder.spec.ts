/**
 * UTF-8 行解码器单元测试
 * @description 覆盖多字节字符跨 chunk 和单行日志跨 chunk 的解码场景，防止托管模式日志再次出现乱码
 */

import { describe, expect, it } from 'vitest'
import { Utf8LineDecoder } from '../../../src/main/utils/utf8-line-decoder'

describe('Utf8LineDecoder', () => {
  /**
   * 验证跨 chunk 的多字节 UTF-8 字符不会被破坏
   */
  it('should preserve multibyte characters across chunk boundaries', () => {
    const decoder = new Utf8LineDecoder()
    const payload = Buffer.from('代理服务已就绪\n', 'utf8')

    const firstChunk = payload.subarray(0, 5)
    const secondChunk = payload.subarray(5)

    expect(decoder.write(firstChunk)).toEqual([])
    expect(decoder.write(secondChunk)).toEqual(['代理服务已就绪'])
    expect(decoder.end()).toEqual([])
  })

  /**
   * 验证跨 chunk 的半行内容会等到换行或流结束后再输出
   */
  it('should buffer partial lines until newline or stream end', () => {
    const decoder = new Utf8LineDecoder()

    expect(decoder.write(Buffer.from('first lin', 'utf8'))).toEqual([])
    expect(decoder.write(Buffer.from('e\nsecond\nthird', 'utf8'))).toEqual(['first line', 'second'])
    expect(decoder.end()).toEqual(['third'])
  })
})
