import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ getText: vi.fn() }))
vi.mock('electron', () => ({ app: {}, Notification: vi.fn(), shell: {} }))
vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../../../src/main/services/registry-update-service', () => ({
  registryUpdateService: {},
  NetFetchRegistryHttpClient: class { getText = http.getText }
}))

import { updateService, VERSION_URL } from '../../../src/main/services/update-service'

describe('固定版本读取', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([
    'http://127.0.0.1/', 'http://[::ffff:7f00:1]/',
    `${VERSION_URL}?redirect=1`, 'https://dev.niansir.com/other'
  ])('拒绝 renderer 提供的非固定地址 %s', async url => {
    await expect(updateService.fetchVersionText(url)).rejects.toThrow('固定')
    expect(http.getText).not.toHaveBeenCalled()
  })

  it('保留旧 URL 参数契约，并复用有超时、大小和重定向限制的客户端', async () => {
    http.getText.mockResolvedValue('[appId]1.5.1[/appId]')
    expect(await updateService.fetchVersionText(VERSION_URL)).toContain('1.5.1')
    expect(http.getText).toHaveBeenCalledWith(VERSION_URL, 64 * 1024)
  })

  it('网络失败传回调用方', async () => {
    http.getText.mockRejectedValue(new Error('timeout'))
    await expect(updateService.fetchVersionText()).rejects.toThrow('timeout')
  })
})
