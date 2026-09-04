/**
 * @file src/shared/tool-registry-validator.ts
 * @description 对外部工具规则库执行 bounded、fail-closed 的结构与安全校验。
 */

import {
  ARTIFACT_FORMATS,
  ARTIFACT_HANDLERS,
  ARTIFACT_SCOPES,
  TOOL_CAPABILITIES,
  TOOL_DETECTOR_TYPES,
  TOOL_PLATFORMS,
  type ArtifactFormat,
  type ArtifactHandler,
  type ArtifactScope,
  type ConfigArtifactDefinition,
  type LocalizedText,
  type RegistryValidationResult,
  type ToolCapability,
  type ToolDefinition,
  type ToolDetectorDefinition,
  type ToolDetectorType,
  type ToolPlatform,
  type ToolRegistryBundle,
  type ToolRegistryManifest
} from './tool-registry'

/** Manifest 最大 UTF-8 字节数 */
export const REGISTRY_MANIFEST_MAX_BYTES = 50 * 1024
/** Bundle 最大 UTF-8 字节数 */
export const REGISTRY_BUNDLE_MAX_BYTES = 2 * 1024 * 1024
/** Bundle 最大工具数 */
const MAX_TOOLS = 100
/** 单工具最大配置资产数 */
const MAX_ARTIFACTS_PER_TOOL = 50
/** 单工具最大 detector 数 */
const MAX_DETECTORS_PER_TOOL = 10
/** 单个编辑分组最大成员数（同一编辑面板聚合的文件数上限） */
const MAX_EDIT_GROUP_MEMBERS = 4
/** 普通字符串最大长度 */
const MAX_STRING_LENGTH = 4096
/** 本地化文本最大长度 */
const MAX_LOCALIZED_TEXT_LENGTH = 2048
/** JSON 最大嵌套深度 */
const MAX_JSON_DEPTH = 20
/** JSON 最大节点数 */
const MAX_JSON_NODES = 50_000

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STRICT_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const ED25519_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/
const COMMAND_NAME_PATTERN = /^[A-Za-z0-9._+-]+$/
const ALLOWED_PATH_VARIABLES = new Set(['HOME', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'CCB_DATA'])
const FORBIDDEN_PATH_PATTERNS = [/\.\.(?:[/\\]|$)/, /^[/\\]{2}/, /^[a-z]+:\/\//i]
const FORBIDDEN_PATH_CHARACTERS = /[\0*?<>|"`]/

/**
 * 获取 UTF-8 字节长度
 * @param value 文本内容
 * @returns UTF-8 编码后的字节数
 */
function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/**
 * 判断输入是否为非数组 plain object
 * @param value 待判断输入
 * @returns 是否可按 JSON object 读取
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 检查 object 是否只包含允许字段
 * @param value JSON object
 * @param allowedKeys 允许字段集合
 * @param path JSON path
 * @param errors 错误收集器
 */
function validateAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  path: string,
  errors: string[]
): void {
  const allowedKeySet = new Set(allowedKeys)
  for (const key of Object.keys(value)) {
    if (!allowedKeySet.has(key)) {
      errors.push(`${path}.${key}: 不支持的字段`)
    }
  }
}

/**
 * 读取受长度限制的必填字符串
 * @param value 原始值
 * @param path JSON path
 * @param errors 错误收集器
 * @param maxLength 最大长度
 * @returns 合法字符串或空字符串
 */
function readString(
  value: unknown,
  path: string,
  errors: string[],
  maxLength: number = MAX_STRING_LENGTH
): string {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path}: 必须为非空字符串`)
    return ''
  }
  if (value.length > maxLength) {
    errors.push(`${path}: 长度不能超过 ${maxLength}`)
  }
  return value
}

/**
 * 校验 strict SemVer
 * @param value 原始版本值
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 版本字符串
 */
function readSemVer(value: unknown, path: string, errors: string[]): string {
  const version = readString(value, path, errors, 128)
  if (version && !STRICT_SEMVER_PATTERN.test(version)) {
    errors.push(`${path}: 必须为 strict SemVer`)
  }
  return version
}

/**
 * 校验稳定 identifier
 * @param value 原始 identifier
 * @param path JSON path
 * @param errors 错误收集器
 * @returns identifier
 */
function readIdentifier(value: unknown, path: string, errors: string[]): string {
  const identifier = readString(value, path, errors, 128)
  if (identifier && !IDENTIFIER_PATTERN.test(identifier)) {
    errors.push(`${path}: 必须为 lowercase kebab-case identifier`)
  }
  return identifier
}

/**
 * 校验本地化文本
 * @param value 原始值
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 本地化文本
 */
function readLocalizedText(value: unknown, path: string, errors: string[]): LocalizedText {
  if (!isRecord(value)) {
    errors.push(`${path}: 必须为本地化文本对象`)
    return { 'zh-CN': '', 'en-US': '' }
  }
  validateAllowedKeys(value, ['zh-CN', 'en-US'], path, errors)
  return {
    'zh-CN': readString(value['zh-CN'], `${path}.zh-CN`, errors, MAX_LOCALIZED_TEXT_LENGTH),
    'en-US': readString(value['en-US'], `${path}.en-US`, errors, MAX_LOCALIZED_TEXT_LENGTH)
  }
}

/**
 * 读取受 allowlist 限制的字符串数组
 * @param value 原始数组
 * @param allowedValues 允许值
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 去重后的允许值数组
 */
function readAllowedArray<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
  errors: string[]
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}: 必须为非空数组`)
    return []
  }
  const allowedSet = new Set<string>(allowedValues)
  const result: T[] = []
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || !allowedSet.has(item)) {
      errors.push(`${path}[${index}]: 不支持的枚举值`)
      continue
    }
    if (!result.includes(item as T)) {
      result.push(item as T)
    }
  }
  return result
}

