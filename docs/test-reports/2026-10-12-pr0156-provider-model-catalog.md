# PR-0156 provider model catalog evidence

## Scope and provenance

The source change adds a profile and space scoped catalog contract to `modelSelection`, carrying provider source, discovery status, observation time, model listing status, and only source-backed feature values. Legacy provider groups remain available for older clients. The shared renderer mapper accepts current API listings and explicitly configured model allowlists; it does not relabel configured choices as live API listings. Provider Settings now requests the same scoped selection used by chat and Quickchat. Cached AI Gateway API evidence retains its source and observation time.

No user credentials were read for test setup and no provider API was queried live. API-source behavior was exercised only with controlled test fixtures. `liveTest` remains `not_run`; provider runtime, packaged binary, VM, and human UI acceptance are not claimed.

## Evidence

| Check | Result | Notes |
| --- | --- | --- |
| Focused Python regression tests | 41 passed, 1 deselected | `test_independent_scoped_models.py` and `test_openai_api_key_provider.py`; the packaged isolated-worker test is excluded because its external Python 3.14 process cannot import `pydantic`. Includes regressions for cached AI Gateway provenance and configured allowlist origin. |
| Python syntax | Passed | `python -m compileall -q services/sidekick` |
| Diff whitespace | Passed | `git diff --check` |
| Desktop build | Passed | `npm --workspace apps/desktop run build`; Main TypeScript, renderer TypeScript, and Vite build passed. Vite reports the existing large-chunk warning. |
| Focused renderer regression and smoke tests | 34 passed | Six files covering shared model selection, retired-provider filtering, standard chat, settings renderer, provider workspace, and sidebar geometry. The model-selection file includes explicit configured choices alongside current API listings. |
| Full `npm test` | 2,190 passed, 19 skipped, 1 failed | The remaining failure is `windows-signature-preservation.test.ts`, whose installed `app-builder-lib` hook resolver rejects the fixture's undefined `from` argument. All other suites, including renderer smokes, pass. |
| Store preflight | 39 passed, 2 warnings, 0 failed | Warnings are provisional screenshot content and no package supplied for signature readiness. |
| Live provider catalog/API | Not run | No credential or live API validation was authorized or required for source-level regression work. |
| Packaged/VM/runtime acceptance | Not run | Requires the designated VM owner and a built artifact. |

## Review boundaries

Changes are isolated on `codex/v0156-shared-provider-model-catalog-20261012` from base `04593080169462375cfa6209bcb70e148ad242d8`. The review head is recorded in the PR and branch commit. No PR-72 preview-owned renderer files, primary dirty checkout, or PR-0155 worktree were modified. No sign, publish, deploy, VM, merge, or release action was performed.
