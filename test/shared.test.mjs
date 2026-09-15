import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cliRangeSupported,
  fallbackArtifactSummaries,
  fallbackChangeStatus,
  normalizeArtifact,
  normalizeCliChange,
  normalizeRelativePath,
  normalizeTaskProgress,
  parseTaskProgress,
  pathWithin,
  safeJsonValue,
  normalizeCliStatusPayload,
  documentRevision,
  timing,
  timingSummary,
} from '../lib/shared.js'
import { apply, createOpenSpecService, isWindowsShim, makeCliDiagnostic, parseWindowsShim } from '../lib/index.js'

function makeCollected(text = '') {
  return { readFrom: () => ({ text }) }
}

function makeHandle(stdout = '', stderr = '', outcome = { exitCode: 0, signal: null }) {
  return {
    collected: { stdout: makeCollected(stdout), stderr: makeCollected(stderr) },
    done: Promise.resolve(outcome),
    terminate() {},
    waitForExit: async () => true,
  }
}

function target(displayPath, type = 'file', size = 0) {
  return { displayPath, targetKey: displayPath, type, size }
}

function makeFs(files, options = {}) {
  const normalized = new Map(Object.entries(files).map(([path, value]) => [path.replaceAll('\\', '/'), value]))
  const resolvePath = (path, cwd = 'C:/repo') => {
    const raw = path.replaceAll('\\', '/')
    if (raw.startsWith('C:/')) return raw.replace(/\/$/, '')
    return `${cwd.replaceAll('\\', '/').replace(/\/$/, '')}/${raw}`.replace(/\/\.\//g, '/')
  }
  return {
    async resolve(path, options = {}) {
      const displayPath = resolvePath(path, options.cwd)
      const value = normalized.get(displayPath)
      if (value?.type === 'missing') throw Object.assign(new Error('not found'), { code: 'FS_NOT_FOUND' })
      return target(displayPath, value?.type || (displayPath.endsWith('/openspec') ? 'directory' : 'file'), value?.content?.length || 0)
    },
    async stat(resolved) {
      const value = normalized.get(resolved.displayPath)
      if (!value) {
        if (resolved.displayPath.endsWith('/openspec')) return { type: 'directory', version: 'root', size: 0 }
        return undefined
      }
      return { type: value.type || 'file', version: value.version || String(value.content?.length || 0), size: value.content?.length || 0 }
    },
    async listDir(resolved) {
      const prefix = resolved.displayPath.replace(/\/$/, '') + '/'
      const children = new Map()
      for (const [path, value] of normalized) {
        if (!path.startsWith(prefix)) continue
        const remainder = path.slice(prefix.length)
        const [name, ...rest] = remainder.split('/')
        if (!name) continue
        const childPath = prefix + name
        if (rest.length) children.set(name, { name, type: 'directory', target: target(childPath, 'directory') })
        else children.set(name, { name, type: value.type || 'file', target: target(childPath, value.type || 'file', value.content?.length || 0), size: value.content?.length || 0 })
      }
      return [...children.values()]
    },
    async readText(resolved) {
      const value = normalized.get(resolved.displayPath)
      if (!value || value.type === 'missing') throw Object.assign(new Error('not found'), { code: 'FS_NOT_FOUND' })
      return value.content
    },
    ...(options.lstat ? { lstat: options.lstat } : {}),
  }
}

test('normalizes paths and rejects traversal', () => {
  assert.equal(normalizeRelativePath('specs/auth/spec.md'), 'specs/auth/spec.md')
  assert.equal(normalizeRelativePath('../secret.md'), null)
  assert.equal(normalizeRelativePath('/absolute.md'), null)
  assert.equal(pathWithin('C:/repo/openspec', 'C:/repo/openspec/specs/a.md'), true)
  assert.equal(pathWithin('C:/repo/openspec', 'C:/repo/other/a.md'), false)
})

test('parses task progress and fallback workflow states', () => {
  assert.deepEqual(parseTaskProgress('- [x] done\n- [ ] todo\n* [X] done'), { done: 2, total: 3, source: 'checkbox' })
  assert.equal(fallbackChangeStatus({ tasksPresent: false }), 'draft')
  assert.equal(fallbackChangeStatus({ tasksPresent: true, progress: { done: 0, total: 2 } }), 'todo')
  assert.equal(fallbackChangeStatus({ tasksPresent: true, progress: { done: 1, total: 2 } }), 'in_progress')
  assert.equal(fallbackChangeStatus({ tasksPresent: true, progress: { done: 2, total: 2 } }), 'done')
  assert.equal(fallbackChangeStatus({ archived: true, tasksPresent: true, progress: { done: 2, total: 2 } }), 'archived')
})

test('normalizes CLI artifact and progress facts without collapsing them', () => {
  assert.deepEqual(normalizeArtifact({ id: 'review', status: 'ready', requires: ['proposal'] }), {
    id: 'review', outputPath: undefined, status: 'ready', present: false, requires: ['proposal'], missingDeps: [],
  })
  assert.deepEqual(normalizeTaskProgress({ completed: 2, total: 5 }, 'cli'), { done: 2, total: 5, source: 'cli' })
  const fallback = { id: 'w:change', name: 'change', workspaceId: 'w', status: 'todo', artifacts: [], evidence: {} }
  const normalized = normalizeCliChange({ name: 'change', status: 'in_progress', trackedTaskProgress: { done: 2, total: 5 }, applyProgress: { done: 1, total: 3 }, artifacts: [{ id: 'review', status: 'ready' }] }, 'w', fallback)
  assert.equal(normalized.status, 'in_progress')
  assert.deepEqual(normalized.trackedTaskProgress, { done: 2, total: 5, source: 'cli' })
  assert.deepEqual(normalized.applyProgress, { done: 1, total: 3, source: 'cli' })
  assert.equal(normalized.artifacts[0].id, 'review')
})

test('isolates invalid CLI records while retaining safe partial data', () => {
  const result = normalizeCliStatusPayload({ items: [
    { name: 'safe-change', status: 'in_progress', trackedTaskProgress: { done: 1, total: 2 }, artifacts: [{ id: 'proposal', status: 'complete', path: 'proposal.md' }] },
    { name: '../escape', status: 'done' },
    { name: '-option', status: 'done' },
    { name: 'bad-progress', trackedTaskProgress: { done: 3, total: 2 } },
  ] }, 'w1', [])
  assert.equal(result.validContainer, true)
  assert.equal(result.items.length, 2)
  assert.equal(result.items[0].name, 'safe-change')
  assert.equal(result.items[0].trackedTaskProgress.done, 1)
  assert.equal(result.items[1].name, 'bad-progress')
  assert.ok(result.diagnostics.some((item) => item.code === 'CLI_PARTIAL_DATA'))
  assert.ok(result.diagnostics.some((item) => item.code === 'CLI_CHANGE_IDENTITY_INVALID'))
  assert.ok(result.diagnostics.some((item) => item.code === 'CLI_PROGRESS_INVALID'))
})

test('document revisions detect same-size content changes and UTF-8 byte counts', () => {
  assert.notEqual(documentRevision('aa', { version: 'v1' }), documentRevision('bb', { version: 'v1' }))
  assert.equal(new TextEncoder().encode('你好').byteLength, 6)
})

test('supports only the pinned OpenSpec CLI minor line', () => {
  assert.equal(cliRangeSupported('1.12.0'), true)
  assert.equal(cliRangeSupported('v1.12.9'), true)
  assert.equal(cliRangeSupported('1.11.0'), false)
  assert.equal(cliRangeSupported('1.13.0'), false)
  assert.equal(cliRangeSupported('unknown'), false)
})

test('safeJsonValue drops non-JSON values and prototype keys', () => {
  const value = safeJsonValue({ ok: 1, fn: () => {}, __proto__: { polluted: true }, nested: [undefined, NaN] })
  assert.deepEqual(value, { ok: 1, fn: null, nested: [null, null] })
})

test('Host adapter discovers only registered Workspace files and reads documents on demand', async () => {
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal\n\nWhy' },
    'C:/repo/openspec/changes/add-auth/tasks.md': { content: '- [x] one\n- [ ] two' },
    'C:/repo/openspec/changes/add-auth/specs/auth/spec.md': { content: '# Auth' },
    'C:/repo/openspec/changes/add-auth/.openspec.yaml': { content: 'schema: spec-driven' },
  })
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
  })
  const listed = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(listed.ok, true)
  assert.equal(listed.value.changes[0].name, 'add-auth')
  assert.equal(listed.value.changes[0].status, 'in_progress')
  assert.equal(listed.value.changes[0].evidence.provenance, 'file-scan')
  const docs = await service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth' })
  assert.equal(docs.ok, true)
  assert.ok(docs.value.documents.some((item) => item.path.endsWith('proposal.md')))
  const proposal = docs.value.documents.find((item) => item.path.endsWith('proposal.md'))
  const read = await service.readDocument({ workspaceId: 'w1', changeId: 'add-auth', documentId: proposal.id })
  assert.equal(read.ok, true)
   assert.equal(read.value.originalBytes, new TextEncoder().encode(read.value.content).byteLength)
   assert.equal(read.value.returnedBytes, read.value.originalBytes)
   assert.equal(read.value.truncated, false)
   assert.equal(typeof read.value.generation, 'number')
   assert.equal(typeof read.value.evidence.requestKey, 'string')
  assert.match(read.value.content, /Proposal/)
  service.dispose()
})

