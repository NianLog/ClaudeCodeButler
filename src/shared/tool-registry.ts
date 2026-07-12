/**
 * @file src/shared/tool-registry.ts
 * @description 定义 CCB 规则驱动工具注册表的共享 domain contract。
 */

/** 规则库支持的平台枚举值 */
export const TOOL_PLATFORMS = ['WINDOWS', 'MACOS', 'LINUX'] as const

/** 规则库支持的平台 */
export type ToolPlatform = typeof TOOL_PLATFORMS[number]

/** 配置资产支持的格式枚举值 */
export const ARTIFACT_FORMATS = ['JSON', 'JSONC', 'YAML', 'TOML', 'MARKDOWN', 'TEXT'] as const

/** 配置资产格式 */
export type ArtifactFormat = typeof ARTIFACT_FORMATS[number]

/** 配置资产作用域枚举值 */
export const ARTIFACT_SCOPES = ['USER', 'PROJECT', 'WORKSPACE'] as const

/** 配置资产作用域 */
export type ArtifactScope = typeof ARTIFACT_SCOPES[number]

/** 应用内置并允许被远程规则引用的能力枚举值 */
export const TOOL_CAPABILITIES = [
  'DISCOVER',
  'READ',
  'VALIDATE',
  'EDIT',
  'BACKUP',
  'RESTORE',
  'ACTIVATE',
  'WATCH'
] as const

/** 工具配置能力 */
export type ToolCapability = typeof TOOL_CAPABILITIES[number]

/** 声明式检测器类型枚举值 */
export const TOOL_DETECTOR_TYPES = ['COMMAND_EXISTS', 'PATH_EXISTS'] as const

/** 声明式检测器类型 */
export type ToolDetectorType = typeof TOOL_DETECTOR_TYPES[number]

/** 首版允许的内置 handler 标识 */
export const ARTIFACT_HANDLERS = ['JSON_FILE_V1', 'MARKDOWN_FILE_V1', 'TEXT_FILE_V1'] as const

/** 配置资产 handler 标识 */
export type ArtifactHandler = typeof ARTIFACT_HANDLERS[number]

/** 本地化文本 */
export interface LocalizedText {
  /** 简体中文文本 */
  'zh-CN': string
  /** 英文文本 */
  'en-US': string
}

/** 工具安装检测规则 */
export interface ToolDetectorDefinition {
  /** 检测器类型 */
  type: ToolDetectorType
  /** COMMAND_EXISTS 使用的可执行文件名 */
  command?: string
  /** PATH_EXISTS 使用的受限变量路径 */
  path?: string
}

/** 配置资产定义 */
export interface ConfigArtifactDefinition {
  /** 工具内稳定的配置资产标识 */
  artifactId: string
  /** 显示名称 */
  displayName: LocalizedText
  /** 文件内容格式 */
  format: ArtifactFormat
  /** 配置作用域 */
  scope: ArtifactScope
  /** 各平台候选路径 */
  paths: Partial<Record<ToolPlatform, string[]>>
  /** 允许的管理能力 */
  capabilities: ToolCapability[]
  /** 应用内置 handler */
  handler: ArtifactHandler
  /** 新建配置时使用的声明式默认模板 */
  defaultTemplate?: string
}

/** AI 工具规则定义 */
export interface ToolDefinition {
  /** 跨版本稳定的工具标识 */
  toolId: string
  /** 单工具定义版本 */
  definitionVersion: string
  /** 显示名称 */
  displayName: LocalizedText
  /** 支持的平台 */
  platforms: ToolPlatform[]
  /** 工具检测规则 */
  detectors: ToolDetectorDefinition[]
  /** 工具配置资产 */
  artifacts: ConfigArtifactDefinition[]
}

/** 完整工具规则库 bundle */
export interface ToolRegistryBundle {
  /** JSON protocol schema 版本 */
  schemaVersion: number
  /** 整体规则库 SemVer */
  registryVersion: string
  /** 可加载该规则库的最低应用版本 */
  minimumAppVersion: string
  /** 工具定义列表 */
  tools: ToolDefinition[]
}

