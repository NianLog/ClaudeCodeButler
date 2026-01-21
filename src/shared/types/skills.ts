/**
 * Skills管理相关类型定义
 */

/**
 * Skill元数据接口
 */
export interface SkillMetadata {
  /** Skill名称 */
  name: string
  /** Skill描述 */
  description: string
}

/**
 * Skill文件结构接口
 */
export interface SkillFileStructure {
  /** SKILL.md文件路径 */
  skillMdPath: string
  /** 其他相关文件（如README.md、实现脚本等） */
  additionalFiles: string[]
}

/**
 * Skill目录接口
 */
export interface SkillDirectory {
  /** Skill唯一标识（目录名） */
  id: string
  /** Skill元数据 */
  metadata: SkillMetadata
  /** Skill目录路径 */
  directoryPath: string
  /** 目录名 */
  directoryName: string
  /** 文件结构 */
  structure: SkillFileStructure
  /** SKILL.md完整内容 */
  skillMdContent: string
  /** 创建时间 */
  createdAt: Date
  /** 修改时间 */
  updatedAt: Date
}

/**
 * Skill表单数据接口
 */
export interface SkillFormData {
  /** Skill名称 */
  name: string
  /** Skill描述 */
  description: string
  /** SKILL.md内容 */
  content: string
}

/**
 * Skill导入选项
 */
export interface SkillImportOptions {
  /** 是否覆盖已存在的Skill */
  overwrite?: boolean
}
