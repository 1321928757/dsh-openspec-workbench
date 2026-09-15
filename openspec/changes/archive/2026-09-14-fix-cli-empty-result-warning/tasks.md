## 1. Host CLI result classification

- [x] 1.1 Update the CLI status result classification in `lib/index.js` so a valid supported-CLI payload with an empty collection and zero rejected/invalid-field records returns `changes: []`, `provenance: 'cli'`, normal timing, and no `CLI_EMPTY_DATA` warning; verify existing CLI failure and file-scan fallback paths remain unchanged.
- [x] 1.2 Preserve the distinction between a legitimate empty status and a container/record normalization failure; verify an all-invalid status payload still reports partial-data or identity diagnostics and does not claim CLI authority.

## 2. Regression coverage

- [x] 2.1 Add a deterministic supported-CLI fixture in `test/shared.test.mjs` for an empty `status --all --json` result; verify `listChanges` returns an empty active list, `provenance: 'cli'`, no `CLI_EMPTY_DATA`, and no user-facing warning diagnostic.
- [x] 2.2 Extend client static contracts in `test/client.test.mjs` as needed to verify the top notice remains conditional on actual diagnostics, so a successful empty response renders the normal empty state while real CLI warnings remain visible.

## 3. Validation and runtime verification

- [x] 3.1 Run `npm test`, `npm run check`, and `npm run pack:check`; verify all tests pass and the package still exposes the six read-only RPC methods without new dependencies.
- [x] 3.2 Validate the independent DSH Web instance after installing the rebuilt package; verify an empty active scope shows only the normal empty-state copy, archive switching preserves its own scope behavior, and genuine CLI failures still show bounded diagnostics without modifying the user's 3080 instance.
