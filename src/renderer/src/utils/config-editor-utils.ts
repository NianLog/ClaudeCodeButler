/**
 * 配置编辑器辅助工具
 * @description 统一处理配置编辑语言判断与复制名称生成，避免不同页面出现不一致行为。
 */

/**
 * 编辑器语言类型
 */
export type EditorLanguage = 'json' | 'markdown'

/**
 * 配置文件描述
 */
export interface ConfigEditorDescriptor {
  /** 配置类型 */
  type?: string
  /** 配置路径 */
  path?: string
  /** 配置名称 */
  name?: string
}

const MARKDOWN_CONFIG_TYPES = new Set(['claude-md', 'user-preferences'])
const KNOWN_TEXT_EXTENSIONS = new Set(['.md', '.json'])

/**
 * 判断配置是否应使用 Markdown 编辑器
 * @param descriptor 配置描述
 * @returns 是否为 Markdown 类型配置
 */
export const isMarkdownConfig = (descriptor?: ConfigEditorDescriptor): boolean => {
  if (!descriptor) {
    return false
  }

  if (descriptor.type && MARKDOWN_CONFIG_TYPES.has(descriptor.type)) {
    return true
  }

  return [descriptor.path, descriptor.name].some((value) => {
    if (!value) {
      return false
    }

    return /\.md$/i.test(value) || /(^|[\\/])CLAUDE\.md$/i.test(value)
  })
}

/**
 * 解析配置应使用的编辑器语言
 * @param descriptor 配置描述
 * @returns 编辑器语言
 */
export const resolveConfigEditorLanguage = (descriptor?: ConfigEditorDescriptor): EditorLanguage => {
  return isMarkdownConfig(descriptor) ? 'markdown' : 'json'
}

/**
 * 在已知扩展名前追加后缀，便于生成“副本”名称
 * @param name 原始名称
 * @param suffix 后缀
 * @returns 追加后缀后的名称
 */
export const appendSuffixBeforeExtension = (name: string, suffix: string): string => {
  const match = name.match(/^(.*?)(\.[^./\\]+)$/)

  if (!match) {
    return `${name}${suffix}`
  }

  const [, baseName, extension] = match
  if (!KNOWN_TEXT_EXTENSIONS.has(extension.toLowerCase())) {
    return `${name}${suffix}`
  }

  return `${baseName}${suffix}${extension}`
}

/**
 * 生成不与现有配置重名的副本名称
 * @param name 原始配置名称
 * @param suffix 副本后缀
 * @param existingNames 当前已有名称列表
 * @returns 唯一副本名称
 */
export const generateUniqueDuplicateName = (
  name: string,
  suffix: string,
  existingNames: Iterable<string>
): string => {
  const existingNameSet = new Set(
    Array.from(existingNames, (item) => item.toLowerCase())
  )

  const getCandidateName = (index?: number): string => {
    const normalizedSuffix = index && index > 1 ? `${suffix}${index}` : suffix
    return appendSuffixBeforeExtension(name, normalizedSuffix)
  }

  let sequence = 1
  let candidateName = getCandidateName()

  while (existingNameSet.has(candidateName.toLowerCase())) {
    sequence += 1
    candidateName = getCandidateName(sequence)
  }

  return candidateName
}
