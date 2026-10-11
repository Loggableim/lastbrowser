# OpenCode browser device login — 2026-10-11

Development source: `C:\work\lastbrowser-p004`, branch `codex/p004-chat-opencode-fix`; follow-up to draft PR #61. This is development-build validation, not installer/release certification.

## Reason for change

The current signed-in OpenCode Console recommends `opencode console login` for V1 and `opencode auth login opencode` for V2. Its current Console API documents an OAuth device flow usable by other clients. The earlier LastBrowser button launched a CLI API-key prompt, which did not match this account's available login path. The user requested browser sign-in without a terminal.

Sources: https://opencode.ai/v2/docs/console/api#device-flow and https://opencode.ai/v2/docs/console/api/inference . The separate Go guide still describes copying an API key; that instruction conflicts with the observed current console.

## Implementation

- Settings starts a profile-bound device flow and opens the official verification URL in a sandboxed LastBrowser Connect browser window. No CLI or terminal is spawned. The Settings panel remains mounted to poll status; reopening the browser is supported.
- Only the official HTTPS host/path, matching public user code and optional single `client_id=lastbrowser` are accepted. Tokens and private device codes never reach the renderer.
- Profile switching, expiration, cancellation acknowledgements and cancellation/network races are covered. Existing provider keys are preserved.
- Access/refresh tokens remain in the selected local backend profile. Refresh is serialized across threads and processes; uncertain single-use refresh outcomes require renewed login instead of replaying a consumed refresh token.
- Models, endpoint and protocol come from authenticated workspace configuration. OpenAI Chat Completions/Responses and Anthropic Messages are supported. Gemini routes are currently excluded. Requests identify LastBrowser and carry a stable conversation session header, including auxiliary requests and async SDK conversion.
- Real bundled SDK construction exposed and fixed Anthropic timeout-type incompatibility and a duplicate `/v1` path risk. Prepared Anthropic URL was checked without making a model request.

## Validation

- Actual device-code endpoint preflight: HTTP 200, expiry 600 seconds, polling interval 5 seconds. Only response field names and URL structure were inspected; credentials/codes were not published.
- First live Settings attempt failed with `invalid_verification_url`: real service adds `client_id=lastbrowser` to the verification URL. Added focused backend/renderer regression cases and corrected the allowlist.
- Full desktop run: 233 files, 230 passed / 3 failed; 2145 tests, 2135 passed / 10 failed. All ten failures match previously reproduced base-commit locale assertions in independent-assistant, independent-message-control and setup-state. This suite is not claimed green. Later device URL cases were covered by focused runs.
- Renderer device-flow focused tests: 25 passed. Auth-window checks: 9 passed.
- Backend device/inference combined run: 34 passed; subsequent latest device suite: 24 passed. Runtime/inference run: 23 passed, including real SDK construction/header checks without inference traffic. Counts overlap and must not be summed.
- Store preflight: 39 passed, 2 warnings, 0 failures. No signed package supplied to this source test.
- Python compileall passed. Final desktop rebuild after the URL fix passed (Vite 9.37 seconds).

## Final live handoff and publication

Pushed source commit `1c8ea6dccd16955cc58f2051917ecb60f27b36c9` to existing draft [PR #61](https://github.com/Loggableim/lastbrowser/pull/61). Frontend, Main bridge, backend and tests are in one atomic feature commit.

Final live Settings > OpenCode Go click returned HTTP 200 and opened the official OpenCode Console sign-in page inside a LastBrowser Connect browser window. Settings status polling returned HTTP 200. No CLI/terminal was launched. The visible login choices were Google, GitHub and email; human sign-in is the remaining gate. Only the ordinary Settings button was automated, not any authentication dialog.

Evidence: [Settings button](evidence/opencode-browser-20261011/01-browser-login-settings.png), [embedded sign-in handoff](evidence/opencode-browser-20261011/02-embedded-signin-handoff.png). Both screenshots were checked for visible credentials/device codes before publication.

One intermediate application restart showed a blank surface; Ctrl+R restored it. A subsequent final-build restart rendered normally. This intermittent startup observation is not treated as a renderer-recovery pass or attributed to the OAuth change.

## Pending live gate

Successful user browser approval, authenticated workspace catalog retrieval and real OpenCode chat are not yet claimed. No automated authentication-dialog interaction or model call was performed in these checks.

No credentials, auth/config files, databases, private device codes or raw provider logs are included in this report.
