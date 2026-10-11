# A-029b: Readable requestWebui errors and Ollama test diagnosis

- Date: 2026-10-11, Europe/Vienna
- Agent: chatgpt-ollama-worker
- Branch: codex/a-029b-ollama-errors-20261011
- Base: origin/release/v0.1.52 at d39ae7fa
- Scope approved by CTO: sidekick-api.ts, sidekick-api.test.ts, this report.
- Claim/collision check: original A-029 thread read, claim at 08:22:08 CEST, thread reread after 60 seconds; sibling A-029a owns persistence and did not claim A-029b.

## Cause and change

`apps/desktop/src/main/sidekick-api.ts:904` formerly called `String(payload.error)` on failed HTTP responses. The backend's standardized error envelope is an object (`services/sidekick/web/api/helpers.py:40-67`), so its useful message became `[object Object]` across Electron IPC. The existing renderer catch displays `err.message` (`apps/desktop/src/renderer/panels/SystemPanels.tsx:4648`); correcting Main's Error message requires no renderer edit.

The bridge now reads only string fields from the documented envelope (message, error, detail, details), includes the HTTP status, handles null/malformed envelopes, bounds each selected string to 500 characters and does not stringify arbitrary response objects. A nested `error.message: provider_unreachable` now produces `HTTP 400: provider_unreachable`. Authentication refresh, timeout, scope binding and response handling remain covered by existing tests.

## Ollama diagnosis and limits

- `services/sidekick/web/api/routes.py:7323-7342` forwards `/api/providers/test` to `probe_ollama_connection`; failures use the standardized envelope above.
- `services/sidekick/web/api/providers.py:1968-2024` accepts loopback local endpoints, strips a trailing `/v1`, probes `/api/tags`, uses an 8-second timeout and refuses redirects. There is no source evidence of an incorrect standard local endpoint in this path.
- Read-only requests using Python urllib to both `http://localhost:11434/api/tags` and `http://127.0.0.1:11434/api/tags` on this host returned `URLError`, reason `ConnectionRefusedError` at approximately 08:23 CEST. No provider keys, model names or response bodies were printed.
- This current refusal does **not** prove Cid's earlier failure cause when Ollama was running. That historical transport/provider failure remains unverified; the fix exposes the actual backend message on reproduction. No claim of a successful live Ollama connection, packaged IPC/GUI acceptance or update/VM acceptance is made.
- Provider persistence is the separate A-029a task; no backend or config files changed here.

## Verification

| Check | Result |
| --- | --- |
| npm ci | PASS, 424 packages installed; npm reports 33 dependency vulnerabilities, no dependency upgrades attempted |
| Regression before fix | FAIL as expected: 7 new cases failed, 42 existing tests passed |
| Focused API suite after fix | PASS: 49/49 |
| npm run test:run, final | PASS: 215 files, 1,974 tests, exit 0, 32.65 seconds |
| npm run build | PASS: main TypeScript, renderer typecheck and Vite; existing chunk-size warning |
| npm run verify:store | PASS: 39 PASS, 2 WARN, 0 FAIL; warning for provisional screenshot content and no supplied final signed package |
| python -m compileall -q services/sidekick | PASS, exit 0 |
| git diff --check | PASS |

The first full suite failed only because the fresh worktree lacked `node_modules/electron/dist/electron.exe` (214 files passed, 17 DOM tests skipped). Electron's installer returned without producing the binary. The ignored test dependency was restored from the existing hotfix worktree after exact package version comparison (`37.10.3+wvcus`); executable SHA-256: `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`. The complete suite was then rerun successfully. No dependency manifest or tracked package was changed.

No merge, version change, CHANGELOG change, tag, package signing or release action was performed.
