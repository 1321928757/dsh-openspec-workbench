## MODIFIED Requirements

### Requirement: Change 总览与状态解释

工作台 MUST 展示活动 OpenSpec changes，并且 MUST 提供 draft、todo、in-progress、done 和 archived 状态的筛选或等效导航。每个 change 摘要 MUST 暴露稳定 identity、名称、项目 identity、已知的 schema、工件摘要、可用的任务信息、freshness、provenance 和相关诊断。

工作台 MUST 区分 workflow artifact status、tracked task progress、CLI task summary、Apply progress 和 validation evidence。对于权威证据不可用或彼此不一致的情况，工作台 MUST NOT 将文档存在或本地统计的 checkbox 数量表示为实现已完成。CLI 返回的混合记录中，合法记录 MUST 保留并继续展示；非法或无法归一化的记录 MUST 被隔离，并通过 partial-data warning 说明影响范围。来自 CLI 的 change identity MUST 符合单一 change 名称边界；非法 identity 不得被用于后续 CLI 命令或文档路径解析。任务进度 MUST 保持可解释的范围，异常的 done/total 值 MUST 被拒绝、修正并标记诊断，而不得静默显示为可信进度。

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

#### Scenario: CLI 返回部分异常记录

- **WHEN** CLI status 返回的集合同时包含可归一化记录和非法记录
- **THEN** 工作台保留合法记录，隔离非法记录，并显示 partial-data warning，且不得把完整集合标记为无错误的 CLI 结果

#### Scenario: CLI 返回非法 change identity 或异常进度

- **WHEN** CLI status 返回包含路径遍历、空名称、以参数前缀开头的 change identity，或 done 大于 total 的任务进度
- **THEN** 工作台隔离该记录或该进度字段，显示结构化诊断，并不得使用其构造后续 CLI 参数、文档标识或可信完成状态

### Requirement: 权威状态与 fallback 来源

工作台 MUST 优先使用兼容的 OpenSpec CLI 结构化结果来获取 workflow status、工件依赖、instructions、validation 和 diff。如果这些结果不可用、不受支持或执行失败，工作台 MAY 提供有边界的文件扫描发现或文档元数据，但 MUST 标识结果来源并暴露对应限制或诊断。Windows 下由包管理器生成的 `.cmd` 或 `.bat` CLI shim 在受支持的 OpenSpec CLI 版本范围内 MUST 被安全解析或启动，使其行为等同于对应的 OpenSpec CLI；该兼容处理 MUST NOT 引入用户可控的任意 shell 命令执行。CLI 可执行文件解析失败、shim 启动失败、非零退出、超时、取消和结构化输出无效 MUST 产生可区分的结构化诊断，并作为 warning 暴露给工作台，而不是被表示为成功的 CLI 证据。

CLI 版本和能力探测结果 MUST 具有有限有效期，并且 MUST 在显式强制刷新、已知文件系统失效或解析到不同 CLI executable 时重新探测。失败的探测结果 MUST NOT 永久阻止后续恢复。CLI status 的部分记录无效时，系统 MUST 区分 partial-data 与整个命令不可用；只有在没有可安全保留的有效记录时才允许整体使用 fallback。

#### Scenario: 存在兼容的 CLI

- **WHEN** 选中的项目拥有受支持的 OpenSpec CLI，且 CLI 返回有效结构化 status
- **THEN** 工作台使用 CLI 结果作为适用状态面的来源，并标识数据来自 CLI

#### Scenario: Windows CLI 使用 cmd shim

- **WHEN** Windows 上的 OpenSpec CLI 解析结果是包管理器生成的 `.cmd` 或 `.bat` shim，且 shim 指向受支持版本的 OpenSpec CLI
- **THEN** 工作台通过安全的非用户可控执行路径运行 CLI，保留原始参数顺序、Workspace 工作目录、取消、超时和输出限制，并将有效结果标识为 CLI 来源

#### Scenario: CLI 不可用

- **WHEN** OpenSpec CLI 不存在或无法执行
- **THEN** 工作台保留能够安全提供的文件扫描发现信息，将其标记为 fallback，并说明哪些权威状态面不可用

#### Scenario: CLI 版本不受支持

- **WHEN** 检测到的 OpenSpec CLI 不在受支持的兼容窗口内
- **THEN** 工作台对不受支持的 CLI 权威操作 fail-closed，显示检测到的版本和兼容性诊断，不得默默声称结果等同于 CLI 权威状态

#### Scenario: CLI shim 启动失败

- **WHEN** CLI shim 无法安全启动，或底层进程启动返回 `EINVAL` 等执行错误
- **THEN** 工作台将该错误标识为 CLI 执行 warning，保留可用的 file-scan fallback，并且不得将 fallback 结果标识为 CLI 权威结果

