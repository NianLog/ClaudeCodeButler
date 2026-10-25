const electron = require('electron')
const { app, BrowserWindow, dialog } = electron
const OffscreenWindow = class extends BrowserWindow {
  constructor(options) { super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } }); globalThis.__nativeQaWindow = this }
}
const electronProxy = new Proxy(electron, { get: (target, key) => key === 'BrowserWindow' ? OffscreenWindow : Reflect.get(target, key) })
const Module = require('node:module')
const originalLoad = Module._load
Module._load = function (request, ...args) { return request === 'electron' ? electronProxy : originalLoad.call(this, request, ...args) }
const fs = require('node:fs')
const path = require('node:path')
const root = process.env.CCB_QA_PROFILE
const repo = path.resolve(__dirname, '../../..')
const ownedRoot = path.join(repo, 'release', 'electron-e2e')
if (!root || !path.resolve(root).startsWith(ownedRoot + path.sep)) throw Error('Refuse unowned QA profile')
app.setPath('home', root)
app.setPath('userData', path.join(root, 'electron-user-data'))
app.setPath('appData', path.join(root, 'AppData/Roaming'))
app.setPath('temp', path.join(root, 'temp'))
BrowserWindow.prototype.show = function () {}
BrowserWindow.prototype.showInactive = function () {}
app.on('web-contents-created', (_, contents) => {
  contents.setBackgroundThrottling(false)
  contents.on('console-message', (_, details) => {
    if (details.level === 'error') fs.appendFileSync(path.join(root, 'renderer-errors.log'), details.message + '\n')
  })
})
app.whenReady().then(() => {
  let capturing = false
  const request = path.join(root, 'capture-request.json')
  const timer = setInterval(async () => {
    if (capturing || !fs.existsSync(request)) return
    capturing = true
    try {
      const name = JSON.parse(fs.readFileSync(request, 'utf8')).name
      fs.unlinkSync(request)
      if (!/^[a-z0-9-]{1,80}$/.test(name)) throw Error('Invalid capture name')
      const window = globalThis.__nativeQaWindow
      window.webContents.invalidate()
      await new Promise(resolve => setTimeout(resolve, 120))
      const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
      fs.writeFileSync(path.join(root, name + '.png'), image.toPNG())
    } catch (error) { fs.writeFileSync(path.join(root, 'capture-error.txt'), String(error)) }
    finally { capturing = false }
  }, 50)
  timer.unref()
  const { session } = require('electron')
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: /^https?:/.test(details.url) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/.test(details.url) })
  })
})
dialog.showOpenDialog = async (_window, options) => ({ canceled: false, filePaths: [
  options.properties.includes('openDirectory') ? path.join(root, 'fixture-project') : path.join(root, '.cursor/mcp.json')
] })
const {ipcMain}=electron
const handle=ipcMain.handle.bind(ipcMain)
ipcMain.handle=(channel,listener)=>handle(channel,async(...args)=>{
  const gate=path.join(root,'hold-resource-apply')
  if(channel==='agentResources:applyResourceImport' && fs.existsSync(gate)){
    const deadline=Date.now()+15000
    while(fs.existsSync(gate)){
      if(Date.now()>deadline)throw Error('Fixture apply gate timed out')
      await new Promise(resolve=>setTimeout(resolve,25))
    }
  }
  return listener(...args)
})
require(path.join(repo,'out/main/index.js'))
