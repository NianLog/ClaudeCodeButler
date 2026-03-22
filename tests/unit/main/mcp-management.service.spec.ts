/**
 * MCP 管理服务单元测试
 * @description 覆盖远程 MCP 配置保存与 stdio/http 可用性验证，防止 transport 扩展后回归到 command-only 模式。
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMockState = vi.hoisted(() => ({
  userDataPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        return electronMockState.userDataPath
      }

      return process.cwd()
    }
  }
}))

vi.mock('@shared/constants', () => ({
  PATHS: {
    LOG_DIR: path.join(process.cwd(), '.vitest-logs')
  }
}))

describe('MCPManagementService', () => {
  let tempHomeDir = ''

  /**
   * 为每个用例准备独立的临时 HOME 目录和空白 Claude 配置
   */
  beforeEach(async () => {
    vi.resetModules()
    tempHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-mcp-'))
    electronMockState.userDataPath = tempHomeDir
    vi.spyOn(os, 'homedir').mockReturnValue(tempHomeDir)
    await fs.writeFile(path.join(tempHomeDir, '.claude.json'), JSON.stringify({}, null, 2), 'utf8')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await fs.rm(tempHomeDir, { recursive: true, force: true })
  })

  it('should allow saving remote MCP servers without command', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const service = new MCPManagementService()
    const result = await service.addOrUpdateServer({
      id: 'remote-http',
      type: 'http',
      url: 'https://example.com/mcp',
      targetScope: 'global'
    })

    expect(result.success).toBe(true)

    const savedConfig = JSON.parse(
      await fs.readFile(path.join(tempHomeDir, '.claude.json'), 'utf8')
    ) as { mcpServers?: Record<string, { type?: string; url?: string; command?: string }> }

    expect(savedConfig.mcpServers?.['remote-http']).toEqual({
      type: 'http',
      url: 'https://example.com/mcp'
    })
  })

  it('should validate stdio MCP servers via terminal startup probe', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const { terminalManagementService } = await import('../../../src/main/services/terminal-management-service')
    const service = new MCPManagementService()
    await fs.writeFile(
      path.join(tempHomeDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          probe: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-example']
          }
        }
      }, null, 2),
      'utf8'
    )

    const probeSpy = vi.spyOn(terminalManagementService, 'probeCommandStartup').mockResolvedValue({
      started: true,
      stdout: '',
      stderr: '',
      terminalType: 'git-bash',
      exitCode: null
    })

    const result = await service.validateServerAvailability('probe', 'global')

    expect(probeSpy).toHaveBeenCalledWith(
      'npx -y "@modelcontextprotocol/server-example"',
      { timeout: 3000 }
    )
    expect(result.success).toBe(true)
    expect(result.data?.valid).toBe(true)
    expect(result.data?.transportType).toBe('stdio')
    expect(result.data?.terminalType).toBe('git-bash')
  })

  it('should treat authenticated remote MCP endpoints as reachable', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const service = new MCPManagementService()
    await fs.writeFile(
      path.join(tempHomeDir, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          remote: {
            type: 'http',
            url: 'https://example.com/remote-mcp'
          }
        }
      }, null, 2),
      'utf8'
    )

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401
    }))

    const result = await service.validateServerAvailability('remote', 'global')

    expect(result.success).toBe(true)
    expect(result.data?.valid).toBe(true)
    expect(result.data?.statusCode).toBe(401)
    expect(result.data?.transportType).toBe('http')
  })
})