test('scan timing metadata is bounded and JSON-safe', () => {
  const values = timingSummary([timing('active-scan', 42.8, { scope: 'active', secret: 'drop-me' }), { stage: 'bad', durationMs: -1 }, null])
  assert.equal(values.length, 2)
  assert.equal(values[0].durationMs, 43)
  assert.equal(values[0].scope, 'active')
  assert.equal(values[0].secret, undefined)
})

test('Host adapter keeps optional background warm-up out of the default path', async () => {
  let calls = 0
  const fs = makeFs({ 'C:/repo/openspec': { type: 'directory' } })
  const original = fs.listDir
  fs.listDir = async (...args) => { calls += 1; return original(...args) }
  const service = createOpenSpecService({ workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }, { id: 'w2', title: 'Other', path: 'C:/other' }] }, fs })
  const result = await service.listProjects({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.equal(calls, 1)
  service.dispose()
})

test('Host adapter enforces scan timeout for a stalled filesystem', async () => {
  const fs = makeFs({ 'C:/repo/openspec': { type: 'directory' } })
  fs.listDir = async () => await new Promise(() => {})
  const service = createOpenSpecService({ scanTimeoutMs: 20, workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] }, fs })
  const started = Date.now()
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.ok(Date.now() - started < 1000)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'SCAN_TIMEOUT')
  service.dispose()
})

