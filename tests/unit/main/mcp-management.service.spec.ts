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
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await fs.rm(tempHomeDir, { recursive: true, force: true })
  })

  it('legacy add/update/delete and project creation preserve unrelated raw numbers and comments', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const file = path.join(tempHomeDir, '.claude.json')
    const original = '{\n// keep native preferences\n"large":9007199254740993123,"mcpServers":{"existing":{"command":"old","unknown":9007199254740993999}},"projects":{}}\n'
    await fs.writeFile(file, original)
    const service = new MCPManagementService()
    expect((await service.addOrUpdateServer({ id: 'added', type: 'stdio', command: 'node', targetScope: 'global' })).success).toBe(true)
    const changed = (await service.readClaudeConfig()).data!
    changed.mcpServers!.existing.command = 'node'
    expect((await service.saveClaudeConfig(changed)).success).toBe(true)
    expect((await service.addOrUpdateServer({ id: 'project-server', type: 'stdio', command: 'node', targetScope: 'D:/legitimate/project' })).success).toBe(true)
    expect((await service.deleteServer('added', 'global')).success).toBe(true)
    const output = await fs.readFile(file, 'utf8')
    expect(output).toContain('9007199254740993123')
    expect(output).toContain('9007199254740993999')
    expect(output).toContain('// keep native preferences')
    expect((await service.getProjectServers('D:/legitimate/project')).data?.['project-server'].command).toBe('node')
  })

  it('legacy copy/import/export keep the complete selected native definition text', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const file = path.join(tempHomeDir, '.claude.json')
    const definition = '{"type":"stdio","command":"node","custom":9007199254740993999}'
    await fs.writeFile(file, `{"mcpServers":{"source":${definition}}}`)
    const service = new MCPManagementService()
    expect((await service.duplicateServer('source', 'global', 'copy', 'global')).success).toBe(true)
    expect((await service.exportServerConfig('copy', 'global')).data).toContain('9007199254740993999')
    expect((await service.importServerConfig(definition, 'imported', 'D:/project')).success).toBe(true)
    expect((await service.exportServerConfig('imported', 'D:/project')).data).toContain('9007199254740993999')
    expect((await fs.readFile(file, 'utf8')).match(/9007199254740993999/g)).toHaveLength(3)
  })

  it('legacy toggle archives and restores raw values, and a failed native restore keeps the archive', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const { mcpArchiveService } = await import('../../../src/main/services/mcp-archive.service')
    const file = path.join(tempHomeDir, '.claude.json')
    await fs.writeFile(file, '{"large":9007199254740993123,"mcpServers":{"source":{"command":"node","custom":9007199254740993999}}}')
    const service = new MCPManagementService()
    expect((await service.toggleServer('source', 'global')).data).toBe(true)
    expect((await service.getGlobalServers()).data?.source).toBeUndefined()
    expect((await mcpArchiveService.peekServer('source', 'global'))?.rawConfig).toContain('9007199254740993999')
    const originalRename = fs.rename.bind(fs)
    const failed = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === file) throw new Error('ENOSPC')
      return originalRename(from, to)
    })
    expect((await service.toggleServer('source', 'global')).success).toBe(false)
    expect(await mcpArchiveService.peekServer('source', 'global')).not.toBeNull()
    failed.mockRestore()
    expect((await service.toggleServer('source', 'global')).data).toBe(false)
    expect(await mcpArchiveService.peekServer('source', 'global')).toBeNull()
    const output = await fs.readFile(file, 'utf8')
    expect(output).toContain('9007199254740993123')
    expect(output).toContain('9007199254740993999')
  })

  it('a restore cleanup failure reports the native write and keeps the archived copy', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const { mcpArchiveService } = await import('../../../src/main/services/mcp-archive.service')
    await fs.writeFile(path.join(tempHomeDir, '.claude.json'), '{"mcpServers":{"source":{"command":"node"}}}')
    const service = new MCPManagementService()
    expect((await service.toggleServer('source', 'global')).success).toBe(true)
    vi.spyOn(mcpArchiveService, 'confirmRestore').mockResolvedValueOnce({ success: false, error: 'disk is read-only' })
    const result = await service.toggleServer('source', 'global')
    expect(result.success).toBe(false)
    expect(result.error).toContain('已写入原生配置')
    expect((await service.getGlobalServers()).data?.source.command).toBe('node')
    expect(await mcpArchiveService.peekServer('source', 'global')).not.toBeNull()
  })

  it('a stale archive cannot overwrite a different live native server', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const { mcpArchiveService } = await import('../../../src/main/services/mcp-archive.service')
    const file = path.join(tempHomeDir, '.claude.json')
    await fs.writeFile(file, '{"mcpServers":{"source":{"command":"old"}}}')
    const service = new MCPManagementService()
    expect((await service.toggleServer('source', 'global')).success).toBe(true)
    const newer = '{"mcpServers":{"source":{"command":"newer"}},"outside":true}'
    await fs.writeFile(file, newer)
    expect((await service.toggleServer('source', 'global')).success).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe(newer)
    expect(await mcpArchiveService.peekServer('source', 'global')).not.toBeNull()
  })

  it('external changes and backup failure keep current data intact', async () => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const file = path.join(tempHomeDir, '.claude.json')
    const service = new MCPManagementService()
    const current = (await service.readClaudeConfig()).data!
    await fs.writeFile(file, '{"external":true}')
    current.mcpServers = { source: { command: 'node' } }
    expect((await service.saveClaudeConfig(current)).success).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('{"external":true}')
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('backup denied'))
    expect((await service.addOrUpdateServer({ id: 'source', type: 'stdio', command: 'node', targetScope: 'global' })).success).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('{"external":true}')
  })

  it.each(['__proto__', 'constructor', 'prototype'])('rejects dangerous legacy keys %s without prototype changes or file writes', async key => {
    const { MCPManagementService } = await import('../../../src/main/services/mcp-management.service')
    const service = new MCPManagementService()
    const file = path.join(tempHomeDir, '.claude.json')
    await fs.writeFile(file, '{"mcpServers":{},"projects":{}}')
    const before = await fs.readFile(file, 'utf8')
    const jobs = [
      service.addOrUpdateServer({ id: 'audit', type: 'stdio', command: 'node', targetScope: key }),
      service.addOrUpdateServer({ id: key, type: 'stdio', command: 'node', targetScope: 'global' }),
      service.deleteServer('audit', key), service.toggleServer('audit', key), service.duplicateServer('audit', 'global', 'copy', key),
      service.importServerConfig('{"command":"node"}', 'audit', key), service.exportServerConfig('audit', key), service.getProjectServers(key), service.validateServerAvailability('audit', key)
    ]
    expect((await Promise.all(jobs)).every(result => !result.success)).toBe(true)
    expect(await fs.readFile(file, 'utf8')).toBe(before)
    expect(Object.hasOwn(Object.prototype, 'mcpServers')).toBe(false)
    await fs.writeFile(file, `{"projects":{${JSON.stringify(key)}:{"mcpServers":{}}}}`)
    expect((await service.readClaudeConfig()).success).toBe(false)
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

    electronMockState.fetch.mockResolvedValue(new Response('', { status: 401 }))

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
