/**
 * CCB 管理员权限启动脚本
 * 用于强制以管理员权限启动 CCB 应用
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * 获取当前平台
 */
function getPlatform() {
  return process.platform;
}

/**
 * 获取当前可执行文件路径
 */
function getExecutablePath() {
  return process.execPath;
}

/**
 * Windows 平台管理员权限启动
 */
function startAsAdminWindows() {
  const currentExecutable = getExecutablePath();
  const currentArgs = process.argv.slice(1);

  // 构建参数字符串
  const argsString = currentArgs.length > 0
    ? `-ArgumentList "${currentArgs.join('" "').replace(/"/g, '""')}"`
    : '';

  // PowerShell 命令以管理员权限启动
  const powershellCommand = `Start-Process -FilePath "${currentExecutable}" ${argsString} -Verb RunAs`;

  console.log(`正在以管理员权限启动应用...`);
  console.log(`命令: powershell.exe -Command "${powershellCommand}"`);

  const child = spawn('powershell.exe', ['-Command', powershellCommand], {
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (error) => {
    console.error('启动失败:', error);
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log(`管理员权限启动进程退出，代码: ${code}`);
    process.exit(code);
  });
}

/**
 * macOS 平台管理员权限启动
 */
function startAsAdminMacOS() {
  const currentExecutable = getExecutablePath();
  const currentArgs = process.argv.slice(1);

  // 构建完整的命令
  const fullCommand = `"${currentExecutable}" ${currentArgs.join(' ')}`;

  // 使用 osascript 以管理员权限执行
  const osascriptCommand = `do shell script "${fullCommand}" with administrator privileges`;

  console.log(`正在以管理员权限启动应用...`);
  console.log(`命令: osascript -e '${osascriptCommand}'`);

  const child = spawn('osascript', ['-e', osascriptCommand], {
    stdio: 'inherit',
    shell: true
  });

  child.on('error', (error) => {
    console.error('启动失败:', error);
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log(`管理员权限启动进程退出，代码: ${code}`);
    process.exit(code);
  });
}

/**
 * Linux 平台管理员权限启动
 */
async function startAsAdminLinux() {
  const currentExecutable = getExecutablePath();
  const currentArgs = process.argv.slice(1);

  // 首先尝试使用 pkexec
  try {
    console.log(`正在使用 pkexec 以管理员权限启动应用...`);

    const child = spawn('pkexec', [currentExecutable, ...currentArgs], {
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      console.error('pkexec 启动失败:', error);
      // 如果 pkexec 失败，尝试使用 sudo
      startWithSudo();
    });

    child.on('close', (code) => {
      console.log(`管理员权限启动进程退出，代码: ${code}`);
      process.exit(code);
    });

  } catch (error) {
    console.error('pkexec 不可用，尝试使用 sudo...');
    startWithSudo();
  }
}

/**
 * 使用 sudo 启动 (Linux)
 */
function startWithSudo() {
  const currentExecutable = getExecutablePath();
  const currentArgs = process.argv.slice(1);

  console.log(`正在使用 sudo 以管理员权限启动应用...`);

  const child = spawn('sudo', [currentExecutable, ...currentArgs], {
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error('sudo 启动失败:', error);
    console.error('请手动以管理员权限运行应用');
    process.exit(1);
  });

  child.on('close', (code) => {
    console.log(`管理员权限启动进程退出，代码: ${code}`);
    process.exit(code);
  });
}

/**
 * 主函数 - 根据平台执行相应的管理员启动逻辑
 */
function main() {
  const platform = getPlatform();

  console.log(`CCB 管理员权限启动脚本`);
  console.log(`当前平台: ${platform}`);
  console.log(`可执行文件: ${getExecutablePath()}`);
  console.log(`---`);

  switch (platform) {
    case 'win32':
      startAsAdminWindows();
      break;
    case 'darwin':
      startAsAdminMacOS();
      break;
    case 'linux':
      startAsAdminLinux();
      break;
    default:
      console.error(`不支持的平台: ${platform}`);
      console.error('请手动以管理员权限运行应用');
      process.exit(1);
  }
}

// 执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  main,
  startAsAdminWindows,
  startAsAdminMacOS,
  startAsAdminLinux
};