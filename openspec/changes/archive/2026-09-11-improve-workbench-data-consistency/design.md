## Context

当前 Host 以文件扫描构造基础快照，再按 Workspace 执行 OpenSpec CLI；Client 为 projects、changes、documents 和文档内容分别发起 RPC，但使用一个共享 `busy` 和有限的 request epoch。CLI 版本探测结果按 Workspace path 长期缓存，generation 目前主要作为返回元数据，尚未成为 Host 内部的提交门槛。现有只读路径边界、显式 argv、Windows shim 解析、Typert envelope 和 `conversation.view` 集成是本变更必须保留的约束。详细动机和行为范围见 `proposal.md` 与 delta spec。

## Goals / Non-Goals

**Goals:**

- 建立 Workspace-scoped、resource-scoped 的 last-good snapshot 和 latest-request-wins 语义。
- 让 CLI 探测能够恢复、部分有效的 CLI 输出能够被安全保留，并使每条诊断可解释。
- 让文档 revision/freshness、展示上限和错误归属在 Host/Client 两侧一致。
- 保持 DTO JSON-safe、只读权限边界和现有 DSH/Windows 兼容契约。
- 用可控 fixture 覆盖并发、取消、缓存、异常输入和真实 bundle 回归。

**Non-Goals:**

- 不实现动态 schema、artifact chain 的完整工作流语义；这些属于后续 evidence/schema 变更。
- 不新增任意目录选择、远程存储、后台 watcher 服务或持久化完整文档。
- 不引入写入、apply、verify、archive、sync、任务勾选或用户 shell 命令。
- 不在本变更中重做完整 Markdown renderer 或迁移全部官方 UI primitive。

## Decisions

### 1. 用请求上下文和资源快照替代共享 busy

Client 为每个资源保存独立 phase、数据、workspaceId、generation、requestKey、error 和 stale 状态。首次请求显示 loading；已有快照刷新时保留数据并显示 refreshing；失败时保留 last-good 数据并显示归属该资源的错误。Workspace 切换先递增 epoch、取消可取消请求并清理或隔离所有旧资源，再启动 B Workspace 请求。

选择资源级状态而不是只在顶层增加更多布尔值，是因为 projects 成功而 document 失败时两者必须同时表达不同事实。保留共享按钮禁用状态作为派生值，但不再让某个请求的 finally 覆盖其他请求。

**替代方案：**继续使用单一 `busy` 并增加更多 notice。该方式无法表达错误归属，也无法阻止旧 Workspace 快照短暂混显，因此不采用。

### 2. Host 使用 Workspace-scoped request token 作为提交门槛

每次扫描、CLI status 或文档读取开始时绑定 Workspace identity、请求 token 和 generation。完成时只有仍为当前请求、Workspace identity 未变化且 generation 未被失效的结果才能进入 Host snapshot 或作为有效响应返回；被替代的请求返回可识别的 cancellation/stale 结果或由调用层丢弃。服务 dispose 时取消/清理 pending controller、TTL timer 和缓存。

Typert 参数仍保持 JSON-safe，不尝试跨 RPC 传递 AbortSignal；Client 取消通过 Host 支持的请求句柄/调用取消机制（若当前 runtime 提供）实现，缺失时用 request key 和 generation 做提交拒绝。这样不会把不可序列化的 signal 塞进现有 strict record codec。

**替代方案：**只依靠 Client 整数 epoch。它能防止部分旧响应渲染，但不能停止或约束 Host 内部扫描/CLI，并不能防止 Host 返回已经失效的 generation，因此不足。

### 3. CLI cache 使用可失效的探测记录

CLI 探测缓存至少绑定 Workspace canonical path 和解析出的 executable identity，并记录探测时间、版本和支持能力。显式 force refresh、Workspace 文件系统失效、executable 变化和 TTL 到期会删除记录并重新探测。成功结果使用短 TTL；失败结果使用更短 TTL 或不缓存，以便安装/修复 CLI 后自动恢复。刷新 status 时仅在需要时重新探测版本，不改变显式 argv 和 Windows shim 的安全解析。

**替代方案：**完全移除缓存。虽然语义简单，但每次并行 projects/changes 请求都可能重复启动 CLI，在大型 Workspace 中代价较高；有限 TTL 与明确失效更平衡。

### 4. CLI status 采用逐条归一化和 partial-data 诊断

