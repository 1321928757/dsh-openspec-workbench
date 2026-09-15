## Context

当前仓库只有默认的 `spec-driven` OpenSpec 配置，因此本次变更建立的是一项新能力，而不是修改现有能力。DSH 提供了 session-scoped 的 `conversation.view` 列表，可用于增加视图；同时还提供带 canonical path 的 Workspace runtime、Host filesystem 和 sandbox 接口、支持 JSON 的类型化服务通道、settings namespace、locale 和主题 token。本地 `dsh-context` 插件展示了 bundle 和 `conversation.view` 的生命周期模式，但它的 session projection 架构并不直接适用于外部文件系统状态：OpenSpec 文件可能被其他编辑器、终端、Git 操作或 Agent 修改。

OpenSpec CLI 是工作流权威来源。当前 CLI 提供结构化的 status、instructions、validation、diff、schema 和 archive 能力，自定义 schema 还可以改变工件图。两个本地 OpenSpec UI 项目展示了有价值的列表/Kanban 和列表-详情阅读模式，但它们的独立服务、固定 API 和硬编码解析假设不适合直接嵌入 DSH。

## Goals / Non-Goals

**Goals（目标）：**

- 提供一个可发布的 DSH profile bundle，包含 Host adapter 和 Web Client 贡献。
- 以当前 DSH Workspace 作为默认 OpenSpec 范围，并支持在已注册 Workspace 之间显式选择。
- 提供有边界的只读总览和按需阅读器，即使 OpenSpec CLI 不可用或 Workspace 使用自定义 schema，仍能提供有限但清晰的信息。
- 通过数据契约区分 CLI 结果、文件扫描 fallback、freshness、generation 和诊断信息，保留权威性和可解释性。
- 避免将大型 Markdown 文档和 Workspace 索引放入持续推送的 Session 状态。
- 让路径处理、子进程执行、异常输入、取消和部分失败都以 fail-safe 且可观察的方式运行。
- 遵循 DSH 的 Slot、生命周期、无障碍、响应式布局、locale 和主题契约。

**Non-Goals（非目标）：**

- 替换 Chat session shell，或实现第二套 conversation 应用。
- 构建独立 HTTP server、iframe 集成、远程协作服务或 SaaS 后端。
- 重写完整的 OpenSpec CLI、schema editor、terminal、Git client 或 agent runner。
- 在首个版本编辑工件、勾选任务、执行 apply、verify、sync 或 archive。
- 当权威 CLI 数据可用时，将文件扫描得到的 checkbox 数量作为 CLI 工作流或任务证据的替代品。

## Decisions

### 1. 使用 `conversation.view`，而不是 `conversation.session`

Client 注册一个 session-scoped 的 OpenSpec 视图到宿主 view ring 中。用户选中它时，OpenSpec 可以占据主阅读区域；同时宿主继续负责 Chat shell、draft mirror、composer、header、视图切换、scrollport 和 Session transition。接管 `conversation.session` 则意味着插件必须复制这些职责，并且会更容易受到宿主实现变化的影响。

**考虑过的替代方案：**替换整个 Session body。由于 Slot 契约会把完整 Session 体验的所有权转移给接管者，而且没有可用的空态 fallback，因此不采用该方案作为 MVP。

### 2. 使用带类型的按需 Typert RPC Host adapter

Host 负责 Workspace 解析、OpenSpec 根目录发现、CLI 调用、有边界的文件读取、路径校验、版本/能力检测、取消和诊断。Client 通过 Typert RPC 服务契约接收 JSON-safe DTO，并且只请求用户当前选中的注册 Workspace、change 或 artifact 的详情。初始方法族在概念上包括 `listProjects`、`listChanges`、`getChangeStatus`、`listDocuments`、`readDocument`，以及可选的 `getValidation`/`getDiff` 能力；具体公共名称和 descriptor 字段属于实现细节，需要根据当前 DSH Typert loader 契约最终确定。Typert 响应遵循 DSH 的 `{ok, value}` / `{ok, error}` 契约，Client 在渲染前必须解包成功结果中的业务值。

**考虑过的替代方案：**单个大型 HTTP JSON 响应。该方案容易产生无边界 payload，让所有视图绑定到一次刷新，并使后续状态、validation、取消和错误契约不够明确，因此不采用。独立 server 或 iframe 也不采用，因为它们会重复 DSH 的 Workspace、安全、生命周期和主题职责。

