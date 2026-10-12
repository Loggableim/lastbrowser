# PR-0156 provider model catalog evidence

## Scope and provenance

The source change adds a profile and space scoped catalog contract to `modelSelection`, carrying provider source, discovery status, observation time, model listing status, and only source-backed feature values. Legacy provider groups remain available for older clients. The shared renderer mapper consumes only currently listed rows when the new contract is present and retains legacy behavior when it is absent. Provider Settings now requests the same scoped selection used by chat and Quickchat.

No user credentials were read for test setup and no provider API was queried live. API-source behavior was exercised only with controlled test fixtures. `liveTest` remains `not_run`; provider runtime, packaged binary, VM, and human UI acceptance are not claimed.

## Evidence

| Check | Result | Notes |
| --- | --- | --- |
| Focused Python regression tests | 39 passed, 1 deselected | `test_independent_scoped_models.py` and `test_openai_api_key_provider.py`; the packaged isolated-worker test is excluded because the isolated Python 3.14 environment cannot import `pydantic`. |
| Python syntax | Passed | `python -m compileall -q services/sidekick` |
| Diff whitespace | Passed | `git diff --check` |
| Desktop build | Blocked | Worktree dependencies do not provide `tsc`. |
| `npm test` | Blocked | Worktree dependencies do not provide `vitest`. |
| Store preflight | 38 passed, 2 warnings, 1 failed | The failure is the integration test invocation, which cannot find `vitest`; warnings are provisional screenshot content and no package supplied. |
| Live provider catalog/API | Not run | No credential or live API validation was authorized or required for source-level regression work. |
| Packaged/VM/runtime acceptance | Not run | Requires the designated VM owner and a built artifact. |

## Review boundaries

Changes are isolated on `codex/v0156-shared-provider-model-catalog-20261012` from base `04593080169462375cfa6209bcb70e148ad242d8`. No PR-72 preview-owned renderer files, primary dirty checkout, or PR-0155 worktree were modified. No sign, publish, deploy, VM, merge, or release action was performed.
