# A-025 startup phase signal audit

Audited against the freshly verified release head `7d3d52bb58114296b66b7eeef290b67581b226bc`. A minimal hidden BrowserWindow probe used the lockfile Electron runtime; no full LastBrowser package or live app startup has been exercised.

| Display phase | Existing producer and consumer evidence | Status before integration |
| --- | --- | --- |
| Local engine starts | Main calls `services.start()` at `apps/desktop/src/main/main.ts:1408`. `services.ts:603` sets `sidekick: 'starting'`; `:667` marks the process ready. Main serves status through `main.ts:583-586`; Renderer polls at `App.tsx:1850-1862`. | Real state exists; can show only while status says starting/checking. A terminal start error needs an explicit error mapping. |
| Browser profile loads | Renderer initializes profiles synchronously from local storage at `App.tsx:1002-1004`. `App.tsx:2560-2644` then obtains startup state and restores session tabs; startup profile state completes only after that restore succeeds. | Tracked as pending/complete/error; retry reruns the guarded initialization. |
| Spaces prepare | `App.tsx` calls `listSpaces()` from `refreshSpaces()` after `sidekickApiReady`. | Startup tracks first current request as pending, complete on a valid result (including an empty list), and error on failure; explicit retry resets the result. |
| Saved model connections load | Sidekick's onboarding status reads saved provider/model configuration at `services/sidekick/web/api/onboarding.py:705-747`; `get_onboarding_status()` assembles it at `:888+`. `web_server.py:7981-7989` exposes the status route. Renderer calls it after auth is verified. | Startup records the real request outcome; it does not infer success from a failed request or a credential-presence guess. |
| Available models are checked | Renderer already uses `GET /api/models` at `panels/NativeChatMain.tsx:220-224` to fetch the current live catalog. Startup calls that same read-only route after onboarding status succeeds. | Separate request start/completion/error drives the model phase; require an object catalog response before marking complete. |
| Sidekick connection is made | Main health loop publishes `webuiHealth: 'ready'` at `services.ts:720-727`; `runtime-readiness.ts:9-15` checks process + health + URL. Renderer derives `sidekickTransportReady` at `App.tsx:1397-1398`. | Real state exists. The phase must not be marked complete from process start alone. |
| Session protection is checked | Main exposes `getAccessAuthStatus` at `main.ts:817`. Renderer starts the check only after transport readiness at `App.tsx:1422-1450`; the global shell gate is at `:4784-4817`. | Real fail-closed check exists. A required password is still locked; only checked and authenticated/disabled may proceed. Coordinate exact consumption with the separate A-025-FIX branch. |
| Isolated sandbox is set up | `window-chrome.ts:25-32` configures `BrowserWindow.webPreferences.sandbox = true`. Electron exposes the actual renderer runtime property as `process.sandboxed`; the preload runs in the renderer and can include that observed boolean in the existing `getStartupState` response. | A minimal hidden BrowserWindow probe with lockfile Electron `37.10.3+wvcus` / Chromium `138.0.7204.251` and matching sandbox/context-isolation settings returned `sandboxed: true` and `contextIsolated: true`. This confirms the runtime signal itself; app bridge wiring and full startup display remain pending. Only the observed `true` may complete this phase. |
| Browser is ready | `StartupReadinessSignals` in `startup-screen-state.ts` combines real service, preload sandbox, profile, session, Spaces, provider, and model states. `App.tsx` derives its startup phase from those signals and keeps the shell hidden until phase `ready` and the existing access-auth gate both pass. | Aggregate readiness is now explicit and fail-closed; no ready label is shown while any signal is pending or failed. |

## Approved integration contract

The CTO authorized explicit App state for Spaces, profile restoration, provider/model discovery, and aggregate readiness. The startup contract represents each state as `pending`, `complete`, or `error`; an actual failed stage takes precedence, otherwise the first pending stage is shown, and `ready` is returned only when every required stage is complete. A verified-but-locked session remains on the session phase.

- Profile restoration is complete only when `windowStartupReady` is set after existing initialization succeeds.
- Initial Spaces loading is complete only after a current `listSpaces()` response (an empty list is valid); a failed initial request remains an error until explicit retry.
- Saved provider configuration and model discovery are separate real checks: onboarding status confirms the saved connection state, then `GET /api/models` performs model-catalog discovery. The connection stage completes only after a valid onboarding result, and the model stage completes only after a valid catalog response.
- Engine and Sidekick readiness remain based on actual Main service status and the `canCallSidekickApi` contract.
- Session is complete only after a verified auth response confirms that no password is required or after successful unlock. Auth-check errors and required-password states remain fail-closed.
- Phase order follows current dependencies: engine, verified sandbox preload, restored profile, Sidekick transport, session, Spaces, provider/model checks. In particular, Spaces and onboarding requests wait until the auth session is verified, so a locked browser can reach the password screen instead of waiting on authenticated APIs.
- Browser-ready is derived from the complete signal set; auth alone is insufficient.
- The actual preload `process.sandboxed` value is the intended setup signal; it must be observed in the locked Electron runtime before treating the sandbox phase as accepted. The static `sandbox: true` option alone does not complete the phase.

## Integration boundaries

1. A-025-FIX owns the current Main, service, preload, global-type, and initial auth-gate hunks. Startup UI adds only the launch icon and its namespaced phase fields after those hunks are complete.
2. App phase/request-state instrumentation stays in separate sections; the App UI gate uses A-025-FIX's final auth consumer after auth coordination. A-008d owns its unrelated mute sections.
3. No new sandbox semantics or timer-based progress may be introduced. Add only the observed preload property to the existing startup response; verify it with the locked Electron runtime. If the exact runtime probe fails, keep the phase blocked and report that acceptance gap while finishing the other phases.
