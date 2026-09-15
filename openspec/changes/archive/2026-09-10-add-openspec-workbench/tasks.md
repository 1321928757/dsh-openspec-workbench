## 1. Bundle 与运行时契约

- [x] 1.1 创建可发布的 profile-bundle 包元数据、Host 入口、Web Client 入口和 Cordis patch；验证 `npm pack --dry-run` 包含声明的 bundle/client 产物，并且生成的 JavaScript 通过 `node --check`。
- [x] 1.2 检查已安装 DSH runtime 中实际的 `conversation.view`、settings、locale、Typert、Workspace、filesystem 和 sandbox 契约，并在实现中记录兼容的 inject 与 Slot 注册字段；验证 bundle 加载时没有 unknown-slot 或 descriptor validation 错误。
- [x] 1.3 定义 Workspace/project 摘要、changes、artifacts、documents、status evidence、provenance、freshness、generation 和结构化 diagnostics 的 JSON-safe DTO 与 Typert codec；验证 valid、absent、malformed 和 partial payload fixture 能按规范被接受或拒绝。

## 2. Host Workspace 与 OpenSpec adapter

- [x] 2.1 实现仅限已注册 DSH Workspace identity 及其 canonical path 的发现逻辑，包括 OpenSpec 根目录检测和明确的缺失/不可读结果；通过单元测试验证未注册路径和 Workspace identity 冲突会被拒绝。
- [x] 2.2 实现有边界的 OpenSpec 目录扫描，获取项目元数据、change/document inventory、归档可见性和基本 fallback 发现能力；不得把文件存在或本地 checkbox 数量当作权威工作流完成状态；验证 marker-only、legacy、archived、malformed 和 empty fixture。
- [x] 2.3 实现 OpenSpec CLI 兼容性探测和精确 argv 执行 adapter，目标版本为 `>=1.12.0 <1.13.0`；验证兼容输出可被接受，不支持的版本对 CLI 权威能力 fail-closed，进程失败能提供诊断，且无法进行 shell 插值。
- [x] 2.4 实现 CLI status normalization，保留动态 schema artifact ID、依赖/缺失依赖、planning facts、tracked task progress、CLI task summary、Apply progress、validation evidence 和 provenance 等独立字段；验证自定义 schema 及进度冲突 fixture。
- [x] 2.5 通过 Typert 实现 Host 方法，用于列出指定范围的 projects/changes/documents、读取单个有边界的文档，并请求可选 status/evidence facet；验证路径 containment、symlink/traversal 拒绝、文件大小限制、取消、超时和结构化错误响应。
- [x] 2.6 增加 generation/revision 处理和针对外部文件变化的 debounce 刷新失效逻辑，在刷新期间保留 last-good snapshot；验证 stale 标记、被替代请求取消和不同 Workspace 之间不发生响应泄漏。

## 3. Client OpenSpec 工作台视图

- [x] 3.1 注册可叠加的 session-scoped `conversation.view`，渲染 DSH 原生工作台 shell，但不接管 `conversation.session`；通过集成 fixture 验证 Chat composer、header、draft 行为和 Session 导航仍由宿主负责。
- [x] 3.2 实现 Workspace 选择、项目摘要、refresh/stale 指示器、状态统计、搜索、筛选、排序、归档可见性和列表/Kanban 展示；验证当前 Workspace 默认选择、Workspace 切换、空状态和部分诊断。
- [x] 3.3 实现动态 artifact chain 和 change detail 展示，区分 workflow status、task progress、CLI evidence、Apply progress、validation、freshness 和 provenance；验证阻塞依赖、自定义工件、缺少 tasks、零任务和状态不一致。
- [x] 3.4 实现响应式列表-详情文档阅读器，用于 proposal/design/spec/task/archive/custom artifact，包含安全 Markdown 渲染、文档导航、有边界内容提示和隔离的文档错误；验证桌面、窄容器、异常/不安全 Markdown、缺失、过大和权限拒绝 fixture。
- [x] 3.5 增加视图级 ErrorBoundary，并完成 loading、refreshing、stale、unavailable、empty、permission、partial-data、parse-error 和 retry 状态；验证刷新失败时旧数据保持可见，异常文档不会让工作台空白。
- [x] 3.6 使用带 namespace 的样式和已确认的宿主 token，实现键盘、focus-visible、reduced-motion、长文本以及 DSH 亮/暗主题行为；验证仅用键盘可操作，并且窄容器宽度下没有水平溢出。

## 4. 可选的上下文与设置界面

- [x] 4.1 增加可选 slash command 或 conversation assistant action，用于选择/打开工作台中的 change，且不写入 transcript；验证可选 Slot 或导航能力不存在时，主工作台视图仍可用。
- [x] 4.2 增加可选 settings card，用于保存展示默认值、归档可见性、刷新行为和只读偏好，且只使用 JSON-compatible 的 DSH settings；验证 settings 缺失、持久化、revision conflict，以及不保存文档/索引/secret。

## 5. 验证与发布准备

- [x] 5.1 为路径边界、CLI 版本/能力协商、argv 构造、status normalization、自定义 schema、异常 DTO、文档限制、provenance、freshness、generation 和取消增加单元测试；验证 Host 测试套件通过。
- [x] 5.2 为列表/详情导航、工件和进度语义、loading/error/empty/stale 状态、Workspace 切换、安全 Markdown、键盘行为、响应式降级和主题 token 增加 Client/component 测试；验证 Client 测试套件通过（已补充 `test/client.test.mjs`，覆盖 view 注册、Workspace/Session 快照、请求 epoch、stale 保留、状态字段、文档读取、安全 Markdown、ErrorBoundary、ARIA、响应式 CSS 与 Typert descriptor）。
- [x] 5.3 运行 typecheck、lint、bundle smoke 和包验证；验证 `pnpm run typecheck`、`pnpm test`（或包自身的等价命令）、bundle smoke 与 `npm pack --dry-run` 全部通过。
- [x] 5.4 将打包后的 bundle 安装到 scratch DSH profile，并在独立测试 DSH 实例（默认 `http://127.0.0.1:3094`，不得使用用户当前实例 `http://127.0.0.1:3080`）重启实际 Host 后，通过 `web-access` skill 验证；覆盖兼容 CLI、不支持 CLI、无 OpenSpec 根目录、自定义 schema、异常文档、stale 刷新、亮/暗主题、窄布局、仅键盘流程和只读保证。（已在独立 `http://127.0.0.1:3094` 完成 bundle 安装、Host 启动、Client bundle 加载和非 blank Session 交互验收；已验证正确 Typert namespace、项目/文件扫描 fallback、change 列表、文档清单与 proposal 阅读、归档开关、搜索空状态、排序、刷新旧数据保留、键盘 focus 和无水平溢出。CLI 不可用时显示 `spawn EINVAL` 诊断并保留 file-scan 结果。）
- [x] 5.5 编写首个版本的兼容窗口、只读范围、fallback 语义、已知诊断、安装/更新流程和未来 mutation 边界文档；验证 README 声明与已发布包一致，且没有修改 OpenSpec 仓库文件。
