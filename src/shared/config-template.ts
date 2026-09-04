/**
 * @file Artifact template shared helpers
 * @description 保留 legacy Claude JSON 模板兼容，并提供 artifact key、ownership resolution 与 line diff 纯函数。
 */

import type {
  ArtifactTemplateEntry,
  ArtifactTemplateSource,
  TemplateDiffLine
} from './tool-registry'

const TEMPLATE_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 新建配置默认模板对象
 * @description 作为“设置 -> 编辑器设置 -> 新建配置默认模板”的内置默认值
 */
export const DEFAULT_NEW_CONFIG_TEMPLATE_OBJECT = {
  env: {
    // 占位值为空：token 类字段不预填假值，由用户填入真实凭据
    ANTHROPIC_AUTH_TOKEN: '',
    ANTHROPIC_BASE_URL: 'Claude Code API URL',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
  },
  permissions: {
    allow: [],
    deny: []
  }
}

/**
 * 新建配置默认模板字符串
 * @description 使用格式化 JSON 字符串，便于直接渲染到编辑器和设置页
 */
export const DEFAULT_NEW_CONFIG_TEMPLATE = JSON.stringify(DEFAULT_NEW_CONFIG_TEMPLATE_OBJECT, null, 2)

/**
 * 校验新建配置默认模板
 * @param template 模板字符串
 * @returns `true` 表示合法，否则返回错误说明
 */
export function validateNewConfigTemplate(template: string): true | string {
  const normalizedTemplate = template.trim()

  if (!normalizedTemplate) {
    return '模板内容不能为空'
  }

  try {
    const parsedTemplate = JSON.parse(normalizedTemplate)

    if (parsedTemplate === null || Array.isArray(parsedTemplate) || typeof parsedTemplate !== 'object') {
      return '模板必须是 JSON 对象'
    }

    return true
  } catch {
    return '模板必须是合法 JSON'
  }
}

/**
 * 规范化新建配置默认模板
 * @param template 模板字符串
 * @returns 格式化后的合法 JSON 模板；若输入非法则回退到内置默认模板
 */
export function normalizeNewConfigTemplate(template?: string): string {
  const candidateTemplate = template?.trim() ? template : DEFAULT_NEW_CONFIG_TEMPLATE
  return validateNewConfigTemplate(candidateTemplate) === true
    ? JSON.stringify(JSON.parse(candidateTemplate), null, 2)
    : DEFAULT_NEW_CONFIG_TEMPLATE
}

/**
 * 创建 artifact template stable key。
 * @param toolId stable lowercase tool identifier
 * @param artifactId stable lowercase artifact identifier
 */
export function createArtifactTemplateKey(toolId: string, artifactId: string): string {
  if (!TEMPLATE_IDENTIFIER_PATTERN.test(toolId) || !TEMPLATE_IDENTIFIER_PATTERN.test(artifactId)) {
    throw new Error('Artifact template identifier 必须为 lowercase kebab-case')
  }
  return `${toolId}/${artifactId}`
}

/**
 * 根据固定 ownership 优先级解析 effective template。
 * @description USER_OVERRIDE > REGISTRY > EMBEDDED；缺少全部来源时拒绝伪造空模板。
 */
export function resolveArtifactTemplateOwnership(input: {
  userOverride?: string
  registryTemplate?: string
  embeddedTemplate?: string
}): { content: string; source: ArtifactTemplateSource } {
  const candidates: Array<{ content?: string; source: ArtifactTemplateSource }> = [
    { content: input.userOverride, source: 'USER_OVERRIDE' },
    { content: input.registryTemplate, source: 'REGISTRY' },
    { content: input.embeddedTemplate, source: 'EMBEDDED' }
  ]
  const resolved = candidates.find((candidate) => typeof candidate.content === 'string')
  if (!resolved || resolved.content === undefined) {
    throw new Error('Artifact 没有可用 template source')
  }
  return { content: resolved.content, source: resolved.source }
}

