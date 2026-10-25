import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'

const execute = promisify(execFile)

export async function createNetworkSafetyFixture(profile) {
  const directory = path.join(profile, 'network-fixtures')
  await fs.mkdir(directory, { recursive: true })
  const git = (await execute('where.exe', ['git.exe'], { windowsHide: true })).stdout.trim().split(/\r?\n/)[0]
  const openssl = path.join(path.dirname(path.dirname(git)), 'usr/bin/openssl.exe')
  await fs.access(openssl)
  const certificates = {}
  for (const [name, san] of [['ip', 'IP:127.0.0.1,IP:::1'], ['dns', 'DNS:localhost'], ['untrusted', 'IP:127.0.0.1,IP:::1']]) {
    const key = path.join(directory, name + '.key')
    const cert = path.join(directory, name + '.crt')
    await execute(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-days', '1', '-subj', '/CN=CCB fixture ' + name,
      '-addext', 'subjectAltName=' + san, '-keyout', key, '-out', cert], { windowsHide: true })
    certificates[name] = { key: await fs.readFile(key), cert: await fs.readFile(cert) }
  }
  const caPath = path.join(directory, 'trusted-fixtures.crt')
  await fs.writeFile(caPath, Buffer.concat([certificates.ip.cert, certificates.dns.cert]))
  const servers = []
  const sockets = new Set()
  const allowedPorts = new Set()
  const listen = async (server, host = '127.0.0.1') => {
    servers.push(server)
    server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)) })
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve) })
    const port = server.address().port
    allowedPorts.add(port)
    return port
  }
  let certificate = 'ip'
  const upstreamRequests = []
  const respond = (req, res) => {
    req.resume()
    req.once('end', () => {
      upstreamRequests.push({ host: req.headers.host, forwardedHost: req.headers['x-forwarded-host'], apiKey: req.headers['x-api-key'] })
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ id: 'native-network-fixture', type: 'message', role: 'assistant', model: 'fixture', content: [] }))
    })
  }
  const tlsServer = https.createServer(certificates.ip, respond)
  tlsServer.on('tlsClientError', () => {})
  const tlsPort = await listen(tlsServer)
  const tls6 = https.createServer(certificates.ip, respond)
  tls6.on('tlsClientError', () => {})
  const tls6Port = await listen(tls6, '::1')
  const proxy = http.createServer()
  proxy.on('connect', (req, socket, head) => {
    const target = /^(127\.0\.0\.1|localhost|\[::1\]):(\d+)$/.exec(req.url)
    if (!target || !allowedPorts.has(Number(target[2]))) { socket.destroy(); return }
    const peer = net.connect({ host: target[1] === '[::1]' ? '::1' : '127.0.0.1', port: Number(target[2]) })
    sockets.add(peer)
    peer.on('close', () => sockets.delete(peer))
    peer.on('error', () => socket.destroy())
    socket.on('error', () => peer.destroy())
    socket.on('close', () => peer.destroy())
    peer.once('connect', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) peer.write(head); socket.pipe(peer); peer.pipe(socket) })
  })
  const proxyPort = await listen(proxy)
  const downloadBytes = Buffer.from('CCB native HEAD/download fixture\n')
  const heads = []
  const asset = http.createServer((req, res) => {
    if (req.url === '/v1/messages') { respond(req, res); return }
    if (req.method === 'HEAD') heads.push({ route: req.url, connection: req.headers.connection })
    if (req.url === '/stall' && req.method === 'HEAD') return
    if (req.url === '/reject') { res.writeHead(405, { 'Content-Length': '0' }); res.end(); return }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/file', 'Content-Length': '0' }); res.end(); return }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename=fixture.bin', 'Content-Length': String(downloadBytes.length) })
    res.end(req.method === 'HEAD' ? undefined : downloadBytes)
  })
  const assetPort = await listen(asset)
  const evidence = { tls: [], downloads: [], heads }
  return {
    caPath,
    async run(bridge, pass) {
      const initialSettings = await fs.readFile(path.join(profile, '.claude/settings.json'), 'utf8')
      const initialConfig = JSON.parse(await fs.readFile(path.join(profile, '.ccb/managed-mode-config.json'), 'utf8'))
      const reservation = net.createServer()
      await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
      const port = reservation.address().port
      await new Promise(resolve => reservation.close(resolve))
      const cases = [
        ['direct-ip', '127.0.0.1', false, 'ip', true], ['proxy-ip', '127.0.0.1', true, 'ip', true],
        ['proxy-ip-wrong-dns', '127.0.0.1', true, 'dns', false], ['direct-ip-wrong-dns', '127.0.0.1', false, 'dns', false],
        ['proxy-ip-untrusted-chain', '127.0.0.1', true, 'untrusted', false], ['proxy-ip-hex', '0x7f.0.0.1', true, 'ip', true],
        ['proxy-ip-fullwidth', '１２７.0.0.1', true, 'ip', true], ['direct-dns', 'localhost', false, 'dns', true],
        ['proxy-dns', 'localhost', true, 'dns', true], ['proxy-dns-wrong-ip', 'localhost', true, 'ip', false],
        ['direct-ipv6', '[::1]', false, 'ip', true], ['proxy-ipv6', '[::1]', true, 'ip', true],
        ['proxy-ipv6-wrong-dns', '[::1]', true, 'dns', false], ['http-provider', '127.0.0.1', false, 'http', true]
      ]
      try {
        for (const [name, host, proxied, cert, accepted] of cases) {
          evidence.currentCase = name
          certificate = cert
          if (cert !== 'http') { tlsServer.setSecureContext(certificates[certificate]); tls6.setSecureContext(certificates[certificate]) }
          const provider = { id: 'native-network', name: 'Native fixture', type: 'anthropic', apiBaseUrl: cert === 'http' ? `http://127.0.0.1:${assetPort}` : `https://${host}:${host === '[::1]' ? tls6Port : tlsPort}`,
            apiKey: 'native-fixture-key', models: ['fixture'], transformer: 'anthropic', enabled: true, createdAt: 1, updatedAt: 1 }
          const configured = await bridge('managedMode.updateConfig', [{ enabled: true, autoStart: false, port, accessToken: 'fixture-proxy-only', providers: [provider], currentProvider: provider.id,
            logging: { enabled: false, level: 'error' }, networkProxy: { enabled: proxied, host: 'localhost', port: proxyPort } }])
          assert.equal(configured.success, true, name + ': ' + JSON.stringify(configured))
          if (evidence.tls.length === 0) assert.equal((await bridge('managedMode.start', [])).success, true)
          const before = upstreamRequests.length
          // fetch 会重写 Host；原生 HTTP 才能把干扰值真实送入待测 IPC 服务。
          const response = await new Promise((resolve, reject) => {
            const request = http.request({ hostname: '127.0.0.1', port, path: '/v1/messages', method: 'POST', agent: false, signal: AbortSignal.timeout(8000),
              headers: { 'content-type': 'application/json', 'x-api-key': 'fixture-proxy-only', host: 'proxy.example.invalid' } }, incoming => {
              let text = ''
              incoming.setEncoding('utf8'); incoming.on('data', chunk => { text += chunk }); incoming.on('error', reject)
              incoming.on('end', () => { try { resolve({ status: incoming.statusCode, ok: incoming.statusCode >= 200 && incoming.statusCode < 300, data: JSON.parse(text) }) } catch (error) { reject(error) } })
            })
            request.on('error', error => reject(new Error(name + ': ' + error.message, { cause: error })))
            request.end(JSON.stringify({ model: 'fixture', max_tokens: 16, messages: [{ role: 'user', content: 'native fixture' }] }))
          })
          const data = response.data
          evidence.tls.push({ name, status: response.status, upstreamRequests: upstreamRequests.length - before })
          assert.equal(response.ok, accepted, name + ': ' + JSON.stringify(data))
          assert.equal(upstreamRequests.length - before, accepted ? 1 : 0, name + ': rejected TLS must not send API key/body')
          if (accepted) { assert.equal(data.id, 'native-network-fixture'); assert.equal(upstreamRequests.at(-1).apiKey, 'native-fixture-key'); assert.notEqual(upstreamRequests.at(-1).host, 'proxy.example.invalid'); assert.equal(upstreamRequests.at(-1).forwardedHost, 'proxy.example.invalid') }
        }
        pass('Real IPC → integrated proxy → TLS validates IPv4/IPv6/DNS, CONNECT, Unicode/hex, Host interference and untrusted chains before sending fixture credentials')
      } finally {
        await fs.writeFile(path.join(directory, 'network-report.json'), JSON.stringify(evidence, null, 2))
        const disabled = await bridge('managedMode.disable', [])
        assert.equal(disabled.success, true, JSON.stringify(disabled))
        assert.equal(await fs.readFile(path.join(profile, '.claude/settings.json'), 'utf8'), initialSettings)
        assert.equal((await bridge('managedMode.updateConfig', [initialConfig])).success, true)
      }
      pass('Stopping network acceptance restores the original isolated Claude settings and managed configuration')
      for (const [route, name] of [['/file', 'native-head-first.bin'], ['/file', 'native-head-second.bin'], ['/redirect', 'native-head-redirect.bin']]) {
        const result = await bridge('system.downloadFile', [`http://127.0.0.1:${assetPort}${route}`, name])
        assert.equal(result.success, true, JSON.stringify(result))
        const expected = path.join(profile, 'Downloads', name)
        assert.equal(path.resolve(result.path), expected)
        const bytes = await fs.readFile(expected)
        assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(downloadBytes).digest('hex'))
        evidence.downloads.push({ route, file: name, bytes: bytes.length })
      }
      const rejected = await bridge('system.downloadFile', [`http://127.0.0.1:${assetPort}/reject`, 'must-not-save.bin'])
      assert.equal(rejected.success, false); assert.equal(rejected.error, 'url_not_accessible')
      const started = Date.now()
      const stalled = await bridge('system.downloadFile', [`http://127.0.0.1:${assetPort}/stall`, 'must-not-save-stall.bin'])
      assert.equal(stalled.success, false); assert.match(stalled.message, /URL测试超时/); assert.ok(Date.now() - started < 8000)
      assert.ok(heads.length >= 5); assert.ok(heads.every(head => head.connection === 'close'))
      const shellActions = (await fs.readFile(path.join(profile, 'shell-actions.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
      assert.equal(shellActions.length, 3)
      assert.ok(shellActions.every(action => path.resolve(action.file).startsWith(path.join(profile, 'Downloads') + path.sep)))
      await assert.rejects(fs.stat(path.join(profile, 'Downloads/must-not-save.bin')), { code: 'ENOENT' })
      pass('Real download IPC preserves 200/302 and file bytes, rejects 405, times out stalled HEAD and sends Connection: close')
      await fs.writeFile(path.join(directory, 'network-report.json'), JSON.stringify(evidence, null, 2))
    },
    async close() {
      for (const socket of sockets) socket.destroy()
      await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
    }
  }
}
