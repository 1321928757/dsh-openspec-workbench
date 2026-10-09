## MODIFIED Requirements

### Requirement: DSH 原生且可访问的呈现

工作台 MUST 作为可叠加的 DSH conversation view 出现，并且 MUST NOT 替换完整的 conversation session shell。它 MUST 提供适合桌面和窄容器的可读布局、可通过键盘操作的导航和操作、可见焦点状态、安全 Markdown 渲染，以及明确的 loading、empty、unavailable、stale、permission、partial-data 和 error 状态。插件 MUST 能在其声明支持的 DSH 0.2 Web 运行时中加载并激活，使 conversation view 可用；客户端和宿主的远程调用描述 MUST 符合该运行时的 Typert codec 契约，不得因模块解析或 codec 校验失败导致插件激活失败或 RPC 不可用。

工作台的 Workspace 选择、排序、归档可见性和状态筛选控件 MUST 使用一致的 DSH 主题化视觉语言。原生 select/checkbox 可以保留其语义和键盘行为，但其尺寸、边界、背景、箭头/文本对齐、hover、focus-visible 和 disabled 状态 MUST 与其他工作台控件协调。普通 change selected 状态 MUST 使用低噪声 selected surface 与可辨识但不过重的边界/指示，MUST 与 hover 和 focus-visible 状态区分，不得依赖高饱和或过深的整圈边框作为唯一选择表达。颜色 MUST 来自 DSH 主题令牌或语义别名，且亮色和暗色主题均保持可读。

#### Scenario: DSH 0.2 Web 插件激活及只读 RPC 可用

- **WHEN** 插件被安装在其声明支持的 DSH 0.2 Web profile 中，且必需的 Host 服务与客户端运行时可用
- **THEN** 插件成功激活并注册 OpenSpec conversation view；Client 可调用所有声明的只读 Host 方法，且不得因 strict codec 缺失工厂、无法构造 parse schema 或浏览器模块表中不存在某依赖而失败

#### Scenario: DSH Typert 拒绝旧 schema-only codec

- **WHEN** Host 或 Client 的 strict invocation descriptor 只有 schema/typeSymbol 而没有运行时要求的 codec 工厂
- **THEN** 插件兼容性契约测试必须检测并拒绝该旧形态，且升级后的 descriptor 必须在 Host 与 Browser 两侧都提供所需工厂

#### Scenario: 用户切换到工作台

- **WHEN** 用户在 DSH conversation view ring 中选择 OpenSpec view
- **THEN** 工作台占据主视图区域，而 DSH Chat shell、composer、header、draft 行为和 Session 导航仍由宿主负责并可用

#### Scenario: 窄容器与键盘导航

- **WHEN** 工作台在窄容器中渲染或用户使用键盘操作工作台
- **THEN** 工具栏和 change/artifact 导航不丢失且不产生不可操作的水平溢出，用户可以完成 focus、选择、刷新、重试和返回，并能看到焦点状态

#### Scenario: 使用窄容器

- **WHEN** 工作台在窄容器中渲染
- **THEN** change/artifact 导航折叠为 drawer 或等效的单栏控件，文档阅读器保持水平容纳，并且导航能力不丢失

#### Scenario: 使用键盘导航

- **WHEN** 用户使用键盘操作工作台
- **THEN** 用户可以通过所有可用路径完成 focus、选择、展开、折叠、刷新、重试和返回，并能看到焦点状态，关键内容不依赖 hover-only 信息

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

#### Scenario: Markdown 包含不安全内容

- **WHEN** 文档包含 raw HTML、不安全链接或其他不能安全渲染的内容
- **THEN** 工作台对不安全呈现进行清理或省略，同时保持其余文档阅读能力可用

### Requirement: Settings 只保存偏好

工作台 MAY 暴露展示默认值、归档可见性、刷新行为或只读偏好的用户设置。Settings MUST 只包含 JSON-compatible 偏好，并且 MUST NOT 保存完整文档、Workspace 索引、secret 或作为读取权限依据的任意文件系统路径。在 DSH 0.2 中，若插件贡献设置页，该贡献 MUST 使用运行时声明的插件 Settings tab Slot，并且 MUST 提供该 Slot 要求的稳定 identity；该可选 Settings Slot 或其宿主能力不可用时 MUST NOT 阻止核心 conversation view 和只读 RPC 激活。

#### Scenario: 用户修改展示偏好

- **WHEN** 用户通过 OpenSpec 插件的 Settings 页修改受支持的工作台展示偏好
- **THEN** 偏好通过 DSH settings 契约持久化，并影响后续工作台呈现，但不修改 OpenSpec 文件

#### Scenario: Settings 插件页 Slot 不可用

- **WHEN** DSH 运行时没有提供插件 Settings tab Slot 或该可选贡献无法挂载
- **THEN** 插件不注册该设置页或优雅降级，核心工作台与只读 RPC 仍然可用

#### Scenario: Settings service 不可用

- **WHEN** Host 不提供可选的 settings surface
- **THEN** 工作台使用已记录的默认值，在没有 settings card 的情况下仍然可用
