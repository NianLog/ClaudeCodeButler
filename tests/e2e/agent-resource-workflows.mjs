import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import net from 'node:net'
import { createHash } from 'node:crypto'
import { createNetworkSafetyFixture } from './network-safety-fixture.mjs'

const base = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(base, '../..')
if (process.platform !== 'win32') throw Error('This real Electron regression currently requires Windows')
const wrapper = path.join(base, 'native-qa')
const profile = path.join(repo, 'release', 'electron-e2e', 'profile-' + Date.now())
const shots = path.join(profile, 'evidence')
await fs.mkdir(shots, { recursive: true })
const seed = async (file, value) => {
  const target = path.join(profile, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}
for (const folder of ['AppData/Roaming', 'AppData/Local', 'temp', 'fixture-project']) await fs.mkdir(path.join(profile, folder), { recursive: true })
const stdio = { command: 'node', args: ['--version'] }
await seed('.claude.json', '{\n "large": 9007199254740993123,\n "mcpServers": {"docs-search":{"command":"node","args":["--version"]}},\n "projects": {}\n}\n')
await seed('.claude/settings.json', { env: { ANTHROPIC_API_KEY: 'fixture-only' }, permissions: { allow: [], deny: [] } })
await seed('.codex/config.toml', 'model = "fixture-model"\n# Keep this comment\n[mcp_servers.docs-search]\ncommand = "node"\nargs = ["--version"]\n')
await seed('.gemini/settings.json', { mcpServers: { 'docs-search': stdio } })
await seed('.gemini/config/mcp_config.json', { mcpServers: { 'docs-search': stdio } })
await seed('.cursor/mcp.json', { mcpServers: { 'cursor-docs': { ...stdio, env: { API_KEY: 'fixture-preview-secret' } } } })
await seed('fixture-project/.trae/mcp.json', { mcpServers: { 'project-docs': stdio } })
await seed('.ccb/managed-mode-config.json', { enabled: false, autoStart: false, port: 34560, currentProvider: '', providers: [], accessToken: 'fixture-proxy-only', logging: { enabled: false, level: 'info' } })
await seed('electron-user-data/settings.json', { basic: { language: 'zh-CN', startupCheck: false }, notifications: { startupCheckUpdate: false }, advanced: { telemetry: false } })
for (const folder of ['.claude', '.gemini', '.gemini/config']) {
  await seed(folder + '/skills/api-review/SKILL.md', '---\nname: api-review\ndescription: Review API contracts\n---\nReview the supplied API.\n')
  await seed(folder + '/skills/api-review/references/notes.txt', 'attachment fixture\n')
  await seed(folder + '/agents/reviewer.md', '---\nname: reviewer\ndescription: Review changes\n---\nReview carefully.\n')
}
await seed('.codex/skills/api-review/SKILL.md', '---\nname: api-review\ndescription: Review API contracts\n---\nReview the supplied API.\n')
await seed('.codex/agents/reviewer.toml', 'name = "reviewer"\ndescription = "Review changes"\ndeveloper_instructions = "Review carefully."\n')
await seed('.cursor/agents/readonly.md', '---\nname: readonly\ndescription: Read only review\nreadonly: true\n---\nRead only.\n')
for (let i = 0; i < 8; i++) {
  await seed(`.ccb/claude-configs/fixture-${i}.json`, { env: { ANTHROPIC_BASE_URL: 'https://example.invalid', ANTHROPIC_API_KEY: 'fixture-only' } })
  await seed(`.ccb/claude-configs/fixture-${i}.json.meta`, { name: `Fixture ${i}`, type: 'claude-code' })
}

await seed('.cursor/mcp.json',{mcpServers:{
  'cursor-docs':{...stdio,env:{API_KEY:'fixture-preview-secret'}},
  'docs-search':{command:'node',args:['conflicting-source']},
  'oauth-only':{type:'http',url:'https://example.invalid/mcp',oauth:{clientId:'fixture-only'}}
}})
await seed('fixture-project/.cursor/mcp.json',{mcpServers:{'project-docs':stdio}})
await seed('.agents/skills/linked-review/SKILL.md','---\nname: linked-review\ndescription: Shared reference\n---\nRead only.\n')
await fs.symlink(path.join(profile,'.agents/skills/linked-review'),path.join(profile,'.claude/skills/linked-review'),'junction')
await seed('.claude/skills/oversized/SKILL.md','x'.repeat(1024*1024+1))
await seed('.claude/skills/api-review/SKILL.md','---\nname: api-review\ndescription: Review API contracts\nallowed-tools: Read\ndisable-model-invocation: true\n---\n\n\n    Review the supplied API.  \n')
await seed('.claude/agents/reviewer.md','---\nname: reviewer\ndescription: Review changes\ndisallowedTools: Bash\npermissionMode: plan\n---\n\n\n    Review carefully.  \n')

const fixtureRegistry=JSON.parse(await fs.readFile(path.join(repo,'src/shared/builtin-tool-registry.json'),'utf8'))
fixtureRegistry.registryVersion='1.3.1'
fixtureRegistry.tools.find(tool=>tool.toolId==='codex-cli').artifacts.find(artifact=>artifact.artifactId==='user-config').paths.WINDOWS=['${HOME}/.codex/missing-first.toml','${HOME}/.codex/config.toml']
await seed('.ccb/registry/installed.json',fixtureRegistry)
const report = { profile, checks: [], screenshots: [], errors: [], contrast: [] }
const actualHome = process.env.USERPROFILE
const realFiles = ['.claude.json', '.claude/settings.json', '.codex/config.toml', '.gemini/settings.json', '.ccb/managed-mode-config.json']
const realHashes = async () => Object.fromEntries(await Promise.all(realFiles.map(async file => {
  try { return [file, createHash('sha256').update(await fs.readFile(path.join(actualHome, file))).digest('hex')] }
  catch (e) { if (e.code === 'ENOENT') return [file, null]; throw e }
})))
const before = await realHashes()
const networkFixture = await createNetworkSafetyFixture(profile)
const server = net.createServer()
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
await new Promise(resolve => server.close(resolve))
const env = { ...process.env, CCB_QA_PROFILE: profile, USERPROFILE: profile, HOME: profile,
  HOMEDRIVE: path.parse(profile).root.slice(0, 2), HOMEPATH: profile.slice(2), APPDATA: path.join(profile, 'AppData/Roaming'),
  LOCALAPPDATA: path.join(profile, 'AppData/Local'), XDG_CONFIG_HOME: path.join(profile, '.config'),
  CLAUDE_CONFIG_DIR: path.join(profile, '.claude'), NODE_ENV: 'production', ANTHROPIC_API_KEY: 'fixture-only', OPENAI_API_KEY: 'fixture-only', GEMINI_API_KEY: 'fixture-only', NO_PROXY: 'localhost,127.0.0.1,::1', NODE_EXTRA_CA_CERTS: networkFixture.caPath }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(path.join(repo, 'node_modules/electron/dist/electron.exe'), [wrapper,
  `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], { env, cwd: wrapper, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', x => { output += x.toString() })
child.stderr.on('data', x => { output += x.toString() })
let socket, next = 0
const pending = new Map()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function command(method, params = {}) {
  const id = ++next
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)) }, 20000)
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function until(expression) {
  for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await wait(100) }
  throw Error('Condition timed out: ' + expression)
}
async function click(selector) {
  const position = await evaluate(`(()=>{let e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e=e.closest('.monaco-editor')||e.closest('.ant-select')||e;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  assert(position, selector)
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...position, button: 'left', clickCount: 1 })
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...position, button: 'left', clickCount: 1 })
  await wait(100)
}
async function textClick(text, selector = 'button') {
  assert(await evaluate(`(()=>{const normalize=s=>s.replaceAll(' ','').replaceAll('\\n','').trim();const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden'&&normalize(e.textContent)===normalize(${JSON.stringify(text)}));if(!e)return false;e.click();return true})()`), text)
  await wait(120)
}
async function chooseAgent(label) {
  await evaluate(`document.querySelector('#global-agent-selector').focus()`)
  for (const [key,code] of [['Escape',27],['ArrowDown',40]]) {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code })
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code })
    await wait(80)
  }
  await until(`[...document.querySelectorAll('.ant-select-item-option')].some(e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden')`)
  await textClick(label, '.ant-select-item-option')
  await until(`!document.querySelector('#global-agent-selector').closest('.ant-select').classList.contains('ant-select-open')`)
}
async function typeInput(selector, value) {
  if(selector.includes('.monaco-editor')) {
    const file=(await fs.readdir(path.join(repo, 'out/renderer/assets'))).find(n=>n.startsWith('monaco-runtime-')&&n.endsWith('.js'))
    assert(file)
    await evaluate(`(async()=>{const {default:core}=await import(new URL('assets/'+${JSON.stringify(file)},location.href).href);const editor=core.editor.getEditors().find(e=>e.getDomNode()?.getBoundingClientRect().height>0&&!e.getRawOptions().readOnly);if(!editor)throw Error('Editable Monaco instance missing');editor.focus();editor.getModel().setValue(${JSON.stringify(value)})})()`)
    await wait(200)
    return
  }
  await click(selector)
  await command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
  await command('Input.insertText', { text: value })
  await wait(200)
}
async function shot(name) {
  await wait(500)
  await fs.writeFile(path.join(profile, 'capture-request.json'), JSON.stringify({ name }))
  let data
  for (let i = 0; i < 120; i++) {
    try { data = await fs.readFile(path.join(profile, name + '.png')); break } catch (e) { if (e.code !== 'ENOENT') throw e }
    await wait(50)
  }
  assert(data, 'Native capture timed out: ' + name)
  const file = path.join(shots, name + '.png')
  await fs.writeFile(file, data); report.screenshots.push(file)
}
const pass = text => { report.checks.push(text); console.log('PASS ' + text) }
try {
  let target
  for (let i = 0; i < 160; i++) {
    if (child.exitCode !== null) throw Error('Electron exited ' + child.exitCode + '\n' + output.slice(-1500))
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith('file:')) } catch {}
    if (target) break
    await wait(150)
  }
  assert(target, 'Production renderer did not start')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result) }
    else if (message.method === 'Runtime.exceptionThrown') report.errors.push(message.params)
  })
  await command('Runtime.enable'); await command('Page.enable')
  await command('Emulation.setFocusEmulationEnabled', { enabled: true })
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false })
  await until(`!!window.electronAPI?.agentResources && document.querySelectorAll('button.nav-item').length>5 && !document.querySelector('.loading-screen.visible')`)
  assert.equal(await evaluate('typeof require'), 'undefined')
  const cfgs = await evaluate('window.electronAPI.config.list()')
  assert(cfgs.success && cfgs.data.every(c => c.path.toLowerCase().startsWith(profile.toLowerCase())))
  pass('Real Electron45 sandbox and isolated legacy paths')
  assert.equal(await evaluate(`document.querySelectorAll('#global-agent-selector').length`), 1)
  assert.equal(await evaluate(`document.querySelector('.sidebar-nav').textContent.includes('AI 工具配置')`), false)
  await textClick('MCP管理', 'button.nav-item').catch(async () => textClick('MCP 管理', 'button.nav-item'))
  await until(`document.querySelectorAll('.resource-row').length>0`)

  const visible = expression => evaluate("(()=>{const items=[...document.querySelectorAll("+JSON.stringify(expression)+")];return items.filter(e=>e.getBoundingClientRect().height>0&&getComputedStyle(e).visibility!=='hidden').length})()")
  const closeTopModal = async () => {
    await evaluate("(()=>{const e=[...document.querySelectorAll('.ant-modal-close')].filter(e=>e.getBoundingClientRect().height>0).at(-1);if(!e)throw Error('Visible modal close missing');e.click()})()")
    await wait(150)
  }
  const closeDrawer = async () => {
    await evaluate("(()=>{const e=[...document.querySelectorAll('.ant-drawer-close')].filter(e=>e.getBoundingClientRect().height>0).at(-1);if(!e)throw Error('Visible drawer close missing');e.click()})()")
    await wait(150)
  }
  const row = async name => {
    assert(await evaluate("(()=>{const e=[...document.querySelectorAll('.resource-row')].find(e=>e.querySelector('strong')?.textContent==="+JSON.stringify(name)+");e?.click();return !!e})()"),'Resource '+name)
    await wait(80)
  }
  const checkResource = async name => {
    assert(await evaluate("(()=>{const labels=[...document.querySelectorAll('.resource-import-selection .ant-checkbox-wrapper')];const e=labels.find(e=>e.querySelector('strong')?.textContent==="+JSON.stringify(name)+");if(!e)return false;e.querySelector('input').click();return true})()"),'Import '+name)
    await wait(100)
  }
  const openNative = async name => {
    await textClick('配置管理','button.nav-item'); await textClick('原生文件','.ant-tabs-tab')
    await until("document.querySelectorAll('.ai-tool-management-panel .ant-list-item').length>0")
    assert(await evaluate("(()=>{const e=[...document.querySelectorAll('.ai-tool-management-panel .ant-list-item')].find(e=>e.textContent.includes("+JSON.stringify(name)+"));const b=[...e.querySelectorAll('button')].find(b=>b.textContent.trim()==='打开');b?.click();return !!b})()"))
    await until("[...document.querySelectorAll('.ant-modal .monaco-editor .view-lines')].some(e=>e.getBoundingClientRect().height>0)")
  }
  const bridge = async (method,args) => evaluate('window.electronAPI.'+method+'(...'+JSON.stringify(args)+')')
  const editValue = async () => {
    const file=(await fs.readdir(path.join(repo,'out/renderer/assets'))).find(n=>n.startsWith('monaco-runtime-')&&n.endsWith('.js'))
    return evaluate("(async()=>{const{default:core}=await import(new URL('assets/'+ "+JSON.stringify(file)+",location.href).href);return core.editor.getEditors().find(e=>e.getDomNode()?.getBoundingClientRect().height>0&&!e.getRawOptions().readOnly)?.getValue()})()")
  }

  await textClick('Skills管理','button.nav-item')
  await until("document.querySelectorAll('.resource-row').length>=3")
  await row('linked-review')
  assert.equal(await evaluate("[...document.querySelectorAll('.resource-inspector button')].find(b=>b.textContent.includes('编辑定义')).disabled"),true)
  assert.equal(await evaluate("[...document.querySelectorAll('.resource-inspector button')].find(b=>b.textContent.includes('删除定义')).disabled"),true)
  await textClick('定义预览'); await until("!!document.querySelector('.monaco-editor')")
  await until("document.querySelector('.ant-drawer-body')?.textContent.includes('linked-review')")
  await closeDrawer()
  await row('api-review')
  assert.equal(await evaluate("[...document.querySelectorAll('.resource-inspector button')].find(b=>b.textContent.includes('编辑定义')).disabled"),false)
  await shot('skills-readable-siblings-and-shared-reference')
  pass('Real installed-junction shape is readable without hiding valid or invalid siblings; reference writes are disabled')

  await textClick('MCP管理','button.nav-item')
  for(const agent of ['Codex CLI','Gemini CLI','Antigravity','Claude Code']){
    await chooseAgent(agent)
    await until("document.querySelector('.agent-resource-page')?.textContent.includes('docs-search')")
  }
  pass('All four global targets reload their own native MCP resources')

  await textClick('从其他工具导入')
  await until("document.querySelectorAll('.resource-import-selection input[type=checkbox]').length>0")
  assert(await evaluate("document.querySelector('#resource-source').closest('.ant-select').textContent.includes('Cursor')"))
  const cursorFile=path.join(profile,'.cursor/mcp.json')
  const cursorOriginal=await fs.readFile(cursorFile,'utf8')
  const cursorChanged=JSON.parse(cursorOriginal)
  cursorChanged.mcpServers['rescan-only']=stdio
  await fs.writeFile(cursorFile,JSON.stringify(cursorChanged))
  await textClick('刷新','.ant-modal button')
  await until("document.querySelectorAll('.resource-import-selection input[type=checkbox]').length===4")
  await fs.writeFile(cursorFile,'{"mcpServers":{}}')
  await textClick('刷新','.ant-modal button')
  await until("document.querySelector('#resource-source').closest('.ant-select').textContent.includes('Codex CLI')&&document.querySelectorAll('.resource-import-selection input[type=checkbox]').length===1")
  await fs.writeFile(cursorFile,cursorOriginal)
  await click('.ant-modal [aria-label="文件所属工具"]')
  await until("[...document.querySelectorAll('.ant-select-item-option-content')].some(e=>e.textContent==='Cursor'&&e.getBoundingClientRect().height>0)")
  await textClick('Cursor','.ant-select-item-option-content')
  await until("document.querySelector('#resource-source').closest('.ant-select').textContent.includes('Cursor')&&document.querySelectorAll('.resource-import-selection input[type=checkbox]').length===3")
  await textClick('选择配置文件或资源目录')
  await until("document.querySelector('#resource-source').closest('.ant-select').textContent.includes('FILE')&&document.querySelectorAll('.resource-import-selection input[type=checkbox]').length===3")
  pass('Empty defaults fall through to the next usable source; rescanning and the native file picker reload source state')
  await checkResource('cursor-docs'); await checkResource('docs-search'); await checkResource('oauth-only')
  await textClick('预览转换')
  await until("document.querySelectorAll('.ant-collapse-item').length>=3")
  for(const name of ['cursor-docs','docs-search','oauth-only']) assert(await evaluate("(()=>{const e=[...document.querySelectorAll('.ant-collapse-header strong')].find(e=>e.textContent==="+JSON.stringify(name)+");e?.closest('.ant-collapse-header').click();return !!e})()"))
  await until("document.querySelectorAll('.resource-diff').length===3")
  const preview = await evaluate("document.querySelector('.ant-modal-body').textContent")
  assert(preview.includes('API_KEY'))
  assert(!preview.includes('fixture-preview-secret'))
  assert(preview.includes('无法自动转换'))
  assert.equal(await evaluate("[...document.querySelectorAll('.resource-decision .ant-select')].filter(e=>e.textContent.includes('保留现有')).length>0"),true)
  await fs.writeFile(path.join(profile,'hold-resource-apply'),'hold')
  await textClick('确认导入')
  await until("window.__CCB_HAS_PENDING_CHANGES__===true")
  await click('#global-agent-selector')
  assert(await evaluate("document.querySelector('#global-agent-selector').closest('.ant-select').textContent.includes('Claude Code')"))
  await evaluate("void window.electronAPI.app.quit()")
  await wait(180)
  assert.equal(child.exitCode,null)
  await fs.unlink(path.join(profile,'hold-resource-apply'))
  await until("!!document.querySelector('.resource-receipts')")
  await shot('default-discovery-preview-and-import-receipt')
  await textClick('关闭')
  const imported = await fs.readFile(path.join(profile,'.claude.json'),'utf8')
  assert(imported.includes('9007199254740993123'))
  assert(imported.includes('cursor-docs'))
  assert(!imported.includes('oauth-only'))
  assert.deepEqual(JSON.parse(imported).mcpServers['docs-search'],stdio)
  assert.equal(JSON.parse(imported).mcpServers['cursor-docs'].env.API_KEY,'fixture-preview-secret')
  pass('Default Cursor discovery, masked preview, default skip, blocked conversion, write receipt and busy switch/exit guards')

  await textClick('从其他工具导入')
  await until("document.querySelectorAll('.resource-import-selection input[type=checkbox]').length>0")
  await textClick('识别项目目录')
  await until("document.querySelector('#resource-source').closest('.ant-select').textContent.includes('PROJECT')&&document.querySelectorAll('.resource-import-selection input[type=checkbox]').length===1")
  assert(await evaluate("document.querySelector('.resource-import-selection').textContent.includes('project-docs')"))
  await shot('project-discovery-source-scope')
  await textClick('关闭')
  pass('The native project picker reads the explicitly selected project and replaces the previous source scope')

  await row('cursor-docs'); await textClick('删除定义')
  await until("!!document.querySelector('.ant-modal-confirm')")
  const beforeDelete=await fs.readFile(path.join(profile,'.claude.json'),'utf8')
  const changedBeforeDelete=beforeDelete.replace('fixture-preview-secret','external-changed-fixture-secret')
  assert.notEqual(changedBeforeDelete,beforeDelete)
  await fs.writeFile(path.join(profile,'.claude.json'),changedBeforeDelete)
  await click('.ant-modal-confirm .ant-btn-primary')
  await until("document.querySelector('.agent-resource-page')?.textContent.includes('变化')")
  assert.equal(await fs.readFile(path.join(profile,'.claude.json'),'utf8'),changedBeforeDelete)
  await textClick('取消','.ant-modal-confirm button')
  pass('A delete rejected after an external change keeps the original file, a visible error and a usable confirmation dialog')

  await until("document.querySelector('.agent-resource-page')?.textContent.includes('docs-search')")
  await row('docs-search')
  await textClick('删除定义'); await until("!!document.querySelector('.ant-modal-confirm')")
  await click('.ant-modal-confirm .ant-btn-primary')
  await until("![...document.querySelectorAll('.resource-row strong')].some(e=>e.textContent==='docs-search')")
  const current = await fs.readFile(path.join(profile,'.claude.json'),'utf8')
  const later = current.replace('"mcpServers": {','"mcpServers": {"later-server":{"command":"node","args":["later"]},')
  assert.notEqual(later,current)
  await fs.writeFile(path.join(profile,'.claude.json'),later)
  await textClick('从备份恢复')
  await until("document.querySelectorAll('.resource-import-selection input[type=checkbox]').length>0")
  assert.equal(await visible('.ai-tool-management-panel'),0)
  await checkResource('docs-search'); await textClick('预览转换')
  await until("document.querySelectorAll('.ant-collapse-item').length>0")
  await textClick('确认导入'); await until("!!document.querySelector('.resource-receipts')")
  await textClick('关闭')
  const restoredMcp=await fs.readFile(path.join(profile,'.claude.json'),'utf8')
  assert(restoredMcp.includes('later-server'))
  assert(restoredMcp.includes('cursor-docs'))
  assert.equal(JSON.parse(restoredMcp).mcpServers['cursor-docs'].env.API_KEY,'external-changed-fixture-secret')
  assert(restoredMcp.includes('9007199254740993123'))
  assert(restoredMcp.includes('docs-search'))
  pass('Delete and restore one MCP server without reverting later servers or unrelated raw data')

  await fs.unlink(path.join(profile,'.claude.json'))
  await click('.resource-page-meta button[aria-label="刷新"]')
  await textClick('从备份恢复')
  await until("document.querySelectorAll('.resource-import-selection input[type=checkbox]').length>0")
  await checkResource('cursor-docs'); await textClick('预览转换')
  await until("document.querySelectorAll('.ant-collapse-item').length>0")
  await textClick('确认导入'); await until("!!document.querySelector('.resource-receipts')")
  await textClick('关闭')
  assert((await fs.readFile(path.join(profile,'.claude.json'),'utf8')).includes('cursor-docs'))
  pass('MCP history remains usable after the native file disappears')

  await textClick('Skills管理','button.nav-item')
  await until("document.querySelectorAll('.resource-row').length>0")
  await textClick('项目、归档与导入导出')
  await until("document.querySelectorAll('.ant-table-row').length>0")
  assert(await evaluate("(()=>{const row=[...document.querySelectorAll('.ant-table-row')].find(e=>e.textContent.includes('api-review'));const b=[...row.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.includes('编辑')||b.querySelector('[aria-label=edit]'));b?.click();return !!b})()"))
  await until("!!document.querySelector('#description')")
  await typeInput('#description','Review: keep attachments')
  await textClick('保存')
  await until("![...document.querySelectorAll('.ant-modal')].some(e=>e.getBoundingClientRect().height>0)")
  assert.equal(await fs.readFile(path.join(profile,'.claude/skills/api-review/references/notes.txt'),'utf8'),'attachment fixture\n')
  const skillSaved=await fs.readFile(path.join(profile,'.claude/skills/api-review/SKILL.md'),'utf8')
  assert(skillSaved.includes('allowed-tools: Read'))
  assert(skillSaved.includes('disable-model-invocation: true'))
  assert(skillSaved.includes('Review: keep attachments'))
  assert.equal(skillSaved.split('\n---\n')[1],'\n\n    Review the supplied API.  \n')
  await closeDrawer()
  pass('Legacy Skill editing preserves complete package and native invocation restrictions')

  await textClick('子Agent管理','button.nav-item')
  await until("document.querySelectorAll('.resource-row').length>0")
  await textClick('项目、归档与导入导出')
  await until("document.querySelectorAll('.ant-table-row').length>0")
  assert(await evaluate("(()=>{const row=[...document.querySelectorAll('.ant-table-row')].find(e=>e.textContent.includes('reviewer'));const b=[...row.querySelectorAll('button')].find(b=>b.querySelector('[aria-label=edit]'));b?.click();return !!b})()"))
  await until("!!document.querySelector('#description')")
  await typeInput('#description','Review: keep permissions')
  await textClick('保存')
  await until("![...document.querySelectorAll('.ant-modal')].some(e=>e.getBoundingClientRect().height>0)")
  const roleSaved=await fs.readFile(path.join(profile,'.claude/agents/reviewer.md'),'utf8')
  assert(roleSaved.includes('disallowedTools: Bash'))
  assert(roleSaved.includes('permissionMode: plan'))
  assert.equal(roleSaved.split('\n---\n')[1],'\n\n    Review carefully.  \n')
  await closeDrawer()
  pass('Legacy role editing preserves fields that are not exposed in the old form')

  await textClick('MCP管理','button.nav-item')
  await until("document.querySelectorAll('.resource-row').length>0")
  const beforeInvalid=await fs.readFile(path.join(profile,'.claude.json'),'utf8')
  await row('cursor-docs'); await textClick('编辑定义')
  await until("!!document.querySelector('.monaco-editor .view-lines')")
  await typeInput('.monaco-editor .view-lines','{')
  await textClick('保存')
  await until("document.querySelector('.ant-drawer-body')?.textContent.includes('JSON')")
  assert.equal(await fs.readFile(path.join(profile,'.claude.json'),'utf8'),beforeInvalid)
  await closeDrawer(); await chooseAgent('Codex CLI')
  await until("document.body.textContent.includes('先处理未保存的草稿')")
  await textClick('保存并继续')
  await until("document.body.textContent.includes('保存未完成')")
  assert(await evaluate("document.querySelector('#global-agent-selector').closest('.ant-select').textContent.includes('Claude Code')"))
  await textClick('留在当前')
  await chooseAgent('Codex CLI'); await until("document.body.textContent.includes('先处理未保存的草稿')")
  await textClick('放弃修改并继续')
  await until("document.querySelector('#global-agent-selector').closest('.ant-select').textContent.includes('Codex CLI')")
  pass('Failed save preserves original bytes and draft; failed save-before-switch stays on the original target')

  await openNative('config.toml')
  const beforeEdit=await fs.readFile(path.join(profile,'.codex/config.toml'),'utf8')
  assert.equal(await editValue(),beforeEdit)
  pass('Clicking the existing second native candidate preserves its exact path when the first authorized candidate is missing')
  await typeInput('.monaco-editor .view-lines',beforeEdit+'# draft-before-external-edit\n')
  await fs.writeFile(path.join(profile,'.codex/config.toml'),beforeEdit+'# external-edit-must-survive\n')
  await textClick('保存'); await until("!!document.querySelector('.ant-modal-confirm')")
  await click('.ant-modal-confirm .ant-btn-primary')
  await until("document.body.textContent.includes('配置已变化')")
  assert((await fs.readFile(path.join(profile,'.codex/config.toml'),'utf8')).includes('external-edit-must-survive'))
  assert((await editValue()).includes('draft-before-external-edit'))
  await textClick('取消','.ant-modal-confirm button')
  await closeTopModal(); await until("document.body.textContent.includes('先处理未保存的草稿')")
  await textClick('放弃修改并继续')
  pass('Native file editing rejects an external change and keeps the unsaved editor draft')

  await openNative('config.toml')
  await textClick('创建备份')
  await typeInput('.monaco-editor .view-lines',beforeEdit+'# draft-selected-for-save\n')
  await textClick('历史备份')
  await until("document.querySelectorAll('.backup-meta-description').length>0")
  await textClick('恢复')
  await until("document.body.textContent.includes('先处理未保存的草稿')")
  await textClick('留在当前')
  assert((await editValue()).includes('draft-selected-for-save'))
  await textClick('恢复')
  await until("document.body.textContent.includes('先处理未保存的草稿')")
  await textClick('保存并继续')
  await until("!!document.querySelector('.artifact-restore-preview')")
  assert(await evaluate("document.querySelector('.artifact-restore-preview').textContent.includes('draft-selected-for-save')"))
  await shot('native-restore-explicit-whole-file-preview')
  await textClick('备份当前版本并恢复整份文件')
  await until("!document.querySelector('.artifact-restore-preview')")
  const copies=await bridge('toolRegistry.listArtifactBackups',['codex-cli','user-config',path.join(profile,'.codex/config.toml')])
  assert(copies.success && copies.data.length>=3)
  const contents=await Promise.all(copies.data.map(copy=>bridge('toolRegistry.readArtifactBackup',[copy.backupId])))
  assert(contents.some(copy=>copy.data?.content.includes('draft-selected-for-save')))
  await closeTopModal()
  pass('Whole-file restore requires a draft decision, shows both versions and saves a rollback copy of current bytes')

  await fs.unlink(path.join(profile,'.codex/config.toml'))
  await textClick('刷新','.ai-tool-management-panel button')
  await openNative('config.toml')
  await textClick('历史备份'); await until("document.querySelectorAll('.backup-meta-description').length>0")
  await textClick('恢复'); await until("!!document.querySelector('.artifact-restore-preview')")
  assert(await evaluate("document.querySelector('.artifact-restore-preview').textContent.includes('当前文件不存在')"))
  await textClick('备份当前版本并恢复整份文件')
  await until("!document.querySelector('.artifact-restore-preview')")
  assert((await fs.readFile(path.join(profile,'.codex/config.toml'),'utf8')).length>0)
  await closeTopModal()
  pass('A missing native file remains discoverable and can be restored under its registry creation permission')

  await fs.unlink(path.join(profile,'.codex/config.toml'))
  await textClick('刷新','.ai-tool-management-panel button')
  await openNative('config.toml')
  const createdSecond='model = "selected-second-candidate"\n'
  await typeInput('.monaco-editor .view-lines',createdSecond)
  await textClick('保存'); await until("!!document.querySelector('.ant-modal-confirm')")
  await click('.ant-modal-confirm .ant-btn-primary')
  await until("![...document.querySelectorAll('.ant-modal-confirm')].some(e=>e.getBoundingClientRect().height>0)")
  assert.equal(await fs.readFile(path.join(profile,'.codex/config.toml'),'utf8'),createdSecond)
  await assert.rejects(fs.stat(path.join(profile,'.codex/missing-first.toml')),{code:'ENOENT'})
  await closeTopModal()
  pass('Creating a missing second native candidate writes only that explicitly selected main-authorized path')

  await textClick('MCP管理','button.nav-item')
  await chooseAgent('Claude Code')
  for(const theme of ['CCB Dark Pro','CCB Minimal','CCB Terminal','CCB Light']){
    await textClick('','button[aria-label="界面主题"]')
    await until("document.querySelectorAll('.ant-dropdown-menu-item').length>0")
    await textClick(theme,'.ant-dropdown-menu-item')
    await wait(150)
    const slug=theme.toLowerCase().replaceAll(' ','-')
    await shot(slug+'-resource-workspace')
  }
  report.sidebarGroups=await evaluate("[...document.querySelectorAll('.sidebar-nav .nav-section')].map(e=>e.textContent)")
  const toolsGroup=report.sidebarGroups.find(s=>s.includes('工具')&&s.includes('环境排查'))
  assert(toolsGroup && toolsGroup.includes('自动化规则'))
  assert(!report.sidebarGroups.find(s=>s.includes('Claude Code')&&s.includes('自动化规则')))
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false)
  await shot('desktop-1280-navigation')
  pass('All four themes, 1280 desktop layout and corrected Tools navigation render in real Electron')

  await networkFixture.run(bridge, pass)
  assert.equal(await evaluate('window.__CCB_HAS_PENDING_CHANGES__'),false)
  assert.deepEqual(report.errors,[],'Renderer exceptions must be handled, including expected save conflicts')
  await evaluate('void window.electronAPI.app.quit()')
  for (let i=0;i<100 && child.exitCode===null;i++) await wait(100)
  assert.equal(child.exitCode,0,'Clean Electron shutdown')
  report.normalExit=true
  pass('Clean quit waits for completed writes and exits normally')
  report.result='passed'

} catch (error) {
  report.result = 'failed'; report.failure = error.stack
  if (socket) { try { report.diagnostic = await evaluate(`({html:document.body.innerHTML.slice(-3500),dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],root:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(e=>({tag:e.tagName,cls:e.className,style:e.getAttribute('style'),rect:e.getBoundingClientRect().toJSON()}))})`) } catch {} }
  if (socket) { try { await shot('failure') } catch {} }
  console.error(error)
} finally {
  if (socket?.readyState === WebSocket.OPEN) { try { await evaluate('window.__CCB_HAS_PENDING_CHANGES__=false;window.electronAPI.app.quit()') } catch {} }
  await wait(1200)
  if (child.exitCode === null) child.kill()
  socket?.close()
  await networkFixture.close()
  report.realUserFilesUnchanged = JSON.stringify(before) === JSON.stringify(await realHashes())
  assert(report.realUserFilesUnchanged, 'Real user configuration changed')
  await fs.writeFile(path.join(shots, 'qa-report.json'), JSON.stringify(report, null, 2))
  await fs.writeFile(path.join(shots, 'process.log'), output)
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, screenshots: report.screenshots.length, reportPath: path.join(shots,'qa-report.json'), failure: report.failure }))
  if (report.result !== 'passed') process.exitCode = 1
}