/**
 * 校验声明式路径，禁止 traversal、URL、UNC 与未知变量
 * @param value 原始路径
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 合法路径模板
 */
function readPathTemplate(value: unknown, path: string, errors: string[]): string {
  const pathTemplate = readString(value, path, errors)
  if (!pathTemplate) {
    return pathTemplate
  }
  const rootVariableMatch = pathTemplate.match(/^\$\{([A-Z0-9_]+)\}(?:[/\\]|$)/)
  if (!rootVariableMatch || !ALLOWED_PATH_VARIABLES.has(rootVariableMatch[1])) {
    errors.push(`${path}: 必须从允许的根路径变量开始`)
  }
  if (FORBIDDEN_PATH_CHARACTERS.test(pathTemplate)) {
    errors.push(`${path}: 包含不允许的路径字符`)
  }
  for (const forbiddenPattern of FORBIDDEN_PATH_PATTERNS) {
    if (forbiddenPattern.test(pathTemplate)) {
      errors.push(`${path}: 包含不允许的路径结构`)
      break
    }
  }
  const variablePattern = /\$\{([A-Z0-9_]+)\}/g
  for (const match of pathTemplate.matchAll(variablePattern)) {
    if (!ALLOWED_PATH_VARIABLES.has(match[1])) {
      errors.push(`${path}: 包含不允许的路径变量 ${match[0]}`)
    }
  }
  const variableTokens = pathTemplate.match(/\$\{[^}]*\}/g) ?? []
  const validVariableTokens = pathTemplate.match(/\$\{[A-Z0-9_]+\}/g) ?? []
  if (pathTemplate.includes('${') && variableTokens.length !== validVariableTokens.length) {
    errors.push(`${path}: 路径变量格式无效`)
  }
  return pathTemplate
}

/**
 * 校验 detector 定义
 * @param value 原始 detector
 * @param path JSON path
 * @param errors 错误收集器
 * @returns detector definition
 */
