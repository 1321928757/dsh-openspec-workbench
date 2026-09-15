# dsh-openspec-workbench

OpenSpec Workbench for DeepSeek Harness：在 DSH 中查看已注册 Workspace 的 OpenSpec 状态、工件依赖、任务进度和规划文档。

本插件当前为只读版本。Windows 下会安全识别 npm/pnpm 生成的 `openspec.cmd`/`openspec.bat`，转换为显式 Node argv，不通过 `cmd.exe` 执行用户可控 shell 字符串。CLI 解析、shim 校验、启动失败、非零退出、超时、取消和 JSON 异常会显示为 warning；CLI 不可用时继续提供标记清楚的 file-scan fallback。`spawn EINVAL` 是 CLI 执行层诊断，不代表 OpenSpec 文档损坏。

详细设计和实施范围见当前变更的 `openspec/changes/improve-workbench-data-consistency/`，Windows shim 兼容性与只读安全边界保持不变。
