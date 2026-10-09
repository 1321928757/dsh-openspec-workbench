## Why

当前 `dsh-openspec-workbench` 仍使用 DSH 0.1.x 的 strict Typert codec 形态，而 DSH 0.2 的 Host loader、API gateway 与浏览器 Typert registry 都要求 codec 提供 `create()` 工厂；因此现有插件可能在激活阶段失败或无法完成 RPC。此次迁移要在保留只读 OpenSpec 工作台行为的前提下，明确支持 DSH 0.2 并通过隔离验收，降低插件因激活失败而从 profile bundle 栈被移除的风险。

## What Changes

- **BREAKING**：将 Host invocation 参数和结果 codec 更新为 DSH 0.2 strict codec 契约，提供返回可 `.parse()` schema 的 `create()`。
- 更新浏览器端 remote descriptors，提供不依赖未保证浏览器模块的 `create()`；移除客户端通过模块表加载 `zod` 的兼容性假设。
- 将 OpenSpec 偏好卡片迁移到 DSH 0.2 插件设置页 Slot `settings.plugins.tab`，保留现有偏好读写语义；核验 Slot 选项及注入生命周期。
- 更新 DSH/Cordis peer、`engines.dsh` 与兼容性文档，以 DSH `>=0.2.0 <0.3.0` 为目标范围；用户报告已在正式 DSH `0.2.0` 上完成基本手动冒烟测试。
- 增加契约回归测试，明确验证 Host 与 Client 两侧 `create()`，并验证 schema-only 旧形态在兼容性校验中被拒绝。
- 采用隔离 DSH profile、独立端口及浏览器数据目录进行 Host/Web 验收；测试阶段不得重启或改动用户正在使用的实例。

## Capabilities

### New Capabilities

<!-- No new capability is introduced. -->

### Modified Capabilities

- `openspec-workbench`: 插件必须能在声明支持的 DSH 0.2 Web 运行时中激活并提供只读工作台与设置入口，同时保留既有安全和只读行为。

## Impact

- 插件元数据：`package.json` 的兼容范围、peer dependencies 与 DSH engines。
- Host Typert manifest：`lib/typert.host.js`；Host 服务入口：`lib/index.js`（仅在运行时契约复核发现需要调整时）。
- Web Client：`lib/client.js`，包含 Typert descriptors 与 Settings Slot 注册。
- 测试：`test/typert.test.mjs`、`test/client.test.mjs`，必要时增加隔离 Headless/Web 验收资产。
- 文档及发布说明：`README.md`、`README.zh-CN.md`，以及发布版本/tag 相关文件（如仓库实际存在）。
- DSH 运行时本地检查证据来自 `0.2.0-rc.2` app.asar；用户另报告正式版 `0.2.0` 基本手动冒烟通过，但未提供独立 trace。完整六个 RPC/不修改项目文件的端到端记录仍未捕获。
