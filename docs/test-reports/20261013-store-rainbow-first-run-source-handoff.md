# Store, Rainbow and first-run source handoff

Date: 2026-10-13. Integration worktree: `v0157-simplify-ai-20261013`.

## Implemented source

- Curated model catalog: 40 records, 29 text / 5 image / 6 video. Compact category overview and separate model details. Conservative hardware estimates and opt-in visibility for other hardware classes.
- Catalog browsing is enabled in the test build through the scoped store route. New catalog entries are metadata only: no qualified artifact, install permission or successful runtime benchmark is implied.
- Rounded masked startup border with three persisted styles: classic Rainbow, Aurora, light orbit. Existing sound themes and reduced-motion handling retained.
- First-run pages: search engine; detected standalone Sidekick migration only when relevant; browser import/default-browser choice; pinned dock apps; AI yes/no; provider setup only with AI; first Space always, companion personality only with AI.
- Space name goes through existing workspace APIs. Provider configuration and companion preference are saved for the resulting Space. Completion is saved before switching to that Space. Newly created first Spaces retain tabs imported during onboarding.
- Successful first-ever setup mounts a one-time Welcome In opening at 8% volume using the existing sound clock. It does not persist sound activation for future launches. Failed/stalled playback cannot trap the user.

## Verification

- PASS: main TypeScript compilation with `--noEmit` for the Store/Rainbow snapshot.
- PASS: renderer TypeScript compilation with `--noEmit`, including final wizard, Space wiring and welcome completion.
- PASS: `git diff --check`.
- Backend agent reported PASS for Python syntax, TOML, curation schema and catalog record counts.
- Compiler input copied to `output/store-rainbow-sourcecheck-20261013`, using read-only references to the intact beta.2 dependency installation. Shared dependency files were not changed.
- No tests, model downloads, runtime model benchmarks or VM interaction performed for these changes. Installed-app visual behavior remains unverified.

## Packaging boundary

These source changes are not included in the immutable signed 0.1.57-beta.2 candidate from Anker. That candidate completed packaging and signing separately, and Argus received its exact hashes through Slack. Build a subsequent private candidate from a reviewed source snapshot to exercise this feature set.

Next Argus coverage: both first-run branches; optional migration presence/absence; import retention across navigation; first-Space persistence and companion scope; welcome sound/volume/failure fallback; border corners and all three variants at multiple window sizes and reduced motion.
