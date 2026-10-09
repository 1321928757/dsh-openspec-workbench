## 1. Runtime Contract and Compatibility Metadata

- [x] 1.1 Inspect the available official Host/Browser codec rules and plugin Settings tab registration from DSH `0.2.0-rc.2` / Cordis `4.0.4`; the user separately reports a successful basic manual smoke test on final DSH `0.2.0`.
- [x] 1.2 Set `engines.dsh` and DSH API peers to `>=0.2.0-rc.2 <0.3.0` so the known RC.2 prerelease and final 0.2.x builds satisfy SemVer, align Cordis to `~4.0.4`, and verify `dsh.client.platform`, exports, bundle patch and client injection. Final-release evidence is user-reported manual smoke testing, not an independently captured runtime trace.

## 2. Host and Client Contract Migration

- [x] 2.1 Update every Host Typert strict parameter/result codec to provide `create()` returning a schema with working `.parse()`; verify all six invocation descriptors accept valid object payloads and reject invalid values.
- [x] 2.2 Update all browser remote descriptor codecs to provide dependency-free `create()` factories, remove reliance on `require('zod')`, and preserve the exact RPC method, wire and DTO contract; verify the browser descriptor can load with only declared client modules.
- [x] 2.3 Move the preferences contribution to DSH 0.2 `settings.plugins.tab` with its required stable `id` and label, retaining the settings scope through the plugin's optional injection; verify the optional tab registers while the main conversation view remains available if that Settings surface is absent.

## 3. Regression Tests and Package Checks

- [x] 3.1 Replace Host and Client tests that encode schema-only descriptors with positive DSH 0.2 contract assertions and negative/mutation tests for missing `create()`; verify the failures match the relevant runtime contract errors.
- [x] 3.2 Run `npm test`, `npm run check`, and `npm run pack:check`; verify syntax, all tests, package export targets and packed files pass for the declared DSH `>=0.2.0-rc.2 <0.3.0` range.
- [x] 3.3 Update README compatibility/install guidance and existing release metadata: version/tag `0.2.0` records the initial migration; this follow-up bumps package version/tag to `0.2.1` to admit DSH RC.2, reflects the user's manual final-runtime smoke test, and states isolated validation requirements. No installer revision exists in this repository; tag publication remains conditional.

## 4. Isolated Runtime Acceptance and Release Readiness

- [x] 4.1 Create and verify a separate scratch `DSH_HOME`, temporary Web profile, OS-assigned ephemeral ports (not 3080), and disposable Chromium user-data directories before launching; the scratch paths did not target the current profile.
- [x] 4.2 Install the package into the scratch profile and verify its bundle membership after launch; confirmed the live RC Web boot graph included `dsh-openspec-workbench` and browser console reported no activation errors. A fresh plugin `boot.log` was not available in the checked RC runtime, so apply-log completion was not asserted; user separately reports a successful basic manual test on final DSH `0.2.0`.
- [ ] 4.3 User reports a successful basic manual test on final DSH `0.2.0`, but this task's full acceptance (OpenSpec view and plugin Settings tab rendering, six read-only RPCs, and no project-file mutation) has no recorded evidence. Keep incomplete unless those specific checks are confirmed.
- [ ] 4.4 If publishing a release, synchronize package version, install revision and README tag address, then read back the published tag's `package.json`; verify its DSH/Cordis support declaration matches the tested package.
