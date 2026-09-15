## Why

当选中 Workspace 没有活动 changes 时，OpenSpec CLI 可以合法返回空集合，但当前 Host 将该结果误判为“CLI status 没有可安全使用的记录”，并在工作台顶部显示 warning。这个提示把正常的“暂无活动 changes”状态误导成 CLI 异常，降低状态可信度；现在需要明确区分合法空结果与 CLI 执行、解析或数据归一化失败。

## What Changes

- 将兼容 CLI 返回的合法空 status 集合视为成功的 CLI 结果，不生成 `CLI_EMPTY_DATA` warning。
- 合法空结果继续返回空的活动 change 列表，并标记 `provenance: cli`，由 Client 展示正常的“暂无活动 changes”空状态。
- 保留 CLI 启动失败、超时、取消、非零退出、无效 JSON、非法记录和无法归一化数据的结构化 warning 及 file-scan fallback。
- 保留归档 scope、Workspace 边界、只读 RPC、缓存和现有六个公开方法的行为，不扩大本次修复范围。
- 增加 Host/Client 回归测试，覆盖合法空集合不会生成 warning，以及真正 CLI 异常仍会显示诊断。

## Capabilities

### New Capabilities

<!-- No new standalone capability is introduced. -->

### Modified Capabilities

- `openspec-workbench`: 修改 CLI status 空结果的来源、成功状态和用户提示语义，区分合法空集合与 CLI 异常。

## Impact

- 主要影响 `lib/index.js` 中 `cliChanges` 对 CLI status 结果的分类。
- 扩展 `test/shared.test.mjs`，覆盖支持版本 CLI 返回合法空数组的场景及 provenance/diagnostics 断言。
- 必要时更新 `lib/client.js` 与 `test/client.test.mjs`，确保无 diagnostics 时不渲染顶部 warning，并保持正常空状态文案。
- 不新增依赖、不修改 RPC 名称或参数、不改变归档加载和 DSH 宿主布局。
