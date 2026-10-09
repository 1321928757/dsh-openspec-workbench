import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import packageJson from '../package.json' with { type: 'json' }

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

function between(start, end) {
  const from = source.indexOf(start)
  assert.notEqual(from, -1, `missing ${start}`)
  const to = source.indexOf(end, from)
  assert.notEqual(to, -1, `missing ${end}`)
  return source.slice(from, to)
}

async function loadContribution({ withSettings = true } = {}) {
  let plugin
  let contribution
  const registrations = []
  const scope = { getSnapshot: () => ({ value: {}, writable: false }) }
  const slots = {
    inject: (_key, register) => register(),
    register: (descriptor, render) => { registrations.push({ descriptor, render }); return () => {} },
  }
  const remote = { $mount: async (value) => { contribution = value; return () => {} } }
  const react = { Component: class {}, createElement: (type, props, ...children) => ({ type, props, children }) }
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { plugin = entry.factory((id) => {
      if (id === 'react') return react
      throw new Error(`client-modules: require("${id}") missed the module table`)
    }) } } },
    document: undefined,
    console,
    Map,
    Set,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Error,
    Promise,
    AbortController,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
  }
  // Evaluate the actual dynamic browser module with only React available, then
  // mount against controlled Cordis facades to capture its real descriptors.
  Function(...Object.keys(sandbox), source)(...Object.values(sandbox))
  const locale = { register: () => () => {} }
  const context = {
    get: (key) => key === 'slots' ? slots : key === 'remote' ? remote : key === 'locale' ? locale : undefined,
    ...(withSettings ? { inject: (_keys, callback) => callback({ settingsScope: { bind: () => scope } }) } : {}),
    effect: () => {},
  }
  await plugin.apply(context)
  return { plugin, contribution, registrations }
}

