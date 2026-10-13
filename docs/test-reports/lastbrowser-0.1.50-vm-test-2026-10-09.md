# LastBrowser 0.1.50 — authorized upgrade and provider UI retest

**Current result, revision 2:** exact 0.1.50 Setup installed in place under updated order `c60e5f058dbd7a39e03d7859d9bd8a4bdcee022f`. Package integrity/version/start subchecks passed. Functional cases: **0 complete PASS, 2 FAIL, 5 BLOCKED**; documentation delivered separately. No provider completion was sent. The initial clean-snapshot blocker below is historical, superseded by the revised upgrade authorization; the initial report remains recoverable at commit `4b92cd1c`.

Revision 2 run: 2026-10-09 approximately 04:57–05:10 UTC. Dedicated synthetic Guest confirmed by this task's VM context, existing `VM-UI-046-LLM` Space, `default` profile and synthetic assistant identity. Existing bindings were preserved by an in-place installer, not copied or reconfigured. Full binding preservation is not independently proved because the pre-update UI did not expose total counts.

## Revision 2 actual receipt and results

Both canonical wrapper assets were downloaded to `C:\Users\lbr-eval\Downloads\LastBrowser-0.1.50-2eeb314`. Actual Setup 174693419 bytes / SHA-256 `cbf153422e447fb9323a7c8830207b0f01ca0ff6aecd6561d673872ebc336903`; actual Portable 174339260 bytes / `a5cc5180959bcf65d4d772530c6a7a4fc3bf96a724b2120e49b75dd6221eea31`. Each matches its order pin. Setup was rehashed immediately before `/S` execution and observed unsigned. Portable was verified before any possible Portable execution and was not launched.

Setup installer PID 7864, start receipt 05:00:14 UTC, no longer running by approximately 05:03 UTC; exit code not retained. The installer closed the prior app and unpacked the package. Installed ASAR **64125238 bytes**, SHA-256 **`eba1b54af52da4b9de69b7f2bb9b201711d8f6a4f2289a9847ee095f6c82b713`**, checked before launch and at 05:10:32 UTC. Installed executable **205065216 bytes**, SHA-256 **`78c1cc51781b917e040a71864277281d7e75c8715a5d2894248b7810a4ce774c`**. Windows registration and Settings → System both show **0.1.50**. Physical launch path is `C:\Users\lbr-eval\AppData\Local\Programs\Lastbrowser\Lastbrowser.exe`, ASAR in its adjacent `resources` directory. Native tool window metadata uses a Codex LocalCache mapping, as in the prior run; no mismatch inferred solely from this mapping.

`launch_app` initially reported no targetable window after roughly 14 seconds. Inventory then found window 1704930 with “Checking the secure session…” and a Try again button. After 15 seconds of observation, Settings appeared automatically; **no Try again, authentication, reload or repair**. Thus readiness was observed within approximately 30 seconds of launch, not precisely timed. Main process at end: PID 10756; observed children 10248, 1512, 8844, 10780. No normal full Quit/relaunch was proved.

Before update: 1 visible active synthetic Space, 1 visible Conversation profile, 1 saved provider/model choice (`ollama-cloud`, `inclusionai/ling-3.1-flash`); successful qualified pairs 0 / catalog groups 0. Total profile/account-binding count **unknown**, not zero. After update, those same visible identity/default values remained. With deliberate session-only beta opt-in, 1 Google/Antigravity account row was visible (identifier excluded), and MiMo/OpenRouter forms indicated an existing saved key without exposing it. These are existing binding/config observations, not credential validation, inference, or a before/after total-count proof.

