/**
 * @file src/main/utils/path-manager.ts
 * @description 提供应用所需的绝对路径
 * 所有路径都基于用户主目录,确保无论程序在哪运行都能正确找到配置文件
 */

import path from 'path';
import os from 'os';
import { CONFIG_FILES, PATHS as PATH_CONSTANTS } from '@shared/constants';
import { ClaudeWorkspacePathFacade } from './claude-workspace-path-facade';

// 使用用户主目录而不是程序运行目录
const HOME_DIR = os.homedir();

// CCB 主目录 (用户目录/.ccb)
const APP_DATA_BASE_DIR = path.join(HOME_DIR, PATH_CONSTANTS.USER_DATA);

// v1.5.0 明确保持 legacy path，只有受控 migration 完成后才能切换 WORKSPACE_V2。
export const claudeWorkspacePathFacade = new ClaudeWorkspacePathFacade(APP_DATA_BASE_DIR, 'LEGACY_COMPAT');
const CLAUDE_WORKSPACE_PATHS = claudeWorkspacePathFacade.getPaths();

/**
 * 包含应用所有关键绝对路径的对象
 */
export const pathManager = {
  // 系统路径
  home: HOME_DIR,

  // 应用主目录 (用户目录/.ccb)
  appDataDir: APP_DATA_BASE_DIR,

  // 子目录
  dataDir: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.DATA_DIR),
  backupDir: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.BACKUP_DIR),
  logDir: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.LOG_DIR),
  cacheDir: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.CACHE_DIR),
  configDir: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.CONFIG_DIR),
  registryDir: path.join(APP_DATA_BASE_DIR, 'registry'),
  toolArtifactBackupDir: path.join(APP_DATA_BASE_DIR, 'backups', 'tool-artifacts'),

  // Claude 配置目录 compatibility alias；v1.5.0 active path 仍为 ~/.ccb/claude-configs。
  claudeConfigsDir: CLAUDE_WORKSPACE_PATHS.activePath,
  claudeLegacyConfigsDir: CLAUDE_WORKSPACE_PATHS.legacyPath,
  claudeWorkspaceDir: CLAUDE_WORKSPACE_PATHS.workspacePath,
  claudeWorkspaceMode: CLAUDE_WORKSPACE_PATHS.mode,

  // 具体文件路径
  rulesFile: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.DATA_DIR, CONFIG_FILES.RULES_FILE),
  ruleExecutionsLogFile: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.DATA_DIR, 'rule-executions.json'),
  settingsFile: path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.CONFIG_DIR, CONFIG_FILES.SETTINGS),
  installedRegistryFile: path.join(APP_DATA_BASE_DIR, 'registry', 'installed.json'),
  installedRegistryMetadataFile: path.join(APP_DATA_BASE_DIR, 'registry', 'installed.meta.json'),
  lastKnownGoodRegistryFile: path.join(APP_DATA_BASE_DIR, 'registry', 'last-known-good.json'),

  // Claude 用户目录相关路径（~/.claude）—— v1.4.0 新增，消除全代码库 os.homedir()+'.claude' 散落拼接
  claudeDir: path.join(HOME_DIR, '.claude'),
  userSettingsPath: path.join(HOME_DIR, '.claude', 'settings.json'),
  claudeJsonPath: path.join(HOME_DIR, '.claude.json'),
  claudeMdPath: path.join(HOME_DIR, '.claude', 'CLAUDE.md'),
  claudeProjectsDir: path.join(HOME_DIR, '.claude', 'projects'),

  /**
   * 获取 Claude 配置文件的绝对路径
   * @param fileName 文件名 (如 'CLAUDE.md', '.claude.json')
   * @returns {string} 绝对路径 (用户目录/.ccb/claude-configs/文件名)
   */
  getClaudeConfigPath(fileName: string): string {
    return claudeWorkspacePathFacade.resolveActiveFile(fileName);
  },

  /**
   * 获取备份文件路径
   * @param fileName 文件名
   * @returns {string} 绝对路径
   */
  getBackupPath(fileName: string): string {
    return path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.BACKUP_DIR, fileName);
  },

  /**
   * 获取日志文件路径
   * @param fileName 文件名
   * @returns {string} 绝对路径
   */
  getLogPath(fileName: string): string {
    return path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.LOG_DIR, fileName);
  },

  /**
   * 获取缓存文件路径
   * @param fileName 文件名
   * @returns {string} 绝对路径
   */
  getCachePath(fileName: string): string {
    return path.join(APP_DATA_BASE_DIR, PATH_CONSTANTS.CACHE_DIR, fileName);
  }
};
