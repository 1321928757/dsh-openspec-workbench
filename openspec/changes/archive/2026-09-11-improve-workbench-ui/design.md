## Context

See `proposal.md` for the user-facing motivation and scope. 当前 bundle 是无 JSX 的动态 Client，主要呈现集中在 `lib/client.js` 的 `conversation.view` 注册、组件状态和内联 CSS；Host 通过 `lib/index.js` 的六个只读 RPC 完成 Workspace 扫描、CLI 探测和文档读取。DSH 的 conversation view 在非活动 view 时不会保留插件组件实例，因此仅使用组件本地 state 无法解决跨视图切换的重复加载。

现有实现已经具备资源级 phase、request key、generation、Workspace identity 和 last-good 字段，但 projects/changes 仍然在挂载时串行启动，Host 的 project/changes 请求可能重复扫描同一 Workspace；控件保留原生 select/checkbox 语义，排序 select 尚未获得同级样式，selected change 使用了当前宿主中接近黑色的 brand token。设计必须继续保持 JSON-safe DTO、只读 Host 边界、无任意目录选择、无新的 RPC 和无全局宿主样式覆盖。

## Goals / Non-Goals

**Goals:**

- 让“尚未完成加载”“确实没有 Workspace”“Workspace 不可用”和“刷新失败但有旧数据”成为不同且可观察的 UI 状态。
- 在 view 卸载/重新挂载之间保留有限的、只存在内存的 Workspace 工作台快照；普通视图切换采用先展示后刷新，Workspace 切换采用 identity 隔离。
- 减少同一 Workspace 短时间内重复的文件扫描和 CLI 探测，同时不放宽 Host 的请求提交门槛和取消/过期保护。
- 让归档筛选、排序、Workspace 选择、selected change、文档导航在 DSH 亮暗主题和窄容器中具有一致的层级、键盘和焦点反馈。
- 将来源与诊断组织为可解释的状态摘要，并保留 OpenSpec artifact identity、文档 revision 和安全截断提示。

**Non-Goals:**

- 不重做完整的 Markdown parser，不引入 shadcn、Lucide、Google Fonts 或其他运行时 UI 依赖。
- 不把 conversation view 改为 `conversation.session` 或接管 DSH 的 shell、composer、Session 导航。
- 不新增写入、apply、verify、archive、sync、任务 checkbox、任意 shell command、任意目录选择或远程缓存。
- 不持久化完整文档、Workspace 索引或跨用户数据；内存快照只作为短期 UI 响应优化，不能成为权限判断依据。

## Decisions

### 1. 用模块级有限内存 store 跨越 view remount

在 `lib/client.js` 的 bundle module scope 建立有上限的 Workbench view store，按 Workspace stable identity、canonical path 和归档可见性保存最近一次成功的 projects/changes/documents/content snapshot，以及 query/filter/sort/includeArchived 等显示状态。组件挂载时从 store 初始化 resource state；成功响应写回 store；组件卸载不主动清空 store，插件 stop/HMR 时由模块生命周期清理可回收资源。

模块级 store 选择是因为 `conversation.view` 离开活动环时组件实例会销毁，而公开的 session store 不适合承载此插件的 Workspace 文件快照。只保存受限 DTO 和必要的选择 identity，不保存 live Context、Service、AbortSignal、完整文档集合或权限信息。设置中的偏好仍走现有 settings 契约，不与快照混合。

**替代方案：**只在组件 state 中保留数据，无法跨 view remount；写入 localStorage 会引入陈旧权限范围、版本迁移和敏感路径持久化风险；把索引放进 Host 持久化则超出只读工作台范围，均不采用。

### 2. 首次加载采用资源状态门控，已有快照采用 stale-while-refresh

projects resource 在 `loading` 阶段显示“正在发现已注册 Workspace”的稳定 skeleton/状态行；只有收到明确的成功空集合后才显示“没有可用 Workspace”。changes 和 documents 分别维护自己的 loading/refreshing/error/empty，不使用顶层 busy 覆盖彼此的结论。

