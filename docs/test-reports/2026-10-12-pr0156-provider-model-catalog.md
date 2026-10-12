# PR-0156 provider model catalog evidence

## Scope and provenance

The source change adds a profile and space scoped catalog contract to `modelSelection`, carrying provider source, discovery status, observation time, model listing status, and only source-backed feature values. Legacy provider groups remain available for older clients. The shared renderer mapper accepts current API listings and explicitly configured model allowlists; it does not relabel configured choices as live API listings. Explicitly configured entries always report independent qualification as `unknown` with `explicit_configuration_unverified`, even if a separate native execution probe has evidence for that provider and model. The chat picker labels these entries `configured · unverified`. Provider Settings now requests the same scoped selection used by chat and Quickchat. Cached AI Gateway API evidence retains its source and observation time.

No user credentials were read for test setup and no provider API was queried live. API-source behavior was exercised only with controlled test fixtures. `liveTest` remains `not_run`; provider runtime, packaged binary, VM, and human UI acceptance are not claimed. Real API availability requires provider-backed discovery in the exact configured profile, followed by a separate chat qualification result. That check remains pending coordination with the sole designated VM owner and PR-72 test candidate; no second VM session, auth automation, extra API request, global cache, or qualification bypass was used.

## Evidence

| Check | Result | Notes |
| --- | --- | --- |
| Focused Python regression tests | 41 passed, 1 failed due to environment | `test_independent_scoped_models.py` and `test_openai_api_key_provider.py`; 41 tests pass, including the explicit configuration qualification regression. The packaged isolated-worker test ran and failed because its external Python 3.14 process cannot import `pydantic`. |
| Python syntax | Passed | `python -m compileall -q services/sidekick` |
| Diff whitespace | Passed | `git diff --check` |
| Desktop build | Passed | `npm --workspace apps/desktop run build`; Main TypeScript, renderer TypeScript, and Vite build passed. Vite reports the existing large-chunk warning. |
| Focused renderer regression and smoke tests | 28 passed (targeted) | `provider-model-selection.test.ts`; confirms source status reaches picker options as `configured`, separately from `current`. The six-file focused run passed 34 tests on the preceding source state. |
| Full `npm test` | 2,190 passed, 19 skipped, 1 failed | The remaining failure is `windows-signature-preservation.test.ts`, whose installed `app-builder-lib` hook resolver rejects the fixture's undefined `from` argument. All other suites, including renderer smokes, pass. |
| Store preflight | 39 passed, 2 warnings, 0 failed | Rerun on this source state; warnings are provisional screenshot content and no package supplied for signature readiness. |
| Live provider catalog/API | Not run | No credential or live API call was made. Real availability evidence needs an owner-coordinated provider-backed discovery on the existing designated VM. |
| Packaged/VM/runtime acceptance | Not run | Pending sole VM-owner coordination with the PR-72 preview test candidate and a built artifact; this task did not control the VM. |

## Review boundaries

Changes are isolated on `codex/v0156-shared-provider-model-catalog-20261012`, based on PR #76 base `7d3d52bb58114296b66b7eeef290b67581b226bc`; the final report is tied to the commit head recorded with the PR update. No PR-72 preview-owned renderer files, primary dirty checkout, or PR-0155 worktree were modified. No sign, publish, deploy, VM, merge, or release action was performed.
