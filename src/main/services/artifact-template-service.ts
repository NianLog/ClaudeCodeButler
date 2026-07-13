/**
 * @file src/main/services/artifact-template-service.ts
 * @description 管理 artifact-specific template catalog、ownership resolution 与用户本地 override。
 */

import {
  createArtifactTemplateEntry,
  createArtifactTemplateKey,
  validateArtifactTemplateOverrides
} from '@shared/config-template'
import type {
  ArtifactTemplateEntry,
  ConfigArtifactDefinition,
  ToolDefinition,
  ToolRegistrySnapshot
} from '@shared/tool-registry'
import type { AppSettings, SettingsSaveOptions, SettingsTab } from '@shared/types/settings'
import type { SettingsService } from './settings-service'
import {
  toolArtifactCodecService,
  type ToolArtifactCodecService
} from './tool-artifact-codec-service'
import { toolRegistryService } from './tool-registry-service'

const ARTIFACT_TEMPLATE_MAX_BYTES = 64 * 1024

/** Artifact template service 所需的 registry contract。 */
interface ArtifactTemplateRegistryService {
  getSnapshot(): Promise<ToolRegistrySnapshot>
  getEmbeddedTool(toolId: string): ToolDefinition | undefined
}

/** Artifact template service 所需的 settings contract。 */
interface ArtifactTemplateSettingsService {
  loadSettings(): Promise<AppSettings>
  saveSettings(tab: SettingsTab, data: Partial<AppSettings>, options?: SettingsSaveOptions): Promise<void>
}

/** Artifact template service dependency overrides。 */
export interface ArtifactTemplateServiceOptions {
  registryService?: ArtifactTemplateRegistryService
  settingsService: ArtifactTemplateSettingsService
  codecService?: Pick<ToolArtifactCodecService, 'validate'>
}

/** 解析后的 effective artifact template definition。 */
interface ResolvedTemplateDefinition {
  tool: ToolDefinition
  artifact: ConfigArtifactDefinition
  embeddedTemplate?: string
  registryTemplate?: string
}

/**
 * Artifact-specific template application service。
 * @description 固定执行 USER_OVERRIDE > REGISTRY > EMBEDDED，并串行化 override mutation 防止并发丢失更新。
 */
export class ArtifactTemplateService {
  private readonly registryService: ArtifactTemplateRegistryService
  private readonly settingsService: ArtifactTemplateSettingsService
  private readonly codecService: Pick<ToolArtifactCodecService, 'validate'>
  private mutationQueue: Promise<void> = Promise.resolve()

  constructor(options: ArtifactTemplateServiceOptions) {
    this.registryService = options.registryService ?? toolRegistryService
    this.settingsService = options.settingsService
    this.codecService = options.codecService ?? toolArtifactCodecService
  }

  /**
   * 列出 effective registry 或 embedded baseline 中声明 defaultTemplate 的全部 artifact。
   * @description effective registry 移除 template 时保留 embedded fallback，避免既有 user override 孤儿化。
   * @returns 按 toolId/artifactId 稳定排序的 template catalog
   */
  public async listArtifactTemplates(): Promise<ArtifactTemplateEntry[]> {
    const [snapshot, settings] = await Promise.all([
      this.registryService.getSnapshot(),
      this.settingsService.loadSettings()
    ])
    const entries: ArtifactTemplateEntry[] = []
    for (const tool of snapshot.tools) {
      for (const artifact of tool.artifacts) {
        const definition = this.resolveDefinitionFromTool(tool, artifact)
        if (definition.registryTemplate === undefined && definition.embeddedTemplate === undefined) continue
        entries.push(this.createEntry(definition, settings.editor.artifactTemplateOverrides))
      }
    }
    return entries.sort((left, right) => left.key.localeCompare(right.key))
  }

  /**
   * 解析单个 artifact 当前生效的 template 与 ownership source。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   */
  public async resolveArtifactTemplate(toolId: string, artifactId: string): Promise<ArtifactTemplateEntry> {
    const definition = await this.resolveDefinition(toolId, artifactId)
    const settings = await this.settingsService.loadSettings()
    return this.createEntry(definition, settings.editor.artifactTemplateOverrides)
  }

  /**
   * 校验并保存 artifact-specific user override。
   * @description 保存完整 editor section，避免覆盖 fontSize 等无关设置字段。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   * @param content 用户模板原始 UTF-8 文本
   */
  public async saveArtifactTemplateOverride(
    toolId: string,
    artifactId: string,
    content: string
  ): Promise<ArtifactTemplateEntry> {
    return this.enqueueMutation(async () => {
      const definition = await this.resolveDefinition(toolId, artifactId)
      this.validateTemplateContent(definition.artifact, content)
      const settings = await this.settingsService.loadSettings()
      const key = createArtifactTemplateKey(toolId, artifactId)
      const overrides = {
        ...settings.editor.artifactTemplateOverrides,
        [key]: content
      }
      this.assertValidOverrides(overrides)
      await this.settingsService.saveSettings('editor', {
        editor: {
          ...settings.editor,
          artifactTemplateOverrides: overrides
        }
      })
      return this.createEntry(definition, overrides)
    })
  }

