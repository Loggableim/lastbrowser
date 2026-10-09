# LastBrowser 0.1.52 test-candidate handoff

Prepared 2026-10-09 for the next Antigravity agent. This is a handoff snapshot, not release approval.

## Exact source and checkout

- Repository: `C:\Users\logga\.codex\worktrees\lastbrowser-guest-v2-fix`
- Branch: `codex/guest-v2-fix-2eeb`
- Candidate version: `0.1.52` in both root and desktop manifests
- Commit: `2602629dae03a121642e8213c8b5a4989477fe89`
- Tree: `b1ee6dbfe0ebe729a7cd4fe4b2163b81ba1a37c9`
- Parent: `7130a5136e0bfe35a3a0538a6e50749295462824`
- Git status immediately before writing this handoff: clean (`## codex/guest-v2-fix-2eeb`).
- Git status after writing it: `?? docs/antigravity-agent-work/release-0.1.52-handoff.md` only.
- The original shared checkout `C:\projekte\lastbrowser` was not modified by this candidate work.

This commit includes the 0.1.52 UI/backend candidate from `099a5eb`, the reduced-capability scope fix from `7130a513`, the verified fixes below, and a changelog entry. No package was built for this final commit. Any package or receipt from an earlier commit is stale and must not be reused.

## Completed changes and evidence

- Chat picker changes from the candidate show provider-qualified model pairs, keep unqualified catalog rows behind explicit Beta opt-in, surface qualification/status in the picker/menu, and request `openai-codex / gpt-6-luna` as the default pair when no configured/session selection takes precedence.
- Local-AI API routes validate an explicitly supplied profile/Space scope, then fail closed without starting a Local-AI manager, worker, runtime, cache, or provider path. Antigravity stays unavailable when supported account-bound discovery is absent.
- Native `judge_retry` workers suppress ordinary `nativeModelResolution` and AUTO `auto_route` UI events. The constrained judge host rejects these regular chat events; focused retry tests now pass.
- Test fixtures that create nested file executors now use the same bundled offline Python runtime as the native worker. The prior fixtures incorrectly used system Python under `-I`, which hid user-site test dependencies.
- The two profile-isolation tests now load the canonical in-tree `run_agent.py`, avoiding the import-order-dependent compatibility alias. The Teamwork test now matches the existing four-worker execution cap while asserting all eight manually selected models remain in the eligibility pool.
- Combined focused regression set: **93 passed in 411.01s**, covering profile isolation, native chat parent/process/tool policy, file I/O, goal retry, SDK broker, session storage, tool paths, and Teamwork.
- Individual owner evidence: native file/tool suites **42 passed**; fixed broker tests **4 passed**; chat/goal/session tests **5 passed**; profile/order/autoscale focused checks **23 passed**, and the preceding independent test chain plus targets **123 passed**. `git diff --check` was clean before the final commit.
- Independent read-only source review of this exact commit/tree: **PARTIAL PASS**. No defect was found in scope handling or the `judge_retry` event guard. See the open model-catalog limitation below. Source review does not prove runtime, package, or Guest acceptance.

## Final mandatory pipeline result

Run on commit `2602629dae03a121642e8213c8b5a4989477fe89`, tree `b1ee6dbfe0ebe729a7cd4fe4b2163b81ba1a37c9`:

| Gate | Result |
| --- | --- |
| `npm test` | PASS — 215 suites, 1,966 tests |
| `npm run verify:store` | PASS — 39 PASS, 2 WARN, 0 FAIL. Warnings: screenshots remain provisional and no final package/signatures were supplied. |
| `npm --workspace apps/desktop run build` | PASS — Vite/TypeScript complete; large-chunk advisory only. |
| `python -m compileall -q services/sidekick` | PASS |
| Full `python -m pytest` | **FAIL** — 2 failed, 3,738 passed, 111 skipped, 2 warnings, 1,318.33 seconds. Exit 1. |

The Python command ran from `services/sidekick` with `PYTHONPATH` including the existing ignored offline dependency directory `C:\Users\logga\.codex\worktrees\lastbrowser-guest-v2-fix\output\python-test-deps` (contains the already available `croniter` wheel install). No network install or provider call was made.