### 3. CLI 证据权威，文件扫描作为有边界的 fallback

首个版本面向稳定的 OpenSpec CLI `>=1.12.0 <1.13.0`（1.12.x 线）。当该版本窗口内的 CLI 能返回有效结构化数据时，其 status/artifact dependency、instructions、validation 和 diff 结果是对应能力面的事实来源。有边界的文件扫描仍用于发现项目、列出基本文档，以及在环境没有可用 CLI 时提供有限信息；但对于不支持的 CLI 版本，属于 CLI 权威范围的能力必须 fail-closed。每个响应都标识 `provenance`（`cli`、`file-scan` 或 `fallback`）、`freshness`、`generation` 和诊断信息，使 UI 不会把推断结果伪装成权威状态。

数据模型必须分开保存 workflow artifact status、tracked task progress、CLI task summary、Apply progress、validation evidence 和 document freshness。默认 `spec-driven` 的工件名称只是展示便利；自定义 schema 的工件必须根据其 ID、路径、依赖和状态动态渲染。

**考虑过的替代方案：**始终在本地重实现 `spec-driven` DAG。由于 OpenSpec 支持自定义 schema，且 CLI 的状态语义可能演进，因此不采用该方案。

### 4. 范围仅限已注册的 DSH Workspace

首个版本只暴露已经在 DSH 中注册的 Workspace。Client 使用 Host Workspace runtime 列出和选择它们，并向 OpenSpec service 发送稳定的 `workspaceId`。不增加任意目录选择、目录创建或独立路径配置。这样可以让项目边界与 DSH 现有的 canonical path 和 Workspace 所有权模型保持一致；添加未注册根目录可以作为单独且明确授权的后续变更。

**考虑过的替代方案：**允许用户输入或浏览任意本地目录。该方案会重复 Workspace adoption 语义，并扩大路径授权、持久化和安全范围，因此暂缓。

### 5. 索引有边界，文档按需加载

Host 返回紧凑的项目/change/文档元数据和有边界的诊断摘要。完整 Markdown、diff body 和 instruction payload 只有在用户选择文档或明确请求证据时才读取。请求携带 generation 或 revision 标识；来自上一个 Workspace 选择的延迟响应必须被忽略。刷新期间保留上一次成功 snapshot，同时标记 busy/stale。

**考虑过的替代方案：**持续推送一个包含完整文档树的 `sessionProjections`。OpenSpec 状态来自外部文件系统，完整文档内容会膨胀 checkpoint 和浏览器 payload，因此不采用。

### 6. 路径只允许访问注册 Workspace 和 OpenSpec 根目录

Client 不得把任意路径作为读取权限依据。它只发送稳定的 Workspace、change 和 artifact 标识；Host 根据 DSH 注册 Workspace 的 canonical path 解析这些标识，校验 OpenSpec 根目录和最终 real path，拒绝 traversal 与 symlink escape，限制文件大小/深度/数量，并通过 DSH filesystem/sandbox 接口读取。CLI 进程使用选定 Workspace 作为 cwd，支持取消和超时，且不接受 shell command string。

只读边界是首个版本的主要安全属性。如果未来增加写入能力，必须另行设计明确契约，包括 revision compare、原子写入、冲突处理和用户确认。

### 7. 使用 DSH 原生视图组合和 UI 语言

视图由 Workspace selector、紧凑摘要行、支持搜索/筛选的 change 列表（可选 Kanban 展示）、artifact/status 区域和响应式列表-详情阅读器组成。桌面端使用双栏；窄容器将导航折叠为 drawer 或 selector，并保留单栏可读文档区。Markdown 必须安全渲染，单个文档的错误不能击穿整个视图。CSS 使用 namespace 或 CSS module，并消费已确认的 DSH surface、text、border、state、motion 和 font token。视图包含 ErrorBoundary，并明确展示 loading、empty、stale、unavailable、permission、parse-error 和 partial-data 状态。

**考虑过的替代方案：**复制截图中的独立配色和完整独立 dashboard shell。该方案会与 DSH 主题及宿主布局契约冲突，因此不采用。

### 8. 只增加可叠加的辅助入口