/** 远程规则库 manifest */
export interface ToolRegistryManifest {
  /** JSON protocol schema 版本 */
  schemaVersion: number
  /** 远程规则库 SemVer */
  registryVersion: string
  /** 最低应用版本 */
  minimumAppVersion: string
  /** ISO-8601 发布时间 */
  publishedAt: string
  /** 规则 bundle HTTPS URL */
  bundleUrl: string
  /** bundle raw bytes 的 SHA-256 */
  bundleSha256: string
  /** bundle 预期字节数 */
  bundleSize: number
  /** detached signature 算法 */
  signatureAlgorithm: 'ED25519'
  /** 应用内置 public key identifier */
  keyId: string
  /** raw bundle bytes 的标准 Base64 Ed25519 signature */
  signature: string
  /** 更新说明 */
  releaseNotes: LocalizedText
}

/** Registry 校验结果 */
export interface RegistryValidationResult<T> {
  /** 是否通过全部安全与结构校验 */
  success: boolean
  /** 校验成功后的强类型数据 */
  data?: T
  /** 带 JSON path 的错误列表 */
  errors: string[]
}

/** Registry 更新状态枚举值 */
export const REGISTRY_UPDATE_STATES = [
  'IDLE',
  'CHECKING_MANIFEST',
  'UP_TO_DATE',
  'UPDATE_AVAILABLE',
  'CHECK_FAILED',
  'DOWNLOADING',
  'VERIFYING_SIGNATURE',
  'VERIFYING_HASH',
  'VALIDATING_SCHEMA',
  'CHECKING_COMPATIBILITY',
  'STAGING',
  'INSTALLED',
  'ROLLED_BACK'
] as const

/** Registry 更新状态 */
export type RegistryUpdateState = typeof REGISTRY_UPDATE_STATES[number]

/** Renderer 可安全读取的 registry update 状态 */
export interface ToolRegistryUpdateStatus {
  /** 当前状态机状态 */
  state: RegistryUpdateState
  /** embedded registry version */
  embeddedVersion: string
  /** 当前 installed/last-known-good version */
  installedVersion?: string
  /** manifest 中的最新版本 */
  availableVersion?: string
  /** manifest 发布时间 */
  publishedAt?: string
  /** 更新说明 */
  releaseNotes?: LocalizedText
  /** 最近检查时间 */
  lastCheckedAt?: string
  /** 最近失败原因 */
  error?: string
}

/** Effective registry snapshot */
export interface ToolRegistrySnapshot {
  /** 内置 registry version */
  embeddedVersion: string
  /** 已加载 installed/last-known-good version */
  installedVersion?: string
  /** 合并后的工具定义 */
  tools: ToolDefinition[]
  /** 是否因 installed 损坏回退到 last-known-good */
  recoveredFromLastKnownGood: boolean
}

/** 工具检测结果 */
export interface ToolDetectionResult {
  /** 工具 identifier */
  toolId: string
  /** 是否命中至少一个 detector */
  detected: boolean
  /** 命中的 detector 数量 */
  matchedDetectors: number
  /** detector 总数 */
  totalDetectors: number
}

/** 只读配置资产发现结果 */
export interface DiscoveredConfigArtifact {
  /** 所属工具 identifier */
  toolId: string
  /** 配置资产 identifier */
  artifactId: string
  /** 文件内容格式 */
  format: ArtifactFormat
  /** 解析后的绝对路径 */
  path: string
  /** 文件大小 bytes */
  size: number
  /** ISO-8601 修改时间 */
  lastModifiedAt: string
}

/** 只读配置资产内容 */
export interface ConfigArtifactContent extends DiscoveredConfigArtifact {
  /** 原始 UTF-8 文本；首版不对 TOML 等未实现 codec 的格式伪造 parse 结果 */
  content: string
}

/** 配置资产 validation 结果 */
export interface ConfigArtifactValidationResult {
  /** 是否通过对应 format codec 校验 */
  valid: boolean
  /** format codec 标识 */
  format: ArtifactFormat
  /** 面向用户的错误摘要 */
  errors: string[]
}

/** 通用配置资产备份 metadata */
export interface ConfigArtifactBackup {
  /** 不可预测的 backup identifier */
  backupId: string
  /** 所属工具 identifier */
  toolId: string
  /** 配置资产 identifier */
  artifactId: string
  /** 原始 registry allowlisted 路径 */
  originalPath: string
  /** 备份文件大小 bytes */
  size: number
  /** ISO-8601 创建时间 */
  createdAt: string
}
