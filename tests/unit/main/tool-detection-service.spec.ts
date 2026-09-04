/**
 * @file tests/unit/main/tool-detection-service.spec.ts
 * @description 验证工具 detector 的跨平台映射、受控路径边界与 any-match 汇总语义。
 */

import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '../../../src/shared/tool-registry'
import {
  mapNodePlatform,
  resolveToolPath,
  ToolDetectionService
} from '../../../src/main/services/tool-detection-service'

/**
 * 创建 detector 测试所需的最小工具定义。
 * @param detectors detector definitions
 * @param platforms 支持的平台
 * @returns 完整工具定义
 */
function createTool(
  detectors: ToolDefinition['detectors'],
  platforms: ToolDefinition['platforms'] = ['WINDOWS']
): ToolDefinition {
  return {
    toolId: 'example-tool',
    definitionVersion: '1.0.0',
    displayName: { 'zh-CN': '示例', 'en-US': 'Example' },
    platforms,
    detectors,
    artifacts: []
  }
}

describe('mapNodePlatform', () => {
  it('应映射 Windows、macOS 与 Linux', () => {
    expect(mapNodePlatform('win32')).toBe('WINDOWS')
    expect(mapNodePlatform('darwin')).toBe('MACOS')
    expect(mapNodePlatform('linux')).toBe('LINUX')
  })

  it('应拒绝未支持平台而不是错误归入 Linux', () => {
    expect(() => mapNodePlatform('freebsd')).toThrow('不支持的工具检测平台')
  })
})

describe('resolveToolPath', () => {
  it('应按 Windows 规则解析并保持在变量根内', () => {
    expect(resolveToolPath('${APPDATA}/ccb/config.json', 'WINDOWS', {
      APPDATA: 'C:\\Users\\alice\\AppData\\Roaming'
    })).toBe('C:\\Users\\alice\\AppData\\Roaming\\ccb\\config.json')
  })

  it('应按 POSIX 规则解析 macOS 和 Linux 路径', () => {
    expect(resolveToolPath('${HOME}/.config/tool', 'MACOS', { HOME: '/Users/alice' }))
      .toBe('/Users/alice/.config/tool')
    expect(resolveToolPath('${XDG_CONFIG_HOME}/tool', 'LINUX', { XDG_CONFIG_HOME: '/home/alice/.config' }))
      .toBe('/home/alice/.config/tool')
  })

  it.each([
    ['${HOME}/../secret', 'traversal'],
    ['${UNKNOWN}/tool', '允许的根变量'],
    ['${HOME}/tool/*.json', '不允许的字符'],
    ['${HOME}/${APPDATA}/tool', '变量注入'],
    ['\\\\server\\share', '不允许的字符或路径结构']
  ])('应拒绝危险路径 %s', (template, expectedMessage) => {
    expect(() => resolveToolPath(template, 'WINDOWS', { HOME: 'C:\\Users\\alice' }))
      .toThrow(expectedMessage)
  })

  it('应拒绝 UNC 变量根和未配置变量', () => {
    expect(() => resolveToolPath('${HOME}/tool', 'WINDOWS', { HOME: '\\\\server\\users\\alice' }))
      .toThrow('不是受支持的绝对路径')
    expect(() => resolveToolPath('${APPDATA}/tool', 'WINDOWS', {}))
      .toThrow('路径根变量 APPDATA 不可用')
  })
})

describe('ToolDetectionService', () => {
  it('应执行全部 detector 并使用 any-match 汇总', async () => {
    const pathExists = vi.fn(async () => false)
    const commandExists = vi.fn(async () => true)
    const service = new ToolDetectionService({
      platform: 'win32',
      pathVariables: { HOME: 'C:\\Users\\alice' },
      pathExists,
      commandExists
    })

    const result = await service.detectTool(createTool([
      { type: 'PATH_EXISTS', path: '${HOME}/.example' },
      { type: 'COMMAND_EXISTS', command: 'example-cli' }
    ]))

    expect(result.detected).toBe(true)
    expect(result.matchedDetectors).toBe(1)
    expect(result.detectorResults).toEqual([
      expect.objectContaining({ index: 0, type: 'PATH_EXISTS', matched: false }),
      expect.objectContaining({ index: 1, type: 'COMMAND_EXISTS', command: 'example-cli', matched: true })
    ])
    expect(pathExists).toHaveBeenCalledWith('C:\\Users\\alice\\.example')
    expect(commandExists).toHaveBeenCalledWith('example-cli', 'WINDOWS')
  })

  it('应在运行期再次拒绝带参数或 shell 字符的 command', async () => {
    const commandExists = vi.fn(async () => true)
    const service = new ToolDetectionService({ platform: 'win32', commandExists })

    const result = await service.detectTool(createTool([
      { type: 'COMMAND_EXISTS', command: 'example --version; whoami' }
    ]))

    expect(result.detected).toBe(false)
    expect(result.detectorResults[0].error).toContain('executable name')
    expect(commandExists).not.toHaveBeenCalled()
  })

  it('单项失败时应继续执行其他 detector 并保留错误', async () => {
    const service = new ToolDetectionService({
      platform: 'linux',
      pathVariables: { HOME: '/home/alice' },
      commandExists: async () => true
    })
    const result = await service.detectTool(createTool([
      { type: 'PATH_EXISTS', path: '${HOME}/../secret' },
      { type: 'COMMAND_EXISTS', command: 'example' }
    ], ['LINUX']))

    expect(result.detected).toBe(true)
    expect(result.detectorResults[0].error).toContain('traversal')
    expect(result.detectorResults[1].matched).toBe(true)
  })

  it('工具不支持当前平台时不应调用外部检查器', async () => {
    const pathExists = vi.fn(async () => true)
    const commandExists = vi.fn(async () => true)
    const service = new ToolDetectionService({ platform: 'win32', pathExists, commandExists })

    const result = await service.detectTool(createTool([
      { type: 'COMMAND_EXISTS', command: 'example' }
    ], ['MACOS']))

    expect(result.detected).toBe(false)
    expect(result.detectorResults[0].error).toContain('不支持当前平台 WINDOWS')
    expect(pathExists).not.toHaveBeenCalled()
    expect(commandExists).not.toHaveBeenCalled()
  })
})
