/**
 * CCB 主题系统 — 主题定义
 * @description 四套内置主题（CCB Dark Pro / CCB Minimal / CCB Terminal / CCB Light），
 *              通过 CSS 变量 + Ant Design token 双通道注入，支持未来扩展为云端/本地导入。
 *
 * 架构：
 *  - CSS 变量：注入到 document.documentElement.style，所有自定义 CSS 引用
 *  - Ant Design tokens：通过 ConfigProvider theme.token 注入，覆盖组件库样式
 *  - mode：声明明暗模式，由 ConfigProvider 据此选择 darkAlgorithm / defaultAlgorithm
 *  - 字体变量：控制 UI 字体与等宽字体的混用策略
 */

/** 主题 ID 类型 */
export type ThemeId = 'ccb-dark-pro' | 'ccb-minimal' | 'ccb-terminal' | 'ccb-light'

/** 主题明暗模式（决定 Ant Design algorithm 与 Monaco 编辑器主题） */
export type ThemeMode = 'dark' | 'light'

/** Ant Design token 覆盖（控制组件库密度与配色） */
export interface AntdTokenOverride {
  colorPrimary: string
  colorBgContainer: string
  colorBgElevated: string
  colorBgLayout: string
  colorText: string
  colorTextSecondary: string
  colorBorder: string
  colorBorderSecondary: string
  borderRadius: number
  borderRadiusSM: number
  fontSize: number
  fontSizeSM: number
  controlHeight: number
  controlHeightSM: number
  controlItemBgHover: string
  controlItemBgActive: string
}

/** 单套主题的完整定义 */
export interface ThemeDefinition {
  id: ThemeId
  /** 显示名称 */
  name: string
  /** 简短描述 */
  description: string
  /** 明暗模式（决定 Ant Design algorithm 与 Monaco 主题） */
  mode: ThemeMode
  /** CSS 变量键值对（注入到 :root） */
  cssVars: Record<string, string>
  /** Ant Design token 覆盖 */
  antdTokens: AntdTokenOverride
}

// ============================================
// 主题 A: CCB Dark Pro
// 灵感: VS Code Dark+ Theme
// 特点: 深灰蓝色工作区，柔和层级与紧凑操作
// ============================================
const ccbDarkPro: ThemeDefinition = {
  id: 'ccb-dark-pro',
  name: 'CCB Dark Pro',
  description: 'VS Code 风格深色主题，工程化 IDE 体验，高信息密度',
  mode: 'dark',
  cssVars: {
    '--bg-base': "#131518",
    '--bg-sidebar': "#131518",
    '--bg-panel': "#1a1c20",
    '--bg-elevated': "#22252b",
    '--bg-input': "#22252b",
    '--bg-hover': "#2b3039",
    '--bg-active': "#253750",
    '--border': "#363c45",
    '--border-light': "#363c45",
    '--text-primary': "#edf0f5",
    '--text-secondary': "#a3adbb",
    '--text-muted': "#a3adbb",
    '--accent': "#82b3ff",
    '--accent-hover': "#82b3ff",
    '--accent-bg': "#253750",
    '--green': "#6bd4b1",
    '--green-bg': 'rgba(78,201,176,0.1)',
    '--yellow': "#ebc483",
    '--red': "#ffa29a",
    '--blue': '#569cd6',
    '--radius': '0px',
    '--radius-sm': "5px",
    '--radius-md': "7px",
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '8px',
    '--space-lg': '12px',
    '--space-xl': '16px',
    '--font-ui': "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    '--font-mono': "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    '--font-size-xs': "12px",
    '--font-size-sm': "12px",
    '--font-size-base': "14px",
    '--font-size-lg': '15px',
    '--row-height': '28px',
    '--sidebar-width': "200px",
    '--toolbar-height': "56px",
      "--border-medium": "#363c45",
    "--accent-solid": "#2f6db5",
    "--text-on-accent": "#ffffff",
    "--radius-lg": "8px",
    "--font-weight-body": "400",
    "--font-weight-label": "450",
    "--font-weight-heading": "550",
    "--shadow-sm": "0 2px 8px rgba(12, 18, 27, .14)",
    "--shadow-md": "0 8px 24px rgba(12, 18, 27, .24)",
},
  antdTokens: {
    colorPrimary: "#2f6db5",
    colorBgContainer: "#1a1c20",
    colorBgElevated: "#22252b",
    colorBgLayout: "#131518",
    colorText: "#edf0f5",
    colorTextSecondary: "#a3adbb",
    colorBorder: "#363c45",
    colorBorderSecondary: "#363c45",
    borderRadius: 7,
    borderRadiusSM: 5,
    fontSize: 14,
    fontSizeSM: 12,
    controlHeight: 34,
    controlHeightSM: 28,
    controlItemBgHover: "#2b3039",
    controlItemBgActive: "#253750",
  },
}

