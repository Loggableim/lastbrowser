# A-025 startup phase signal audit

Audited against release head `7d3d52bb58114296b66b7eeef290b67581b226bc`, then integrated on top of PR #50's Main-owned auth preflight contract.

| App state | Real source | Startup behavior |
| --- | --- | --- |
| Local engine | Main service status | Required for enabled or unknown auth policy; observed in the background for confirmed disabled policy. |
| Browser profile | Existing local profile/session restoration in `App.tsx` | Required; complete only after window initialization succeeds. |
| Spaces | `listSpaces()` response | Separate real pending/complete/error state; optional for browser availability. An empty list is a valid result. |
| Saved provider connections | Sidekick onboarding status request | Separate state from model discovery; optional for browser availability. |
| Available models | `GET /api/models` response | Separate state from saved connection discovery; optional for browser availability and requires a valid catalog to complete. |
| Sidekick transport | Main health/runtime readiness status | Required for enabled or unknown auth policy; observed in the background for confirmed disabled policy. |
| Session protection | Main `getAccessAuthStatus()` and existing unlock/lock handling | Required and fail-closed. A confirmed disabled preflight may release only the initial wait; authoritative auth errors and a required locked session still block. |
| Browser ready | The derived App gate | Available when the policy-specific blocking stages and auth gate pass. Optional discovery work can continue afterward. |

## Approved integration contract

The CTO approved explicit App state for Spaces, profile restoration, provider discovery, model discovery, and aggregate browser readiness. Each request stage tracks `pending`, `complete`, or `error` from its real result. Sandbox is omitted from startup UI and gating until an app setup event can establish its state.

- Only a fresh Main-confirmed `disabled` auth policy releases the initial auth wait. The renderer validates the echoed request and scope IDs. `enabled`, `unknown`, invalid or stale responses, and IPC errors remain fail-closed.
- With `disabled`, profile restoration and session protection remain blocking while unavailable Sidekick engine/transport work continues in the background.
- With `enabled` or `unknown`, engine startup, Sidekick transport, profile restoration, and session protection remain blocking.
- Spaces, onboarding/provider connections, and model catalog discovery remain separate, visible App states. Network, HTTP, and schema errors in these optional requests cannot hold the browser shell.
- The session is complete only after an authoritative successful auth response or successful unlock. Auth-check failures reset the checked state; required-password and existing lock-event paths remain fail-closed.
- Browser-ready is derived from required core signals and the existing auth check. Auth alone is insufficient, while discovery success is not required.
- Phase display uses only request and service outcomes. There is no timer-based minimum wait. Existing launch icons, quote rotation, and reduced-motion behavior stay unchanged.

## Integration boundary

PR #54 is stacked on the A-025-FIX branch so its App consumer builds against PR #50's Main/preload/type contract. Main remains the source of truth for auth policy and status semantics; this change adds App request state and consumes that policy without introducing sandbox startup claims.