test('Host adapter aborts a shared scan and avoids caching timeout results', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/slow/proposal.md': { content: '# Slow' },
  })
  const original = fs.listDir
  fs.listDir = async (...args) => { await gate; return original(...args) }
  const service = createOpenSpecService({ scanTimeoutMs: 25, workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] }, fs })
  const controller = new AbortController()
  const pending = service.listChanges({ workspaceId: 'w1', signal: controller.signal })
  controller.abort('user')
  const cancelled = await pending
  assert.equal(cancelled.ok, false)
  assert.equal(cancelled.error.code, 'REQUEST_CANCELLED')
  release()
  const recovered = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(recovered.ok, true)
  assert.equal(recovered.value.changes[0].name, 'slow')
  service.dispose()
})

test('Host adapter scopes active, archive, and targeted scans independently', async () => {
  let listDirCalls = 0
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Active' },
    'C:/repo/openspec/changes/archive/old/proposal.md': { content: '# Archived' },
  })
  const original = fs.listDir
  fs.listDir = async (...args) => { listDirCalls += 1; return original(...args) }
  const service = createOpenSpecService({ workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] }, fs })
  const active = await service.listChanges({ workspaceId: 'w1', scope: 'active' })
  assert.equal(active.ok, true)
  assert.equal(active.value.changes.some((item) => item.name === 'add-auth'), true)
  assert.equal(active.value.archivedChanges.length, 0)
  const afterActive = listDirCalls
  const archived = await service.listChanges({ workspaceId: 'w1', scope: 'archive', includeArchived: true })
  assert.equal(archived.ok, true)
  assert.equal(archived.value.archivedChanges.some((item) => item.name === 'old'), true)
  assert.ok(listDirCalls > afterActive)
  const docs = await service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth', scope: 'targeted' })
  assert.equal(docs.ok, true)
  assert.equal(docs.value.documents.length, 1)
  service.dispose()
})

