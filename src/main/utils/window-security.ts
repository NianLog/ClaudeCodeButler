/**
 * @file Electron window navigation security helpers
 * @description 为 renderer navigation 提供可测试、fail-closed 的 URL 决策。
 */

/**
 * 仅允许当前 document 内的 hash navigation。
 * @param currentUrl 当前 renderer URL
 * @param targetUrl 页面请求导航的目标 URL
 */
export function isAllowedRendererNavigation(currentUrl: string, targetUrl: string): boolean {
  try {
    const current = new URL(currentUrl)
    const target = new URL(targetUrl)
    current.hash = ''
    target.hash = ''
    return current.toString() === target.toString()
  } catch {
    return false
  }
}
