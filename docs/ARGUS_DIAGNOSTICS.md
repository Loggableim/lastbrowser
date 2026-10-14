# Argus: private browser diagnostics

This guide describes the existing opt-in diagnostics for isolated Lastbrowser test profiles. It does not enable remote debugging, change a browser session, or transmit diagnostic data. Use a dedicated test profile and an already-open page that is safe to inspect.

## Browser lifecycle and renderer errors

Diagnostics are off by default and stored in the app renderer's local storage. In Lastbrowser DevTools, use the Console for the app shell (not the inspected website's DevTools) and run:

```js
window.__lastbrowserDiagnostics.status()
window.__lastbrowserDiagnostics.enable()
```

Reproduce the issue, then inspect or copy the bounded, sanitized event buffer:

```js
window.__lastbrowserDiagnostics.read()
window.__lastbrowserDiagnostics.query({ afterSequence: 20, tabId: 'tab-id' })
window.__lastbrowserDiagnostics.summary()
window.__lastbrowserDiagnostics.snapshot()
window.__lastbrowserDiagnostics.export()
```

The collector records webview mount/unmount, main-frame navigation and load lifecycle, console-message severity, renderer errors, render-process exits, and selected chat stream lifecycle. It keeps at most 500 events. It deliberately excludes page URLs, title text, console contents, DOM, prompts, replies, tokens, and arbitrary error strings. `did-fail-load` records the numeric Chromium error code; console events record severity only. Events are local to the app profile and are not uploaded.

When finished, retain only the export needed for the investigation, then clear and disable collection:

```js
window.__lastbrowserDiagnostics.clear()
window.__lastbrowserDiagnostics.disable()
```

The interface and exports have `schemaVersion: 1`. The collector batches local-storage writes every 250 ms and flushes on export, disable and `pagehide`. A hard renderer crash can lose the last batch. The shell API is reinstalled when the renderer mounts. Query cursors apply to the retained buffer and reset after clear; `summary()` reports the first and last retained sequence numbers so the agent can detect truncation.

`snapshot()` is available only while diagnostics are enabled. It returns the active panel/tab ID, Quickchat and standard-chat state, viewport dimensions, focus/visibility, webview guest IDs and screen rectangles. It does not return DOM text, page content, credentials or chat transcripts. Stable tab/guest IDs and versioned data are suitable for future agent-control integrations, but this patch adds no new control or network endpoint.

Quickchat events measure the interval from toolbar activation to the next animation-frame callback after the React state commit (`quickchat-visible`, not a guarantee that pixels have reached the screen), submission to model preflight (`quickchat-preflight-complete`), backend acceptance (`quickchat-accepted`), and matching stream events (`quickchat-event`). The latter records only a known event type. Compare the timestamps of the first token/delta event and acceptance to distinguish UI, discovery and provider wait. Ordinary chat stream event records also retain a sanitized event type and streaming state.

## Network request inspection

There is no passive, per-webview request journal in the normal app logs. The request-policy hooks in Main enforce policy; they are not a diagnostic export. The Independent Browser Gateway also does not expose arbitrary CDP, target listing, cookies, or JavaScript evaluation. Do not add request logging to those policy callbacks as a debugging shortcut: it would widen the sensitive data path and compete with existing session listeners.

For a bounded network trace, use Chromium DevTools Protocol only in an isolated test run with an explicit operator opt-in. Enable the existing browser-wide CDP preference in Settings and restart, or launch the dedicated test process with `LASTBROWSER_ENABLE_CDP=1`. Check the reported status through the existing `window.lastbrowser.cdp.status()` bridge before connecting. The endpoint binds to loopback on the configured CDP port (default 9222); do not tunnel, forward, or expose it to a LAN, and disable the preference and restart as soon as capture ends. CDP grants broad browser control, so use a disposable profile and do not open personal/authenticated tabs during a trace.

Attach to the intended webview target only. Subscribe to `Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFailed`, `Page.frameNavigated`, and `Runtime.consoleAPICalled`; collect timestamps, method, resource type, status, error code, and request/frame identifiers. Avoid request/response bodies, headers, cookies, authorization values, query strings, console argument values, and full URLs. If URL correlation is essential, keep it in the local session and reduce it to origin plus a redacted path before sharing. Stop Network and Runtime domains and detach when the capture is complete. Do not use CDP against an independent-agent-owned target; its ownership and action gates belong to the Independent Browser Host.

The current `lastbrowser:cdp:execute` IPC handler is a target-discovery contract despite its name: it reports a target count and an optional matched target and does not execute a CDP method. Use the explicit loopback CDP endpoint for a manually approved diagnostic capture; do not treat that IPC operation as a protocol tunnel.

## Computer-use debugging

For ordinary user-owned tabs, use the app's existing browser surface and normal UI. For independent-agent browser work, use the authorized Independent Browser Gateway flow and its exact lease, owner, scope, navigation epoch, and permission epoch. It supports the bounded read, screenshot, navigation, click, and type actions defined by the gateway. It does not authorize raw CDP or arbitrary script execution. A manual account-setup lease grants no worker action authority. Pause, revoke, or stop through the owner flow before taking over or ending a test.

## Useful interpretation

- Repeated `did-start-loading` without a matching webview `unmount` indicates repeated loading in the same element; `unmount` followed by `mount` indicates the renderer replaced the element.
- A `did-fail-load` event with an error code can identify navigation failures. Chromium cancellation code `-3` is intentionally omitted.
- `console-message` severity alone confirms a console event but cannot identify its message. Use a temporary, isolated CDP capture when message text is essential; sanitize it before sharing.
- A rising request count without app lifecycle events needs the bounded Network trace to distinguish page scripting, extensions, service workers, and browser policy effects.