function readDetector(value: unknown, path: string, errors: string[]): ToolDetectorDefinition {
  if (!isRecord(value)) {
    errors.push(`${path}: 必须为 detector object`)
    return { type: 'PATH_EXISTS', path: '' }
  }
  validateAllowedKeys(value, ['type', 'command', 'path'], path, errors)
  const detectorType = readString(value.type, `${path}.type`, errors, 64) as ToolDetectorType
  if (!TOOL_DETECTOR_TYPES.includes(detectorType)) {
    errors.push(`${path}.type: 不支持的 detector type`)
  }
  if (detectorType === 'COMMAND_EXISTS') {
    const command = readString(value.command, `${path}.command`, errors, 128)
    if (command && !COMMAND_NAME_PATTERN.test(command)) {
      errors.push(`${path}.command: 只能为 executable name，不能包含参数或 shell 字符`)
    }
    if (value.path !== undefined) {
      errors.push(`${path}.path: COMMAND_EXISTS 不允许 path`)
    }
    return { type: 'COMMAND_EXISTS', command }
  }
  const detectorPath = readPathTemplate(value.path, `${path}.path`, errors)
  if (value.command !== undefined) {
    errors.push(`${path}.command: PATH_EXISTS 不允许 command`)
  }
  return { type: 'PATH_EXISTS', path: detectorPath }
}

/**
 * 校验单个配置资产
 * @param value 原始配置资产
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 配置资产定义
 */
function readArtifact(value: unknown, path: string, errors: string[]): ConfigArtifactDefinition {
  if (!isRecord(value)) {
    errors.push(`${path}: 必须为 artifact object`)
    return {
      artifactId: '',
      displayName: { 'zh-CN': '', 'en-US': '' },
      format: 'TEXT',
      scope: 'USER',
      paths: {},
      capabilities: [],
      handler: 'TEXT_FILE_V1'
    }
  }
  validateAllowedKeys(
    value,
    ['artifactId', 'displayName', 'format', 'scope', 'paths', 'capabilities', 'handler', 'defaultTemplate', 'editGroup', 'configSet'],
    path,
    errors
  )
  const format = readString(value.format, `${path}.format`, errors, 32) as ArtifactFormat
  if (!ARTIFACT_FORMATS.includes(format)) {
    errors.push(`${path}.format: 不支持的 format`)
  }
  const scope = readString(value.scope, `${path}.scope`, errors, 32) as ArtifactScope
  if (!ARTIFACT_SCOPES.includes(scope)) {
    errors.push(`${path}.scope: 不支持的 scope`)
  }
  const handler = readString(value.handler, `${path}.handler`, errors, 64) as ArtifactHandler
  if (!ARTIFACT_HANDLERS.includes(handler)) {
    errors.push(`${path}.handler: 未注册的内置 handler`)
  }
  if (!isRecord(value.paths)) {
    errors.push(`${path}.paths: 必须为 platform path object`)
  }
  const platformPaths: Partial<Record<ToolPlatform, string[]>> = {}
  if (isRecord(value.paths)) {
    validateAllowedKeys(value.paths, [...TOOL_PLATFORMS], `${path}.paths`, errors)
    for (const platform of TOOL_PLATFORMS) {
      const rawPaths = value.paths[platform]
      if (rawPaths === undefined) {
        continue
      }
      if (!Array.isArray(rawPaths) || rawPaths.length === 0 || rawPaths.length > 10) {
        errors.push(`${path}.paths.${platform}: 必须包含 1-10 个路径`)
        continue
      }
      platformPaths[platform] = rawPaths.map((item, index) =>
        readPathTemplate(item, `${path}.paths.${platform}[${index}]`, errors)
      )
    }
  }
  const defaultTemplate = value.defaultTemplate === undefined
    ? undefined
    : readString(value.defaultTemplate, `${path}.defaultTemplate`, errors, 64 * 1024)
  const editGroup = value.editGroup === undefined
    ? undefined
    : readIdentifier(value.editGroup, `${path}.editGroup`, errors)
  const configSet = value.configSet === undefined
    ? undefined
    : readIdentifier(value.configSet, `${path}.configSet`, errors)

  return {
    artifactId: readIdentifier(value.artifactId, `${path}.artifactId`, errors),
    displayName: readLocalizedText(value.displayName, `${path}.displayName`, errors),
    format,
    scope,
    paths: platformPaths,
    capabilities: readAllowedArray<ToolCapability>(
      value.capabilities,
      TOOL_CAPABILITIES,
      `${path}.capabilities`,
      errors
    ),
    handler,
    ...(defaultTemplate === undefined ? {} : { defaultTemplate }),
    ...(editGroup === undefined ? {} : { editGroup }),
    ...(configSet === undefined ? {} : { configSet })
  }
}

