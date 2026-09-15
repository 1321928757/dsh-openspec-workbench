## Why

当用户选择某个状态标签或输入搜索条件后，如果当前已成功加载的 changes 中没有匹配项，工作台会错误地显示“正在加载 changes…”。这把已经完成的筛选操作误报为仍在等待 RPC，掩盖了真实的“没有匹配结果”状态，降低了状态信息的可信度；需要在现有资源加载门控基础上补齐筛选结果为空的显示语义。

## What Changes

- 将 changes 列表的渲染判断区分为“资源仍在首次加载”和“资源已完成但筛选结果为空”。
- 当原始 change 数据已成功加载、但状态筛选或搜索没有匹配项时，显示“没有匹配结果”及调整筛选/搜索的提示。
- 保留真实资源阶段的 loading、refreshing、empty、unavailable、error 和 timeout 语义；不把筛选空结果转换为新的 Host 请求或错误诊断。
- 补充状态筛选、搜索和组合筛选的客户端契约测试，覆盖已完成加载后的空结果场景。

## Capabilities

### New Capabilities

无。本变更修正现有 OpenSpec 工作台的筛选空结果行为，不引入新的独立能力。

### Modified Capabilities

- `openspec-workbench`: 明确已完成加载的 change 集合在筛选或搜索后无匹配项时必须展示结论性的“没有匹配结果”空状态，而不得继续显示 loading 文案。

## Impact

- 影响 `lib/client.js` 中 `visibleChanges`、`filtered` 派生数据和 changes 列表空状态渲染。
- 影响 `test/client.test.mjs` 的静态客户端契约覆盖。
- 需要在 `openspec/changes/fix-filter-empty-state/specs/openspec-workbench/spec.md` 中补充现有 capability 的 delta requirement/scenarios。
- 不修改 Host RPC、CLI 解析、数据来源、缓存、权限边界或 DSH 会话协议。
