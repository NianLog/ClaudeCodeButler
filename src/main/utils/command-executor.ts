/**
 * 安全命令执行器
 * @file src/main/utils/command-executor.ts
 * @description 参数化执行外部命令（spawn + shell:false），从根本上消除命令注入风险。
 *
 * 背景：v1 的 rule-engine / environment-check 通过 terminalManagementService.executeCommand
 * 以 shell 拼接方式执行用户配置的自定义命令，构成任意 shell 执行（RCE）入口。
 * v1.4.0 引入本执行器作为统一入口：
 *  1. 解析命令字符串为 [binary, ...args]，拒绝包含 shell 元字符的输入；
 *  2. 使用 spawn(binary, args, { shell: false }) 执行，不经 shell，元字符不再被解释；
 *  3. 记录审计日志便于溯源。
 *
 * 这是 PRD 4.4「参数化保留」决策的落地：保留自定义命令能力，但消除 RCE。
 */

import { spawn } from 'child_process'
import { logger } from './logger'

/**
 * 禁止的 shell 元字符集合
 * @description 出现任一字符即拒绝执行，防止 `;` `|` `&` `$()` 反引号等被注入。
 *              参数化模型下这些字符无合法用途（多命令应拆分为多条规则）。
 */
const FORBIDDEN_METACHARACTERS = /[;|&$`<>\\\n\r]|\$\(|`/

/** 命令执行选项 */
export interface ExecuteCommandOptions {
  /** 工作目录 */
  cwd?: string
  /** 超时时间（毫秒） */
  timeout?: number
  /** 环境变量 */
  env?: NodeJS.ProcessEnv
}

/** 命令执行结果 */
export interface ExecuteCommandResult {
  /** 标准输出 */
  stdout: string
  /** 标准错误 */
  stderr: string
  /** 退出码（null 表示未正常退出） */
  exitCode: number | null
  /** 是否成功（exitCode === 0 且无错误） */
  success: boolean
  /** 错误对象（启动失败/超时等） */
  error?: Error
}

/**
 * 将命令字符串解析为 [binary, ...args] 数组
 * @description 支持双引号/单引号包裹的参数；检测并拒绝 shell 元字符。
 * @param command 原始命令字符串
 * @returns 解析后的参数数组，第一个元素为可执行文件
 * @throws 若命令为空或包含禁止的 shell 元字符
 */
export function parseCommand(command: string): string[] {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('命令不能为空')
  }
  if (FORBIDDEN_METACHARACTERS.test(trimmed)) {
    throw new Error(`命令包含禁止的 shell 元字符，已拒绝执行: ${trimmed}`)
  }
  // 按空白分词，支持引号包裹的含空格参数
  const tokens = trimmed.match(/"[^"]*"|'[^']*'|\S+/g) || []
  return tokens.map((token) => token.replace(/^["']|["']$/g, ''))
}

/**
 * 参数化执行命令（shell:false，消除命令注入）
 * @param command 命令字符串（将被解析为 binary + args）
 * @param options 执行选项
 * @returns 执行结果（包含 stdout/stderr/exitCode/success/error）
 */
export async function executeCommand(
  command: string,
  options: ExecuteCommandOptions = {}
): Promise<ExecuteCommandResult> {
  const [binary, ...args] = parseCommand(command)
  if (!binary) {
    throw new Error('命令缺少可执行文件')
  }

  // 审计日志：记录所有命令执行，便于事后溯源
  logger.info(`[CommandExecutor] 执行: ${binary} ${args.join(' ')}`)

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process - parseCommand 拒绝 shell 元字符，且 shell:false 保持参数边界。
      child = spawn(binary, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false, // 关键：禁止 shell，元字符不被解释，消除注入
        windowsHide: true
      })
    } catch (error) {
      resolve({
        stdout: '',
        stderr: '',
        exitCode: null,
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    const timer = options.timeout
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGTERM')
        }, options.timeout)
      : null

    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: null, success: false, error })
    })

    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        resolve({
          stdout,
          stderr,
          exitCode: code,
          success: false,
          error: new Error(`命令执行超时 (${options.timeout}ms)`)
        })
      } else {
        resolve({ stdout, stderr, exitCode: code, success: code === 0 })
      }
    })
  })
}