test('Host adapter coalesces Workspace scans and reuses a bounded TTL snapshot', async () => {
  let clock = 1000
  let listDirCalls = 0
  let releaseRoot
  const gate = new Promise((resolve) => { releaseRoot = resolve })
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
  })
  const originalListDir = fs.listDir
  fs.listDir = async (...args) => {
    listDirCalls += 1
    if (listDirCalls === 1) await gate
    return originalListDir(...args)
  }
  const service = createOpenSpecService({
    now: () => clock,
    scanTtlMs: 1000,
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
  })
  const changesPromise = service.listChanges({ workspaceId: 'w1' })
  await Promise.resolve()
  const documentsPromise = service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth' })
  await Promise.resolve()
  releaseRoot()
  const [changes, documents] = await Promise.all([changesPromise, documentsPromise])
  assert.equal(changes.ok, true)
  assert.equal(documents.ok, true)
  const firstWalkCalls = listDirCalls
  const cached = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(cached.ok, true)
  assert.equal(listDirCalls, firstWalkCalls)
  clock = 2501
  const expired = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(expired.ok, true)
  assert.ok(listDirCalls > firstWalkCalls)
  service.dispose()
})

test('Host adapter lists archived documents with the archived change id', async () => {
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/archive/old-change/proposal.md': { content: '# Archived' },
    }),
  })
  const listed = await service.listDocuments({ workspaceId: 'w1', changeId: 'old-change' })
  assert.equal(listed.ok, true)
  assert.equal(listed.value.documents[0].changeId, 'old-change')
  service.dispose()
})

test('Windows shim parser builds a safe native argv plan', () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  assert.equal(isWindowsShim(shim, 'win32'), true)
  assert.deepEqual(parseWindowsShim(source, shim), {
    kind: 'node-shim',
    argvPrefix: ['C:\\Program Files\\OpenSpec\\node.exe', 'C:\\Program Files\\OpenSpec\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js'],
    shimPath: 'C:\\Program Files\\OpenSpec\\openspec.cmd',
  })
  assert.equal(isWindowsShim('C:/OpenSpec/openspec.cmd', 'linux'), false)
  assert.equal(isWindowsShim('C:/OpenSpec/openspec.bat', 'win32'), true)
  assert.ok(parseWindowsShim(source.replace('openspec.cmd', 'openspec.bat'), 'C:\\Program Files\\OpenSpec\\openspec.bat'))
  assert.equal(parseWindowsShim(source, ''), null)
  assert.equal(parseWindowsShim(source, 'relative\\openspec.cmd'), null)
  assert.ok(parseWindowsShim(source, 'C:/OpenSpec/openspec.cmd'))
  const unicodeShim = 'C:\\程序 文件\\OpenSpec\\openspec.cmd'
  const unicodeSource = source.replaceAll('C:\\Program Files\\OpenSpec', 'C:\\程序 文件\\OpenSpec')
  assert.deepEqual(parseWindowsShim(unicodeSource, unicodeShim)?.argvPrefix, ['C:\\程序 文件\\OpenSpec\\node.exe', 'C:\\程序 文件\\OpenSpec\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js'])
  assert.equal(parseWindowsShim('SET "_prog=cmd.exe"\ncmd /c echo %*', 'C:/OpenSpec/openspec.cmd'), null)
  assert.equal(parseWindowsShim(source.replace('%*', '%PATH%'), shim), null)
  assert.equal(parseWindowsShim(source.replace('CALL :find_dp0', 'CALL :find_dp0\ndel target.txt'), shim), null)
  assert.equal(parseWindowsShim(source.replace('openspec.js', 'openspec.ps1'), shim), null)
})

