## Purpose

本能力为 DSH 用户提供一个可信、面向 Workspace 且只读的 OpenSpec 工作台，用于发现未完成工作、理解工作流和任务状态，并在 AI 辅助开发环境中阅读相关规划文档。

## ADDED Requirements

### Requirement: 面向 Workspace 的 OpenSpec 发现

工作台 MUST 使用已注册的 DSH Workspace 作为默认范围，并且 MUST 在展示项目数据前识别该 Workspace 下的 OpenSpec 根目录。工作台 MUST 允许用户在包含可读 OpenSpec 根目录的已注册 Workspace 之间切换，并且 MUST 使用稳定的 Workspace identity，而不是展示名称作为项目身份。

#### Scenario: 当前 Workspace 包含 OpenSpec

- **WHEN** 用户打开工作台，当前已注册 Workspace 包含可读的 OpenSpec 根目录
- **THEN** 工作台默认选择该 Workspace，并展示其 OpenSpec 项目摘要

#### Scenario: Workspace 不包含 OpenSpec 根目录

- **WHEN** 选中的 Workspace 不存在 OpenSpec 根目录，或该根目录无法识别
- **THEN** 工作台展示明确的不可用或空状态并解释原因，不得把空结果呈现为项目确实没有 change 的证明

#### Scenario: 用户切换 Workspace

- **WHEN** 用户选择另一个包含可读 OpenSpec 根目录的已注册 Workspace
- **THEN** 工作台使用新 Workspace 的数据替换当前项目数据，标识选中的项目身份，并忽略属于前一个 Workspace 的响应

### Requirement: Change 总览与状态解释

工作台 MUST 展示活动 OpenSpec changes，并且 MUST 提供 draft、todo、in-progress、done 和 archived 状态的筛选或等效导航。每个 change 摘要 MUST 暴露稳定 identity、名称、项目 identity、已知的 schema、工件摘要、可用的任务信息、freshness、provenance 和相关诊断。

工作台 MUST 区分 workflow artifact status、tracked task progress、CLI task summary、Apply progress 和 validation evidence。对于权威证据不可用或彼此不一致的情况，工作台 MUST NOT 将文档存在或本地统计的 checkbox 数量表示为实现已完成。

#### Scenario: 存在多个 change

- **WHEN** 选中的项目包含多个活动 change
- **THEN** 工作台列出每个 change 的可读状态摘要，并允许用户搜索、筛选或排序列表

#### Scenario: Change 存在未满足的工件依赖

- **WHEN** change 包含工件依赖信息，且存在缺失的前置工件
- **THEN** 工作台标识被阻塞的工件，并列出缺失的前置工件

#### Scenario: 多个进度来源不一致

- **WHEN** workflow readiness、任务 checkbox、Apply progress 或 validation evidence 描述的状态不一致
- **THEN** 工作台以独立标签展示这些事实，不得将它们合并为单一完成状态

#### Scenario: 使用自定义工作流 schema

- **WHEN** change 标识了自定义工作流 schema，且其工件不同于默认 spec-driven 名称
- **THEN** 工作台根据 schema 和工件 identity 动态展示内容，不要求 proposal、design、specs 或 tasks 必须存在

#### Scenario: 没有活动 change

- **WHEN** 选中的项目具有可读 OpenSpec 根目录，但没有活动 change
- **THEN** 工作台展示说明性的空状态，并在存在归档数据时提供查看 archived changes 的方式

### Requirement: 权威状态与 fallback 来源

工作台 MUST 优先使用兼容的 OpenSpec CLI 结构化结果来获取 workflow status、工件依赖、instructions、validation 和 diff。如果这些结果不可用、不受支持或执行失败，工作台 MAY 提供有边界的文件扫描发现或文档元数据，但 MUST 标识结果来源并暴露对应限制或诊断。

#### Scenario: 存在兼容的 CLI

