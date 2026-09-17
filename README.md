# dsh-openspec-workbench

[中文说明](README.zh-CN.md) · [GitHub repository](https://github.com/1321928757/dsh-openspec-workbench)

A read-only OpenSpec workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Use it to inspect OpenSpec changes in registered DSH Workspaces, understand workflow and task status, and read planning documents without editing the project.

> **Installation source:** this repository is currently distributed through GitHub, not npm. Use the `github:<owner>/<repo>` spec below. The bare package name may return a registry 404 until an npm release is published.

## Features

- Provides an OpenSpec tab through DSH's `conversation.view` surface;
- Discovers changes within registered DSH Workspaces using stable Workspace identities;
- Lists active and archived changes with status filters, search, and sorting;
- Shows artifact summaries, task progress, provenance, freshness, and diagnostics;
- Loads `proposal`, `design`, `spec`, `tasks`, and custom Markdown artifacts on demand;
- Shows `没有匹配结果` when loaded data does not match the current local filter or search;
- Uses structured OpenSpec CLI status when supported, with clearly labelled bounded file-scan fallback;
- Stays read-only: no file edits, OpenSpec workflow commands, arbitrary shell commands, or arbitrary directory access.

## Requirements and compatibility

| Component | Requirement |
| --- | --- |
| DSH Web | A DSH `0.1.1-rc.2`-compatible Web bundle or a compatible later runtime |
| OpenSpec CLI | `>=1.12.0 <1.13.0` for CLI-authoritative status |
| Workspace | The project must be registered as a DSH Workspace |
| Node.js | Use the Node.js version required by your DSH installation |

OpenSpec CLI is optional for basic discovery. If the CLI is missing, unsupported, or cannot be used safely, the workbench keeps bounded file-scan results and labels the source and diagnostic instead of claiming CLI authority.

## Install from GitHub

Run this command from any directory:

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

This installs the GitHub repository into the DSH `web` profile. DSH then reconciles packages that declare a `dsh.bundle` patch into the profile's bundle list.

### Verify the installation

```powershell
dsh --profile web --dump-config | findstr dsh-openspec-workbench
dsh plugin --profile web why dsh-openspec-workbench
```

Start or restart the DSH Web process for the `web` profile, refresh the browser, open the **OpenSpec** tab, and select a registered Workspace. Installing a package changes the profile on disk; an already-running Web process does not automatically rebuild its boot graph.

## Update or remove

To update the GitHub dependency in the same profile, re-run the GitHub spec:

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

You may also ask pnpm to update the named dependency:

```powershell
dsh plugin --profile web update dsh-openspec-workbench
```

Remove it with:

```powershell
dsh plugin --profile web remove dsh-openspec-workbench
```

After an update or removal, restart the affected DSH Web process and refresh the browser. Ask for confirmation before restarting a shared or user-facing DSH instance.

This repository does not currently publish a versioned Git tag. The GitHub command follows the repository's default branch. Once a release tag exists, a fixed installation can use a spec such as `github:1321928757/dsh-openspec-workbench#v0.1.0`.

## Quick start

1. Open the **OpenSpec** tab in DSH Web.
2. Select a registered Workspace.
3. Use **全部**, a status filter, or the search box to narrow the change list.
4. If the loaded collection has no match, the workbench shows **没有匹配结果** instead of a loading message.
5. Select a change to load its artifacts, then select an artifact to read its content.
6. Use provenance and diagnostics to distinguish CLI-authoritative data from file-scan fallback.

## Data scope and security boundary

- The Host accepts only registered Workspace identities and limits discovery and document reads to the selected Workspace's `openspec/` root.
- The normal active view loads bounded change summaries. Archived data is loaded only when the archived view needs it.
- CLI invocation uses explicit arguments and a controlled working directory. On Windows, recognised npm/pnpm `.cmd` and `.bat` shims are converted to a native Node argument plan; user-controlled shell strings are not passed to `cmd.exe`.
- The plugin is read-only. It does not edit OpenSpec files or expose apply, verify, archive, arbitrary shell, or arbitrary command execution actions.
- CLI status, file scanning, document reads, and diagnostics are separate evidence facets. Fallback results are labelled as fallback rather than presented as unconditional CLI authority.
- Data displayed in the DSH UI is ordinary DSH application data. Follow your configured model/provider data policy when reviewing sensitive project content.

## Known limitations

- Only Workspaces already registered with DSH can be selected; this is not an arbitrary directory picker.
- CLI-authoritative status is limited to the supported OpenSpec CLI `1.12.x` line. Other versions may still provide bounded fallback discovery with a warning.
- The current release is read-only and does not run OpenSpec workflow commands from the UI.
- The repository is currently installed from GitHub's default branch rather than an npm package or versioned tag.
- A running DSH Web process must be restarted after profile installation or update before its Host and Client bundles can change.

## Troubleshooting

### The OpenSpec tab is missing

Check that the dependency is in the intended profile and that the composed config contains it:

```powershell
dsh --profile web --dump-config | findstr dsh-openspec-workbench
```

If the package is present but the tab is stale, restart the DSH Web process and refresh the page.

### Installation reports that the package cannot be found

Make sure you use the GitHub spec, not the bare package name:

```powershell
dsh plugin --profile web add "github:1321928757/dsh-openspec-workbench"
```

If pnpm reports a build approval requirement for a Git-hosted dependency, follow the exact package key and profile file path printed by DSH/pnpm, then re-run the command.

### The list is empty

Select a registered Workspace and confirm that the selected project contains a readable `openspec/` directory. An empty result for one Workspace does not prove that other Workspaces contain no changes.

### The source says file-scan fallback

The OpenSpec CLI is unavailable, unsupported, or its structured result could not be used safely. Read the displayed diagnostic, check the CLI version and installation, and retry after correcting the environment. The fallback is intentionally bounded and labelled.

### Filtering shows no result

`没有匹配结果` means the change resource loaded successfully but the current local status/search combination matched nothing. Adjust the status button or search term; this state does not create another Host request.

## How it works

```text
Registered DSH Workspace
          │
          ▼
Host service ── bounded CLI/file discovery ──► change and document metadata
          │
          ▼
Client conversation.view ── local filter/search ──► OpenSpec reader
```

The package contains a Host bundle patch, a Web client module, a Typert Host descriptor, and shared normalization helpers. The browser client mounts six read-only Host methods and derives status/search results locally from the loaded collection.

## Development and validation

```powershell
npm test
npm run check
npm run pack:check
```

Generated `lib/` artifacts are kept in the repository so the GitHub installation path can use committed package contents. Use a separate DSH profile for local testing when possible; avoid changing a shared `web` profile while another DSH Web process is serving users.

## License

MIT