  /**
   * 删除 artifact-specific user override，并恢复当前 registry/embedded template。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   */
  public async removeArtifactTemplateOverride(
    toolId: string,
    artifactId: string
  ): Promise<ArtifactTemplateEntry> {
    return this.enqueueMutation(async () => {
      const definition = await this.resolveDefinition(toolId, artifactId)
      const settings = await this.settingsService.loadSettings()
      const key = createArtifactTemplateKey(toolId, artifactId)
      if (settings.editor.artifactTemplateOverrides[key] === undefined) {
        return this.createEntry(definition, settings.editor.artifactTemplateOverrides)
      }
      const overrides = { ...settings.editor.artifactTemplateOverrides }
      delete overrides[key]
      this.assertValidOverrides(overrides)
      await this.settingsService.saveSettings('editor', {
        editor: {
          ...settings.editor,
          artifactTemplateOverrides: overrides
        }
      })
      return this.createEntry(definition, overrides)
    })
  }

  /**
   * 从 current effective registry 查找允许管理 template 的 artifact。
   * @param toolId stable tool identifier
   * @param artifactId stable artifact identifier
   */
  private async resolveDefinition(toolId: string, artifactId: string): Promise<ResolvedTemplateDefinition> {
    createArtifactTemplateKey(toolId, artifactId)
    const snapshot = await this.registryService.getSnapshot()
    const tool = snapshot.tools.find((candidate) => candidate.toolId === toolId)
    const artifact = tool?.artifacts.find((candidate) => candidate.artifactId === artifactId)
    if (!tool || !artifact) {
      throw new Error(`Artifact template 不存在或未声明 defaultTemplate: ${toolId}/${artifactId}`)
    }
    const definition = this.resolveDefinitionFromTool(tool, artifact)
    if (definition.registryTemplate === undefined && definition.embeddedTemplate === undefined) {
      throw new Error(`Artifact template 不存在或未声明 defaultTemplate: ${toolId}/${artifactId}`)
    }
    return definition
  }

  /**
   * 将 effective definition 与 embedded baseline 拆分为独立 ownership layers。
   * @param tool effective tool definition
   * @param artifact effective artifact definition
   */
  private resolveDefinitionFromTool(
    tool: ToolDefinition,
    artifact: ConfigArtifactDefinition
  ): ResolvedTemplateDefinition {
    const embeddedArtifact = this.registryService.getEmbeddedTool(tool.toolId)?.artifacts
      .find((candidate) => candidate.artifactId === artifact.artifactId)
    const embeddedTemplate = embeddedArtifact?.defaultTemplate
    const registryTemplate = artifact.defaultTemplate === undefined || embeddedTemplate === artifact.defaultTemplate
      ? undefined
      : artifact.defaultTemplate
    if (embeddedTemplate !== undefined) this.validateTemplateContent(artifact, embeddedTemplate)
    if (registryTemplate !== undefined) this.validateTemplateContent(artifact, registryTemplate)
    return { tool, artifact, embeddedTemplate, registryTemplate }
  }

  /**
   * 创建包含三层来源与 effective value 的共享 catalog entry。
   * @param definition 已解析的 registry layers
   * @param overrides 当前 settings override map
   */
  private createEntry(
    definition: ResolvedTemplateDefinition,
    overrides: Record<string, string>
  ): ArtifactTemplateEntry {
    const key = createArtifactTemplateKey(definition.tool.toolId, definition.artifact.artifactId)
    return createArtifactTemplateEntry({
      key,
      toolId: definition.tool.toolId,
      artifactId: definition.artifact.artifactId,
      toolDisplayName: definition.tool.displayName,
      artifactDisplayName: definition.artifact.displayName,
      format: definition.artifact.format,
      embeddedTemplate: definition.embeddedTemplate,
      registryTemplate: definition.registryTemplate,
      userOverride: overrides[key]
    })
  }

  /**
   * 执行 byte bound 与可信内置 codec validation。
   * @param artifact effective artifact definition
   * @param content 用户模板内容
   */
  private validateTemplateContent(artifact: ConfigArtifactDefinition, content: string): void {
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Artifact template 必须为非空字符串')
    }
    if (content.includes('\0')) {
      throw new Error('Artifact template 不能包含 NUL')
    }
    const byteLength = Buffer.byteLength(content, 'utf8')
    if (byteLength > ARTIFACT_TEMPLATE_MAX_BYTES) {
      throw new Error(`Artifact template 超过 ${ARTIFACT_TEMPLATE_MAX_BYTES} bytes`)
    }
    const validation = this.codecService.validate(artifact.format, content)
    if (!validation.valid) {
      throw new Error(`Artifact template 校验失败: ${validation.errors.join('; ')}`)
    }
  }

  /**
   * 复用 Settings contract 校验 map 数量、key 与单项边界。
   * @param overrides 待持久化 override map
   */
  private assertValidOverrides(overrides: Record<string, string>): void {
    const validation = validateArtifactTemplateOverrides(overrides)
    if (validation !== true) throw new Error(validation)
  }

  /**
   * 串行执行 settings read-modify-write，避免同 service 并发覆盖。
   * @param operation 单次 mutation
   */
  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation)
    this.mutationQueue = result.then(() => undefined, () => undefined)
    return result
  }
}

/**
 * 创建绑定指定 SettingsService 的 artifact template service。
 * @description IPC 层必须传入其共享 settings instance，避免出现独立内存快照。
 */
export function createArtifactTemplateService(settingsService: SettingsService): ArtifactTemplateService {
  return new ArtifactTemplateService({ settingsService })
}