- **WHEN** 选中的项目拥有受支持的 OpenSpec CLI，且 CLI 返回有效结构化 status
- **THEN** 工作台使用 CLI 结果作为适用状态面的来源，并标识数据来自 CLI

#### Scenario: CLI 不可用

- **WHEN** OpenSpec CLI 不存在或无法执行
- **THEN** 工作台保留能够安全提供的文件扫描发现信息，将其标记为 fallback，并说明哪些权威状态面不可用

#### Scenario: CLI 版本不受支持

- **WHEN** 检测到的 OpenSpec CLI 不在受支持的兼容窗口内
- **THEN** 工作台对不受支持的 CLI 权威操作 fail-closed，显示检测到的版本和兼容性诊断，不得默默声称结果等同于 CLI 权威状态

#### Scenario: 结构化输出格式异常

- **WHEN** CLI 响应或文件派生记录不符合预期数据结构
- **THEN** 工作台丢弃或隔离异常记录，保留其他有效记录，并显示 partial-data 诊断，而不是让整个视图变为空白

### Requirement: 按需读取工件和文档

工作台 MUST 允许用户选择 change 并阅读其可用的规划工件和规范，包括 Markdown 文档和自定义 schema 的工件路径。工作台 MUST 按需加载完整文档内容，保留文档 identity 和 freshness 信息，并在文档过大、不可读、已删除或无法安全解析时提供易于理解的错误或 fallback。

#### Scenario: 用户打开 change

- **WHEN** 用户从总览中选择一个 change
- **THEN** 工作台在可导航的列表-详情阅读器中展示其可用工件和规范文档

#### Scenario: 用户选择工件

- **WHEN** 用户选择一个可读的工件文档
- **THEN** 工作台加载并渲染其 Markdown 内容，同时显示文档路径以及当前 freshness/provenance 状态

#### Scenario: 阅读期间文档发生变化

- **WHEN** 文档在加载后发生变化，或刷新使其 generation 失效
- **THEN** 工作台将已展示内容标记为 stale，在新数据可用前保留旧内容，并提供明确的刷新路径

#### Scenario: 文档无法读取

- **WHEN** 选中的文档缺失、过大、被拒绝访问、是二进制文件或不适合安全渲染
- **THEN** 工作台展示文档范围内的错误，包含路径和已知原因，并提供重试或返回列表的操作，不得影响整个工作台

### Requirement: 刷新、freshness 与取消

工作台 MUST 支持显式刷新，并 MAY 对有边界的文件系统失效通知作出响应。刷新过程中 MUST 保留上一次成功的数据，MUST 暴露 refreshing 或 stale 状态，并且 MUST 将响应与项目 generation 关联，从而避免过期的 Workspace 或请求结果覆盖当前数据。

#### Scenario: 已有数据时刷新

- **WHEN** 用户刷新一个已经拥有成功 snapshot 的项目
- **THEN** 工作台保持旧 snapshot 可见，标记为 refreshing，并且只在获得有效响应后替换它；如果失败则显示错误并保留旧数据

#### Scenario: 刷新失败

- **WHEN** 刷新因为权限、CLI、文件系统或传输错误失败
- **THEN** 工作台标识失败的操作并提供重试路径，不得用空状态替换之前有效的数据

#### Scenario: 切换 Workspace 时取消旧工作

- **WHEN** 用户在发现或文档加载进行期间切换 Workspace
- **THEN** 工作台取消或使旧请求失效，并且绝不在新 Workspace 下渲染旧请求的结果

### Requirement: 安全的只读边界

首个版本 MUST 是只读的。它 MUST NOT 编辑、创建、删除、重命名、归档、同步、apply、verify 或切换 OpenSpec 工件/任务 checkbox，并且 MUST NOT 执行用户提供的任意 shell command。Host 侧读取和 CLI 检查 MUST 限制在选中的已注册 Workspace 及其 OpenSpec 根目录内。

#### Scenario: 用户查看文档