/**
 * 校验单个工具定义
 * @param value 原始工具定义
 * @param path JSON path
 * @param errors 错误收集器
 * @returns 工具定义
 */
function readTool(value: unknown, path: string, errors: string[]): ToolDefinition {
  if (!isRecord(value)) {
    errors.push(`${path}: 必须为 tool object`)
    return {
      toolId: '',
      definitionVersion: '',
      displayName: { 'zh-CN': '', 'en-US': '' },
      platforms: [],
      detectors: [],
      artifacts: []
    }
  }
  validateAllowedKeys(
    value,
    ['toolId', 'definitionVersion', 'displayName', 'platforms', 'detectors', 'artifacts'],
    path,
    errors
  )
  const detectors = Array.isArray(value.detectors) ? value.detectors : []
  if (!Array.isArray(value.detectors) || detectors.length > MAX_DETECTORS_PER_TOOL) {
    errors.push(`${path}.detectors: 必须为不超过 ${MAX_DETECTORS_PER_TOOL} 项的数组`)
  }
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : []
  if (!Array.isArray(value.artifacts) || artifacts.length === 0 || artifacts.length > MAX_ARTIFACTS_PER_TOOL) {
    errors.push(`${path}.artifacts: 必须包含 1-${MAX_ARTIFACTS_PER_TOOL} 项`)
  }
  const parsedArtifacts = artifacts.slice(0, MAX_ARTIFACTS_PER_TOOL).map((artifact, index) =>
    readArtifact(artifact, `${path}.artifacts[${index}]`, errors)
  )
  const artifactIds = new Set<string>()
  for (const artifact of parsedArtifacts) {
    if (artifactIds.has(artifact.artifactId)) {
      errors.push(`${path}.artifacts: artifactId ${artifact.artifactId} 重复`)
    }
    artifactIds.add(artifact.artifactId)
  }
  const groupSizes = (groupField: 'editGroup' | 'configSet'): void => {
    const sizes = new Map<string, number>()
    for (const artifact of parsedArtifacts) {
      const group = artifact[groupField]
      if (!group) continue
      const size = (sizes.get(group) ?? 0) + 1
      sizes.set(group, size)
      if (size > MAX_EDIT_GROUP_MEMBERS) {
        errors.push(`${path}.artifacts: ${groupField} ${group} 成员超过 ${MAX_EDIT_GROUP_MEMBERS} 个`)
      }
    }
  }
  groupSizes('editGroup')
  groupSizes('configSet')

  return {
    toolId: readIdentifier(value.toolId, `${path}.toolId`, errors),
    definitionVersion: readSemVer(value.definitionVersion, `${path}.definitionVersion`, errors),
    displayName: readLocalizedText(value.displayName, `${path}.displayName`, errors),
    platforms: readAllowedArray<ToolPlatform>(value.platforms, TOOL_PLATFORMS, `${path}.platforms`, errors),
    detectors: detectors.slice(0, MAX_DETECTORS_PER_TOOL).map((detector, index) =>
      readDetector(detector, `${path}.detectors[${index}]`, errors)
    ),
    artifacts: parsedArtifacts
  }
}

/**
 * 统计 JSON 节点与深度，阻止 schema bomb
 * @param value JSON value
 * @param depth 当前深度
 * @param state 统计状态
 */
