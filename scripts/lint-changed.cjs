/**
 * @file Lint ratchet（增量 lint 门禁）
 * @description 对相对 base 分支变更的 src 下 TypeScript 文件比较 HEAD 与 base 的 ESLint error 数：
 *              存量 error 不阻塞、不得新增——新增文件必须干净，触碰文件 error 数不得增长。
 *              防止 lint 债务在 CI informational 全量 lint 下无声增长。
 */

const { execFileSync } = require('child_process')
const { ESLint } = require('eslint')

/** 解析 base revision：优先 origin/main，回退 main。 */
function resolveBaseRevision() {
  for (const candidate of ['origin/main', 'main']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], { encoding: 'utf8' })
      return candidate
    } catch {
      // 尝试下一个候选
    }
  }
  throw new Error('lint:changed 找不到 base 分支（origin/main 或 main）')
}

/** 列出相对 merge-base 新增/修改的 src TS 文件。 */
function listChangedFiles(base) {
  const mergeBase = execFileSync('git', ['merge-base', 'HEAD', base], { encoding: 'utf8' }).trim()
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase}...HEAD`],
    { encoding: 'utf8' }
  )
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => /^src\/.*\.(ts|tsx)$/.test(file))
}

async function main() {
  const base = resolveBaseRevision()
  const changedFiles = listChangedFiles(base)
  if (changedFiles.length === 0) {
    process.stdout.write('lint:changed: 没有相对 base 变更的 src 文件，跳过\n')
    return
  }

  const eslint = new ESLint()
  const headResults = await eslint.lintFiles(changedFiles)
  const headErrorByFile = new Map()
  for (const result of headResults) {
    const normalized = result.filePath.replace(/\\/g, '/')
    for (const file of changedFiles) {
      if (normalized.endsWith(file)) {
        headErrorByFile.set(file, result.errorCount)
      }
    }
  }

  const failures = []
  let totalHeadErrors = 0
  for (const file of changedFiles) {
    const headCount = headErrorByFile.get(file) ?? 0
    totalHeadErrors += headCount
    // 干净的文件不可能比 base 更差，无需回查 base
    if (headCount === 0) continue

    let baseContent
    try {
      baseContent = execFileSync('git', ['show', `${base}:${file}`], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
      })
    } catch {
      failures.push(`${file}: 新增文件存在 ${headCount} 个 lint error（新增文件必须干净）`)
      continue
    }

    const baseResults = await eslint.lintText(baseContent, { filePath: file })
    const baseCount = baseResults.reduce((total, result) => total + result.errorCount, 0)
    if (headCount > baseCount) {
      failures.push(`${file}: lint error ${baseCount} -> ${headCount}（不得新增）`)
    }
  }

  process.stdout.write(
    `lint:changed: 检查 ${changedFiles.length} 个变更文件（base=${base}），HEAD error 总数 ${totalHeadErrors}\n`
  )
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`ERROR: ${failure}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('lint:changed: 通过，未新增 lint error\n')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
  process.exitCode = 1
})
