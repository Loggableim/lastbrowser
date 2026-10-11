# P004 0.1.55 chat repairs: validation

Status: validation in progress; not a signed-installer release sign-off.

Candidate identity and original failures are recorded in `2026-10-11-P004-0155-progress.md` (report commit `82f44f0e`). The original installed 0.1.55 candidate failed profile alias resolution and reported a chat-start timeout after backend acceptance. The user had connected the providers; configuration alone did not establish working chats.

## Repair scope

Source checkout: `C:\work\lastbrowser-p004`, branch `codex/p004-chat-opencode-fix`, base `68c2cddf4a0f787f6adc858d181a3e0c8898c867`. Tests below use the development Electron build and existing user provider setup, not a newly signed installer.

- Runtime Home aliases use filesystem identity; a different store remains rejected.
- Read-only settings no longer monopolize the chat mutation lock during catalog probes. Fixed-model settings avoid unnecessary AUTO discovery.
- Standard and Quickchat composers clear before asynchronous start, prevent duplicate sends, and preserve newer drafts. Unknown start outcomes are not converted into resendable duplicates.
- Plain replies show neither internal Refresh IDs nor unsolicited Working chat browser metadata. Current-turn browser tools retain actual browser controls.
- Provider message-role repair operates on a deep copy, avoiding workspace-context leakage and duplicate persisted user messages after Stop/recovery.
- Quickchat follow-up preflight gate is released after start. Early Stop targets the pending new stream without resetting chat history.
- OpenCode CLI discovery supports the standard Windows npm native executable when Electron's PATH is stale.

## Live checks

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Standard MiMo first reply | Passed | `MIMO READY`; Enter snapshot at 501 ms showed empty composer |
| Standard MiMo follow-up/context/formatting | Passed | Remembered `amber`; two-item list and fenced Python code displayed |
| Standard OpenAI Codex GPT-5.6 Luna model switch | Passed | Follow-up remembered `amber` after switching provider/model |
| Plain-response unwanted metadata | Passed | No Refresh/internal-ID or Working chat browser block during normal response |
| Standard Stop and recovery | Passed on latest repair | Fresh session `024ddcda151e`: stopped turn, then `CLEAN RECOVERY`; persisted 2 user + 1 assistant messages, no workspace-context or combined duplicate blocks |
| Restart persistence | Passed | Existing repaired standard session and model restored |
| Quickchat MiMo first + follow-up | Passed | `QC READY`, then remembered `teal`; both starts accepted, composer empty during response |
| Quickchat GPT-5.6 Luna first reply | Passed | `QC READY` |
| Quickchat early Stop | Failed before latest fix; retest pending | Response continued and cleanup alert appeared. Latest source fix has focused regression checks; no live pass claimed yet |
| Ollama cloud free | Blocked | Existing HTTP 403; no repeated paid/model request |
| OpenCode inference | Blocked pending human login | CLI discovery tests passed; login handoff still pending |
| Actual browser tool preview/takeover | Not live verified | Plain-response suppression tested; tool gating has automated coverage |

Earlier synthetic session `7c1898a2cdd4` retains the pre-fix duplicate/workspace-context defect as evidence. Historical user sessions were not rewritten.

## Automated checks

Full desktop suite: 232 files, 224 passed / 8 failed; 2119 tests, 2104 passed / 15 failed, 190.50 s. Ten locale-dependent failures reproduce on exact base `68c2cddf`; see `evidence/p004-0155-20261011/05-baseline-triage.md`. Five additional assertions expected the old literal source spelling of the send callback. They were updated while preserving captured-scope/model and guarded-transport checks; the subsequent focused run passed 82 tests across six files. The complete suite was not rerun after this test-only maintenance, and is not claimed green.

Navigation smoke, address-autocomplete DOM and Windows package-signature tests passed in the serialized full run; the earlier timeouts did not reproduce. Final desktop build and Python compileall passed. Store preflight: 39 passed, 2 warnings, 0 failures. Quickchat draft/early-Stop focused checks: 17 passed, including a structural App wiring check; actual latest early-Stop cancellation still requires live confirmation.

## Publication and OpenCode handoff

Chat repair commit `195a622f` was pushed and published as draft [PR #61](https://github.com/Loggableim/lastbrowser/pull/61), targeting `codex/v0155-integration-20261011`. Slack update: https://lastbrowser.slack.com/archives/C0C81VB6AEP/p1791732848959959 . Draft status reflects the remaining live Stop and OpenCode gates, not a release sign-off.

During OpenCode handoff, the live Settings provider list omitted both OpenCode entries, making its existing CLI-login controls unreachable. The authoritative onboarding catalog has now been repaired to expose Zen and Go in pushed commit `e0c2c0ee`, included in PR #61; ten focused backend tests, one renderer catalog test and final build passed. The official native OpenCode Zen login was launched directly with the same profile-isolated XDG data location while this UI repair was being published. The user must enter credentials themselves; no successful authentication or inference is claimed yet. No login-dialog automation was performed.

No credentials, auth files, provider configuration or databases are included. Only synthetic test evidence is retained under `evidence/p004-0155-20261011/`.