test('client bundle registers a session-scoped OpenSpec conversation view', () => {
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, /id: 'dsh-openspec-workbench'/)
  assert.match(source, /slots\.inject\('conversation\.view'/)
  assert.match(source, /id: 'openspec-workbench'/)
  assert.match(source, /order: 30/)
  assert.doesNotMatch(source, /slots\.inject\('conversation\.session'/)
})

test('client preserves DSH shell ownership and supports Workspace/session snapshots', () => {
  assert.match(source, /useWorkspaces\(\(state\) => state\)/)
  assert.match(source, /useSessions\(\(state\) => state\)/)
  assert.match(source, /useSession\(\(state\) => state\)/)
  assert.doesNotMatch(source, /ctx\.get\('workspaces'\)/)
  assert.doesNotMatch(source, /ctx\.get\('sessions'\)/)
  assert.match(source, /sessionId = ''/)
  assert.doesNotMatch(source, /ctx\.get\('sessionId'\)/)
  assert.doesNotMatch(source, /ctx\.get\('sessionBinding'\)/)
  assert.doesNotMatch(source, /ctx\.get\('binding'\)/)
  assert.doesNotMatch(source, /sessionService\?\.sessionOf\?\.\(ctx\)/)
  assert.match(source, /sessionSnapshot/)
  assert.doesNotMatch(source, /sessionService\?\.scope\?\.\(sessionId\)/)
  assert.doesNotMatch(source, /scopedWorkspaceState/)
  assert.match(source, /workspaceState\?\.items \|\| workspaceState\?\.workspaces/)
  assert.match(source, /currentSessionId/)
  assert.match(source, /currentWorkspace/)
  assert.match(source, /workspacePath/)
})

test('client has independent request epochs and keeps stale data during refresh', () => {
  const workbench = between('function Workbench', 'function ChangeRow')
  assert.match(source, /requestRef = React\.useRef\(\{ projects: 0, changes: 0, documents: 0, document: 0 \}\)/)
  assert.match(workbench, /const request = \+\+requestRef\.current\.projects/)
  assert.match(workbench, /if \(request !== requestRef\.current\.projects\) return/)
  assert.match(workbench, /setStale\(Boolean\(projects\.length\)\)/)
  assert.match(workbench, /setStale\(false\)/)
  assert.match(workbench, /setSelectedWorkspaceId\(\(old\) => old \|\|/)
})

test('client starts scoped loading from the current Workspace and exposes timeout diagnostics', () => {
  const workbench = between('function Workbench', 'function ChangeRow')
  assert.match(source, /const RESOURCE_PHASES = \['loading', 'refreshing', 'success', 'empty', 'unavailable', 'error', 'timeout', 'stale'\]/)
  assert.match(workbench, /const initialWorkspaceId = workspaceKey\(initialWorkspace\) \|\| workspaceKey\(registered\[0\]\)/)
  assert.match(workbench, /listProjects', \{ workspaceId: requestWorkspaceId/)
  assert.match(workbench, /scope = filter === 'archived' \? 'archive'/)
  assert.match(workbench, /scope: 'targeted'/)
  assert.match(workbench, /cause\?\.message\?\.includes\('超时'\)/)
})

test('client computes visible changes before constructing resource data', () => {
  const changesLoader = between('const loadChanges', 'const loadDocuments')
  const activeVisible = changesLoader.indexOf("const activeVisible = filter === 'archived' ? [] : nextChanges")
  const resourceData = changesLoader.indexOf("const data = { items: activeVisible")
  assert.notEqual(activeVisible, -1)
  assert.notEqual(resourceData, -1)
  assert.ok(activeVisible < resourceData, 'activeVisible must be initialized before resource data')
})

test('client only surfaces actual diagnostics for an otherwise successful empty result', () => {
  const changesLoader = between('const loadChanges', 'const loadDocuments')
  assert.match(changesLoader, /setNotice\(result\?\.evidence\?\.diagnostics\?\.length \? result\.evidence\.diagnostics\.map\(/)
  assert.match(changesLoader, /join\('；'\) : null\)/)
  assert.match(source, /const changesEmpty = changesResource\.phase === 'empty'/)
  assert.match(source, /暂无活动 changes/)
  assert.doesNotMatch(changesLoader, /setNotice\([^)]*nextChanges\.length/)
})

test('client distinguishes completed filter-empty results from resource loading', () => {
  const workbench = between('function Workbench', 'function ChangeRow')
  const listContent = between('const listContent', 'const detailContent')
  assert.match(workbench, /const changesInitialLoading = \(changesResource\.phase === 'loading' \|\| changesResource\.phase === 'refreshing'\) && !changesHaveData/)
  assert.match(workbench, /const hasFilteredNoMatch = visibleChanges\.length > 0 && filtered\.length === 0/)
  assert.match(listContent, /const listContent = changesInitialLoading/)
  assert.match(listContent, /hasFilteredNoMatch \? '没有匹配结果'/)
  assert.match(listContent, /hasFilteredNoMatch \? '尝试调整搜索或筛选条件。'/)
  assert.doesNotMatch(listContent, /hasFilteredNoMatch[^\\n]*正在加载 changes/)
})

test('client keeps status and search filters local to the loaded change collection', () => {
  const workbench = between('function Workbench', 'function ChangeRow')
  assert.match(workbench, /const needle = query\.trim\(\)\.toLowerCase\(\)/)
  assert.match(workbench, /if \(filter !== 'all' && filter !== 'archived' && change\.status !== filter\) return false/)
  assert.match(workbench, /onClick: \(\) => setFilter\(id\)/)
  assert.match(workbench, /onChange: \(event\) => setQuery\(event\.target\.value\)/)
  assert.match(workbench, /const visibleChanges = React\.useMemo\(\(\) => filter === 'archived' \? archivedChanges : changes/)
})

test('client snapshot hydration and resource gates are bounded and identity-safe', () => {
  assert.match(source, /const snapshotStore = new Map\(\)/)
  assert.match(source, /const MAX_SNAPSHOTS = 8/)
  assert.match(source, /const MAX_CACHED_DOCUMENTS = 24/)
  assert.match(source, /snapshotStore\.size > MAX_SNAPSHOTS/)
  assert.match(source, /getWorkbenchSnapshot\(/)
  assert.match(source, /hydratedResource\(/)
  assert.match(source, /phase: hasData \? 'refreshing' : 'loading'/)
  assert.match(source, /\['context', 'ctx', 'Context', 'service', 'signal'/)
  assert.match(source, /filter === 'archived'/)
  assert.match(source, /projectsResource\.phase === 'empty'/)
  assert.match(source, /changesResource\.phase === 'empty'/)
})

test('client uses themed controls, quiet selection, short artifact labels and composite content keys', () => {
  assert.match(source, /\.oswb-select,\.oswb-sort,\.oswb-button/)
  assert.match(source, /\.oswb-sort-control:focus-within/)
  assert.match(source, /\.oswb-settings-toggle\{display:inline-flex;align-items:center/)
  assert.match(source, /\.oswb-row-selected\{border-color:var\(--dsw-alias-border-l2/)
  assert.match(source, /box-shadow:inset 2px 0/)
  assert.match(source, /function documentLabel\(document\)/)
  assert.match(source, /'aria-label': `\$\{documentLabel\(document\)\}：\$\{document\.path\}`/)
  assert.match(source, /function contentKeyFor\(workspaceId, changeName, documentId\)/)
  assert.match(source, /contentResource\?\.documentKey === contentKeyFor\(/)
  assert.match(source, /onRetryDocuments/)
  assert.match(source, /onRetryContent/)
})

test('client exposes status facets, source provenance, archive controls and safe document loading', () => {
  assert.match(source, /trackedTaskProgress/)
  assert.match(source, /cliTaskSummary/)
  assert.match(source, /applyProgress/)
  assert.match(source, /includeArchived/)
  assert.match(source, /显示归档/)
  assert.match(source, /provenanceLabel/)
  assert.match(source, /readDocument/)
  assert.match(source, /listDocuments/)
  assert.match(source, /role: 'alert'/)
})

test('client Markdown renderer treats content as text and caps input', () => {
  const markdown = between('function MarkdownView', 'class ErrorBoundary')
  assert.match(source, /const MAX_TEXT = 200000/)
  assert.match(markdown, /escapeText\(content\)\.split/)
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/)
  assert.match(markdown, /React\.createElement\('pre'/)
})

test('client Markdown renderer preserves task-list state and indentation', () => {
  const markdown = between('function MarkdownView', 'class ErrorBoundary')
  assert.match(markdown, /const item = line\.match\(\/\^\(\\s\*\)\[-\*\]\\s\+\(\?:\\\[\(\[ xX\]\)\\\]\\s\*\)\?\(\.\*\)\$\//)
  assert.match(markdown, /task: marker !== undefined/)
  assert.match(markdown, /checked: marker\?\.toLowerCase\(\) === 'x'/)
  assert.match(markdown, /Math\.floor\(item\[1\]\.length \/ 2\)/)
  assert.match(markdown, /if \(!item\.task\).*item\.text/)
  assert.match(markdown, /if \(code !== null\) \{ code\.push\(line\); return \}/)
  assert.match(markdown, /type: 'checkbox'/)
  assert.match(markdown, /checked: item\.checked/)
  assert.match(markdown, /disabled: true/)
  assert.match(markdown, /readOnly: true/)
  assert.match(markdown, /tabIndex: -1/)
  assert.match(markdown, /aria-label.*stateLabel/)
  assert.match(source, /\.oswb-task-checkbox\{width:14px;height:14px/)
})

test('client task preview remains read-only and does not add mutation RPCs', () => {
  const markdown = between('function MarkdownView', 'class ErrorBoundary')
  assert.doesNotMatch(markdown, /onChange:/)
  assert.doesNotMatch(markdown, /onClick:/)
  const methodMatch = source.match(/const RPC_METHODS = \[(.*?)\]/s)
  assert.deepEqual(methodMatch?.[1]?.replaceAll("'", '').split(', ').filter(Boolean), [
    'listProjects', 'listChanges', 'getChangeStatus', 'listDocuments', 'readDocument', 'getEvidence',
  ])
  assert.doesNotMatch(markdown, /writeDocument|updateTask|toggleTask|applyTask/)
})

test('client accessibility and responsive CSS contracts are namespaced', () => {
  assert.match(source, /\.oswb-root\{/)
  assert.match(source, /:focus-visible/)
  assert.match(source, /prefers-reduced-motion:reduce/)
  assert.match(source, /@container \(max-width:700px\)/)
  assert.match(source, /'aria-label': '选择 Workspace'/)
  assert.match(source, /'aria-label': '搜索 changes'/)
  assert.match(source, /'aria-pressed': selected/)
  assert.match(source, /role: 'tablist'/)
})

test('package metadata accepts DSH RC.2 and final 0.2.x but excludes 0.1.x and 0.3.x', () => {
  const expectedRange = '>=0.2.0-rc.2 <0.3.0'
  assert.equal(packageJson.version, '0.2.1')
  assert.equal(packageJson.engines.dsh, expectedRange)
  for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(range, expectedRange, `${name} must match engines.dsh`)
  }

  const satisfies = (version, range) => {
    const [lower, upper] = range.split(' <')
    const compare = (left, right) => {
      const parse = (value) => {
        const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/)
        assert.ok(match, `invalid test version: ${value}`)
        return match.slice(1).map((part, index) => index === 3 ? (part === undefined ? Number.POSITIVE_INFINITY : Number(part)) : Number(part || 0))
      }
      const a = parse(left), b = parse(right)
      for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
      return 0
    }
    return compare(version, lower.replace(/^>=/, '')) >= 0 && compare(version, upper) < 0
  }
  for (const version of ['0.2.0-rc.2', '0.2.0', '0.2.1', '0.2.99']) assert.equal(satisfies(version, expectedRange), true, version)
  for (const version of ['0.1.9', '0.2.0-rc.1', '0.3.0']) assert.equal(satisfies(version, expectedRange), false, version)
})

test('client has an ErrorBoundary class and remote mount is optional', () => {
  assert.match(source, /class ErrorBoundary extends React\.Component/)
  assert.match(source, /static getDerivedStateFromError\(error\)/)
  assert.match(source, /if \(!slots \|\| typeof slots\.inject !== 'function'/)
  assert.match(source, /if \(remote && typeof remote\.\$mount === 'function'\)/)
  assert.match(source, /Typert remote mount unavailable/)
})

test('client remote descriptors are dependency-free and match the six Host methods', async () => {
  const methodMatch = source.match(/const RPC_METHODS = \[(.*?)\]/s)
  const methods = methodMatch?.[1] || ''
  assert.deepEqual(methods.replaceAll("'", '').split(', ').filter(Boolean), [
    'listProjects', 'listChanges', 'getChangeStatus', 'listDocuments', 'readDocument', 'getEvidence',
  ])
  assert.match(source, /source: 'json'/)
  assert.match(source, /create: \(\) => \(\{/)
  assert.doesNotMatch(source, /require\(['"]zod['"]\)/)
  assert.match(source, /for \(let depth = 0; depth < 3; depth \+= 1\)/)
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(current, 'ok'\)/)
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(current, 'value'\)/)
  assert.match(source, /return current\[method\]\(args \|\| \{\}\)/)
  assert.match(source, /ctx\.get\('remote\.' \+ NS\)/)
  assert.doesNotMatch(source, /ctx\.get\('remote\.' \+ SERVICE\)/)

  const { contribution } = await loadContribution()
  assert.equal(contribution.package, 'dsh-openspec-workbench')
  assert.equal(contribution.descriptors.length, 6)
  for (const descriptor of contribution.descriptors) {
    assert.equal(descriptor.parameters.length, 1)
    assert.equal(descriptor.parameters[0].wire, 'args')
    for (const codec of [descriptor.parameters[0].codec, descriptor.result]) {
      assert.equal(typeof codec.create, 'function')
      assert.equal('schema' in codec, false)
      assert.deepEqual(codec.create().parse({ ok: true }), { ok: true })
      assert.throws(() => codec.create().parse([]), /invalid RPC value/)
    }
  }
  assert.match(source, /window\.__ModuleLoader__\.load\(\{\s*id: 'dsh-openspec-workbench'/)
})

test('client strict codec factories validate object DTOs and reject the schema-only legacy shape', async () => {
  const { contribution } = await loadContribution()
  assert.ok(contribution)
  const descriptor = contribution.descriptors[0]
  const codec = descriptor.result
  assert.deepEqual(codec.create().parse({ workspaceId: 'w1' }), { workspaceId: 'w1' })
  assert.throws(() => codec.create().parse(null), /invalid RPC value/)

  const legacy = { mode: 'strict', typeSymbol: 'dsh-openspec-workbench#Args', schema: { parse: (value) => value } }
  const validateCodec = (value, subject) => {
    if (value.mode !== 'strict') return
    if (typeof value.typeSymbol !== 'string' || !value.typeSymbol) throw new Error(`typert: ${subject} type symbol is invalid`)
    if (typeof value.create !== 'function') throw new Error(`typert: ${subject} strict codec has no create() factory`)
  }
  assert.throws(() => validateCodec(legacy, 'dsh-openspec-workbench#openspec-workbench/listProjects result'), /typert: dsh-openspec-workbench#openspec-workbench\/listProjects result strict codec has no create\(\) factory/)
})

test('client contributes settings through the DSH 0.2 Plugins tab with a stable id', async () => {
  const { registrations } = await loadContribution()
  const tab = registrations.find(({ descriptor }) => descriptor.name === 'settings.plugins.tab')
  assert.ok(tab)
  assert.equal(tab.descriptor.id, 'openspec-workbench')
  assert.equal(tab.descriptor.order, 80)
  assert.equal(tab.descriptor.label(), 'OpenSpec')
  assert.match(source, /ctx\.inject\?\.\(\['settingsScope'\]/)
  assert.doesNotMatch(source, /settings\.plugin\.item/)
})

test('client settings slot is optional and cannot block the main view', async () => {
  const { registrations } = await loadContribution({ withSettings: false })
  assert.ok(registrations.some(({ descriptor }) => descriptor.name === 'conversation.view'))
  assert.equal(registrations.some(({ descriptor }) => descriptor.name === 'settings.plugins.tab'), false)
})