### Remaining full-suite failures

1. `tests/test_native_chat_fixed_process.py::test_native_stop_interrupts_provider_request_before_releasing_writer` (test function at line 162; failure at line 187). The test waited 20 seconds for `server.held_started`, but the controlled provider never received the held request. Captured events included `worker_ready` and `nativeModelResolution`, then the assertion raised: `provider did not receive the held request`. This is an unresolved Native fixed-chat/stop-path behavior or fixture issue; do not classify it as baseline without a matched rerun.
2. `tests/test_native_session_storage.py::test_http_session_new_legacy_storage_survives_reload_without_ambient_mirror` (line 32). Expected the new session under `<tmp>\home\state\webui\sessions`; actual session path was under a different test temp root, `profiles\beta\sessions\06be4b88c113.json`. The assertion failed because the stored profile/ambient state did not match the test's expected owner. Focused/combined runs had passed, so this is currently a full-suite order/isolation failure; its root cause is unconfirmed.

These are the only two failures in the final complete Python run. No tests were rerun after the run completed.

## Open product/release issues

- The requested GPT-6 Luna pair is conditional. Existing configured/session choices intentionally persist. If the live OpenAI Codex model catalog is unavailable or omits `gpt-6-luna`, the offline fallback catalog does not contain Luna; the UI reports the requested pair unavailable and Beta opt-in cannot select a model absent from the catalog. Do not claim unconditional model availability or a successful GPT-6 Luna turn. Source review cites `apps/desktop/src/renderer/panels/NativeChatMain.tsx:73-81,253-258,335-348`, `apps/desktop/src/renderer/panels/ChatComponents.tsx:675-710`, and `services/sidekick/web/api/config.py:1077-1081`.
- Source review is PARTIAL for model-default behavior; live catalog/runtime validation remains open.
- Eight-locale native-quality review and third-party/runtime/model rights closure remain separate Store gates; the source manifest/license is not rights evidence.
- Canonical coordination ledger `C:\projekte\lastbrowser\output\ceo-agent-coordination.json` was not edited by this handoff writer and still needs its owner to reconcile 0.1.52 status. The right-hand follow-up file may also contain the earlier 15-failure intermediate result; update it only through the authorized coordination owner.

## Agent leases and work status

All listed subagents completed; there are no active file leases in this handoff.

| Owner | Completed lease/result |
| --- | --- |
| `/root/native_file_tool_fixes` | `test_native_file_io.py`, `test_native_chat_tool_policy.py`, `test_native_sdk_broker.py`: bind nested file fences to bundled offline Python; scoped suites passed. No production file change. |
| `/root/chat_goal_session_fixes` | `native_chat_worker.py` plus parent/process/goal/session tests: judge-retry routing events suppressed; test file fences use bundled offline Python; focused set passed. |
| `/root/autoscale_suite_order` | `test_independent_profile_isolation.py`, `test_teamwork_autoscale_manual_pool.py`: canonical source import and correct four-worker contract; focused order/autoscale checks passed. No production Teamwork change. |
| `/root/source_review_2602629` | Read-only exact-source review: PARTIAL PASS; conditional Luna catalog availability remains open. |

## Release boundaries and next action

- **Do not sign, publish, build another package, upload, or send a Guest order from this snapshot.** Full Python gate is red, and no package exists for this exact tree.
- Existing human authorization covers only a candidate-bound GitHub TEST prerelease (`latest=false`) and redacted Guest test order after the exact source is frozen, all mandatory pipeline gates pass, exact package/receipt exists, and suitable independent review is complete.
- No Stable promotion, Store submission, final production signing, new provider costs, root/host VM operation, or unattended Guest interaction is authorized. The Guest remains human-operated.
- Next: diagnose and fix only the two final-suite failures in this same release scope; first reproduce each with exact failure output and determine production bug versus test isolation. Then make a new exact source freeze and run the required pipeline once on that exact commit. If green, rebuild and independently review that exact package before any previously authorized Guest test delivery. Preserve all current fixes.

