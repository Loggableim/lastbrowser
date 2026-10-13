# A-033 standard chat follow-up — 2026-10-11

User correction: standard chat only. Earlier Quickchat evidence in the interim report does not establish standard-chat results. Same isolated PR51-based source candidate, existing VM provider connections, no new credentials or account changes. Installed 0.1.54 remains unchanged; the development source reports 0.1.53.

## Live results

| Check | Result | Evidence / limitation |
|---|---|---|
| Standard chat initial admission | FAIL before fix; PASS after fix | Empty backend profile hint caused `Invalid backend profile for chat binding`. Omitting an unresolved optional hint fixes admission without relaxing binding validation. |
| MiMo V2.6 Flash first reply | PASS | Real answer `MI MO READY`. |
| MiMo contextual follow-up | FAIL end-to-end | UI reports `route handler did not start a response in time`; backend later saves the correct answer `teal`, visible after source restart. |
| Ollama Cloud GPT-OSS 20B | BLOCKED externally; UI FAIL | Actual saved provider/model is `ollama-cloud` / `gpt-oss:20b`; provider returns HTTP403. No successful answer. The provider error subsequently disappears from the UI. The earlier Deepseek billing denial must not be assumed to explain this 20B response. |
| Bound GPT account model catalog | PASS after additional fix | Previously only disabled fallback entries; now actual account models, including selectable GPT6Luna, with exact live context metadata. |
| GPT6Luna standard reply | FAIL end-to-end; inference confirmed | Picker and status explicitly bind `openai-codex` / `gpt-6-luna`. UI reports start timeout, but read-only allowlisted inspection of this synthetic test session confirms provider/model and saved assistant reply `LUNA READY`. No other provider is credited for this answer. |
| Standard Stop, queued sends, graceful restart | NOT TESTED | Earlier Quickchat tests and forced process restarts are not substitutes. |

The user connected the models before testing. Their existing connections still encounter the failures above. MiMo and GPT inference work in this candidate, but their standard-chat UI flow is not reliably successful. Ollama 20B is not passed.

## Additional narrow changes and verification

- `guarded-native-chat-start.ts`: omit an empty optional backend profile hint. Regression reproduced 1 failure / 4 passes before the change, then 5/5 pass.
- `chat-live-stream.ts`: finalized pending placeholders become empty instead of retaining `Working on it...`; existing completion expectations corrected. Standard Stop live verification remains pending.
- `cli/codex_models.py`, `web/api/config.py`: retain exact live Codex `context_window` metadata in public model entries; cache schema 6 invalidates older ID-only model catalogs. Unknown context remains blocked; no guessed limits or weakened scope gates.
- `cli/models.py`: Codex discovery uses the same existing profile-bound runtime credential resolver as inference, including the user's connected pool. No credential copying. This restores the bound live GPT catalog.
- `native_sdk_broker.py`, `capabilities.py`: reuse one capabilities-inclusive discovery snapshot during fixed-provider capture, preserving the existing evidence-digest freshness check. Regression verifies no second probe and stale evidence rejection. This reduces duplicate discovery but **does not resolve the observed start timeout**.

Focused desktop tests: 67/67 pass across five files (guarded chat start, chat completion, native ownership, A027 model selection, provider model selection). Targeted backend stdlib unittest: 10/10 pass. Python compileall and git diff --check pass. Latest live renderer asset SHA256: `9d19218cd804f9f62a586ab43cba56123eefcddde28b49ec71ed09c7213e41a7d`.

Full-suite status remains as documented in the interim report: baseline locale failures are unresolved, full pytest is blocked by missing pytest in the approved environment. No tooling workaround installed. Full checks are **not green**.

## Remaining failures and evidence

The GPT start route took 21.360 seconds: session lock wait 12.328s, pending-state save 1.078s, stream registration 6.953s. The bridge stops waiting for headers at 20s while the handler continues and successfully starts inference. MiMo follow-up reproduced the same mismatch at 20.813s. This is a late successful operation presented as failure, with possible duplicate resubmission risk. The timeout was not blindly increased and no second GPT prompt was sent.

The UI also shows internal `Refresh · <stream id>` controls in the conversation. Treat this as a separate presentation finding, not a provider failure.

- [GPT timeout screenshot](evidence/a033-pr51-20261011/06-standard-gpt-luna-timeout.jpg): inspected synthetic test content, no credentials/auth forms.
- [Updated incremental source patch against PR51](evidence/a033-pr51-20261011/a033-standardchat-incremental-after-pr51.patch): includes the current experimental changes and regression tests; source remains local/uncommitted, not merge-ready.
- No raw application logs or session files published. Saved-answer verification outputs only provider/model and exact synthetic-answer booleans.

PR gate is unmet: all three provider flows and full checks are not successful. No implementation PR, merge, release, or signing performed. Required external actions: supply pytest in the approved environment and clarify/fix the Ollama 20B HTTP403 connection. Application work still needed: reliable start acknowledgement/recovery and persistent, scope-bound provider error display.