test('CLI diagnostics normalize spawn failures and preserve details', () => {
  const issue = makeCliDiagnostic(Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }), 'CLI_UNAVAILABLE')
  assert.deepEqual(issue, {
    code: 'CLI_SPAWN_FAILED',
    message: 'OpenSpec CLI 进程启动失败',
    details: { causeCode: 'EINVAL', causeMessage: 'spawn EINVAL' },
    severity: 'warning',
  })
  const timeout = makeCliDiagnostic(Object.assign(new Error(JSON.stringify({ code: 'CLI_TIMEOUT', message: '超时' })), { code: 'CLI_TIMEOUT' }), 'CLI_TIMEOUT')
  assert.equal(timeout.code, 'CLI_TIMEOUT')
  assert.equal(timeout.severity, 'warning')
})

test('Host adapter reports a CLI spawn diagnostic and preserves file-scan fallback', async () => {
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
      'C:/repo/openspec/changes/add-auth/tasks.md': { content: '- [ ] todo' },
    }),
    platform: 'linux',
    subprocess: {
      async resolveExecutable() { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }) },
      async resolve() { return { command: 'openspec --version', workdir: 'C:/repo' } },
      async run() { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }) },
    },
  })
  const listed = await service.listProjects({ includeArchived: false })
  assert.equal(listed.ok, true)
  assert.equal(listed.value.items[0].cli.supported, false)
  assert.equal(listed.value.items[0].cli.diagnostic.code, 'CLI_SPAWN_FAILED')
  assert.equal(listed.value.items[0].cli.diagnostic.details.causeCode, 'EINVAL')
  assert.equal(listed.value.items[0].cli.diagnostic.severity, 'warning')
  assert.equal(listed.value.items[0].evidence.provenance, 'file-scan')
  const changes = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(changes.ok, true)
  assert.equal(changes.value.changes[0].name, 'add-auth')
  service.dispose()
})

test('Host adapter executes a resolved Windows shim with exact native argv and subprocess limits', async () => {
  const calls = []
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
  })
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable(command) { return command === 'openspec' ? shim : 'C:/Program Files/OpenSpec/node.exe' },
      spawn(spec) { calls.push(spec); return makeHandle('1.12.4\n') },
    },
  })
  const listed = await service.listProjects({ workspaceId: 'w1' })
  assert.equal(listed.ok, true)
  assert.equal(listed.value.items[0].cli.version, '1.12.4')
  assert.deepEqual(calls[0].argv, ['C:/Program Files/OpenSpec/node.exe', 'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js', '--version'])
  assert.equal(calls[0].cwd, 'C:/repo')
  assert.deepEqual(calls[0].stdio, {
    stdin: 'ignore',
    stdout: { maxBytes: 4 * 1024 * 1024 },
    stderr: { maxBytes: 512 * 1024 },
  })
  assert.equal(calls[0].graceMs, 3000)
  assert.ok(calls[0].signal instanceof AbortSignal)
  service.dispose()
})

test('Host adapter distinguishes CLI cancellation while retaining fallback', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
  })
  const controller = new AbortController()
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable() { return shim },
      spawn(spec) { controller.abort('user'); return makeHandle('') },
    },
  })
  const result = await service.listChanges({ workspaceId: 'w1', signal: controller.signal })
  assert.equal(result.ok, true)
  assert.equal(result.value.changes[0].name, 'add-auth')
  assert.equal(result.value.evidence.diagnostics[0].code, 'CLI_ABORTED')
  assert.equal(result.value.evidence.diagnostics[0].severity, 'warning')
  service.dispose()
})

