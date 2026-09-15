import { basename, dirname, extname, join, relative, resolve as resolvePath, sep, win32 as win32Path } from 'node:path'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_MAX_DOCUMENT_BYTES,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_DEPTH,
  DEFAULT_REFRESH_DEBOUNCE_MS,
  DEFAULT_SCAN_TTL_MS,
  DEFAULT_SCAN_TIMEOUT_MS,
  SCAN_SCOPES,
  DEFAULT_CLI_TTL_MS,
  DEFAULT_CLI_FAILURE_TTL_MS,
  PACKAGE_NAME,
  SERVICE_NAME,
  SERVICE_NAMESPACE,
  SUPPORTED_CLI_RANGE,
  asFiniteNumber,
  asString,
  asStringArray,
  cliRangeSupported,
  documentId,
  evidence,
  fail,
  fallbackArtifactSummaries,
  fallbackChangeStatus,
  isRecord,
  normalizeArtifact,
  normalizeCliChange,
  normalizeCliStatusPayload,
  normalizeChangeName,
  normalizeRelativePath,
  normalizeTaskProgress,
  ok,
  parseTaskProgress,
  contentHash,
  documentRevision,
  pathWithin,
  safeError,
  safeJsonValue,
  timing,
  timingSummary,
} from './shared.js'

export const name = PACKAGE_NAME
export const inject = ['workspaceRegistry', 'fs', 'subprocess']

const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.yaml', '.yml', '.json', '.txt'])
const CHANGE_ROOT = 'changes'
const ARCHIVE_ROOT = 'changes/archive'
const INSTRUCTION_ARTIFACTS = new Set(['proposal', 'design', 'specs', 'tasks', 'apply', 'archive'])
const ACTIVE_ROOT = 'changes'
const DEFAULT_BACKGROUND_CONCURRENCY = 2
const SETTINGS_SCHEMA = z.object({
  defaultIncludeArchived: z.boolean().default(false),
  defaultSort: z.string().default('updated'),
})

function emptyDiagnostics() { return [] }

function workspaceIdOf(workspace) {
  const value = workspace?.workspace || workspace
  return asString(value?.id || value?.workspaceId)
}

function workspacePathOf(workspace) {
  const value = workspace?.workspace || workspace
  return asString(value?.path)
}

function workspaceTitleOf(workspace) {
  const value = workspace?.workspace || workspace
  return asString(value?.title) || basename(workspacePathOf(value)) || workspaceIdOf(value)
}

function normalizeWorkspaceId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function findWorkspace(registry, requestedId) {
  const items = typeof registry?.list === 'function' ? registry.list() : []
  const workspaces = Array.isArray(items) ? items.map(normalizeWorkspaceRecord).filter(Boolean) : []
  if (requestedId) return workspaces.find((item) => item.workspaceId === requestedId)
  return workspaces[0]
}

function processText(handle, stream) {
  const reader = handle?.collected?.[stream]
  if (reader && typeof reader.readFrom === 'function') return reader.readFrom(0)?.text || ''
  return ''
}

function byteLength(text) {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).byteLength : Buffer.byteLength(text, 'utf8')
}

function throwIfScanAborted(signal) {
  if (!signal?.aborted) return
  const timeout = signal.reason === 'timeout'
  throw commandError(timeout ? 'SCAN_TIMEOUT' : 'REQUEST_CANCELLED', timeout ? 'OpenSpec 扫描超时' : 'OpenSpec 扫描已取消')
}

function normalizeWorkspaceRecord(workspace) {
  const id = workspaceIdOf(workspace)
  const path = workspacePathOf(workspace)
  return id && path ? { workspace, workspaceId: id, workspacePath: path } : null
}

function workspacePathBoundary(rootPath, targetPath) {
  return pathWithin(rootPath, targetPath)
}

function cliVersionOf(text) {
  const match = String(text || '').match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)
  return match ? match[0] : undefined
}

function commandError(code, message, details) {
  return new Error(JSON.stringify({ code, message, details: safeJsonValue(details) }))
}

function parseCommandError(error, fallbackCode = 'WORKBENCH_ERROR') {
  try {
    const parsed = JSON.parse(error?.message || '')
    if (isRecord(parsed) && typeof parsed.code === 'string' && typeof parsed.message === 'string') return parsed
  } catch { /* plain error below */ }
  const safe = safeError(error)
  return { code: safe.code || fallbackCode, message: safe.message }
}

function diagnosticFromError(error, fallbackCode = 'CLI_UNAVAILABLE') {
  const parsed = parseCommandError(error, fallbackCode)
  const originalCode = parsed.code
  const spawnFailure = ['EINVAL', 'ENOENT', 'EACCES', 'EPERM'].includes(originalCode)
  const code = spawnFailure ? 'CLI_SPAWN_FAILED' : originalCode
  const message = spawnFailure ? 'OpenSpec CLI 进程启动失败' : parsed.message
  const details = spawnFailure
    ? { ...(isRecord(parsed.details) ? parsed.details : {}), causeCode: originalCode, causeMessage: parsed.message }
    : parsed.details
  return {
    code,
    message,
    ...(details === undefined ? {} : { details }),
    severity: 'warning',
  }
}

function isWindowsShim(path, platform = process.platform) {
  return platform === 'win32' && typeof path === 'string' && ['.cmd', '.bat'].includes(extname(path).toLowerCase())
}

function absoluteWindowsPath(path) {
  return typeof path === 'string' && win32Path.isAbsolute(path) ? win32Path.normalize(path) : null
}