解析 status 容器后逐项校验：合法记录进入结果；非法记录、非法 change identity、异常工件或越界进度被隔离并产生带索引/字段的诊断。只要仍有合法记录，整体 provenance 可保持 `cli`，同时附加 `CLI_PARTIAL_DATA` warning；若容器完全无效或没有任何可安全使用的记录，则保留 file-scan fallback，并使用 CLI failure diagnostic。归一化函数不负责推断被拒绝字段为成功。

任务进度统一校验有限非负整数并处理 `done > total`、负值和无效 total；该选择避免 UI 仅通过百分比 clamp 掩盖事实矛盾。

**替代方案：**一条坏记录导致整个 CLI 结果回退。实现容易但违反部分数据可用性要求，会丢失大量可信状态，因此不采用。

### 5. revision 和展示截断由 Host 明确声明

文档读取响应保留稳定 revision、原始字节数、实际返回字节数和 `truncated`/展示上限元数据。Host 在同一文档再次读取时比较可用版本标识；Client 只在 change/workspace/generation 匹配时替换内容，revision 改变时保留旧内容并显示 stale/reload。若 Client 为防止过量 React 节点仍有字符上限，必须把截断状态展示给用户，而不是静默 `slice`。

**替代方案：**只依赖 Date.now 或仅依赖文件 size 作为 revision。它们无法可靠识别同大小内容变化；优先使用 FS version/mtime/hash 等已提供的稳定标识，缺失时明确标记 freshness unknown。

### 6. 诊断作为可组合的结构化数据

所有 Host 操作的失败统一保留 code、message、details 和 severity；fallback 结果将 CLI 失败诊断合并到 evidence，而不在外层 catch 时丢失 details。Client 将诊断绑定到 projects、changes、documents 或 document content 对应区域，并区分正常空态、不可用、stale 和 partial-data。

只读边界不因可观察性而放宽：details 不能包含 secret、完整文档或未授权路径；CLI stderr 继续受输出上限约束并按现有安全策略处理。

## Risks / Trade-offs

- **[过多状态增加客户端复杂度]** -> 先使用统一的资源状态形状和有限 phase 枚举，保留现有 UI 外观，仅替换状态来源；为每类状态建立 fixture。
- **[取消能力依赖当前 Typert/runtime]** -> 不把 AbortSignal 放入 JSON DTO；在有取消句柄时主动取消，没有时用 token/generation 严格拒绝提交，并限制并发请求数量。
- **[TTL 导致 CLI 版本短时间内仍显示旧值]** -> force refresh 和已知失效立即清除缓存；界面显示探测时间或 refreshing 状态，失败缓存使用较短 TTL。
- **[partial-data 可能让用户高估 CLI 完整性]** -> 保留 `cli` provenance 的同时强制显示 partial-data warning 和无效记录数量，禁止把 warning 省略在详情之外。
- **[revision 标识在部分 FS 上不稳定]** -> 优先使用服务提供的 version/mtime；变化不确定时返回 `unknown` freshness，不宣称内容新鲜。
- **[清除旧 Workspace 快照造成视觉空白]** -> 切换期间展示明确的“正在切换 Workspace”状态；不在新标识下复用旧列表，优先真实性而非无缝动画。
- **[测试 fixture 与真实 OpenSpec CLI 输出漂移]** -> 保持 CLI 版本窗口，增加真实 1.12.x smoke，并把未知字段当作可忽略扩展而非强制失败。

## Migration Plan

1. 在不改变公开只读方法名称的前提下，先扩展 DTO 的可选状态/诊断/revision 元数据和 Host 单元测试 fixture。
2. 实现 Host cache/request token/partial-data，再实现 Client 资源状态和 Workspace 切换隔离；每一步保持旧字段兼容。
3. 使用项目测试套件、`npm pack --dry-run` 和 scratch profile 进行静态与 bundle 验证。
4. 在独立 `http://127.0.0.1:3094` 重启真实 DSH Web，验证 CLI 恢复、刷新失败、Workspace 切换、文档变化和空/不可用状态；不得使用用户 `3080` 实例。
5. 若回归失败，回滚到上一 bundle；由于本变更不写 OpenSpec 文件、不持久化索引且不改变 Session 数据，回滚不需要数据迁移。

## Open Questions

无。CLI TTL 的具体毫秒数和 FS 可用 revision 字段属于实现参数，不改变本变更定义的外部行为，可在测试 fixture 中选择并记录。
