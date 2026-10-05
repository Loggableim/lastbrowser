# Real Electron selected-context acceptance

Root ran `node apps/desktop/tests/root-selected-context-probe.cjs` against Castlabs Electron 37.10.3 and the production compiled Main `IndependentController`. Exit 0. Durable result: `output/root-selected-context-report.json`.

The probe uses a hidden controlled shell at `app://bundle/selected-context`, actual `<webview>` guests, real Electron partitions, a loopback HTML page, DOM Range selection and a controlled API recorder. No provider call, external page, personal profile or debug port is used. It checks:

- Main captures exactly the selected words, leaving `page` empty. Unselected private text and hostile page instructions do not enter the request. Changing the DOM afterward does not change the captured request snapshot.
- Reload/navigation to the same real URL invalidates the reference before an Assistant turn or runner handshake reaches the controlled API.
- An API-authorized one-second lifetime expires on the real monotonic clock and is rejected.
- A real guest in a different persistent partition is rejected. A real guest cannot act as the trusted shell IPC sender.
- Removing the guest destroys its WebContents and prevents reuse of its captured reference.
- All owned guest WebContents are actually gone after shell shutdown; the parent verifies child Exit 0 and removes only its verified temporary directory.

Initial harness runs exposed asynchronous guest destruction and buffered stdout during app shutdown. The final harness waits for destruction, prevents automatic window-close exit and stores its report synchronously before exiting. Those were test-lifecycle defects; no product behavior was changed or weakened.

This provides actual Electron/Main capture evidence for A51, alongside the existing Main tests for cross-Space references, 128-reference bounds, 120-second maximum and immutable capture. It does not prove the complete rendered Assistant button flow, backend provenance enforcement, model behavior or the current packaged app. The Main build used the successful current Root build from this integration phase; final package verification remains separate.
