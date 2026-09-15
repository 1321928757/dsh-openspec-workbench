## MODIFIED Requirements

### Requirement: Change 总览与状态解释

工作台 MUST 展示活动 OpenSpec changes，并且 MUST 提供 draft、todo、in-progress、done 和 archived 状态的筛选或等效导航。每个 change 摘要 MUST 暴露稳定 identity、名称、项目 identity、已知的 schema、工件摘要、可用的任务信息、freshness、provenance 和相关诊断。筛选、排序和归档可见性 MUST 具有一致的语义：用户选择 archived 状态时 MUST 能看到归档结果，不得因为另一个独立开关未开启而产生误导性的空列表。工件导航 MUST 同时提供可读的短标签和完整路径 identity。

工作台 MUST 区分 workflow artifact status、tracked task progress、CLI task summary、Apply progress 和 validation evidence。对于权威证据不可用或彼此不一致的情况，工作台 MUST NOT 将文档存在或本地统计的 checkbox 数量表示为实现已完成。CLI 返回的混合记录中，合法记录 MUST 保留并继续展示；非法或无法归一化的记录 MUST 被隔离，并通过 partial-data warning 说明影响范围。来自 CLI 的 change identity MUST 符合单一 change 名称边界；非法 identity 不得被用于后续 CLI 命令或文档路径解析。任务进度 MUST 保持可解释的范围，异常的 done/total 值 MUST 被拒绝、修正并标记诊断，而不得静默显示为可信进度。来源、CLI 能力和诊断 MUST 以不互相矛盾的方式呈现。

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

#### Scenario: 归档筛选与归档可见性一致

- **WHEN** 用户选择“已归档”状态筛选，或启用包含归档数据的视图
- **THEN** 工作台加载并展示对应的 archived changes，并明确当前筛选/可见性状态，不得显示一个由归档数据未加载导致的误导性空态

#### Scenario: 工件路径过长

- **WHEN** change 的工件路径超过详情导航适合显示的长度
- **THEN** 工作台使用可识别的工件短标签进行导航，并通过 title、辅助文本或等价可访问名称保留完整路径

#### Scenario: CLI 版本与 status 能力不一致

- **WHEN** CLI 版本探测成功但 status 命令不可用、返回空安全数据或回退到文件扫描
- **THEN** 工作台分别说明 CLI 版本、当前状态来源和不可用/降级原因，不得同时呈现为无条件的 CLI 权威结果

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

工作台从其他 conversation view 重新进入时 MUST 优先复用当前会话可用的上一次成功 Workspace 快照、筛选偏好和选中上下文，并在后台刷新；首次没有快照时 MUST 显示稳定的加载状态。只有 projects 请求明确完成且返回空集合时，工作台才可显示“没有可用的已注册 Workspace”。普通视图切换的后台刷新 MUST 不把已有列表替换为结论性空态。Workspace 切换仍 MUST 立即隔离旧 Workspace 的 changes、归档 changes、选中 change、文档列表和文档内容，并在新 Workspace 快照完成前明确标示切换中。

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

#### Scenario: 首次加载尚未完成

- **WHEN** 用户首次进入工作台且 Workspace 或 changes 请求仍在进行
- **THEN** 工作台展示对应资源的 loading/skeleton 或“正在发现/加载”状态，不得显示“没有可用 Workspace”或“暂无活动 changes”等结论性空态

#### Scenario: 视图切换回已有 Workspace

- **WHEN** 用户从对话切回 OpenSpec，且此前已经成功加载过同一 Workspace 的数据
- **THEN** 工作台立即展示上次成功快照并标示后台刷新，刷新成功后替换数据；刷新失败时保留快照并显示可恢复的资源级错误

#### Scenario: 重复进入工作台

- **WHEN** 用户在对话与 OpenSpec 之间反复切换
- **THEN** 工作台不得在每次重新挂载时把已有数据重置为空白再等待完整请求，且请求数量和等待过程应保持在可解释范围内

#### Scenario: Workspace 切换期间隔离数据

- **WHEN** 用户从 Workspace A 切换到 Workspace B，且 B 的数据尚未完成
- **THEN** 工作台清空或明确隔离 A 的 change、归档 change 和文档内容，展示 B 的切换中状态，且不得将 A 的结果呈现为 B 的数据

#### Scenario: 文档切换期间保持 identity 一致

- **WHEN** 用户从一个文档快速切换到另一个文档，而新文档内容尚未完成
- **THEN** 工作台不得无提示地将新文档路径与旧文档正文混显；应显示文档级加载/切换状态，或明确标示旧内容仍属于前一文档

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

工作台的 Workspace 选择、排序、归档可见性和状态筛选控件 MUST 使用一致的 DSH 主题化视觉语言。原生 select/checkbox 可以保留其语义和键盘行为，但其尺寸、边界、背景、箭头/文本对齐、hover、focus-visible 和 disabled 状态 MUST 与其他工作台控件协调。普通 change selected 状态 MUST 使用低噪声 selected surface 与可辨识但不过重的边界/指示，MUST 与 hover 和 focus-visible 状态区分，不得依赖高饱和或过深的整圈边框作为唯一选择表达。颜色 MUST 来自 DSH 主题令牌或语义别名，且亮色和暗色主题均保持可读。

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

#### Scenario: 归档开关文字垂直对齐

- **WHEN** 用户在桌面或窄容器查看归档可见性控件
- **THEN** checkbox 与“显示归档”文字在同一控件中垂直居中，控件具备完整可点击区域，并且键盘焦点清晰可见

#### Scenario: Workspace 与排序控件一致

- **WHEN** 用户查看或操作 Workspace 选择和排序下拉框
- **THEN** 两者具有一致的高度、字体、内边距、边界、背景、箭头和 focus-visible 反馈；长名称可截断但完整值仍可访问

#### Scenario: Change 选中态低噪声

- **WHEN** 用户选择一个 change，并在其上移动指针或使用键盘聚焦
- **THEN** selected、hover、focus-visible 三种状态均可区分，selected 不使用过深的整圈边框或大面积左侧色条，同时不降低选择状态的可辨识性

#### Scenario: 窄容器工作台

- **WHEN** 工作台在窄容器中渲染
- **THEN** 工具栏控件可换行或折叠而不产生水平溢出，状态和归档筛选仍可操作，change 导航与详情阅读能力不丢失

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
