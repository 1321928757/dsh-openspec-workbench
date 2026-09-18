## Why

OpenSpec 的 `tasks.md` 使用 Markdown task list（`- [x]` / `- [ ]`）表达子任务完成情况。当前 OpenSpec 工作台虽然能在 Host 侧正确统计任务进度（例如 `10/11`），但详情阅读器的简化 Markdown 渲染器会把 checkbox 标记当作可选语法并丢弃，最终所有任务都显示成普通无状态列表项，用户无法在预览中区分已完成和待处理任务。现在需要修复阅读器的呈现语义，使进度摘要与任务正文保持一致，同时继续保持工作台只读。

## What Changes

- 扩展客户端 Markdown task-list 解析，保留每个列表项的 `checked` 状态以及任务文本。
- 在任务文档预览中显示清晰的已完成/未完成视觉状态，推荐使用只读 checkbox 或等价的 `[x]` / `[ ]` 标记；不得允许用户通过预览修改任务文件。
- 保持普通无 checkbox 列表、嵌套/缩进列表、代码块和非任务 Markdown 的现有安全文本渲染行为。
- 保持 Host 任务进度统计、CLI 权威状态、Apply progress、文档读取协议和只读安全边界不变。
- 增加客户端静态契约/渲染相关回归覆盖，验证混合 `[x]`、`[ ]`、`[X]` 任务项不会丢失状态。
- 在独立测试 DSH 实例（默认 `http://127.0.0.1:3094`，或用户明确指定的其他独立端口）中完成打包安装、重启、浏览器刷新和任务预览验收；不得安装、重启或验证当前用户实例 `http://127.0.0.1:3080`。

## Capabilities

### New Capabilities

<!-- No new capability is introduced; this is a requirement change to the existing workbench. -->

### Modified Capabilities

- `openspec-workbench`: Markdown 文档阅读器必须保留并展示 task-list 项的完成状态，同时继续提供只读、安全且不影响其他 Markdown 内容的预览。

## Impact

- Affected client renderer: `lib/client.js`，包括 `MarkdownView`、task-list item 数据结构和局部样式。
- Affected client tests: `test/client.test.mjs`，必要时增加可测试的纯解析契约但不引入新的浏览器运行时依赖。
- Affected OpenSpec delta spec: `openspec/changes/show-task-checkbox-state/specs/openspec-workbench/spec.md`。
- Package/bundle output remains the same public RPC and manifest shape; after implementation the committed client artifact and installed scratch/test profile must be rebuilt or reinstalled.
- No Host API, data format, write operation, dependency, or current `3080` runtime is in scope.
