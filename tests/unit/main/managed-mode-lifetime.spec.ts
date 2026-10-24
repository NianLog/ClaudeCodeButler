import http from 'http'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { net } from 'electron'

vi.mock('electron', () => ({ app: { getPath: () => process.env.USERPROFILE, getVersion: () => '1.5.1' }, net: { fetch: vi.fn() } }))
vi.mock('../../../src/main/utils/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => logger }
  return { logger }
})
import { ManagedModeService } from '../../../src/main/services/managed-mode-service'
import type { ManagedModeConfig } from '../../../src/shared/types/managed-mode'

const servers: http.Server[] = []
let isolatedHome: string
beforeEach(async () => {
  isolatedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-managed-home-'))
  vi.spyOn(os, 'homedir').mockReturnValue(isolatedHome)
})
async function listen(server: http.Server): Promise<number> {
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as AddressInfo).port
}
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(isolatedHome, { recursive: true, force: true })
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
})

describe('集成代理连接生命周期', () => {
  it('端口空闲时直接监听，不受旧健康请求的成功响应影响', async () => {
    const reservation = http.createServer()
    const port = await listen(reservation)
    await new Promise<void>(resolve => reservation.close(() => resolve()))
    const service = new ManagedModeService()
    const internal = service as unknown as {
      config: Partial<ManagedModeConfig>
      proxyProcess: http.Server
      loadConfig(): Promise<void>
      restoreSystemSettings(): Promise<void>
    }
    internal.config = { enabled: true, port, providers: [], accessToken: 'fixture-token', logging: { enabled: false, level: 'info' } }
    vi.spyOn(internal, 'loadConfig').mockResolvedValue()
    vi.spyOn(internal, 'restoreSystemSettings').mockResolvedValue()
    vi.mocked(net.fetch).mockImplementation(async () => new Response('{"status":"ok"}'))
    await service.start()
    servers.push(internal.proxyProcess)
    expect(service.getStatus().running).toBe(true)
    await service.stop()
    expect(service.getStatus().running).toBe(false)
  })

  it('停止服务时关闭持续连接，完成后端口可以重新绑定', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: fixture\n\n')
    })
    const port = await listen(server)
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}`, resolve).once('error', reject)
    })
    response.resume()
    const closed = new Promise<void>(resolve => response.once('close', resolve))
    const service = new ManagedModeService()
    const internal = service as unknown as {
      proxyProcess: http.Server
      isIntegrated: boolean
      restoreSystemSettings(): Promise<void>
    }
    internal.proxyProcess = server
    internal.isIntegrated = true
    vi.spyOn(internal, 'restoreSystemSettings').mockResolvedValue()
    await service.stop()
    await closed
    const replacement = http.createServer()
    servers.push(replacement)
    await new Promise<void>((resolve, reject) => {
      replacement.once('error', reject)
      replacement.listen(port, '127.0.0.1', resolve)
    })
    expect(service.getStatus().running).toBe(false)
  }, 6000)

  it.each(['{invalid', 'null', '[]', '7'])('拒绝覆盖损坏或非对象系统设置：%s', async original => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-managed-settings-'))
    try {
      vi.spyOn(os, 'homedir').mockReturnValue(directory)
      const file = path.join(directory, '.claude/settings.json')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, original)
      const service = new ManagedModeService()
      const updated = vi.fn()
      service.on('config-updated', updated)
      expect((await service.updateSettingsConfig({ env: {} })).success).toBe(false)
      expect(await fs.readFile(file, 'utf8')).toBe(original)
      expect(updated).not.toHaveBeenCalled()
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('系统设置读取失败时不以空配置覆盖，文件不存在时仍可创建', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-managed-read-'))
    try {
      vi.spyOn(os, 'homedir').mockReturnValue(directory)
      const service = new ManagedModeService()
      vi.spyOn(fs, 'readFile').mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
      expect(await service.updateSettingsConfig({ env: {} })).toMatchObject({ success: false, error: 'EACCES' })
      const file = path.join(directory, '.claude/settings.json')
      await expect(fs.access(file)).rejects.toThrow()
      expect(await service.updateSettingsConfig({ env: { fixture: 'created' } })).toEqual({ success: true })
      expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({ env: { fixture: 'created' } })
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('启用时系统设置写入失败不返回成功，并说明代理已启动', async () => {
    const service = new ManagedModeService()
    const internal = service as unknown as {
      config: Partial<ManagedModeConfig>
      loadConfig(): Promise<void>
      saveConfig(config: Partial<ManagedModeConfig>): Promise<void>
    }
    internal.config = { enabled: false, port: 8487 }
    vi.spyOn(internal, 'loadConfig').mockResolvedValue()
    vi.spyOn(internal, 'saveConfig').mockResolvedValue()
    vi.spyOn(service, 'start').mockResolvedValue()
    vi.spyOn(service, 'updateSettingsConfig').mockResolvedValue({ success: false, error: 'ENOSPC' })
    expect(await service.enableManagedMode()).toMatchObject({ success: false, error: expect.stringMatching(/代理.*启动.*ENOSPC/) })
  })

  it('停止后的还原失败向调用方报错，保留备份和运行状态供核对', async () => {
    const service = new ManagedModeService()
    const internal = service as unknown as {
      proxyProcess: { close(callback: () => void): void } | null
      isIntegrated: boolean
      restoreSystemSettings(): Promise<void>
    }
    internal.proxyProcess = { close: callback => callback() }
    internal.isIntegrated = true
    vi.spyOn(internal, 'restoreSystemSettings').mockRejectedValue(new Error('restore ENOSPC'))
    await expect(service.stop()).rejects.toThrow('restore ENOSPC')
    expect(service.getStatus().running).toBe(false)
  })

  it('已停止服务的禁用操作遇到还原失败时保留 enabled，不伪报禁用成功', async () => {
    const service = new ManagedModeService()
    const internal = service as unknown as {
      config: Partial<ManagedModeConfig>
      restoreSystemSettings(): Promise<void>
      loadConfig(): Promise<void>
      saveConfig(config: Partial<ManagedModeConfig>): Promise<void>
    }
    internal.config = { enabled: true }
    vi.spyOn(internal, 'restoreSystemSettings').mockRejectedValue(new Error('restore EACCES'))
    vi.spyOn(internal, 'loadConfig').mockResolvedValue()
    const save = vi.spyOn(internal, 'saveConfig').mockResolvedValue()
    expect(await service.disableManagedMode()).toMatchObject({ success: false, error: expect.stringContaining('restore EACCES') })
    expect(save).not.toHaveBeenCalled()
    expect(service.isManagedModeEnabled()).toBe(true)
  })

  it('重启后的 settings 写入失败继续向调用方传播', async () => {
    const service = new ManagedModeService()
    const internal = service as unknown as {
      config: Partial<ManagedModeConfig>
      isRestarting: boolean
      applySettingsOnRestart(): Promise<void>
    }
    internal.config = { port: 8487 }
    vi.spyOn(service, 'stop').mockResolvedValue()
    vi.spyOn(service, 'start').mockImplementation(() => internal.applySettingsOnRestart())
    vi.spyOn(service, 'updateSettingsConfig').mockResolvedValue({ success: false, error: 'ENOSPC' })
    await expect(service.restart()).rejects.toThrow('ENOSPC')
    expect(internal.isRestarting).toBe(false)
  })

  it('备份目录不可读时拒绝启动，不能当作无备份继续写入', async () => {
    const service = new ManagedModeService()
    const internal = service as unknown as {
      config: Partial<ManagedModeConfig>
      loadConfig(): Promise<void>
      startIntegratedProxy(): Promise<void>
    }
    internal.config = { enabled: true, port: 8487 }
    vi.spyOn(internal, 'loadConfig').mockResolvedValue()
    const start = vi.spyOn(internal, 'startIntegratedProxy').mockResolvedValue()
    vi.spyOn(fs, 'readdir').mockRejectedValueOnce(Object.assign(new Error('backup EACCES'), { code: 'EACCES' }))
    await expect(service.start()).rejects.toThrow('backup EACCES')
    expect(start).not.toHaveBeenCalled()
  })

  it('系统设置备份写入失败时拒绝启动，原设置不变', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ccb-managed-backup-'))
    try {
      vi.spyOn(os, 'homedir').mockReturnValue(directory)
      const file = path.join(directory, '.claude/settings.json')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, '{"original":true}')
      const service = new ManagedModeService()
      const internal = service as unknown as {
        config: Partial<ManagedModeConfig>
        loadConfig(): Promise<void>
        startIntegratedProxy(): Promise<void>
      }
      internal.config = { enabled: true, port: 8487 }
      vi.spyOn(internal, 'loadConfig').mockResolvedValue()
      const start = vi.spyOn(internal, 'startIntegratedProxy')
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('ENOSPC'))
      await expect(service.start()).rejects.toThrow('ENOSPC')
      expect(start).not.toHaveBeenCalled()
      expect(await fs.readFile(file, 'utf8')).toBe('{"original":true}')
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it('客户端收到首个 SSE 后断连会取消真实上游连接', async () => {
    let markClosed!: () => void
    const closed = new Promise<void>(resolve => { markClosed = resolve })
    const upstreamPort = await listen(http.createServer((req, res) => {
      req.resume()
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: first\n\n')
      res.once('close', markClosed)
    }))
    const reservation = http.createServer()
    const port = await listen(reservation)
    await new Promise<void>(resolve => reservation.close(() => resolve()))
    const service = new ManagedModeService() as unknown as {
      config: Partial<ManagedModeConfig>
      startIntegratedProxy(): Promise<void>
      proxyProcess: http.Server
    }
    service.config = {
      port, currentProvider: 'fixture', accessToken: 'local-fixture-token',
      providers: [{ id: 'fixture', name: 'fixture', apiKey: 'test-key', apiBaseUrl: `http://127.0.0.1:${upstreamPort}`, enabled: true }],
      logging: { enabled: false, level: 'info' }
    }
    await service.startIntegratedProxy()
    servers.push(service.proxyProcess)
    await new Promise<void>((resolve, reject) => {
      const request = http.request({
        hostname: '127.0.0.1', port, path: '/v1/messages', method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': 'local-fixture-token' }
      }, response => {
        expect(response.statusCode).toBe(200)
        response.once('data', () => { response.destroy(); request.destroy(); resolve() })
      })
      request.once('error', reject)
      request.end(JSON.stringify({ model: 'fixture', stream: true, messages: [] }))
    })
    await closed
  })
})
