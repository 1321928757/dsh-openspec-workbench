# Release notes

## 0.2.0

### Breaking compatibility change

- Requires DSH `>=0.2.0 <0.3.0` and Cordis `~4.0.4`.
- Host and Client Typert strict descriptors now use `create()` codec factories. Older DSH 0.1.x runtimes are not supported.

### Changed

- Migrated the settings contribution to the DSH Plugins settings tab (`settings.plugins.tab`).
- Removed the Client codec's dependency on loading `zod` from the browser module table.
- Kept the existing six read-only OpenSpec RPC methods and Workspace-scoped behavior.
- User reports a successful basic manual smoke test on final DSH `0.2.0`; automated checks cover the Host/Client contracts and package.

### Validation scope

- `npm test`, `npm run check`, and `npm run pack:check` passed locally.
- An isolated DSH `0.2.0-rc.2` profile was used for a Web smoke check; the plugin appeared in the bundle and inventory and no plugin activation error was seen in the browser.
- The complete six-RPC/no-project-mutation test was not recorded as part of this change. The tag does not claim that an independently captured end-to-end trace exists.
