export const PACKAGE_NAME = 'dsh-openspec-workbench'
export const SERVICE_NAME = 'openspecWorkbench'
export const SERVICE_NAMESPACE = 'openspec-workbench'
export const SUPPORTED_CLI_RANGE = '>=1.12.0 <1.13.0'
export const DEFAULT_MAX_DOCUMENT_BYTES = 512 * 1024
export const DEFAULT_MAX_ENTRIES = 500
export const DEFAULT_MAX_DEPTH = 8
export const DEFAULT_REFRESH_DEBOUNCE_MS = 120
// Scan results are short-lived but long enough to survive conversation-view remounts.
export const DEFAULT_SCAN_TTL_MS = 30 * 1000
export const DEFAULT_SCAN_TIMEOUT_MS = 15 * 1000
export const DEFAULT_CLI_TTL_MS = 30 * 1000
export const DEFAULT_CLI_FAILURE_TTL_MS = 1500
export const SCAN_SCOPES = Object.freeze(['active', 'archive', 'all', 'targeted'])

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function asFiniteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

export function asObjectArray(value) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function safeJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(safeJsonValue)
  if (isRecord(value)) {
    const result = {}
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      result[key] = safeJsonValue(item)
    }
    return result
  }
  return null
}

export function safeError(error, fallback = '请求失败') {
  if (isRecord(error)) {
    const code = typeof error.code === 'string' ? error.code : 'WORKBENCH_ERROR'
    const message = typeof error.message === 'string' && error.message.length > 0 ? error.message : fallback
    return {
      code,
      message,
      ...(error.details === undefined ? {} : { details: safeJsonValue(error.details) }),
      ...(typeof error.severity === 'string' ? { severity: error.severity } : {}),
    }
  }
  if (error instanceof Error) {
    return {
      code: error.code || 'WORKBENCH_ERROR',
      message: error.message || fallback,
      ...(typeof error.severity === 'string' ? { severity: error.severity } : {}),
    }
  }
  return { code: 'WORKBENCH_ERROR', message: String(error || fallback) }
}

export function ok(value) {
  return { ok: true, value: safeJsonValue(value) }
}

export function fail(code, message, details, severity) {
  const safeDetails = details === undefined ? undefined : safeJsonValue(details)
  const effectiveSeverity = severity || (isRecord(safeDetails) && typeof safeDetails.severity === 'string' ? safeDetails.severity : undefined)
  return {
    ok: false,
    error: {
      code,
      message,
      ...(safeDetails === undefined ? {} : { details: safeDetails }),
      ...(effectiveSeverity ? { severity: effectiveSeverity } : {}),
    },
  }
}

export function diagnostic(code, message, details, severity = 'warning') {
  return {
    code,
    message,
    ...(details === undefined ? {} : { details: safeJsonValue(details) }),
    severity,
  }
}

export function cliRangeSupported(version) {
  const match = typeof version === 'string' ? version.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)/) : null
  if (!match) return false
  const major = Number(match[1])
  const minor = Number(match[2])
  return major === 1 && minor === 12
}

export function normalizeRelativePath(path) {
  if (typeof path !== 'string' || path.includes('\u0000')) return null
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '')
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null
  return parts.join('/')
}

export function pathWithin(rootPath, candidatePath) {
  if (typeof rootPath !== 'string' || typeof candidatePath !== 'string') return false
  const normalize = (value) => value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  const root = normalize(rootPath)
  const candidate = normalize(candidatePath)
  return candidate === root || candidate.startsWith(root + '/')
}

export function documentId(changeName, relativePath) {
  return `${changeName}:${relativePath}`
}

export function safeChangeName(value) {
  if (typeof value !== 'string') return false
  const name = value.trim()
  return Boolean(name)
    && name !== '.'
    && name !== '..'
    && !name.startsWith('-')
    && !name.includes('/')
    && !name.includes('\\')
    && !name.includes('\u0000')
    && name.length <= 200
}

export function normalizeChangeName(value) {
  return safeChangeName(value) ? value.trim() : null
}

export function isSafeChangeIdentity(value) {
  return safeChangeName(value)
}

export function parseTaskProgress(content) {
  if (typeof content !== 'string') return { done: 0, total: 0, source: 'unknown' }
  const done = (content.match(/^\s*[-*]\s*\[[xX]\]/gm) || []).length
  const todo = (content.match(/^\s*[-*]\s*\[\s\]/gm) || []).length
  return { done, total: done + todo, source: 'checkbox' }
}

