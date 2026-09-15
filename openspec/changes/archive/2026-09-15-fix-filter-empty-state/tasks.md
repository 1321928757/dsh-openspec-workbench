## 1. Client 空态状态机

- [x] 1.1 调整 `lib/client.js` 的 changes 列表渲染优先级：保留无数据首次 loading 门控，并将资源错误、真实资源空、已有可见数据但筛选结果为空分别映射到对应状态；通过源码检查确认成功筛选空结果不再落入“正在加载 changes…”分支
- [x] 1.2 保持状态筛选、搜索、组合筛选和归档筛选都使用同一套 `visibleChanges`/`filtered` 语义，不新增 Host 请求或改变 changes resource phase；通过代码审查和请求调用静态断言确认筛选变化仅触发本地派生计算

## 2. 客户端契约测试

- [x] 2.1 在 `test/client.test.mjs` 增加已有 change 数据下状态标签无匹配时的空态契约，验证显示“没有匹配结果”、提供调整筛选提示且不显示 loading 文案
- [x] 2.2 增加无匹配搜索及搜索+状态组合的契约覆盖，并验证真实资源 empty 仍保留“暂无活动 changes”、资源 unavailable/error/timeout 仍保留重试语义；运行 `npm test` 验证全部客户端与 Host 测试通过

## 3. 规范与回归验证

- [x] 3.1 对照 `openspec/specs/openspec-workbench/spec.md` 和本变更 delta 检查实现覆盖已完成加载后的筛选空态要求，并运行 `openspec validate --changes` 与 `openspec validate --specs`
- [x] 3.2 运行 `npm run check` 和 `npm run pack:check`，确认语法、静态契约和打包内容通过；使用独立 DSH 实例验证状态筛选、搜索及组合无匹配时显示“没有匹配结果”，且不修改或重启用户的 `http://127.0.0.1:3080`