如果 store 中存在相同 Workspace 快照，Workbench 立即渲染 last-good 内容，将 resource phase 设为 `refreshing` 并在工具栏或资源区域显示轻量刷新指示；成功响应原子替换对应 snapshot，失败则保留旧内容并显示局部 retry/error。Workspace identity 改变时先清除当前可见的旧 list/detail，再把新 identity 写入 state，避免 A 内容挂在 B 标题下。

**替代方案：**用全屏 spinner 等待所有 RPC 会放大感知延迟；保留旧数据但不显示 identity/stale 会造成跨 Workspace 误读，均不采用。

### 3. Host 复用短 TTL Workspace scan，但不改变 RPC contract

在 Host 内增加以 canonical Workspace path、Workspace identity 和 includeArchived 为 key 的短生命周期 project snapshot/in-flight promise 复用。`listProjects` 与 `listChanges` 可共享仍有效的扫描结果；force refresh、`scheduleInvalidation`、Workspace path 变化、generation 变化和 TTL 到期会使它失效。复用只覆盖安全的 scan DTO 与有限元数据，CLI status 仍按现有 executable identity/TTL/cache 逻辑单独判断。

任何被新请求取代的扫描、CLI 或文档读取仍必须通过现有 request context、pending map、generation、canonical path 和 signal 检查；缓存命中不能绕过 `requireWorkspace`、OpenSpec root 检查或 symlink/path boundary。

**替代方案：**删除缓存会保留重复扫描 waterfall；永久缓存会使文件/CLI 恢复后长期显示旧结果，均不符合刷新和恢复要求。

### 4. 归档采用单一的可见性与筛选语义

推荐保留状态筛选中的“已归档”，并令其成为显式的 archived 视图：选择它时自动请求/展示 archived changes；普通状态筛选不包含归档。若仍保留“显示归档”控件，则它只能作为“包含归档”总开关，不能与“已归档”产生互相禁止的组合；实现阶段应选定一种并以测试覆盖组合状态。设计默认偏向删除重复 checkbox，减少 toolbar 中两个表达相同意图的控件。

这属于呈现层状态机，不改变 Host 的 `includeArchived` 参数或六个 RPC 名称；归档数据仍需由 identity、provenance 和 freshness 约束。

### 5. 原生控件外观统一，保留平台语义

Workspace 和排序继续使用原生 `<select>`，归档可见性继续使用真实 `<input type="checkbox">`，只在 `.oswb-root` 局部定义 semantic aliases 和控件 class：统一 34–36px 视觉高度、layer/input surface、border-l2/l1、padding、字体、disabled、hover 和 focus-visible。排序使用独立 label/control 结构；归档 label 使用 inline-flex、align-items center 和足够的命中区域。必要时使用局部 CSS background arrow，但不移除原生键盘、系统高对比或读屏行为。

**替代方案：**引入第三方 Select 会增加动态 bundle 依赖和生命周期复杂度；完全自绘弹层会增加焦点、Escape、箭头导航和主题兼容风险，均不采用。

### 6. selected change 使用低噪声 selected surface 与独立 focus

默认 card 使用 hairline border 和 layer-1；hover 只改变低强度 interactive surface/border；selected 使用语义 selected surface、较低强度边界和最多 1–2px 的内侧指示，不再把接近黑色的 brand token 作为整圈重边框。`aria-pressed` 保留，focus-visible ring 单独表达键盘定位，selected/hover/focus 通过边界、surface、文本/标识的组合可区分而不是只靠颜色。

所有颜色在 alias 边界映射到当前 DSH token，并提供接近 DSH baseline 的 fallback；不复制 openspec-ui 的独立渐变、glow 或字体依赖。

### 7. 工件 tab 显示短标签，完整路径作为辅助 identity

