## Why

进入 OpenSpec 工作台时，当前实现会先等待 `listProjects` 串行处理全部已注册 Workspace，再加载当前 Workspace 的 changes；递归文件扫描、CLI 探测和某个慢路径会共同放大首屏等待，用户只能看到“正在发现已注册 Workspace…”，无法判断实际进度。视图在 Chat 与 OpenSpec 之间重新挂载时，即使当前 Workspace 近期已经成功加载过，也可能再次经历完整等待，严重影响工作台的可用性。

现在优化加载范围、缓存复用和可观测状态，可以让当前会话 Workspace 优先可用，同时保持已注册 Workspace 的安全范围、只读边界和现有 OpenSpec 数据可信度。

## What Changes

- 进入工作台时优先依据 DSH 已提供的当前 Session/Workspace identity，只加载当前 Workspace 的 OpenSpec 根目录和 change 摘要，不让其他 Workspace 阻塞首屏。
- 将 Workspace 列表发现、OpenSpec 根目录检查、change 摘要、文档元数据和完整文档正文分成按需阶段；完整文档仍只在用户选择后读取。
- 默认不为普通活动 change 视图递归扫描归档数据；用户选择归档视图时才加载归档 change，并保持归档筛选语义一致。
- 扩展成功 Workspace 快照和 Host 扫描结果的复用策略，在视图重新挂载或短时间重复请求时优先展示 last-good 数据并后台刷新；显式刷新、已知失效、Workspace 路径变化和 CLI 环境变化仍使缓存失效。
- 将非当前 Workspace 的预加载改为可选的后台、有界并发任务；单个慢、失效或不可用 Workspace 必须独立显示状态，不得阻塞当前 Workspace。
- 为加载链路增加阶段级耗时、缓存命中、请求合并、扫描规模、CLI 探测和失败原因诊断，区分 Host 初始化/RPC 排队、文件扫描、CLI 执行和客户端等待。
- 保留六个现有只读 RPC、Typert namespace、Workspace identity/path boundary、请求取消与 generation 保护；不新增写操作、任意目录选择、远程缓存或用户提供的 shell command。
- 补充慢文件系统、多个 Workspace、首次进入、重复进入、归档按需加载、缓存失效、失败重试、Workspace 切换和独立 DSH Web 验收场景。

## Capabilities

### New Capabilities

<!-- No new standalone capability is introduced; the existing workbench contract is extended. -->

### Modified Capabilities

- `openspec-workbench`: 修改工作台首屏加载范围、Workspace 优先级、分阶段/按需发现、快照与扫描缓存、归档加载、后台预加载、加载状态和性能可观测性要求。

## Impact

- 主要影响 `lib/client.js` 的 Workspace 选择、初始加载、资源状态、快照复用、归档按需加载和后台刷新逻辑。
- 影响 `lib/index.js` 与 `lib/shared.js` 的扫描分层、归档范围、短 TTL/in-flight 复用、失效策略、阶段诊断和可选的超时/有界并发实现。
- 影响 `test/client.test.mjs`、`test/shared.test.mjs`，必要时增加 Host fixture 或独立性能测试；继续运行 Node 语法检查、回归测试、打包检查和独立 DSH Web 验收。
- 不改变现有六个只读 RPC 的公开名称、Typert descriptor、OpenSpec 文件内容或当前用户的 `http://127.0.0.1:3080` 实例；不引入新的运行时依赖。
