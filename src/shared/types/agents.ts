/**
 * 子Agent管理相关类型定义
 */

/**
 * Agent元数据接口
 */
export interface AgentMetadata {
  /** Agent名称 */
  name: string
  /** Agent描述 */
  description: string
  /** 可使用的工具列表 */
  tools?: string[]
  /** 使用的模型 */
  model?: string
  /** 显示颜色 */
  color?: string
}

/**
 * Agent文件接口
 */
export interface AgentFile {
  /** Agent唯一标识（文件名，不含扩展名） */
  id: string
  /** Agent元数据 */
  metadata: AgentMetadata
  /** Agent文件路径 */
  filePath: string
  /** 文件名（含扩展名） */
  fileName: string
  /** 文件大小（字节） */
  fileSize: number
  /** 创建时间 */
  createdAt: Date
  /** 修改时间 */
  updatedAt: Date
  /** 完整文件内容（包含元数据和正文） */
  content: string
}

/**
 * Agent表单数据接口
 */
export interface AgentFormData {
  /** Agent名称 */
  name: string
  /** Agent描述 */
  description: string
  /** 可使用的工具列表 */
  tools?: string[]
  /** 使用的模型 */
  model?: string
  /** 显示颜色 */
  color?: string
  /** Agent内容（Prompt/系统消息等） */
  content: string
}

/**
 * Agent导入选项
 */
export interface AgentImportOptions {
  /** 是否覆盖已存在的Agent */
  overwrite?: boolean
}
