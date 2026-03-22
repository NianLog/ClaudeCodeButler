/**
 * 日志行解码工具
 * @description 优先按 UTF-8 解码，同时兼容 Windows 传统代码页输出，避免子进程日志出现乱码。
 */

/**
 * UTF-8 行解码器
 * @description 解决多字节字符被分片截断、单行日志跨 chunk 被拆开，以及少量 Windows 旧代码页输出被误按 UTF-8 解析的问题。
 */
export class Utf8LineDecoder {
  private remainder: Buffer = Buffer.alloc(0)
  private utf8Decoder: TextDecoder = new TextDecoder('utf-8', { fatal: false })
  private legacyDecoder: TextDecoder | null = this.createLegacyDecoder()

  /**
   * 写入新的数据分片
   * @param chunk 原始 Buffer 或已经解码的字符串
   * @returns 当前已完整拼接好的日志行
   */
  write(chunk: Buffer | string): string[] {
    const chunkBuffer = typeof chunk === 'string'
      ? Buffer.from(chunk, 'utf8')
      : chunk

    return this.consume(chunkBuffer, false)
  }

  /**
   * 结束当前解码会话并刷新剩余缓冲
   * @returns 刷新后剩余的完整日志行
   */
  end(): string[] {
    return this.consume(Buffer.alloc(0), true)
  }

  /**
   * 重置解码器状态
   * @description 在复用同一个实例处理新的进程流前调用，避免旧缓冲串入新会话
   */
  reset(): void {
    this.remainder = Buffer.alloc(0)
    this.utf8Decoder = new TextDecoder('utf-8', { fatal: false })
    this.legacyDecoder = this.createLegacyDecoder()
  }

  /**
   * 创建 Windows 兼容解码器
   * @returns 支持旧代码页的解码器；若当前运行时不支持则返回 null
   */
  private createLegacyDecoder(): TextDecoder | null {
    if (process.platform !== 'win32') {
      return null
    }

    try {
      return new TextDecoder('gb18030', { fatal: false })
    } catch {
      return null
    }
  }

  /**
   * 消费原始字节并按换行切分
   * @param chunkBuffer 本次收到的字节数据
   * @param flush 是否在结束时强制输出剩余半行
   * @returns 当前形成的完整日志行
   */
  private consume(chunkBuffer: Buffer, flush: boolean): string[] {
    const combined = this.remainder.length > 0
      ? Buffer.concat([this.remainder, chunkBuffer])
      : chunkBuffer
    const lines: string[] = []
    let startIndex = 0

    for (let index = 0; index < combined.length; index += 1) {
      if (combined[index] !== 0x0a) {
        continue
      }

      const lineBuffer = combined.subarray(startIndex, index)
      lines.push(this.decodeLine(this.trimCarriageReturn(lineBuffer)))
      startIndex = index + 1
    }

    this.remainder = combined.subarray(startIndex)

    if (flush && this.remainder.length > 0) {
      lines.push(this.decodeLine(this.trimCarriageReturn(this.remainder)))
      this.remainder = Buffer.alloc(0)
    }

    return lines
  }

  /**
   * 解码单行 Buffer
   * @param lineBuffer 单行日志的原始字节
   * @returns 优先 UTF-8、必要时回退旧代码页后的字符串
   */
  private decodeLine(lineBuffer: Buffer): string {
    const utf8Text = this.utf8Decoder.decode(lineBuffer)
    if (!this.legacyDecoder) {
      return utf8Text
    }

    const utf8Badness = this.countReplacementCharacters(utf8Text)
    if (utf8Badness === 0) {
      return utf8Text
    }

    const legacyText = this.legacyDecoder.decode(lineBuffer)
    const legacyBadness = this.countReplacementCharacters(legacyText)

    return legacyBadness < utf8Badness ? legacyText : utf8Text
  }

  /**
   * 统计解码结果中的替换字符数量
   * @param text 已解码文本
   * @returns U+FFFD 出现次数
   */
  private countReplacementCharacters(text: string): number {
    return (text.match(/\uFFFD/g) || []).length
  }

  /**
   * 去掉 Windows 风格日志尾部的回车符
   * @param lineBuffer 原始日志行
   * @returns 去掉尾部回车后的 Buffer
   */
  private trimCarriageReturn(lineBuffer: Buffer): Buffer {
    if (lineBuffer.length === 0) {
      return lineBuffer
    }

    return lineBuffer[lineBuffer.length - 1] === 0x0d
      ? lineBuffer.subarray(0, lineBuffer.length - 1)
      : lineBuffer
  }
}