/**
 * 创建稳定、bounded 的逐行 diff。
 * @description 使用 LCS 生成审阅友好的 ADDED/REMOVED/UNCHANGED lines，最大各 1000 行。
 */
export function createTemplateLineDiff(before: string, after: string): TemplateDiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')
  if (beforeLines.length > 1000 || afterLines.length > 1000) {
    throw new Error('Template diff 每侧最多支持 1000 行')
  }
  const matrix = Array.from({ length: beforeLines.length + 1 }, () =>
    new Uint16Array(afterLines.length + 1)
  )
  for (let left = beforeLines.length - 1; left >= 0; left -= 1) {
    for (let right = afterLines.length - 1; right >= 0; right -= 1) {
      matrix[left][right] = beforeLines[left] === afterLines[right]
        ? matrix[left + 1][right + 1] + 1
        : Math.max(matrix[left + 1][right], matrix[left][right + 1])
    }
  }
  const result: TemplateDiffLine[] = []
  let left = 0
  let right = 0
  while (left < beforeLines.length || right < afterLines.length) {
    if (left < beforeLines.length && right < afterLines.length && beforeLines[left] === afterLines[right]) {
      result.push({ type: 'UNCHANGED', content: beforeLines[left] })
      left += 1
      right += 1
    } else if (right < afterLines.length && (left >= beforeLines.length || matrix[left][right + 1] >= matrix[left + 1][right])) {
      result.push({ type: 'ADDED', content: afterLines[right] })
      right += 1
    } else {
      result.push({ type: 'REMOVED', content: beforeLines[left] })
      left += 1
    }
  }
  return result
}

/**
 * 创建 template catalog entry，集中保证 effective/source 一致。
 */
export function createArtifactTemplateEntry(
  metadata: Omit<ArtifactTemplateEntry, 'effectiveTemplate' | 'source'>
): ArtifactTemplateEntry {
  const resolved = resolveArtifactTemplateOwnership(metadata)
  return { ...metadata, effectiveTemplate: resolved.content, source: resolved.source }
}

/**
 * 校验持久化的 artifact template override map。
 */
export function validateArtifactTemplateOverrides(value: unknown): true | string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'Artifact template overrides 必须为 object'
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > 100) return 'Artifact template overrides 最多 100 项'
  for (const [key, content] of entries) {
    const parts = key.split('/')
    try {
      if (parts.length !== 2 || createArtifactTemplateKey(parts[0], parts[1]) !== key) {
        return `无效 artifact template key: ${key}`
      }
    } catch {
      return `无效 artifact template key: ${key}`
    }
    if (typeof content !== 'string' || !content.trim()) return `${key}: template 必须为非空字符串`
    if (new TextEncoder().encode(content).byteLength > 64 * 1024) return `${key}: template 超过 65536 bytes`
    if (content.includes('\0')) return `${key}: template 不能包含 NUL`
  }
  return true
}

/**
 * 将旧 global Claude JSON template 映射为 artifact override，且不覆盖已有新格式设置。
 */
export function migrateLegacyTemplateOverride(
  legacyTemplate: string | undefined,
  currentOverrides: Record<string, string> | undefined
): Record<string, string> {
  const overrides = { ...(currentOverrides ?? {}) }
  const key = createArtifactTemplateKey('claude-code', 'user-settings')
  if (overrides[key] !== undefined || !legacyTemplate?.trim()) return overrides
  if (validateNewConfigTemplate(legacyTemplate) !== true) return overrides
  const normalizedLegacy = normalizeNewConfigTemplate(legacyTemplate)
  if (normalizedLegacy !== normalizeNewConfigTemplate(DEFAULT_NEW_CONFIG_TEMPLATE)) {
    overrides[key] = normalizedLegacy
  }
  return overrides
}

/**
 * 仅在用户尚未修改 fallback 草稿时应用异步解析完成的 template。
 */
export function applyResolvedTemplateIfUntouched(
  currentContent: string,
  fallbackContent: string,
  resolvedContent: string
): string {
  return currentContent === fallbackContent ? resolvedContent : currentContent
}
