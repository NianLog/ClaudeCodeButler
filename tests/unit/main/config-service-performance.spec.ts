/**
 * @file tests/unit/main/config-service-performance.spec.ts
 * @description 验证 ConfigService 在成功与失败扫描后记录 runtime metrics，且保持原错误语义。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConfigFile } from '@shared/types'

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    performance: vi.fn()
  }
}))

import { ConfigService } from '../../../src/main/services/config-service'
import { RuntimePerformanceTelemetry } from '../../../src/main/services/runtime-performance-telemetry'

/** ConfigService 扫描私有边界的测试视图。 */
interface ConfigServiceScanInternals {
  ensureClaudeDir: () => Promise<void>
  getAllConfigFiles: () => Promise<string[]>
  createConfigFileObject: (filePath: string) => Promise<ConfigFile>
}

/**
 * 构造最小有效 ConfigFile。
 * @param filePath 文件路径
 * @returns 配置对象
 */
function createConfig(filePath: string): ConfigFile {
  return {
    id: filePath,
    name: filePath,
    path: filePath,
    type: 'claude-code',
    size: 1,
    lastModified: new Date(0)
  }
}

describe('ConfigService scan performance metrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('成功扫描应记录候选文件数、加载数与耗时', async () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const service = new ConfigService(telemetry)
    const internals = service as unknown as ConfigServiceScanInternals
    vi.spyOn(internals, 'ensureClaudeDir').mockResolvedValue()
    vi.spyOn(internals, 'getAllConfigFiles').mockResolvedValue(['a.json', 'broken.json', 'b.json'])
    vi.spyOn(internals, 'createConfigFileObject').mockImplementation(async (filePath) => {
      if (filePath === 'broken.json') {
        throw new Error('invalid config')
      }
      return createConfig(filePath)
    })

    await expect(service.scanConfigs()).resolves.toHaveLength(2)

    const metric = telemetry.getSnapshot().lastConfigScan
    expect(metric).toMatchObject({
      filesVisited: 3,
      configsLoaded: 2,
      success: true
    })
    expect(metric?.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(metric?.completedAt || ''))).toBe(false)
  })

  it('顶层扫描失败仍记录失败指标并原样抛出错误', async () => {
    const telemetry = new RuntimePerformanceTelemetry()
    const service = new ConfigService(telemetry)
    const internals = service as unknown as ConfigServiceScanInternals
    const scanError = new Error('directory unavailable')
    vi.spyOn(internals, 'ensureClaudeDir').mockRejectedValue(scanError)

    await expect(service.scanConfigs()).rejects.toBe(scanError)
    expect(telemetry.getSnapshot().lastConfigScan).toMatchObject({
      filesVisited: 0,
      configsLoaded: 0,
      success: false
    })
  })

  it('telemetry 写入失败不得覆盖原始扫描错误', async () => {
    const telemetry = new RuntimePerformanceTelemetry()
    vi.spyOn(telemetry, 'recordConfigScan').mockImplementation(() => {
      throw new Error('telemetry unavailable')
    })
    const service = new ConfigService(telemetry)
    const internals = service as unknown as ConfigServiceScanInternals
    const scanError = new Error('original scan failure')
    vi.spyOn(internals, 'ensureClaudeDir').mockRejectedValue(scanError)

    await expect(service.scanConfigs()).rejects.toBe(scanError)
  })
})
