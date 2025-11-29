/**
 * 配置列表with通知Hook
 * 将通知功能注入到配置列表store中
 */

import { useAppStore } from '../store/app-store'
import { useConfigListStore } from '../store/config-list-store'

/**
 * 使用配置列表with通知功能
 * @returns 配置列表store with通知功能
 */
export const useConfigListWithNotification = () => {
  const { addNotification } = useAppStore()
  const configListStore = useConfigListStore()

  // 创建带有通知功能的store
  const enhancedStore = {
    ...configListStore,
    // 添加通知功能
    addNotification: addNotification
  }

  return enhancedStore
}

export default useConfigListWithNotification