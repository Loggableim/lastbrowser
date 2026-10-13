# Standard chat live debugging — 2026-10-11

Installed candidate: LastBrowser 0.1.55, 151df72cc1d8e2c21f3ffcf1d4f422f3d714a58a. Previously verified installer SHA-256: 7365bb859cd63074eec6298dfebc24bb6e85cc2e5e8da49c20be71bcb4e59b1e; ASAR: f515411f8034f270b91a17d9303cdf611481f4a1253e89d29659e708e9593f3a.

## Passed on installed candidate

- Standard chat MiMo v2.6 Flash: requested READY; visible READY and normal backend stop. Session 2d0123969472. Provider xiaomi, 4784 input / 8 output tokens, API latency 29.7s.
- Same chat switched to GPT-5.6-Luna: asked for the previous exact word; visible READY and normal backend stop. Provider openai-codex, 4135 input / 5 output tokens, API latency 32.5s. Context survived the provider switch.
- Screenshot: evidence/chat-live-debug-20261011/01-mimo-gpt-context-pass.jpg.

## Correction and confirmed defects

The previous MiMo request in session c93d61f5d81f was interrupted, according to backend stream_interrupt_abort and interrupted_during_api_call. Its No response message does not establish a provider outage. Stop nevertheless persisted misleading provider-error output: late completion must not overwrite cancellation.

Renderer completion handling discarded runtime_generation and provider_config_generation. Consequently a successful chat could not satisfy the identity-bound qualification check, leaving Beta displayed.

Fix commit e3784ff0, pushed in codex/chat-provider-live-debug-20261012; PR https://github.com/Loggableim/lastbrowser/pull/65 against codex/p004-v0155-diagnosis-20261012. Product changes are in that separate branch, not this tester branch.

## Fix validation

Desktop build passed. Store preflight: 39 passed, 2 warnings, 0 failures. Python compileall passed. Provider-evidence and verification tests: 16 passed. Cancellation regression tests: 2 passed. Four previously timed-out test files rerun serially: 58 passed. Full suite serial rerun pending at report creation; earlier full run had locale assertion failures reproduced on the baseline and concurrency timeouts. This is not an all-green suite claim.

## Blocked / remaining

- OpenCode Go live inference awaits the user's personal Authorize click in the Console window. No automated authorization and no successful OpenCode chat claimed.
- These fixes have not yet been exercised in a newly packaged desktop candidate; source tests do not replace that acceptance.
- Initial black renderer required reload on installed candidate; remains unresolved.
- User requested MiMo, GPT and OpenCode leave beta after completed testing. No blanket release promotion is claimed; OpenCode and patched live UI acceptance remain pending.
- Ollama Cloud excluded at user's request. No additional paid provider requests performed.

Slack correction posted in the existing assignment thread. No credentials or authentication screenshots included.
