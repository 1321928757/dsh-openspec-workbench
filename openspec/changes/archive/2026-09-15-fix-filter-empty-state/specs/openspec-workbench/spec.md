## MODIFIED Requirements

### Requirement: Change 总览与状态解释

工作台 MUST 展示选中 Workspace 的活动 OpenSpec changes，并且 MUST 提供 draft、todo、in-progress、done 和 archived 状态的筛选或等效导航。普通活动视图 MUST 只加载当前 Workspace 的活动 change 摘要，不得为了首屏建立整个 OpenSpec 根目录的文档索引或递归加载归档目录。每个 change 摘要 MUST 暴露稳定 identity、名称、项目 identity、已知的 schema、工件摘要、可用的任务信息、freshness、provenance 和相关诊断；需要完整文档元数据或自定义工件路径时 MUST 支持在用户选中 change 后按需补全。筛选、排序和归档可见性 MUST 具有一致的语义：用户选择 archived 状态时 MUST 触发或复用对应 archive scope 的加载并能看到归档结果，不得因为另一个独立开关未开启而产生误导性的空列表。工件导航 MUST 同时提供可读的短标签和完整路径 identity。筛选或搜索 MUST 作为已加载数据上的本地视图操作处理；当资源请求已经明确完成且当前可见集合非空、但筛选后的结果为空时，工作台 MUST 展示“没有匹配结果”等结论性空状态和调整筛选/搜索的提示，不得继续显示 changes loading 状态，也不得将该情况报告为 Host、CLI 或数据资源错误。

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

#### Scenario: 已加载数据没有匹配的状态结果

- **WHEN** 当前 Workspace 的 changes 请求已成功完成，且可见 change 集合包含至少一条记录，但用户选择的状态标签没有任何匹配 change
- **THEN** 工作台显示“没有匹配结果”以及调整状态筛选的提示，不得显示“正在加载 changes…”或创建新的 changes 请求

#### Scenario: 已加载数据没有匹配的搜索结果

- **WHEN** 当前 Workspace 的 changes 请求已成功完成，且用户输入的搜索词无法匹配当前可见 change 的名称、schema 或工件标识
- **THEN** 工作台显示“没有匹配结果”以及调整搜索条件的提示，保留原始 change 资源的成功状态、来源和诊断

#### Scenario: 搜索与状态组合后没有匹配结果

- **WHEN** 当前 Workspace 的 changes 请求已成功完成，但搜索条件与状态筛选组合后得到空列表
- **THEN** 工作台将该情况作为本地筛选空态显示“没有匹配结果”，不得把空的派生列表解释为资源尚未完成、资源为空或加载失败
