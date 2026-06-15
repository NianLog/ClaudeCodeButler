/**
 * 主题全局状态 Store（Zustand）
 * @description 全局唯一的主题状态来源。所有调用 useTheme() 的组件共享同一份状态，
 *              从而保证「设置页切换主题 → ConfigProvider token 同步更新」链路生效。
 *
 * 职责边界：
 *  - 管理 themeId 全局状态
 *  - 持久化到 localStorage
 *  - 异步同步到后端设置（跨会话一致性）
 *
 * 不在此处处理：
 *  - DOM CSS 变量注入（由 useTheme hook 的 useEffect 完成，保证在渲染周期内执行）
 *  - Ant Design token 应用（由 ConfigProvider 读取 currentTheme 完成）
 */

import { create } from 'zustand'
import { type ThemeId, BUILT_IN_THEMES, DEFAULT_THEME, getThemeById, applyThemeToDOM } from '../themes'

/** localStorage 存储 key */
const STORAGE_KEY = 'ccb-ui-theme'

/**
 * 从 localStorage 读取已持久化的主题 ID
 * @returns 合法的主题 ID（无效值回退到默认主题）
 */
function loadStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && BUILT_IN_THEMES.some((t) => t.id === stored)) {
      return stored as ThemeId
    }
  } catch {
    // localStorage 不可用（SSR / 无痕模式），使用默认主题
  }
  return DEFAULT_THEME
}

/**
 * 持久化主题 ID 到 localStorage
 */
function persistTheme(themeId: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeId)
  } catch {
    // 写入失败不影响当前会话使用
  }
}

/**
 * 异步同步主题到后端设置（用于跨设备/重启一致性）
 */
async function syncThemeToBackend(themeId: ThemeId): Promise<void> {
  try {
    const settings = await window.electronAPI.settings?.getAll?.()
    if (settings?.success && settings.data) {
      await window.electronAPI.settings?.saveTab?.('advanced', {
        ...settings.data.advanced,
        uiTheme: themeId,
      })
    }
  } catch {
    // 后端同步失败不影响前端体验
  }
}

/** 主题 Store 接口 */
interface ThemeStore {
  /** 当前主题 ID（全局唯一来源） */
  themeId: ThemeId
  /** 切换主题（同步持久化 + 异步同步后端） */
  setTheme: (id: ThemeId) => void
}

/**
 * 同步初始化主题（模块加载时立即注入 CSS 变量到 :root）
 * @description useTheme 的 useEffect 在首次 paint 之后才执行，此前所有 var() 会回退到
 *              globals.css 的 :root fallback（暗色），配合组件补强的 !important 会强制暗色，
 *              导致亮主题首屏/切换瞬间误显暗色。此处模块加载时同步注入，确保首次 paint 即正确；
 *              主题切换由 useTheme 的 useEffect 接管。
 */
const initialThemeId = loadStoredTheme()
if (typeof document !== 'undefined') {
  applyThemeToDOM(document.documentElement, getThemeById(initialThemeId))
}

/**
 * 主题全局状态 Store
 */
export const useThemeStore = create<ThemeStore>((set) => ({
  themeId: initialThemeId,
  setTheme: (id) => {
    persistTheme(id)
    // 同步注入 CSS 变量（不等 useTheme 的 useEffect），确保切换瞬间 inline 即更新，
    // 避免 var() 在 useEffect 执行前回退到 :root fallback（暗色）导致亮主题误显暗
    if (typeof document !== 'undefined') {
      applyThemeToDOM(document.documentElement, getThemeById(id))
    }
    set({ themeId: id })
    // 后端同步采用 fire-and-forget，避免阻塞 UI
    void syncThemeToBackend(id)
  },
}))
