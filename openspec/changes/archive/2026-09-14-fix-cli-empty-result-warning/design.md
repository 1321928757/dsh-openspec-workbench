## Context

当前 Host 在 `cliChanges` 中先执行 `status --all --json`，再通过共享的 CLI payload normalizer 归一化记录。对于结构合法但没有记录的结果，现有逻辑只检查 `normalized.items.length === 0`，因此把两种不同状态混在一起：CLI 合法返回空集合，以及记录全部因非法 identity/结构而被隔离。前者会被错误地转换为 `CLI_EMPTY_DATA` warning 和 file-scan provenance，后者才需要 fallback 与诊断。

Client 已经只在 `evidence.diagnostics` 非空时渲染顶部 notice；因此本变更的主要修复点是 Host 对结果来源和诊断的分类，而不是隐藏 Client 的真实异常提示。

## Goals / Non-Goals

**Goals:**

- 将结构合法、记录数为零且没有被隔离记录的 CLI status 识别为成功的 CLI 空结果。
- 让合法空结果返回空活动列表并保留 `provenance: cli`，使 Client 使用正常的空状态文案。
- 保留无效 payload、部分数据、CLI 不可用、启动失败、非零退出、超时和取消的诊断与 fallback 语义。
- 用确定性测试覆盖合法空结果与“全量记录被拒绝”两条路径，防止再次把它们合并。

**Non-Goals:**

- 不修改六个只读 RPC 的名称、参数 envelope、Workspace/path boundary 或归档 scope。
- 不改变 CLI status 的调用命令、版本支持范围、缓存和失效策略。
- 不通过 Client 端过滤字符串来掩盖 Host diagnostics；真正的 CLI warning 仍须展示。
- 不处理 DSH 宿主 conversation 布局或 resize handle。

## Decisions

### 1. 以 normalizer 的容器与隔离计数区分合法空结果

在 CLI payload 已通过 `validContainer` 校验后，只有在归一化结果为空且没有 `rejectedCount`、`invalidFieldCount` 时，才将其视为合法空集合。该条件覆盖空数组以及 `changes`/`items` 为空数组，同时不会把“全部记录非法”误判为正常空结果。

合法空结果返回：

- `changes: []`
- `diagnostics: normalized.diagnostics`（正常情况下为空）
- `provenance: 'cli'`
- 受限的 `cli-status` timing

### 2. 保留所有异常路径的既有 fallback

结构不合法仍抛出 payload diagnostic；记录被拒绝或字段被修正时继续保留 normalizer 的 partial-data diagnostics；CLI 执行、shim、超时和取消异常继续返回 file-scan fallback 与对应 warning。只有现有的 `CLI_EMPTY_DATA` 分支被限定为“空但不合法/不可安全使用”的非空异常路径，避免破坏既有安全告警。

### 3. Client 保持条件渲染，不新增特殊字符串判断

Client 当前通过 diagnostics 数组决定是否渲染 notice。Host 修复后，合法空结果没有 diagnostics，Client 自然显示“暂无活动 changes”；异常结果仍有 diagnostics，继续显示 warning。这样不会把同一错误文案复制到 Client，也不会因为文案变化导致 Host 安全分类失效。

### 4. 以 Host 行为测试为主，辅以 Client 静态回归契约

Host 测试使用支持版本 CLI fixture 返回 `{ changes: [] }`，断言空列表、CLI provenance、无 `CLI_EMPTY_DATA` 和无 warning。另保留一个所有记录非法的 fixture，断言仍为 file-scan、含 partial-data/identity diagnostics。Client 测试只需确认 notice 由 diagnostics 条件控制，避免引入完整浏览器渲染测试。

## Risks / Trade-offs

- **[CLI 的空响应可能代表某些未预期的 CLI 错误]** → 仅接受结构合法且没有任何记录被拒绝或修正的空容器；执行失败和 payload 异常仍走 warning/fallback。
- **[文件扫描发现活动 change，而 CLI 返回空集合时两者可能不一致]** → 对支持版本 CLI 保持 CLI 权威语义，并通过来源标记让用户知道结果来自 CLI；文件扫描只作为 CLI 不可用或不安全时的 fallback。
- **[旧测试可能依赖 CLI_EMPTY_DATA 文案]** → 增加空结果专门断言，并保留真正全量无效记录的诊断测试，明确迁移后的分类边界。

## Migration Plan

1. 修改 `cliChanges` 的空结果分类条件，使合法空集合直接返回 CLI provenance。
2. 增加 shared/Host 回归测试，并更新必要的 Client 静态契约测试。
3. 运行 `npm test`、`npm run check` 和 `npm run pack:check`。
4. 在独立 DSH Web 实例中验证空活动列表、归档切换和真实 CLI 异常提示；不重启或改动用户当前的 3080 实例。
5. 若出现回归，回滚 `cliChanges` 分类改动即可，不涉及持久化数据或协议迁移。
