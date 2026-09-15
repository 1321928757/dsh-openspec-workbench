## Context

See `proposal.md` for the motivation and externally visible scope. 当前插件是动态无 JSX Client bundle，注册为 DSH `conversation.view`，通过 `useWorkspaces`/`useSessions` 已经可以获得注册 Workspace 与当前会话信息；但 `loadProjects` 仍以不带 `workspaceId` 的 `listProjects` 作为首个门槛。Host 的 `listProjects` 会串行遍历所有注册 Workspace，`scanProjectFresh` 又会递归扫描整个 `openspec/`、读取 change 的 `tasks.md` 并探测 CLI，导致当前 Workspace 被其他 Workspace 的慢路径阻塞。

现有六个只读 RPC、JSON-safe DTO、Workspace identity/canonical path、path boundary、symlink 检查、request key、generation、AbortSignal 和内存快照必须保留。Host 已有 scan cache/in-flight coalescing，但默认 TTL 很短且缓存粒度仍建立在完整 project scan 上；Client 的快照只能在一次成功请求后用于 remount hydration。本设计不修改 DSH 核心 Workspace registry 或 session persistence 的启动流程；如果启动初始化本身很慢，只通过阶段指标区分并单独报告。

## Goals / Non-Goals

**Goals:**

- 让当前会话对应的已注册 Workspace 成为首屏唯一的关键数据依赖，其他 Workspace 不得阻塞当前 Workspace 的首次可用时间。
- 让根目录探测、当前 Workspace 的 change 摘要、归档数据、文档元数据和正文具有清晰的加载边界，避免首次进入建立全量 OpenSpec 文档索引。
- 让短时间重复进入优先展示最近成功快照，并通过 Host cache/in-flight 复用降低重复扫描；显式刷新和已知失效仍保持可预测的重新验证语义。
- 让慢 Workspace、慢文件系统和 CLI 失败有独立的超时/错误/来源状态，并通过阶段级 evidence 解释耗时。
- 在不扩展权限范围的前提下，保持 Workspace 切换、归档切换、文档选择的 identity 隔离和 latest-request-wins 保护。

**Non-Goals:**

- 不修改 `dsh-workspace` 的 registry 初始化、session persistence 索引或 DSH 连接协议；这些问题只做观测分层，另立变更处理。
- 不新增 RPC，不把完整文档、索引或性能日志持久化到 Session、settings 或远程服务。
- 不引入 watcher、任意目录选择、写操作、apply/verify/archive/sync、任务勾选或用户可控 shell command。
- 不要求为了性能牺牲自定义 schema、CLI authority、file-scan fallback、symlink/path boundary 或文档 revision 语义。

## Decisions

### 1. Client 以 DSH Workspace feed 作为选择来源，首个 RPC 绑定当前 Workspace

Client 继续从 `useWorkspaces` 读取注册 Workspace 列表，并优先从当前 Session 的 `workspaceId` 或 cwd 解析当前 Workspace。进入工作台时不再等待 Host `listProjects({})` 返回完整 Workspace 集合来决定选择项；Workspace selector 可以先用 DSH feed 渲染，当前 Workspace identity 确定后，首个 OpenSpec 请求携带该 `workspaceId`。

`listProjects` 保留现有 RPC，并增加/使用可选的 Workspace scope：带 `workspaceId` 时只处理该 Workspace；不带时保留兼容的全量语义，但 Workbench 首屏不调用该全量路径。`listChanges` 仍是当前 change 列表的权威入口。这样不会把 Workspace 注册发现与 OpenSpec 文件发现混成一个 waterfall，也不需要复制 DSH 的 Workspace registry。

**替代方案：**继续让 `listProjects` 扫描所有 Workspace 后在 Client 选择当前项，会让任意慢路径继续决定首屏延迟；直接在插件中维护另一份 Workspace registry 会产生身份漂移，均不采用。

### 2. 采用分层、Workspace-scoped 的 OpenSpec scan

Host 将读取分为以下层次，公开 RPC 名称和主要响应 envelope 不变：

```text
Workspace identity/path validation
        |
        +--> OpenSpec root probe
        |
        +--> active change summary (default)
        |       +--> bounded metadata/artifact facts
        |       +--> CLI status when supported
        |
        +--> archived change summary (only archived view)
        |
        +--> selected change documents (listDocuments)
                |
                +--> selected document content (readDocument)
```