export function fallbackArtifactSummaries(files) {
  const present = {
    proposal: Boolean(files?.proposal),
    design: Boolean(files?.design),
    specs: Boolean(files?.specs),
    tasks: Boolean(files?.tasks),
  }
  const state = (hasFile, requires) => ({
    state: hasFile ? 'complete' : requires.length === 0 ? 'ready' : 'blocked',
    requires,
    missingDeps: hasFile ? [] : requires,
  })
  return [
    { id: 'proposal', outputPath: 'proposal.md', present: present.proposal, ...state(present.proposal, []) },
    { id: 'design', outputPath: 'design.md', present: present.design, ...state(present.design, present.proposal ? [] : ['proposal']) },
    { id: 'specs', outputPath: 'specs/**/*.md', present: present.specs, ...state(present.specs, present.proposal ? [] : ['proposal']) },
    { id: 'tasks', outputPath: 'tasks.md', present: present.tasks, ...state(present.tasks, [
      ...(present.design ? [] : ['design']),
      ...(present.specs ? [] : ['specs']),
    ]) },
  ]
}

export function fallbackChangeStatus({ archived = false, tasksPresent = false, progress = { done: 0, total: 0 } } = {}) {
  if (archived) return 'archived'
  if (!tasksPresent || progress.total === 0) return 'draft'
  if (progress.done === 0) return 'todo'
  if (progress.done >= progress.total) return 'done'
  return 'in_progress'
}

export function evidence(provenance, generation, diagnostics = [], extra = {}) {
  return {
    provenance,
    freshness: 'fresh',
    generation,
    diagnostics: diagnostics.filter(Boolean).slice(0, 50),
    ...safeJsonValue(extra),
  }
}

const TIMING_DETAIL_KEYS = new Set(['scope', 'outcome', 'entries', 'files', 'changes', 'archivedChanges', 'documents', 'truncated', 'supported', 'provenance', 'facet', 'scoped', 'workspaceCount', 'resultCount', 'cli'])

export function timing(stage, durationMs, details = {}) {
  const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? Math.min(Math.round(durationMs), 60 * 60 * 1000) : 0
  const safeDetails = isRecord(details) ? Object.fromEntries(Object.entries(details).filter(([key]) => TIMING_DETAIL_KEYS.has(key)).map(([key, value]) => [key, safeJsonValue(value)])) : {}
  return { stage, durationMs: safeDuration, ...safeDetails }
}

export function timingSummary(items = []) {
  return Array.isArray(items)
    ? items.filter((item) => isRecord(item) && typeof item.stage === 'string').slice(0, 20).map((item) => timing(item.stage, item.durationMs, item))
    : []
}

export function normalizeArtifact(raw) {
  if (!isRecord(raw)) return null
  const id = asString(raw.id || raw.name).trim()
  if (!id || !safeChangeName(id)) return null
  const rawPath = raw.outputPath ?? raw.path
  const outputPath = rawPath === undefined ? undefined : normalizeRelativePath(rawPath)
  if (rawPath !== undefined && !outputPath) return null
  const status = ['complete', 'done'].includes(raw.status) ? 'complete'
    : ['ready', 'pending'].includes(raw.status) ? 'ready'
      : raw.status === 'blocked' ? 'blocked' : 'unknown'
  const requires = asStringArray(raw.requires || raw.dependencies).filter((item) => safeChangeName(item))
  const missingDeps = asStringArray(raw.missingDeps || raw.missingDependencies).filter((item) => safeChangeName(item))
  return {
    id,
    outputPath,
    status,
    present: status === 'complete',
    requires,
    missingDeps,
  }
}

export function normalizeTaskProgress(raw, source = 'cli') {
  if (!isRecord(raw)) return undefined
  const done = raw.done ?? raw.completed ?? raw.complete
  const total = raw.total ?? raw.count
  if (!Number.isSafeInteger(done) || !Number.isSafeInteger(total) || done < 0 || total < 0 || done > total) return undefined
  return { done, total, source }
}

function addDiagnostic(diagnostics, code, message, details) {
  if (Array.isArray(diagnostics)) diagnostics.push(diagnostic(code, message, details))
}

function normalizeProgressField(raw, field, diagnostics) {
  if (raw[field] === undefined) return undefined
  const progress = normalizeTaskProgress(raw[field], 'cli')
  if (!progress) addDiagnostic(diagnostics, 'CLI_PROGRESS_INVALID', `CLI ${field} 进度无效`, { field })
  return progress
}