// ============================================
// 主题 B: CCB Minimal
// 灵感: Linear App Design System
// 特点: 深灰紫色工作区，低干扰层级
// ============================================
const ccbMinimal: ThemeDefinition = {
  id: 'ccb-minimal',
  name: 'CCB Minimal',
  description: 'Linear 风格极简主题，现代深灰，紫色点缀，视觉舒适',
  mode: 'dark',
  cssVars: {
    '--bg-base': "#111113",
    '--bg-sidebar': "#111113",
    '--bg-panel': "#19191c",
    '--bg-elevated': "#222226",
    '--bg-input': "#222226",
    '--bg-hover': "#2c2c32",
    '--bg-active': "#302940",
    '--border': "#37373e",
    '--border-light': "#37373e",
    '--text-primary': "#f0eff4",
    '--text-secondary': "#aaa7b7",
    '--text-muted': "#aaa7b7",
    '--accent': "#c0b0f5",
    '--accent-hover': "#c0b0f5",
    '--accent-bg': "#302940",
    '--accent-border': 'rgba(139,92,246,0.3)',
    '--green': "#6bd4b1",
    '--green-bg': 'rgba(34,197,94,0.1)',
    '--yellow': "#ebc483",
    '--red': "#ffa29a",
    '--blue': '#3b82f6',
    '--radius': '2px',
    '--radius-sm': "7px",
    '--radius-md': "9px",
    '--space-xs': '4px',
    '--space-sm': '6px',
    '--space-md': '10px',
    '--space-lg': '14px',
    '--space-xl': '20px',
    '--font-ui': "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    '--font-mono': "'SF Mono', 'JetBrains Mono', monospace",
    '--font-size-xs': "12px",
    '--font-size-sm': "12px",
    '--font-size-base': "14px",
    '--font-size-lg': '15px',
    '--row-height': '32px',
    '--sidebar-width': "200px",
    '--toolbar-height': "56px",
      "--border-medium": "#37373e",
    "--accent-solid": "#7660b3",
    "--text-on-accent": "#ffffff",
    "--radius-lg": "9px",
    "--font-weight-body": "400",
    "--font-weight-label": "450",
    "--font-weight-heading": "550",
    "--shadow-sm": "0 2px 8px rgba(12, 18, 27, .14)",
    "--shadow-md": "0 8px 24px rgba(12, 18, 27, .24)",
},
  antdTokens: {
    colorPrimary: "#7660b3",
    colorBgContainer: "#19191c",
    colorBgElevated: "#222226",
    colorBgLayout: "#111113",
    colorText: "#f0eff4",
    colorTextSecondary: "#aaa7b7",
    colorBorder: "#37373e",
    colorBorderSecondary: "#37373e",
    borderRadius: 9,
    borderRadiusSM: 7,
    fontSize: 14,
    fontSizeSM: 12,
    controlHeight: 34,
    controlHeightSM: 28,
    controlItemBgHover: "#2c2c32",
    controlItemBgActive: "#302940",
  },
}

// ============================================
// 主题 C: CCB Terminal
// 灵感: Warp Terminal + Dracula Theme
// 特点: 终端美学, 近纯黑, 绿色强调, 全等宽, 极致密度
// ============================================
const ccbTerminal: ThemeDefinition = {
  id: 'ccb-terminal',
  name: 'CCB Terminal',
  description: '终端风格硬核主题，全等宽字体，Dracula 配色，极致信息密度',
  mode: 'dark',
  cssVars: {
    '--bg-base': "#101512",
    '--bg-sidebar': "#101512",
    '--bg-panel': "#151c18",
    '--bg-elevated': "#1c2620",
    '--bg-input': "#1c2620",
    '--bg-hover': "#243029",
    '--bg-active': "#243c2d",
    '--border': "#384a3d",
    '--border-light': "#384a3d",
    '--text-primary': "#e2f0e7",
    '--text-secondary': "#a0b7a7",
    '--text-muted': "#a0b7a7",
    '--accent': "#87d7a2",
    '--accent-hover': "#87d7a2",
    '--accent-bg': "#243c2d",
    '--green': "#88d9aa",
    '--green-bg': 'rgba(80,250,123,0.1)',
    '--yellow': "#ebc483",
    '--red': "#ffa29a",
    '--blue': '#8be9fd',
    '--purple': '#bd93f9',
    '--orange': '#ffb86c',
    '--radius': '0px',
    '--radius-sm': "2px",
    '--radius-md': "2px",
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '6px',
    '--space-lg': '8px',
    '--space-xl': '12px',
    '--font-ui': "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    '--font-mono': "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    '--font-size-xs': "12px",
    '--font-size-sm': "12px",
    '--font-size-base': "14px",
    '--font-size-lg': '14px',
    '--row-height': '26px',
    '--sidebar-width': "200px",
    '--toolbar-height': "56px",
      "--border-medium": "#384a3d",
    "--accent-solid": "#37744c",
    "--text-on-accent": "#ffffff",
    "--radius-lg": "8px",
    "--font-weight-body": "400",
    "--font-weight-label": "450",
    "--font-weight-heading": "550",
    "--shadow-sm": "0 2px 8px rgba(12, 18, 27, .14)",
    "--shadow-md": "0 8px 24px rgba(12, 18, 27, .24)",
},
  antdTokens: {
    colorPrimary: "#37744c",
    colorBgContainer: "#151c18",
    colorBgElevated: "#1c2620",
    colorBgLayout: "#101512",
    colorText: "#e2f0e7",
    colorTextSecondary: "#a0b7a7",
    colorBorder: "#384a3d",
    colorBorderSecondary: "#384a3d",
    borderRadius: 2,
    borderRadiusSM: 2,
    fontSize: 14,
    fontSizeSM: 12,
    controlHeight: 34,
    controlHeightSM: 28,
    controlItemBgHover: "#243029",
    controlItemBgActive: "#243c2d",
  },
}

