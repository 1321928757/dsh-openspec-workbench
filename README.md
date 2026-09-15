# dsh-openspec-workbench

OpenSpec Workbench for DeepSeek Harness：在 DSH 中查看已注册 Workspace 的 OpenSpec 状态、工件依赖、任务进度和规划文档。

## 当前版本能力

- 通过 DSH 的 `conversation.view` 提供 OpenSpec 工作台，不接管 Chat session shell；
- 默认使用当前 DSH Workspace，也可以切换其他已注册 Workspace；
- 以列表/详情方式查看 active changes、归档 changes、工件状态和任务进度；
- 按需阅读 proposal、design、spec、tasks 和自定义工件 Markdown；
- 优先读取 OpenSpec CLI 结构化状态，CLI 不可用时提供明确标注的有边界文件扫描结果；
- 展示来源、刷新状态和诊断信息；
- 首个版本只读，不编辑文件、不执行 apply/verify/archive、不执行任意 shell 命令。

## 兼容性

- DSH：目标为 `@deepseek-ai/dsh` `0.1.1-rc.2` 及兼容的 Web bundle 契约；
- OpenSpec CLI：首个版本目标 `>=1.12.0 <1.13.0`；
- 不支持的 CLI 版本不会被静默当作权威状态来源；安全的文件发现能力会标注为 fallback。
- Windows 下会安全识别 npm/pnpm 生成的 `.cmd`/`.bat` shim，并转换为显式 Node argv；不会通过 `cmd.exe` 执行用户可控 shell 字符串。
- CLI 解析、shim 校验、进程启动、非零退出、超时、取消和 JSON 解析失败会显示为 warning；底层 `EINVAL` 等原因会保留在诊断 details 中。

## 安装

```sh
dsh plugin --profile web add dsh-openspec-workbench
```

然后启动实际的 DSH Web。开发和验收时请使用独立测试实例，不要在用户当前的 `http://127.0.0.1:3080` 实例中安装或验证插件；默认测试地址为 `http://127.0.0.1:3094`。

## CLI 诊断与 fallback

在 CLI 可执行且版本满足 `>=1.12.0 <1.13.0` 时，Workbench 使用 CLI 的结构化输出作为适用状态、validation、instructions 和 diff 的权威来源，并标记为 CLI authority。Windows npm/pnpm 安装通常提供 `openspec.cmd` 或 `openspec.bat`；插件只接受可识别的静态 shim 模板，并解析为原生 Node executable + JavaScript entry 的显式 argv。未知 shim 模板、目标缺失、`spawn EINVAL`、非零退出、超时、取消或无效 JSON 均 fail-closed，并保留可用的 file-scan fallback。

如果你看到 `CLI 不可用，显示文件扫描结果` 或 warning，表示当前项目仍可浏览发现到的 changes 和文档，但 CLI status、validation、instructions 或 diff 可能不可用。诊断会保留稳定 code 和底层 cause details；这不是 OpenSpec 文档损坏。

## 安全边界

Host 只接受已注册 Workspace 的稳定 identity，并把读取范围限制在该 Workspace 下的 `openspec/` 根目录。Host 使用精确 argv 调用 CLI，不启用通用 `cmd.exe` shell，也不接受用户提供的 shell 字符串；文档大小、扫描深度和扫描条目数量均有上限。插件不会修改 OpenSpec 仓库文件。

## 开发

```sh
node --check lib/index.js
node --check lib/client.js
node --test test/shared.test.mjs
npm pack --dry-run
```

## 许可证

MIT
