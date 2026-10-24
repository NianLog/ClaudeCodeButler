/**
 * @file src/main/services/update-service.ts
 * @description 负责应用更新检查
 */

import { app, Notification, shell } from 'electron';
import { join } from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';
import { registryUpdateService, NetFetchRegistryHttpClient } from './registry-update-service';

export const VERSION_URL = 'https://dev.niansir.com/software/ccb/version.txt';

class UpdateService {
  public async fetchVersionText(url: string = VERSION_URL): Promise<string> {
    if (url !== VERSION_URL) throw new Error('仅允许读取固定的 CCB 版本地址');
    return new NetFetchRegistryHttpClient().getText(VERSION_URL, 64 * 1024);
  }

  public async checkForUpdates(): Promise<void> {
    const registryCheck = registryUpdateService.checkForUpdates(app.getVersion()).catch((error) => ({
      state: 'CHECK_FAILED' as const,
      embeddedVersion: '0.0.0',
      error: error instanceof Error ? error.message : String(error)
    }));
    logger.info('正在检查更新...');
    try {
      const versionInfo = this.parseVersionInfo(await this.fetchVersionText());

      if (!versionInfo.version) {
        logger.warn('无法从版本文件中解析出版本号。');
        return;
      }

      const currentVersion = app.getVersion();
      logger.info(`当前版本: ${currentVersion}, 最新版本: ${versionInfo.version}`);

      if (this.isNewerVersion(versionInfo.version, currentVersion)) {
        logger.info(`发现新版本: ${versionInfo.version}`);
        this.notifyUser(versionInfo);
      } else {
        logger.info('当前已是最新版本。');
      }
    } catch (error) {
      logger.error('检查更新失败:', error);
    }

    const registryStatus = await registryCheck;
    if (registryStatus.state === 'UPDATE_AVAILABLE') {
      logger.info(`发现规则库更新: ${registryStatus.availableVersion}`);
    } else if (registryStatus.state === 'CHECK_FAILED') {
      logger.warn(`规则库版本检查失败: ${registryStatus.error}`);
    }
  }

  private parseVersionInfo(data: string): { version: string | null; text: string | null } {
    const versionMatch = data.match(/\[appId\](.*?)\[\/appId\]/);
    const textMatch = data.match(/\[text\](.*?)\[\/text\]/);
    return {
      version: versionMatch ? versionMatch[1].trim() : null,
      text: textMatch ? textMatch[1].replace(/\/n/g, '\n').trim() : '有新的更新可用！',
    };
  }

  private isNewerVersion(remote: string, local: string): boolean {
    const remoteParts = remote.split('.').map(Number);
    const localParts = local.split('.').map(Number);
    const len = Math.max(remoteParts.length, localParts.length);

    for (let i = 0; i < len; i++) {
      const remotePart = remoteParts[i] || 0;
      const localPart = localParts[i] || 0;
      if (remotePart > localPart) return true;
      if (remotePart < localPart) return false;
    }
    return false;
  }

  private notifyUser(versionInfo: { version: string | null; text: string | null }): void {
    // 获取图标路径
    let iconPath = '';
    if (process.platform === 'win32') {
      const icoPath = join(__dirname, '../../../resources/icons/ccb.ico');
      if (fs.existsSync(icoPath)) {
        iconPath = icoPath;
      }
    }

    const notification = new Notification({
      title: `发现新版本 v${versionInfo.version}`,
      body: versionInfo.text || '建议您立即更新以获取最佳体验。',
      icon: iconPath || undefined
    });

    notification.on('click', () => {
        shell.openExternal('https://dev.niansir.com/software/ccb');
    });

    notification.show();
  }
}

export const updateService = new UpdateService();
