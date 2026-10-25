import type { ApiResponse } from './types'

export const MANAGED_AGENT_IDS = ['claude-code', 'codex-cli', 'gemini-cli', 'antigravity'] as const
export type ManagedAgentId = typeof MANAGED_AGENT_IDS[number]
export const AGENT_RESOURCE_KINDS = ['MCP', 'SKILL', 'SUBAGENT'] as const
export type AgentResourceKind = typeof AGENT_RESOURCE_KINDS[number]
export const IMPORT_AGENT_IDS = [...MANAGED_AGENT_IDS, 'cursor', 'qoder', 'workbuddy', 'trae', 'pi', 'opencode'] as const
export type ImportToolId = typeof IMPORT_AGENT_IDS[number]

export interface AgentResource {
  resourceId: string
  name: string
  kind: AgentResourceKind
  description: string
  location: string
  format: 'JSON' | 'TOML' | 'MARKDOWN'
  revision: string
  fileCount?: number
  warnings: string[]
  writable?: boolean
  status?: 'READY' | 'READ_ONLY' | 'BLOCKED' | 'INVALID'
}

export interface AgentResourceList {
  toolId: string
  kind: AgentResourceKind
  location: string
  resources: AgentResource[]
  warnings: string[]
  writable: boolean
}

export interface AgentResourceContent extends AgentResource {
  content: string
  files?: Array<{ name: string; bytes: number }>
}

export interface AgentResourceQuery {
  toolId: ManagedAgentId
  kind: AgentResourceKind
}

export interface ReadAgentResourceInput extends AgentResourceQuery {
  resourceId: string
}

export interface SaveAgentResourceInput extends AgentResourceQuery {
  resourceId?: string
  name: string
  content: string
  expectedRevision?: string
}

export interface DeleteAgentResourceInput extends ReadAgentResourceInput {
  expectedRevision: string
}

export interface ImportSource {
  sourceId: string
  toolId: ImportToolId
  label: string
  scope: 'USER' | 'PROJECT' | 'FILE' | 'BACKUP'
  location: string
  kinds: AgentResourceKind[]
  warnings: string[]
  createdAt?: string
  status?: 'FOUND' | 'NOT_FOUND' | 'BLOCKED' | 'INVALID'
}

export interface ImportPreviewItem {
  resourceId: string
  name: string
  targetName: string
  conflict: boolean
  status: 'READY' | 'BLOCKED' | 'IDENTICAL'
  sourceContent: string
  proposedContent: string
  targetContent?: string
  warnings: string[]
  errors: string[]
  requiresRename?: boolean
  files?: Array<{ name: string; bytes: number }>
}

export interface ResourceImportPreview {
  previewId: string
  source: ImportSource
  targetToolId: ManagedAgentId
  kind: AgentResourceKind
  targetLocation: string
  items: ImportPreviewItem[]
  warnings: string[]
}

export interface PreviewResourceImportInput {
  sourceId: string
  targetToolId: ManagedAgentId
  kind: AgentResourceKind
  resourceIds: string[]
}

export interface ApplyResourceImportInput {
  previewId: string
  decisions: Array<{
    resourceId: string
    action: 'SKIP' | 'IMPORT' | 'REPLACE' | 'RENAME'
    name?: string
  }>
}

export interface ResourceImportReceipt {
  previewId: string
  results: Array<{
    name: string
    status: 'IMPORTED' | 'SKIPPED' | 'FAILED'
    error?: string
  }>
}

export interface AgentResourcesAPI {
  listResources(input: AgentResourceQuery): Promise<ApiResponse<AgentResourceList>>
  readResource(input: ReadAgentResourceInput): Promise<ApiResponse<AgentResourceContent>>
  saveResource(input: SaveAgentResourceInput): Promise<ApiResponse<AgentResourceContent>>
  deleteResource(input: DeleteAgentResourceInput): Promise<ApiResponse<void>>
  discoverImportSources(input?: { sourceContextId?: string; kind?: AgentResourceKind }): Promise<ApiResponse<ImportSource[]>>
  discoverResourceBackups(input: AgentResourceQuery): Promise<ApiResponse<ImportSource[]>>
  chooseImportProject(): Promise<ApiResponse<{ sourceContextId: string } | null>>
  chooseImportFile(input: { toolId: ImportToolId; kind: AgentResourceKind }): Promise<ApiResponse<ImportSource | null>>
  listImportResources(input: { sourceId: string; kind: AgentResourceKind }): Promise<ApiResponse<AgentResourceList>>
  previewResourceImport(input: PreviewResourceImportInput): Promise<ApiResponse<ResourceImportPreview>>
  applyResourceImport(input: ApplyResourceImportInput): Promise<ApiResponse<ResourceImportReceipt>>
}