test('Host adapter keeps CLI fallback on spawn rejection and non-zero exit', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
  })
  const spawnFailure = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: { async resolveExecutable() { return shim }, spawn() { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }) } },
  })
  const failed = await spawnFailure.listChanges({ workspaceId: 'w1' })
  assert.equal(failed.ok, true)
  assert.equal(failed.value.changes[0].name, 'add-auth')
  assert.equal(failed.value.evidence.provenance, 'file-scan')
  assert.equal(failed.value.evidence.diagnostics[0].code, 'CLI_SPAWN_FAILED')
  assert.equal(failed.value.evidence.diagnostics[0].severity, 'warning')
  spawnFailure.dispose()

  const nonZero = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: { async resolveExecutable() { return shim }, spawn() { return makeHandle('', 'bad status', { exitCode: 2, signal: null }) } },
  })
  const rejected = await nonZero.listChanges({ workspaceId: 'w1' })
  assert.equal(rejected.ok, true)
  assert.equal(rejected.value.changes[0].name, 'add-auth')
  assert.equal(rejected.value.evidence.diagnostics[0].code, 'CLI_COMMAND_FAILED')
  assert.equal(rejected.value.evidence.diagnostics[0].severity, 'warning')
  assert.equal(rejected.value.evidence.provenance, 'file-scan')
  nonZero.dispose()
})

test('Host adapter treats a valid empty CLI status as authoritative without warning', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
  })
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable() { return shim },
      spawn(spec) { return makeHandle(spec.argv.at(-1) === '--version' ? '1.12.0\\n' : JSON.stringify({ changes: [] })) },
    },
  })
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.changes, [])
  assert.equal(result.value.evidence.provenance, 'cli')
  assert.equal(result.value.evidence.diagnostics.some((item) => item.code === 'CLI_EMPTY_DATA'), false)
  assert.equal(result.value.evidence.diagnostics.length, 0)
  service.dispose()
})

test('Host adapter uses CLI authority for status and evidence facets', async () => {
  const calls = []
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
    'C:/repo/openspec/changes/add-auth/.openspec.yaml': { content: 'schema: spec-driven' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
  })
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable() { return shim },
      spawn(spec) {
        calls.push(spec)
        const command = spec.argv.at(-1) === '--version' ? 'version' : spec.argv.includes('validate') ? 'validation' : spec.argv.includes('instructions') ? 'instructions' : spec.argv.includes('show') ? 'diff' : 'status'
        const stdout = command === 'version' ? '1.12.0\n' : JSON.stringify({ change: { name: 'add-auth', status: 'in_progress' }, items: [{ name: 'add-auth', status: 'in_progress' }], facet: command })
        return makeHandle(stdout)
      },
    },
  })
  const listed = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(listed.ok, true)
  assert.equal(listed.value.evidence.provenance, 'cli')
  assert.equal(listed.value.cli.version, '1.12.0')
  const status = await service.getChangeStatus({ workspaceId: 'w1', changeId: 'add-auth' })
  assert.equal(status.ok, true)
  assert.equal(status.value.evidence.provenance, 'cli')
  for (const facet of ['validation', 'instructions', 'diff']) {
    const evidence = await service.getEvidence({ workspaceId: 'w1', changeId: 'add-auth', facet, artifactId: facet === 'instructions' ? 'proposal' : undefined })
    assert.equal(evidence.ok, true)
    assert.equal(evidence.value.evidence.provenance, 'cli')
  }
  assert.deepEqual(calls[0].argv.slice(-1), ['--version'])
  assert.equal(calls.some((call) => call.argv.includes('status') && call.argv.includes('--all')), true)
  assert.equal(calls.some((call) => call.argv.includes('validate')), true)
  assert.equal(calls.some((call) => call.argv.includes('instructions')), true)
  assert.equal(calls.some((call) => call.argv.includes('show')), true)
  service.dispose()
})

test('Host adapter reports missing shim targets without claiming CLI authority', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
      [shim]: { content: source },
    }),
    subprocess: { async resolveExecutable() { return shim }, spawn() { throw new Error('should not spawn') } },
  })
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.equal(result.value.changes[0].name, 'add-auth')
  assert.equal(result.value.evidence.provenance, 'file-scan')
  assert.equal(result.value.evidence.diagnostics[0].code, 'CLI_SHIM_TARGET_MISSING')
  assert.equal(result.value.evidence.diagnostics[0].severity, 'warning')
  service.dispose()
})