function parseWindowsShim(text, shimPath) {
  const source = typeof text === 'string' ? text : ''
  const shim = absoluteWindowsPath(shimPath)
  if (!shim || !source || source.length > 64 * 1024) return null
  const base = win32Path.dirname(shim)
  const expand = (value) => value.trim()
    .replace(/%~dp0/gi, base + '\\')
    .replace(/%dp0%/gi, base)
  const nodeMatch = source.match(/SET\s+"_prog=([^"\r\n]+)"/i)
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
  const finalLine = lines.find((line) => line.includes('"%_prog%"') && line.includes('%*')) || ''
  const scriptMatch = finalLine.match(/"%_prog%"\s+"([^"\r\n]+)"\s+%\*/i)
  const fallbackScriptMatch = finalLine.match(/"(?:node(?:\.exe)?)"\s+"([^"\r\n]+)"\s+%\*/i)
  const node = expand(nodeMatch?.[1] || win32Path.join(base, 'node.exe'))
  const script = expand(scriptMatch?.[1] || fallbackScriptMatch?.[1] || '')
  const nodePath = absoluteWindowsPath(node) || (/^node(?:\.exe)?$/i.test(node) ? node : null)
  const scriptPath = absoluteWindowsPath(script)
    || (script && !win32Path.isAbsolute(script) ? win32Path.normalize(win32Path.join(base, script)) : null)
  const unsafe = /[\r\n&|<>^;]/
  const knownFinalLine = /^(?:endLocal\s*&(?:\s*goto #_undefined_# 2>NUL\s*\|\|\s*title %COMSPEC%\s*&)?\s*)?(?:"%_prog%"|"node(?:\.exe)?")\s+"[^"\r\n]+"\s+%\*$/i
  if (!nodePath || !scriptPath || (!/^node(?:\.exe)?$/i.test(nodePath) && !/\.exe$/i.test(nodePath)) || !/\.(?:c|m)?js$/i.test(scriptPath)) return null
  if (unsafe.test(nodePath) || unsafe.test(scriptPath) || !knownFinalLine.test(finalLine)) return null
  if (!source.includes('SETLOCAL') || !source.includes('CALL :find_dp0') || !source.includes('%*')) return null
  if (/\b(?:powershell|pwsh|cmd|bash|sh)\b/i.test(source)) return null
  if (lines.some((line) => /^\s*@?(?:del|erase|rm|curl|wget|invoke|start|set\s+path)\b/i.test(line))) return null
  return { kind: 'node-shim', argvPrefix: [nodePath, scriptPath], shimPath: shim }
}

function allowedShimRoot(shimPath) {
  const base = win32Path.dirname(shimPath)
  return win32Path.basename(base).toLowerCase() === '.bin' ? win32Path.dirname(base) : base
}

function makeCliDiagnostic(error, fallbackCode = 'CLI_UNAVAILABLE') {
  return diagnosticFromError(error, fallbackCode)
}

function fileKind(path) {
  const extension = extname(path).toLowerCase()
  return extension === '.md' || extension === '.markdown' ? 'spec'
    : extension === '.json' ? 'config'
      : 'artifact'
}

function pathJoin(...parts) {
  return parts.join('/').replaceAll('\\', '/').replace(/\/+/g, '/')
}

function relativeTo(root, target) {
  const value = relative(root, target).replaceAll(sep, '/')
  return value === '' ? '' : value
}

function changeNameFromDirectory(path) {
  return basename(path.replaceAll('\\', '/').replace(/\/+$/, ''))
}

function makeEvidence(provenance, generation, diagnostics = [], extra = {}) {
  return evidence(provenance, generation, diagnostics, extra)
}

function canonicalPath(value) {
  return asString(value).replaceAll('\\\\', '/').replace(/\/+$/, '').toLowerCase()
}

function executableIdentity(executable, platform) {
  const path = asString(executable)
  return `${platform === 'win32' ? path.toLowerCase() : path}|${isWindowsShim(path, platform) ? 'shim' : 'native'}`
}

function metadataRevision(info) {
  const source = info?.version ?? info?.etag ?? info?.mtimeMs
  return source === undefined || source === null || source === '' ? null : String(source)
}

function requestError(code, message, context, severity = 'warning') {
  return commandError(code, message, {
    requestKey: context.requestKey,
    workspaceId: context.workspaceId,
    generation: context.generation,
    severity,
  })
}

const safeChangeName = normalizeChangeName

export function createOpenSpecService(ctx) {
  const registry = ctx?.workspaceRegistry || ctx?.get?.('workspaceRegistry')
  const fs = ctx?.fs || ctx?.get?.('fs')
  const subprocess = ctx?.subprocess || ctx?.get?.('subprocess') || ctx?.shell || ctx?.get?.('shell')
  if (!registry || !fs) {
    // Missing providers are handled by the loader as a pending/inert plugin;
    // keeping the factory usable also makes pure parser tests independent of DSH.
  }
  const generationByWorkspace = new Map()
  const refreshTimers = new Map()
  const cliCache = new Map()
  const cliExpiryTimers = new Map()
  const scanCache = new Map()
  const scanExpiryTimers = new Map()
  const scanInFlight = new Map()
  const workspacePaths = new Map()
  const executableIdentities = new Map()
  const pending = new Map()
  let requestSeq = 0
  let disposed = false
  let now = () => Date.now()
  let scanTtlMs = DEFAULT_SCAN_TTL_MS
  let scanTimeoutMs = DEFAULT_SCAN_TIMEOUT_MS
  let backgroundConcurrency = DEFAULT_BACKGROUND_CONCURRENCY
  let backgroundEnabled = false
  let cliTtlMs = DEFAULT_CLI_TTL_MS
  let cliFailureTtlMs = DEFAULT_CLI_FAILURE_TTL_MS
  // Cordis contexts throw on reads of non-injected properties. Optional
  // deterministic clock/TTL seams are therefore only read from plain fixtures.
  if (ctx && typeof ctx.get !== 'function') {
    if (typeof ctx.now === 'function') now = ctx.now
    if (Number.isFinite(ctx.scanTtlMs)) scanTtlMs = Math.max(1, Math.min(10 * 60 * 1000, ctx.scanTtlMs))
    if (Number.isFinite(ctx.scanTimeoutMs)) scanTimeoutMs = Math.max(100, Math.min(60 * 1000, ctx.scanTimeoutMs))
    if (Number.isFinite(ctx.backgroundConcurrency)) backgroundConcurrency = Math.max(0, Math.min(4, Math.floor(ctx.backgroundConcurrency)))
    backgroundEnabled = ctx.backgroundEnabled === true
    if (Number.isFinite(ctx.cliTtlMs)) cliTtlMs = Math.max(1, ctx.cliTtlMs)
    if (Number.isFinite(ctx.cliFailureTtlMs)) cliFailureTtlMs = Math.max(1, ctx.cliFailureTtlMs)
  }
  let platform = process.platform
  if (ctx && typeof ctx.get !== 'function') platform = asString(ctx.platform) || platform
  else if (ctx && typeof ctx.get === 'function') {
    try { platform = asString(ctx.get('platform')) || platform } catch { /* platform is not a runtime service; use process.platform */ }
  }

  function nextGeneration(id, force = false) {
    const current = generationByWorkspace.get(id) || 0
    const next = force ? current + 1 : current || 1
    generationByWorkspace.set(id, next)
    return next
  }

  function rememberWorkspacePath(workspaceId, workspacePath) {
    const canonical = canonicalPath(workspacePath)
    const previous = workspacePaths.get(workspaceId)
    if (previous && previous !== canonical) {
      clearScanCache(workspaceId)
      clearCliCache(workspaceId)
      nextGeneration(workspaceId, true)
      for (const [key, context] of pending) {
        if (context.workspaceId !== workspaceId) continue
        context.cancelled = true
        try { context.controller.abort('workspace-path-changed') } catch { /* best effort */ }
        pending.delete(key)
      }
    }
    workspacePaths.set(workspaceId, canonical)
    return canonical
  }

  function beginRequest(resource, workspaceId, workspacePath, force = false, externalSignal) {
    const canonicalWorkspacePath = rememberWorkspacePath(workspaceId, workspacePath)
    const key = `${resource}:${workspaceId}`
    const previous = pending.get(key)
    if (previous) {
      previous.cancelled = true
      try { previous.controller.abort('superseded') } catch { /* best effort */ }
    }
    // Force refresh invalidates cache and supersedes the same resource; the
    // workspace generation itself advances on an explicit invalidation so
    // parallel resource refreshes share one coherent snapshot generation.
    if (force) {
      clearCliCache(workspaceId)
      clearScanCache(workspaceId, canonicalWorkspacePath)
      nextGeneration(workspaceId, true)
    }
    const generation = generationByWorkspace.get(workspaceId) || nextGeneration(workspaceId)
    const controller = new AbortController()
    const onAbort = () => controller.abort(externalSignal?.reason || 'cancelled')
    externalSignal?.addEventListener('abort', onAbort, { once: true })
    if (externalSignal?.aborted) controller.abort(externalSignal.reason || 'cancelled')
    const context = {
      resource,
      requestKey: `${key}:${++requestSeq}`,
      workspaceId,
      workspacePath: canonicalPath(workspacePath),
      generation,
      controller,
      cancelled: false,
      signal: controller.signal,
      cleanup: () => externalSignal?.removeEventListener('abort', onAbort),
    }
    pending.set(key, context)
    return context
  }

  function isCurrent(context) {
    if (disposed || context.cancelled) return false
    const selected = findWorkspace(registry, context.workspaceId)
    const currentPath = canonicalPath(selected?.workspacePath)
    const key = `${context.resource}:${context.workspaceId}`
    return pending.get(key) === context
      && currentPath === context.workspacePath
      && generationByWorkspace.get(context.workspaceId) === context.generation
  }

  function endRequest(context) {
    context.cleanup?.()
    const key = `${context.resource}:${context.workspaceId}`
    if (pending.get(key) === context) pending.delete(key)
  }

  function staleResult(context) {
    const timedOut = context.signal?.reason === 'timeout'
    return fail(timedOut ? 'SCAN_TIMEOUT' : context.signal.aborted ? 'REQUEST_CANCELLED' : 'REQUEST_STALE', timedOut ? 'OpenSpec 扫描超时' : context.signal.aborted ? '请求已取消' : '请求已过期', {
      requestKey: context.requestKey,
      workspaceId: context.workspaceId,
      generation: context.generation,
    }, context.signal.aborted ? 'info' : 'warning')
  }

  function clearCliCache(workspaceId) {
    for (const [key, record] of cliCache) {
      if (!workspaceId || record.workspaceId === workspaceId) cliCache.delete(key)
    }
    for (const [key, timer] of cliExpiryTimers) {
      if (!workspaceId || key.startsWith(`${workspaceId}:`)) {
        clearTimeout(timer)
        cliExpiryTimers.delete(key)
      }
    }
  }

  function scheduleInvalidation(id) {
    clearScanCache(id)
    workspacePaths.delete(id)
    executableIdentities.delete(id)
    const previous = refreshTimers.get(id)
    if (previous !== undefined) clearTimeout(previous)
    clearCliCache(id)
    nextGeneration(id, true)
    for (const [key, context] of pending) {
      if (context.workspaceId !== id) continue
      context.cancelled = true
      try { context.controller.abort('invalidated') } catch { /* best effort */ }
      pending.delete(key)
    }
    const timer = setTimeout(() => refreshTimers.delete(id), DEFAULT_REFRESH_DEBOUNCE_MS)
    refreshTimers.set(id, timer)
  }

  function requireWorkspace(args) {
    const requestedId = normalizeWorkspaceId(args?.workspaceId)
    const selected = findWorkspace(registry, requestedId)
    if (!selected) throw commandError('WORKSPACE_NOT_FOUND', requestedId ? `未找到 Workspace：${requestedId}` : '没有已注册的 Workspace')
    const workspace = selected.workspace
    const workspaceId = selected.workspaceId
    const workspacePath = selected.workspacePath
    if (!workspaceId || !workspacePath) throw commandError('WORKSPACE_INVALID', 'Workspace 缺少稳定 identity 或 canonical path')
    if (requestedId && requestedId !== workspaceId) throw commandError('WORKSPACE_NOT_FOUND', `未找到 Workspace：${requestedId}`)
    return { workspace, workspaceId, workspacePath }
  }

  async function resolveTarget(path, cwd) {
    if (!fs || typeof fs.resolve !== 'function') throw commandError('FS_UNAVAILABLE', 'DSH filesystem service 不可用')
    return fs.resolve(path, { cwd })
  }

  async function stat(target, signal) {
    if (typeof fs.stat !== 'function') throw commandError('FS_UNAVAILABLE', 'DSH filesystem stat 能力不可用')
    return fs.stat(target, signal)
  }

  async function listDir(target, signal) {
    if (typeof fs.listDir !== 'function') throw commandError('FS_UNAVAILABLE', 'DSH filesystem listDir 能力不可用')
    return fs.listDir(target, signal)
  }

  async function readText(target, signal) {
    if (typeof fs.readText !== 'function') throw commandError('FS_UNAVAILABLE', 'DSH filesystem readText 能力不可用')
    return fs.readText(target, signal)
  }

  async function ensureOpenSpecRoot(workspacePath, signal) {
    if (typeof fs.lstat === 'function') {
      const pathInfo = await fs.lstat('openspec', { cwd: workspacePath }, signal)
      if (pathInfo?.type === 'symlink') throw commandError('PATH_BOUNDARY', 'OpenSpec 根目录不能是符号链接')
    }
    const rootTarget = await resolveTarget('openspec', workspacePath)
    const info = await stat(rootTarget, signal)
    if (!info) throw commandError('OPENSPEC_ROOT_NOT_FOUND', '当前 Workspace 下不存在 openspec 根目录')
    if (info.type !== 'directory') throw commandError('OPENSPEC_ROOT_INVALID', '当前 Workspace 下的 openspec 不是目录')
    return rootTarget
  }

  function normalizeScanScope(scope, includeArchived = false) {
    if (SCAN_SCOPES.includes(scope)) return scope
    return includeArchived ? 'all' : 'active'
  }

  function scanDirectoryAllowed(relativePath, scope, targetChange = '') {
    const normalized = relativePath.replaceAll('\\\\', '/')
    if (!normalized) return true
    if (scope === 'all') return true
    if (scope === 'active') return normalized === ACTIVE_ROOT
      || normalized.startsWith(`${ACTIVE_ROOT}/`) && !normalized.startsWith(`${ARCHIVE_ROOT}/`)
    if (scope === 'archive') return normalized === ACTIVE_ROOT
      || normalized === ARCHIVE_ROOT
      || normalized.startsWith(`${ARCHIVE_ROOT}/`)
    if (scope === 'targeted') {
      if (!targetChange) return false
      return normalized === ACTIVE_ROOT
        || normalized === ARCHIVE_ROOT
        || normalized === `${ACTIVE_ROOT}/${targetChange}`
        || normalized.startsWith(`${ACTIVE_ROOT}/${targetChange}/`)
        || normalized === `${ARCHIVE_ROOT}/${targetChange}`
        || normalized.startsWith(`${ARCHIVE_ROOT}/${targetChange}/`)
    }
    return false
  }

  async function walkFiles(target, root, depth, state, signal, scope = 'all', targetChange = '') {
    throwIfScanAborted(signal)
    if (depth > DEFAULT_MAX_DEPTH) {
      state.diagnostics.push({ code: 'SCAN_DEPTH_LIMIT', message: `扫描达到 ${DEFAULT_MAX_DEPTH} 层深度上限`, severity: 'warning' })
      return
    }
    if (state.count >= DEFAULT_MAX_ENTRIES) {
      state.truncated = true
      return
    }
    let entries
    try { entries = await listDir(target, signal) } catch (error) {
      throwIfScanAborted(signal)
      state.diagnostics.push({ code: 'SCAN_DIRECTORY_FAILED', message: safeError(error).message, severity: 'warning', path: asString(target?.displayPath) })
      return
    }
    for (const entry of Array.isArray(entries) ? entries : []) {
      throwIfScanAborted(signal)
      if (state.count >= DEFAULT_MAX_ENTRIES) { state.truncated = true; break }
      if (!entry || typeof entry.name !== 'string' || entry.name === '.' || entry.name === '..') continue
      const child = entry.target
      const childPath = asString(child?.displayPath)
      if (!child || !childPath) continue
      const rel = relativeTo(root, childPath)
      const normalizedRel = normalizeRelativePath(rel)
      if (!normalizedRel) continue
      // Scope filtering happens before symlink/stat work, so an inactive archive
      // subtree never incurs metadata calls during the active first load.
      if (!scanDirectoryAllowed(normalizedRel, scope, targetChange)) continue
      if (typeof fs.lstat === 'function') {
        try {
          const pathInfo = await fs.lstat(normalizedRel, { cwd: root }, signal)
          if (pathInfo?.type === 'symlink') {
            state.diagnostics.push({ code: 'SYMLINK_REJECTED', message: '符号链接条目已忽略', severity: 'warning', path: normalizedRel })
            continue
          }
        } catch (error) {
          throwIfScanAborted(signal)
          state.diagnostics.push({ code: 'SCAN_LSTAT_FAILED', message: safeError(error).message, severity: 'warning', path: childPath })
          continue
        }
      }
      if (!pathWithin(root, childPath)) {
        state.diagnostics.push({ code: 'PATH_BOUNDARY', message: '发现越出 OpenSpec 根目录的条目，已忽略', severity: 'warning', path: childPath })
        continue
      }
      let childInfo
      try { childInfo = entry.type ? { type: entry.type } : await stat(child, signal) } catch (error) {
        throwIfScanAborted(signal)
        state.diagnostics.push({ code: 'SCAN_ENTRY_FAILED', message: safeError(error).message, severity: 'warning', path: childPath })
        continue
      }
      if (!childInfo) continue
      state.count += 1
      if (childInfo.type === 'directory') await walkFiles(child, root, depth + 1, state, signal, scope, targetChange)
      else if (childInfo.type === 'file') state.files.push({
        path: normalizedRel,
        target: child,
        size: asFiniteNumber(entry.size, asFiniteNumber(childInfo.size, 0)),
        updatedAt: asFiniteNumber(entry.version?.mtimeMs, asFiniteNumber(childInfo.mtimeMs, 0)),
        ...(entry.version !== undefined ? { revision: entry.version } : childInfo.version !== undefined ? { revision: childInfo.version } : {}),
      })
    }
  }

  async function filesInRoot(rootTarget, rootPath, signal, scope = 'all', targetChange = '') {
    const state = { count: 0, files: [], diagnostics: [], truncated: false, scope, targetChange }
    // The root itself is always visited; child filtering prevents work outside
    // the requested scope while preserving the root OpenSpec safety checks.
    await walkFiles(rootTarget, rootPath, 0, state, signal, scope, targetChange)
    return state
  }

  async function readSmallFile(file, signal, maxBytes = DEFAULT_MAX_DOCUMENT_BYTES) {
    if (file.size > maxBytes) throw commandError('DOCUMENT_TOO_LARGE', `文档超过 ${maxBytes} 字节限制`, { size: file.size, maxBytes })
    const content = await readText(file.target, signal)
    const size = byteLength(content)
    if (size > maxBytes) throw commandError('DOCUMENT_TOO_LARGE', `文档超过 ${maxBytes} 字节限制`, { size, maxBytes })
    return content
  }

  function documentSummary(workspaceId, changeId, rootPath, file, generation, provenance = 'file-scan') {
    const rel = file.path
    const changeRoot = changeId ? `${CHANGE_ROOT}/${changeId}/` : ''
    const archiveChangeRoot = changeId ? `${ARCHIVE_ROOT}/${changeId}/` : ''
    const localPath = changeRoot && rel.startsWith(changeRoot) ? rel.slice(changeRoot.length)
      : archiveChangeRoot && rel.startsWith(archiveChangeRoot) ? rel.slice(archiveChangeRoot.length) : rel
    const kind = localPath === 'proposal.md' ? 'proposal'
      : localPath === 'design.md' ? 'design'
        : localPath === 'tasks.md' ? 'tasks'
          : localPath.endsWith('/spec.md') || localPath.startsWith('specs/') ? 'spec'
            : rel.startsWith(`${ARCHIVE_ROOT}/`) ? 'archive' : fileKind(rel)
    return {
      id: documentId(changeId || 'project', rel),
      ...(changeId ? { changeId } : {}),
      path: rel,
      kind,
      size: file.size,
      ...(file.updatedAt > 0 ? { updatedAt: file.updatedAt } : {}),
      ...(file.revision !== undefined ? { revision: String(file.revision) } : {}),
      evidence: makeEvidence(provenance, generation, []),
      workspaceId,
      rootPath,
    }
  }

  async function scanChange(workspaceId, rootPath, fileRecords, changeName, archived, generation, signal) {
    if (!safeChangeName(changeName)) return null
    const prefix = `${archived ? ARCHIVE_ROOT : CHANGE_ROOT}/${changeName}/`
    const files = fileRecords.filter((file) => file.path.replaceAll('\\\\', '/').startsWith(prefix))
    const byName = new Map(files.map((file) => [file.path.replaceAll('\\\\', '/').slice(prefix.length), file]))
    const proposal = byName.get('proposal.md')
    const design = byName.get('design.md')
    const tasks = byName.get('tasks.md')
    const marker = byName.get('.openspec.yaml')
    const specs = files.filter((file) => file.path.replaceAll('\\\\', '/').startsWith(`${prefix}specs/`) && file.path.replaceAll('\\\\', '/').endsWith('.md'))
    if (!marker && !proposal && specs.length === 0 && !design && !tasks) return null
    let taskProgress = { done: 0, total: 0, source: 'unknown' }
    const diagnostics = []
    if (tasks) {
      try { taskProgress = parseTaskProgress(await readSmallFile(tasks, signal)) } catch (error) { throwIfScanAborted(signal); diagnostics.push({ code: 'TASKS_READ_FAILED', message: safeError(error).message, severity: 'warning', path: tasks.path }) }
    }
    const filesShape = { proposal, design, specs: specs.length ? specs[0] : undefined, tasks }
    const artifacts = fallbackArtifactSummaries(filesShape).map((item) => ({
      id: item.id,
      outputPath: item.outputPath,
      status: item.state,
      present: item.present,
      requires: item.requires,
      missingDeps: item.missingDeps,
    }))
    for (const file of files) {
      const localPath = file.path.replaceAll('\\\\', '/').slice(prefix.length)
      if (!localPath || localPath === '.openspec.yaml' || localPath === 'proposal.md' || localPath === 'design.md' || localPath === 'tasks.md' || localPath.startsWith('specs/')) continue
      if (!TEXT_EXTENSIONS.has(extname(localPath).toLowerCase())) continue
      const artifactId = localPath.replace(/\.[^.]+$/, '').replaceAll('/', '-')
      if (!artifacts.some((artifact) => artifact.id === artifactId)) artifacts.push({ id: artifactId, outputPath: localPath, status: 'complete', present: true, requires: [], missingDeps: [] })
    }
    return {
      id: `${workspaceId}:${changeName}`,
      name: changeName,
      workspaceId,
      status: fallbackChangeStatus({ archived, tasksPresent: Boolean(tasks), progress: taskProgress }),
      ...(marker ? { schema: 'spec-driven' } : {}),
      artifacts,
      ...(taskProgress.total > 0 ? { trackedTaskProgress: taskProgress } : {}),
      evidence: makeEvidence('file-scan', generation, diagnostics),
      _files: files,
      _rootPath: rootPath,
    }
  }

  async function scanProject(workspaceId, workspacePath, includeArchived, signal, force = false, requestContext, resource = 'project', scope, targetChange = '') {
    return getScanSnapshot(workspaceId, workspacePath, includeArchived, signal, force, requestContext, scope, targetChange)
  }

  async function scanProjectFresh(workspaceId, workspacePath, includeArchived, signal, force = false, requestContext, resource = 'project', requestedScope, targetChange = '') {
    const scope = normalizeScanScope(requestedScope, includeArchived)
    const timings = []
    const startedAt = now()
    const mark = (stage, started, details = {}) => timings.push(timing(stage, Math.max(0, now() - started), details))
    const sharedWorker = resource === 'scan' && !requestContext
    const ownsContext = !requestContext && !sharedWorker
    const context = requestContext || (sharedWorker
      ? { workspaceId, workspacePath: canonicalPath(workspacePath), generation: generationByWorkspace.get(workspaceId) || nextGeneration(workspaceId), signal }
      : beginRequest(resource, workspaceId, workspacePath, force, signal))
    const requestSignal = context.signal
    const generation = context.generation
    const finish = () => { if (ownsContext) endRequest(context) }
    let rootTarget
    const rootStarted = now()
    try { rootTarget = await ensureOpenSpecRoot(workspacePath, requestSignal); mark('root-probe', rootStarted, { scope }) } catch (error) {
      const issue = parseCommandError(error, 'OPENSPEC_ROOT_NOT_FOUND')
      if (requestSignal.aborted || context.cancelled) { finish(); return staleResult(context) }
      const unavailable = {
        workspaceId,
        title: workspaceTitleOf(findWorkspace(registry, workspaceId)),
        path: workspacePath,
        openspecRoot: pathJoin(workspacePath, 'openspec'),
        changes: [],
        documents: [],
        archivedChanges: [],
        evidence: makeEvidence('fallback', generation, [{ code: issue.code, message: issue.message, details: issue.details, severity: 'warning' }], { scope, timings: timingSummary([...timings, timing('total', Math.max(0, now() - startedAt), { outcome: 'unavailable' })]) }),
        unavailable: true,
      }
      if (!sharedWorker && !isCurrent(context)) { finish(); return staleResult(context) }
      finish()
      return unavailable
    }
    if (!sharedWorker && !isCurrent(context)) { finish(); return staleResult(context) }
    const rootPath = asString(rootTarget.displayPath) || pathJoin(workspacePath, 'openspec')
    if (!workspacePathBoundary(workspacePath, rootPath)) throw commandError('PATH_BOUNDARY', 'OpenSpec 根目录超出 Workspace 边界')
    const scanStarted = now()
    const scan = await filesInRoot(rootTarget, rootPath, requestSignal, scope, targetChange)
    mark(scope === 'archive' ? 'archive-scan' : scope === 'targeted' ? 'targeted-scan' : 'active-scan', scanStarted, { scope, entries: scan.count, files: scan.files.length, truncated: scan.truncated })
    const fileRecords = scan.files
    const names = new Set()
    const archivedNames = new Set()
    for (const file of fileRecords) {
      const normalizedFilePath = file.path.replaceAll('\\\\', '/')
      const activeMatch = normalizedFilePath.match(/^changes\/([^/]+)\//)
      const archiveMatch = normalizedFilePath.match(/^changes\/archive\/([^/]+)\//)
      if (activeMatch && activeMatch[1] !== 'archive') names.add(activeMatch[1])
      if (archiveMatch) archivedNames.add(archiveMatch[1])
      file.path = normalizedFilePath
    }
    const changes = []
    for (const changeName of names) {
      throwIfScanAborted(requestSignal)
      const change = await scanChange(workspaceId, rootPath, fileRecords, changeName, false, generation, requestSignal)
      if (change) changes.push(change)
    }
    const archivedChanges = []
    if (includeArchived) {
      for (const changeName of archivedNames) {
        throwIfScanAborted(requestSignal)
        const change = await scanChange(workspaceId, rootPath, fileRecords, changeName, true, generation, requestSignal)
        if (change) archivedChanges.push(change)
      }
    }
    const documents = scope === 'targeted'
      ? fileRecords
        .filter((file) => TEXT_EXTENSIONS.has(extname(file.path).toLowerCase()))
        .slice(0, DEFAULT_MAX_ENTRIES)
        .map((file) => {
          const archiveMatch = file.path.match(/^changes\/archive\/([^/]+)\//)
          const activeMatch = file.path.match(/^changes\/([^/]+)\//)
          const changeId = archiveMatch?.[1] || (activeMatch && activeMatch[1] !== 'archive' ? activeMatch[1] : undefined)
          return documentSummary(workspaceId, changeId, rootPath, file, generation)
        })
      : []
    if (!sharedWorker && !isCurrent(context)) { finish(); return staleResult(context) }
    const project = {
      workspaceId,
      title: workspaceTitleOf(findWorkspace(registry, workspaceId)),
      path: workspacePath,
      openspecRoot: rootPath,
      changes: changes.sort((a, b) => a.name.localeCompare(b.name)),
      documents,
      archivedChanges: archivedChanges.sort((a, b) => a.name.localeCompare(b.name)),
      evidence: makeEvidence('file-scan', generation, [
        ...scan.diagnostics,
        ...(scan.truncated ? [{ code: 'SCAN_TRUNCATED', message: `扫描达到 ${DEFAULT_MAX_ENTRIES} 条目上限`, severity: 'warning' }] : []),
      ], {
        scope,
        timings: timingSummary([...timings, timing('total', Math.max(0, now() - startedAt), { outcome: 'success' })]),
        counts: { entries: scan.count, files: scan.files.length, changes: changes.length, archivedChanges: archivedChanges.length, documents: documents.length },
      }),
    }
    finish()
    return project
  }

  async function resolveCliPlan(executable, signal) {
    if (!isWindowsShim(executable, platform)) return { kind: 'native', argvPrefix: [executable] }
    if (!fs || typeof fs.resolve !== 'function' || typeof fs.stat !== 'function' || typeof fs.readText !== 'function') {
      throw commandError('CLI_SHIM_UNSUPPORTED', 'Windows CLI shim 需要可用的 filesystem 读取能力')
    }
    const shimTarget = await fs.resolve(executable, { signal })
    if (typeof fs.lstat === 'function') {
      const shimPathInfo = await fs.lstat(executable, {}, signal)
      if (shimPathInfo?.type === 'symlink') throw commandError('CLI_SHIM_INVALID', 'Windows CLI shim 符号链接不允许直接执行')
    }
    const shimInfo = await fs.stat(shimTarget, signal)
    if (!shimInfo || shimInfo.type !== 'file') throw commandError('CLI_SHIM_INVALID', 'Windows CLI shim 不是普通文件')
    if (asFiniteNumber(shimInfo.size, 0) > 64 * 1024) throw commandError('CLI_SHIM_TOO_LARGE', 'Windows CLI shim 超过安全读取限制')
    const shimText = await fs.readText(shimTarget, signal)
    const plan = parseWindowsShim(shimText, executable)
    if (!plan) throw commandError('CLI_SHIM_INVALID', 'Windows CLI shim 格式不受支持，已拒绝执行')
    const root = allowedShimRoot(executable)
    let nodeTarget
    let nodeResolvedFromPath = false
    try {
      if (/^node(?:\.exe)?$/i.test(plan.argvPrefix[0])) {
        const resolvedNode = await subprocess.resolveExecutable('node', undefined, signal)
        if (isWindowsShim(resolvedNode, platform)) throw commandError('CLI_SHIM_TARGET_INVALID', 'Windows CLI shim 的 Node 解析结果仍是脚本 shim')
        nodeTarget = await fs.resolve(resolvedNode, { signal })
        nodeResolvedFromPath = true
      } else {
        nodeTarget = await fs.resolve(plan.argvPrefix[0], { signal })
      }
      const scriptTarget = await fs.resolve(plan.argvPrefix[1], { signal })
      const [nodeInfo, scriptInfo] = await Promise.all([fs.stat(nodeTarget, signal), fs.stat(scriptTarget, signal)])
      const nodePath = asString(nodeTarget.displayPath)
      const scriptPath = asString(scriptTarget.displayPath)
      if (!nodeInfo || nodeInfo.type !== 'file' || !scriptInfo || scriptInfo.type !== 'file') throw commandError('CLI_SHIM_TARGET_MISSING', 'Windows CLI shim 的 Node 或脚本入口不存在')
      if (typeof fs.lstat === 'function') {
        const [nodePathInfo, scriptPathInfo] = await Promise.all([
          fs.lstat(nodePath, {}, signal),
          fs.lstat(scriptPath, {}, signal),
        ])
        if (nodePathInfo?.type === 'symlink' || scriptPathInfo?.type === 'symlink') throw commandError('CLI_SHIM_TARGET_INVALID', 'Windows CLI shim 不允许通过符号链接启动')
      }
      if ((!nodeResolvedFromPath && !pathWithin(root, nodePath)) || !pathWithin(root, scriptPath)) throw commandError('CLI_SHIM_TARGET_INVALID', 'Windows CLI shim 目标超出 shim 安全范围')
      return { ...plan, argvPrefix: [nodePath, scriptPath] }
    } catch (error) {
      const issue = parseCommandError(error, 'CLI_SHIM_TARGET_MISSING')
      if (issue.code.startsWith('FS_') || issue.code === 'WORKBENCH_ERROR') throw commandError('CLI_SHIM_TARGET_MISSING', 'Windows CLI shim 的 Node 或脚本入口不存在', issue)
      throw error
    }
  }

  async function runCli(argv, cwd, signal) {
    if (!subprocess) throw commandError('CLI_UNAVAILABLE', 'DSH subprocess/shell service 不可用，无法执行 OpenSpec CLI')
    if (!pathWithin(pathJoin(cwd), pathJoin(cwd))) throw commandError('CLI_CWD_INVALID', 'OpenSpec CLI 工作目录无效')
    if (!Array.isArray(argv) || argv.some((item) => typeof item !== 'string' || item.length === 0 || item.includes('\u0000'))) {
      throw commandError('CLI_ARG_INVALID', 'OpenSpec CLI 参数无效')
    }
    if (typeof subprocess.resolveExecutable === 'function' && typeof subprocess.spawn === 'function') {
      const executable = await subprocess.resolveExecutable('openspec', undefined, signal)
      let plan
      if (isWindowsShim(executable, platform)) {
        try {
          plan = await resolveCliPlan(executable, signal)
        } catch (error) {
          const issue = diagnosticFromError(error, 'CLI_SHIM_INVALID')
          throw commandError(issue.code, issue.message, issue.details)
        }
      } else {
        plan = { kind: 'native', argvPrefix: [executable] }
      }
      const controller = new AbortController()
      const onAbort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', onAbort, { once: true })
      const timeout = setTimeout(() => controller.abort('timeout'), 30000)
      try {
        const handle = subprocess.spawn({
          argv: [...plan.argvPrefix, ...argv],
          cwd,
          stdio: {
            stdin: 'ignore',
            stdout: { maxBytes: 4 * 1024 * 1024 },
            stderr: { maxBytes: 512 * 1024 },
          },
          graceMs: 3000,
          signal: controller.signal,
        })
        const outcome = await handle.done
        const stdout = processText(handle, 'stdout')
        const stderr = processText(handle, 'stderr')
        if (signal?.aborted) throw commandError('CLI_ABORTED', 'OpenSpec CLI 已取消')
        if (controller.signal.aborted && controller.signal.reason === 'timeout') throw commandError('CLI_TIMEOUT', 'OpenSpec CLI 执行超时')
        if (controller.signal.aborted) throw commandError('CLI_ABORTED', 'OpenSpec CLI 已取消')
        if (outcome.exitCode !== 0) throw commandError('CLI_COMMAND_FAILED', stderr || `OpenSpec CLI 退出码：${outcome.exitCode}`, { argv, exitCode: outcome.exitCode, stderr })
        return { stdout, stderr }
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
      }
    }
    if (typeof subprocess.resolve === 'function' && typeof subprocess.run === 'function') {
      const command = ['openspec', ...argv].map((item) => /[^A-Za-z0-9_./:=+-]/.test(item) ? JSON.stringify(item) : item).join(' ')
      if (platform === 'win32') throw commandError('CLI_SHIM_UNSUPPORTED', '当前 Windows subprocess 兼容接口不支持安全 shim 执行')
      const spec = await subprocess.resolve({ command, workdir: cwd, timeoutMs: 30000, stdoutMaxBytes: 4 * 1024 * 1024, signal })
      const result = await subprocess.run(spec)
      const outputText = (value) => typeof value === 'string' ? value : typeof value?.text === 'string' ? value.text : ''
      const stdout = outputText(result?.stdout)
      const stderr = outputText(result?.stderr)
      if (result.timedOut) throw commandError('CLI_TIMEOUT', 'OpenSpec CLI 执行超时')
      if (result.aborted) throw commandError('CLI_ABORTED', 'OpenSpec CLI 已取消')
      if (result.exitCode !== 0) throw commandError('CLI_COMMAND_FAILED', stderr || `OpenSpec CLI 退出码：${result.exitCode}`, { argv, exitCode: result.exitCode, stderr })
      return { stdout, stderr }
    }
    throw commandError('CLI_UNAVAILABLE', 'DSH 未提供可用的 subprocess/shell 执行能力')
  }

  function scanKey(workspaceId, workspacePath, includeArchived, scope = '', targetChange = '') {
    const effectiveScope = normalizeScanScope(scope, includeArchived)
    const target = effectiveScope === 'targeted' ? normalizeChangeName(targetChange) || '' : ''
    return `${workspaceId}:${canonicalPath(workspacePath)}:${effectiveScope}${target ? `:${target}` : ''}`
  }

  function clearScanCache(workspaceId = '', path = '') {
    const canonical = path ? canonicalPath(path) : ''
    for (const [key, record] of scanCache) {
      if ((!workspaceId || record.workspaceId === workspaceId) && (!canonical || record.canonicalPath === canonical)) {
        scanCache.delete(key)
        const timer = scanExpiryTimers.get(key)
        if (timer !== undefined) clearTimeout(timer)
        scanExpiryTimers.delete(key)
      }
    }
    for (const [key, record] of scanInFlight) {
      if ((!workspaceId || record.workspaceId === workspaceId) && (!canonical || record.canonicalPath === canonical)) {
        record.cancelled = true
        try { record.controller.abort('invalidated') } catch { /* best effort */ }
        record.settleStop?.(fail('REQUEST_CANCELLED', 'OpenSpec 扫描已取消', { workspaceId: record.workspaceId, generation: record.generation }, 'info'))
        scanInFlight.delete(key)
      }
    }
  }

  async function waitForScan(promise, signals, workspaceId, generation) {
    const signal = signals.find((candidate) => candidate?.aborted || candidate?.addEventListener)
    if (!signal) return promise
    const aborted = () => fail(signal.reason === 'timeout' ? 'SCAN_TIMEOUT' : 'REQUEST_CANCELLED', signal.reason === 'timeout' ? 'OpenSpec 扫描超时' : 'OpenSpec 扫描已取消', { workspaceId, generation }, 'warning')
    if (signal.aborted) return aborted()
    let listener
    const abortResult = new Promise((resolve) => {
      listener = () => resolve(aborted())
      signal.addEventListener('abort', listener, { once: true })
    })
    try { return await Promise.race([promise, abortResult]) }
    finally { signal.removeEventListener('abort', listener) }
  }

  async function getScanSnapshot(workspaceId, workspacePath, includeArchived, signal, force = false, requestContext, requestedScope, targetChange = '') {
    const canonical = canonicalPath(workspacePath)
    const scope = normalizeScanScope(requestedScope, includeArchived)
    const key = scanKey(workspaceId, workspacePath, includeArchived, scope, targetChange)
    const generation = generationByWorkspace.get(workspaceId) || nextGeneration(workspaceId)
    if (force) clearScanCache(workspaceId, canonical)
    const currentRecord = findWorkspace(registry, workspaceId)
    if (!currentRecord || canonicalPath(currentRecord.workspacePath) !== canonical) throw commandError('WORKSPACE_PATH_CHANGED', 'Workspace 路径已变化，请重新加载')
    throwIfScanAborted(signal)
    const cached = !force ? scanCache.get(key) : null
    if (cached && cached.expiresAt > now() && cached.generation === generation) return cached.project
    if (!force) {
      const pendingScan = scanInFlight.get(key)
      if (pendingScan && pendingScan.generation === generation) return waitForScan(pendingScan.promise, [signal, requestContext?.signal], workspaceId, generation)
    }
    const controller = new AbortController()
    let settleStop
    const stopResult = new Promise((resolve) => { settleStop = resolve })
    const record = { key, workspaceId, canonicalPath: canonical, includeArchived, scope, targetChange, generation, startedAt: now(), controller, cancelled: false, promise: null, settleStop }
    // The worker is shared across callers. Caller cancellation only releases that
    // caller's wait; invalidation/dispose/timeout are the worker-level stop paths.
    const timeout = setTimeout(() => {
      record.cancelled = true
      controller.abort('timeout')
      settleStop?.(fail('SCAN_TIMEOUT', 'OpenSpec 扫描超时', { workspaceId, generation }, 'warning'))
    }, scanTimeoutMs)
    const workerPromise = scanProjectFresh(workspaceId, workspacePath, includeArchived, controller.signal, false, null, 'scan', scope, targetChange)
      .then((project) => {
        if (controller.signal.aborted || record.cancelled) return project?.ok === false ? project : fail(controller.signal.reason === 'timeout' ? 'SCAN_TIMEOUT' : 'REQUEST_CANCELLED', controller.signal.reason === 'timeout' ? 'OpenSpec 扫描超时' : 'OpenSpec 扫描已取消', { workspaceId, generation }, 'warning')
        if (disposed || project?.ok === false || project?.unavailable || generationByWorkspace.get(workspaceId) !== generation) return project
        const stored = { workspaceId, canonicalPath: canonical, includeArchived, scope, targetChange, generation, project, expiresAt: now() + scanTtlMs }
        scanCache.set(key, stored)
        const timer = setTimeout(() => {
          if (scanCache.get(key) === stored) scanCache.delete(key)
          if (scanExpiryTimers.get(key) === timer) scanExpiryTimers.delete(key)
        }, scanTtlMs)
        scanExpiryTimers.set(key, timer)
        timer.unref?.()
        return project
      })
      .catch((error) => {
        const issue = parseCommandError(error)
        return fail(issue.code, issue.message, issue.details, issue.severity)
      })
    record.promise = Promise.race([workerPromise, stopResult]).finally(() => {
      clearTimeout(timeout)
      if (scanInFlight.get(key) === record) scanInFlight.delete(key)
    })
    scanInFlight.set(key, record)
    return waitForScan(record.promise, [signal, requestContext?.signal], workspaceId, generation)
  }

  async function cliInfo(workspacePath, signal, force = false, workspaceId = '') {
    const canonical = canonicalPath(workspacePath)
    let executable = 'openspec'
    let identity = 'unresolved'
    try {
      if (typeof subprocess?.resolveExecutable === 'function') {
        executable = await subprocess.resolveExecutable('openspec', undefined, signal)
        identity = executableIdentity(executable, platform)
        const executableKey = `${workspaceId}:${canonical}`
        const previousExecutable = executableIdentities.get(executableKey)
        if (previousExecutable && previousExecutable !== identity) {
          clearScanCache(workspaceId, canonical)
        }
        executableIdentities.set(executableKey, identity)
      }
    } catch (error) {
      const key = `${workspaceId}:${canonical}:unresolved`
      const cached = !force ? cliCache.get(key) : null
      if (cached && cached.expiresAt > now()) return cached.info
      const info = { supported: false, capabilities: [], diagnostic: diagnosticFromError(error, 'CLI_UNAVAILABLE') }
      const record = { workspaceId, canonicalPath: canonical, executableIdentity: identity, executablePath: undefined, info, probedAt: now(), expiresAt: now() + cliFailureTtlMs, success: false }
      cliCache.set(key, record)
      return info
    }
    const key = `${workspaceId}:${canonical}:${identity}`
    const cached = !force ? cliCache.get(key) : null
    if (cached && cached.expiresAt > now()) return cached.info
    if (force) clearCliCache(workspaceId)
    try {
      const cliStarted = now()
      const result = await runCli(['--version'], workspacePath, signal)
      const version = cliVersionOf(`${result.stdout}\n${result.stderr}`)
      const supported = cliRangeSupported(version)
      const info = {
        version,
        supported,
        probeDurationMs: Math.max(0, now() - cliStarted),
        capabilities: supported ? ['status', 'instructions', 'validate', 'diff'] : [],
        ...(supported ? {} : { diagnostic: { code: 'CLI_UNSUPPORTED', message: `OpenSpec CLI 版本不在支持范围 ${SUPPORTED_CLI_RANGE}`, severity: 'warning' } }),
      }
      const probedAt = now()
      const record = { workspaceId, canonicalPath: canonical, executableIdentity: identity, executablePath: executable, info, probedAt, expiresAt: probedAt + cliTtlMs, success: supported }
      cliCache.set(key, record)
      const timer = setTimeout(() => { cliCache.delete(key); cliExpiryTimers.delete(key) }, cliTtlMs)
      cliExpiryTimers.set(key, timer)
      return info
    } catch (error) {
      const info = { supported: false, capabilities: [], diagnostic: diagnosticFromError(error, 'CLI_UNAVAILABLE') }
      const probedAt = now()
      const record = { workspaceId, canonicalPath: canonical, executableIdentity: identity, executablePath: executable, info, probedAt, expiresAt: probedAt + cliFailureTtlMs, success: false }
      cliCache.set(key, record)
      const timer = setTimeout(() => { cliCache.delete(key); cliExpiryTimers.delete(key) }, cliFailureTtlMs)
      cliExpiryTimers.set(key, timer)
      return info
    }
  }

  async function cliChanges(workspacePath, workspaceId, fallbackChanges, signal, force = false) {
    const startedAt = now()
    const info = await cliInfo(workspacePath, signal, force, workspaceId)
    if (!info.supported) return { info, changes: fallbackChanges, diagnostics: info.diagnostic ? [info.diagnostic] : [], provenance: 'file-scan', durationMs: Math.max(0, now() - startedAt), timing: timing('cli-status', Math.max(0, now() - startedAt), { supported: false, provenance: 'file-scan' }) }
    try {
      const result = await runCli(['status', '--all', '--json'], workspacePath, signal)
      const parsed = JSON.parse(result.stdout)
      const normalized = normalizeCliStatusPayload(parsed, workspaceId, fallbackChanges)
      if (!normalized.validContainer) throw commandError('CLI_PAYLOAD_INVALID', 'OpenSpec status 返回了无法识别的 JSON 结构')
      if (!normalized.items.length && (normalized.rejectedCount > 0 || normalized.invalidFieldCount > 0)) {
        return { info, changes: fallbackChanges, diagnostics: [...normalized.diagnostics, diagnosticFromError(commandError('CLI_EMPTY_DATA', 'CLI status 没有可安全使用的记录'), 'CLI_STATUS_FAILED')], provenance: 'file-scan' }
      }
      return { info, changes: normalized.items, diagnostics: normalized.diagnostics, provenance: 'cli', durationMs: Math.max(0, now() - startedAt), timing: timing('cli-status', Math.max(0, now() - startedAt), { supported: true, provenance: 'cli' }) }
    } catch (error) {
      return { info, changes: fallbackChanges, diagnostics: [diagnosticFromError(error, 'CLI_STATUS_FAILED')], provenance: 'file-scan', durationMs: Math.max(0, now() - startedAt), timing: timing('cli-status', Math.max(0, now() - startedAt), { supported: true, provenance: 'file-scan' }) }
    }
  }

  function publicChange(change) {
    if (!change) return change
    const { _files, _rootPath, ...publicValue } = change
    return publicValue
  }

  function publicProject(project) {
    return {
      ...project,
      changes: project.changes.map(publicChange),
      archivedChanges: project.archivedChanges.map(publicChange),
      documents: project.documents.map((document) => {
        const { rootPath, ...publicDocument } = document
        return publicDocument
      }),
    }
  }

  function mergeProjectScopes(active, archive) {
    if (!archive) return active
    return {
      ...active,
      archivedChanges: archive.archivedChanges,
      documents: [...active.documents, ...archive.documents],
      evidence: {
        ...active.evidence,
        scope: 'combined',
        diagnostics: [...(active.evidence?.diagnostics || []), ...(archive.evidence?.diagnostics || [])].slice(0, 50),
        timings: timingSummary([...(active.evidence?.timings || []), ...(archive.evidence?.timings || [])]),
        counts: {
          ...(active.evidence?.counts || {}),
          archivedChanges: archive.archivedChanges.length,
          documents: active.documents.length + archive.documents.length,
        },
      },
    }
  }

  async function scopedProject(workspaceId, workspacePath, includeArchived, signal, force, requestContext, requestedScope) {
    const scope = normalizeScanScope(requestedScope, includeArchived)
    if (scope === 'archive') return getScanSnapshot(workspaceId, workspacePath, true, signal, force, requestContext, 'archive')
    const active = await getScanSnapshot(workspaceId, workspacePath, false, signal, force, requestContext, 'active')
    if (scope !== 'all' || active?.unavailable) return active
    const archive = await getScanSnapshot(workspaceId, workspacePath, true, signal, false, requestContext, 'archive')
    return mergeProjectScopes(active, archive)
  }

  async function projectForChange(workspaceId, workspacePath, changeName, signal, force, requestContext) {
    // Targeted scans include only this change's active/archive subtrees.
    return getScanSnapshot(workspaceId, workspacePath, true, signal, force, requestContext, 'targeted', changeName)
  }

  function isArchiveDocument(document) {
    return asString(document?.path).startsWith(`${ARCHIVE_ROOT}/`)
  }

  function documentsForChange(project, changeName, archived = false) {
    return (project?.documents || []).filter((document) => document.changeId === changeName && isArchiveDocument(document) === archived)
  }

  async function warmWorkspace(workspaceRecord) {
    if (!backgroundEnabled || backgroundConcurrency < 1 || disposed || !workspaceRecord) return
    const workspaceId = workspaceRecord.workspaceId
    const workspacePath = workspaceRecord.workspacePath
    const context = { workspaceId, workspacePath: canonicalPath(workspacePath), generation: generationByWorkspace.get(workspaceId) || nextGeneration(workspaceId), signal: new AbortController().signal }
    try {
      await getScanSnapshot(workspaceId, workspacePath, false, context.signal, false, context, 'active')
    } catch { /* background warm-up is cache-only and never surfaces as current UI error */ }
  }

  async function warmOtherWorkspaces(selectedWorkspaceId) {
    if (!backgroundEnabled || backgroundConcurrency < 1 || disposed) return
    const records = (typeof registry?.list === 'function' ? registry.list() : [])
      .map(normalizeWorkspaceRecord)
      .filter((record) => record && record.workspaceId !== selectedWorkspaceId)
    let cursor = 0
    const worker = async () => {
      while (cursor < records.length && !disposed) {
        const record = records[cursor++]
        await warmWorkspace(record)
      }
    }
    await Promise.all(Array.from({ length: Math.min(backgroundConcurrency, records.length) }, () => worker()))
  }

  async function listProjects(args = {}) {
    const requestStarted = now()
    try {
      const rawWorkspaces = typeof registry?.list === 'function' ? registry.list() : []
      const workspaces = Array.isArray(rawWorkspaces) ? rawWorkspaces.map(normalizeWorkspaceRecord).filter(Boolean) : []
      const selected = normalizeWorkspaceId(args.workspaceId)
      const items = []
      for (const selectedRecord of workspaces) {
        const { workspace, workspaceId, workspacePath } = selectedRecord
        if (selected && workspaceId !== selected) continue
        const context = beginRequest('projects', workspaceId, workspacePath, Boolean(args.forceRefresh), args.signal)
        try {
          const project = await scopedProject(workspaceId, workspacePath, Boolean(args.includeArchived), context.signal, Boolean(args.forceRefresh), context, args.scope)
          if (!project || project.ok === false || !isCurrent(context)) continue
          const info = await cliInfo(workspacePath, context.signal, Boolean(args.forceRefresh), workspaceId)
          if (!isCurrent(context)) continue
          items.push({
            workspaceId,
            title: workspaceTitleOf(workspace),
            path: workspacePath,
            openspecRoot: project.openspecRoot,
            hasOpenSpec: project.unavailable !== true,
            changeCount: project.changes.length,
            archivedCount: project.archivedChanges.length,
            cli: info,
            evidence: project.evidence,
          })
        } catch (error) {
          if (isCurrent(context)) items.push({ workspaceId, title: workspaceTitleOf(workspace), path: workspacePath, hasOpenSpec: false, evidence: makeEvidence('fallback', context.generation, [diagnosticFromError(error)]) })
        } finally { endRequest(context) }
      }
      if (selected && backgroundEnabled) void warmOtherWorkspaces(selected)
      return ok({ items, timing: timing('list-projects', Math.max(0, now() - requestStarted), { scoped: Boolean(selected), workspaceCount: workspaces.length, resultCount: items.length }) })
    } catch (error) {
      const issue = parseCommandError(error)
      return fail(issue.code, issue.message, issue.details, issue.severity)
    }
  }

  async function listChanges(args = {}) {
    const requestStarted = now()
    let context
    try {
      const { workspaceId, workspacePath } = requireWorkspace(args)
      context = beginRequest('changes', workspaceId, workspacePath, Boolean(args.forceRefresh), args.signal)
      const project = await scopedProject(workspaceId, workspacePath, Boolean(args.includeArchived), context.signal, Boolean(args.forceRefresh), context, args.scope)
      if (!isCurrent(context)) return staleResult(context)
      if (project?.ok === false) return project
      if (project.unavailable) return ok(publicProject(project))
      const archiveOnly = normalizeScanScope(args.scope, Boolean(args.includeArchived)) === 'archive'
      const cli = archiveOnly
        ? { info: await cliInfo(workspacePath, context.signal, Boolean(args.forceRefresh), workspaceId), changes: [], diagnostics: [], provenance: 'file-scan', durationMs: 0, timing: timing('cli-status', 0, { supported: false, provenance: 'file-scan' }) }
        : await cliChanges(workspacePath, workspaceId, project.changes, context.signal, Boolean(args.forceRefresh))
      if (!isCurrent(context)) return staleResult(context)
      const diagnostics = [...(project.evidence.diagnostics || []), ...cli.diagnostics]
      const result = {
        workspaceId,
        title: project.title,
        path: project.path,
        openspecRoot: project.openspecRoot,
        cli: cli.info,
        changes: cli.changes.map(publicChange),
        archivedChanges: project.archivedChanges.map(publicChange),
        evidence: { ...project.evidence, provenance: cli.provenance, diagnostics, timings: timingSummary([...(project.evidence?.timings || []), cli.timing || timing('cli-status', cli.durationMs, { provenance: cli.provenance, supported: Boolean(cli.info?.supported) }), timing('list-changes', Math.max(0, now() - requestStarted), { scope: project.evidence?.scope || 'active', cli: Boolean(cli.info?.version) })]) },
      }
      return ok(result)
    } catch (error) {
      const issue = parseCommandError(error)
      return fail(issue.code, issue.message, issue.details, issue.severity)
    } finally { if (context) endRequest(context) }
  }

  async function getChangeStatus(args = {}) {
    try {
      const list = await listChanges({ ...args, includeArchived: true })
      if (!list || list.ok !== true) return list
      const changes = [...(list.value?.changes || []), ...(list.value?.archivedChanges || [])]
      const target = changes.find((change) => change.id === args.changeId || change.name === args.changeId)
      if (!target) return fail('CHANGE_NOT_FOUND', `未找到 change：${asString(args.changeId)}`)
      const info = await cliInfo(list.value.path, args.signal, Boolean(args.forceRefresh), target.workspaceId)
      if (!info.supported) return ok({ change: target, evidence: list.value.evidence })
      try {
        const statusStarted = now()
        const result = await runCli(['status', '--change', target.name, '--json'], list.value.path, args.signal)
        const raw = JSON.parse(result.stdout)
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw commandError('CLI_PAYLOAD_INVALID', 'OpenSpec status 返回了无法识别的 JSON 结构')
        const normalized = normalizeCliChange(raw, target.workspaceId, target)
        return ok({ change: publicChange(normalized), evidence: { ...list.value.evidence, ...normalized.evidence, provenance: 'cli', cliVersion: info.version, timings: timingSummary([...(list.value.evidence?.timings || []), timing('cli-change-status', Math.max(0, now() - statusStarted), { change: 'selected' })]) } })
      } catch (error) {
        return ok({ change: target, evidence: { ...list.value.evidence, diagnostics: [...(list.value.evidence.diagnostics || []), diagnosticFromError(error, 'CLI_STATUS_FAILED')] } })
      }
    } catch (error) { return fail(parseCommandError(error).code, parseCommandError(error).message) }
  }

  async function listDocuments(args = {}) {
    let context
    try {
      const { workspaceId, workspacePath } = requireWorkspace(args)
      context = beginRequest('documents', workspaceId, workspacePath, Boolean(args.forceRefresh), args.signal)
      const changeName = normalizeChangeName(args.changeId)
      if (!changeName) return fail('CHANGE_INVALID', 'change identity 无效')
      const project = await projectForChange(workspaceId, workspacePath, changeName, context.signal, Boolean(args.forceRefresh), context)
      if (!isCurrent(context)) return staleResult(context)
      if (project?.ok === false) return project
      if (project.unavailable) return ok({ workspaceId, documents: [], evidence: project.evidence })
      const knownChange = [...project.changes, ...project.archivedChanges].some((change) => change.name === changeName)
      if (!knownChange) return fail('CHANGE_NOT_FOUND', `未找到 change：${changeName}`)
      const archived = project.archivedChanges.some((change) => change.name === changeName) && !project.changes.some((change) => change.name === changeName)
      const documents = documentsForChange(project, changeName, archived)
      return ok({ workspaceId, changeId: changeName, documents, evidence: project.evidence })
    } catch (error) {
      const issue = parseCommandError(error)
      return fail(issue.code, issue.message, issue.details, issue.severity)
    } finally { if (context) endRequest(context) }
  }

  async function readDocument(args = {}) {
    let context
    try {
      const { workspaceId, workspacePath } = requireWorkspace(args)
      context = beginRequest('content', workspaceId, workspacePath, false, args.signal)
      const changeName = normalizeChangeName(args.changeId)
      const project = changeName ? await projectForChange(workspaceId, workspacePath, changeName, context.signal, false, context) : null
      if (!isCurrent(context)) return staleResult(context)
      if (project?.ok === false) return project
      if (!project || project.unavailable) return fail('OPENSPEC_ROOT_NOT_FOUND', '当前 Workspace 下不存在可读的 OpenSpec 根目录')
      if (!changeName || typeof args.documentId !== 'string' || args.documentId.includes('..') || args.documentId.includes('\\')) return fail('CHANGE_INVALID', 'change identity 无效')
      const document = project.documents.find((item) => item.id === args.documentId && item.changeId === changeName)
      if (!document) return fail('DOCUMENT_NOT_FOUND', '未找到指定文档')
      const rootTarget = await ensureOpenSpecRoot(workspacePath, context.signal)
      const rootPath = asString(rootTarget.displayPath) || project.openspecRoot
      const rel = normalizeRelativePath(relativeTo(rootPath, pathJoin(project.openspecRoot, document.path)))
      if (!rel || !pathWithin(project.openspecRoot, pathJoin(project.openspecRoot, rel))) return fail('PATH_BOUNDARY', '文档路径超出 OpenSpec 根目录')
      if (typeof fs.lstat === 'function') {
        const pathInfo = await fs.lstat(rel, { cwd: rootPath }, context.signal)
        if (pathInfo?.type === 'symlink') return fail('PATH_BOUNDARY', '符号链接文档不允许读取')
      }
      const target = await resolveTarget(rel, rootPath)
      if (!pathWithin(project.openspecRoot, asString(target.displayPath))) return fail('PATH_BOUNDARY', '文档真实路径超出 OpenSpec 根目录')
      const info = await stat(target, context.signal)
      if (!info || info.type !== 'file') return fail('DOCUMENT_NOT_FOUND', '文档不存在或不是普通文件')
      const maxBytes = Math.min(asFiniteNumber(args.maxBytes, DEFAULT_MAX_DOCUMENT_BYTES), DEFAULT_MAX_DOCUMENT_BYTES)
      const beforeRevision = metadataRevision(info)
      const content = await readSmallFile({ target, size: info.size, path: document.path }, context.signal, maxBytes)
      const afterInfo = await stat(target, context.signal)
      const revision = documentRevision(content, afterInfo || info)
      const afterRevision = metadataRevision(afterInfo || info)
      const originalBytes = byteLength(content)
      const freshness = beforeRevision === null || afterRevision === null ? 'unknown' : beforeRevision === afterRevision ? 'fresh' : 'stale'
      if (!isCurrent(context)) return staleResult(context)
      return ok({
        document,
        content,
        revision,
        generation: context.generation,
        originalBytes,
        rawBytes: originalBytes,
        returnedBytes: originalBytes,
        displayLimit: Math.min(asFiniteNumber(args.displayLimit, 200000), maxBytes),
        maxBytes,
        truncated: false,
        freshness,
        evidence: { ...document.evidence, freshness, generation: context.generation, requestKey: context.requestKey },
      })
    } catch (error) {
      const issue = parseCommandError(error)
      return fail(issue.code, issue.message, issue.details, issue.severity)
    } finally { if (context) endRequest(context) }
  }

  async function getEvidence(args = {}) {
    const facet = ['status', 'validation', 'diff', 'instructions'].includes(args.facet) ? args.facet : 'status'
    let context
    try {
      const { workspaceId, workspacePath } = requireWorkspace(args)
      context = beginRequest('evidence', workspaceId, workspacePath, false, args.signal)
      const changeName = asString(args.changeId)
      if (!safeChangeName(changeName) || changeName.startsWith('-')) return fail('CHANGE_INVALID', 'change identity 无效')
      const project = await projectForChange(workspaceId, workspacePath, changeName, context.signal, false, context)
      if (!isCurrent(context)) return staleResult(context)
      if (project?.ok === false) return project
      if (!project || project.unavailable) return fail('OPENSPEC_ROOT_NOT_FOUND', '当前 Workspace 下不存在可读的 OpenSpec 根目录')
      if (!changeName || !safeChangeName(changeName) || changeName.startsWith('-')) return fail('CHANGE_INVALID', 'change identity 无效')
      const knownChange = [...project.changes, ...project.archivedChanges].some((change) => change.name === changeName)
      if (!knownChange) return fail('CHANGE_NOT_FOUND', `未找到 change：${changeName}`)
      const info = await cliInfo(workspacePath, context.signal, Boolean(args.forceRefresh), workspaceId)
      if (!info.supported) {
        const issue = info.diagnostic || { code: 'CLI_UNSUPPORTED', message: `当前 OpenSpec CLI 不在支持范围 ${SUPPORTED_CLI_RANGE} 内` }
        return fail(issue.code, issue.message, { ...(isRecord(issue.details) ? issue.details : {}), severity: 'warning' })
      }
      const instructionArtifact = asString(args.artifactId || args.instruction)
      const command = facet === 'status' ? ['status', '--change', changeName, '--json']
        : facet === 'validation' ? ['validate', changeName, '--type', 'change', '--json']
          : facet === 'diff' ? ['show', changeName, '--json', '--diff']
            : facet === 'instructions' && INSTRUCTION_ARTIFACTS.has(instructionArtifact) ? ['instructions', instructionArtifact, '--change', changeName, '--json']
              : null
      if (!command) return fail('EVIDENCE_ARGUMENT_INVALID', 'instructions evidence 需要合法的 artifactId')
      const cliStarted = now()
      const result = await runCli(command, workspacePath, context.signal)
      const cliDurationMs = Math.max(0, now() - cliStarted)
      let value
      try { value = JSON.parse(result.stdout) } catch (error) { throw commandError('CLI_PAYLOAD_INVALID', 'OpenSpec evidence 返回了无效 JSON') }
      if (value === null || typeof value !== 'object') throw commandError('CLI_PAYLOAD_INVALID', 'OpenSpec evidence 返回了无效 JSON 结构')
      if (!isCurrent(context)) return staleResult(context)
      return ok({ facet, value: safeJsonValue(value), evidence: makeEvidence('cli', context.generation, [], { cliVersion: info.version, command: command.join(' '), requestKey: context.requestKey, timings: [timing('cli-evidence', cliDurationMs, { facet })] }) })
    } catch (error) {
      const issue = diagnosticFromError(error, 'CLI_EVIDENCE_FAILED')
      return fail(issue.code, issue.message, { ...(isRecord(issue.details) ? issue.details : {}), severity: issue.severity }, issue.severity)
    } finally { if (context) endRequest(context) }
  }

  function dispose() {
    disposed = true
    for (const timer of refreshTimers.values()) clearTimeout(timer)
    refreshTimers.clear()
    for (const timer of cliExpiryTimers.values()) clearTimeout(timer)
    cliExpiryTimers.clear()
    for (const context of pending.values()) {
      context.cancelled = true
      try { context.controller.abort('disposed') } catch { /* best effort */ }
      context.cleanup?.()
    }
    pending.clear()
    cliCache.clear()
    for (const timer of scanExpiryTimers.values()) clearTimeout(timer)
    scanExpiryTimers.clear()
    for (const record of scanInFlight.values()) {
      record.cancelled = true
      try { record.controller.abort('disposed') } catch { /* best effort */ }
      record.settleStop?.(fail('REQUEST_CANCELLED', 'OpenSpec 扫描已取消', { workspaceId: record.workspaceId, generation: record.generation }, 'info'))
    }
    scanInFlight.clear()
    scanCache.clear()
    workspacePaths.clear()
    executableIdentities.clear()
    generationByWorkspace.clear()
  }

  return { listProjects, listChanges, getChangeStatus, listDocuments, readDocument, getEvidence, scheduleInvalidation, dispose }
}

export function apply(ctx) {
  const service = createOpenSpecService(ctx)
  const exposed = {
    listProjects: (args) => service.listProjects(args),
    listChanges: (args) => service.listChanges(args),
    getChangeStatus: (args) => service.getChangeStatus(args),
    listDocuments: (args) => service.listDocuments(args),
    readDocument: (args) => service.readDocument(args),
    getEvidence: (args) => service.getEvidence(args),
  }
  Object.defineProperty(exposed, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service: exposed, serviceKey: SERVICE_NAME, namespace: SERVICE_NAMESPACE },
  })
  ctx.provide(SERVICE_NAME, exposed)
  ctx.inject?.(['settings'], (sctx) => {
    const settings = sctx?.settings
    if (!settings || typeof settings.register !== 'function') return
    // Only display preferences are persisted; no paths, indexes, documents, or secrets.
    try {
      const scope = settings.register('openspec-workbench', SETTINGS_SCHEMA)
      void scope
    } catch { /* optional settings surface */ }
  })
  ctx.effect(() => () => service.dispose(), `${PACKAGE_NAME}: dispose`)
}

export { DEFAULT_MAX_DOCUMENT_BYTES, DEFAULT_MAX_ENTRIES, DEFAULT_MAX_DEPTH, DEFAULT_CLI_TTL_MS, DEFAULT_CLI_FAILURE_TTL_MS, SUPPORTED_CLI_RANGE, isWindowsShim, parseWindowsShim, makeCliDiagnostic }
export default { name, inject, apply }
