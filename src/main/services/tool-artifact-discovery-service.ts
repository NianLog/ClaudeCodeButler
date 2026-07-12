/**
 * @file src/main/services/tool-artifact-discovery-service.ts
 * @description 按 effective registry 安全发现并只读加载 AI Coding 工具配置资产。
 */

import { lstat, open } from 'fs/promises'
import path from 'path'
import type {
  ConfigArtifactContent,
  ConfigArtifactDefinition,
  DiscoveredConfigArtifact,
  ToolDefinition,
  ToolDetectionResult,
  ToolCapability
} from '@shared/tool-registry'
import { toolRegistryService, type ToolRegistryService } from './tool-registry-service'
import { ToolDetectionService } from './tool-detection-service'

/** 单个配置资产允许读取的最大 UTF-8 bytes */
export const CONFIG_ARTIFACT_MAX_BYTES = 1024 * 1024

/** Artifact discovery service 可替换依赖 */
export interface ToolArtifactDiscoveryServiceOptions {
  /** Effective registry provider */
  registryService?: ToolRegistryService
  /** 安全 detector 与路径解析器 */
  detectionService?: ToolDetectionService
}

/** Registry capability 校验后的 artifact 与绝对路径 */
export interface AuthorizedToolArtifact {
  /** 当前 effective registry 中的工具定义 */
  tool: ToolDefinition
  /** 当前 effective registry 中的资产定义 */
  artifact: ConfigArtifactDefinition
  /** 与 registry candidate 完全匹配的规范路径 */
  resolvedPath: string
}

/**
 * 提供规则驱动的工具检测、资产发现和只读加载。
 * @description 每次读取都会重新从 effective registry 推导 allowlist，不信任 renderer 提供的路径。
 */
export class ToolArtifactDiscoveryService {
  private readonly registryService: ToolRegistryService
  private readonly detectionService: ToolDetectionService

  /**
   * 创建 artifact discovery service。
   * @param options registry 与 detector 可替换依赖
   */
  constructor(options: ToolArtifactDiscoveryServiceOptions = {}) {
    this.registryService = options.registryService ?? toolRegistryService
    this.detectionService = options.detectionService ?? new ToolDetectionService()
  }

  /**
   * 检测 effective registry 中当前平台支持的全部工具。
   * @returns 工具检测结果
   */
  public async detectTools(): Promise<ToolDetectionResult[]> {
    const snapshot = await this.registryService.getSnapshot()
    return this.detectionService.detectTools(snapshot.tools)
  }

  /**
   * 发现工具在当前平台存在的普通配置文件。
   * @param toolId stable tool identifier
   * @returns 已发现的配置资产
   */
  public async discoverArtifacts(toolId: string): Promise<DiscoveredConfigArtifact[]> {
    const tool = await this.requireTool(toolId)
    if (!tool.platforms.includes(this.detectionService.getPlatform())) return []

    const discovered = await Promise.all(tool.artifacts.map((artifact) => this.discoverArtifact(tool, artifact)))
    return discovered.flat()
  }