test('Host adapter preserves non-Windows native executable and run seam behavior', async () => {
  const calls = []
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
  })
  const service = createOpenSpecService({
    platform: 'linux',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable() { return '/usr/local/bin/openspec' },
      spawn(spec) { calls.push(['spawn', spec]); return makeHandle('1.12.0\n') },
    },
  })
  const projects = await service.listProjects({ workspaceId: 'w1' })
  assert.equal(projects.value.items[0].cli.version, '1.12.0')
  assert.deepEqual(calls[0][1].argv, ['/usr/local/bin/openspec', '--version'])
  service.dispose()

  const runCalls = []
  const runService = createOpenSpecService({
    platform: 'linux',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolve(spec) { runCalls.push('resolve'); return spec },
      async run(spec) { runCalls.push(spec); return { stdout: { text: '1.12.0\n' }, stderr: { text: '' }, exitCode: 0 } },
    },
  })
  const runProjects = await runService.listProjects({ workspaceId: 'w1' })
  assert.equal(runProjects.value.items[0].cli.version, '1.12.0')
  assert.equal(runCalls[0], 'resolve')
  assert.match(runCalls[1].command, /^openspec --version$/)
  runService.dispose()
})

test('Windows compatibility run seam fails closed without shell fallback', async () => {
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
    }),
    subprocess: {
      async resolve(spec) { return spec },
      async run() { throw new Error('must not run Windows shell seam') },
    },
  })
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.equal(result.value.changes[0].name, 'add-auth')
  assert.equal(result.value.evidence.provenance, 'file-scan')
  assert.equal(result.value.evidence.diagnostics[0].code, 'CLI_SHIM_UNSUPPORTED')
  assert.equal(result.value.evidence.diagnostics[0].severity, 'warning')
  service.dispose()
})

test('Host adapter keeps all-invalid CLI status as fallback with diagnostics', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const fs = makeFs({
    'C:/repo/openspec': { type: 'directory' },
    'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
    [shim]: { content: source },
    'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
    'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
  })
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs,
    subprocess: {
      async resolveExecutable() { return shim },
      spawn(spec) {
        return makeHandle(spec.argv.at(-1) === '--version' ? '1.12.0\\n' : JSON.stringify({ changes: [{ name: '../escape' }] }))
      },
    },
  })
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.equal(result.value.evidence.provenance, 'file-scan')
  assert.ok(result.value.evidence.diagnostics.some((item) => item.code === 'CLI_CHANGE_IDENTITY_INVALID'))
  assert.ok(result.value.evidence.diagnostics.some((item) => item.code === 'CLI_EMPTY_DATA'))
  service.dispose()
})

test('Host adapter reports malformed CLI JSON as warning and preserves fallback', async () => {
  const shim = 'C:\\Program Files\\OpenSpec\\openspec.cmd'
  const source = '@ECHO off\nGOTO start\n:find_dp0\nSET dp0=%~dp0\nEXIT /b\n:start\nSETLOCAL\nCALL :find_dp0\nIF EXIST "%dp0%\\node.exe" (\n  SET "_prog=%dp0%\\node.exe"\n) ELSE (\n  SET "_prog=node"\n  SET PATHEXT=%PATHEXT:;.JS;=;%)\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@fission-ai\\openspec\\bin\\openspec.js" %*'
  const service = createOpenSpecService({
    platform: 'win32',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
      [shim]: { content: source },
      'C:/Program Files/OpenSpec/node.exe': { type: 'file' },
      'C:/Program Files/OpenSpec/node_modules/@fission-ai/openspec/bin/openspec.js': { type: 'file' },
    }),
    subprocess: {
      async resolveExecutable() { return shim },
      spawn(spec) { return makeHandle(spec.argv.at(-1) === '--version' ? '1.12.0\n' : '{not-json}') },
    },
  })
  const result = await service.getEvidence({ workspaceId: 'w1', changeId: 'add-auth', facet: 'validation' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'CLI_PAYLOAD_INVALID')
  assert.equal(result.error.details.severity, 'warning')
  service.dispose()
})

