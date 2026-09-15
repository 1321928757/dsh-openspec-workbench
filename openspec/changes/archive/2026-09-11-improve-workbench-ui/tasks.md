## 1. 状态模型与跨视图快照

- [x] 1.1 在 Client 建立有界的模块级 Workbench snapshot store，按 Workspace stable identity、canonical path 和归档可见性保存最近成功的 projects/changes/documents/content 及显示选择；通过单元/静态测试验证不保存 live Context、Service、AbortSignal、完整文档索引或权限信息
- [x] 1.2 将 projects、changes、documents、document content 的初始化、刷新、空、不可用、错误和 stale 状态接入实际渲染门控；使用慢 RPC fixture 验证 loading 期间不会显示“没有可用 Workspace”或“暂无活动 changes”等结论性空态
- [x] 1.3 实现 conversation view 重新挂载时的 snapshot 恢复和 stale-while-refresh，保留筛选/排序/选中上下文并在失败时显示资源级 retry；通过 3094 反复切换“对话/OpenSpec”验证不再每次先清空再等待
- [x] 1.4 保持 Workspace A/B 切换的 identity 隔离、request key、generation 和取消保护；通过快速 A→B→A 与慢响应 fixture 验证旧 change、归档 change、文档和正文不会覆盖新 Workspace

## 2. Host 扫描复用与请求一致性

- [x] 2.1 在 Host 增加按 Workspace canonical path、stable identity、includeArchived 和有限 TTL 复用的 scan snapshot/in-flight 请求，供 projects 与 changes 查询共享；通过服务测试验证同一窗口只扫描一次且缓存命中不绕过 Workspace/OpenSpec root/path boundary
- [x] 2.2 将 force refresh、文件系统 invalidation、Workspace path/executable 变化和 TTL 到期接入 scan snapshot 失效；通过测试验证新建 change、CLI 恢复和显式刷新可获得新数据
- [x] 2.3 回归 pending controller、dispose、stale response 和 CLI cache 行为；运行 `npm test`、`npm run check` 并确认六个只读 RPC、Typert namespace 和只读边界没有变化

## 3. 归档、筛选与来源信息

- [x] 3.1 选定并实现单一的归档交互语义：优先保留“已归档”状态筛选并使其自动包含归档数据，或明确实现 checkbox 与状态筛选的互斥规则；通过客户端 fixture 验证所有组合不会产生误导性空列表
- [x] 3.2 统一 CLI 版本、status 能力、file-scan provenance、partial-data、fallback 和刷新失败文案；通过 CLI status 空/部分无效/失败 fixture 验证影响和恢复路径清晰且不误称 CLI 权威
- [x] 3.3 将 `filtered`、排序和 summary counts 改为稳定的派生计算，处理缺失进度/空 total；通过搜索、筛选、排序、归档切换测试验证计数和列表一致

## 4. 控件与选中态视觉实现

- [x] 4.1 为 Workspace 与排序原生 select 建立统一的局部 DSH semantic aliases、尺寸、字体、内边距、surface、border、arrow、hover、focus-visible 和 disabled 样式；在亮色/暗色 3094 页面验证不依赖浏览器默认样式
- [x] 4.2 修复归档 checkbox label 的 inline-flex 垂直对齐、完整命中区域、键盘 focus 和窄容器换行；通过 DOM 尺寸/ComputedStyle 检查和键盘 Tab/Space 验证
- [x] 4.3 将 change selected 态改为低强度 selected surface、轻量边界与 1–2px 指示，区分 hover 和 focus-visible；通过未选/hover/selected/focus 的亮暗主题截图和可访问状态验证不再出现过重黑色边框或 3px 左条
- [x] 4.4 保持所有 CSS selector 在 `.oswb-root` 命名空间内，使用 DSH token/semantic alias 而非独立品牌调色板；运行静态检查并验证没有全局样式、emoji 结构图标或外部字体依赖

## 5. 工件导航与文档切换

- [x] 5.1 将详情工件 tab 显示为可识别的短标签，保留完整相对路径在 title、aria-label、辅助 metadata 或等价可访问名称；通过长路径 fixture 和键盘 tablist 验证 identity 与导航均可用
- [x] 5.2 处理快速文档切换的 content identity、loading/switching、stale 和 error 状态；通过连续点击多个文档和失败 fixture 验证不会无提示地混显新路径与旧正文
- [x] 5.3 保持 Markdown 安全文本渲染、revision、字节数和截断提示；运行现有共享测试并验证大文档不会静默显示为完整内容

## 6. 真实 DSH Web 验收与打包

- [x] 6.1 在亮色、暗色、窄容器、长中文/长路径、键盘、prefers-reduced-motion、loading、empty、error、stale、fallback 和 retry 状态完成真实浏览器回归；所有操作只使用独立 `http://127.0.0.1:3094`，不使用当前 `http://127.0.0.1:3080`
- [x] 6.2 对比 view 切换前后请求 waterfall、DOM 状态和截图，确认已有快照即时可见、后台刷新有明确状态、没有横向溢出或布局跳动；保存必要的 3094 验收截图/日志
- [x] 6.3 运行 `npm test`、`npm run check`、`npm pack --dry-run`，将最终 tgz 安装到独立 scratch profile 并重启 3094；确认 bundle 加载、六个 RPC、主题控件和只读保证均通过
- [x] 6.4 核对用户 3080 实例未被安装、重启或用于验收；若独立回归失败，移除 scratch 新包并记录回滚结果
