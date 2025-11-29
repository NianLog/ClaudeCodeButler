/**
 * 应用 Logo 组件
 * 提供不同尺寸的图标
 */

import React from 'react'

export interface LogoProps {
  /** 图标尺寸 */
  size?: 16 | 32 | 64 | 128 | 256 | 512
  /** 自定义类名 */
  className?: string
  /** 自定义样式 */
  style?: React.CSSProperties
  /** 是否显示动画效果 */
  animated?: boolean
}

/**
 * Logo 组件
 */
export const Logo: React.FC<LogoProps> = ({
  size = 32,
  className = '',
  style = {},
  animated = false
}) => {
  // 获取图标路径（使用优化版本）
  const getIconPath = () => {
    switch (size) {
      case 16:
        return new URL('../../assets/icons/logo-optimized-16x16.svg', import.meta.url).href
      case 32:
        return new URL('../../assets/icons/logo-optimized-32x32.svg', import.meta.url).href
      case 64:
        return new URL('../../assets/icons/logo-optimized-64x64.svg', import.meta.url).href
      case 128:
        return new URL('../../assets/icons/logo-optimized-128x128.svg', import.meta.url).href
      case 256:
        return new URL('../../assets/icons/logo-optimized-256x256.svg', import.meta.url).href
      case 512:
        return new URL('../../assets/icons/logo-optimized-512x512.svg', import.meta.url).href
      default:
        return new URL('../../assets/icons/logo-optimized-32x32.svg', import.meta.url).href
    }
  }

  // 组合样式
  const combinedStyle: React.CSSProperties = {
    width: size,
    height: size,
    ...(animated && {
      animation: 'logoSpin 20s linear infinite',
      transition: 'transform 0.3s ease'
    }),
    ...style
  }

  // 添加动画样式
  React.useEffect(() => {
    if (animated && typeof document !== 'undefined') {
      const style = document.createElement('style')
      style.textContent = `
        @keyframes logoSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes logoPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .logo-animated:hover {
          animation: logoPulse 2s ease-in-out infinite;
        }
      `
      document.head.appendChild(style)

      return () => {
        document.head.removeChild(style)
      }
    }
  }, [animated])

  return (
    <img
      src={getIconPath()}
      alt="Claude Code Butler Logo"
      className={`logo ${animated ? 'logo-animated' : ''} ${className}`}
      style={combinedStyle}
      decoding="async"
    />
  )
}

/**
 * 小尺寸 Logo (16x16)
 */
export const LogoSmall: React.FC<Omit<LogoProps, 'size'>> = (props) => (
  <Logo {...props} size={16} />
)

/**
 * 中等尺寸 Logo (32x32)
 */
export const LogoMedium: React.FC<Omit<LogoProps, 'size'>> = (props) => (
  <Logo {...props} size={32} />
)

/**
 * 大尺寸 Logo (64x64)
 */
export const LogoLarge: React.FC<Omit<LogoProps, 'size'>> = (props) => (
  <Logo {...props} size={64} />
)

/**
 * 超大尺寸 Logo (128x128)
 */
export const LogoXLarge: React.FC<Omit<LogoProps, 'size'>> = (props) => (
  <Logo {...props} size={128} />
)

export default Logo