详情导航根据 `kind` 或稳定 artifact id 显示“提案/设计/规范/任务/自定义工件”等短名称；完整相对路径通过 `title`、aria-label 和当前文档 metadata 保留。文档切换时让 selected document identity 与 content key 一致，旧内容未完成替换时显示文档级 switching/loading 或仍标注旧文档，而不静默混显。

### 8. 把来源/诊断从结论性 banner 变为分层状态

正常来源显示为紧凑 metadata；partial-data、CLI status 失败、fallback、刷新失败仍作为 role=status/alert 的可读文本保留，但在空间允许时折叠底层 details，仅将“当前影响 + 恢复动作”放在首要层。CLI 版本、status 能力、provenance 和 diagnostics 分开表达，避免“CLI 版本可探测”被理解为“status 一定权威”。错误必须归属 projects、changes、documents 或 content，并提供 retry。

### 9. 真实验收以独立 DSH 3094 为准

打包后使用独立 profile 重启 `http://127.0.0.1:3094`，通过 web-access 验证首次 loading、重复 view 切换、Workspace A/B 隔离、归档/排序/Workspace 控件、selected/hover/focus、文档切换、CLI fallback、刷新失败、亮暗主题、窄容器和无水平溢出。绝不在当前 `http://127.0.0.1:3080` 实例中安装或验证。验收记录应同时检查 DOM 状态、请求 waterfall、截图和 page error，而不是只看 HTTP 200。

## Risks / Trade-offs

- **[模块级快照可能在文件权限变化后短暂过期]** → 每次复用都显示 Workspace identity 与 refreshing/stale，使用 request/generation/TTL 重新验证；快照不参与权限决策。
- **[复用扫描结果可能隐藏刚创建的 change]** → 显式刷新、FS invalidation、短 TTL 和切换回视图时后台刷新会清除或替换快照。
- **[保留旧数据降低等待但增加误读风险]** → 普通 view remount 只复用相同 Workspace key；Workspace 切换先隔离旧内容，标题和来源始终同步。
- **[原生 select 的 arrow 定制跨平台不完全一致]** → 不依赖箭头承载语义，保留原生 select；在 Chromium 亮暗主题和高对比模式检查可读性与 focus。
- **[selected 边框过浅导致选中不明显]** → 结合低强度 surface、1–2px 指示、`aria-pressed`、键盘 focus 和标题/状态文本测试，不仅靠颜色。
- **[删除“显示归档”会改变现有操作习惯]** → 实现前用状态/交互测试确认最终单一语义；若保留控件，明确互斥规则并保持归档筛选可用。
- **[Host snapshot 复用增加并发状态复杂度]** → 使用有限 key、in-flight coalescing、统一失效入口和现有 request context；补充并发/取消/失效 fixture。
- **[动态 bundle 体积增加]** → 使用无依赖的纯 JS/CSS 和有限快照结构，不引入完整组件库或外部字体。

## Migration Plan

1. 先扩展/调整 client 状态与 CSS fixture，确保现有六个 RPC、Typert descriptor、只读边界和旧静态契约仍通过。
2. 增加 module-level bounded view store 与 Host scan reuse；实现资源级 loading/refresh/error/empty 门控和单一归档语义。
3. 更新控件、selected state、artifact labels、source diagnostics 和文档切换呈现；补充亮暗/窄容器/键盘测试。
4. 运行 `npm test`、`npm run check`、`npm pack --dry-run`；将 tgz 安装到独立 scratch profile，重启独立 3094，完成真实 Web 验收。
5. 若 bundle 回归失败，移除 scratch profile 的新包并恢复旧 bundle；由于不写 OpenSpec 文件、不持久化快照且不改变 Session 数据，回滚不需要数据迁移。当前 3080 只在用户自行重启后加载已安装包，不作为本变更验收环境。

## Open Questions

无。归档 checkbox 是否最终移除是实现前可由交互测试直接验证的呈现选择；不改变数据 contract、只读边界或其余设计决策。
