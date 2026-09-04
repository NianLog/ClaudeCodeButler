/**
 * @file src/main/services/tool-detection-service.ts
 * @description 安全解析规则库路径，并以无 shell 的方式执行 AI 工具安装检测器。
 */

import { execFile } from 'child_process'
import { access } from 'fs/promises'
import os from 'os'
import path from 'path'
import type {
  ToolDefinition,
  ToolDetectorDefinition,
  ToolDetectionResult,
  ToolPlatform
} from '@shared/tool-registry'
import { pathManager } from '../utils/path-manager'

/** 规则路径允许引用的根变量 */
export const TOOL_PATH_VARIABLES = [
  'HOME',
  'APPDATA',
  'LOCALAPPDATA',
  'XDG_CONFIG_HOME',
  'CCB_DATA'
] as const

/** 规则路径根变量名称 */
export type ToolPathVariable = typeof TOOL_PATH_VARIABLES[number]

/** 单项 detector 的可审计执行结果 */
export interface ToolDetectorExecutionResult {
  /** detector 在工具定义中的位置 */
  index: number
  /** detector 类型 */
  type: ToolDetectorDefinition['type']
  /** 当前 detector 是否命中 */
  matched: boolean
  /** PATH_EXISTS 安全解析后的路径 */
  resolvedPath?: string
  /** COMMAND_EXISTS 校验后的命令名 */
  command?: string
  /** 非预期输入或执行失败的安全错误摘要 */
  error?: string
}

/** 包含逐项详情的工具检测结果 */
export interface DetailedToolDetectionResult extends ToolDetectionResult {
  /** 每个 detector 的独立执行结果 */
  detectorResults: ToolDetectorExecutionResult[]
}

/** detector service 可替换依赖，主要用于隔离测试和平台模拟 */
export interface ToolDetectionServiceOptions {
  /** 目标运行平台，默认使用当前 Node.js 平台 */
  platform?: NodeJS.Platform
  /** 路径根变量覆盖值 */
  pathVariables?: Partial<Record<ToolPathVariable, string>>
  /** 文件存在性检查器 */
  pathExists?: (targetPath: string) => Promise<boolean>
  /** command lookup 执行器 */
  commandExists?: (command: string, platform: ToolPlatform) => Promise<boolean>
}

