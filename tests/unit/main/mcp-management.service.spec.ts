/**
 * MCP 管理服务单元测试
 * @description 覆盖远程 MCP 配置保存与 stdio/http 可用性验证，防止 transport 扩展后回归到 command-only 模式。
 */

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMockState = vi.hoisted(() => ({
  userDataPath: '',
  fetch: vi.fn()
}))

vi.mock('electron', () => ({
  net: { fetch: electronMockState.fetch },
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

  it('原子替换失败时保留原配置和备份，返回失败而非恢复覆盖', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const configPath = path.join(tempHomeDir, '.claude.json')
    const before = await fs.readFile(configPath, 'utf8')
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('ENOSPC'))
    const result = await new MCPManagementService().saveClaudeConfig({ mcpServers: {} })
    expect(result.success).toBe(false)
    expect(result.error).toContain('ENOSPC')
    expect(await fs.readFile(configPath, 'utf8')).toBe(before)
    expect(await fs.readFile(`${configPath}.backup`, 'utf8')).toBe(before)
  })

  /**
   * 为每个用例准备独立的临时 HOME 目录和空白 Claude 配置
   */
  beforeEach(async () => {
    vi.resetModules()
    electronMockState.fetch.mockReset()
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

    electronMockState.fetch.mockResolvedValue({
      ok: false,
      status: 401
    })

    const result = await service.validateServerAvailability('remote', 'global')

    expect(result.success).toBe(true)
    expect(result.data?.valid).toBe(true)
    expect(result.data?.statusCode).toBe(401)
    expect(result.data?.transportType).toBe('http')
  })

  it('uses Electron networking for a local MCP endpoint and cancels its SSE body', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    await fs.writeFile(path.join(tempHomeDir, '.claude.json'), JSON.stringify({
      mcpServers: { local: { type: 'sse', url: 'http://127.0.0.1:7331/sse' } }
    }))
    const cancel = vi.fn()
    electronMockState.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }))
    const nodeFetch = vi.fn()
    vi.stubGlobal('fetch', nodeFetch)

    const result = await new MCPManagementService().validateServerAvailability('local', 'global')

    expect(result.data?.valid).toBe(true)
    expect(electronMockState.fetch).toHaveBeenCalledWith('http://127.0.0.1:7331/sse', expect.objectContaining({ method: 'GET' }))
    expect(cancel).toHaveBeenCalledOnce()
    expect(electronMockState.fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(nodeFetch).not.toHaveBeenCalled()
  })

  it('aborts a stalled Electron request at the bounded probe timeout', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    await fs.writeFile(path.join(tempHomeDir, '.claude.json'), JSON.stringify({
      mcpServers: { remote: { type: 'http', url: 'https://example.com/mcp', timeout: 1 } }
    }))
    const service = new MCPManagementService()
    electronMockState.fetch.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('probe aborted')), { once: true })
    }))
    vi.useFakeTimers()
    const pending = service.validateServerAvailability('remote', 'global')
    await vi.waitFor(() => expect(electronMockState.fetch).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(1000)
    const result = await pending

    expect(result.data?.valid).toBe(false)
    expect(result.data?.message).toContain('probe aborted')
    expect(electronMockState.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })
})
