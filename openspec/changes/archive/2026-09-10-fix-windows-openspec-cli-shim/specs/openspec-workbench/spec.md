## MODIFIED Requirements

### Requirement: 权威状态与 fallback 来源

工作台 MUST 优先使用兼容的 OpenSpec CLI 结构化结果来获取 workflow status、工件依赖、instructions、validation 和 diff。如果这些结果不可用、不受支持或执行失败，工作台 MAY 提供有边界的文件扫描发现或文档元数据，但 MUST 标识结果来源并暴露对应限制或诊断。Windows 下由包管理器生成的 `.cmd` 或 `.bat` CLI shim 在受支持的 OpenSpec CLI 版本范围内 MUST 被安全解析或启动，使其行为等同于对应的 OpenSpec CLI；该兼容处理 MUST NOT 引入用户可控的任意 shell 命令执行。CLI 可执行文件解析失败、shim 启动失败、非零退出、超时、取消和结构化输出无效 MUST 产生可区分的结构化诊断，并作为 warning 暴露给工作台，而不是被表示为成功的 CLI 证据。

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
