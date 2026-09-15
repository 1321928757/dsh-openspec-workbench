## MODIFIED Requirements

### Requirement: 面向 Workspace 的 OpenSpec 发现

工作台 MUST 使用已注册的 DSH Workspace 作为默认范围，并且 MUST 使用 DSH 提供的注册 Workspace 列表和当前 Session/Workspace identity 确定首选 Workspace。进入工作台时，当前 Workspace 的 OpenSpec 根目录和项目摘要 MUST 优先加载；其他已注册 Workspace 的 OpenSpec 发现 MUST NOT 阻塞当前 Workspace 首次可用。工作台 MUST 在展示项目数据前识别当前选中 Workspace 下的 OpenSpec 根目录，MUST 允许用户在已注册 Workspace 之间切换，并且 MUST 使用稳定的 Workspace identity，而不是展示名称作为项目身份。

Host MUST 支持按 Workspace identity 限定的项目发现请求。未限定 Workspace 的兼容性全量发现 MAY 保留，但不得成为 Workbench 当前 Workspace 首屏可用的必要条件；全量发现中的单个慢或不可用 Workspace MUST NOT 使已限定的当前 Workspace 请求失败或持续等待。

#### Scenario: 当前 Workspace 包含 OpenSpec

- **WHEN** 用户打开工作台，当前 Session 对应的已注册 Workspace 包含可读的 OpenSpec 根目录
- **THEN** 工作台立即以该 Workspace identity 作为首选范围，只请求或展示该 Workspace 的 OpenSpec 项目摘要，并在其他 Workspace 尚未处理时仍可用

#### Scenario: Workspace 不包含 OpenSpec 根目录

- **WHEN** 选中的 Workspace 不存在 OpenSpec 根目录，或该根目录无法识别
- **THEN** 工作台展示明确的不可用或空状态并解释原因，不得把空结果呈现为项目确实没有 change 的证明，也不得等待其他 Workspace 扫描完成后才给出该结论

#### Scenario: 用户切换 Workspace

- **WHEN** 用户选择另一个已注册 Workspace
- **THEN** 工作台立即切换到新 Workspace identity，清除或隔离旧 Workspace 的 OpenSpec 数据，并只提交新 Workspace 的 root/summary 请求；旧 Workspace 的迟到响应不得覆盖新 Workspace

### Requirement: Change 总览与状态解释

工作台 MUST 展示选中 Workspace 的活动 OpenSpec changes，并且 MUST 提供 draft、todo、in-progress、done 和 archived 状态的筛选或等效导航。普通活动视图 MUST 只加载当前 Workspace 的活动 change 摘要，不得为了首屏建立整个 OpenSpec 根目录的文档索引或递归加载归档目录。每个 change 摘要 MUST 暴露稳定 identity、名称、项目 identity、已知的 schema、工件摘要、可用的任务信息、freshness、provenance 和相关诊断；需要完整文档元数据或自定义工件路径时 MUST 支持在用户选中 change 后按需补全。筛选、排序和归档可见性 MUST 具有一致的语义：用户选择 archived 状态时 MUST 触发或复用对应 archive scope 的加载并能看到归档结果，不得因为另一个独立开关未开启而产生误导性的空列表。工件导航 MUST 同时提供可读的短标签和完整路径 identity。

非当前 Workspace 的 change 发现 MAY 在当前 Workspace 首次成功后通过有界、可取消的后台预热执行，但 MUST NOT 阻塞当前 Workspace、改变当前资源的 loading/error 结论或使用错误 identity 提交结果。默认行为可以完全不预热非当前 Workspace。

