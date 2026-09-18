# dsh-openspec-workbench

[English README](README.md) · [GitHub 仓库](https://github.com/1321928757/dsh-openspec-workbench)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的只读 OpenSpec 工作台。用于查看已注册 DSH Workspace 中的 OpenSpec changes、理解工作流和任务状态，并按需阅读规划文档，不修改项目仓库。

> **安装来源：** 当前仓库通过 GitHub 分发，尚未发布 npm 包。请使用下面的 `github:<owner>/<repo>` 地址；在未来发布 npm 版本前，不要直接使用裸包名，否则可能遇到 registry 404。

## 功能概览

- 在 DSH Web shell 中通过 `conversation.view` 提供 OpenSpec 标签页；
- 按已注册的 DSH Workspace identity 限定 change 发现范围；
- 查看活动和归档 change 摘要，并支持状态筛选、搜索和排序；
- 展示工件摘要、任务进度、来源、freshness 和诊断信息；
- 按需阅读 `proposal`、`design`、`spec`、`tasks` 及自定义 Markdown 工件；
- change 资源加载完成后，筛选或搜索无结果时显示本地空态“没有匹配结果”；
- OpenSpec CLI 可用时使用结构化 status；不可用时提供明确标记的有边界文件扫描 fallback；
- 保持只读边界：不编辑文件、不执行 apply、verify、archive 或任意 shell 命令。

## 环境要求与兼容性

| 组件 | 支持基线 |
| --- | --- |
| DSH Web | 兼容 DSH `0.1.1-rc.2` 的 Web bundle，或兼容的后续运行时 |
| OpenSpec CLI | `>=1.12.0 <1.13.0` 时提供 CLI 权威状态 |
| Workspace | 项目必须已经注册为 DSH Workspace |
| Node.js | 使用 DSH 安装所要求的 Node.js 版本 |

OpenSpec CLI 不是基础发现功能的硬性依赖。如果 CLI 不存在、版本不支持或执行失败，工作台会保留有边界的文件扫描结果，并标记来源和诊断，不会声称其为 CLI 权威结果。

## 从 GitHub 安装

可以在任意目录执行：

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

该命令会把 GitHub 仓库安装到 DSH 的 `web` profile。随后 DSH 会根据包中的 `dsh.bundle` 声明，将插件加入 profile 的 bundle 列表。

### 验证安装

```powershell
dsh --profile web --dump-config | findstr dsh-openspec-workbench
dsh plugin --profile web why dsh-openspec-workbench
```

然后启动或重启 `web` profile 对应的 DSH Web 进程并刷新浏览器，进入 **OpenSpec** 标签页，选择一个已注册 Workspace。安装命令只修改 profile 磁盘文件；已经运行的 Web 进程不会自动重建 boot graph。

## 更新与卸载

要在同一 profile 中更新 GitHub 依赖，重新执行 GitHub 安装地址：

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

也可以让 pnpm 更新已命名的依赖：

```powershell
dsh plugin --profile web update dsh-openspec-workbench
```

卸载：

```powershell
dsh plugin --profile web remove dsh-openspec-workbench
```

更新或卸载后，需要重启受影响的 DSH Web 进程并刷新浏览器。对于共享或用户正在使用的 DSH 实例，请先确认再重启。

`v0.1.0` release tag 现在指向此版本。为了获得可复现的安装结果，可以使用固定 tag：

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench#v0.1.0"
```

不带 tag 的 GitHub 命令会跟随默认分支，后续可能安装到更新内容。

## 快速开始

1. 在 DSH Web 中打开 **OpenSpec** 标签页。
2. 选择一个已经注册的 Workspace。
3. 使用 **全部**、状态按钮或搜索框缩小 change 列表。
4. 如果资源已经加载，但当前筛选或搜索没有匹配项，列表会显示 **没有匹配结果**，而不是 loading 文案。
5. 选择一个 change 加载工件列表，再选择工件阅读内容。
6. 通过来源和诊断信息区分 CLI 权威数据与 file-scan fallback。

## 数据范围与安全边界

- Host 只接受已注册 Workspace identity，并将发现和文档读取限制在选中 Workspace 的 `openspec/` 根目录内。
- 普通活动视图只加载有边界的 change 摘要；只有归档视图需要时才加载归档数据。
- CLI 使用显式参数和受控工作目录调用。在 Windows 下，识别到的 npm/pnpm `.cmd` 和 `.bat` shim 会转换为原生 Node 参数计划；用户可控的 shell 字符串不会传入 `cmd.exe`。
- 插件为只读插件，不编辑 OpenSpec 文件，也不提供 apply、verify、archive、任意 shell 或任意命令执行入口。
- CLI status、文件扫描、文档读取和诊断属于不同证据面。fallback 结果会明确标记，不会被无条件展示为 CLI 权威结果。
- DSH UI 中展示的文档和状态数据属于普通 DSH 应用数据。查看敏感项目内容时，请遵循你所配置的 DSH 模型/服务商数据策略。

## 已知限制

- 只能选择已经注册到 DSH 的 Workspace，不能把任意目录直接交给工作台。
- CLI 权威状态仅支持 OpenSpec CLI `1.12.x` 版本线。其他版本可能仍提供带 warning 的有边界 fallback 发现结果。
- 当前版本为只读版本，不在 UI 中执行 OpenSpec 工作流命令。
- 当前仓库通过 GitHub 分发，尚未发布 npm 版本；需要固定版本时请使用 `#v0.1.0` tag。
- profile 安装或更新后，必须重启正在运行的 DSH Web 进程，新的 Client 和 Host bundle 才会生效。

## 故障排查

### OpenSpec 标签页没有出现

确认依赖安装到了目标 profile，并检查组合配置：

```powershell
dsh --profile web --dump-config | findstr dsh-openspec-workbench
```

如果配置中存在但页面仍是旧状态，请重启 DSH Web 进程并刷新页面。

### 安装时提示找不到 package

确认使用的是 GitHub 地址，而不是裸包名：

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

如果 pnpm 针对 Git 托管依赖提示构建授权要求，请按照 DSH/pnpm 输出的准确包名和 profile 文件路径配置，然后重新执行安装命令。

### 列表一直为空

先在工作台中选择一个已注册 Workspace，再确认该项目存在可读的 `openspec/` 目录。某个 Workspace 返回空结果，并不代表其他 Workspace 没有 change。

### 来源显示 file-scan fallback

这表示 OpenSpec CLI 不可用、版本不支持，或结构化结果无法安全使用。查看界面中的诊断信息，检查 CLI 版本和安装状态，修正后重试。fallback 结果有意保持有边界并明确标记。

### 筛选后显示没有结果

“没有匹配结果”表示 change 资源已经成功加载，但当前本地状态/搜索组合没有匹配项。调整状态按钮或搜索词即可；该状态不会创建额外的 Host 请求。

## 工作原理

```text
已注册的 DSH Workspace
          │
          ▼
Host service ── 有边界的 CLI/文件发现 ──► change 与文档元数据
          │
          ▼
Client conversation.view ── 本地筛选/搜索 ──► OpenSpec 阅读器
```

包中包含 Host bundle patch、Web client module、Typert Host descriptor 和共享归一化工具。浏览器 Client 挂载六个只读 Host 方法，并基于已加载集合在本地派生状态和搜索结果。

## 开发与验证

```powershell
npm test
npm run check
npm run pack:check
```

仓库将生成后的 `lib/` 文件保存在版本库中，因此 GitHub 安装路径可以直接使用已提交的包内容。进行本地测试时建议使用独立 DSH profile；当共享 `web` profile 正在服务用户时，不要直接修改它。

## 许可证

MIT