#### Scenario: CLI 进程返回非零退出

- **WHEN** OpenSpec CLI 已启动但以非零退出码结束
- **THEN** 工作台显示包含退出码和受限 stderr 诊断的 CLI warning，保留可用的 fallback 数据，并不得把该次结果视为有效 CLI evidence

#### Scenario: CLI 执行超时或被取消

- **WHEN** OpenSpec CLI 超过执行时限或被用户/宿主取消
- **THEN** 工作台显示可区分的 timeout 或 cancelled 诊断，释放进程资源，并保留上一次成功数据或安全 fallback

#### Scenario: 结构化输出格式异常

- **WHEN** CLI 响应或文件派生记录不符合预期数据结构
- **THEN** 工作台丢弃或隔离异常记录，保留其他有效记录，并显示 partial-data 诊断，而不是让整个视图变为空白

#### Scenario: CLI 探测结果过期或环境恢复

- **WHEN** 用户显式刷新、Workspace 发生已知失效，或 CLI executable/version 从不可用变为可用
- **THEN** 工作台重新探测 CLI 能力，并使用新结果替换过期的版本或不可用诊断

### Requirement: 按需读取工件和文档

工作台 MUST 允许用户选择 change 并阅读其可用的规划工件和规范，包括 Markdown 文档和自定义 schema 的工件路径。工作台 MUST 按需加载完整文档内容，保留文档 identity 和 freshness 信息，并在文档过大、不可读、已删除或无法安全解析时提供易于理解的错误或 fallback。文档读取结果 MUST 提供可比较的 revision 或等价变化标识；当内容超过展示上限时 MUST 明确说明已截断及其范围，不得静默把部分内容当作完整文档。

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

#### Scenario: 文档超过客户端展示上限

- **WHEN** Host 返回的文档超过 Client 的安全展示上限
- **THEN** 工作台明确显示已展示的范围、原始大小和继续读取或重试路径；用户不得误以为当前文本是完整内容

### Requirement: 刷新、freshness 与取消

工作台 MUST 支持显式刷新，并 MAY 对有边界的文件系统失效通知作出响应。刷新过程中 MUST 保留上一次成功的数据，MUST 暴露 refreshing 或 stale 状态，并且 MUST 将响应与项目 generation 关联，从而避免过期的 Workspace 或请求结果覆盖当前数据。projects、changes、documents 和 document content 的加载状态 MUST 独立表达，不能由一个共享状态覆盖彼此的完成、失败或刷新阶段。

Workspace 切换 MUST 立即清空或明确隔离前一 Workspace 的 changes、归档 changes、选中 change、文档列表和文档内容；在新 Workspace 快照成功前，界面不得将旧 Workspace 数据呈现为当前 Workspace 数据。切换、刷新和文档选择产生的过期请求 MUST 被取消，或至少在 Host 和 Client 两侧通过 workspace identity、request key 和 generation 被拒绝提交。

#### Scenario: 已有数据时刷新

- **WHEN** 用户刷新一个已经拥有成功 snapshot 的项目
- **THEN** 工作台保持旧 snapshot 可见，标记为 refreshing，并且只在获得有效响应后替换它；如果失败则显示错误并保留旧数据

#### Scenario: 刷新失败

- **WHEN** 刷新因为权限、CLI、文件系统或传输错误失败
- **THEN** 工作台标识失败的操作并提供重试路径，不得用空状态替换之前有效的数据

#### Scenario: 切换 Workspace 时取消旧工作

- **WHEN** 用户在发现或文档加载进行期间切换 Workspace
- **THEN** 工作台取消或使旧请求失效，并且绝不在新 Workspace 下渲染旧请求的结果

#### Scenario: 首次加载正在进行

- **WHEN** 用户首次打开工作台且 projects 或 changes 请求尚未完成
- **THEN** 工作台显示明确的加载中状态，不得把空列表或无 change 空态作为请求成功的结论

#### Scenario: 资源级刷新失败

- **WHEN** documents 或 document content 请求失败而其他资源仍有可用数据
- **THEN** 工作台在受影响的详情区域显示错误和重试路径，保留其他资源的 last-good 数据，并保持错误归属清晰

#### Scenario: Workspace 快照切换

- **WHEN** 用户从 Workspace A 切换到 Workspace B，且 B 的响应尚未完成
- **THEN** Workbench 不显示 A 的 change、归档 change 或文档作为 B 的数据，并在 B 完成前显示切换中或不可用状态

#### Scenario: 过期文档 revision

- **WHEN** 已读取文档的 revision 与刷新后 Host 返回的 revision 不同
- **THEN** 工作台保留旧内容但标记为 stale，并提供重新读取操作
