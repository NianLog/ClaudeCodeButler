/**
 * 新建配置默认模板定义
 * @description 统一管理新建配置时的默认 JSON 模板，以及模板的校验与格式化逻辑
 */

/**
 * 新建配置默认模板对象
 * @description 作为“设置 -> 编辑器设置 -> 新建配置默认模板”的内置默认值
 */
export const DEFAULT_NEW_CONFIG_TEMPLATE_OBJECT = {
  env: {
    ANTHROPIC_AUTH_TOKEN: 'Claude Code TokenKey',
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
