/**
 * 路径与外部输入安全工具
 * @description 为主进程中的文件路径、目录边界、文件名与 URL 输入提供统一校验能力
 */

import path from 'path'

/**
 * Windows 保留文件名集合
 * @description 用于避免生成在 Windows 上无法创建或具有歧义的文件名
 */
const WINDOWS_RESERVED_FILE_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

/**
 * 非法文件名字符集合
 * @description 用于跨平台过滤目录分隔符和 Windows 不允许的文件名字符
 */
const INVALID_FILE_NAME_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

/**
 * 规范化路径用于比较
 * @param targetPath 待比较路径
 * @returns 规范化后的绝对路径
 */
export function normalizePathForComparison(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath)
  const normalizedPath = path.normalize(resolvedPath)
  return process.platform === 'win32'
    ? normalizedPath.toLowerCase()
    : normalizedPath
}

/**
 * 检查路径是否位于指定基目录之内
 * @param targetPath 目标路径
 * @param basePath 基目录
 * @returns 是否在允许目录内
 */
export function isPathWithinBase(targetPath: string, basePath: string): boolean {
  const resolvedBasePath = path.resolve(basePath)
  const resolvedTargetPath = path.resolve(targetPath)
  const relativePath = path.relative(resolvedBasePath, resolvedTargetPath)

  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

/**
 * 确保路径位于指定基目录之内
 * @param targetPath 目标路径
 * @param basePath 基目录
 * @param label 错误信息标签
 * @returns 校验后的绝对路径
 */
export function ensurePathWithinBase(targetPath: string, basePath: string, label: string): string {
  const resolvedTargetPath = path.resolve(targetPath)
  if (!isPathWithinBase(resolvedTargetPath, basePath)) {
    throw new Error(`${label}超出允许目录: ${targetPath}`)
  }

  return resolvedTargetPath
}

/**
 * 确保路径与白名单中的绝对路径完全一致
 * @param targetPath 目标路径
 * @param allowedPaths 允许的绝对路径列表
 * @param label 错误信息标签
 * @returns 校验后的绝对路径
 */
export function ensurePathMatchesAllowed(targetPath: string, allowedPaths: string[], label: string): string {
  const resolvedTargetPath = path.resolve(targetPath)
  const normalizedTargetPath = normalizePathForComparison(resolvedTargetPath)
  const allowedPathSet = new Set(allowedPaths.map((allowedPath) => normalizePathForComparison(allowedPath)))

  if (!allowedPathSet.has(normalizedTargetPath)) {
    throw new Error(`${label}不在允许列表中: ${targetPath}`)
  }

  return resolvedTargetPath
}

/**
 * 确保路径命中允许的基目录或精确路径
 * @param targetPath 目标路径
 * @param allowedBasePaths 允许的基目录列表
 * @param allowedExactPaths 允许的精确路径列表
 * @param label 错误信息标签
 * @returns 校验后的绝对路径
 */
export function ensurePathAllowed(
  targetPath: string,
  allowedBasePaths: string[],
  allowedExactPaths: string[],
  label: string
): string {
  const resolvedTargetPath = path.resolve(targetPath)

  if (allowedBasePaths.some((basePath) => isPathWithinBase(resolvedTargetPath, basePath))) {
    return resolvedTargetPath
  }

  if (allowedExactPaths.length > 0) {
    return ensurePathMatchesAllowed(resolvedTargetPath, allowedExactPaths, label)
  }

  throw new Error(`${label}不在允许范围内: ${targetPath}`)
}

/**
 * 确保目录名是单一安全段
 * @param segment 目录名
 * @param label 错误信息标签
 * @returns 校验后的目录名
 */
export function ensureSafePathSegment(segment: string, label: string): string {
  const trimmedSegment = segment.trim()

  if (!trimmedSegment) {
    throw new Error(`${label}不能为空`)
  }

  if (trimmedSegment === '.' || trimmedSegment === '..') {
    throw new Error(`${label}不能为 "." 或 ".."`)
  }

  if (trimmedSegment.includes('/') || trimmedSegment.includes('\\')) {
    throw new Error(`${label}不能包含路径分隔符`)
  }

  return trimmedSegment
}

/**
 * 将相对路径安全拼接到目标目录
 * @param basePath 目标基目录
 * @param relativePath 相对路径
 * @param label 错误信息标签
 * @returns 校验后的绝对路径
 */
export function resolveSafeChildPath(basePath: string, relativePath: string, label: string): string {
  const trimmedRelativePath = relativePath.trim()

  if (!trimmedRelativePath) {
    throw new Error(`${label}不能为空`)
  }

  const resolvedChildPath = path.resolve(basePath, trimmedRelativePath)
  return ensurePathWithinBase(resolvedChildPath, basePath, label)
}

/**
 * 净化文件名
 * @param fileName 外部输入文件名
 * @param fallbackName 兜底文件名
 * @returns 可安全用于本地保存的文件名
 */
export function sanitizeFileName(fileName: string | undefined, fallbackName: string): string {
  const rawFileName = (fileName || '').split(/[?#]/)[0]
  const baseName = path.basename(rawFileName)

  const sanitizedName = Array.from(baseName, (character) => {
    const isControlCharacter = character.charCodeAt(0) <= 31
    return isControlCharacter || INVALID_FILE_NAME_CHARACTERS.has(character)
      ? '_'
      : character
  })
    .join('')
    .replace(/[. ]+$/g, '')
    .trim()

  const safeName = sanitizedName || fallbackName
  const parsedName = path.parse(safeName)
  const normalizedBaseName = parsedName.name.toUpperCase()

  if (WINDOWS_RESERVED_FILE_NAMES.has(normalizedBaseName)) {
    return `_${safeName}`
  }

  return safeName
}

/**
 * 确保 URL 使用允许的协议
 * @param inputUrl 外部输入 URL
 * @param allowedProtocols 允许的协议列表
 * @param label 错误信息标签
 * @returns 解析后的 URL 对象
 */
export function ensureAllowedUrl(inputUrl: string, allowedProtocols: string[], label: string): URL {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(inputUrl)
  } catch {
    throw new Error(`${label}格式无效: ${inputUrl}`)
  }

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    throw new Error(`${label}协议不被允许: ${parsedUrl.protocol}`)
  }

  return parsedUrl
}
