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
// 特点: 工程化 IDE 感, 深灰背景, 蓝色强调, 0px 圆角, 高密度
// ============================================
const ccbDarkPro: ThemeDefinition = {
  id: 'ccb-dark-pro',
  name: 'CCB Dark Pro',
  description: 'VS Code 风格深色主题，工程化 IDE 体验，高信息密度',
  mode: 'dark',
  cssVars: {
    '--bg-base': '#1e1e1e',
    '--bg-sidebar': '#252526',
    '--bg-panel': '#2d2d2d',
    '--bg-elevated': '#333333',
    '--bg-input': '#3c3c3c',
    '--bg-hover': '#2a2d2e',
    '--bg-active': '#373737',
    '--border': '#3e3e42',
    '--border-light': '#464647',
    '--text-primary': '#cccccc',
    '--text-secondary': '#969696',
    '--text-muted': '#6e6e6e',
    '--accent': '#0e639c',
    '--accent-hover': '#1177bb',
    '--accent-bg': 'rgba(14,99,156,0.15)',
    '--green': '#4ec9b0',
    '--green-bg': 'rgba(78,201,176,0.1)',
    '--yellow': '#dcdcaa',
    '--red': '#f48771',
    '--blue': '#569cd6',
    '--radius': '0px',
    '--radius-sm': '0px',
    '--radius-md': '0px',
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '8px',
    '--space-lg': '12px',
    '--space-xl': '16px',
    '--font-ui': "-apple-system, 'Segoe UI', sans-serif",
    '--font-mono': "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    '--font-size-xs': '11px',
    '--font-size-sm': '12px',
    '--font-size-base': '13px',
    '--font-size-lg': '15px',
    '--row-height': '28px',
    '--sidebar-width': '200px',
    '--toolbar-height': '28px',
  },
  antdTokens: {
    colorPrimary: '#0e639c',
    colorBgContainer: '#2d2d2d',
    colorBgElevated: '#333333',
    colorBgLayout: '#1e1e1e',
    colorText: '#cccccc',
    colorTextSecondary: '#969696',
    colorBorder: '#3e3e42',
    colorBorderSecondary: '#464647',
    borderRadius: 0,
    borderRadiusSM: 0,
    fontSize: 13,
    fontSizeSM: 12,
    controlHeight: 28,
    controlHeightSM: 24,
    controlItemBgHover: '#2a2d2e',
    controlItemBgActive: '#373737',
  },
}

