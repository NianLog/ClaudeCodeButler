/**
 * Message Hook
 * 提供Ant Design消息API的Hook封装
 */

import { App, message as staticMessage } from 'antd'

/**
 * 使用消息API的Hook
 * @returns 消息API对象
 */
export const useMessage = () => {
  try {
    // 尝试使用App context
    return App.useApp().message
  } catch {
    // 如果App context不可用，回退到静态message
    return staticMessage
  }
}

export default useMessage
