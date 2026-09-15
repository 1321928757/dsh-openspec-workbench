## 1. Contract and measurement foundation

- [x] 1.1 Define JSON-safe scan scopes, resource phases, timing fields, bounded count fields, and stable timeout/diagnostic codes in `lib/shared.js`; verify existing result envelope, six RPC names, provenance/freshness fields, and read-only safety tests remain compatible.
- [x] 1.2 Add Host timing seams and structured stage instrumentation around Workspace validation, OpenSpec root probing, active/archive/targeted scans, CLI probe/status, cache hit, in-flight reuse, and total request duration; verify diagnostics exclude document bodies, secrets, and unnecessary paths and are covered by unit assertions.
- [x] 1.3 Add deterministic test fixtures for a slow Workspace, a missing root, a slow CLI, aborted requests, and delayed RPC-like operations; verify each fixture reports a distinct bounded phase/error instead of an indefinite global loading result.

## 2. Workspace-scoped first load

- [x] 2.1 Update Client initial Workspace resolution to use the DSH `useWorkspaces` and current Session identity/cwd before starting OpenSpec RPC work; verify the selector renders from the DSH feed and the first OpenSpec request contains the selected `workspaceId`.
- [x] 2.2 Change the Workbench first-load path so the current Workspace root/active summary is the only critical dependency and an unscoped `listProjects({})` is not required for first render; verify a fixture with one slow non-current Workspace still renders the current Workspace result.
- [x] 2.3 Preserve explicit Workspace switching with immediate identity isolation, request cancellation/latest-request-wins checks, and per-Workspace snapshot lookup; verify delayed Workspace A responses cannot appear under Workspace B.

## 3. Layered Host scanning and lazy archive/documents

- [x] 3.1 Split Host scan internals into root probe, active change summary, archive summary, and selected-change targeted document scopes while preserving the six public read-only RPCs and existing path/symlink/size/depth/entry guards; verify each scope returns JSON-safe DTOs and revalidates Workspace boundaries.
- [x] 3.2 Make the default active scan avoid `changes/archive/` and avoid building a full OpenSpec document index, while retaining enough bounded metadata and CLI authority for active change summaries; verify archive files are not visited in the default scan fixture.
- [x] 3.3 Make `listDocuments` perform a selected-change targeted scan and keep `readDocument` content loading on demand; verify entering the Workbench does not read document bodies and selecting a custom-schema change can retrieve its documents.
- [x] 3.4 Implement archive filtering as an explicit lazy scope with independent loading/refresh/error/empty states and active/archive cache keys; verify selecting “已归档” loads only the current Workspace archive scope and never shows an unloaded archive as confirmed empty.

## 4. Cache, coalescing, invalidation, and budgets

- [x] 4.1 Extend Host scan cache keys to include Workspace stable identity, canonical path, and active/archive/targeted scope; apply a bounded remount-suitable TTL and shared in-flight promises, and verify concurrent same-scope requests scan once while cache hits still perform Workspace/path safety checks.
- [x] 4.2 Keep Client module-level snapshots bounded and identity-safe, hydrate matching Workspace/scope snapshots immediately, and refresh them in the background; verify repeated view entry shows last-good data without resetting to a full-screen loading state.
- [x] 4.3 Preserve and test invalidation on force refresh, scheduled/known filesystem invalidation, Workspace path changes, generation changes, and changed CLI executable identity; verify expired or invalidated snapshots are replaced by fresh data and failures do not permanently poison recovery.
- [x] 4.4 Add per-resource timeout/abort handling and latest-request-wins commit gates for active scan, archive scan, CLI, targeted documents, and content; verify timeout/error is resource-scoped, retains same-identity last-good data, and never becomes a false empty Workspace result.

## 5. Optional background preloading

- [x] 5.1 Keep non-current Workspace discovery out of the first-load critical path and add an explicit configuration/implementation seam for optional background warm-up; verify the default path performs no non-current scan before current Workspace success.
- [x] 5.2 If background warm-up is enabled, implement a small cancellable concurrency limit, independent timeout, and cache-only result commit; verify a slow or failed background Workspace cannot delay, overwrite, or change the current Workspace resource state.（本版本默认关闭自动预热；启用接口和有界实现已保留。）

## 6. Client state and user-facing observability

- [x] 6.1 Update Client resource state and loading copy to distinguish current Workspace, active changes, archive loading, document list, document content, refreshing, timeout, unavailable, error, empty, and stale; verify only completed empty responses render conclusionary empty states.
- [x] 6.2 Surface bounded timing/source diagnostics as compact status metadata with resource ownership and retry actions; verify RPC/registry wait is not mislabeled as OpenSpec scan and CLI/file-scan fallback remains understandable.
- [x] 6.3 Preserve themed controls, accessible labels/focus, responsive layout, selected identity, and no-horizontal-overflow behavior while adding the new staged states; verify client static contracts and narrow/keyboard fixtures pass.

## 7. Regression and independent-host validation

- [x] 7.1 Extend `test/shared.test.mjs` for scoped scans, archive exclusion/lazy loading, coalescing, TTL, invalidation, cancellation, timeout, path safety, CLI fallback, and timing redaction; verify `npm test` passes.
- [x] 7.2 Extend `test/client.test.mjs` for current-Workspace-first loading, absence of an unscoped first-load dependency, resource phases, snapshot hydration, lazy archive/documents, identity isolation, bounded diagnostics, and retry behavior; verify `npm run check` passes.
- [x] 7.3 Run `npm run pack:check` and install the built package into an independent scratch DSH profile only; verify the bundle loads without new runtime dependencies and the six read-only RPC descriptors remain unchanged.
- [x] 7.4 Validate the independent DSH Web instance at `http://127.0.0.1:3094` after its own restart, covering first entry, repeated Chat/OpenSpec switching, current Workspace priority, slow/non-current Workspace isolation, archive lazy loading, document-on-demand reading, retry/timeout, CLI fallback, themes, keyboard access, and narrow layout; do not restart, install into, or validate against the user’s `http://127.0.0.1:3080` instance.