- **WHEN** 用户读取 OpenSpec 文档
- **THEN** 工作台不执行任何 mutation，源文件保持不变

#### Scenario: 用户尝试不支持的 mutation

- **WHEN** 用户遇到首个版本中会编辑、apply、verify 或 archive OpenSpec 数据的操作
- **THEN** 该操作不存在或明确显示不可用，并说明当前版本为只读版本

#### Scenario: 请求包含路径遍历

- **WHEN** 请求尝试路径遍历、访问选中 Workspace 外的绝对路径或通过 symlink 逃逸
- **THEN** Host 拒绝请求，并返回结构化的权限或路径边界诊断，不读取目标内容

#### Scenario: 执行 CLI 检查

- **WHEN** 工作台调用 OpenSpec CLI 检查命令
- **THEN** 命令以选中的 Workspace 作为工作目录，使用经过校验且不经过 shell 插值的参数，并应用 Host 的取消和执行策略

### Requirement: DSH 原生且可访问的呈现

工作台 MUST 作为可叠加的 DSH conversation view 出现，并且 MUST NOT 替换完整的 conversation session shell。它 MUST 提供适合桌面和窄容器的可读布局、可通过键盘操作的导航和操作、可见焦点状态、安全 Markdown 渲染，以及明确的 loading、empty、unavailable、stale、permission、partial-data 和 error 状态。

#### Scenario: 用户切换到工作台

- **WHEN** 用户在 DSH conversation view ring 中选择 OpenSpec view
- **THEN** 工作台占据主视图区域，而 DSH Chat shell、composer、header、draft 行为和 Session 导航仍由宿主负责并可用

#### Scenario: 使用窄容器

- **WHEN** 工作台在窄容器中渲染
- **THEN** change/artifact 导航折叠为 drawer 或等效的单栏控件，文档阅读器保持水平容纳，并且导航能力不丢失

#### Scenario: 使用键盘导航

- **WHEN** 用户使用键盘操作工作台
- **THEN** 用户可以通过所有可用路径完成 focus、选择、展开、折叠、刷新、重试和返回，并能看到焦点状态，关键内容不依赖 hover-only 信息

#### Scenario: Markdown 包含不安全内容

- **WHEN** 文档包含 raw HTML、不安全链接或其他不能安全渲染的内容
- **THEN** 工作台对不安全呈现进行清理或省略，同时保持其余文档阅读能力可用

### Requirement: 可选的上下文入口

工作台 MAY 提供 slash command、conversation assistant action 或 input affordance，用于打开工作台或选中的 change。任何此类入口 MUST 是可叠加的，MUST 保留当前 conversation transcript，并且在相关 Host slot 或导航能力不存在时 MUST 优雅降级。

#### Scenario: 从 Chat 打开 change

- **WHEN** 可用的上下文入口指向一个 OpenSpec change
- **THEN** 工作台打开并选中该 change，且不向 conversation transcript 添加 synthetic message

#### Scenario: 上下文能力不可用

- **WHEN** Host 不提供可选入口 Slot 或导航能力
- **THEN** 主工作台视图仍然可用，插件不得因该可选能力缺失而激活失败

### Requirement: Settings 只保存偏好

工作台 MAY 暴露展示默认值、归档可见性、刷新行为或只读偏好的用户设置。Settings MUST 只包含 JSON-compatible 偏好，并且 MUST NOT 保存完整文档、Workspace 索引、secret 或作为读取权限依据的任意文件系统路径。

#### Scenario: 用户修改展示偏好

- **WHEN** 用户修改受支持的工作台展示偏好
- **THEN** 偏好通过 DSH settings 契约持久化，并影响后续工作台呈现，但不修改 OpenSpec 文件

#### Scenario: Settings service 不可用

- **WHEN** Host 不提供可选的 settings surface
- **THEN** 工作台使用已记录的默认值，在没有 settings card 的情况下仍然可用