const COMMAND_NAME_PATTERN = /^[A-Za-z0-9._+-]+$/
const PATH_VARIABLE_PATTERN = /^\$\{([A-Z0-9_]+)\}(?:[/\\](.*))?$/
const FORBIDDEN_PATH_CHARACTER_PATTERN = /[\0*?<>|"`]/
const TOOL_PATH_VARIABLE_SET = new Set<string>(TOOL_PATH_VARIABLES)

/**
 * 将 Node.js 平台映射为规则库平台枚举。
 * @param platform Node.js 平台标识
 * @returns 对应规则库平台
 * @throws 不支持的平台不会被静默归入 LINUX
 */
export function mapNodePlatform(platform: NodeJS.Platform): ToolPlatform {
  if (platform === 'win32') return 'WINDOWS'
  if (platform === 'darwin') return 'MACOS'
  if (platform === 'linux') return 'LINUX'
  throw new Error(`不支持的工具检测平台: ${platform}`)
}

/**
 * 按目标平台选择路径实现，确保跨平台规则测试不依赖宿主机。
 * @param platform 规则库平台
 * @returns Windows 或 POSIX path implementation
 */
function getPathImplementation(platform: ToolPlatform): path.PlatformPath {
  return platform === 'WINDOWS' ? path.win32 : path.posix
}

/**
 * 判断路径是否为 UNC 路径。
 * @param targetPath 待判断路径
 * @returns 是否使用 UNC 形式
 */
function isUncPath(targetPath: string): boolean {
  return /^[\\/]{2}/.test(targetPath)
}

/**
 * 创建默认路径变量映射。
 * @param platform 当前规则平台
 * @returns 仅包含可用绝对根路径的映射
 */
function createDefaultPathVariables(platform: ToolPlatform): Partial<Record<ToolPathVariable, string>> {
  const home = os.homedir()
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
    || (platform === 'WINDOWS' ? undefined : path.posix.join(home.replace(/\\/g, '/'), '.config'))

  return {
    HOME: home,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    XDG_CONFIG_HOME: xdgConfigHome,
    CCB_DATA: pathManager.appDataDir
  }
}

/**
 * 解析受控规则路径，并证明结果仍位于声明变量的根目录内。
 * @param template 以 allowlist 根变量开头的路径模板
 * @param platform 目标规则平台
 * @param pathVariables 根变量实际绝对路径
 * @returns 安全规范化后的绝对路径
 * @throws 模板越界、包含未知变量、UNC、glob 或缺少根变量时拒绝解析
 */
export function resolveToolPath(
  template: string,
  platform: ToolPlatform,
  pathVariables: Partial<Record<ToolPathVariable, string>>
): string {
  if (!template || FORBIDDEN_PATH_CHARACTER_PATTERN.test(template) || isUncPath(template)) {
    throw new Error('路径模板包含不允许的字符或路径结构')
  }

  const match = template.match(PATH_VARIABLE_PATTERN)
  if (!match || !TOOL_PATH_VARIABLE_SET.has(match[1])) {
    throw new Error('路径模板必须从允许的根变量开始')
  }

  const variable = match[1] as ToolPathVariable
  const relativePath = match[2] ?? ''
  if (relativePath.includes('${') || /(^|[/\\])\.\.?(?:[/\\]|$)/.test(relativePath)) {
    throw new Error('路径模板包含变量注入或 traversal')
  }

  const pathImplementation = getPathImplementation(platform)
  const rawRoot = pathVariables[variable]
  if (!rawRoot || !pathImplementation.isAbsolute(rawRoot) || isUncPath(rawRoot)) {
    throw new Error(`路径根变量 ${variable} 不可用或不是受支持的绝对路径`)
  }

  const normalizedRoot = pathImplementation.resolve(rawRoot)
  const normalizedRelativePath = relativePath.replace(/[\\/]+/g, pathImplementation.sep)
  const resolvedPath = pathImplementation.resolve(normalizedRoot, normalizedRelativePath)
  const relativeToRoot = pathImplementation.relative(normalizedRoot, resolvedPath)
  const escapedRoot = relativeToRoot === '..'
    || relativeToRoot.startsWith(`..${pathImplementation.sep}`)
    || pathImplementation.isAbsolute(relativeToRoot)

  if (escapedRoot || isUncPath(resolvedPath)) {
    throw new Error('解析后的路径超出允许根目录')
  }

  return resolvedPath
}

/**
 * 使用操作系统 locator 和参数数组检查 command，绝不经过 shell。
 * @param command 已通过 executable name 校验的命令
 * @param platform 目标规则平台
 * @returns locator 是否成功找到命令
 */
async function lookupCommand(command: string, platform: ToolPlatform): Promise<boolean> {
  const locator = platform === 'WINDOWS' ? 'where.exe' : 'which'

  return new Promise((resolve) => {
    execFile(
      locator,
      [command],
      { timeout: 5_000, windowsHide: true, shell: false },
      (error) => resolve(error === null)
    )
  })
}

/**
 * 默认文件存在性检查器。
 * @param targetPath 已通过边界校验的绝对路径
 * @returns 文件或目录是否可访问
 */
async function defaultPathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath)
    return true
  } catch {
    return false
  }
}

/**
 * 安全执行规则库声明的工具 detectors。
 * @description detectors 使用 any-match；单项错误会记录但不会中止其余检测。
 */
