/**
 * 主题管理 Hook
 * @description 全局主题状态的 React 绑定层。
 *
 * 架构（v3 修正）：
 *  - 主题状态由全局 Zustand store（useThemeStore）持有，保证整个应用只有一份主题状态。
 *    早期版本用 useState 在此 hook 内部管理，导致 RootApp 与 SettingsPanel 各自创建独立
 *    状态实例，「设置页切换主题 → ConfigProvider token 不更新」即根源于此。
 *  - DOM 注入（CSS 变量）作为副作用在此 hook 内执行；由于 RootApp 订阅了 store，
 *    任何组件调用 setTheme 都会触发 RootApp 重渲染并同步更新 ConfigProvider token。
 *  - Ant Design token 由 main.tsx 的 ConfigProvider 直接读取 currentTheme 应用。
 */

import { useEffect } from 'react'
import {
  type ThemeDefinition,
  BUILT_IN_THEMES,
  getThemeById,
  applyThemeToDOM,
} from '../themes'
import { useThemeStore } from '../store/theme-store'

/**
 * 主题管理 Hook
 * @returns { currentTheme, themeId, setTheme, availableThemes }
 */
export function useTheme() {
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  // currentTheme 由 themeId 派生（纯函数映射到常量表，引用稳定）
  const currentTheme: ThemeDefinition = getThemeById(themeId)

  // 主题变化时：注入 CSS 变量到 :root（全局副作用）
  useEffect(() => {
    applyThemeToDOM(document.documentElement, currentTheme)
  }, [themeId, currentTheme])

  return {
    currentTheme,
    themeId,
    setTheme,
    availableThemes: BUILT_IN_THEMES,
  } as const
}
