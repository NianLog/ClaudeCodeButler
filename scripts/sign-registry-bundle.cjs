/**
 * @file Offline registry bundle signing helper
 * @description 使用维护者离线保管的 Ed25519 private key 对 raw bundle bytes 签名并输出 manifest fields。
 */

const { createHash, createPrivateKey, sign } = require('crypto')
const { readFile } = require('fs/promises')

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024

/**
 * 对 raw bundle bytes 计算 manifest integrity/signature fields。
 * @param rawBundle 未规范化 bundle bytes（1 - MAX_BUNDLE_BYTES）
 * @param privateKeyPem Ed25519 private key PEM 文本
 * @param keyId stable lowercase kebab-case key identifier
 * @returns 可直接合并到 manifest 的 integrity/signature fields
 */
function buildBundleIntegrity(rawBundle, privateKeyPem, keyId) {
  if (!Buffer.isBuffer(rawBundle) || rawBundle.length === 0 || rawBundle.length > MAX_BUNDLE_BYTES) {
    throw new Error(`Bundle size must be 1-${MAX_BUNDLE_BYTES} bytes`)
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(keyId)) {
    throw new Error('key-id must be lowercase kebab-case')
  }
  const privateKey = createPrivateKey(privateKeyPem)
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('Private key must be Ed25519')
  }
  return {
    bundleSha256: createHash('sha256').update(rawBundle).digest('hex'),
    bundleSize: rawBundle.length,
    signatureAlgorithm: 'ED25519',
    keyId,
    signature: sign(null, rawBundle, privateKey).toString('base64')
  }
}

/**
 * 读取并验证命令行参数。
 * @returns bundle path、private key path 与 stable key identifier
 */
function readArguments() {
  const [, , bundlePath, privateKeyPath, keyId] = process.argv
  if (!bundlePath || !privateKeyPath || !keyId) {
    throw new Error('Usage: node scripts/sign-registry-bundle.cjs <bundle.json> <private-key.pem> <key-id>')
  }
  return { bundlePath, privateKeyPath, keyId }
}

/**
 * 生成可直接合并到 manifest 的 integrity/signature fields。
 */
async function main() {
  const { bundlePath, privateKeyPath, keyId } = readArguments()
  const [rawBundle, privateKeyPem] = await Promise.all([
    readFile(bundlePath),
    readFile(privateKeyPath, 'utf8')
  ])
  const output = buildBundleIntegrity(rawBundle, privateKeyPem, keyId)
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}

module.exports = { buildBundleIntegrity }
