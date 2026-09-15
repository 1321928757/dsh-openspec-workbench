## Why

当前 Workbench 已能发现 Workspace、显示 changes 并执行 OpenSpec CLI，但加载、刷新、Workspace 切换和 CLI 能力缓存之间还缺少一致性边界。用户可能在请求尚未完成时看到旧 Workspace 的列表、在 CLI 已恢复后继续看到旧诊断，或把单条异常 CLI 记录误认为整个状态不可用；这会削弱 Workbench 作为可信状态审阅工具的价值。

## What Changes

- 为 projects、changes、documents 和 document content 建立资源级的 loading、refreshing、stale、error、empty 和 unavailable 状态，首次加载不再以空列表代替加载中。
- 在 Workspace 切换和刷新时隔离旧快照，保证旧 Workspace 的列表、详情、文档和延迟响应不会与当前 Workspace 混显；保留可用的 last-good 数据并明确标记过期。
- 改进 Host 的 generation、latest-request-wins 和取消/资源清理边界，补充文档 revision/freshness 的变化检测。
- 使 CLI 版本/能力缓存可以按强制刷新、文件系统失效、可执行文件变化或 TTL 失效；失败探测不应永久阻塞后续恢复。
- 对 CLI status 的混合有效/非法记录逐条隔离，保留有效结果并产生 partial-data 诊断；非法 change identity 和异常进度不得进入后续命令或界面。
- 统一 Host 失败响应中的诊断 code、details、severity 和 fallback 语义，保持 CLI authority 与 file-scan fallback 的区分。
- 保持现有只读、安全路径边界、显式 argv、Windows shim 支持和 `conversation.view` 宿主集成不变。
- 增加并发切换、缓存失效、取消、revision、partial-data、非法 identity、异常进度和刷新失败场景的测试与独立实例验收。

## Capabilities

### New Capabilities

<!-- 本变更改进现有工作台能力，不新增独立 capability。 -->

### Modified Capabilities

- `openspec-workbench`: 修改 Workspace 切换、刷新/freshness、CLI fallback/partial-data、错误诊断和按需文档读取的行为要求，使展示结果与当前请求范围保持一致。

## Impact

- 修改 `lib/index.js` 的 Host 扫描、CLI 探测/缓存、generation、取消和错误响应逻辑。
- 修改 `lib/shared.js` 的 DTO 归一化、CLI identity 和任务进度校验辅助函数。
- 修改 `lib/client.js` 的资源级请求状态、Workspace 切换、stale/revision 展示和请求去重逻辑。
- 扩展 `test/shared.test.mjs`、`test/client.test.mjs` 与必要的 Host 集成 fixture；更新 README 或验证文档中的行为说明。
- 不新增远程服务，不修改 OpenSpec 项目文件，不增加写入、apply、verify、archive 或任意 shell 能力。