工作台 MUST 区分 workflow artifact status、tracked task progress、CLI task summary、Apply progress 和 validation evidence。对于权威证据不可用或彼此不一致的情况，工作台 MUST NOT 将文档存在或本地统计的 checkbox 数量表示为实现已完成。CLI 返回的混合记录中，合法记录 MUST 保留并继续展示；非法或无法归一化的记录 MUST 被隔离，并通过 partial-data warning 说明影响范围。来自 CLI 的 change identity MUST 符合单一 change 名称边界；非法 identity 不得被用于后续 CLI 命令或文档路径解析。任务进度 MUST 保持可解释的范围，异常的 done/total 值 MUST 被拒绝、修正并标记诊断，而不得静默显示为可信进度。来源、CLI 能力和诊断 MUST 以不互相矛盾的方式呈现。

#### Scenario: 存在多个 change

- **WHEN** 选中的 Workspace 的活动范围包含多个 change
- **THEN** 工作台先列出有界的 change 摘要，并允许用户搜索、筛选或排序；完整文档正文和非必要文档树信息不在此阶段加载

#### Scenario: Change 存在未满足的工件依赖

- **WHEN** change 包含工件依赖信息，且存在缺失的前置工件
- **THEN** 工作台标识被阻塞的工件，并列出缺失的前置工件；如果该事实只能在按需读取或 CLI evidence 中确认，工作台必须标示其来源和当前加载阶段

#### Scenario: 多个进度来源不一致

- **WHEN** workflow readiness、任务 checkbox、Apply progress 或 validation evidence 描述的状态不一致
- **THEN** 工作台以独立标签展示这些事实，不得将它们合并为单一完成状态

#### Scenario: 使用自定义工作流 schema

- **WHEN** change 标识了自定义工作流 schema，且其工件不同于默认 spec-driven 名称
- **THEN** 工作台根据已加载的 schema 和工件 identity 动态展示内容，不要求 proposal、design、specs 或 tasks 必须存在；未选中 change 前可以只展示有界摘要，选中后必须提供补全路径

#### Scenario: 没有活动 change

- **WHEN** 选中的 Workspace 具有可读 OpenSpec 根目录，但当前活动范围没有 change
- **THEN** 工作台展示说明性的空状态；如果归档范围尚未加载，必须提供正在加载或可查看 archived changes 的明确入口，而不得将未加载 archive 当作已确认的空集合

#### Scenario: CLI 返回部分异常记录

- **WHEN** CLI status 返回的集合同时包含可归一化记录和非法记录
- **THEN** 工作台保留合法记录，隔离非法记录，并显示 partial-data warning，且不得把完整集合标记为无错误的 CLI 结果

#### Scenario: CLI 返回非法 change identity 或异常进度

- **WHEN** CLI status 返回包含路径遍历、空名称、以参数前缀开头的 change identity，或 done 大于 total 的任务进度
- **THEN** 工作台隔离该记录或该进度字段，显示结构化诊断，并不得使用其构造后续 CLI 参数、文档标识或可信完成状态

#### Scenario: 归档筛选与归档可见性一致

- **WHEN** 用户选择“已归档”状态筛选，或启用包含归档数据的视图
- **THEN** 工作台只为当前 Workspace 加载或复用 archive scope，明确显示 loading/refreshing/error/empty 阶段，并在请求成功后展示对应 archived changes，不得显示一个由归档数据尚未加载导致的误导性空态

#### Scenario: 工件路径过长

- **WHEN** change 的工件路径超过详情导航适合显示的长度
- **THEN** 工作台使用可识别的工件短标签进行导航，并通过 title、辅助文本或等价可访问名称保留完整路径

#### Scenario: CLI 版本与 status 能力不一致

- **WHEN** CLI 版本探测成功但 status 命令不可用、返回空安全数据或回退到文件扫描
- **THEN** 工作台分别说明 CLI 版本、当前状态来源和不可用/降级原因，不得同时呈现为无条件的 CLI 权威结果

### Requirement: 刷新、freshness 与取消

