/**
 * command-executor 单元测试
 * @description 验证参数化命令执行与 shell 元字符注入防护。
 *              覆盖 P1.1/P1.2 安全修复：rule-engine / environment-check 的自定义命令
 *              改用本执行器后，任意 shell 执行（RCE）入口被关闭。
 */

import { describe, expect, it, vi } from 'vitest'

// Mock logger，避免加载真实 logger 引入 electron 依赖
vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
  }
}))

import { parseCommand, executeCommand } from '../../../src/main/utils/command-executor'

describe('parseCommand（命令解析与注入防护）', () => {
  it('应正确分词简单命令', () => {
    expect(parseCommand('node --version')).toEqual(['node', '--version'])
  })

  it('应保留引号内含空格的参数', () => {
    expect(parseCommand('echo "hello world"')).toEqual(['echo', 'hello world'])
    expect(parseCommand("echo 'a b c'")).toEqual(['echo', 'a b c'])
  })

  it('应拒绝空命令', () => {
    expect(() => parseCommand('')).toThrow('不能为空')
    expect(() => parseCommand('   ')).toThrow('不能为空')
  })

  it('应拒绝命令分隔符分号（;）', () => {
    expect(() => parseCommand('node app.js; rm -rf /')).toThrow('shell 元字符')
  })

  it('应拒绝管道符（|）', () => {
    expect(() => parseCommand('cat file | grep secret')).toThrow('shell 元字符')
  })

  it('应拒绝逻辑与（&&）', () => {
    expect(() => parseCommand('cmd1 && cmd2')).toThrow('shell 元字符')
  })

  it('应拒绝命令替换 $(...)', () => {
    expect(() => parseCommand('echo $(whoami)')).toThrow('shell 元字符')
  })

  it('应拒绝反引号命令替换', () => {
    expect(() => parseCommand('echo `whoami`')).toThrow('shell 元字符')
  })

  it('应拒绝重定向符（< >）', () => {
    expect(() => parseCommand('cat < /etc/passwd')).toThrow('shell 元字符')
    expect(() => parseCommand('echo x > /tmp/evil')).toThrow('shell 元字符')
  })

  it('应拒绝换行符注入', () => {
    expect(() => parseCommand('node app.js\ncurl evil')).toThrow('shell 元字符')
  })
})

describe('executeCommand（参数化执行）', () => {
  it('应成功执行简单命令并返回输出', async () => {
    const result = await executeCommand('node --version')
    expect(result.success).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/v\d+\.\d+/)
  })

  it('不存在的命令应返回失败（不抛错，便于上层处理）', async () => {
    const result = await executeCommand('nonexistent-binary-xyz-123 --foo')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('应通过参数化执行避免注入（含元字符的输入在解析阶段被拒绝）', async () => {
    await expect(executeCommand('node -e "1"; rm -rf /')).rejects.toThrow('shell 元字符')
  })
})
