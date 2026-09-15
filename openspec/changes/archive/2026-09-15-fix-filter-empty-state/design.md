## Context

See `proposal.md` for the motivation and externally observable scope. 当前 Client 已将 changes 请求结果保存在 `changesResource`，并从 `changes`/`archivedChanges` 派生 `visibleChanges`，再根据状态筛选、搜索和排序生成 `filtered`。但列表渲染只对首次 `loading` 和资源 `empty` 做了专门分支；当请求已成功完成而 `filtered` 为空时，条件表达式会落入默认的“正在加载 changes…”文案。

本变更必须保持现有六个只读 RPC、Host provenance/diagnostics、资源级 phase、Workspace identity 隔离、归档 lazy scope 和 snapshot 行为不变。筛选与搜索属于 Client 派生视图，不应触发新的 Host 请求或修改原始资源状态。

## Goals / Non-Goals

**Goals:**

- 让 changes 列表依据“资源阶段”和“筛选后是否有结果”分别决定 loading、资源空、错误和本地筛选空态。
- 对状态筛选、搜索及其组合提供一致的“没有匹配结果”反馈，并保留调整条件的操作提示。
- 保持资源成功状态、provenance、diagnostics 和 summary counts 与原始加载结果一致。
- 用静态客户端契约测试锁定关键分支，防止成功空筛选再次回退到 loading 文案。

**Non-Goals:**

- 不修改 Host `listChanges` 行为、CLI 解析、缓存、扫描范围或 RPC 参数。
- 不把筛选操作改成服务端过滤，也不新增请求、debounce 或新的资源 phase。
- 不改变真正的首次加载、刷新、资源为空、不可用、错误、超时和归档加载语义。
- 不涉及 DSH 宿主布局、resize handle 或其他 conversation shell 样式。

## Decisions

### 1. 先判断资源级 loading，再判断派生列表

保留当前的首屏门控：只有 `changesResource.phase` 为 `loading` 且没有可复用数据时，才显示“正在加载 changes…”。请求已成功完成或已有 last-good 数据时，不应因为 `filtered` 为空重新进入 loading 分支。

列表后续分支按以下优先级表达状态：

```text
resource loading without data
        --> 正在加载 changes…

filtered.length > 0
        --> 渲染匹配的 ChangeRow

resource unavailable/error/timeout
        --> changes 暂不可用 + 重试

resource empty with no visible source records
        --> 暂无活动 changes / 暂无已归档 changes

visibleChanges.length > 0 but filtered.length === 0
        --> 没有匹配结果 + 调整筛选或搜索
```

在刷新期间如果有旧数据，继续沿用现有 last-good 列表；若当前条件没有匹配项，也显示本地“没有匹配结果”，而不是把 refreshing 或旧数据误报成首次 loading。资源错误优先级仍高于普通空态，以确保重试入口可见。

### 2. 使用原始可见集合区分资源空与筛选空

`visibleChanges` 代表当前 scope 已成功提供的原始集合，`filtered` 代表应用状态筛选和搜索后的派生集合。两者均为空时才可能是资源级 empty；`visibleChanges` 非空且 `filtered` 为空时必然是本地筛选空态。排序不影响空态判定。

不额外引入独立的 `hasFilter` 或 `hasLoaded` 状态，避免与 `changesResource.phase` 和现有 snapshot hydration 产生不一致。resource phase 继续由 Host 响应设置，筛选空态完全由已有派生数据决定。

### 3. 测试以静态契约覆盖所有空筛选入口

在 `test/client.test.mjs` 中扩展客户端源码契约，验证：

- loading 文案只存在于“loading 且没有数据”的门控及资源未完成的对应分支；
- 成功数据存在但 `filtered` 为空时使用“没有匹配结果”；
- 提示能够覆盖搜索/筛选调整语义；
- 未引入依据 `nextChanges.length` 或筛选变化触发 `listChanges` 的请求逻辑。

由于当前测试套件采用无 DOM 的源码契约方式，不新增 React 测试渲染依赖；真实浏览器回归在应用变更时验证状态标签和搜索交互。

## Risks / Trade-offs

- **[资源尚未完成但已存在旧快照时可能被视为已有数据]** → 继续使用 `changesHaveData` 与 resource phase 作为首屏门控；只在确实存在可见旧记录时允许本地筛选空态，首次无数据仍显示 loading。
- **[资源失败且筛选结果为空时可能优先显示筛选空态]** → 空态分支明确优先处理 unavailable/error/timeout，并保留重试按钮。
- **[未来增加新的筛选维度可能忘记维护空态文案]** → 将“visible 集合非空、filtered 为空”的契约写入测试和主规范，所有本地派生过滤共享该分支。
- **[静态测试无法验证最终像素或 React 状态时序]** → 保留现有独立 3094 浏览器验收要求，检查状态按钮、搜索框和已完成请求后的空态文案。

## Migration Plan

1. 在 Client 列表渲染分支中调整已完成资源的空筛选判断，保持 Host 与 RPC contract 不变。
2. 在 `test/client.test.mjs` 添加状态筛选、搜索和组合筛选的源码契约断言。
3. 运行 `npm test`、`npm run check` 和 `npm run pack:check`。
4. 使用独立 scratch DSH 实例验证已有 changes 选择无匹配状态标签、无匹配搜索词和组合条件时均显示“没有匹配结果”，同时确认首次 loading、真实 empty、error/retry 和 archived loading 没有回归。
5. 若回归失败，仅回滚 Client bundle/test 与本变更 artifact；不需要数据迁移，也不触碰当前用户 `http://127.0.0.1:3080` 实例。

## Open Questions

无。资源阶段与派生筛选结果的优先级已由现有状态模型和规范确定。
