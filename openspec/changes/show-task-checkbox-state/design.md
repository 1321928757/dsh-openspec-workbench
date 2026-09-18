## Context

See `proposal.md` for the motivation and externally visible scope. The current Client already has a bounded, text-only Markdown renderer in `lib/client.js`. It recognizes unordered list lines with an optional task marker, but its list model stores only the captured text, so `[x]` and `[ ]` are discarded before React nodes are created. The Host-side `parseTaskProgress()` independently counts checkbox markers correctly, which explains why the overview can show `10/11` while the document preview shows indistinguishable ordinary bullets.

The existing workbench is intentionally read-only, does not use a Markdown dependency, and renders untrusted document content as React text rather than HTML. The fix must preserve those constraints and must be validated in an isolated DSH Web instance rather than the user's live `http://127.0.0.1:3080` process.

## Goals / Non-Goals

**Goals:**

- Preserve task-list state from Markdown parsing through the preview node model.
- Render completed and incomplete task items with a clear, theme-compatible, read-only visual distinction.
- Keep ordinary lists, nested indentation, fenced code, truncation, stale content, and safe text rendering compatible with the current reader.
- Add deterministic regression coverage for marker variants and the no-write contract.
- Validate the packaged client in a separate test DSH profile/instance, defaulting to `http://127.0.0.1:3094`.

**Non-Goals:**

- No Host RPC, DTO, CLI status, progress normalization, or task counting changes.
- No task editing, checkbox toggling, file mutation, apply/verify/archive/sync actions, or new write API.
- No general-purpose Markdown parser or new runtime dependency.
- No installation, restart, or browser validation against `http://127.0.0.1:3080`.

## Decisions

### 1. Preserve checkbox state as structured list-item data

Change the client-side list accumulator from plain strings to bounded records such as `{ text, task, checked }`. The parser should recognize the existing unordered-list prefix and capture an optional task marker only outside fenced code. A case-insensitive `x` is completed; a single space is incomplete; ordinary list items remain `task: false` or equivalent and retain their original text. The implementation should keep the current line-oriented parser and avoid introducing a full Markdown dependency because the bug is local to task-list state preservation.

**Alternative considered:** Keep rendering the original `[x]`/`[ ]` text literally. This would preserve information but would not provide a reliable visual distinction or accessible read-only semantics, and would make the preview less readable for long task documents.

### 2. Use a disabled native checkbox plus text for task items

For a task item, render a real `<input type="checkbox" disabled>` (or an equivalent non-interactive semantic representation) adjacent to the task text. Set `checked` from the parsed state, and give the control a stable accessible label derived from the item text, e.g. `已完成：<text>` or `未完成：<text>`. The disabled control must not have an event handler or write path. Ordinary list items continue to render as text-only `<li>` nodes. CSS must stay under `.oswb-root`, use DSH semantic tokens, keep disabled controls visibly readable, and preserve list indentation.

**Alternative considered:** Render literal `[x]` and `[ ]` prefixes. This needs less markup but provides weaker visual affordance and accessibility, and can be confused with raw text rather than a task state.

### 3. Keep task preview separate from authoritative progress facts

Do not change `parseTaskProgress()`, `trackedTaskProgress`, CLI task summary, Apply progress, workflow status, or the overview progress bar. The preview checkbox communicates only what the selected document text contains. Existing provenance, freshness, revision, truncation, and read-only copy remain the source of truth for the surrounding document/resource state.

### 4. Test at source, package, and isolated runtime layers

Extend the existing source-contract tests to assert that the Markdown renderer captures task state, creates a disabled checked control, preserves ordinary list handling, and does not add a write operation. Run the existing unit/check/pack validation. Build or pack the updated package, install it into a scratch/test DSH Web profile, restart only that separate instance, and use browser verification on `http://127.0.0.1:3094` (or another explicitly selected isolated port) with a real `tasks.md` containing mixed states. The test record must explicitly state that `3080` was not touched.

## Risks / Trade-offs

- **[Minimal Markdown parser remains incomplete]** → Keep this change limited to task-list recognition; preserve current code-block and bounded text behavior, and do not imply full CommonMark support.
- **[Disabled native control may inherit inconsistent browser styling]** → Scope local sizing/alignment and use theme tokens for surrounding text/border while retaining native semantics and keyboard-safe disabled behavior.
- **[Task preview could be mistaken for authoritative workflow state]** → Keep overview progress/provenance labels unchanged and document that the control mirrors document text only.
- **[Runtime validation could accidentally affect the shared instance]** → Use a separate profile and port, verify the exact URL before testing, and do not restart or modify `http://127.0.0.1:3080`.

## Migration Plan

1. Implement the client parser/rendering and tests without changing Host contracts.
2. Run `npm test`, `npm run check`, `npm run pack:check`, and OpenSpec validation.
3. Pack/install the new artifact into an isolated scratch DSH Web profile, restart that profile only, and verify mixed task states, ordinary lists, code blocks, read-only behavior, and light/dark or narrow layout as available at the isolated URL.
4. If isolated validation fails, remove the scratch installation or restore the previous scratch package; the user's `3080` profile remains untouched.
5. After implementation and isolated verification, update/commit the change through the normal workflow; this planning artifact does not authorize implementation now.
