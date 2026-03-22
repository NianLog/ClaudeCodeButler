/**
 * 开发命令启动器
 * @description 在 Windows 下先把当前控制台 code page 切换为 UTF-8，再启动 electron-vite，避免 dev 模式主进程日志在终端显示为乱码。
 */

const { execFileSync, spawn } = require('child_process')
const path = require('path')

/**
 * 构建统一的 UTF-8 环境变量
 * @param {NodeJS.ProcessEnv} baseEnv 原始环境变量
 * @returns {NodeJS.ProcessEnv} 注入 UTF-8 相关变量后的环境变量
 */
function buildUtf8Env(baseEnv) {
  return {
    ...baseEnv,
    LANG: 'zh_CN.UTF-8',
    LC_ALL: 'zh_CN.UTF-8',
    PYTHONIOENCODING: 'utf-8'
  }
}

/**
 * 在 Windows 控制台内切换到 UTF-8 code page
 * @description electron-vite dev 在 Windows 下通过 stdio inherit 直连父控制台，因此必须在启动前把当前控制台切到 65001。
 */
function ensureWindowsConsoleUtf8() {
  if (process.platform !== 'win32') {
    return
  }

  try {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'chcp 65001 > nul'], {
      stdio: 'inherit',
      windowsHide: true
    })
    process.stdout?.setDefaultEncoding?.('utf8')
    process.stderr?.setDefaultEncoding?.('utf8')
  } catch {
    // 控制台编码设置失败时继续启动，避免阻塞开发流程。
  }
}

/**
 * 解析 electron-vite CLI 入口文件
 * @returns {string} electron-vite bin 的绝对路径
 */
function resolveElectronViteBinPath() {
  const packageJsonPath = require.resolve('electron-vite/package.json')
  return path.join(path.dirname(packageJsonPath), 'bin', 'electron-vite.js')
}

/**
 * 启动 electron-vite CLI
 * @param {string[]} cliArgs 透传给 electron-vite 的命令参数
 */
function run(cliArgs) {
  const child = spawn(process.execPath, [resolveElectronViteBinPath(), ...cliArgs], {
    stdio: 'inherit',
    env: buildUtf8Env(process.env),
    windowsHide: false
  })

  child.once('error', (error) => {
    console.error('[dev-runner] 启动 electron-vite 失败')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 0)
  })
}

ensureWindowsConsoleUtf8()
run(process.argv.slice(2))
