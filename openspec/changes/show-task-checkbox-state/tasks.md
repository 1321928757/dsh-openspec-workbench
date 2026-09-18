## 1. Client task-list parsing and rendering

- [x] 1.1 Refactor the bounded Markdown list-item representation in `lib/client.js` to retain task-list detection and checked state for `- [x]`, `- [X]`, `- [ ]`, and `*`/indented variants while preserving ordinary list text and fenced-code behavior; verify with `node --check lib/client.js` and source-level parser assertions.
- [x] 1.2 Render task-list items as clearly distinct, read-only controls adjacent to their text, with completed and incomplete states, accessible labels, local `.oswb-root` styling, and no mutation handlers or write RPC; verify the generated client source contains disabled/read-only semantics and no new write method.
- [x] 1.3 Preserve existing Markdown safety, truncation, ordinary list, heading, paragraph, code-block, stale and error behavior while adding task state; verify no `dangerouslySetInnerHTML` or unrestricted HTML rendering is introduced.

## 2. Regression coverage

- [x] 2.1 Extend `test/client.test.mjs` to cover mixed `[x]`, `[X]`, `[ ]`, ordinary lists, indentation, and code blocks, asserting that task state is captured and rendered rather than discarded; verify `npm test` passes.
- [x] 2.2 Add or update tests for read-only behavior and public contract stability, confirming the six existing read-only RPC methods remain unchanged and no task toggle/write path is exposed; verify `npm run check` passes.

## 3. Package and isolated DSH validation

- [x] 3.1 Run `npm test`, `npm run check`, `npm run pack:check`, and the relevant OpenSpec validation commands; verify generated package contents include the updated `lib/client.js` and no unexpected dependency or manifest changes.
- [x] 3.2 Install the rebuilt package into a separate scratch/test DSH Web profile, restart only that isolated process, and verify the exact isolated URL is reachable before browser testing; record that `http://127.0.0.1:3080` was not installed into, restarted, or used for validation.
- [x] 3.3 In the isolated DSH instance (default `http://127.0.0.1:3094`), open a real `tasks.md` with mixed completed/incomplete items and verify visible state alignment, ordinary-list/code-block behavior, read-only interaction, refresh/stale/error handling, and no horizontal overflow in applicable light/dark/narrow layouts; retain the test URL and evidence for review. Verified at `http://127.0.0.1:3094/`: 8 disabled/read-only task checkboxes, 6 checked and 2 unchecked, no write-like resource calls, and document/body width equal to client width (1724px).
