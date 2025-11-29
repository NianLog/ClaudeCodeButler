

/**
 * 版本检查服务
 * 提供版本信息获取、版本对比和更新检查功能
 */

/**
 * 版本信息接口
 */
export interface VersionInfo {
  /** 应用ID和版本号 */
  appId: string
  /** 下载地址 */
  downloadUrl: string
  /** 压缩包密码 */
  zipPassword: string
  /** 更新说明 */
  updateText: string
}

/**
 * 版本比较结果
 */
export interface VersionCompareResult {
  /** 是否有新版本 */
  hasUpdate: boolean
  /** 当前版本 */
  currentVersion: string
  /** 最新版本 */
  latestVersion: string
  /** 版本信息 */
  versionInfo?: VersionInfo
}

/**
 * 版本服务类
 */
class VersionService {
  /** 版本信息URL */
  private readonly VERSION_URL = 'https://dev.niansir.com/software/ccb/version.txt'

  /** 文档链接 */
  public readonly DOCS_URL = 'https://dev.niansir.com/software/ccb/docs'

  /** 官网链接 */
  public readonly WEBSITE_URL = 'https://dev.niansir.com/software/ccb'

  /** GitHub链接 */
  public readonly GITHUB_URL = 'https://github.com/NianLog'

  /** 当前版本号(从package.json读取) */
  private currentVersion: string = '1.0.0'

  /**
   * 设置当前版本号
   * @param version 版本号
   */
  setCurrentVersion(version: string): void {
    this.currentVersion = version
  }

  /**
   * 获取当前版本号
   * @returns 当前版本号
   */
  getCurrentVersion(): string {
    return this.currentVersion
  }

  /**
   * 解析版本信息文本
   * @param text 版本信息文本
   * @returns 解析后的版本信息
   */
  private parseVersionInfo(text: string): VersionInfo {
    // 解析格式: [appId]1.0.0[/appId]
    const appIdMatch = text.match(/\[appId\](.*?)\[\/appId\]/)
    const downloadMatch = text.match(/\[down\](.*?)\[\/down\]/)
    const zipPwMatch = text.match(/\[ziPw\](.*?)\[\/ziPw\]/)
    const textMatch = text.match(/\[text\](.*?)\[\/text\]/)

    if (!appIdMatch || !downloadMatch) {
      throw new Error('版本信息格式错误')
    }

    return {
      appId: appIdMatch[1].trim(),
      downloadUrl: downloadMatch[1].trim(),
      zipPassword: zipPwMatch ? zipPwMatch[1].trim() : '',
      updateText: textMatch ? textMatch[1].trim() : ''
    }
  }

  /**
   * 获取远程版本信息
   * @returns 版本信息
   */
  async fetchVersionInfo(): Promise<VersionInfo> {
    const result = await window.electronAPI.system.fetchUrl(this.VERSION_URL);

    if (result.success && result.data) {
      return this.parseVersionInfo(result.data);
    } else {
      throw new Error(result.error || '无法获取版本信息,请检查网络连接');
    }
  }

  /**
   * 比较版本号
   * @param v1 版本号1
   * @param v2 版本号2
   * @returns -1: v1 < v2, 0: v1 = v2, 1: v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    // 确保版本号是字符串
    const version1 = String(v1 || '0.0.0')
    const version2 = String(v2 || '0.0.0')

    const parts1 = version1.split('.').map(Number)
    const parts2 = version2.split('.').map(Number)

    const maxLength = Math.max(parts1.length, parts2.length)

    for (let i = 0; i < maxLength; i++) {
      const num1 = parts1[i] || 0
      const num2 = parts2[i] || 0

      if (num1 > num2) return 1
      if (num1 < num2) return -1
    }

    return 0
  }

  /**
   * 检查更新
   * @returns 版本比较结果
   */
  async checkForUpdates(): Promise<VersionCompareResult> {
    try {
      const versionInfo = await this.fetchVersionInfo()
      const latestVersion = versionInfo.appId

      console.log('当前版本:', this.currentVersion, '类型:', typeof this.currentVersion)
      console.log('最新版本:', latestVersion, '类型:', typeof latestVersion)

      const compareResult = this.compareVersions(this.currentVersion, latestVersion)
      const hasUpdate = compareResult < 0

      return {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
        versionInfo: hasUpdate ? versionInfo : undefined
      }
    } catch (error) {
      console.error('检查更新失败:', error)
      throw error
    }
  }

  /**
   * 格式化更新说明(处理/n为换行)
   * @param text 更新说明文本
   * @returns 格式化后的文本
   */
  formatUpdateText(text: string): string {
    return text.replace(/\/n/g, '\n')
  }

  /**
   * 打开下载页面
   * @param url 下载URL(可选,默认使用官网)
   */
  async openDownloadPage(url?: string): Promise<void> {
    const targetUrl = url || this.WEBSITE_URL
    try {
      await window.electronAPI.system.openExternal(targetUrl)
    } catch (error) {
      console.error('打开下载页面失败:', error)
      throw new Error('打开下载页面失败')
    }
  }

  /**
   * 打开文档页面
   */
  async openDocsPage(): Promise<void> {
    try {
      await window.electronAPI.system.openExternal(this.DOCS_URL)
    } catch (error) {
      console.error('打开文档页面失败:', error)
      throw new Error('打开文档页面失败')
    }
  }

  /**
   * 打开GitHub页面
   */
  async openGitHubPage(): Promise<void> {
    try {
      await window.electronAPI.system.openExternal(this.GITHUB_URL)
    } catch (error) {
      console.error('打开GitHub页面失败:', error)
      throw new Error('打开GitHub页面失败')
    }
  }
}

// 导出单例
export const versionService = new VersionService()
