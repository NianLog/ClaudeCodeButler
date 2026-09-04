/**
 * @file Registry detached signature verifier
 * @description 使用应用内置 Ed25519 public keys 验证远程规则库的 raw UTF-8 bytes。
 */

import { createPublicKey, verify } from 'crypto'

/** 应用信任的 registry publisher public key map。 */
export type RegistryTrustedPublicKeys = Readonly<Record<string, string>>

/**
 * 读取并验证应用信任的 Ed25519 public key。
 * @param keyId manifest 声明的 pinned key identifier
 * @param trustedPublicKeys 应用内置的 SPKI PEM public keys
 * @returns 已解析的 Ed25519 public key
 */
export function getTrustedRegistryPublicKey(
  keyId: string,
  trustedPublicKeys: RegistryTrustedPublicKeys
): ReturnType<typeof createPublicKey> {
  const publicKeyPem = trustedPublicKeys[keyId]
  if (!publicKeyPem) {
    throw new Error(`Registry signature keyId 未受信任: ${keyId}`)
  }

  try {
    const publicKey = createPublicKey(publicKeyPem)
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('public key 不是 Ed25519 key')
    }
    return publicKey
  } catch (error) {
    throw new Error(`Registry signature key 无效: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 验证 Ed25519 detached signature。
 * @param rawBundle 下载得到且未经规范化的 bundle bytes
 * @param signatureBase64 manifest 声明的标准 Base64 signature
 * @param keyId manifest 声明的 pinned key identifier
 * @param trustedPublicKeys 应用内置的 SPKI PEM public keys
 */
export function verifyRegistryBundleSignature(
  rawBundle: Buffer,
  signatureBase64: string,
  keyId: string,
  trustedPublicKeys: RegistryTrustedPublicKeys
): void {
  const publicKey = getTrustedRegistryPublicKey(keyId, trustedPublicKeys)
  const signature = Buffer.from(signatureBase64, 'base64')
  if (signature.length !== 64 || signature.toString('base64') !== signatureBase64) {
    throw new Error('Registry signature Base64 编码无效')
  }

  if (!verify(null, rawBundle, publicKey, signature)) {
    throw new Error('Registry Ed25519 signature 校验失败')
  }
}
