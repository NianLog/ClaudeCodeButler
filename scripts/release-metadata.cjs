const fs = require('fs/promises')
const { createReadStream } = require('fs')
const { createHash } = require('crypto')
const path = require('path')
const { execFileSync } = require('child_process')

async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

async function writeChecksums(outputDirectory, names) {
  const lines = []
  for (const name of names) {
    const filePath = path.join(outputDirectory, name)
    if (!(await fs.stat(filePath)).isFile()) throw new Error(`Not a release file: ${name}`)
    lines.push(`${await hashFile(filePath)}  ${name}`)
  }
  await fs.writeFile(path.join(outputDirectory, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`)
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const outputDirectory = path.resolve(process.argv[2] || path.join(root, 'release'))
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Run with npm run release:metadata')
  const sboms = [
    { name: 'ccb-build-dependencies.cdx.json', cwd: root, flags: ['--include=dev', '--include=optional'] },
    { name: 'proxy-production-dependencies.cdx.json', cwd: path.join(root, 'src/proxy-server'), flags: ['--omit=dev'] }
  ]
  for (const sbom of sboms) {
    const result = execFileSync(process.execPath, [npmCli, 'sbom', '--sbom-format=cyclonedx', '--package-lock-only', ...sbom.flags], {
      cwd: sbom.cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
    })
    const parsed = JSON.parse(result)
    if (parsed.bomFormat !== 'CycloneDX' || !Array.isArray(parsed.components)) throw new Error('Invalid SBOM')
    await fs.writeFile(path.join(outputDirectory, sbom.name), result)
  }
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  await fs.writeFile(path.join(outputDirectory, 'build-metadata.json'), JSON.stringify({
    version: pkg.version,
    electron: pkg.devDependencies.electron,
    node: process.version,
    sourceCommit: git(['rev-parse', 'HEAD']),
    sourceDirty: Boolean(git(['status', '--porcelain'])),
    sbomScope: 'Root build dependency graph includes renderer and Electron packages; proxy production graph is separate. Native Electron/Chromium internals are not enumerated.',
    createdAt: new Date().toISOString()
  }, null, 2))
  await writeChecksums(outputDirectory, [
    `CCB-Portable-${pkg.version}.exe`, `CCB-Setup-${pkg.version}.exe`, `CCB-${pkg.version}-win.zip`,
    ...sboms.map(item => item.name), 'build-metadata.json'
  ])
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
module.exports = { hashFile, writeChecksums }