普通活动视图只检查当前 Workspace 的 `openspec/` 和活动 `changes/` 范围，不遍历 `changes/archive/`，也不构造整个 OpenSpec 根目录的全局 document index。活动 change 摘要只收集有界的 metadata/artifact facts；需要完整自定义工件路径集合时，在用户选中该 change 后由 `listDocuments` 对该 change 做受边界的 targeted scan。兼容 CLI 可用时，workflow status/artifact dependency 仍以 CLI 为准；fallback 必须标明扫描范围或 partial metadata 限制。

`listDocuments` 和 `readDocument` 必须继续重新校验 Workspace、OpenSpec root、change identity 和最终路径，不能因为前一阶段已有 cache 就绕过安全检查。按需读取只延迟文件内容和非必要文档元数据，不放宽现有大小、深度、条目数与 revision 约束。

**替代方案：**每次进入仍递归整个 `openspec/`，只是把正文读取延后，无法解决大量目录元数据和 archive 扫描成本；一次返回所有正文则会放大 RPC payload 和内存，均不采用。

### 3. 归档作为独立的 lazy scope

`includeArchived=false` 是默认的 active scope；Host 的 active scan 不触碰 archive subtree。用户选择“已归档”或显式启用归档视图时，Client 才发起带 archive scope 的请求，Host 再加载 archive summary，并按 `(workspaceId, canonicalPath, scope)` 缓存。归档视图必须在其请求完成前显示 loading/refreshing，而不是把尚未加载的 archive 当作空集合。

归档 cache 与 active cache 分离，避免用户切换归档筛选时污染活动列表，也让 active 首屏不因历史目录规模增长而变慢。

**替代方案：**始终把 active 与 archive 合并扫描再在 Client 过滤，会保留原有首屏成本；用一个全局 `includeArchived` 布尔值覆盖多个请求，会产生 active/archive identity 混淆，均不采用。

### 4. 采用较长但可失效的 Host scan TTL 与 in-flight coalescing

Host scan key 由 Workspace stable identity、canonical path 和 scope 组成。相同 key 的并发请求共享一个 scan promise；成功结果进入有限 TTL cache，默认 TTL 从当前秒级窗口提升到适合 view remount 的短生命周期（实现可选 30 秒量级），不持久化。cache hit 仍先执行 `requireWorkspace`、canonical path 比较和 root/path safety gate。

以下事件立即失效并递增 generation：显式 force refresh、`scheduleInvalidation`、Workspace path 变化、已知文件系统失效、解析到不同 CLI executable；TTL 到期只清除对应 scope。失败/不可用结果不应永久占据成功 cache，失败重试使用更短的 retry/backoff 窗口或直接重新验证。

Client module-level snapshot 继续保存有限的 last-good DTO、选择 identity 和显示偏好。remount 命中相同 `(workspaceId, path, scope)` 时立即 hydration，并将资源置为 `refreshing`；Workspace 切换不复用另一个 identity 的 snapshot。

**替代方案：**永久 cache 会长期隐藏外部文件变化；完全删除 cache 会让 view remount 和 projects/changes 并发重复扫描，均不平衡。

### 5. 非当前 Workspace 不进入首屏关键路径

默认情况下只加载当前 Workspace；用户主动切换到其他 Workspace 时，才开始该 Workspace 的 root/summary 请求。若保留后台预热，它只能在当前 Workspace 成功后通过低优先级、有界并发队列运行，最多同时处理少量 Workspace，使用独立 timeout 和 cache，绝不能占用当前 Workspace 的请求 token、阻塞当前响应或覆盖当前资源状态。用户切换 Workspace 时，后台任务可取消或只允许以 cache side effect 完成，不能向当前 UI 提交错误 identity 的结果。

首版实现可以不启动自动预热；这比无界地扫描所有注册 Workspace 更符合“当前项目优先”的目标。

**替代方案：**启动时串行预热全部 Workspace 会复现一分钟级 waterfall；启动时无限并发会争用磁盘和 CLI，均不采用。

### 6. 对 Host 阶段和 Client 请求增加轻量 timing evidence

每个 OpenSpec response 的 evidence 可以增加 JSON-safe 的受限 timing 摘要，例如 root probe、active/archive scan、CLI probe/status、cache hit/in-flight reuse 和 total duration。只记录阶段名、毫秒数、条目计数、scope、cache 状态和稳定错误 code；不记录 secret、完整文档正文或未经需要的路径。

