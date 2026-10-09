## Context

See `proposal.md` for the motivation and `specs/openspec-workbench/spec.md` for the externally observable compatibility contract. Current code has six Host invocations with strict codecs in `lib/typert.host.js`; both parameter/result descriptors provide `schema` but no `create()`. The browser descriptors in `lib/client.js` use the same legacy shape and attempt `require('zod')`, which is not guaranteed by the DSH 0.2 browser module table. The plugin's main `conversation.view` already uses a required `id` and registers inside `slots.inject` callback. Its settings contribution uses `settings.plugin.item`; the checked 0.2 manifest/runtime inventory exposes `settings.plugins.tab` for plugin settings, with required `id`, optional `order`/`label`, and `inject` for tab props. The locally inspected app.asar was marked `0.2.0-rc.2`; the user subsequently reported a successful basic manual smoke test on final DSH `0.2.0`, so compatibility metadata now targets the final 0.2.x line. No independent final-runtime trace is included in this change.

The project baseline test command currently passes 54 assertions/subtests, but existing Typert contract tests affirm the old schema-only host shape and the browser test expects a `zod` descriptor. This is a stale contract baseline, not evidence of DSH 0.2 compatibility.

## Goals / Non-Goals

**Goals:**

- Align both remote descriptor faces with the DSH 0.2 strict codec lifecycle while preserving the existing six methods, JSON DTO shape and read-only behavior.
- Keep browser codec factories independent of external dependencies not guaranteed in the client module table.
- Preserve the settings card as an OpenSpec-owned settings page using the selected DSH 0.2 `settings.plugins.tab` surface, with graceful degradation when the optional surface is absent.
- Make the supported runtime range, automated contract tests, isolated runtime acceptance and user-facing compatibility guidance consistent.

**Non-Goals:**

- No additions to RPC methods or changes to OpenSpec data semantics, Workspace scoping, CLI support, or mutation permissions.
- No redesign of the conversation view, general Settings UI, or preference data model.
- No changes to or restart of the user's active DSH profile as part of validation.
- Do not claim compatibility with DSH 0.2.0 final until its runtime contract and isolated execution have been verified.

## Decisions

### 1. Implement strict codec factories separately for Host and Client

Host-side `create()` will return a Zod v4 record schema equivalent to the current intended object boundary, so the Host API gateway's actual `create().parse(value)` call validates a JSON object. Client-side `create()` will return a small dependency-free schema object with a `parse` method that accepts non-null, non-array objects and rejects other values. Keep the parameter and result codec shape in sync across all six descriptors and retain the existing type symbols.

**Alternative considered:** Import Zod from the browser descriptor as currently attempted. Rejected because the 0.2 browser client module table is not a general package resolver and may fail module loading when zod is not in its seeded/boot graph. Also avoid making the client codec factory pretend to create a full Zod schema when the Client validation path only requires the factory contract and can preserve its current broad DTO semantics.

### 2. Treat the slot registry as a runtime compatibility surface

Keep the existing `conversation.view` contribution pattern: registration inside the `slots.inject` callback and a stable required id. Move the preferences card from the unrecognized `settings.plugin.item` key to `settings.plugins.tab`, using its required `id` and localized label. Retain the existing `settingsScope` injection and close over the bound scope in the tab's render callback; the tab owner itself supplies no settings props. Keep the settings slot optional: resolve it lazily and skip only that contribution if unavailable, rather than adding it to required plugin injection and making core activation depend on it.

**Alternative considered:** Put settings in `settings.general.item`. Rejected after user choice because that exposes preferences as one general row instead of preserving an OpenSpec-specific plugin page. Confirm the tab owner behavior and registration shape against the checked `0.2.0-rc.2` runtime; the user reports a successful basic manual smoke test on final `0.2.0`.

### 3. Test declared contracts and negative compatibility cases

Update Host tests to check `create()` and call its returned `.parse()` with valid and invalid object values. Update Client descriptor tests to materialize the browser module in a controlled dependency-free harness and assert factories on every parameter/result, no `require('zod')` path, exact RPC method names/wires and legacy schema-only rejection under a mirror of 0.2 validation. Include a mutation/negative test so removing `create()` from either face fails with the corresponding contract error. Keep the tests independent from the installed user's profile.

### 4. Pin compatibility to the verifiable runtime artifact

The checked official app.asar and embedded runtime package graph both report DSH `0.2.0-rc.2`, with Cordis `4.0.4`; the package engine and relevant DSH peers are pinned to that exact RC. Do not claim final `0.2.0` compatibility or widen the engine range while the final artifact has not been inspected. Preserve `dsh.client.platform: web`, the current bundle patch and package-name module loader id. Do not add `zod` to browser `external` or add settings slot packages to required injection merely to force module availability. A separate scratch `DSH_HOME`, temporary profile, dedicated non-legacy port and disposable browser data directory can verify only the RC; do not mutate or claim access to the user's current instance.

**Alternative considered:** Trust peer metadata and unit tests alone. Rejected because plugin activation failures can cause App self-protection to remove the bundle entry, while static tests do not exercise boot graph assembly, Host activation, slot projection or RPC transport.

## Risks / Trade-offs

- **[Local runtime artifact inspected was 0.2.0-rc.2; final-runtime evidence is user-reported]** → Keep release notes explicit that the final `0.2.0` smoke check was manual and not independently captured in this change.
- **[Settings tab injection props or owner lifecycle differ in final release]** → Inspect its provider contract and test registration/rendering in the isolated Web profile; failure of this optional surface must not block the main view.
- **[Activation failure may remove plugin from `dsh.profile.bundles`]** → Validate bundle membership after scratch install and after restart, and re-add the package if the isolated profile self-protects it out. Never diagnose only by checking `dependencies`.
- **[Existing tests enshrine outdated shape]** → Replace those assertions with runtime-aligned positive and negative contract checks before relying on test pass status.
- **[An isolated harness can accidentally target user data or a live port]** → Use explicit temporary home/profile/browser paths and a port guard; scripts must clean only processes and files they created.
- **[Published metadata can diverge from tested package]** → Synchronize package version, installer revision and README tag URLs where present, then read back the tagged package metadata as part of release validation.

## Migration Plan

1. Inspect and record the available official DSH app.asar and embedded package versions; supplement RC inspection with the user's report of a basic smoke test on final DSH `0.2.0`.
2. Update Host and Client codec contracts, move the optional settings contribution to `settings.plugins.tab`, and align metadata to the reported final `0.2.x` support line without changing RPC behavior.
3. Replace legacy-shape tests with Host/Client positive contract tests and schema-only negative/mutation tests; run syntax, full tests and package-content checks.
4. Where permitted, use only an isolated DSH profile under a disposable `DSH_HOME`, dedicated port and browser directory; do not use or modify a user's active instance.
5. Remove the plugin and stop only isolated test processes after validation; final release readback is conditional on actual publication.
6. For release, synchronize version/install/README tag references, publish/tag, and read back the tagged `package.json` to verify the shipped compatibility declaration.

## Open Questions

None that block the selected approach. The exact final DSH 0.2.0 runtime metadata and Settings tab provider contract are assigned as verification tasks before locking support ranges or implementing the adapter.