  /**
   * 读取 registry 明确声明且具有 READ capability 的配置文件。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath renderer 从 discovery 结果中选择的绝对路径
   * @returns 原始 UTF-8 配置文本及 metadata
   */
  public async readArtifact(
    toolId: string,
    artifactId: string,
    requestedPath: string
  ): Promise<ConfigArtifactContent> {
    const { artifact, resolvedPath } = await this.authorizeArtifact(
      toolId,
      artifactId,
      requestedPath,
      'READ'
    )

    await this.assertNoSymbolicLinks(resolvedPath)
    const fileHandle = await open(resolvedPath, 'r')
    try {
      const fileMetadata = await fileHandle.stat()
      if (!fileMetadata.isFile()) throw new Error(`配置资产不是普通文件: ${resolvedPath}`)
      if (fileMetadata.size > CONFIG_ARTIFACT_MAX_BYTES) {
        throw new Error(`配置资产超过读取限制: ${CONFIG_ARTIFACT_MAX_BYTES} bytes`)
      }
      const buffer = Buffer.alloc(Math.min(fileMetadata.size + 1, CONFIG_ARTIFACT_MAX_BYTES + 1))
      const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, 0)
      if (bytesRead > CONFIG_ARTIFACT_MAX_BYTES) {
        throw new Error(`配置资产超过读取限制: ${CONFIG_ARTIFACT_MAX_BYTES} bytes`)
      }
      let content: string
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead))
      } catch {
        throw new Error('配置资产不是有效的 UTF-8 文本')
      }
      return {
        toolId,
        artifactId: artifact.artifactId,
        format: artifact.format,
        path: resolvedPath,
        size: fileMetadata.size,
        lastModifiedAt: fileMetadata.mtime.toISOString(),
        content
      }
    } finally {
      await fileHandle.close()
    }
  }

  /**
   * 重新从 effective registry 解析并授权 artifact capability。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param requestedPath 调用方选择的绝对路径
   * @param capability 本次操作要求的 capability
   * @returns registry 授权后的 artifact 与规范路径
   */
  public async authorizeArtifact(
    toolId: string,
    artifactId: string,
    requestedPath: string,
    capability: ToolCapability
  ): Promise<AuthorizedToolArtifact> {
    const tool = await this.requireTool(toolId)
    if (!tool.platforms.includes(this.detectionService.getPlatform())) {
      throw new Error(`工具不支持当前平台: ${toolId}`)
    }
    const artifact = tool.artifacts.find((candidate) => candidate.artifactId === artifactId)
    if (!artifact) throw new Error(`配置资产不存在: ${artifactId}`)
    if (!artifact.capabilities.includes(capability)) {
      throw new Error(`配置资产未声明 ${capability} capability: ${artifactId}`)
    }
    const resolvedPath = this.resolveArtifactPaths(artifact)
      .find((candidate) => this.pathsEqual(candidate, requestedPath))
    if (!resolvedPath) throw new Error('拒绝访问 registry 未声明的配置路径')
    await this.assertNoSymbolicLinks(resolvedPath)
    return { tool, artifact, resolvedPath }
  }

  /**
   * 获取 registry 中的工具定义。
   * @param toolId stable tool identifier
   * @returns 工具定义
   */
  private async requireTool(toolId: string): Promise<ToolDefinition> {
    const tool = await this.registryService.getTool(toolId)
    if (!tool) throw new Error(`工具定义不存在: ${toolId}`)
    return tool
  }

  /**
   * 发现单个 artifact 的全部现有候选路径。
   * @param tool 所属工具
   * @param artifact 配置资产定义
   * @returns 当前存在的普通文件
   */
  private async discoverArtifact(
    tool: ToolDefinition,
    artifact: ConfigArtifactDefinition
  ): Promise<DiscoveredConfigArtifact[]> {
    if (!artifact.capabilities.includes('DISCOVER')) return []
    const results = await Promise.all(this.resolveArtifactPaths(artifact).map(async (resolvedPath) => {
      try {
        return await this.readFileMetadata(tool.toolId, artifact, resolvedPath)
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') return undefined
        throw error
      }
    }))
    return results.filter((result): result is DiscoveredConfigArtifact => result !== undefined)
  }

  /**
   * 解析 artifact 在当前平台声明的候选路径。
   * @param artifact 配置资产定义
   * @returns 去重后的规范化绝对路径
   */
  private resolveArtifactPaths(artifact: ConfigArtifactDefinition): string[] {
    const templates = artifact.paths[this.detectionService.getPlatform()] ?? []
    return [...new Set(templates.map((template) => this.detectionService.resolvePath(template)))]
  }

  /**
   * 读取并验证配置文件 metadata。
   * @param toolId stable tool identifier
   * @param artifact 配置资产定义
   * @param resolvedPath 已通过 registry allowlist 的绝对路径
   * @returns discovery metadata
   */
  private async readFileMetadata(
    toolId: string,
    artifact: ConfigArtifactDefinition,
    resolvedPath: string
  ): Promise<DiscoveredConfigArtifact> {
    await this.assertNoSymbolicLinks(resolvedPath)
    const metadata = await lstat(resolvedPath)
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`配置资产不是普通文件: ${resolvedPath}`)
    }
    if (metadata.size > CONFIG_ARTIFACT_MAX_BYTES) {
      throw new Error(`配置资产超过读取限制: ${CONFIG_ARTIFACT_MAX_BYTES} bytes`)
    }
    return {
      toolId,
      artifactId: artifact.artifactId,
      format: artifact.format,
      path: resolvedPath,
      size: metadata.size,
      lastModifiedAt: metadata.mtime.toISOString()
    }
  }

  /**
   * 拒绝最终文件及其任一中间目录中的 symbolic link/junction。
   * @param resolvedPath 已通过 registry allowlist 的绝对路径
   */
  private async assertNoSymbolicLinks(resolvedPath: string): Promise<void> {
    const platform = this.detectionService.getPlatform()
    const pathImplementation = platform === 'WINDOWS' ? path.win32 : path.posix
    const parsedPath = pathImplementation.parse(resolvedPath)
    const segments = resolvedPath.slice(parsedPath.root.length).split(pathImplementation.sep).filter(Boolean)
    let currentPath = parsedPath.root
    for (const segment of segments) {
      currentPath = pathImplementation.join(currentPath, segment)
      const metadata = await lstat(currentPath)
      if (metadata.isSymbolicLink()) {
        throw new Error(`配置资产路径包含 symbolic link: ${currentPath}`)
      }
    }
  }

  /**
   * 比较 renderer 路径与 registry 规范路径。
   * @param allowedPath registry 推导路径
   * @param requestedPath renderer 请求路径
   * @returns 是否为同一规范字符串路径
   */
  private pathsEqual(allowedPath: string, requestedPath: string): boolean {
    const platform = this.detectionService.getPlatform()
    const pathImplementation = platform === 'WINDOWS' ? path.win32 : path.posix
    if (typeof requestedPath !== 'string' || !pathImplementation.isAbsolute(requestedPath)) return false
    const normalizedRequestedPath = pathImplementation.resolve(requestedPath)
    return platform === 'WINDOWS'
      ? allowedPath.toLocaleLowerCase('en-US') === normalizedRequestedPath.toLocaleLowerCase('en-US')
      : allowedPath === normalizedRequestedPath
  }
}

/** 默认配置资产发现服务单例 */
export const toolArtifactDiscoveryService = new ToolArtifactDiscoveryService()
