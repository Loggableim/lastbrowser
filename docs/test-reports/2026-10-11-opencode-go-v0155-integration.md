# OpenCode Go integration acceptance — 2026-10-11

Candidate: patched development source LastBrowser 0.1.55, commit 02c036d4 on codex/opencode-go-gateway-v0155. PR: https://github.com/Loggableim/lastbrowser/pull/67 (depends on PR #65). This is source acceptance, not acceptance of a newly packaged installer. Existing installed application/package was not replaced.

## Result

PASS: Existing user-authorized OpenCode Go connection reused without new login or terminal. All 31 returned models passed connection validation. Current Console Go gateways were incorrectly rejected as unsupported_workspace_gateway; exact Go OpenAI/Anthropic paths are now accepted only for opencode-go, with strict origin/path validation retained.

PASS: Real minimal coding requests returned `5` via each transport: MiMo v2.6 Flash streamed chat completions; GPT-5.6-Luna Responses (completed); Claude Haiku 5.5 Anthropic Messages (end_turn). Stable session header and LastBrowser User-Agent supplied. No secrets included in evidence.

PASS: Actual LastBrowser standard chat, provider opencode-go / mimo-v2.6-flash, session 2d0123969472: Python print(2+3) request returned `5`, normal finish_reason=stop. After restarting the patched application, a context follow-up asking for the previous number returned `5`. Composer cleared immediately on Enter. Model label and badge updated to “Last in-app chat succeeded” following completion. See [screenshot](evidence/opencode-go-20261011/01-standard-chat-context-pass.jpg). Other untested models retain their untested state; this is no blanket catalog certification.

A first standard-chat attempt exposed a separate shared SQLite statement-cache race before any provider call: InterfaceError and incorrect key results reproduced under concurrent synthetic reads. cached_statements=0 fixes it; 16 concurrent readers each verify 200 known-key and missing-key reads. Native workers now inherit the trusted host runtime generation; the renderer refreshes its memoized model catalog when completion evidence changes.

## Automated checks

- 57 OpenCode gateway/inference/runtime/catalog/concurrent-state tests passed.
- 11 OpenCode login and cancelled-result tests passed.
- 37 goal persistence/boundary/API tests passed.
- 17 renderer evidence/qualification tests passed.
- Native process suite: 9 passed, 1 startup timeout. Isolated cancel/pause rerun: 2 passed (8 deselected). No external LLM calls in these fixture tests.
- Desktop TypeScript/Vite build passed (chunk-size warning).
- Store preflight: 39 passed, 2 warnings, 0 failures; not Store certification.
- Full frontend suite: 2160 passed, 11 failed across 238 files. Ten existing locale assertions were previously reproduced on the baseline. One plugin smoke timeout passed when rerun alone. Full suite is not green.

## Remaining limits

No new OpenCode login is required. New packaged-installer acceptance remains untested. A black renderer during development launch required Ctrl+R; startup recovery is outside this focused provider fix. Existing onboarding polling 401 / saved-Space draft errors also remain outside this acceptance. These observations are not reported as passed. No Ollama calls or extra Teamwork turns were performed.

## Sources

Official [Go documentation](https://opencode.ai/docs/go/) describes agent session headers, identification and protocol families. Official [Console inference proxy](https://github.com/anomalyco/opencode/blob/dev/packages/console/app/src/lib/inference-proxy.ts) maps Go chat completions, Responses and Messages to the Go OpenAI/Anthropic routes. Live authorized model configuration confirmed the exact gateway roots used here.
