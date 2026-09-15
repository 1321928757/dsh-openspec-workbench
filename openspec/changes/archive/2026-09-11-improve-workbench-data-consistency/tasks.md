## 1. Host 请求与快照一致性

- [x] 1.1 为 projects、changes、documents 和 document content 建立 Workspace-scoped 请求上下文与 latest-request-wins 提交校验；用并发 fixture 验证旧 Workspace 或旧 generation 的响应不会进入当前结果
- [x] 1.2 管理 Host pending 请求、AbortController/取消句柄、失效 token 和 dispose 清理；用取消、切换 Workspace 和服务销毁测试验证不会遗留可提交的旧工作
- [x] 1.3 统一 Host 失败响应的 code、message、details、severity 和 evidence fallback 合并；用 CLI、FS、权限和文档读取失败 fixture 验证诊断细节不丢失

## 2. CLI 探测缓存与部分数据

- [x] 2.1 将 CLI 探测缓存绑定 Workspace canonical path、executable identity 和时间有效期；用 force refresh、失效通知、TTL 到期、CLI 恢复和版本变化 fixture 验证重新探测
- [x] 2.2 逐条校验并归一化 CLI status 记录，隔离非法 identity、异常 artifact 和越界任务进度；用混合有效/非法记录 fixture 验证合法记录保留且不构造危险 CLI 参数
- [x] 2.3 增加 `CLI_PARTIAL_DATA` 及相关字段诊断并正确区分 CLI authority、partial-data 和 file-scan fallback；用全非法容器、部分非法容器和空有效结果测试验证 provenance 与诊断
- [x] 2.4 保持 Windows shim、native executable、显式 argv、cwd、超时、输出上限和只读安全边界不变；运行现有 Host shim/argv 回归测试并验证 `spawn EINVAL` 不被重新引入

## 3. 文档 revision 与 Host DTO

- [x] 3.1 扩展文档读取 DTO，返回可比较 revision、原始字节数、实际返回字节数、展示上限和 truncated/freshness 信息；用同大小内容变化、超限内容和缺失 revision fixture 验证元数据
- [x] 3.2 实现文档读取的 generation/revision 提交校验和 stale 语义；用读取期间文件变化、Workspace 切换和刷新 fixture 验证旧内容可保留但不会被标记为新内容
- [x] 3.3 保持文档内容按需读取、最大尺寸、路径 containment、symlink 拒绝和 JSON-safe envelope；运行路径边界、大小限制、异常文档和 Typert codec 测试

## 4. Client 资源状态与 Workspace 切换

- [x] 4.1 将 Client 共享 busy 改为资源级 loading/refreshing/success/empty/unavailable/error/stale 状态，并为首次加载提供明确的 loading UI；用 Client 状态 fixture 验证空列表不会冒充加载完成
- [x] 4.2 在 Workspace 切换时立即清理或隔离 changes、archivedChanges、selected change、documents、content 和对应错误；用延迟 A/B Workspace 响应测试验证不发生旧数据混显
- [x] 4.3 让显式刷新保留 last-good snapshot，并按资源显示 refreshing、stale、错误和 retry；用 projects 成功而 documents 失败、刷新失败和多请求交错 fixture 验证错误归属与布局稳定
- [x] 4.4 去除重复文档读取路径，确保选择文档只产生一次有效请求，并以 workspace/change/document request key 防止过期内容提交；用请求计数和快速切换 fixture 验证

## 5. Client freshness、诊断与只读回归

- [x] 5.1 比较文档 revision/generation 并显示 stale、重新读取和截断范围提示；用文档变化及超过 Client 展示上限的真实渲染测试验证不会静默截断
- [x] 5.2 将 partial-data、CLI unavailable、unsupported、permission、parse-error 和资源级错误显示在正确区域，同时保留可用数据；用错误状态组件测试验证 retry 和空态文案不混淆
- [x] 5.3 检查 Workspace 切换、刷新、读取和错误路径仍不提供任何写入、apply、verify、archive、sync、任务勾选或任意 shell 操作；运行只读边界测试并审查公开 RPC 方法集合

## 6. 验证与独立实例验收

- [x] 6.1 扩展 `test/shared.test.mjs`、`test/client.test.mjs` 和必要的 Typert fixture，覆盖缓存、generation、取消、partial-data、非法 identity、异常进度、revision 和资源状态；运行 `npm test` 与 `node --check`
- [x] 6.2 运行 `npm pack --dry-run` 并将最新 bundle 安装到 scratch profile；验证包内 Host、Client、Typert 和 patch 产物与版本一致
- [x] 6.3 在独立 `http://127.0.0.1:3094` 重启真实 DSH Web，验收首次 loading、刷新失败保留旧数据、Workspace A/B 切换、CLI 恢复、partial-data、文档变化/截断、空态和只读行为；不得使用用户 `http://127.0.0.1:3080`
