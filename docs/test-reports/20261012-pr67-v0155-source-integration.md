# Chat source integration (v0.1.55)

Date: 2026-10-12. Integration branch: `codex/pr67-v0155-integration-20261012`.
Base: `4c6f11eb5772da7a0de545ef75750db970f58ba8` (`codex/p004-v0155-diagnosis-20261012`).
Source PR heads: #65 `e3784ff029b037f87cc1c39af0ea88543a0726a5`; #67 `02c036d471607581c9a60fe6efc177bbb8e83fb0`.
Additional source PR heads: #68 `927095f46479cf1de8fac2f26872fe96826ec8dc`; #71 `bfc39d88c64550aaa375098fbbbed83393541435`.
The independent [PR #67 source review](https://github.com/Loggableim/lastbrowser/pull/67#issuecomment-6117313450) found no additional blocker in its exact diff; it explicitly withheld integration approval because the PR #65 base still contained the two cancellation races addressed below.

The source commits were applied onto the diagnosis head without merging their older base `cc70e00d25307111679bc8624edf89e33788cfd7`. This preserves the later startup traces, scoped native catalog, and diagnosis report. Both PRs' frontend and backend changes, plus the cancellation follow-up, are committed together in this integration branch.

## Reviewed changes

- Completion evidence now retains the backend runtime and provider configuration generations. The native worker inherits its owner's runtime generation, and the Standard Chat model list reacts to a completed qualification.
- OpenCode Go accepts only the specified HTTPS `opencode.ai` Go gateway paths for its corresponding OpenAI or Anthropic mode. Existing credential, organization header, model, and package checks remain in place.
- SQLite statement caching is disabled for the shared state connection. The new concurrent metadata-read regression passed.
- PR #65's late-result guard was insufficient: a provider exception could enter self-heal/error persistence after Stop, and Stop could race the result between the early guard and the session lock. The integration checks cancellation before exception retry and rechecks cancellation plus stream ownership under the session lock before success, self-heal, and error writes. Final recovery skips cancelled streams. A deterministic test exercises cancellation while result persistence waits for that lock.
- The independent [PR #70 review](https://github.com/Loggableim/lastbrowser/pull/70) identified another P1 path: a normal but empty auth result could start self-heal while Stop waited for the session lock. The follow-up rechecks Stop and stream ownership before and after credential refresh, before retrying the provider, after retry, and before terminal writes. A test makes Stop fire during the credential refresh on both normal-return and raised-error paths.
- The follow-up review also caught a regression in the new final save guard: normal completion clears `active_stream_id` before saving. The ownership check now runs before that clear, and the final save guard checks Stop without rejecting a successfully completed turn. A regression test covers both normal completion and Stop at that point.
- PR #68's scoped model discovery loads on entering Standard Chat, distinguishes loading/error/empty qualification, and serializes optimistic model changes before Send. PR #71 shows the submitted message before asynchronous model preflight while the submission gate prevents a duplicate send. Both commits were cherry-picked as deltas onto this branch, preserving PR #70's cancellation tests and runtime qualification refresh. Independent source reviews found no additional blocker in [PR #68](https://github.com/Loggableim/lastbrowser/pull/68) or [PR #71](https://github.com/Loggableim/lastbrowser/pull/71).
- The combined renderer smoke passed on Windows with an explicit local Electron executable path. The shared installed Electron package's `path.txt` currently points to a macOS binary, so the smoke runner now accepts `LASTBROWSER_TEST_ELECTRON_PATH` for an exact executable override. No package file was changed.

## Source verification

| Gate | Result |
| --- | --- |
| `npm test` | PASS: 241 test files, 2,178 tests; explicit Windows Electron path for renderer smoke |
| `npm run verify:store` | PASS: 39 checks, 2 warnings, 0 failures |
| `npm --workspace apps/desktop run build` | PASS: TypeScript and Vite |
| `python -m compileall -q services/sidekick` | PASS |
| Targeted Python cancellation, OpenCode, and concurrent metadata tests | PASS: 39 tests; `PYTHONPATH=services/sidekick` for subprocess import resolution |
| Combined ChatUX renderer, send feedback, and provider evidence tests | PASS: 3 files, 11 tests with explicit Windows Electron path |
| `git diff --check` | PASS |

The broad `test_native_chat_process.py` run was not claimed green. The host default Python 3.14 lacks the private worker's `pydantic` dependency; its import check failed. A separate import-time provider-cache test also failed under this host's isolated Python. These are test-environment findings; the affected behavior still needs package/runtime verification.

## Acceptance boundary

This is source and build evidence only. No signed package, installed executable, VM run, personal OpenCode authorization, live OpenCode Go request, Store acceptance, or public release is proven by this report. PR #66 is analysis only and PR #69 (0.1.56) is outside this integration. The existing VM owner remains the sole VM operator.
