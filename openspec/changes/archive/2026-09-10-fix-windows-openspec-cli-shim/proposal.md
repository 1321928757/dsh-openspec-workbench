## Why

Windows 下 `openspec` 常被解析为 npm 生成的 `.cmd` shim，而 DSH subprocess 使用无 shell 的原生进程启动方式直接执行该路径，导致 CLI 版本探测和后续权威状态命令失败并返回 `spawn EINVAL`。当前 Workbench 会安全降级到文件扫描，但 Windows 用户无法获得兼容 OpenSpec CLI 的 status、validation、instructions 和 diff 权威证据，因此需要修复 shim 解析，同时保持无任意 shell 注入的安全边界。

## What Changes

- 在 Windows CLI 解析路径中识别 `.cmd`/`.bat` shim，并将其转换为可由 DSH subprocess 安全启动的原生执行规格。
- 保持显式 `argv`、Workspace `cwd`、取消、超时、输出大小限制和无用户可控 shell 插值的约束。
- 区分 CLI 可执行文件解析失败、shim 启动失败、非零退出、超时、取消和无效 JSON 的结构化诊断，并统一标记为可理解的 CLI warning。
- CLI 不可用时继续提供 `file-scan` fallback，不得把 fallback 结果表示为 CLI 权威状态。
- 覆盖 Windows `.cmd`/`.bat` shim、原生可执行文件、CLI 非零退出、超时、取消、stdout/stderr 和精确 argv 的测试。
- 在文档中说明 Windows shim 兼容策略、CLI authority/fallback 语义和已知限制。

## Capabilities

### New Capabilities

<!-- 本变更修复现有 OpenSpec Workbench 的行为，不新增独立能力。 -->

### Modified Capabilities

- `openspec-workbench`: 修改 CLI 兼容性探测、CLI 证据获取和 fallback 诊断要求，使 Windows shim 能在受支持版本范围内正常执行，并明确区分 CLI 执行诊断。

## Impact

- 影响 `lib/index.js` 中的 OpenSpec CLI executable resolution、subprocess spawn/run adapter 和诊断归一化。
- 扩展 Host/shared 测试 fixture，必要时增加 Windows-specific shim parser/helper 的纯函数测试。
- 更新 `test/shared.test.mjs`、CLI smoke/integration 测试和 README 的兼容性/故障排查说明。
- 不改变 Typert 方法名称、Workspace 范围、只读边界、文档读取限制或现有 `conversation.view` API。
- 不修改 OpenSpec 项目文件，不执行 apply、verify、archive 或任意用户 shell 命令。
