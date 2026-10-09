# LastBrowser 0.1.50 — Guest start gate

Operator: Codex, dedicated existing Windows Guest. Poll: 2026-10-09 03:56 UTC / 2026-10-08 20:56 America/Los_Angeles. Date in filename follows the UTC order date.

New order fetched read-only: `0fad425c1bf9c9e064e4813cc9dfc088043f29d6`, `docs/test-reports/VM-0.1.50-TEST-ORDER-20261009.md`. No checkout, pull, reset or merge. Only this new order was added relative to the previously handled `bb7902f6`; the runner itself was unchanged. Source pin: `2eeb314cdf233af7bd4aa4c28b70cc3be89c53b8`. Release: [0.1.50 TEST](https://github.com/Loggableim/lastbrowser/releases/tag/test-v0.1.50-20261009-2eeb314).

## Required baseline is absent

Case 1 expressly requires: **“Setup in sauberem Guest-Snapshot installieren”**. The available Guest contains the already updated 0.1.49 application, synthetic test state and user-configured provider bindings. No separate clean Guest snapshot has been supplied or identified. Available tool metadata contains no VM snapshot-management capability; Git worktree snapshots are unrelated and do not satisfy this requirement. No existing VM or profile was reset. An in-place 0.1.50 update is not silently substituted for this order's clean-install case.

Native Windows computer-use capability and its previously read computer-use skill remain available in this conversation through `@oai/sky` and Node REPL. No UI test was attempted at this candidate gate, and no claim of missing window control is made. No screenshot is attached because the exact candidate has not been launched; old 0.1.49 screenshots are not 0.1.50 evidence.

## Pins: expectations only

| Artifact | Expected bytes | Expected SHA-256 | Guest verification |
|---|---:|---|---|
| Setup | 174693419 | `cbf153422e447fb9323a7c8830207b0f01ca0ff6aecd6561d673872ebc336903` | NOT_TESTED; not downloaded/executed |
| Portable | 174339260 | `a5cc5180959bcf65d4d772530c6a7a4fc3bf96a724b2120e49b75dd6221eea31` | NOT_TESTED; not downloaded/executed |
| 0.1.50 ASAR | 64125238 | `eba1b54af52da4b9de69b7f2bb9b201711d8f6a4f2289a9847ee095f6c82b713` | NOT_TESTED; not installed |
| Packaged executable | 205065216 | `78c1cc51781b917e040a71864277281d7e75c8715a5d2894248b7810a4ce774c` | NOT_TESTED |

Order provenance pins: `source-freeze-pin-v8.json` SHA-256 `829879daf98963811b0180b85b2a862e866e01ff4fc8eb070114654e75272d2b`; `pipeline-receipt-v7.json` SHA-256 `54aa0f9fb5bc085d0160c53270cc48ca13a2e4019a4cca550197619026ea75f1`. These are coordinator/order claims, not locally verified Guest receipts. No bundle/manifest asset pin is supplied by this new order; none is invented or borrowed from 0.1.49.

Actual currently installed ASAR was read again: 64095997 bytes, SHA-256 `856eb141180fb242580e13c37e6208fa932b7e765203f23d8b25187e26a6bf62`, corresponding to the previously verified **0.1.49**, not this candidate. No 0.1.50 behavior result is inferred from it.

## Case status

| Order case | Status | Observation / gate |
|---|---|---|
| 1 Artifact and installation | BLOCKED | Required clean Guest snapshot absent; 0.1.50 package verification, installation, readiness, normal Quit/restart not executed. |
| 2 Portable | BLOCKED | Required separately isolated candidate run/profile not established; no second instance started. |
| 3 GPT | BLOCKED | Exact 0.1.50 candidate not installed; existing account/model/entitlement not reverified for it. Zero turns. |
| 4 OpenRouter | BLOCKED | Candidate gate; no inference or account/key/model change. Zero turns. |
| 5 Xiaomi MiMo | BLOCKED | Candidate gate; no form, Save, masked readback or inference tested. Zero turns. |
| 6 Ollama | BLOCKED | Candidate gate; local/cloud endpoint and current model not newly verified. Zero turns. |
| 7 Antigravity | BLOCKED | Candidate gate; catalog/picker not observed on 0.1.50. No unavailable-catalog FAIL is assigned without runtime evidence. Zero turns; no Google login. |
| 8 Report | PASS, documentation only | Start gate and every case recorded; commit/push and finalized report hash are delivered separately. This is not Guest acceptance. |

**Functional cases: 0 PASS, 0 FAIL, 7 BLOCKED.** Provider turn ledger: GPT 0, OpenRouter 0, MiMo 0, Ollama 0, Antigravity 0. No test-generated provider costs, authentication, purchases, quota retries, fallback, Teamwork, model downloads or product repairs. User says several LLMs are connected; that is not an inference PASS. Their prior 0.1.49 failures remain historical and are not assigned to 0.1.50.

Required action: supply the clean, dedicated Guest snapshot required by the order, or explicitly revise the order to authorize an in-place 0.1.50 update of this existing configured Guest with preserved bindings. No snapshot reset or provider transfer is performed here. Verify exact wrapper, executable and installed ASAR pins before any subsequent candidate behavior test.

Only report/receipt changes are committed to `codex/lastbrowser-electron-shell`. Existing dirty product/test-launcher files remain excluded. Final report blob and file SHA-256 are in the companion receipt. Unchanged baseline blockers will not trigger repeated tests or hourly notifications.