// ============================================
// 主题 D: CCB Light
// 灵感: GitHub Light + VS Code Light
// 特点: 明亮清爽, 白底深字, 蓝色强调, 6px 圆角, 适合白天/高可读性场景
// ============================================
const ccbLight: ThemeDefinition = {
  id: 'ccb-light',
  name: 'CCB Light',
  description: '亮色主题，GitHub Light 风格，明亮清爽，适合白天使用',
  mode: 'light',
  cssVars: {
    '--bg-base': "#f7f8fa",
    '--bg-sidebar': "#f7f8fa",
    '--bg-panel': "#ffffff",
    '--bg-elevated': "#f5f6f8",
    '--bg-input': "#f5f6f8",
    '--bg-hover': "#edf0f5",
    '--bg-active': "#eaf1fb",
    '--border': "#dfe3eb",
    '--border-light': "#dfe3eb",
    '--text-primary': "#263345",
    '--text-secondary': "#606c80",
    '--text-muted': "#606c80",
    '--accent': "#245b98",
    '--accent-hover': "#245b98",
    '--accent-bg': "#eaf1fb",
    '--green': "#15795c",
    '--green-bg': 'rgba(26,127,55,0.1)',
    '--yellow': "#8f5d13",
    '--red': "#b13332",
    '--blue': '#0969da',
    '--radius': '6px',
    '--radius-sm': "6px",
    '--radius-md': "8px",
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '8px',
    '--space-lg': '12px',
    '--space-xl': '16px',
    '--font-ui': "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', sans-serif",
    '--font-mono': "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    '--font-size-xs': "12px",
    '--font-size-sm': "12px",
    '--font-size-base': "14px",
    '--font-size-lg': '15px',
    '--row-height': '32px',
    '--sidebar-width': "200px",
    '--toolbar-height': "56px",
      "--border-medium": "#dfe3eb",
    "--accent-solid": "#285e9d",
    "--text-on-accent": "#ffffff",
    "--radius-lg": "8px",
    "--font-weight-body": "450",
    "--font-weight-label": "500",
    "--font-weight-heading": "600",
    "--shadow-sm": "0 2px 8px rgba(38, 51, 69, .06)",
    "--shadow-md": "0 8px 24px rgba(38, 51, 69, .1)",
},
  antdTokens: {
    colorPrimary: "#285e9d",
    colorBgContainer: "#ffffff",
    colorBgElevated: "#f5f6f8",
    colorBgLayout: "#f7f8fa",
    colorText: "#263345",
    colorTextSecondary: "#606c80",
    colorBorder: "#dfe3eb",
    colorBorderSecondary: "#dfe3eb",
    borderRadius: 8,
    borderRadiusSM: 6,
    fontSize: 14,
    fontSizeSM: 12,
    controlHeight: 34,
    controlHeightSM: 28,
    controlItemBgHover: "#edf0f5",
    controlItemBgActive: "#eaf1fb",
  },
}

/** 所有内置主题 */
export const BUILT_IN_THEMES: ThemeDefinition[] = [ccbDarkPro, ccbMinimal, ccbTerminal, ccbLight]

/** 默认主题 */
export const DEFAULT_THEME: ThemeId = 'ccb-dark-pro'

/** 按 ID 获取主题定义 */
export function getThemeById(id: ThemeId): ThemeDefinition {
  return BUILT_IN_THEMES.find((t) => t.id === id) ?? ccbDarkPro
}

/**
 * 将主题 CSS 变量注入到 DOM 元素
 * @param element 目标元素（通常为 document.documentElement）
 * @param theme 主题定义
 */
export function applyThemeToDOM(element: HTMLElement, theme: ThemeDefinition): void {
  // 清除旧主题变量（遍历所有内置主题的 key，避免残留）
  for (const t of BUILT_IN_THEMES) {
    for (const key of Object.keys(t.cssVars)) {
      element.style.removeProperty(key)
    }
  }
  // 注入新主题变量
  for (const [key, value] of Object.entries(theme.cssVars)) {
    element.style.setProperty(key, value)
  }
  // 设置 data-theme 属性（用于 CSS [data-theme="xxx"] 选择器，以及明暗模式标记）
  element.setAttribute('data-theme', theme.id)
  // 同时标记明暗模式，供 CSS [data-theme-mode] 选择器做模式级差异（如原生滚动条配色）
  element.setAttribute('data-theme-mode', theme.mode)
}
