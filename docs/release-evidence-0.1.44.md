# 0.1.44 source integration evidence

Date: 2026-10-05. This records source checks, not a published or signed release.

The root package, desktop package and lockfile versions agree on 0.1.44. The integrated change includes in-tree independent agents, scoped profiles, persistent goals, compact chat controls, advanced-only model policy settings, AUTO routing, Teamwork, the simplified local-AI setup and updated website candidate notes.

Root final checks after the product freeze:

- Desktop Vitest: 1,727 tests passed, zero failures; `output/root-final-desktop-0.1.44.json`.
- Desktop build: exit 0; `output/root-final-build-0.1.44.log`. Vite reports its known large-chunk warning.
- Store preflight: exit 0, 39 pass, 2 warnings, zero failures; `output/root-final-store-0.1.44.log`. This is not Store certification.
- Bundled Python syntax check: `apps/desktop/runtime/python/python.exe -I -B -m compileall -q services/sidekick`, exit 0; `output/root-final-python-syntax-0.1.44.log`.
- Secret-fixture check after staging new sources: exit 0; `output/root-staged-secret-check-0.1.44.json`.
- Staged paths contain no auth.json, config.yaml, database, GGUF or native release binaries. Generated outputs, test profiles, worktrees and release directories are ignored.

Multi-provider source-App acceptance passed: `output/root-teamwork-live-cee5dbf8-39b9-4610-a0b8-f644a59ecfc4.json`, `passed: true`, child exit 0, effective mode `multi_provider`. The actual Main/preload/renderer and bundled Python delivered three worker starts and deltas from all three controlled providers. Observed HTTP requests: GPT 2, Gemini 3 and Ollama 1 (including planner/critic/synthesis). Completion and stream-end events were observed; all fixture streams were released, no held workers remained and the enrollment manifest hashes were unchanged. These are private Loopback providers, not evidence of paid-account credentials, external service availability or model quality.

Three providers on one unknown account origin retain the conservative shared concurrency limit. Teamwork uses the existing bounded pending-claim behavior for exactly that concurrency case; unrelated capacity denials remain fail-closed. The corrected provider simulation uses distinct endpoints and progressively releases completed streams to respect the two compute slots.

Pending release work remains explicit: fresh signed Setup/Portable, VMP verification, exact package checks, installation/update/restart acceptance, clean-Windows dependency evidence, unresolved licensing entitlement and website production deployment. No download, certificate verification, external account quality or final release completion is asserted here.
