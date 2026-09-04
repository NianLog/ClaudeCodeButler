/**
 * CCB 管理员权限启动脚本
 * 用于强制以管理员权限启动 CCB 应用
 *
 * 安全模型（npm 脚本调用本脚本时不传任何附加参数，因此不做 argv 透传）：
 * - 解释器（PowerShell / osascript）只接收完全静态的脚本文本，
 *   目标程序路径经环境变量传入，运行期作为"数据"而非"代码"读取；
 * - 目标路径先经 validateExecutablePath 白名单校验（仅允许路径常规字符）；
 * - Linux pkexec/sudo 参数数组为固定结构，"--" 终止特权程序选项解析，
 *   其后唯一的动态值是已校验的目标路径。
 * 如未来需要透传参数：必须逐项白名单校验，并保持 "--" 终止符，禁止拼接解释器字符串。
 */

const { spawn } = require('child_process');
const os = require('os');

/** 可执行文件路径白名单：字母数字与路径常规字符（不含引号/$/;等解释器元字符） */
const EXECUTABLE_PATH_PATTERN = /^[\w@+=:,./ \\-]+$/;

/**
 * 校验目标可执行文件路径只含路径常规字符
 * @param {string} executablePath 目标可执行文件路径
 */
function validateExecutablePath(executablePath) {
  if (typeof executablePath !== 'string' || executablePath.length === 0
    || !EXECUTABLE_PATH_PATTERN.test(executablePath)) {
    console.error(`已拒绝包含特殊字符的目标路径: ${JSON.stringify(executablePath)}`);
    console.error('目标路径只允许字母数字与路径常规字符（禁止引号、$、;、&、| 等字符）');
    process.exit(1);
  }
}

/**
 * Windows 平台管理员权限启动
 * 静态 PowerShell 脚本从环境变量读取目标路径，Start-Process 将其作为值而非代码处理。
 */
const WINDOWS_ELEVATE_SCRIPT = 'Start-Process -FilePath $env:CCB_ELEVATE_TARGET -Verb RunAs';

function startAsAdminWindows() {
  const currentExecutable = process.execPath;
  validateExecutablePath(currentExecutable);

  console.log('正在以管理员权限启动应用...');
  console.log('命令: powershell.exe -NoProfile -Command <静态提升脚本>（目标路径经环境变量传入）');

  const child = spawn('powershell.exe', ['-NoProfile', '-Command', WINDOWS_ELEVATE_SCRIPT], {
    stdio: 'inherit',
    env: { ...process.env, CCB_ELEVATE_TARGET: currentExecutable }
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
 * 静态 AppleScript 经 system attribute 读取环境变量，quoted form of 完成可靠的单引号包裹。
 */
const MACOS_ELEVATE_SCRIPT =
  'do shell script (quoted form of (system attribute "CCB_ELEVATE_TARGET")) with administrator privileges';

function startAsAdminMacOS() {
  const currentExecutable = process.execPath;
  validateExecutablePath(currentExecutable);

  console.log('正在以管理员权限启动应用...');
  console.log('命令: osascript -e <静态提升脚本>（目标路径经环境变量传入）');

  const child = spawn('osascript', ['-e', MACOS_ELEVATE_SCRIPT], {
    stdio: 'inherit',
    env: { ...process.env, CCB_ELEVATE_TARGET: currentExecutable }
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
  const currentExecutable = process.execPath;
  validateExecutablePath(currentExecutable);

  // 首先尝试使用 pkexec（"--" 终止 pkexec 自身选项解析，其后仅为已校验的目标路径）
  try {
    console.log('正在使用 pkexec 以管理员权限启动应用...');

    const child = spawn('pkexec', ['--', currentExecutable], {
      stdio: 'inherit'
    });

    child.on('error', (error) => {
      console.error('pkexec 启动失败:', error);
      // 如果 pkexec 失败，尝试使用 sudo
      startWithSudo(currentExecutable);
    });

    child.on('close', (code) => {
      console.log(`管理员权限启动进程退出，代码: ${code}`);
      process.exit(code);
    });

  } catch (error) {
    console.error('pkexec 不可用，尝试使用 sudo...');
    startWithSudo(currentExecutable);
  }
}

/**
 * 使用 sudo 启动 (Linux)
 * @param {string} executable 已通过白名单校验的目标可执行文件路径
 */
function startWithSudo(executable) {
  console.log('正在使用 sudo 以管理员权限启动应用...');

  // "--" 终止 sudo 选项解析，其后仅为已校验的目标路径
  const child = spawn('sudo', ['--', executable], {
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
  const platform = process.platform;

  console.log('CCB 管理员权限启动脚本');
  console.log(`当前平台: ${platform}`);
  console.log(`可执行文件: ${process.execPath}`);
  console.log(`宿主 OS: ${os.type()} ${os.release()}`);
  console.log('---');

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
  startAsAdminLinux,
  validateExecutablePath
};
