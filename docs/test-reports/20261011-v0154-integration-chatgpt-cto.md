# v0.1.54 preparation: combined source integration

Date: 2026-10-11, Europe/Vienna. Owner: chatgpt-cto.
Branch: `codex/v0154-integration-20261011`.
Base: `release/v0.1.52` at `d39ae7fa572ff8ee5c2ac5443487ebb42761f3e4`.

This branch combines reviewed source fixes for Cid's candidate preparation.
It is not a release or an installed/signed candidate. Version and CHANGELOG
remain unchanged. Release/default branches and the dirty primary checkout are
not modified. PR31 metadata and PR32 website are separate owner decisions.

## Source mapping

| PR | Auftrag | Reviewed source head | Integration state |
| --- | --- | --- | --- |
| 37 | A029b readable WebUI errors | 2a417cb336d86c442f60414a980a620b7b630175 | applied |
| 38 | A029a named profile persistence | a4bdd2df011cec25042b98e88957c8740bdf6d9d | applied |
| 39 | A008a Zen IPC shortcut | 3e19d1b72d8db29e7aea3453fb4ce5237c95154c | applied |
| 40 | A026 retired provider | 1a3fec8f1dbbec340365456e5129926bbe1db774 | applied (three commits; all review findings closed) |
| 41 | A027 active models | 1d7ec1423a2291b0b33f9b40ab14ee519c5f7c01 | applied (two commits; fallback corrected) |
| 36 | A007 navigation smoke | d3f99581328fe068f2e0ac84d3517c5f51a8cfd2 | applied (two commits) |

All applied PRs have independent technical review comments. Shared GitHub
author credentials prevent treating these comments as formal account approvals.
This table binds the final reviewed heads. PR40 includes `b77dc15f`, `f1e1c441`
and `1a3fec8f`; PR41 includes `72ae82ba` and `1d7ec142`; PR36 includes
`a56cf7bb` and `d3f99581`. No source commits outside these reviewed ranges are
included. Technical review closure comments: PR40 `6106773163`, PR41
`6106768768`, PR36 `6106722111`.

Process exception: the A027 author previously force-pushed a corrected base
despite the explicit prohibition. This was disclosed in Slack and the author
instructed to use only additive commits. This integration uses the subsequently
reviewed exact two-commit range; integration history is never force-pushed.

## Environment preparation

`npm ci`: exit 0, 424 packages. Existing audit: 33 findings; no dependency change.
The installed git Electron dependency omitted the Windows executable. Restored
only ignored dependency runtime from A008a after matching `37.10.3+wvcus`.
Electron executable SHA256:
`096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`.

Intermediate PR37/38/39 profile/bridge/isolation run: 77 passed, 2 deprecation
warnings, exit 0. Dev Python3.14 drives pytest; `sys.executable` points to the
existing bundled Python3.12 for isolated subprocesses. This is a test harness
selection, not an installed runtime or production profile change.

## Final combined gates

- `CI=1 npm test`: exit 0, 220 files / 1994 tests PASS.
- `npm run test:run`: exit 0, 220 files / 1994 tests PASS.
- `npm run build`: exit 0, main/renderer TypeScript + Vite PASS; existing chunk
  size warning remains.
- `npm run verify:store`: exit 0, 39 PASS / 2 WARN / 0 FAIL. Warnings are
  provisional screenshots/localization and absent final signed package.
- `python -m compileall -q services/sidekick`: exit 0.
- Combined nine backend files: 153 PASS, 2 websocket deprecation warnings,
  exit 0. Includes retirement, OAuth/accounts/cache, FastAPI startup/bridge,
  profile persistence and independent/concurrent profile isolation.
- `git diff --cached --check`: exit 0. Version, lockfiles and CHANGELOG unchanged.

Backend invocation (from this worktree; no persistent environment changes):

```powershell
python -c "import sys,pytest; sys.executable=r'C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'; raise SystemExit(pytest.main(['-q','services/sidekick/tests/test_fastapi_profile_persistence.py','services/sidekick/tests/test_fastapi_route_bridge.py','services/sidekick/tests/test_independent_profile_isolation.py','services/sidekick/tests/test_independent_backend_profile_concurrency.py','services/sidekick/tests/test_retired_antigravity_provider.py','services/sidekick/tests/test_antigravity_multi_account.py','services/sidekick/tests/test_provider_oauth_status.py','services/sidekick/tests/test_models_cache_fingerprint.py','services/sidekick/tests/test_google_multi_account_routing.py']))"
```

## Conflict resolution

Applying A026 after A027 conflicted in two files. `model-picker-options.ts`
retains both the orchestration flag and retired-provider imports/filter.
`NativeChatMain.tsx` retains A027's mutable active-model fallback selection
and first clears a retired provider/model/configured tuple from A026. All other
changes applied automatically. No released branch was merged or rewritten.

Intermediate PR36/37/38/39 full desktop suite: exit 0, 217 files / 1984 tests
passed, including the executable Electron navigation probe. A026/A027 are not
included in this intermediate count; their reviews require further corrections.

## Cid's candidate test matrix

1. Before update, record provider IDs, selected named profile, default model and
   active-model choices without credentials. After update and two restarts,
   compare them; unknown config fields and existing auth files remain intact.
2. Legacy Antigravity normal/custom aliases must not appear in Settings,
   onboarding or either chat picker. Explicit unrelated OpenAI remains usable.
3. Newly scanned models default active. Explicit opt-outs survive restart and
   scans. A newly discovered model is active. Disabling the selected model gives
   an active fallback and message; no active models gives a Settings link.
4. AI Orchestration, Teamwork and virtual multi-agent selection are hidden with
   the default flag; direct navigation cannot expose the tab.
5. Ollama Testen: reachable endpoint succeeds; unreachable endpoint shows a
   readable reason/status, never `[object Object]`. Current successful Ollama
   connection is NOT VERIFIED; previous local probe returned connection refused.
6. For each actually available Ollama/MiMo/Codex account: response + follow-up,
   streaming, Stop, model switch and history after restart. Record unavailable
   providers separately; mock/source tests are not real provider answers.
7. Ctrl+B twice with browser focus in Zen toggles only overlay; context panel
   and Zen stay unchanged. Check normal sidebar mode too.
8. With first-run overlay present, real sidebar/tab/topbar clicks reach the
   expected controls. Electron component probe is not final package acceptance.

## Owner steps still required

After technical review and combined gates, Cid chooses integration into the
release branch, updates version/CHANGELOG, authorizes signing/package creation,
checks signatures and exact artifact hashes, and runs the matrix against that
exact candidate. No signing, packaging, tag, publication, Store submission or
owner merge is performed by this integration task.