export function normalizeCliChange(raw, workspaceId, fallback, diagnostics = []) {
  if (isRecord(raw?.change)) raw = { ...raw.change, ...raw.change, ...raw }
  if (!isRecord(raw)) {
    addDiagnostic(diagnostics, 'CLI_RECORD_INVALID', 'CLI status 包含非对象记录')
    return null
  }
  const rawName = raw.name ?? raw.changeName ?? raw.id
  const name = normalizeChangeName(rawName)
  if (!name) {
    addDiagnostic(diagnostics, 'CLI_CHANGE_IDENTITY_INVALID', 'CLI status 包含无效 change identity', { field: 'name' })
    return null
  }
  const artifacts = []
  if (raw.artifacts !== undefined && !Array.isArray(raw.artifacts)) {
    addDiagnostic(diagnostics, 'CLI_ARTIFACT_INVALID', 'CLI artifacts 字段不是数组', { change: name })
  } else {
    for (const [index, item] of (raw.artifacts || []).entries()) {
      const artifact = normalizeArtifact(item)
      if (artifact) artifacts.push(artifact)
      else addDiagnostic(diagnostics, 'CLI_ARTIFACT_INVALID', 'CLI status 包含无效工件记录', { change: name, index })
    }
  }
  const allowedStatus = ['draft', 'todo', 'in_progress', 'done', 'archived']
  const status = allowedStatus.includes(raw.status) ? raw.status : fallback?.name === name ? fallback.status || 'draft' : 'draft'
  if (raw.status !== undefined && !allowedStatus.includes(raw.status)) addDiagnostic(diagnostics, 'CLI_STATUS_INVALID', 'CLI status 字段无法归一化', { change: name })
  const trackedTaskProgress = normalizeProgressField(raw, 'trackedTaskProgress', diagnostics)
  const cliTaskSummary = raw.taskProgress !== undefined || raw.tasks !== undefined
    ? normalizeTaskProgress(raw.taskProgress ?? raw.tasks, 'cli')
    : undefined
  if ((raw.taskProgress !== undefined || raw.tasks !== undefined) && !cliTaskSummary) addDiagnostic(diagnostics, 'CLI_PROGRESS_INVALID', 'CLI task progress 无效', { change: name, field: 'taskProgress' })
  const applyProgress = normalizeProgressField(raw, 'applyProgress', diagnostics)
  const base = fallback?.name === name ? fallback : undefined
  const mergedDiagnostics = [...(base?.evidence?.diagnostics || []), ...diagnostics]
  return {
    ...(base || {}),
    id: base?.id || `${workspaceId}:${name}`,
    name,
    workspaceId,
    status,
    evidence: {
      ...(base?.evidence || {}),
      provenance: 'cli',
      diagnostics: mergedDiagnostics.slice(0, 50),
    },
    ...(asString(raw.schema || raw.schemaName) ? { schema: asString(raw.schema || raw.schemaName) } : {}),
    ...(artifacts.length || Array.isArray(raw.artifacts) ? { artifacts } : {}),
    ...(trackedTaskProgress ? { trackedTaskProgress } : {}),
    ...(cliTaskSummary ? { cliTaskSummary } : {}),
    ...(applyProgress ? { applyProgress } : {}),
  }
}

export function normalizeCliStatusPayload(payload, workspaceId, fallbackChanges = []) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.changes) ? payload.changes
      : Array.isArray(payload?.items) ? payload.items : null
  if (!rawItems) {
    return {
      validContainer: false,
      items: [],
      diagnostics: [diagnostic('CLI_PAYLOAD_INVALID', 'OpenSpec status 返回了无法识别的 JSON 结构')],
      rejectedCount: 0,
    }
  }
  const fallbackByName = new Map(fallbackChanges.map((change) => [change.name, change]))
  const items = []
  const diagnostics = []
  const invalidIndices = []
  let rejectedCount = 0
  let invalidFieldCount = 0
  for (const [index, raw] of rawItems.entries()) {
    const before = diagnostics.length
    const normalized = normalizeCliChange(raw, workspaceId, fallbackByName.get(asString(raw?.name || raw?.changeName)), diagnostics)
    if (normalized) items.push(normalized)
    else { rejectedCount += 1; invalidIndices.push(index) }
    if (diagnostics.length === before && !isRecord(raw)) addDiagnostic(diagnostics, 'CLI_RECORD_INVALID', 'CLI status 记录无效', { index })
    if (diagnostics.length > before && normalized) invalidFieldCount += 1
  }
  if (rejectedCount > 0 || invalidFieldCount > 0) diagnostics.unshift(diagnostic('CLI_PARTIAL_DATA', `CLI status 有 ${rejectedCount + invalidFieldCount} 项数据被隔离或修正`, { rejectedCount, invalidFieldCount, invalidIndices, total: rawItems.length }))
  return { validContainer: true, items, diagnostics, rejectedCount, invalidFieldCount }
}

export function contentHash(value) {
  const text = typeof value === 'string' ? value : ''
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function documentRevision(content, metadata = {}) {
  const source = metadata?.revision ?? metadata?.version ?? metadata?.mtimeMs ?? metadata?.etag
  const hash = contentHash(content)
  return source === undefined || source === null || source === '' ? `hash:${hash}` : `${String(source)}:${hash}`
}
