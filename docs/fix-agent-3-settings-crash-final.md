# FIX AGENT 3 — Settings/Plugins TypeError

## Result

The packaged Settings → AI/local models → Plugins flow was exercised in an isolated temporary profile against preview `output/feature-preview-2026-10-05T00-19-27-801Z-c373ce4e` (EXE SHA-256 `6FB2D41D33F61420F017022642B867396C8B8781D493D2D6785F10BE112417BA`). The real bundled Sidekick reached `ready`; both Settings sections rendered. **The reported `Cannot convert undefined or null to object` did not reproduce.** No production callsite can therefore be attributed and no speculative source fix was made.

There is no React ErrorBoundary stack/component stack to report because no boundary fired. The packaged app's `PanelErrorBoundary` logs the error object but not React's `componentStack`; the existing controlled renderer-mount harness captures both if a future fixture triggers a boundary.

The package returned these anonymized shapes (keys only, no values/secrets):

- `getSettings`: object; keys included `theme`, `language`, `default_model`, `plugins` was not present.
- `/api/models`: object with `active_provider`, `configured_model_badges`, `default_model`, `groups` (empty array), `thinking_models`.
- `/api/auth/status`: object with `auth_enabled`, `logged_in`.
- `/api/plugins`: object with `empty`, `plugins` (empty array), `read_only`, `supported_hooks`.
- fallback model: object with `fallback_model: null`, `ok`.
- extension IPC list: empty array; presets: array of 5 records.

The exact response-shape report is [settings-plugins-packaged-6b4044d5-9cb1-4e45-9330-06f27dd1487c.json](../output/settings-plugins-packaged-6b4044d5-9cb1-4e45-9330-06f27dd1487c.json). It contains only sanitized response keys/types and test diagnostics.

## Changes and checks

- Added `apps/desktop/tests/settings-plugins-packaged-smoke.cjs`: launches the actual preview EXE, reaches the two real Settings sections, records sanitized response shapes and PanelErrorBoundary console data, and uses a fresh temp `userData`.
- Before launch, that test seeds only its own profile's bootstrap status as failed with the retry limit exhausted; post-start assertions verify no bootstrap bytes downloaded or verified. No weights, model inference, existing app profile, or user account were touched.
- `node --check apps/desktop/tests/settings-plugins-packaged-smoke.cjs` — passed.
- `node apps/desktop/tests/settings-plugins-packaged-smoke.cjs output/feature-preview-2026-10-05T00-19-27-801Z-c373ce4e` — passed; actual Provider and Plugins sections rendered, ErrorBoundary empty, target TypeError absent.
- `node_modules/.bin/vitest run apps/desktop/tests/extension-settings-state.test.ts --pool=threads --maxWorkers=1` — passed, 4/4. Initial sandbox attempts failed before test collection with `spawn EPERM`; the same focused command passed with sandbox permission.
- `node apps/desktop/tests/settings-plugins-renderer-smoke.cjs` — passed; null, valid, and malformed extension IPC fixture mounts; no boundary error and no target TypeError.
- `git diff --check` on touched/relevant Settings files — passed (only Git's LF→CRLF advisory for the shared `SystemPanels.tsx`).

## Remaining unknown

The original triggering response/state/section is still unknown. Actual package responses in this fresh profile are valid and non-null for the routes used, with empty plugin/model inventories. The source-side extension IPC normalization remains a tested defensive boundary, not a demonstrated fix for the reported crash. Reproduction needs the exact affected Settings subsection and its response shape (or a sanitized stack from the profile where it occurs); do not claim the original bug fixed based on these green controls.

No build, broad suite, Git index mutation, commit, push, or publication was performed.