工作台 MUST 支持显式刷新，并 MAY 对有边界的文件系统失效通知作出响应。刷新过程中 MUST 优先复用同一 Workspace identity、canonical path 和 scope 的最近成功 snapshot 或 Host scan cache，MUST 保留上一次成功的数据，MUST 暴露 refreshing 或 stale 状态，并且 MUST 将响应与项目 generation 关联，从而避免过期的 Workspace 或请求结果覆盖当前数据。Host MUST 对相同 scope 的并发 scan 请求进行 in-flight 合并，并对 cache 设置有限有效期；缓存不得成为权限判断依据。projects、changes、documents 和 document content 的加载状态 MUST 独立表达，不能由一个共享状态覆盖彼此的完成、失败或刷新阶段。

进入工作台时 MUST 优先请求当前 Workspace，而不得等待其他 Workspace 的全量扫描。非当前 Workspace 的后台预热（如果启用） MUST 有界、可取消、有独立错误/超时状态，并且 MUST NOT 延迟当前 Workspace 首次可用或提交到当前资源。单个慢 Workspace、慢文件系统或 CLI 操作 MUST 在有界预算后进入资源级 timeout/error，并保留同 identity 的 last-good 数据或可重试状态，而不得无限显示全局 loading。

Workspace 切换 MUST 立即清空或明确隔离前一 Workspace 的 changes、归档 changes、选中 change、文档列表和文档内容；在新 Workspace 快照成功前，界面不得将旧 Workspace 数据呈现为当前 Workspace 数据。切换、刷新和文档选择产生的过期请求 MUST 被取消，或至少在 Host 和 Client 两侧通过 workspace identity、request key 和 generation 被拒绝提交。

工作台从其他 conversation view 重新进入时 MUST 优先复用当前会话可用的上一次成功 Workspace 快照、筛选偏好和选中上下文，并在后台刷新；首次没有快照时 MUST 显示稳定的加载状态。只有 projects 请求明确完成且返回空集合时，工作台才可显示“没有可用的已注册 Workspace”。普通视图切换的后台刷新 MUST 不把已有列表替换为结论性空态。Workspace 切换仍 MUST 立即隔离旧 Workspace 的 changes、归档 changes、选中 change、文档列表和文档内容，并在新 Workspace 快照完成前明确标示切换中。

#### Scenario: 已有数据时刷新

- **WHEN** 用户刷新一个已经拥有成功 snapshot 的项目
- **THEN** 工作台保持旧 snapshot 可见，标记为 refreshing，并且只在获得有效响应后替换它；如果失败或超时则显示归属该资源的错误并保留旧数据

#### Scenario: 刷新失败

- **WHEN** 刷新因为权限、CLI、文件系统、超时或传输错误失败
- **THEN** 工作台标识失败的操作并提供重试路径，不得用空状态替换之前有效的数据

#### Scenario: 切换 Workspace 时取消旧工作

- **WHEN** 用户在发现或文档加载进行期间切换 Workspace
- **THEN** 工作台取消或使旧请求失效，并且绝不在新 Workspace 下渲染旧请求的结果；新 Workspace 的请求不需要等待旧 Workspace 的后台任务清理完成

#### Scenario: 首次加载正在进行

- **WHEN** 用户首次打开工作台且当前 Workspace 的 root 或 changes 请求尚未完成
- **THEN** 工作台显示明确的当前资源加载中状态，不得把空列表、无 Workspace 或暂无 change 空态作为请求成功的结论，也不得因为其他 Workspace 尚未加载而扩大等待范围

#### Scenario: 资源级刷新失败

- **WHEN** documents 或 document content 请求失败而其他资源仍有可用数据
- **THEN** 工作台在受影响的详情区域显示错误和重试路径，保留其他资源的 last-good 数据，并保持错误归属清晰

#### Scenario: Workspace 快照切换

- **WHEN** 用户从 Workspace A 切换到 Workspace B，且 B 的响应尚未完成
- **THEN** Workbench 不显示 A 的 change、归档 change 或文档作为 B 的数据，并在 B 完成前显示切换中或不可用状态；A 的 cache 只能为之后回到 A 时复用