// ============================================
// 主题 B: CCB Minimal
// 灵感: Linear App Design System
// 特点: 极简 SaaS, 极深黑, 紫色点缀, 2px 微圆角, 适中密度
// ============================================
const ccbMinimal: ThemeDefinition = {
  id: 'ccb-minimal',
  name: 'CCB Minimal',
  description: 'Linear 风格极简主题，现代深灰，紫色点缀，视觉舒适',
  mode: 'dark',
  cssVars: {
    '--bg-base': '#0f0f0f',
    '--bg-sidebar': '#1a1a1a',
    '--bg-panel': '#161616',
    '--bg-elevated': '#1e1e1e',
    '--bg-input': '#1a1a1a',
    '--bg-hover': '#222222',
    '--bg-active': '#2a2a2a',
    '--border': '#2a2a2a',
    '--border-light': '#333333',
    '--text-primary': '#e4e4e4',
    '--text-secondary': '#888888',
    '--text-muted': '#555555',
    '--accent': '#8b5cf6',
    '--accent-hover': '#7c3aed',
    '--accent-bg': 'rgba(139,92,246,0.1)',
    '--accent-border': 'rgba(139,92,246,0.3)',
    '--green': '#22c55e',
    '--green-bg': 'rgba(34,197,94,0.1)',
    '--yellow': '#eab308',
    '--red': '#ef4444',
    '--blue': '#3b82f6',
    '--radius': '2px',
    '--radius-sm': '2px',
    '--radius-md': '2px',
    '--space-xs': '4px',
    '--space-sm': '6px',
    '--space-md': '10px',
    '--space-lg': '14px',
    '--space-xl': '20px',
    '--font-ui': "'SF Pro', -apple-system, 'Segoe UI', sans-serif",
    '--font-mono': "'SF Mono', 'JetBrains Mono', monospace",
    '--font-size-xs': '11px',
    '--font-size-sm': '12px',
    '--font-size-base': '13px',
    '--font-size-lg': '15px',
    '--row-height': '32px',
    '--sidebar-width': '200px',
    '--toolbar-height': '36px',
  },
  antdTokens: {
    colorPrimary: '#8b5cf6',
    colorBgContainer: '#161616',
    colorBgElevated: '#1e1e1e',
    colorBgLayout: '#0f0f0f',
    colorText: '#e4e4e4',
    colorTextSecondary: '#888888',
    colorBorder: '#2a2a2a',
    colorBorderSecondary: '#333333',
    borderRadius: 2,
    borderRadiusSM: 2,
    fontSize: 13,
    fontSizeSM: 12,
    controlHeight: 30,
    controlHeightSM: 26,
    controlItemBgHover: '#222222',
    controlItemBgActive: '#2a2a2a',
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
    '--bg-base': '#0a0a0a',
    '--bg-sidebar': '#111111',
    '--bg-panel': '#141414',
    '--bg-elevated': '#1a1a1a',
    '--bg-input': '#1a1a1a',
    '--bg-hover': '#1e1e1e',
    '--bg-active': '#222222',
    '--border': '#222222',
    '--border-light': '#333333',
    '--text-primary': '#d0d0d0',
    '--text-secondary': '#777777',
    '--text-muted': '#444444',
    '--accent': '#50fa7b',
    '--accent-hover': '#3dd966',
    '--accent-bg': 'rgba(80,250,123,0.1)',
    '--green': '#50fa7b',
    '--green-bg': 'rgba(80,250,123,0.1)',
    '--yellow': '#f1fa8c',
    '--red': '#ff5555',
    '--blue': '#8be9fd',
    '--purple': '#bd93f9',
    '--orange': '#ffb86c',
    '--radius': '0px',
    '--radius-sm': '0px',
    '--radius-md': '0px',
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '6px',
    '--space-lg': '8px',
    '--space-xl': '12px',
    '--font-ui': "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    '--font-mono': "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
    '--font-size-xs': '10px',
    '--font-size-sm': '11px',
    '--font-size-base': '12px',
    '--font-size-lg': '14px',
    '--row-height': '26px',
    '--sidebar-width': '200px',
    '--toolbar-height': '32px',
  },
  antdTokens: {
    colorPrimary: '#50fa7b',
    colorBgContainer: '#141414',
    colorBgElevated: '#1a1a1a',
    colorBgLayout: '#0a0a0a',
    colorText: '#d0d0d0',
    colorTextSecondary: '#777777',
    colorBorder: '#222222',
    colorBorderSecondary: '#333333',
    borderRadius: 0,
    borderRadiusSM: 0,
    fontSize: 12,
    fontSizeSM: 11,
    controlHeight: 26,
    controlHeightSM: 22,
    controlItemBgHover: '#1e1e1e',
    controlItemBgActive: '#222222',
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
    '--bg-base': '#ffffff',
    '--bg-sidebar': '#f6f8fa',
    '--bg-panel': '#ffffff',
    '--bg-elevated': '#f5f5f5',
    '--bg-input': '#f6f8fa',
    '--bg-hover': '#eaeef2',
    '--bg-active': '#d0d7de',
    '--border': '#d0d7de',
    '--border-light': '#afb8c1',
    '--text-primary': '#1f2328',
    '--text-secondary': '#656d76',
    '--text-muted': '#8c959f',
    '--accent': '#0969da',
    '--accent-hover': '#0860ca',
    '--accent-bg': 'rgba(9,105,218,0.1)',
    '--green': '#1a7f37',
    '--green-bg': 'rgba(26,127,55,0.1)',
    '--yellow': '#9a6700',
    '--red': '#cf222e',
    '--blue': '#0969da',
    '--radius': '6px',
    '--radius-sm': '4px',
    '--radius-md': '6px',
    '--space-xs': '2px',
    '--space-sm': '4px',
    '--space-md': '8px',
    '--space-lg': '12px',
    '--space-xl': '16px',
    '--font-ui': "-apple-system, 'Segoe UI', sans-serif",
    '--font-mono': "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
    '--font-size-xs': '11px',
    '--font-size-sm': '12px',
    '--font-size-base': '13px',
    '--font-size-lg': '15px',
    '--row-height': '32px',
    '--sidebar-width': '200px',
    '--toolbar-height': '32px',
  },
  antdTokens: {
    colorPrimary: '#0969da',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f6f8fa',
    colorText: '#1f2328',
    colorTextSecondary: '#656d76',
    colorBorder: '#d0d7de',
    colorBorderSecondary: '#eaeef2',
    borderRadius: 6,
    borderRadiusSM: 4,
    fontSize: 13,
    fontSizeSM: 12,
    controlHeight: 32,
    controlHeightSM: 26,
    controlItemBgHover: '#eaeef2',
    controlItemBgActive: '#d0d7de',
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