Client 在 view mount、snapshot hit/miss、RPC start/end、resource phase transition 和 retry 处增加 development/diagnostic marks，并把用户可理解的“当前 Workspace / 正在扫描活动 changes / 正在加载归档 / CLI fallback”绑定到具体资源。Host timing 只能说明插件请求内部耗时；若耗时发生在 RPC 排队、连接握手或 DSH registry 初始化，必须在诊断中保留独立分类，不能伪称为 OpenSpec 文件扫描。

**替代方案：**只保留一个全局 loading 文案无法定位一分钟等待；把原始日志或完整路径返回给 Client 会增加隐私和 payload 风险，均不采用。

### 7. 统一取消、超时和提交门槛

当前 Workspace 的 scan、CLI probe/status 和 targeted document 请求都使用独立 request context、AbortSignal、request key 和 generation。对单个 targeted operation 增加有界执行预算；超时只使该资源进入 timeout/error，并保留同 identity 的 last-good snapshot。非当前 Workspace 的后台预热使用更短预算。

任何 cache hit、后台任务完成或迟到 response 都必须再次检查 Workspace identity、canonical path、generation 和当前请求 key。`listProjects` 的全量兼容路径若仍被外部调用，也必须有界并发、独立错误结果和总预算，不能再以串行单点失败形式影响当前 Workspace 请求。

**替代方案：**只在 Client 丢弃旧响应不能停止 Host 的慢扫描；只用一个全局 AbortController 又会让归档/文档请求互相取消，均不采用。

## Risks / Trade-offs

- **[首屏不再预加载所有 Workspace，首次切换其他 Workspace 仍需等待]** → selector 立即可用并显示该 Workspace 的独立 loading；复用成功 snapshot，必要时再评估低优先级预热。
- **[较短的 summary 可能暂时缺少自定义工件细节]** → CLI status 仍提供权威 artifact facts；fallback 显示 metadata scope/partial 诊断，并在选中 change 时 targeted `listDocuments` 补全。
- **[延长 TTL 可能短暂显示外部变更前的状态]** → 显式刷新、已知失效、CLI executable 变化和 generation 检查立即绕过 cache；UI 保留 refreshing/freshness 标识。
- **[有界超时可能把慢盘误报为不可用]** → 使用资源级 timeout 文案、保留 last-good、提供 retry，并在 evidence 记录阶段耗时和稳定错误 code；不把 timeout 当作“没有 Workspace”。
- **[后台预热仍可能争用磁盘]** → 默认关闭或仅在当前成功后启动，限制并发、预算和 scope，并允许取消。
- **[性能 evidence 增加 DTO 字段和测试面]** → 只增加可选 JSON-safe 摘要，不改变六个 RPC 的 envelope 或现有 provenance/freshness 字段。
- **[真正的慢点来自 DSH 启动初始化]** → 单独记录 RPC queue/connection/registry-init 分类；本变更不修改 DSH 核心生命周期，避免把插件优化误当成 Host 修复。

## Migration Plan

1. 先为 Client/Host 增加 Workspace-scoped request fixture、分层 scope 标识、timing evidence 和失败/超时测试，确保旧的六个 RPC 和只读边界仍兼容。
2. 实现 Client 当前 Workspace 首屏路径：从 DSH Workspace feed 选择 identity，取消无 scope 的关键 `listProjects`，以 snapshot hydration + targeted refresh 取代全量 loading waterfall。
3. 将 Host scan 拆为 root/active/archive/targeted scopes，先保证 active 首屏不扫描 archive，再接入较长 TTL、in-flight coalescing、失效和 generation 提交门槛。
4. 实现归档按需加载、资源级 loading/error/timeout、Workspace 切换隔离和可选的低优先级后台预热；不改变公开 RPC 名称和安全路径验证。
5. 运行 Node 测试、语法检查、打包检查，并使用独立 scratch DSH（默认 `http://127.0.0.1:3094`）验证首次进入、重复切换、慢/失败 Workspace、归档、CLI fallback、文档按需读取、亮暗主题和窄容器。不得使用用户当前 `http://127.0.0.1:3080` 验证。
6. 若 bundle 回归，回滚 bundle/Host adapter 到上一版本即可；本变更不写 OpenSpec 文件、不迁移持久化数据、不修改 Session 数据。

## Open Questions

无。具体 TTL、单次 scan budget、后台并发数和 timing 字段名称属于实现参数；只要满足本设计的 scope、失效、取消、错误归属和可解释性约束，不需要再改变规格或任务拆分。