test('Host adapter rejects an invalid CLI identity before constructing commands', async () => {
  const calls = []
  const service = createOpenSpecService({
    platform: 'linux',
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '# Proposal' },
    }),
    subprocess: {
      async resolveExecutable() { return '/usr/local/bin/openspec' },
      spawn(spec) {
        calls.push(spec.argv)
        const output = spec.argv.includes('--version') ? '1.12.0' : JSON.stringify({ items: [{ name: '../escape' }] })
        return makeHandle(output)
      },
    },
  })
  const result = await service.listChanges({ workspaceId: 'w1' })
  assert.equal(result.ok, true)
  assert.equal(result.value.evidence.provenance, 'file-scan')
  assert.ok(result.value.evidence.diagnostics.some((item) => item.code === 'CLI_PARTIAL_DATA'))
  assert.equal(calls.some((argv) => argv.includes('../escape')), false)
  service.dispose()
})

test('Host adapter includes document freshness and client display metadata', async () => {
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: '你好', version: 'v1' },
    }),
  })
  const docs = await service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth' })
  const read = await service.readDocument({ workspaceId: 'w1', changeId: 'add-auth', documentId: docs.value.documents[0].id, displayLimit: 2 })
  assert.equal(read.ok, true)
  assert.equal(read.value.originalBytes, 6)
  assert.equal(read.value.returnedBytes, 6)
  assert.equal(read.value.displayLimit, 2)
  assert.equal(read.value.freshness, 'fresh')
  assert.equal(read.value.truncated, false)
  service.dispose()
})

test('Host adapter reports oversized content even when metadata underreports size', async () => {
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: 'x'.repeat(600000) },
    }),
  })
  const listed = await service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth' })
  assert.equal(listed.ok, true)
  const doc = listed.value.documents[0]
  const read = await service.readDocument({ workspaceId: 'w1', changeId: 'add-auth', documentId: doc.id })
  assert.equal(read.ok, false)
  assert.equal(read.error.code, 'DOCUMENT_TOO_LARGE')
  service.dispose()
})

test('Host adapter rejects symlink entries and oversized document content', async () => {
  const service = createOpenSpecService({
    workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] },
    fs: makeFs({
      'C:/repo/openspec': { type: 'directory' },
      'C:/repo/openspec/changes/add-auth/proposal.md': { content: 'x'.repeat(20) },
    }, {
      lstat: async (path) => path === 'openspec' ? { type: 'directory' } : path.endsWith('proposal.md') ? { type: 'symlink' } : { type: 'directory' },
    }),
  })
  const listed = await service.listDocuments({ workspaceId: 'w1', changeId: 'add-auth' })
  assert.equal(listed.ok, false)
  assert.equal(listed.error.code, 'CHANGE_NOT_FOUND')
  service.dispose()
})

test('Typert manifest uses strict zod v4 codecs', async () => {
  const { default: manifest } = await import('../lib/typert.host.js?test=' + Date.now())
  assert.equal(manifest.package, 'dsh-openspec-workbench')
  assert.equal(manifest.face, 'host')
  assert.ok(manifest.invocations.length >= 6)
  for (const item of manifest.invocations) {
    assert.equal(item.result.mode, 'strict')
    assert.ok(item.result.schema?._zod)
    assert.equal(typeof item.result.schema.parse, 'function')
  }
})

test('apply exposes the Host service and Typert binding without throwing', () => {
  const provided = new Map()
  const cleanups = []
  apply({
    workspaceRegistry: { list: () => [] },
    fs: makeFs({}),
    provide: (key, value) => provided.set(key, value),
    effect: (factory) => cleanups.push(factory()),
  })
  assert.ok(provided.has('openspecWorkbench'))
  assert.equal(provided.get('openspecWorkbench').typertRemote.serviceKey, 'openspecWorkbench')
  for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
})

test('Host adapter rejects unknown Workspace and change traversal', async () => {
  const service = createOpenSpecService({ workspaceRegistry: { list: () => [{ id: 'w1', title: 'Repo', path: 'C:/repo' }] }, fs: makeFs({}) })
  const unknown = await service.listChanges({ workspaceId: 'not-registered' })
  assert.equal(unknown.ok, false)
  const traversal = await service.listDocuments({ workspaceId: 'w1', changeId: '../secret' })
  assert.equal(traversal.ok, false)
  assert.equal(traversal.error.code, 'CHANGE_INVALID')
  service.dispose()
})