export class ToolDetectionService {
  private readonly platform: ToolPlatform
  private readonly pathVariables: Partial<Record<ToolPathVariable, string>>
  private readonly pathExists: (targetPath: string) => Promise<boolean>
  private readonly commandExists: (command: string, platform: ToolPlatform) => Promise<boolean>

  /**
   * 创建工具检测服务。
   * @param options 平台、变量与测试替身
   */
  constructor(options: ToolDetectionServiceOptions = {}) {
    this.platform = mapNodePlatform(options.platform ?? process.platform)
    this.pathVariables = {
      ...createDefaultPathVariables(this.platform),
      ...options.pathVariables
    }
    this.pathExists = options.pathExists ?? defaultPathExists
    this.commandExists = options.commandExists ?? lookupCommand
  }

  /**
   * 获取当前 detector 使用的规则平台。
   * @returns 当前规则平台
   */
  public getPlatform(): ToolPlatform {
    return this.platform
  }

  /**
   * 使用 detector 相同的安全边界解析规则路径。
   * @param template registry 中经过校验的路径模板
   * @returns 安全规范化后的绝对路径
   */
  public resolvePath(template: string): string {
    return resolveToolPath(template, this.platform, this.pathVariables)
  }

  /**
   * 并行检测 registry 中的工具。
   * @param tools 经过 registry validator 的工具定义列表
   * @returns 与输入顺序一致的检测结果
   */
  public async detectTools(tools: ToolDefinition[]): Promise<DetailedToolDetectionResult[]> {
    return Promise.all(tools.map((tool) => this.detectTool(tool)))
  }

  /**
   * 对单个工具执行全部 detector 并汇总 any-match 结果。
   * @param tool 经过 registry validator 的工具定义
   * @returns 工具级汇总与逐项结果
   */
  public async detectTool(tool: ToolDefinition): Promise<DetailedToolDetectionResult> {
    if (!tool.platforms.includes(this.platform)) {
      const detectorResults = tool.detectors.map((detector, index) => ({
        index,
        type: detector.type,
        matched: false,
        error: `工具不支持当前平台 ${this.platform}`
      }))
      return this.summarize(tool, detectorResults)
    }

    const detectorResults = await Promise.all(
      tool.detectors.map((detector, index) => this.executeDetector(detector, index))
    )
    return this.summarize(tool, detectorResults)
  }

  /**
   * 执行单个 detector。
   * @param detector detector definition
   * @param index detector 在定义中的位置
   * @returns 单项可审计结果
   */
  private async executeDetector(
    detector: ToolDetectorDefinition,
    index: number
  ): Promise<ToolDetectorExecutionResult> {
    try {
      if (detector.type === 'COMMAND_EXISTS') {
        const command = detector.command ?? ''
        if (!COMMAND_NAME_PATTERN.test(command)) {
          throw new Error('command 必须是无参数的安全 executable name')
        }
        return {
          index,
          type: detector.type,
          command,
          matched: await this.commandExists(command, this.platform)
        }
      }

      if (detector.type !== 'PATH_EXISTS') {
        throw new Error(`不支持的 detector type: ${String(detector.type)}`)
      }
      const resolvedPath = this.resolvePath(detector.path ?? '')
      return {
        index,
        type: detector.type,
        resolvedPath,
        matched: await this.pathExists(resolvedPath)
      }
    } catch (error) {
      return {
        index,
        type: detector.type,
        matched: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 汇总 detector 结果。
   * @param tool 工具定义
   * @param detectorResults 逐项执行结果
   * @returns any-match 工具检测结果
   */
  private summarize(
    tool: ToolDefinition,
    detectorResults: ToolDetectorExecutionResult[]
  ): DetailedToolDetectionResult {
    const matchedDetectors = detectorResults.filter((result) => result.matched).length
    return {
      toolId: tool.toolId,
      detected: matchedDetectors > 0,
      matchedDetectors,
      totalDetectors: detectorResults.length,
      detectorResults
    }
  }
}
