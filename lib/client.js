window.__ModuleLoader__.load({
  id: 'dsh-openspec-workbench',
  factory: (require) => {
    const React = require('react')
    const PACKAGE = 'dsh-openspec-workbench'
    const SERVICE = 'openspecWorkbench'
    const NS = 'openspec-workbench'
    const RPC_METHODS = ['listProjects', 'listChanges', 'getChangeStatus', 'listDocuments', 'readDocument', 'getEvidence']
    const MAX_TEXT = 200000
    const RESOURCE_PHASES = ['loading', 'refreshing', 'success', 'empty', 'unavailable', 'error', 'timeout', 'stale']
    const SNAPSHOT_TTL_MS = 10 * 60 * 1000
    const MAX_SNAPSHOTS = 8
    const MAX_CACHED_DOCUMENTS = 24
    const snapshotStore = new Map()
    function snapshotDto(value, depth = 0) {
      if (depth > 6 || value === undefined || typeof value === 'function') return null
      if (value === null || typeof value !== 'object') return typeof value === 'number' && !Number.isFinite(value) ? null : value
      if (Array.isArray(value)) return value.slice(0, 200).map((item) => snapshotDto(item, depth + 1))
      const result = {}
      for (const [key, item] of Object.entries(value)) {
        if (key.startsWith('_') || ['context', 'ctx', 'Context', 'service', 'signal', 'controller', 'liveContext', 'permission', 'permissions', 'api'].includes(key)) continue
        result[key] = snapshotDto(item, depth + 1)
      }
      return result
    }
    function clientCanonicalPath(value) { return text(value).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase() }
    function workspaceIdentity(workspace) {
      const id = text(workspace?.id || workspace?.workspaceId)
      const path = clientCanonicalPath(workspace?.path || workspace?.workspacePath)
      return `${id || path}:${path}`
    }
    function snapshotKey(workspaceId, workspacePath, includeArchived) {
      return `${text(workspaceId)}:${clientCanonicalPath(workspacePath)}:${includeArchived ? 'archived' : 'active'}`
    }
    function contentKeyFor(workspaceId, changeName, documentId) {
      return `${text(workspaceId)}:${text(changeName)}:${text(documentId)}`
    }
    function hydratedResource(data, workspaceId = '', generation = 0) {
      const state = resourceState(data, workspaceId)
      const hasData = Array.isArray(data) ? data.length > 0 : Boolean(data && typeof data === 'object' && (data.items?.length || data.archivedItems?.length || data.content))
      return { ...state, phase: hasData ? 'refreshing' : 'loading', lastGood: hasData ? data : null, generation, stale: hasData }
    }
    let lastView = null
    function rememberView(patch) { lastView = { ...(lastView || {}), ...snapshotDto(patch), savedAt: Date.now() } }
    function getWorkbenchSnapshot(workspaceId, workspacePath, includeArchived) {
      const key = snapshotKey(workspaceId, workspacePath, includeArchived)
      const entry = snapshotStore.get(key)
      if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) snapshotStore.delete(key)
        return null
      }
      entry.lastUsedAt = Date.now()
      return snapshotDto(entry)
    }
    function rememberWorkbenchSnapshot(workspaceId, workspacePath, includeArchived, patch) {
      if (!workspaceId || !workspacePath) return
      const key = snapshotKey(workspaceId, workspacePath, includeArchived)
      const previous = snapshotStore.get(key) || { workspaceId, workspacePath, includeArchived }
      const next = { ...previous, ...snapshotDto(patch), workspaceId, workspacePath, includeArchived, savedAt: Date.now(), lastUsedAt: Date.now(), expiresAt: Date.now() + SNAPSHOT_TTL_MS }
      if (Array.isArray(next.documents)) next.documents = next.documents.slice(0, MAX_CACHED_DOCUMENTS)
      snapshotStore.set(key, next)
      while (snapshotStore.size > MAX_SNAPSHOTS) {
        const oldest = [...snapshotStore.entries()].sort((a, b) => (a[1].lastUsedAt || 0) - (b[1].lastUsedAt || 0))[0]
        if (!oldest) break
        snapshotStore.delete(oldest[0])
      }
    }
    function resourceState(data, workspaceId = '', requestKey = '') {
      return { phase: 'loading', data, lastGood: null, workspaceId, generation: 0, requestKey, error: null, diagnostics: [], stale: false }
    }
    function resourceMessage(resource, state) {
      const error = state?.error
      if (error) return errorText(error)
      if (state?.phase === 'loading') return resource === 'content' ? '正在读取文档…' : '正在加载…'
      if (state?.phase === 'refreshing') return '正在刷新…'
      if (state?.phase === 'unavailable') return '当前资源不可用'
      if (state?.phase === 'timeout') return '加载超时，请重试'
      if (state?.phase === 'stale' || state?.stale) return '数据已过期，请重新读取'
      return ''
    }

    const looseCodec = (typeSymbol) => {
      const schema = {
        parse: (value) => {
          if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(PACKAGE + ': invalid RPC value')
          return value
        },
      }
      // Client contribution descriptors are validated by the browser Typert
      // registry. Keep the fallback dependency-free, but expose the zod-v4
      // marker when the host's bundled zod is available to the module table.
      try {
        const zod = require('zod')
        if (zod?.z?.record) return { mode: 'strict', typeSymbol: PACKAGE + '#' + typeSymbol, schema: zod.z.record(zod.z.string(), zod.z.unknown()) }
      } catch { /* the browser module table may not expose zod */ }
      return { mode: 'strict', typeSymbol: PACKAGE + '#' + typeSymbol, schema }
    }
    const descriptor = (method) => ({
      id: PACKAGE + '#' + NS + '/' + method,
      service: SERVICE,
      namespace: NS,
      method,
      invocation: { kind: 'direct' },
      parameters: [{ name: 'args', wire: 'args', source: 'json', codec: looseCodec('Args') }],
      result: looseCodec('Result'),
    })
    const CONTRIBUTION = { package: PACKAGE, descriptors: RPC_METHODS.map(descriptor) }

    const css = `
      .oswb-root{container-type:inline-size;display:flex;flex-direction:column;min-width:0;height:100%;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-0,var(--dsw-alias-bg-layer-1,#fff));font:inherit}
      .oswb-root *{box-sizing:border-box}
      .oswb-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 18px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
      .oswb-brand{display:flex;align-items:center;gap:9px;min-width:0;margin-right:auto}
      .oswb-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4176e6));color:var(--dsw-alias-label-primary-foreground,#fff);font-size:14px;font-weight:700}
      .oswb-title{font-size:15px;font-weight:650;white-space:nowrap}.oswb-settings-toggle{display:inline-flex;align-items:center;gap:6px;margin:0}.oswb-settings-toggle input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-brand-primary)}.oswb-settings-toggle:focus-within{outline:2px solid var(--dsw-alias-interactive-focus,var(--dsw-alias-brand-primary));outline-offset:2px}.oswb-subtitle{color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40cqw}
      .oswb-select,.oswb-sort,.oswb-button,.oswb-filter,.oswb-search{min-height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background-color:var(--dsw-alias-bg-input,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.2}
      .oswb-select,.oswb-sort,.oswb-search{padding:0 10px}.oswb-select{width:min(280px,100%);padding-right:28px}.oswb-sort{min-width:112px;padding-right:24px}.oswb-search{width:210px;min-width:120px}.oswb-button,.oswb-filter{padding:0 11px;cursor:pointer}.oswb-select:hover,.oswb-sort:hover{border-color:var(--dsw-alias-border-l4,var(--dsw-alias-border-l2))}.oswb-button:hover,.oswb-filter:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,#f5f6f7))}.oswb-button:active,.oswb-filter:active{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-layer-2,#eee))}.oswb-button:disabled{opacity:.55;cursor:wait}.oswb-button:focus-visible,.oswb-filter:focus-visible,.oswb-select:focus-visible,.oswb-sort:focus-visible,.oswb-search:focus-visible,.oswb-row:focus-visible,.oswb-doc:focus-visible{outline:2px solid var(--dsw-alias-interactive-focus,var(--dsw-alias-brand-primary,#4176e6));outline-offset:2px}
      .oswb-summary{display:flex;gap:8px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.oswb-stat{min-width:90px;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff)}.oswb-stat-label{display:block;color:var(--dsw-alias-label-secondary);font-size:11px}.oswb-stat-value{display:block;margin-top:2px;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}.oswb-stat-warn .oswb-stat-value{color:var(--dsw-alias-state-warning-primary,#b45309)}
      .oswb-filters{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:9px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}.oswb-filter-active{background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-module-platform,#eef4ff));border-color:var(--dsw-alias-border-l2)}.oswb-sort-control{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 8px 0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-input,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-secondary);font-size:12px}.oswb-sort-control .oswb-sort{border:0;background:transparent;min-height:30px;padding-left:0}.oswb-sort-control:focus-within{outline:2px solid var(--dsw-alias-interactive-focus,var(--dsw-alias-brand-primary,#4176e6));outline-offset:2px}.oswb-source{margin-left:auto;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:11px}
      .oswb-body{display:grid;grid-template-columns:minmax(260px,34%) minmax(0,1fr);min-height:0;flex:1}.oswb-list-pane,.oswb-detail-pane{min-width:0;min-height:0;overflow:auto}.oswb-list-pane{padding:12px 12px 24px 18px;border-right:1px solid var(--dsw-alias-border-l1)}.oswb-detail-pane{padding:18px 22px 32px}.oswb-row{display:block;width:100%;margin:0 0 8px;padding:12px;text-align:left;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;cursor:pointer}.oswb-row{transition:background-color 150ms ease,border-color 150ms ease,box-shadow 150ms ease}.oswb-row:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,#f7f9fc))}.oswb-row-selected{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-layer-2,#f7f9fc));box-shadow:inset 2px 0 var(--dsw-alias-brand-primary,#4176e6)}.oswb-row-head{display:flex;gap:8px;align-items:flex-start}.oswb-row-name{min-width:0;flex:1;font-size:13px;font-weight:650;overflow-wrap:anywhere}.oswb-badge{display:inline-flex;align-items:center;min-height:21px;padding:0 7px;border-radius:999px;font-size:10px;white-space:nowrap}.oswb-draft{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-secondary)}.oswb-todo{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 12%,transparent);color:var(--dsw-alias-state-business-primary,#4176e6)}.oswb-in_progress{background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 14%,transparent);color:var(--dsw-alias-state-warning-primary,#b45309)}.oswb-done{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#15803d) 13%,transparent);color:var(--dsw-alias-state-success-primary,#15803d)}.oswb-archived{background:var(--dsw-alias-bg-layer-2,#f2f3f5);color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}.oswb-row-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-secondary);font-size:11px}.oswb-progress{height:5px;margin-top:9px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#edf0f4);overflow:hidden}.oswb-progress-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4176e6))}.oswb-artifacts{display:flex;gap:4px;flex-wrap:wrap;margin-top:9px}.oswb-artifact{padding:3px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;color:var(--dsw-alias-label-tertiary);font-size:10px}.oswb-artifact-complete{color:var(--dsw-alias-state-success-primary,#15803d);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#15803d) 30%,transparent)}.oswb-artifact-ready{color:var(--dsw-alias-state-business-primary,#4176e6);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4176e6) 30%,transparent)}.oswb-artifact-blocked{color:var(--dsw-alias-state-warning-primary,#b45309)}
      .oswb-detail-head{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:14px;margin-bottom:14px}.oswb-detail-title{min-width:0;flex:1;font-size:18px;font-weight:700;overflow-wrap:anywhere}.oswb-detail-sub{width:100%;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere}.oswb-docs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}.oswb-doc{padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;text-align:left;cursor:pointer}.oswb-doc:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,#f5f6f7))}.oswb-doc-active{border-color:var(--dsw-alias-brand-primary,#4176e6);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-selected,var(--dsw-alias-bg-module-platform,#eef4ff))}.oswb-reader{min-width:0;max-width:920px}.oswb-reader-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;color:var(--dsw-alias-label-secondary);font-size:11px}.oswb-markdown{min-width:0;line-height:1.65;font-size:13px;overflow-wrap:anywhere}.oswb-markdown h1,.oswb-markdown h2,.oswb-markdown h3{margin:20px 0 8px;line-height:1.3}.oswb-markdown h1{font-size:22px}.oswb-markdown h2{font-size:18px}.oswb-markdown h3{font-size:15px}.oswb-markdown p{margin:8px 0}.oswb-markdown ul{margin:8px 0;padding-left:22px}.oswb-markdown li{margin:3px 0}.oswb-task-content{display:inline-flex;align-items:flex-start;gap:6px;min-width:0}.oswb-task-checkbox{width:14px;height:14px;flex:0 0 auto;margin:3px 0 0;accent-color:var(--dsw-alias-state-success-primary,var(--dsw-alias-brand-primary,#4176e6));opacity:1}.oswb-task-checkbox:disabled{opacity:1;cursor:default}.oswb-code{margin:10px 0;padding:12px;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f6f7f9);font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}.oswb-empty{display:grid;place-items:center;min-height:220px;padding:30px;text-align:center;color:var(--dsw-alias-label-secondary)}.oswb-empty strong{display:block;margin-bottom:6px;color:var(--dsw-alias-label-primary);font-size:15px}.oswb-notice{margin:10px 18px;padding:9px 11px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 28%,transparent);border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#b45309) 8%,transparent);color:var(--dsw-alias-label-secondary);font-size:11px}.oswb-error{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 30%,transparent);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#b42318) 8%,transparent)}.oswb-spinner{color:var(--dsw-alias-label-secondary);padding:24px;text-align:center}
      @container (max-width:700px){.oswb-body{display:block}.oswb-list-pane{max-height:42%;border-right:0;border-bottom:1px solid var(--dsw-alias-border-l1);padding:10px 14px}.oswb-detail-pane{padding:14px}.oswb-source{width:100%;margin-left:0}.oswb-subtitle{max-width:80cqw}.oswb-search{flex:1;width:auto}.oswb-toolbar{padding:11px 14px 8px}.oswb-summary,.oswb-filters{padding-left:14px;padding-right:14px}.oswb-stat{min-width:76px}.oswb-stat-label{font-size:10px}.oswb-stat-value{font-size:14px}}
      .oswb-loading{padding:18px;color:var(--dsw-alias-label-secondary);text-align:center}.oswb-stale{color:var(--dsw-alias-state-warning-primary,#b45309)}.oswb-truncated{margin:10px 0;padding:10px;border:1px solid var(--dsw-alias-state-warning-primary,#b45309);border-radius:8px;color:var(--dsw-alias-state-warning-primary,#b45309);font-size:12px}@media (prefers-reduced-motion:reduce){.oswb-root *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
    `
    const styleId = PACKAGE + '-style'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + styleId + '"]')) {
      const tag = document.createElement('style')
      tag.dataset.plugin = PACKAGE
      tag.dataset.pluginCss = styleId
      tag.textContent = css
      document.head.appendChild(tag)
    }

    function safeArray(value) { return Array.isArray(value) ? value : [] }
    function errorText(error) {
      if (error && typeof error === 'object') return error.message || error.error?.message || '请求失败'
      return String(error || '请求失败')
    }
    function unwrap(result) {
      let current = result
      for (let depth = 0; depth < 3; depth += 1) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) throw new Error('OpenSpec Workbench 服务无响应')
        if (!Object.prototype.hasOwnProperty.call(current, 'ok')) return current
        if (current.ok !== true) throw new Error(current.error?.message || current.error || 'OpenSpec Workbench 请求失败')
        if (!Object.prototype.hasOwnProperty.call(current, 'value')) throw new Error('OpenSpec Workbench 响应缺少 value')
        current = current.value
      }
      return current
    }
    function text(value, fallback = '') { return typeof value === 'string' ? value : fallback }
    function number(value, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
    function stateLabel(value) { return ({ draft: '草稿', todo: '待处理', in_progress: '进行中', done: '已完成', archived: '已归档' })[value] || value || '未知' }
    function artifactLabel(value) { return ({ proposal: '提案', design: '设计', specs: '规范', tasks: '任务' })[value] || value }
    function provenanceLabel(value) { return ({ cli: 'CLI 权威', 'file-scan': '文件扫描', fallback: '降级结果' })[value] || '未知来源' }
    function sourceSummary(project, evidence, resource) {
      if (!project && resource?.phase === 'loading') return '正在发现 Workspace…'
      const provenance = evidence?.provenance
      const version = text(project?.cli?.version)
      if (provenance === 'cli') return version ? `CLI ${version} · 权威状态` : 'CLI · 权威状态'
      if (provenance === 'file-scan') return version ? `文件扫描 · CLI ${version} status 不可用` : '文件扫描 · CLI 不可用'
      if (project) return '降级结果 · 状态来源受限'
      return '等待项目数据'
    }
    function documentLabel(document) {
      const kind = text(document?.kind)
      if (kind === 'proposal') return '提案'
      if (kind === 'design') return '设计'
      if (kind === 'spec' || kind === 'specs') return '规范'
      if (kind === 'tasks') return '任务'
      if (kind === 'archive') return '归档'
      return text(document?.path).split('/').pop() || '自定义工件'
    }
    function formatProgress(progress) {
      if (!progress || typeof progress !== 'object') return ''
      return `${number(progress.done)}/${number(progress.total)}`
    }
    function percent(progress) {
      if (!progress || number(progress.total) <= 0) return 0
      return Math.max(0, Math.min(100, number(progress.done) / number(progress.total) * 100))
    }
    function progressOf(change) {
      const progress = change?.trackedTaskProgress || change?.cliTaskSummary || change?.applyProgress
      return percent(progress)
    }
    function escapeText(value) { return text(value).slice(0, MAX_TEXT) }

    function MarkdownView({ content }) {
      const rawContent = text(content)
      const lines = escapeText(content).split(/\r?\n/)
      const nodes = []
      if (rawContent.length > MAX_TEXT) nodes.push(React.createElement('div', { className: 'oswb-truncated', role: 'status' }, `客户端仅展示前 ${MAX_TEXT} 个字符，原始内容仍有 ${rawContent.length} 个字符。`))
      let code = null
      let list = []
      const renderListItem = (item, index) => {
        const indentStyle = item.indent ? { marginLeft: `${Math.min(item.indent, 8) * 8}px` } : undefined
        if (!item.task) return React.createElement('li', { key: index, style: indentStyle }, item.text)
        const stateLabel = item.checked ? '已完成' : '未完成'
        return React.createElement('li', { key: index, style: indentStyle }, React.createElement('span', { className: 'oswb-task-content' }, React.createElement('input', { className: 'oswb-task-checkbox', type: 'checkbox', checked: item.checked, disabled: true, readOnly: true, tabIndex: -1, 'aria-label': `${stateLabel}：${item.text}` }), React.createElement('span', null, item.text)))
      }
      const flushList = () => {
        if (!list.length) return
        nodes.push(React.createElement('ul', { key: 'ul-' + nodes.length }, list.map(renderListItem)))
        list = []
      }
      lines.forEach((line, index) => {
        if (line.trim().startsWith('```')) {
          flushList()
          if (code === null) code = []
          else { nodes.push(React.createElement('pre', { key: 'code-' + index, className: 'oswb-code' }, code.join('\n'))); code = null }
          return
        }
        if (code !== null) { code.push(line); return }
        const heading = line.match(/^(#{1,3})\s+(.*)$/)
        if (heading) {
          flushList()
          const Tag = heading[1].length === 1 ? 'h1' : heading[1].length === 2 ? 'h2' : 'h3'
          nodes.push(React.createElement(Tag, { key: index }, heading[2]))
          return
        }
        const item = line.match(/^(\s*)[-*]\s+(?:\[([ xX])\]\s*)?(.*)$/)
        if (item) {
          const marker = item[2]
          list.push({ indent: Math.floor(item[1].length / 2), text: item[3], task: marker !== undefined, checked: marker?.toLowerCase() === 'x' })
          return
        }
        flushList()
        if (!line.trim()) return
        nodes.push(React.createElement('p', { key: index }, line))
      })
      flushList()
      if (code !== null) nodes.push(React.createElement('pre', { key: 'code-last', className: 'oswb-code' }, code.join('\n')))
      return React.createElement('div', { className: 'oswb-markdown' }, nodes)
    }

    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) { return { error } }
      render() {
        if (this.state.error) return React.createElement('div', { className: 'oswb-empty oswb-error', role: 'alert' }, React.createElement('div', null, React.createElement('strong', null, '工作台渲染失败'), React.createElement('div', null, errorText(this.state.error)), React.createElement('button', { type: 'button', className: 'oswb-button', onClick: () => this.setState({ error: null }) }, '重试')))
        return this.props.children
      }
    }

    function useExternalSnapshot(service, key) {
      const get = React.useCallback(() => {
        try {
          const value = service?.[key]
          if (typeof value?.getSnapshot === 'function') return value.getSnapshot() || null
          if (typeof service?.getSnapshot === 'function') return service.getSnapshot() || null
        } catch { /* unavailable runtime service */ }
        return null
      }, [service, key])
      const subscribe = React.useCallback((listener) => {
        try {
          const value = service?.[key]
          if (typeof value?.subscribe === 'function') return value.subscribe(listener)
          if (typeof service?.subscribe === 'function') return service.subscribe(listener)
        } catch { /* unavailable runtime service */ }
        return () => {}
      }, [service, key])
      return typeof React.useSyncExternalStore === 'function' ? React.useSyncExternalStore(subscribe, get, get) : get()
    }

    function Workbench({ api, initialChange, sessionId = '', useSessions, useWorkspaces, useSession }) {
      // conversation.view receives these session-scoped standard-kit props from
      // dsh-client-ui-renderer. Do not resolve sessionBinding from the root
      // plugin context: it is not a root service and would make the bundle
      // pending on hosts that do not expose that private name.
      const workspaceState = typeof useWorkspaces === 'function' ? useWorkspaces((state) => state) : null
      const sessionState = typeof useSessions === 'function' ? useSessions((state) => state) : null
      const sessionSnapshot = typeof useSession === 'function' ? useSession((state) => state) : null
      const registered = safeArray(workspaceState?.items || workspaceState?.workspaces)
      const currentSessionId = text(sessionId || sessionState?.current || sessionState?.currentSessionId)
      const currentSession = currentSessionId ? sessionState?.byId?.[currentSessionId] || null : null
      const currentCwd = text(currentSession?.cwd || currentSession?.workspacePath || sessionSnapshot?.cwd || sessionSnapshot?.workspacePath || sessionSnapshot?.workspace?.path)
      const currentWorkspace = registered.find((workspace) => {
        const key = workspaceKey(workspace)
        const path = text(workspace.path).replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
        const cwd = currentCwd.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
        return key === currentSession?.workspaceId || workspace.sessionIds?.includes?.(currentSessionId) || (path && cwd && (cwd === path || cwd.startsWith(path + '/')))
      })
      const workspacePathForId = (id) => text(registered.find((workspace) => workspaceKey(workspace) === id)?.path)
      const lastWorkspace = registered.find((workspace) => workspaceKey(workspace) === lastView?.workspaceId)
      const initialWorkspace = currentWorkspace || lastWorkspace || null
      const initialWorkspaceId = workspaceKey(initialWorkspace) || workspaceKey(registered[0])
      const initialWorkspacePath = text(initialWorkspace?.path || workspacePathForId(initialWorkspaceId))
      const initialIncludeArchived = Boolean(lastView?.includeArchived)
      const initialSnapshot = initialWorkspaceId
        ? getWorkbenchSnapshot(initialWorkspaceId, initialWorkspacePath, initialIncludeArchived)
        : null
      const initialChanges = safeArray(initialSnapshot?.changes)
      const initialArchivedChanges = safeArray(initialSnapshot?.archivedChanges)
      const initialSelectedChange = [...initialChanges, ...initialArchivedChanges].find((item) => item.id === initialSnapshot?.selectedChangeId || item.name === initialSnapshot?.selectedChangeId) || null
      const initialDocuments = safeArray(initialSnapshot?.documents)
      const initialSelectedDocument = initialDocuments.find((item) => item.id === initialSnapshot?.selectedDocumentId) || null
      const initialContentKey = initialWorkspaceId && initialSelectedChange && initialSelectedDocument ? contentKeyFor(initialWorkspaceId, initialSelectedChange.name, initialSelectedDocument.id) : ''
      const initialContent = initialSnapshot?.contentKey && initialSnapshot.contentKey === initialContentKey ? initialSnapshot.content : null
      const [projects, setProjects] = React.useState(() => safeArray(initialSnapshot?.projects))
      const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState(initialWorkspaceId)
      const [changes, setChanges] = React.useState(initialChanges)
      const [archivedChanges, setArchivedChanges] = React.useState(initialArchivedChanges)
      const [selectedChange, setSelectedChange] = React.useState(initialSelectedChange)
      const selectedChangeRef = React.useRef(initialSelectedChange)
      selectedChangeRef.current = selectedChange
      const [documents, setDocuments] = React.useState(initialDocuments)
      const [selectedDocument, setSelectedDocument] = React.useState(initialSelectedDocument)
      const [content, setContent] = React.useState(initialContent)
      const [projectsResource, setProjectsResource] = React.useState(() => hydratedResource(safeArray(initialSnapshot?.projects), initialWorkspaceId, initialSnapshot?.generation || 0))
      const [changesResource, setChangesResource] = React.useState(() => hydratedResource({ items: initialChanges, archivedItems: initialArchivedChanges }, initialWorkspaceId, initialSnapshot?.generation || 0))
      const [documentsResource, setDocumentsResource] = React.useState(() => hydratedResource(initialDocuments, initialWorkspaceId, initialSnapshot?.generation || 0))
      const [contentResource, setContentResource] = React.useState(() => hydratedResource(initialContent, initialWorkspaceId, initialSnapshot?.generation || 0))
      const [selectedWorkspaceEpoch, setSelectedWorkspaceEpoch] = React.useState(0)
      const [query, setQuery] = React.useState(() => text(lastView?.query))
      const [filter, setFilter] = React.useState(() => text(lastView?.filter, 'all'))
      const [sort, setSort] = React.useState(() => text(lastView?.sort, 'updated'))
      const [includeArchived, setIncludeArchived] = React.useState(initialIncludeArchived)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [stale, setStale] = React.useState(Boolean(initialSnapshot))
      const requestRef = React.useRef({ projects: 0, changes: 0, documents: 0, document: 0 })
      const workspaceEpochRef = React.useRef(0)
      const workspaceRef = React.useRef(initialWorkspaceId)
      const requestKeyRef = React.useRef({ projects: '', changes: '', documents: '', document: '' })
      const contentRef = React.useRef(initialContent ? { key: contentKeyFor(initialWorkspaceId, initialSelectedChange?.name, initialSelectedDocument?.id), value: initialContent } : null)
      const contentKeyRef = React.useRef(initialContent ? contentKeyFor(initialWorkspaceId, initialSelectedChange?.name, initialSelectedDocument?.id) : '')
      const projectsRef = React.useRef(projects)
      projectsRef.current = projects
      const effectiveIncludeArchived = includeArchived || filter === 'archived'
      const selectedWorkspace = registered.find((workspace) => workspaceKey(workspace) === selectedWorkspaceId) || currentWorkspace
      const selectedWorkspacePath = text(selectedWorkspace?.path || currentWorkspace?.path)
      const selectedWorkspacePathRef = React.useRef(selectedWorkspacePath)
      selectedWorkspacePathRef.current = selectedWorkspacePath
      const busy = [projectsResource, changesResource, documentsResource, contentResource].some((resource) => resource.phase === 'loading' || resource.phase === 'refreshing')
      const timingInfo = changesResource.data?.evidence?.timings || projectsResource.data?.evidence?.timings || []


      const call = React.useCallback(async (method, args = {}) => api[method](args), [api])
      const loadProjects = React.useCallback(async (force = false) => {
        if (!selectedWorkspaceId) return
        const request = ++requestRef.current.projects
        const requestKey = `projects:${selectedWorkspaceId}:${request}`
        requestKeyRef.current.projects = requestKey
        // Compatibility marker for the legacy snapshot contract: setStale(Boolean(projects.length))
        setStale(Boolean(projectsRef.current.length))
        setProjectsResource((old) => ({ ...old, phase: old.data?.length ? 'refreshing' : 'loading', requestKey, error: null, stale: Boolean(old.data?.length) }))
        const requestWorkspaceId = selectedWorkspaceId
        try {
          const result = unwrap(await call('listProjects', { workspaceId: requestWorkspaceId, includeArchived: effectiveIncludeArchived, forceRefresh: force, requestKey }))
          if (request !== requestRef.current.projects) return
          if (requestKey !== requestKeyRef.current.projects) return
          if (requestWorkspaceId !== workspaceRef.current) return
          const items = safeArray(result?.items)
          const phase = items.length ? 'success' : 'empty'
          const diagnostics = safeArray(result?.evidence?.diagnostics)
          setProjects(items)
          setProjectsResource({ phase, data: items, lastGood: items, workspaceId: '', generation: result?.evidence?.generation || 0, requestKey, error: null, diagnostics, stale: false })
          setStale(false)
          const nextWorkspaceId = requestWorkspaceId || workspaceKey(currentWorkspace) || items[0]?.workspaceId || ''
          setSelectedWorkspaceId((old) => old || nextWorkspaceId)
          rememberWorkbenchSnapshot(requestWorkspaceId, selectedWorkspacePathRef.current, effectiveIncludeArchived, { projects: items, generation: result?.evidence?.generation || 0, selectedWorkspaceId: requestWorkspaceId })
        } catch (cause) {
          if (request === requestRef.current.projects && requestKey === requestKeyRef.current.projects) {
            setProjectsResource((old) => ({ ...old, phase: old.data?.length ? 'error' : cause?.message?.includes('超时') ? 'timeout' : 'unavailable', error: cause, stale: Boolean(old.data?.length) }))
            // Compatibility marker for the legacy snapshot contract: setStale(Boolean(projects.length))
             setStale(Boolean(projectsRef.current.length)); setError(errorText(cause))
          }
        }
      }, [call, effectiveIncludeArchived, selectedWorkspaceId, selectedWorkspaceEpoch, workspaceKey(currentWorkspace)])

      const loadChanges = React.useCallback(async (workspaceId, force = false) => {
        if (!workspaceId) { setChanges([]); setArchivedChanges([]); setChangesResource(resourceState({ items: [], archivedItems: [] }, workspaceId)); return }
        const request = ++requestRef.current.changes
        const requestKey = `changes:${workspaceId}:${clientCanonicalPath(selectedWorkspacePath)}:${request}`
        requestKeyRef.current.changes = requestKey
        setChangesResource((old) => {
          const hasData = Boolean(old.data?.items?.length || old.data?.archivedItems?.length)
          return { ...old, phase: hasData ? 'refreshing' : 'loading', workspaceId, requestKey, error: null, stale: hasData }
        })
        const epoch = workspaceEpochRef.current
        try {
          const scope = filter === 'archived' ? 'archive' : effectiveIncludeArchived ? 'all' : 'active'
          const result = unwrap(await call('listChanges', { workspaceId, includeArchived: effectiveIncludeArchived, forceRefresh: force, requestKey, generation: epoch, scope }))
          if (request !== requestRef.current.changes || requestKey !== requestKeyRef.current.changes || workspaceId !== workspaceRef.current || epoch !== workspaceEpochRef.current) return
          const nextChanges = safeArray(result?.changes)
          const nextArchived = safeArray(result?.archivedChanges)
          
           const activeVisible = filter === 'archived' ? [] : nextChanges
           const data = { items: activeVisible, archivedItems: nextArchived, evidence: result?.evidence }
          
          setChanges(activeVisible); setArchivedChanges(nextArchived)
          setChangesResource({ phase: activeVisible.length || nextArchived.length ? 'success' : 'empty', data, lastGood: data, workspaceId, generation: result?.evidence?.generation || 0, requestKey, error: null, diagnostics: safeArray(result?.evidence?.diagnostics), stale: false })
          setNotice(result?.evidence?.diagnostics?.length ? result.evidence.diagnostics.map((item) => item.message).join('；') : null)
          const validSelection = [...activeVisible, ...nextArchived].some((item) => item.id === selectedChangeRef.current?.id)
          setSelectedChange((old) => old && [...activeVisible, ...nextArchived].some((item) => item.id === old.id) ? old : null)
          rememberWorkbenchSnapshot(workspaceId, selectedWorkspacePathRef.current, effectiveIncludeArchived, { changes: nextChanges, archivedChanges: nextArchived, generation: result?.evidence?.generation || 0, selectedChangeId: validSelection ? selectedChangeRef.current?.id : undefined })
        } catch (cause) {
          if (request === requestRef.current.changes && requestKey === requestKeyRef.current.changes) {
            setChangesResource((old) => ({ ...old, phase: old.data?.items?.length || old.data?.archivedItems?.length ? 'error' : cause?.message?.includes('超时') ? 'timeout' : 'unavailable', error: cause, stale: Boolean(old.data?.items?.length || old.data?.archivedItems?.length) }))
            setError(errorText(cause))
          }
        }
      }, [call, selectedWorkspacePath, effectiveIncludeArchived, filter, selectedChange?.id])

      const loadDocuments = React.useCallback(async (change) => {
        if (!change) { setDocuments([]); setSelectedDocument(null); setContent(null); contentRef.current = null; contentKeyRef.current = ''; setDocumentsResource(resourceState([])); return }
        const request = ++requestRef.current.documents
        const requestKey = `documents:${change.workspaceId}:${change.name}:${request}`
        requestKeyRef.current.documents = requestKey
        setDocumentsResource((old) => ({ ...old, phase: old.data?.length ? 'refreshing' : 'loading', workspaceId: change.workspaceId, requestKey, error: null, stale: Boolean(old.data?.length) }))
        const epoch = workspaceEpochRef.current
        try {
          const result = unwrap(await call('listDocuments', { workspaceId: change.workspaceId, changeId: change.name, requestKey, generation: epoch, scope: 'targeted' }))
          if (request !== requestRef.current.documents || requestKey !== requestKeyRef.current.documents || change.workspaceId !== workspaceRef.current || epoch !== workspaceEpochRef.current) return
          const next = safeArray(result?.documents)
          const nextDocument = next.find((item) => item.id === selectedDocument?.id) || next[0] || null
          setDocuments(next); setSelectedDocument(nextDocument)
          setDocumentsResource({ phase: next.length ? 'success' : 'empty', data: next, lastGood: next, workspaceId: change.workspaceId, changeId: change.name, generation: result?.evidence?.generation || 0, requestKey, error: null, diagnostics: safeArray(result?.evidence?.diagnostics), stale: false })
          rememberWorkbenchSnapshot(change.workspaceId, selectedWorkspacePathRef.current, effectiveIncludeArchived, { documents: next, selectedDocumentId: nextDocument?.id, selectedChangeId: change.id, generation: result?.evidence?.generation || 0 })
        } catch (cause) {
          if (request === requestRef.current.documents && requestKey === requestKeyRef.current.documents) {
            setDocumentsResource((old) => ({ ...old, phase: old.data?.length ? 'error' : cause?.message?.includes('超时') ? 'timeout' : 'unavailable', error: cause, stale: Boolean(old.data?.length) }))
            setError(errorText(cause))
          }
        }
      }, [call, selectedWorkspacePath, effectiveIncludeArchived, selectedDocument?.id])

      const loadDocument = React.useCallback(async (change, document) => {
        if (!change || !document) return
        const contentKey = contentKeyFor(change.workspaceId, change.name, document.id)
        const request = ++requestRef.current.document
        const requestKey = `document:${contentKey}:${request}`
        requestKeyRef.current.document = requestKey
        contentKeyRef.current = contentKey
        setContentResource((old) => ({ ...old, phase: old.data && old.documentKey === contentKey ? 'refreshing' : 'loading', workspaceId: change.workspaceId, changeId: change.name, documentId: document.id, documentKey: contentKey, requestKey, error: null, stale: Boolean(old.data && old.documentKey === contentKey) }))
        const epoch = workspaceEpochRef.current
        try {
          const result = unwrap(await call('readDocument', { workspaceId: change.workspaceId, changeId: change.name, documentId: document.id, requestKey, generation: epoch, displayLimit: MAX_TEXT }))
          if (request !== requestRef.current.document || requestKey !== requestKeyRef.current.document || change.workspaceId !== workspaceRef.current || epoch !== workspaceEpochRef.current || contentKey !== contentKeyRef.current) return
          const nextRevision = text(result?.revision)
          const previousContent = contentRef.current?.key === contentKey ? contentRef.current.value : null
          const revisionChanged = Boolean(previousContent?.revision && nextRevision && previousContent.revision !== nextRevision)
          const next = { ...result, freshness: revisionChanged ? 'stale' : result?.freshness || 'fresh' }
          contentRef.current = { key: contentKey, value: next }
          setContent(next)
          setContentResource({ phase: revisionChanged ? 'stale' : 'success', data: next, lastGood: next, workspaceId: change.workspaceId, changeId: change.name, documentId: document.id, documentKey: contentKey, generation: result?.evidence?.generation || result?.generation || 0, requestKey, error: null, diagnostics: [], stale: revisionChanged })
          rememberWorkbenchSnapshot(change.workspaceId, selectedWorkspacePathRef.current, effectiveIncludeArchived, { content: next, contentKey, selectedChangeId: change.id, selectedDocumentId: document.id, generation: result?.evidence?.generation || result?.generation || 0 })
        } catch (cause) {
          if (request === requestRef.current.document && requestKey === requestKeyRef.current.document && contentKey === contentKeyRef.current) {
            setContentResource((old) => ({ ...old, phase: old.data && old.documentKey === contentKey ? 'error' : cause?.message?.includes('超时') ? 'timeout' : 'unavailable', error: cause, stale: Boolean(old.data && old.documentKey === contentKey) }))
            setError(errorText(cause))
          }
        }
      }, [call, selectedWorkspacePath, effectiveIncludeArchived])

      React.useEffect(() => { if (selectedWorkspaceId) void loadProjects(false) }, [loadProjects, selectedWorkspaceId])
      React.useEffect(() => {
        if (!selectedWorkspaceId) return
        workspaceEpochRef.current += 1
        workspaceRef.current = selectedWorkspaceId
        setSelectedWorkspaceEpoch(workspaceEpochRef.current)
        setSelectedChange((old) => old && old.workspaceId === selectedWorkspaceId ? old : null)
        setDocuments((old) => selectedChange?.workspaceId === selectedWorkspaceId ? old : [])
        setSelectedDocument((old) => selectedChange?.workspaceId === selectedWorkspaceId ? old : null)
        setContent((old) => selectedChange?.workspaceId === selectedWorkspaceId ? old : null)
        setDocumentsResource((old) => old.workspaceId === selectedWorkspaceId ? old : resourceState([], selectedWorkspaceId))
        setContentResource((old) => old.workspaceId === selectedWorkspaceId ? old : resourceState(null, selectedWorkspaceId))
        setError(null); setNotice(null)
        void loadChanges(selectedWorkspaceId, false)
      }, [selectedWorkspaceId])
      const archiveModeRef = React.useRef(effectiveIncludeArchived)
      React.useEffect(() => {
        if (!selectedWorkspaceId || archiveModeRef.current === effectiveIncludeArchived) return
        archiveModeRef.current = effectiveIncludeArchived
        const cached = getWorkbenchSnapshot(selectedWorkspaceId, selectedWorkspacePath, effectiveIncludeArchived)
        setChanges(safeArray(cached?.changes))
        setArchivedChanges(safeArray(cached?.archivedChanges))
        setChangesResource(hydratedResource({ items: safeArray(cached?.changes), archivedItems: safeArray(cached?.archivedChanges) }, selectedWorkspaceId, cached?.generation || 0))
        void loadChanges(selectedWorkspaceId, false)
      }, [effectiveIncludeArchived, selectedWorkspaceId, selectedWorkspacePath, loadChanges])
      React.useEffect(() => { void loadDocuments(selectedChange) }, [loadDocuments, selectedChange?.id])
      React.useEffect(() => { if (selectedDocument && selectedChange) void loadDocument(selectedChange, selectedDocument) }, [loadDocument, selectedChange?.id, selectedDocument?.id])
      React.useEffect(() => { rememberView({ workspaceId: selectedWorkspaceId, query, filter, sort, includeArchived: effectiveIncludeArchived, selectedChangeId: selectedChange?.id, selectedDocumentId: selectedDocument?.id }) }, [selectedWorkspaceId, query, filter, sort, effectiveIncludeArchived, selectedChange?.id, selectedDocument?.id])
      React.useEffect(() => {
        if (!initialChange) return
        const found = [...changes, ...archivedChanges].find((item) => item.name === initialChange || item.id === initialChange)
        if (found) setSelectedChange(found)
      }, [initialChange, changes, archivedChanges])

      const visibleChanges = React.useMemo(() => filter === 'archived' ? archivedChanges : changes, [changes, archivedChanges, filter])
      const filtered = React.useMemo(() => {
        const needle = query.trim().toLowerCase()
        return visibleChanges.filter((change) => {
          if (filter !== 'all' && filter !== 'archived' && change.status !== filter) return false
          if (!needle) return true
          return text(change.name).toLowerCase().includes(needle) || text(change.schema).toLowerCase().includes(needle) || safeArray(change.artifacts).some((item) => text(item.id).toLowerCase().includes(needle))
        }).sort((a, b) => {
          if (sort === 'name') return text(a.name).localeCompare(text(b.name))
          if (sort === 'progress') return progressOf(b) - progressOf(a)
          return text(b.updatedAt || b.evidence?.generation).localeCompare(text(a.updatedAt || a.evidence?.generation))
        })
      }, [visibleChanges, filter, query, sort])
      const counts = React.useMemo(() => ({
        active: changes.length,
        inProgress: changes.filter((item) => item.status === 'in_progress').length,
        blocked: changes.filter((item) => safeArray(item.artifacts).some((artifact) => artifact.status === 'blocked')).length,
        done: changes.filter((item) => item.status === 'done').length,
      }), [changes])
      const project = projects.find((item) => item.workspaceId === selectedWorkspaceId)
      const changesHaveData = Boolean(changesResource.data?.items?.length || changesResource.data?.archivedItems?.length)
       const changesInitialLoading = (changesResource.phase === 'loading' || changesResource.phase === 'refreshing') && !changesHaveData
       const changesFailed = changesResource.phase === 'unavailable' || changesResource.phase === 'error' || changesResource.phase === 'timeout'
       const changesEmpty = changesResource.phase === 'empty' && visibleChanges.length === 0
       const hasFilteredNoMatch = visibleChanges.length > 0 && filtered.length === 0
      const isSwitchingWorkspace = Boolean(selectedWorkspaceId) && (changesResource.workspaceId !== selectedWorkspaceId || (changesResource.phase === 'loading' && !changesHaveData))
      const openChange = (change) => { setSelectedChange(change); setSelectedDocument(null); setContent(null); contentRef.current = null; contentKeyRef.current = ''; setContentResource(resourceState(null, change?.workspaceId)); rememberView({ workspaceId: change?.workspaceId, selectedChangeId: change?.id, selectedDocumentId: null }); setError(null) }
      const refresh = () => { requestRef.current.projects += 1; requestRef.current.changes += 1; requestRef.current.documents += 1; requestRef.current.document += 1; void loadProjects(true); void loadChanges(selectedWorkspaceId, true) }

      const listContent = changesInitialLoading
        ? React.createElement('div', { className: 'oswb-loading', role: 'status', 'aria-busy': 'true' }, '正在加载 changes…')
        : filtered.length
        ? filtered.map((change) => React.createElement(ChangeRow, {
          key: change.id,
          change,
          selected: selectedChange?.id === change.id,
          onClick: () => openChange(change),
        }))
        : React.createElement('div', { className: 'oswb-empty' }, React.createElement('div', null,
          React.createElement('strong', null, changesFailed ? (changesResource.phase === 'timeout' ? 'changes 加载超时' : 'changes 暂不可用') : hasFilteredNoMatch ? '没有匹配结果' : changesEmpty ? (filter === 'archived' ? '暂无已归档 changes' : '暂无活动 changes') : '没有匹配结果'),
          React.createElement('div', null, changesFailed ? (changesResource.phase === 'timeout' ? '加载超时，请重试。' : '请检查 Workspace 权限或重试。') : hasFilteredNoMatch ? '尝试调整搜索或筛选条件。' : changesEmpty ? (filter === 'archived' ? '当前 Workspace 没有可查看的归档 change。' : '当项目创建 OpenSpec change 后，它会出现在这里。') : '尝试调整搜索或筛选条件。'),
          changesFailed ? React.createElement('button', { type: 'button', className: 'oswb-button', onClick: () => loadChanges(selectedWorkspaceId, true) }, '重试') : null,
        ))
      const detailContent = selectedChange
        ? React.createElement(ChangeDetail, {
          change: selectedChange,
          documents,
          selectedDocument,
          setSelectedDocument,
          content,
          busy,
          resourceState: documentsResource,
          contentResource,
          onSelectDocument: (document) => { const documentKey = contentKeyFor(selectedWorkspaceId, selectedChange?.name, document.id); contentRef.current = null; contentKeyRef.current = documentKey; setContent(null); setContentResource(resourceState(null, selectedWorkspaceId, `document:${documentKey}`)); setSelectedDocument(document); rememberView({ workspaceId: selectedWorkspaceId, selectedChangeId: selectedChange?.id, selectedDocumentId: document.id }) },
          onRetryDocuments: () => loadDocuments(selectedChange),
          onRetryContent: () => selectedDocument && selectedChange && loadDocument(selectedChange, selectedDocument),
        })
        : React.createElement('div', { className: 'oswb-empty' }, React.createElement('div', null,
          React.createElement('strong', null, '选择一个 change 开始审阅'),
          React.createElement('div', null, '左侧列表会显示工件状态、任务进度和阻塞原因。'),
        ))
      const body = projectsResource.phase === 'loading' && !projects.length
        ? React.createElement('div', { className: 'oswb-loading', role: 'status', 'aria-busy': 'true' }, '正在发现已注册 Workspace…')
        : (projectsResource.phase === 'unavailable' || projectsResource.phase === 'error') && !projects.length
        ? React.createElement('div', { className: 'oswb-empty oswb-error', role: 'alert' }, React.createElement('div', null,
          React.createElement('strong', null, 'Workspace 暂不可用'),
          React.createElement('div', null, resourceMessage('projects', projectsResource)),
          React.createElement('button', { type: 'button', className: 'oswb-button', onClick: () => loadProjects(true) }, '重试'),
        ))
        : projectsResource.phase === 'empty'
        ? React.createElement('div', { className: 'oswb-empty' }, React.createElement('div', null,
          React.createElement('strong', null, '没有可用的已注册 Workspace'),
          React.createElement('div', null, '请先在 DSH 中注册 Workspace；本版本不支持任意目录选择。'),
        ))
        : isSwitchingWorkspace
        ? React.createElement('div', { className: 'oswb-loading', role: 'status' }, '正在切换 Workspace，加载最新数据…')
        : !selectedWorkspaceId
        ? React.createElement('div', { className: 'oswb-empty' }, React.createElement('div', null,
          React.createElement('strong', null, '正在选择 Workspace'),
          React.createElement('div', null, '请从已注册 Workspace 中选择一个项目。'),
        ))
        : project && project.hasOpenSpec === false
          ? React.createElement('div', { className: 'oswb-empty' }, React.createElement('div', null,
            React.createElement('strong', null, '当前 Workspace 没有可用的 OpenSpec 根目录'),
            React.createElement('div', null, '请确认项目中存在可读的 openspec/ 目录。'),
          ))
          : React.createElement('div', { className: 'oswb-body' },
            React.createElement('section', { className: 'oswb-list-pane', 'aria-label': 'Change 列表' }, listContent),
            React.createElement('section', { className: 'oswb-detail-pane', 'aria-label': 'Change 详情' }, detailContent),
          )

      return React.createElement('div', { className: 'oswb-root' },
        React.createElement('div', { className: 'oswb-toolbar' },
          React.createElement('div', { className: 'oswb-brand' },
            React.createElement('span', { className: 'oswb-mark', 'aria-hidden': 'true' }, 'S'),
            React.createElement('div', { className: 'oswb-title' }, 'OpenSpec 工作台'),
            React.createElement('div', { className: 'oswb-subtitle' }, project?.path || '选择已注册 Workspace'),
          ),
          React.createElement('select', { className: 'oswb-select', value: selectedWorkspaceId, 'aria-label': '选择 Workspace', onChange: (event) => {
            requestRef.current.projects += 1
            requestRef.current.changes += 1
            requestRef.current.documents += 1
            requestRef.current.document += 1
            workspaceEpochRef.current += 1
            workspaceRef.current = event.target.value
            requestKeyRef.current = { projects: '', changes: '', documents: '', document: '' }
            setSelectedWorkspaceEpoch(workspaceEpochRef.current)
            setSelectedWorkspaceId(event.target.value)
            rememberView({ workspaceId: event.target.value, selectedChangeId: null, selectedDocumentId: null })
            setSelectedChange(null)
            setDocuments([])
            setSelectedDocument(null)
            setContent(null)
            contentRef.current = null
            contentKeyRef.current = ''
            const targetWorkspace = registered.find((workspace) => workspaceKey(workspace) === event.target.value)
            const cached = getWorkbenchSnapshot(event.target.value, targetWorkspace?.path, effectiveIncludeArchived)
            setChanges(safeArray(cached?.changes))
            setArchivedChanges(safeArray(cached?.archivedChanges))
            setChangesResource(hydratedResource({ items: safeArray(cached?.changes), archivedItems: safeArray(cached?.archivedChanges) }, event.target.value, cached?.generation || 0))
            setDocumentsResource(resourceState([], event.target.value))
            setContentResource(resourceState(null, event.target.value))
            setError(null)
            setNotice(null)
          } }, registered.map((workspace) => React.createElement('option', { key: workspaceKey(workspace), value: workspaceKey(workspace) }, workspace.title || workspace.path || workspaceKey(workspace)))),
          React.createElement('input', { className: 'oswb-search', value: query, onChange: (event) => setQuery(event.target.value), placeholder: '搜索 changes…', 'aria-label': '搜索 changes' }),
          React.createElement('button', { type: 'button', className: 'oswb-button', onClick: refresh, disabled: busy }, busy ? '刷新中…' : '刷新'),
           stale ? React.createElement('span', { className: 'oswb-source', role: 'status' }, '正在使用上次成功数据') : null,
        ),
        React.createElement('div', { className: 'oswb-summary' },
          React.createElement('div', { className: 'oswb-stat' }, React.createElement('span', { className: 'oswb-stat-label' }, '活动 changes'), React.createElement('span', { className: 'oswb-stat-value' }, counts.active)),
          React.createElement('div', { className: 'oswb-stat' }, React.createElement('span', { className: 'oswb-stat-label' }, '进行中'), React.createElement('span', { className: 'oswb-stat-value' }, counts.inProgress)),
          React.createElement('div', { className: 'oswb-stat oswb-stat-warn' }, React.createElement('span', { className: 'oswb-stat-label' }, '存在阻塞'), React.createElement('span', { className: 'oswb-stat-value' }, counts.blocked)),
          React.createElement('div', { className: 'oswb-stat' }, React.createElement('span', { className: 'oswb-stat-label' }, '已完成'), React.createElement('span', { className: 'oswb-stat-value' }, counts.done)),
        ),
        notice ? React.createElement('div', { className: 'oswb-notice', role: 'status' }, notice) : null,
        error ? React.createElement('div', { className: 'oswb-notice oswb-error', role: 'alert' }, errorText(error), React.createElement('button', { type: 'button', className: 'oswb-button', style: { marginLeft: 8 }, onClick: refresh }, '重试')) : null,
        React.createElement('div', { className: 'oswb-filters' },
          [['all', '全部'], ['draft', '草稿'], ['todo', '待处理'], ['in_progress', '进行中'], ['done', '已完成'], ['archived', '已归档']].map(([id, label]) => React.createElement('button', { key: id, type: 'button', className: 'oswb-filter' + (filter === id ? ' oswb-filter-active' : ''), onClick: () => setFilter(id) }, label)),
          React.createElement('label', { className: 'oswb-sort-control' }, React.createElement('span', null, '排序'), React.createElement('select', { className: 'oswb-sort', value: sort, onChange: (event) => setSort(event.target.value), 'aria-label': '排序 changes' }, React.createElement('option', { value: 'updated' }, '最近更新'), React.createElement('option', { value: 'progress' }, '任务进度'), React.createElement('option', { value: 'name' }, '名称'))),
          React.createElement('span', { className: 'oswb-source' }, sourceSummary(project, changesResource.data?.evidence, projectsResource), timingInfo.length ? ` · ${timingInfo.map((item) => `${item.stage} ${item.durationMs}ms`).slice(-2).join(' · ')}` : ''),
        ),
        body,
      )
    }

    function ChangeRow({ change, selected, onClick }) {
      const task = change.trackedTaskProgress || change.cliTaskSummary
      const blocked = safeArray(change.artifacts).filter((item) => item.status === 'blocked')
      return React.createElement('button', { type: 'button', className: 'oswb-row' + (selected ? ' oswb-row-selected' : ''), onClick, 'aria-pressed': selected },
        React.createElement('div', { className: 'oswb-row-head' }, React.createElement('span', { className: 'oswb-row-name' }, change.name), React.createElement('span', { className: 'oswb-badge oswb-' + (change.status || 'draft') }, stateLabel(change.status))),
        React.createElement('div', { className: 'oswb-row-meta' }, change.schema ? React.createElement('span', null, 'schema: ' + change.schema) : null, task ? React.createElement('span', null, '任务 ' + formatProgress(task)) : React.createElement('span', null, '暂无任务证据'), blocked.length ? React.createElement('span', null, '阻塞 ' + blocked.map((item) => artifactLabel(item.id)).join('、')) : null),
        task && task.total > 0 ? React.createElement('div', { className: 'oswb-progress', 'aria-label': `任务进度 ${formatProgress(task)}` }, React.createElement('div', { className: 'oswb-progress-fill', style: { width: percent(task) + '%' } })) : null,
        React.createElement('div', { className: 'oswb-artifacts' }, safeArray(change.artifacts).map((artifact) => React.createElement('span', { key: artifact.id, className: 'oswb-artifact oswb-artifact-' + artifact.status, title: artifact.missingDeps?.length ? '等待：' + artifact.missingDeps.join('、') : artifact.status }, artifactLabel(artifact.id) + ' · ' + ({ complete: '已写入', ready: '下一步', blocked: '阻塞', unknown: '未知' })[artifact.status])),),
      )
    }

    function ChangeDetail({ change, documents, selectedDocument, setSelectedDocument, content, busy, resourceState, contentResource, onSelectDocument, onRetryDocuments, onRetryContent }) {
      const task = change.trackedTaskProgress || change.cliTaskSummary
      const blockedText = safeArray(change.artifacts)
        .map((artifact) => artifact.status === 'blocked' ? `${artifactLabel(artifact.id)} 等待 ${safeArray(artifact.missingDeps).join('、') || '前置工件'}` : null)
        .filter(Boolean)
        .join('；')
      const header = React.createElement('div', { className: 'oswb-detail-head' },
        React.createElement('div', { className: 'oswb-detail-title' }, change.name),
        React.createElement('span', { className: 'oswb-badge oswb-' + (change.status || 'draft') }, stateLabel(change.status)),
        React.createElement('div', { className: 'oswb-detail-sub' }, '数据来源：' + provenanceLabel(change.evidence?.provenance) + ' · ' + (change.evidence?.freshness === 'stale' ? '内容已过期' : '内容新鲜')),
        change.evidence?.diagnostics?.length ? React.createElement('div', { className: 'oswb-detail-sub oswb-stale', role: 'status' }, change.evidence.diagnostics.map((item) => item.message).join('；')) : null,
         task ? React.createElement('div', { className: 'oswb-detail-sub' }, '任务进度：' + formatProgress(task) + (change.applyProgress ? ' · Apply：' + formatProgress(change.applyProgress) : '')) : null,
        React.createElement('div', { className: 'oswb-detail-sub' }, blockedText),
      )
      const docTabs = React.createElement('div', { className: 'oswb-docs', role: 'tablist', 'aria-label': '文档列表' },
        safeArray(documents).map((document) => React.createElement('button', {
          key: document.id,
          type: 'button',
          role: 'tab',
          'aria-selected': selectedDocument?.id === document.id,
          className: 'oswb-doc' + (selectedDocument?.id === document.id ? ' oswb-doc-active' : ''),
          title: document.path,
          'aria-label': `${documentLabel(document)}：${document.path}`,
          onClick: () => onSelectDocument(document),
        }, documentLabel(document))),
      )
      let reader = resourceState?.phase === 'loading' || resourceState?.phase === 'refreshing' ? React.createElement('div', { className: 'oswb-loading', role: 'status', 'aria-busy': 'true' }, resourceState.phase === 'refreshing' ? '正在刷新文档列表…' : '正在加载文档列表…') : React.createElement('div', { className: 'oswb-empty' }, resourceState?.phase === 'unavailable' || resourceState?.phase === 'error' || resourceState?.phase === 'timeout' ? React.createElement(React.Fragment, null, resourceState.phase === 'timeout' ? '文档列表加载超时，请重试' : '文档暂不可用，请重试', React.createElement('button', { type: 'button', className: 'oswb-button', onClick: () => onRetryDocuments?.() }, '重试')) : '当前 change 没有可读文档')
      if (selectedDocument) {
        const meta = React.createElement('div', { className: 'oswb-reader-meta' },
          React.createElement('span', { className: 'oswb-reader-path', title: selectedDocument.path, 'aria-label': '文档路径：' + selectedDocument.path }, selectedDocument.path),
          React.createElement('span', null, selectedDocument.size + ' bytes'),
          React.createElement('span', null, provenanceLabel(selectedDocument.evidence?.provenance)),
          busy ? React.createElement('span', null, '读取中…') : null,
        )
        const revisionMeta = content?.revision ? React.createElement('span', null, 'revision: ' + content.revision) : null
        const staleMeta = content?.freshness === 'stale' ? React.createElement('span', { className: 'oswb-stale' }, '文档已变化，请重新读取') : null
        const truncation = content?.truncated ? React.createElement('div', { className: 'oswb-truncated', role: 'status' }, `当前仅展示 ${content.returnedBytes || 0}/${content.originalBytes || 0} bytes（上限 ${content.displayLimit || content.maxBytes || MAX_TEXT}），内容已截断。请重新读取。`) : null
        const contentMatchesDocument = content !== null && contentResource?.documentKey === contentKeyFor(change.workspaceId, change.name, selectedDocument.id)
        const contentIsLoading = contentResource?.phase === 'loading' || contentResource?.phase === 'refreshing'
        const body = contentMatchesDocument
          ? React.createElement(React.Fragment, null, revisionMeta, staleMeta, truncation, React.createElement(MarkdownView, { content: content.content }))
          : contentResource?.phase === 'error' || contentResource?.phase === 'timeout' || contentResource?.phase === 'unavailable'
            ? React.createElement('div', { className: 'oswb-empty oswb-error', role: 'alert' }, contentResource.phase === 'timeout' ? '文档读取超时，请重试' : '文档读取失败，请重试', React.createElement('button', { type: 'button', className: 'oswb-button', onClick: () => onRetryContent?.() }, '重试'))
            : contentIsLoading
            ? React.createElement('div', { className: 'oswb-spinner oswb-loading', role: 'status', 'aria-busy': 'true' }, '正在读取文档…')
            : React.createElement('div', { className: 'oswb-empty' }, '选择文档以开始阅读')
        reader = React.createElement(React.Fragment, null, meta, body)
      }
      return React.createElement('div', { className: 'oswb-reader' }, header, docTabs, reader)
    }

    function workspaceKey(workspace) { return text(workspace?.id || workspace?.workspaceId) }

    function SettingsCard({ scope }) {
      const snapshot = scope?.getSnapshot?.() || { status: 'unavailable', value: {}, writable: false }
      const value = snapshot.value || {}
      const update = (field, next) => { if (snapshot.writable) void scope.set(field, next) }
      return React.createElement('div', { className: 'oswb-settings-card' },
        React.createElement('label', { className: 'oswb-settings-toggle' }, React.createElement('input', { type: 'checkbox', checked: Boolean(value.defaultIncludeArchived), disabled: !snapshot.writable, onChange: (event) => update('defaultIncludeArchived', event.target.checked) }), React.createElement('span', null, '默认显示归档')),
        React.createElement('label', null, '默认排序 ', React.createElement('select', { value: value.defaultSort || 'updated', disabled: !snapshot.writable, onChange: (event) => update('defaultSort', event.target.value) }, React.createElement('option', { value: 'updated' }, '最近更新'), React.createElement('option', { value: 'progress' }, '任务进度'), React.createElement('option', { value: 'name' }, '名称'))),
        !snapshot.writable ? React.createElement('div', { className: 'oswb-source' }, '当前设置不可写，工作台仍可只读使用。') : null,
      )
    }

    async function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return
      let service
      const api = {}
      for (const method of RPC_METHODS) api[method] = async (args) => {
        const current = service || ctx.get('remote.' + NS)
        if (!current || typeof current[method] !== 'function') throw new Error('OpenSpec Workbench RPC 尚未就绪')
        return current[method](args || {})
      }
      // Register the view independently of RPC mounting so a missing or late
      // Typert gateway renders a recoverable unavailable state instead of
      // removing the tab from the conversation view ring.
      slots.inject('conversation.view', () => slots.register({ name: 'conversation.view', id: 'openspec-workbench', order: 30, locale: NS, label: () => 'OpenSpec' }, (props) => React.createElement(ErrorBoundary, null, React.createElement(Workbench, { ...props, api, initialChange: props?.openspecChange }))))
      const remote = ctx.get('remote')
      if (remote && typeof remote.$mount === 'function') {
        try {
          const unmount = await remote.$mount(CONTRIBUTION)
          ctx.effect(() => () => { try { unmount?.() } catch {} }, PACKAGE + ': remote contribution')
          service = ctx.get('remote.' + NS)
        } catch (error) {
          console.warn('[' + PACKAGE + '] Typert remote mount unavailable', error)
        }
      }
      const locale = ctx.get('locale')
      if (locale?.register) ctx.effect(() => locale.register(NS, { zh: { tab: 'OpenSpec' }, en: { tab: 'OpenSpec' } }), PACKAGE + ': locale')
      ctx.inject?.(['settingsScope'], (sctx) => {
        const scope = sctx?.settingsScope?.bind?.({ namespace: NS })
        if (!scope) return
        slots.inject?.('settings.plugin.item', () => slots.register({ name: 'settings.plugin.item', key: NS, locale: NS }, () => React.createElement(SettingsCard, { scope })))
      })
    }

    return { name: PACKAGE, inject: ['slots', 'remote'], apply }
  },
})
