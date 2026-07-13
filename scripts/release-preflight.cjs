/**
 * @file CCB release preflight
 * @description 静态检查版本、installer identity、双语文档、private key 泄漏与 registry production trust key。
 */

const { readFile } = require('fs/promises')
const path = require('path')
const { execFileSync } = require('child_process')

/** 读取 UTF-8 文本文件。 */
async function readText(rootDir, relativePath) {
  return readFile(path.join(rootDir, relativePath), 'utf8')
}

/**
 * 对 repository snapshot 执行纯静态 release checks。
 * @param input 已读取的关键文件内容与 tracked file contents
 */
function auditReleaseSnapshot(input) {
  const errors = []
  const warnings = []
  const packageJson = JSON.parse(input.packageJson)
  const packageLock = JSON.parse(input.packageLock)
  const version = packageJson.version

  if (packageLock.version !== version || packageLock.packages?.['']?.version !== version) {
    errors.push('package.json 与 package-lock.json root version 不一致')
  }
  if (!input.constantsSource.includes(`version: packageJson.version`)) {
    errors.push('APP_INFO version 未绑定 package.json')
  }
  if (!input.readmeEn.includes(`\`${version}\``) || !input.readmeZh.includes(`\`${version}\``)) {
    errors.push('双语 README 未声明当前 package version')
  }
  if (!input.changelog.includes(`[Unreleased] - ${version}`)) {
    errors.push('CHANGELOG Unreleased version 与 package version 不一致')
  }
  if (packageJson.build?.appId !== 'com.claudecode.butler' || packageJson.build?.productName !== 'CCB') {
    errors.push('Installer identity 与兼容 contract 不一致')
  }
  if (!String(packageJson.build?.portable?.artifactName).includes('${version}') ||
      !String(packageJson.build?.nsis?.artifactName).includes('${version}')) {
    errors.push('Windows installer artifactName 必须包含 ${version}')
  }
  if (!/多 AI Agent|multi[- ]AI/i.test(packageJson.description)) {
    errors.push('Package description 未表达多 AI Agent 管理范围')
  }

  const requiredWindowSecurityTokens = [
    'nodeIntegration: false',
    'contextIsolation: true',
    'sandbox: true',
    'webSecurity: true',
    'allowRunningInsecureContent: false',
    'setWindowOpenHandler',
    "webContents.on('will-navigate'"
  ]
  for (const token of requiredWindowSecurityTokens) {
    if (!input.windowManagerSource.includes(token)) {
      errors.push(`Electron window security contract 缺失: ${token}`)
    }
  }

  const privateKeyMarker = /-----BEGIN (?:(?:ENCRYPTED|RSA|DSA|EC|OPENSSH) )?PRIVATE KEY-----/
  for (const file of input.trackedFiles) {
    if (privateKeyMarker.test(file.content)) {
      errors.push(`Tracked file 包含 private key marker: ${file.path}`)
    }
  }

  const trustMapMatch = input.registryUpdateSource.match(
    /REGISTRY_TRUSTED_PUBLIC_KEYS[^=]*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/
  )
  const trustMapBody = trustMapMatch?.[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim() ?? ''
  const trustMapEmpty = !/(?:['"][^'"]+['"]|[A-Za-z_$][\w$-]*)\s*:/.test(trustMapBody)
  if (trustMapEmpty) {
    const message = 'REGISTRY_TRUSTED_PUBLIC_KEYS 尚未注入 production publisher public key'
    if (input.allowPreviewRegistry) warnings.push(message)
    else errors.push(message)
  }

  return { version, errors, warnings }
}

/**
 * 从工作区读取 preflight 输入并执行检查。
 * @param rootDir repository root
 * @param allowPreviewRegistry 是否允许空 registry trust map
 */
async function runPreflight(rootDir, allowPreviewRegistry) {
  const trackedPaths = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-files', '-z'],
    { cwd: rootDir, encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean)
  const trackedFiles = await Promise.all(trackedPaths.map(async (relativePath) => ({
    path: relativePath,
    content: await readText(rootDir, relativePath)
  })))
  return auditReleaseSnapshot({
    packageJson: await readText(rootDir, 'package.json'),
    packageLock: await readText(rootDir, 'package-lock.json'),
    constantsSource: await readText(rootDir, 'src/shared/constants.ts'),
    registryUpdateSource: await readText(rootDir, 'src/main/services/registry-update-service.ts'),
    windowManagerSource: await readText(rootDir, 'src/main/window-manager.ts'),
    readmeEn: await readText(rootDir, 'README.md'),
    readmeZh: await readText(rootDir, 'README_CN.md'),
    changelog: await readText(rootDir, 'CHANGELOG.md'),
    trackedFiles,
    allowPreviewRegistry
  })
}

/** CLI entry point。 */
async function main() {
  const allowPreviewRegistry = process.argv.includes('--allow-preview-registry')
  const result = await runPreflight(process.cwd(), allowPreviewRegistry)
  for (const warning of result.warnings) process.stderr.write(`WARNING: ${warning}\n`)
  if (result.errors.length > 0) {
    for (const error of result.errors) process.stderr.write(`ERROR: ${error}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`Release preflight passed for CCB ${result.version}\n`)
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = { auditReleaseSnapshot, runPreflight }