#### Scenario: 过期文档 revision

- **WHEN** 已读取文档的 revision 与刷新后 Host 返回的 revision 不同
- **THEN** 工作台保留旧内容但标记为 stale，并提供重新读取操作

#### Scenario: 首次加载尚未完成

- **WHEN** 用户首次进入工作台且当前 Workspace 或 changes 请求仍在进行
- **THEN** 工作台展示对应资源的 loading/skeleton 或“正在发现/加载”状态，不得显示“没有可用 Workspace”或“暂无活动 changes”等结论性空态

#### Scenario: 视图切换回已有 Workspace

- **WHEN** 用户从对话切回 OpenSpec，且此前已经成功加载过同一 Workspace 的数据
- **THEN** 工作台立即展示上次成功快照并标示后台刷新，刷新成功后替换数据；刷新失败时保留快照并显示可恢复的资源级错误

#### Scenario: 重复进入工作台

- **WHEN** 用户在对话与 OpenSpec 之间反复切换
- **THEN** 工作台不得在每次重新挂载时把已有数据重置为空白再等待完整请求，同一 Workspace/scope 的请求应优先命中 snapshot 或共享 in-flight，且请求数量和等待过程应保持在可解释范围内

#### Scenario: Workspace 切换期间隔离数据

- **WHEN** 用户从 Workspace A 切换到 Workspace B，且 B 的数据尚未完成
- **THEN** 工作台清空或明确隔离 A 的 change、归档 change 和文档内容，展示 B 的切换中状态，且不得将 A 的结果呈现为 B 的数据

#### Scenario: 文档切换期间保持 identity 一致

- **WHEN** 用户从一个文档快速切换到另一个文档，而新文档内容尚未完成
- **THEN** 工作台不得无提示地将新文档路径与旧正文混显；应显示文档级加载/切换状态，或明确标示旧内容仍属于前一文档

## ADDED Requirements

### Requirement: 加载阶段与性能诊断

工作台 MUST 将首次进入和刷新过程区分为至少当前 Workspace identity、OpenSpec root、活动 changes、归档 scope、文档列表和文档正文等资源阶段，并且 MUST 让用户可区分 loading、refreshing、timeout、unavailable、error、empty 和 stale。Host/Client MAY 通过 evidence 或开发诊断暴露阶段耗时、cache hit、in-flight reuse、扫描条目计数、CLI probe/status 耗时和稳定错误 code；这些诊断 MUST 是 JSON-safe、有界的，不得包含 secret、完整文档正文或无必要的未授权路径。

如果耗时发生在 RPC 排队、连接握手或 DSH Workspace/session registry 初始化，而不是 OpenSpec 扫描，系统 MUST 将其标记为独立的等待来源，不得把它归因于“没有 Workspace”或 OpenSpec 文件为空。诊断不得改变只读边界、权限判断或 freshness/generation 提交门槛。

#### Scenario: 当前 Workspace 优先完成

- **WHEN** 当前 Workspace 的 root/active summary 已完成而另一个注册 Workspace 仍在加载或超时
- **THEN** 工作台展示当前 Workspace 的可用结果，并将其他 Workspace 的状态独立呈现或留给用户后续选择，不得继续显示全局“正在发现 Workspace”

#### Scenario: 慢阶段可定位

- **WHEN** 一次加载超过用户可接受的时间，或某一阶段失败/超时
- **THEN** response evidence 或开发诊断至少能区分 root probe、active/archive scan、CLI、targeted document、RPC/registry wait 中的来源，并显示可重试的稳定错误分类

#### Scenario: 诊断不泄露内容

- **WHEN** 工作台向 Client 返回性能或失败诊断
- **THEN** 诊断只包含有界的阶段、耗时、scope、计数和稳定错误信息，不包含完整文档、secret 或绕过 Workspace/path boundary 所需的路径权限信息