| Case | Revision 2 status | Actual finding / incomplete subcheck |
|---|---|---|
| 1 Upgrade | BLOCKED, partial PASS | Wrapper/executable/ASAR/version/start and visible synthetic defaults PASS. Full profile/binding-count preservation and explicit normal Quit/restart remain unproved. No clean-install PASS. |
| 2 Portable | BLOCKED | Exact wrapper verified, but Setup remains running and no targetable tray Quit surface is available. No duplicate instance or forced termination; no separate Portable profile/runtime/exit result. |
| 3 GPT / model-selection UI | FAIL; inference BLOCKED | Chat shows selection status “Beta · untested” and requested default “GPT-6 Luna · OpenAI Codex · Beta · untested”. Chat model list could not load; menu contains “AUTO · Execution unavailable” and disabled saved/default entry. No catalog entries or qualification-details action there, and no deliberate beta opt-in directly on that picker path. No currently qualified raw GPT pair or free/subscription entitlement proved; zero sends. |
| 4 OpenRouter | BLOCKED, read-only subcheck PASS | Existing saved-key placeholder and enabled/free-labelled model list loaded in Configure; default display “inclusionAI: Ling 3.1 Flash (free)”. This is not proof of current entitlement, qualification or active runtime route. Cancelled; no Refresh, Save/activate or turn. |
| 5 Xiaomi MiMo | BLOCKED, read-only subcheck PASS | Form has explicit account API URL and separate API-key field; existing URL loaded and key remained undisclosed with “Leave blank to keep the saved key”. Four model names displayed: MiMo V2.5, V2.5 Pro, V2.6 Flash, V2.6 Pro. No URL/key copied to report or screenshots. Save/masked post-save readback and existing quota not tested; Cancel, no Test connection, Save/load, Save settings or turn. |
| 6 Ollama | BLOCKED | Active saved choice says Ollama Cloud, while separate “Ollama (Lokal)” Configure form exposes localhost:11434 with optional key. That separate form is not proof of the effective Cloud route. No mode switch, Save/activate, Test connection or turn. |
| 7 Antigravity | FAIL; inference BLOCKED | Existing account row present, but UI states “Antigravity catalog status could not be verified; its models are not selectable.” Conversation picker offers no verified Antigravity list. No account/login/refresh/CLI/global fallback; no turn. The UI's historical quota sentence is not evidence of a new quota request in this run. |
| 8 Report | PASS, documentation only | Revised findings and sanitized evidence delivered in tester branch; final blob/file hash in companion receipt. |

The beta opt-in was toggled once on through the normal Settings UI, with no model selected or qualification seeded. After loading, Conversation's native model menu included provider-grouped **OpenAI Codex → GPT 6 Luna · Beta · untested**, plus other beta models. This confirms visible grouping/labels, not a qualified `gpt-6-luna` raw identity or the rule's qualified-only condition. Before opt-in, the catalog was hidden behind the qualification message, and the default-model field had no picker. Qualification-details controls were not offered in the observed native menu. Opt-in was toggled back **off**, preserving the saved model/provider; no model rotation or settings Save occurred. Chat and Conversation picker outcomes are recorded separately.

Additional visible finding: Settings → System shows update state **error**, `ENOENT` for missing **`app-update.yml`**. No Check for updates button was pressed. Private path omitted. This is an observed UI diagnostic, not a provider error or a guessed root cause.

Explicit Quit remains blocked by native tool scope: `list_apps` reported File Explorer with **no targetable windows**; the API offers targeted-window control and returned no tray/desktop handle. Closing X is not normal Quit proof, so no forced taskkill or alternate exit was used. Installed Setup remains available. A human can perform explicit tray Quit and permit subsequent same-candidate restart/Portable test; no runtime/profile reset is needed.

Provider ledger remains **GPT 0, OpenRouter 0, MiMo 0, Ollama 0, Antigravity 0** completions. Configure forms performed their ordinary product model-list loading; no explicit catalog refresh, connection test or inference probe was added. Provider setup/user connection claims are not inference PASS. No untested model sent, login, key/URL edit, additional fee, model download, Teamwork, fallback or product repair. No screenshot containing an email, MiMo URL, credential, private profile path or prompt was saved. Gmail/Google login NOT_VERIFIED.

Evidence: `evidence/0.1.50-2eeb314-20261009/`, original native JPEGs. `01`/`02`: before-update synthetic defaults and qualification gate; `03`/`04`: same after update; `05`: Conversation field without picker before opt-in; `06`: beta provider list with account rows out of view; `07`: separate local Ollama form; `08`: existing OpenRouter model list; `09`/`10`: Chat status/catalog error/menu; `11`: Conversation beta model menu; `12`: opt-in restored off. No 0.1.49 screenshot is represented as 0.1.50 evidence.

Remaining action: establish a currently qualified, correctly routed existing provider/model pair and its no-additional-fee entitlement; resolve the observed Chat/Antigravity catalog gaps. Complete explicit human tray Quit to enable full restart/Portable verification. No permission to rotate models or change credentials is inferred.

## Historical revision 1 — superseded clean-snapshot gate

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