主入口是 OpenSpec view。后续或可选地增加 slash command、assistant action 或 input affordance，将选中的 change/文档传递到该视图，但不写入 transcript。Settings 只保存展示默认值和安全/只读偏好，不保存文档、索引、secret 或 Workspace 内容。

## Risks / Trade-offs

- **[CLI 版本漂移]** 不同 OpenSpec 版本的结构化命令输出和 schema 行为可能变化。 -> 检测可执行文件/版本/能力，对不支持的权威能力 fail-closed，展示 provenance 和诊断，并使用固定版本 fixture 测试。
- **[自定义 schema 复杂度]** 硬编码 proposal/design/specs/tasks UI 会错误表示自定义工作流。 -> 动态渲染 artifact 元数据，仅在 `spec-driven` 展示中把熟悉名称作为便利标签。
- **[外部文件变化]** 文档打开或扫描过程中，文件可能被外部修改。 -> 附带 generation/revision 元数据，清晰标记 stale，取消被替代的请求，并在刷新时重新读取。
- **[路径逃逸或 symlink]** Workspace 路径和标识可能已经过期或包含恶意内容。 -> 只根据 Host 持有的 Workspace ID 解析，执行 canonicalize，读取/执行 CLI 前再次检查 containment，拒绝 traversal、symlink escape 和越界目标。
- **[大型或异常文档]** 巨大 Markdown 或异常内容可能造成内存、布局或渲染问题。 -> 限制读取大小，防御性解析，按需渲染，隔离单文档错误，并仅在 Host 能力允许时提供 raw/open-path fallback。
- **[进度含义混淆]** Checkbox 数量、工作流就绪状态和 Apply 进度可能不一致。 -> 在 DTO 中保持独立字段和标签，绝不只根据工件是否存在推断实现完成。
- **[Host 能力差异]** 较旧或部分组合的 DSH 部署可能缺少 service、slot、primitive 或 native opener。 -> 使用可选的 nested injection 和 feature gate，实现在开发前确认当前 runtime 契约，降级为只读元数据而不是让插件激活失败。
- **[刷新成本]** 高频 watcher 事件可能造成重复扫描和 UI 抖动。 -> 首版先实现显式刷新和 debounce 的 generation invalidation，测量真实 Workspace 后再增加有边界的 watcher。
- **[范围扩张到工作流执行]** Apply/archive 按钮会把阅读器变成写操作界面。 -> 首版排除这些操作；任何后续 mutation 都单独建立变更和规范。

## Migration Plan

1. 在 scratch DSH profile 中构建并测试 bundle，安装时使用打包产物，不使用跨盘目录 link。
2. 在真实 DSH Web host 中激活，验证 `conversation.view` 注册，并测试当前 Workspace、缺少 OpenSpec 根目录、CLI 不可用、自定义 schema、异常文档、stale 刷新、亮/暗主题、键盘和窄容器流程。
3. 如果激活或数据处理失败，移除/禁用 bundle row 并重启真实 DSH Web host；由于插件不拥有核心 Session 数据且不执行写操作，现有 Chat 和 Workspace 状态不会被修改。
4. 未来 CLI 兼容性变化通过兼容性 adapter 和 fixture 处理，不修改现有 OpenSpec 文件。

## Resolved Scope Decisions

- 首个版本只支持已经在 DSH 中注册的 Workspace，不增加任意目录选择或 adoption。
- 首个版本目标 OpenSpec CLI `>=1.12.0 <1.13.0`；不支持的版本对 CLI 权威能力 fail-closed，同时在安全范围内保留明确标记的文件发现 fallback。
- Host/Client 通信使用 Typert RPC，传输 JSON-safe DTO，并遵循 DSH result envelope。

具体的 Typert descriptor 字段和当前 runtime primitive 的实际接口仍属于实现前验证任务，而不是产品范围决策。

## Verification Environment Constraint

真实 DSH Web 宿主验收必须使用独立的测试实例，默认使用 `http://127.0.0.1:3094`（或用户明确指定的其他独立测试端口）。不得在用户当前使用的 `http://127.0.0.1:3080` 实例中安装、启用或验证本插件的效果。网页操作应通过 `web-access` skill 完成；如需启动测试宿主，必须使用托管后台任务，并验证实际访问地址后才能进行验收。