function inspectJsonComplexity(
  value: unknown,
  depth: number,
  state: { nodes: number; tooDeep: boolean; tooMany: boolean }
): void {
  state.nodes += 1
  if (state.nodes > MAX_JSON_NODES) {
    state.tooMany = true
    return
  }
  if (depth > MAX_JSON_DEPTH) {
    state.tooDeep = true
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      inspectJsonComplexity(item, depth + 1, state)
      if (state.tooMany || state.tooDeep) return
    }
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) {
      inspectJsonComplexity(item, depth + 1, state)
      if (state.tooMany || state.tooDeep) return
    }
  }
}

/**
 * 解析并校验 registry bundle JSON 文本
 * @param rawJson UTF-8 JSON 文本
 * @returns 强类型 bundle 或错误列表
 */
export function validateToolRegistryBundle(rawJson: string): RegistryValidationResult<ToolRegistryBundle> {
  const errors: string[] = []
  if (getUtf8ByteLength(rawJson) > REGISTRY_BUNDLE_MAX_BYTES) {
    return { success: false, errors: [`$: bundle 超过 ${REGISTRY_BUNDLE_MAX_BYTES} bytes`] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    return { success: false, errors: [`$: JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const complexity = { nodes: 0, tooDeep: false, tooMany: false }
  inspectJsonComplexity(parsed, 0, complexity)
  if (complexity.tooDeep) errors.push(`$: JSON 嵌套深度超过 ${MAX_JSON_DEPTH}`)
  if (complexity.tooMany) errors.push(`$: JSON 节点数超过 ${MAX_JSON_NODES}`)
  if (!isRecord(parsed)) {
    return { success: false, errors: [...errors, '$: bundle 必须为 object'] }
  }
  validateAllowedKeys(parsed, ['schemaVersion', 'registryVersion', 'minimumAppVersion', 'tools'], '$', errors)
  if (parsed.schemaVersion !== 1) {
    errors.push('$.schemaVersion: 当前只支持 1')
  }
  const tools = Array.isArray(parsed.tools) ? parsed.tools : []
  if (!Array.isArray(parsed.tools) || tools.length === 0 || tools.length > MAX_TOOLS) {
    errors.push(`$.tools: 必须包含 1-${MAX_TOOLS} 项`)
  }
  const parsedTools = tools.slice(0, MAX_TOOLS).map((tool, index) => readTool(tool, `$.tools[${index}]`, errors))
  const toolIds = new Set<string>()
  for (const tool of parsedTools) {
    if (toolIds.has(tool.toolId)) {
      errors.push(`$.tools: toolId ${tool.toolId} 重复`)
    }
    toolIds.add(tool.toolId)
  }
  const bundle: ToolRegistryBundle = {
    schemaVersion: 1,
    registryVersion: readSemVer(parsed.registryVersion, '$.registryVersion', errors),
    minimumAppVersion: readSemVer(parsed.minimumAppVersion, '$.minimumAppVersion', errors),
    tools: parsedTools
  }
  return errors.length === 0
    ? { success: true, data: bundle, errors: [] }
    : { success: false, errors }
}

/**
 * 解析并校验 registry manifest JSON 文本
 * @param rawJson UTF-8 manifest JSON
 * @param allowedOrigins 应用固定允许的 registry origins
 * @returns 强类型 manifest 或错误列表
 */
export function validateToolRegistryManifest(
  rawJson: string,
  allowedOrigins: string[]
): RegistryValidationResult<ToolRegistryManifest> {
  if (getUtf8ByteLength(rawJson) > REGISTRY_MANIFEST_MAX_BYTES) {
    return { success: false, errors: [`$: manifest 超过 ${REGISTRY_MANIFEST_MAX_BYTES} bytes`] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    return { success: false, errors: [`$: JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const errors: string[] = []
  if (!isRecord(parsed)) {
    return { success: false, errors: ['$: manifest 必须为 object'] }
  }
  validateAllowedKeys(
    parsed,
    [
      'schemaVersion',
      'registryVersion',
      'minimumAppVersion',
      'publishedAt',
      'bundleUrl',
      'bundleSha256',
      'bundleSize',
      'signatureAlgorithm',
      'keyId',
      'signature',
      'releaseNotes'
    ],
    '$',
    errors
  )
  if (parsed.schemaVersion !== 1) errors.push('$.schemaVersion: 当前只支持 1')
  const bundleUrl = readString(parsed.bundleUrl, '$.bundleUrl', errors)
  try {
    const url = new URL(bundleUrl)
    if (url.protocol !== 'https:') errors.push('$.bundleUrl: 必须使用 HTTPS')
    if (!allowedOrigins.includes(url.origin)) errors.push('$.bundleUrl: origin 不在应用 allowlist')
  } catch {
    errors.push('$.bundleUrl: URL 格式无效')
  }
  const bundleSha256 = readString(parsed.bundleSha256, '$.bundleSha256', errors, 64)
  if (bundleSha256 && !SHA256_PATTERN.test(bundleSha256)) errors.push('$.bundleSha256: 必须为 lowercase SHA-256')
  const bundleSize = parsed.bundleSize
  if (!Number.isInteger(bundleSize) || Number(bundleSize) <= 0 || Number(bundleSize) > REGISTRY_BUNDLE_MAX_BYTES) {
    errors.push(`$.bundleSize: 必须为 1-${REGISTRY_BUNDLE_MAX_BYTES} 的整数`)
  }
  const publishedAt = readString(parsed.publishedAt, '$.publishedAt', errors, 64)
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) errors.push('$.publishedAt: 必须为 ISO-8601 时间')
  const signatureAlgorithm = readString(parsed.signatureAlgorithm, '$.signatureAlgorithm', errors, 32)
  if (signatureAlgorithm !== 'ED25519') errors.push('$.signatureAlgorithm: 当前只支持 ED25519')
  const keyId = readIdentifier(parsed.keyId, '$.keyId', errors)
  const signature = readString(parsed.signature, '$.signature', errors, 88)
  if (signature && !ED25519_SIGNATURE_PATTERN.test(signature)) {
    errors.push('$.signature: 必须为 64-byte Ed25519 signature 的标准 Base64')
  }
  const manifest: ToolRegistryManifest = {
    schemaVersion: 1,
    registryVersion: readSemVer(parsed.registryVersion, '$.registryVersion', errors),
    minimumAppVersion: readSemVer(parsed.minimumAppVersion, '$.minimumAppVersion', errors),
    publishedAt,
    bundleUrl,
    bundleSha256,
    bundleSize: Number(bundleSize),
    signatureAlgorithm: 'ED25519',
    keyId,
    signature,
    releaseNotes: readLocalizedText(parsed.releaseNotes, '$.releaseNotes', errors)
  }
  return errors.length === 0
    ? { success: true, data: manifest, errors: [] }
    : { success: false, errors }
}

/**
 * 比较 strict SemVer（忽略 build metadata，遵循 prerelease precedence）
 * @param left 左侧版本
 * @param right 右侧版本
 * @returns left 小于、等于或大于 right
 */
export function compareStrictSemVer(left: string, right: string): -1 | 0 | 1 {
  const parse = (value: string): { core: number[]; prerelease: string[] } => {
    if (!STRICT_SEMVER_PATTERN.test(value)) throw new Error(`无效 SemVer: ${value}`)
    const [withoutBuild] = value.split('+')
    const [core, prerelease = ''] = withoutBuild.split('-')
    return { core: core.split('.').map(Number), prerelease: prerelease ? prerelease.split('.') : [] }
  }
  const leftVersion = parse(left)
  const rightVersion = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.core[index] < rightVersion.core[index]) return -1
    if (leftVersion.core[index] > rightVersion.core[index]) return 1
  }
  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length > 0) return 1
  if (leftVersion.prerelease.length > 0 && rightVersion.prerelease.length === 0) return -1
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}
