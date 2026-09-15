## Why

OpenSpec 工作台已经具备 Workspace 范围、只读状态与文档阅读能力，但首次进入或从对话切回时仍会重复挂载并触发请求瀑布，加载中的资源还可能被误呈现为“没有可用 Workspace”。同时，归档筛选、原生下拉控件和 change 选中态与 DSH 及参考项目 openspec-ui 的低噪声视觉语言不一致，影响用户对状态、来源和当前选择的判断。

现在优化这些问题，可以在不改变只读安全边界和公开 RPC 方法的前提下，降低重复等待、避免错误空态，并建立更稳定、可访问且适配主题的工作台交互基础。

## What Changes

- 为 projects、changes、documents 和文档内容区分初始加载、刷新、切换中、空、不可用、错误和过期状态，只有确认请求完成后才显示“无 Workspace”或“暂无 changes”等结论性空态。
- 在 conversation view 重新挂载时复用内存中的 Workspace 快照、筛选偏好和选中上下文；切回时先展示上次成功数据，再以后台刷新替换，并明确标示刷新或数据来源状态。
- 复用同一 Workspace 的短生命周期扫描结果，减少 projects 与 changes 请求造成的重复文件扫描，同时保留 request key、generation、Workspace identity 和取消保护。
- 统一归档查看与状态筛选的交互语义，避免“显示归档”与“已归档”控件互相矛盾或产生空结果。
- 为 Workspace 与排序控件提供一致的 DSH 主题化原生控件样式；修复归档开关文字垂直对齐、键盘焦点、命中区域和窄容器换行问题。
- 降低选中 change 的视觉强调，使用低强度 selected surface、轻量边界/指示和独立 focus-visible 状态表达选择，不再使用过重的黑色边框或 3px 左侧条。
- 将详情区工件导航从超长路径按钮优化为可识别的工件短标签，并通过路径、title 或可访问名称保留完整 identity。
- 统一 CLI、file-scan、partial-data 和刷新失败的来源/诊断呈现，避免版本信息与“CLI status 不可用”同时出现时产生歧义；文档切换期间不混显旧内容。
- 在亮色、暗色、窄容器、键盘操作、慢请求、失败重试和视图反复切换场景中补充 UI 回归验收；不引入写操作、任意目录选择或新的公开 RPC 方法。

## Capabilities

### New Capabilities

<!-- No new standalone capability is introduced; the existing workbench contract is extended. -->

### Modified Capabilities

- `openspec-workbench`: 修改工作台加载/刷新状态、跨视图快照复用、筛选与控件交互、选中态、工件导航和主题/可访问性呈现要求。

## Impact

- 主要影响 `lib/client.js` 的 conversation view 状态管理、快照缓存、筛选控件和 CSS，以及 `lib/index.js` 的 Workspace 扫描复用策略。
- 影响 `test/client.test.mjs`、`test/shared.test.mjs` 或新增 UI/服务 fixture；需要继续通过 Node 语法检查、现有测试、打包检查和独立 `http://127.0.0.1:3094` 的真实 DSH Web 验收。
- 不改变六个只读 RPC 方法及其 Typert namespace，不新增客户端依赖，不写入 OpenSpec 文件，不触碰用户当前 `http://127.0.0.1:3080` 实例。
- 参考 `E:\github\openspec-ui` 的层级、控件和卡片语言，但所有颜色、字体、surface 和状态表达优先遵循 DSH 主题令牌与宿主 Slot 契约。
