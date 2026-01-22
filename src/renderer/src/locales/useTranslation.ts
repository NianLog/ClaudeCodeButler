/**
 * 国际化 React Hook
 * 提供翻译功能
 */

import { useCallback, useMemo } from 'react'
import { useSettingsStore } from '../store/settings-store'
import {
  SupportedLanguage,
  TranslationKey,
  TranslationDict,
  languageResources,
  getCurrentLanguage,
  setCurrentLanguage,
  formatTranslation
} from './index'

// 翻译函数类型
export type TranslateFunction = (key: TranslationKey, variables?: Record<string, string | number>) => string

// 翻译 Hook 返回类型
export interface UseTranslationReturn {
  /** 当前语言 */
  language: SupportedLanguage
  /** 翻译函数 */
  t: TranslateFunction
  /** 切换语言 */
  setLanguage: (language: SupportedLanguage) => void
  /** 可用语言列表 */
  availableLanguages: Array<{ code: SupportedLanguage; name: string }>
  /** 翻译字典（用于调试） */
  dictionary: TranslationDict
}

// 语言显示名称
const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English'
}

/**
 * 国际化 Hook
 */
export const useTranslation = (): UseTranslationReturn => {
  // 从设置中获取语言，如果没有则使用默认语言
  const settingsLanguage = useSettingsStore((state) => {
    try {
      return state?.settings?.basic?.language
    } catch (error) {
      console.warn('Error accessing language from settings:', error)
      return undefined
    }
  })
  const { setTabSettings } = useSettingsStore((state) => {
    try {
      return { setTabSettings: state.setTabSettings }
    } catch (error) {
      console.warn('Error accessing setTabSettings:', error)
      return { setTabSettings: () => {} }
    }
  })

  // 获取当前语言
  const language = useMemo(() => {
    return settingsLanguage || getCurrentLanguage()
  }, [settingsLanguage])

  // 获取翻译字典
  const dictionary = useMemo(() => {
    return languageResources[language] || languageResources['zh-CN']
  }, [language])

  // 翻译函数
  const t = useCallback<TranslateFunction>((key: TranslationKey, variables = {}) => {
    const translation = dictionary[key]

    if (translation === undefined) {
      console.warn(`Translation key "${key}" not found for language "${language}"`)
      return key // 返回键名作为后备
    }

    // 如果是 ReactNode，则转换为字符串
    if (typeof translation !== 'string') {
      return String(translation)
    }

    return formatTranslation(translation, variables)
  }, [dictionary, language])

  // 切换语言
  const setLanguage = useCallback((newLanguage: SupportedLanguage) => {
    try {
      // 保存到设置
      setTabSettings('basic', { language: newLanguage })

      // 保存到 localStorage
      setCurrentLanguage(newLanguage)

      // 设置 HTML lang 属性
      document.documentElement.lang = newLanguage
    } catch (error) {
      console.warn('Error setting language:', error)
      // 至少设置 localStorage 和 HTML lang 属性
      setCurrentLanguage(newLanguage)
      document.documentElement.lang = newLanguage
    }
  }, [setTabSettings])

  // 可用语言列表
  const availableLanguages = useMemo(() => {
    return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({
      code: code as SupportedLanguage,
      name
    }))
  }, [])

  return {
    language,
    t,
    setLanguage,
    availableLanguages,
    dictionary
  }
}

/**
 * 获取翻译的静态函数（在组件外使用）
 */
export const getTranslation = (key: TranslationKey, language?: SupportedLanguage, variables?: Record<string, string | number>): string => {
  const targetLanguage = language || getCurrentLanguage()
  const dictionary = languageResources[targetLanguage] || languageResources['zh-CN']

  const translation = dictionary[key]

  if (translation === undefined) {
    console.warn(`Translation key "${key}" not found for language "${targetLanguage}"`)
    return key
  }

  if (typeof translation !== 'string') {
    return String(translation)
  }

  return formatTranslation(translation, variables)
}