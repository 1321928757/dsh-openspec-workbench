export const PACKAGE_NAME = 'dsh-openspec-workbench'
export const SERVICE_NAME = 'openspecWorkbench'
export const SERVICE_NAMESPACE = 'openspec-workbench'
export const SUPPORTED_CLI_RANGE = '>=1.12.0 <1.13.0'
export const DEFAULT_MAX_DOCUMENT_BYTES = 512 * 1024
export const DEFAULT_MAX_ENTRIES = 500
export const DEFAULT_MAX_DEPTH = 8
export const DEFAULT_CLI_TTL_MS = 30_000
export const DEFAULT_CLI_FAILURE_TTL_MS = 1_500

export type Provenance = 'cli' | 'file-scan' | 'fallback'
export type Freshness = 'fresh' | 'stale' | 'unknown'
export type ChangeStatus = 'draft' | 'todo' | 'in_progress' | 'done' | 'archived'
export type ArtifactStatus = 'complete' | 'ready' | 'blocked' | 'unknown'

export interface Diagnostic {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
  details?: unknown
  path?: string
  detail?: string
}

export interface EvidenceMeta {
  provenance: Provenance
  freshness: Freshness
  generation: number
  cliVersion?: string
  diagnostics: Diagnostic[]
}

export interface ArtifactSummary {
  id: string
  outputPath?: string
  status: ArtifactStatus
  requires: string[]
  missingDeps: string[]
  present: boolean
}

export interface TaskProgress {
  done: number
  total: number
  source: 'cli' | 'checkbox' | 'unknown'
}

export interface ChangeSummary {
  id: string
  name: string
  workspaceId: string
  status: ChangeStatus
  schema?: string
  updatedAt?: number
  artifacts: ArtifactSummary[]
  trackedTaskProgress?: TaskProgress
  cliTaskSummary?: TaskProgress
  applyProgress?: TaskProgress
  validation?: {
    errors: number
    warnings: number
    infos: number
  }
  evidence: EvidenceMeta
}

export interface DocumentSummary {
  id: string
  changeId?: string
  path: string
  kind: 'proposal' | 'design' | 'spec' | 'tasks' | 'archive' | 'artifact' | 'config'
  size: number
  revision?: string
  updatedAt?: number
  evidence: EvidenceMeta
}

export interface ProjectSummary {
  workspaceId: string
  title: string
  path: string
  openspecRoot: string
  cli?: {
    version?: string
    supported: boolean
    capabilities: string[]
  }
  changes: ChangeSummary[]
  documents: DocumentSummary[]
  archivedChanges: ChangeSummary[]
  evidence: EvidenceMeta
}

export interface DocumentContent {
  document: DocumentSummary
  content: string
  revision: string
  generation?: number
  originalBytes: number
  rawBytes?: number
  returnedBytes: number
  displayLimit?: number
  maxBytes?: number
  truncated: boolean
  freshness: Freshness
  evidence: EvidenceMeta & { requestKey?: string }
}

export interface StatusEvidence {
  change: ChangeSummary
  validation?: unknown
  diff?: unknown
  instructions?: unknown
  evidence: EvidenceMeta
}

export interface ListProjectsArgs {
  workspaceId?: string
  includeArchived?: boolean
  generation?: number
  requestKey?: string
  forceRefresh?: boolean
}

export interface ListChangesArgs {
  workspaceId: string
  includeArchived?: boolean
  generation?: number
  requestKey?: string
  forceRefresh?: boolean
}

export interface ChangeArgs {
  workspaceId: string
  changeId: string
  generation?: number
}

export interface ListDocumentsArgs extends ChangeArgs {
  includeArchived?: boolean
}

export interface ReadDocumentArgs extends ChangeArgs {
  documentId: string
  maxBytes?: number
  displayLimit?: number
  requestKey?: string
}

export interface EvidenceArgs extends ChangeArgs {
  facet: 'status' | 'validation' | 'diff' | 'instructions'
}

export interface WorkbenchResult<T> {
  ok: true
  value: T
}

export interface WorkbenchError {
  ok: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type WorkbenchResponse<T> = WorkbenchResult<T> | WorkbenchError

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function isSafeChangeIdentity(value: unknown): boolean {
  return typeof value === 'string'
    && value.trim().length > 0
    && !value.startsWith('-')
    && !value.includes('/')
    && !value.includes('\\')
    && value !== '.'
    && value !== '..'
}

export function safeJsonValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(safeJsonValue)
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      result[key] = safeJsonValue(item)
    }
    return result
  }
  return null
}
