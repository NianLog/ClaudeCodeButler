/**
 * @file src/main/services/update-service.ts
 * @description 负责应用更新检查
 */

import axios from 'axios';
import { app } from 'electron';
import { logger } from '../utils/logger';

const VERSION_URL = 'https://dev.niansir.com/software/ccb/version.txt';

class UpdateService {
  public async checkForUpdates(): Promise<void> {
    logger.info('正在检查更新...');
    try {
      const response = await axios.get(VERSION_URL, { timeout: 15000 });
      const versionInfo = this.parseVersionInfo(response.data);

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
    const { Notification, shell } = require('electron');
    const { join } = require('path');
    const fs = require('fs');
    const { APP_INFO } = require('@shared/constants');

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
      icon: iconPath || undefined,
      ...(process.platform === 'win32' && {
        appUserModelId: APP_INFO.FULL_NAME
      })
    });

    notification.on('click', () => {
        shell.openExternal('https://dev.niansir.com/software/ccb');
    });

    notification.show();
  }
}

export const updateService = new UpdateService();
