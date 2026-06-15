/**
 * SSRF 防护工具
 * @file src/main/utils/ssrf-guard.ts
 * @description 检测 URL 是否指向内网 / 环回 / 链路本地地址，防止服务端请求伪造（SSRF）。
 *
 * 用于 system:fetchUrl 等接受外部 URL 的接口，阻止渲染进程探测内网服务
 * 或云元数据端点（如 169.254.169.254）。
 */

import { lookup } from 'dns/promises'

/**
 * 内网 / 特殊地址的 IPv4 前缀正则集合
 * @description 命中任一即视为不可达外部地址
 */
const INTERNAL_IPV4_PATTERNS = [
  /^127\./, // 环回 127.0.0.0/8
  /^10\./, // 内网 10.0.0.0/8
  /^192\.168\./, // 内网 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./, // 内网 172.16.0.0/12
  /^169\.254\./, // 链路本地 169.254.0.0/16（含云元数据端点）
  /^0\./ // 0.0.0.0/8
]

/**
 * IPv6 内网/环回前缀（小写匹配）
 * @description 覆盖 IPv6 环回、链路本地、唯一本地、IPv4-mapped IPv6 内网地址
 */
const INTERNAL_IPV6_PATTERNS = [
  /^::1$/, // 环回
  /^fe[89ab][0-9a-f]:/, // 品质本地地址 fc00::/7（含 fd00::）
  /^fc[0-9a-f]{2}:/, // 唯一本地地址 fc00::/7
  /^fd[0-9a-f]{2}:/, // 唯一本地地址 fd00::/8
  /^fe80:/, // 链路本地
  /^::ffff:127\./, // IPv4-mapped IPv6 环回
  /^::ffff:10\./, // IPv4-mapped IPv6 内网
  /^::ffff:192\.168\./, // IPv4-mapped IPv6 内网
  /^::ffff:172\.(1[6-9]|2\d|3[01])\./, // IPv4-mapped IPv6 内网
  /^::ffff:169\.254\./ // IPv4-mapped IPv6 链路本地
]

/**
 * 判断主机名是否解析到内网 / 环回地址
 * @description 同时检查字面量 IP 与域名（域名需 DNS 解析后判断，防止解析到内网）
 * @param hostname 主机名（域名或 IP 字面量）
 * @returns true 表示指向内网 / 环回 / 链路本地（应拒绝）
 */
export async function isInternalAddress(hostname: string): Promise<boolean> {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  // 字面量主机名
  if (normalized === 'localhost') {
    return true
  }

  // IPv6 环回 / 内网字面量
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return true
  }

  // IPv4 字面量直接匹配
  if (INTERNAL_IPV4_PATTERNS.some((re) => re.test(normalized))) {
    return true
  }

  // IPv6 字面量直接匹配（含 IPv4-mapped）
  if (INTERNAL_IPV6_PATTERNS.some((re) => re.test(normalized))) {
    return true
  }

  // 域名：DNS 解析后判断解析结果是否落在内网段（同时查 IPv4 和 IPv6）
  try {
    const [v4Results, v6Results] = await Promise.all([
      lookup(normalized, { all: true, family: 4 }).catch(() => []),
      lookup(normalized, { all: true, family: 6 }).catch(() => [])
    ])
    const allAddresses = [
      ...v4Results.map((e) => e.address),
      ...v6Results.map((e) => e.address.toLowerCase())
    ]
    if (
      allAddresses.some((addr) =>
        INTERNAL_IPV4_PATTERNS.some((re) => re.test(addr)) ||
        INTERNAL_IPV6_PATTERNS.some((re) => re.test(addr))
      )
    ) {
      return true
    }
  } catch {
    // 解析失败：保守起见不拦截（无效域名会在实际请求时自然报错）
  }

  return false
}

/**
 * 确保 URL 不指向内网（SSRF 防护入口）
 * @param url 已校验协议的 URL 对象
 * @param label 错误信息标签
 * @throws 若 URL 指向内网 / 环回 / 链路本地地址
 */
export async function ensureExternalUrl(url: URL, label: string): Promise<void> {
  if (await isInternalAddress(url.hostname)) {
    throw new Error(`${label}指向内网/环回地址，已拒绝: ${url.hostname}`)
  }
}
