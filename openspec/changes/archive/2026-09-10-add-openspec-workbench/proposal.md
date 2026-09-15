## Why

OpenSpec 将活动变更、工件依赖、任务进度和规范文档分散保存在项目文件系统中，开发者往往需要手动搜索目录或询问 Agent，才能回答基本的审阅问题。DSH 已经提供了适合承载这类信息的 Workspace、Session、生命周期和主题化视图基础设施；一个只读的 OpenSpec 工作台可以减少上下文切换，让开发者直接、可信地了解未完成工作及其下一步可执行工件。

## What Changes（变更内容）

- 新增一个 OpenSpec Workbench DSH profile bundle，通过 session-scoped 的 `conversation.view` 提供工作台标签页，而不是接管 Chat session shell。
- 默认绑定当前 DSH Workspace，并允许在已注册且包含 OpenSpec 根目录的 Workspace 之间切换。
- 展示活动 changes 的状态、工作流工件就绪情况、任务进度、schema 标识、数据新鲜度、数据来源和可执行诊断信息。
- 提供以列表/Kanban 为核心的 change 总览，支持搜索、筛选、排序、归档可见性，以及明确的空数据、不可用、过期、权限和部分失败状态。
- 提供响应式的列表-详情阅读器，用于阅读 proposal、design、spec、task、archive 和自定义 schema 工件文档，支持 Markdown 渲染和文档导航。
- 在可用时使用 OpenSpec CLI 的结构化输出作为工作流状态、工件依赖、instructions、validation 和 diff 的权威来源；同时保留明确标注且有边界的文件扫描 fallback，用于发现和兼容处理。
- 按需加载文档和状态，避免大型 Workspace 内容持续推送到 Client 或存储在无边界的 projection 中。
- 增加可选的轻量会话入口（例如 slash command 或 assistant action），用于打开相关工作台/change，但不修改会话 transcript。
- 增加插件设置，用于保存展示默认值和只读行为，同时不将文档内容和 Workspace 索引存入用户设置。
- 首个版本保持只读：不编辑 Markdown、不切换任务 checkbox、不执行任意 shell 命令、不执行 apply、verify 或 archive。

## Capabilities（能力）

### New Capabilities（新增能力）

- `openspec-workbench`：在 DSH 中以面向 Workspace、只读且具备容错能力的方式发现、汇总、检查和阅读 OpenSpec 项目、changes、工作流工件、规范和任务进度。

### Modified Capabilities（修改能力）

<!-- 不修改现有项目能力的需求。 -->

## Impact（影响范围）

- 新增一个包含 Host 和 Web Client 两部分的 DSH profile bundle，包括包元数据、bundle patch 和兼容性文档。
- 新增 Host adapter，负责按 Workspace 发现 OpenSpec、执行 CLI、进行有边界的文件读取、检测版本/能力、提供诊断并支持取消。
- 新增 Host 与 Client 之间的 JSON-safe 类型化数据契约，包括 provenance、freshness、generation 和 partial-error 字段。
- 新增 `conversation.view` 贡献，以及可选的 conversation/settings 贡献，使用 DSH 的生命周期、Slot、Workspace、sandbox、locale 和主题契约。
- 不修改 OpenSpec 项目、DSH Chat shell、Session event schema 或现有 DSH 核心包。
- 需要为工件/状态解析、自定义 schema 和版本降级、路径边界、异常文档、加载/错误状态、响应式阅读器行为以及 bundle smoke validation 增加测试。
