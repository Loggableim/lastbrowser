# PR-0156 provider model catalog evidence

## Scope and provenance

The source change adds a profile and space scoped catalog contract to `modelSelection`, carrying provider source, discovery status, observation time, model listing status, and only source-backed feature values. Legacy provider groups remain available for older clients. The shared renderer mapper accepts current API listings, explicitly configured model allowlists, and curated fallback candidates; it does not relabel either configured or fallback choices as live API listings. Explicitly configured entries always report independent qualification as `unknown` with `explicit_configuration_unverified`, even if a separate native execution probe has evidence for that provider and model. The chat picker labels these entries `configured · unverified`. Curated candidates use a separate `fallback` listing status and are labeled `Curated fallback · unverified`; they also remain independent qualification `unknown` with `curated_fallback_unverified`. Provider Settings now requests the same scoped selection used by chat and Quickchat. Cached AI Gateway API evidence retains its source and observation time.

No user credentials were read for test setup and no provider API was queried live. API-source behavior was exercised only with controlled test fixtures. `liveTest` remains `not_run`; provider runtime, packaged binary, VM, and human UI acceptance are not claimed. Real API availability requires provider-backed discovery in the exact configured profile, followed by a separate chat qualification result. That check remains pending coordination with the sole designated VM owner and PR-72 test candidate; no second VM session, auth automation, extra API request, global cache, or qualification bypass was used.

## Evidence

| Check | Result | Notes |
| --- | --- | --- |
| Focused curated fallback regressions | 2 passed | `test_curated_fallback_provider_models_are_selectable_candidates_not_stale_api_evidence` and `test_provider_model_catalog_marks_only_api_listed_ids_current`; verify fallback candidates remain unverified and API-current stays exclusive to API-backed IDs. |
| Focused Python regression tests | 29 passed, 1 failed due to environment | `test_independent_scoped_models.py`; the packaged isolated-worker test ran and failed because its external Python 3.14 process cannot import `pydantic`. The exact prior-head Argus report proves 29/29 tests at b8631596; it does not cover this fallback-status delta. |
| Python syntax | Passed | `python -m compileall -q services/sidekick` on this source head. |
| Diff whitespace | Passed | `git diff --check` on this source head. |
| Desktop build | Passed | `npm --workspace apps/desktop run build` on this source head; Main TypeScript, renderer TypeScript, and Vite build passed. Vite reports the existing large-chunk warning. |
| Focused renderer regression | 28 passed | `provider-model-selection.test.ts`; verifies current, explicit-configured, and curated-fallback statuses map separately. |
| Full `npm test` | 2,190 passed, 1 failed | 242/243 test files passed. The remaining failure is `windows-signature-preservation.test.ts`, whose installed `app-builder-lib` hook resolver rejects the fixture's undefined `from` argument. |
| Store preflight | 39 passed, 2 warnings, 0 failed | Rerun on this source head; warnings are provisional screenshot content and no package supplied for signature readiness. |
| Argus isolated-loopback catalog test | 29 passed at b8631596 | Existing report `2026-10-12-pr76-scoped-model-catalog-argus.md`, commit `059ddf90fd8ad9fe68ae3055e14d749c24e64afd`: Python 3.12 venv, exact prior PR head, two isolated worker profiles, controlled loopback `/models`, inference POST rejected with 405. This is source-level catalog evidence only and does not test this fallback correction or live provider availability. |
| Live provider catalog/API | Not run | No credential or external provider API call was made. Real availability evidence needs an owner-coordinated provider-backed discovery on the existing designated VM. |
| Packaged/VM/runtime acceptance | Not run | Pending sole VM-owner coordination with the PR-72 preview test candidate and a built artifact; this task did not control the VM. |
| Independent follow-up review | Pending | The prior exact-head review identified the curated-fallback picker gap at b8631596. This source correction is committed separately and needs review at its new exact head. |

## Review boundaries

Changes are isolated on `codex/v0156-shared-provider-model-catalog-20261012`, based on PR #76 base `7d3d52bb58114296b66b7eeef290b67581b226bc`; the PR description and exact-head review identify the final source revision. No PR-72 preview-owned renderer files, primary dirty checkout, or PR-0155 worktree were modified. No sign, publish, deploy, VM, merge, or release action was performed.
