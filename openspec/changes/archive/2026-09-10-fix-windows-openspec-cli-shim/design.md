## Context

现有 `lib/index.js` 的 `runCli()` 使用 DSH `subprocess.resolveExecutable('openspec')` 获取路径，并把返回值直接作为 `spawn()` 的 `argv[0]`。在 Windows 上该路径可能是 npm 生成的 `.cmd`/`.bat` shim；DSH rc2 的本地 subprocess provider 使用无 shell 的原生启动方式，直接执行此类 shim 会产生 `spawn EINVAL`。现有 Host 已能在 CLI 失败时保留文件扫描结果，但诊断仍可能暴露底层错误代码，且尚无 shim 兼容实现。

本设计只改变 CLI adapter，不改变现有 Typert endpoint、Workspace 访问边界、只读行为或 Client Workbench 数据结构。所有执行仍必须通过 DSH subprocess contract，不能使用任意 shell command string。

## Goals / Non-Goals

**Goals:**

- 在 Windows 上可靠区分 native executable 与 `.cmd`/`.bat` shim。
- 让受支持版本的 OpenSpec CLI 在 shim 形态下使用安全、可审计的执行规格运行。
- 保留原始 OpenSpec 参数顺序、Workspace cwd、输出上限、超时和取消语义。
- 将解析失败、启动失败、非零退出、timeout、cancel 和 payload 错误转换为结构化 warning，同时继续 fallback。
- 用可重复 fixture 覆盖 shim、native executable 和各类失败路径。

**Non-Goals:**

- 不扩展 OpenSpec CLI 兼容版本窗口。
- 不支持用户提供的任意 shell 命令、shell 片段、脚本路径或环境变量注入。
- 不修改 DSH subprocess provider 或 OpenSpec CLI 本身。
- 不增加 Workbench 写入、apply、verify、archive 或 Git 操作。

## Decisions

### 1. 优先解析 shim 到原生 Node 执行目标，而不是启用 shell

在 Windows 检测到 `.cmd`/`.bat` 后，读取 shim 的受限文本内容，只接受包管理器 shim 的已知结构：解析其中的 Node executable 和 JavaScript entry path，构造 `[nodeExecutable, entryPath, ...originalArgs]` 的 argv。Node executable 和 entry path 必须是 shim 解析出的绝对路径，并通过 canonical containment/文件类型检查；任何未知格式、缺失目标或多余动态表达式都拒绝执行。

这样保留 `shell:false` 与显式 argv，避免对参数做 cmd.exe quoting，也避免把用户输入嵌入 shell。直接用 `cmd.exe /d /s /c` 作为通用 fallback 不采用，因为它会引入复杂的 Windows 命令行转义和更宽的执行语义。

### 2. 抽取纯函数 executable plan

将 Windows shim 识别和解析抽取为无副作用 helper，例如返回 `{ kind: 'native', argvPrefix: [executable] }` 或 `{ kind: 'node-shim', argvPrefix: [node, script] }`。helper 只处理字符串和受限 shim 文本，不访问网络、不执行进程；文件读取、canonical path 检查和最终 spawn 仍由 Host adapter 完成。

`runCli()` 先验证 OpenSpec 参数，再解析 executable plan，最后使用统一的 `spawn({ argv: [...argvPrefix, ...argv], cwd, stdio, graceMs, signal })`。native executable 不改变现有行为。

### 3. 保持 DSH subprocess 优先，旧 run seam 只作兼容

支持 rc2 `resolveExecutable` + `spawn` 的主路径，并继续保留已有的 `resolve` + `run` 兼容 seam。shim 解析只应用于明确返回 Windows `.cmd`/`.bat` 的 executable；非 Windows 和 native executable 不进入 shim 分支。兼容 seam 同样不得把用户参数直接拼成未校验 shell 字符串；若该 seam 无法表达安全的 shim plan，则返回结构化 CLI unavailable warning 并使用 fallback。

### 4. 统一诊断层级但保留底层原因

CLI adapter 为每类失败生成稳定 code、用户可读 message、`severity: 'warning'` 和必要的 details。底层 `EINVAL` 作为 details 或 cause 摘要保留，但不作为成功证据。`cliInfo`、`cliChanges` 和 `getEvidence` 都沿用相同的诊断归一化规则；fallback 响应必须继续标记 `provenance: 'file-scan'` 或 `fallback`。

### 5. 测试真实 argv，不测试宽松 shell 行为

单元测试用 Windows shim 文本 fixture 断言：`.cmd`/`.bat` 能得到合法 native argv prefix，原始 OpenSpec args 原序保留；恶意参数不会改变 prefix；未知 shim、缺失目标、EINVAL、非零退出、timeout、cancel 和 malformed JSON 均得到 warning/fallback。另用 native executable fixture 断言不会回归。

## Risks / Trade-offs

- **[npm shim 格式变化]** 不同 Node/npm/pnpm 版本可能生成不同 shim。→ 只接受可识别的安全模板，未知格式 fail-closed，并继续 file-scan fallback。
- **[Node entry path 解析错误]** 错误解析可能执行错误文件。→ 要求绝对路径、普通文件类型、canonical containment 和受限 shim 语法；解析失败不启动进程。
- **[Windows argv 语义差异]** Node entry 脚本可能依赖 shim 设置的环境或参数。→ 保持原始 args 和 cwd；记录限制并用真实 CLI smoke 测试确认 `--version`、status、validate、instructions、diff。
- **[底层 provider 仍拒绝启动]** 其他 execution-world 差异可能继续返回 EINVAL。→ 将 spawn reject 归一化为 warning，保留 fallback，不阻塞 Workbench。
- **[诊断噪声]** 每个 Workspace 都探测 CLI 可能产生重复 warning。→ 保留 per-workspace cache，并在 UI 以项目级摘要展示，详细原因仅在 evidence/diagnostics 中展开。

## Migration Plan

1. 增加 shim parser 和执行计划测试，先覆盖 native、cmd、bat、恶意/未知格式。
2. 更新 Host `runCli()`，接入安全 shim plan 和统一 warning normalization。
3. 在独立测试 profile 中重新打包安装，使用 `http://127.0.0.1:3094` 验证兼容 CLI、不可用 CLI 和 fallback；不使用 `3080`。
4. 若 shim smoke 失败，回滚到旧的 fail-closed fallback 行为，不影响文件扫描和文档读取。
5. 更新 README 的 Windows CLI 兼容和诊断说明。

## Open Questions

无。shim 的未知格式必须按 fail-closed 处理，不作为实现阶段的可延期决定。
