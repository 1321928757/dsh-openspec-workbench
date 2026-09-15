## 1. Windows CLI 执行计划

- [x] 1.1 抽取 Windows executable/shim 识别与安全执行计划 helper，支持 native executable、`.cmd` 和 `.bat`，并验证未知格式、空路径、相对路径、缺失目标和不安全 shim 内容均 fail-closed。
- [x] 1.2 为 npm/pnpm 常见 Windows shim 解析真实 Node executable 与脚本入口，构造显式 native argv prefix；验证原始 OpenSpec 参数顺序、Workspace cwd 和空格/Unicode 路径保持不变。
- [x] 1.3 将安全执行计划接入 `runCli()` 的 subprocess spawn 路径，并验证 stdin/stdout/stderr、输出上限、grace period、timeout 和 AbortSignal 语义不变。
- [x] 1.4 保留 native executable 和现有兼容 run seam 的行为；验证非 Windows/native CLI 不经过 shim 分支，且不引入用户可控 shell 插值。

## 2. 诊断与 fallback

- [x] 2.1 统一归一化 executable resolve 失败、shim 解析失败、spawn reject、`EINVAL`、非零退出、timeout、cancel 和 malformed JSON 诊断，包含稳定 code、可读 message、`severity: warning` 与受限 details。
- [x] 2.2 验证 CLI 失败时 `listProjects`、`listChanges` 和 `getChangeStatus` 继续返回可用 file-scan fallback，并正确区分 `cli`、`file-scan` 与 `fallback` provenance。
- [x] 2.3 验证受支持 CLI shim 的有效 status、validation、instructions 和 diff 结果被标识为 CLI authority；不支持版本和未知 shim 格式不得伪装为 CLI authority。

## 3. 测试与真实 CLI smoke

- [x] 3.1 增加纯函数 shim fixture 测试，覆盖 `.cmd`、`.bat`、native executable、空格/Unicode 路径、未知模板、恶意内容、缺失入口和参数边界。
- [x] 3.2 增加 subprocess seam 测试，断言最终 argv、cwd、stdio、maxBytes、graceMs、timeout、cancel、spawn reject 和非零 exit code 的行为。
- [x] 3.3 在 Windows 测试环境执行真实 shim CLI smoke，覆盖 `--version`、`status --all --json`、`validate`、`instructions` 和 `show --json --diff`；验证输出可解析且命令结束后没有残留进程。
- [x] 3.4 运行完整 Host、Client、Typert、syntax、package 和 OpenSpec validation 测试，确认旧的只读、路径边界、文档大小和 Workspace 隔离测试不回归。（syntax、npm test、pack dry-run、change/spec validation 和独立 Web smoke 均已通过。）

## 4. 文档与独立环境验收

- [x] 4.1 更新中英文 README，说明 Windows `.cmd`/`.bat` shim 支持、CLI authority/fallback 语义、`spawn EINVAL` 诊断和 fail-closed 安全边界。
- [x] 4.2 将最终 bundle 安装到 scratch profile，并在独立 `http://127.0.0.1:3094` 重启 Host；验证插件加载、CLI shim 结果、fallback 结果和只读保证，不使用 `http://127.0.0.1:3080`。（已安装 `dsh-openspec-workbench-shimfix-v2.tgz` 到 `t01-oswb-clean`，独立 Host 启动成功；浏览器加载的 CLI 版本为 1.12.0，未触碰 3080。）
- [x] 4.3 通过 `web-access` 在独立 `3094` 验证 CLI 正常、shim 失败、版本不支持、fallback warning、刷新和文档阅读状态；保存必要的诊断截图或日志证据。（已验证 CLI authority、status/validation/instructions/diff、change/doc 阅读、搜索空状态、刷新保留数据、无 OpenSpec 根目录状态和无 `spawn EINVAL`；shim failure/fallback 由 Host 回归测试覆盖。）
