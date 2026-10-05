# Fix Agent 2: Local AI setup and first-run model download

## Renderer work completed

- The Local AI pane defaults to Simple and persists Simple/Advanced mode by resolved Space scope. Opening it reads scoped catalog/setup state, then scans and recommends for an undecided Space. Simple mode retries the recommendation with the resolved automatic preset so the displayed preset matches the recommendation request. The scan has a 20-second renderer guard; retry remains visible after a scan error or timeout.
- Simple mode avoids exposing detailed hardware/runtime controls. Exact plans/licenses remain reviewable, and the existing per-Space explicit consent path remains separate from the installation-wide bootstrap download.
- The provider/model catalog merges normal and extra models, deduplicates entries, preserves provider IDs and reasoning levels, and disables providers reported unavailable. Manual search/selection sends provider-qualified model IDs through the existing scoped selection action; the compact AUTO selector remains.
- Sidebar tab category navigation has its own scoped hover-edge horizontal-scroll hook. It scrolls only at an overflowing edge, respects reduced motion, and stops on pointer exit/window blur.
- Renderer contract and UI are wired to FIX1's installation-wide `localAiBootstrap` DTO: `status | start | retry | cancel`, including `cancelling`, no server `skipped` state, and `attempt`. Skip only dismisses this renderer panel; cancel targets the active job. The component presents progress, verification, retry, cancellation, license, commercial threshold, and the fact that inference is unavailable.

## Local AI setup flow update (2026-10-05)

- The visible setup now follows three steps: **Check your PC → Choose a recommendation → Set up local AI**. The scan starts automatically and has an always-available retry button. Its shell-only `localAiHardwareInventory` request has an empty payload and deliberately omits both Space scope and backend profile, so it runs even while Sidekick is not ready. The decoded inventory displays CPU, OS/architecture, available RAM, free disk, detected adapters and their unknown/measured budgets; it does not claim inference readiness.
- The existing recommendation and setup requests remain scoped and service-gated. If the local assistant is not ready, the UI says that the hardware check still works but model recommendations need the local assistant; it offers the existing provider path. A local setup choice is actionable only when the selected catalog artifacts have a fresh scoped scan, complete manifests, supported status, and verified allocation/download readiness. Legal files are still shown for review and explicit consent is still required before download.
- Simple mode stays the default and the per-Space Advanced choice remains persisted. Advanced model/preset selection and resource limits are behind focused disclosure sections. Recommendation cards show a user-facing preset/model role and actual download size when provided; unknown sizes and GPU memory remain explicitly unknown. Scan diagnostics are opt-in.
- The installation-wide optional router is now a compact status row inside step 3 rather than a separate setup card. Its license and commercial-use notice remain accessible, and the row retains explicit start/retry/cancel/dismiss controls. It does not imply that a verified router file enables inference.
- Added `tests/local-ai-setup-click-fixture.tsx` and `tests/local-ai-setup-click-smoke.cjs`, a controlled Electron DOM click test for successful inventory while `ready={false}`, a concrete scan failure, and successful retry. The smoke only mocks the typed Main envelope and writes its bundle to a bounded temporary directory.

## Bootstrap contract and evidence boundary

FIX1's agreed allowlisted artifact is `LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0`, at immutable revision `b27f8147d98080b0d6f063ff41de6e381ea9a530`, SHA-256 `e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292`. The GGUF is 149,081,056 bytes; the retained license notice is 10,574 bytes; API total is 149,091,630 bytes. License is LFM Open License v1.0, with the USD 10 million annual revenue threshold. [Pinned license](https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/b27f8147d98080b0d6f063ff41de6e381ea9a530/LICENSE).

FIX1 owns the Main/backend route, install-wide persistence, startup retry policy, and download verification. This renderer work does not prove those changes are integrated or that a download succeeds. No real model file was downloaded or hashed in this task. `executionUnavailable: true`; verified files do not make inference or agentic capabilities available.

## Verification

- `npm run typecheck:renderer`: passed after the renderer contract/component changes.
- Focused Vitest: `tests/local-ai-renderer.test.ts`, `tests/sidebar-drawer-edge-scroll.test.ts`, and `tests/provider-model-selection.test.ts`: 3 files, 29 tests passed.
- `node apps/desktop/tests/independent-renderer-smoke.cjs --model-picker-only`: passed with mounted Electron/React components and real picker/reasoning/focus interactions using a deterministic test bridge. No full Main/Python/model E2E is claimed.
- A broader prior renderer smoke reached `native-model-picker:passed`, then failed at `Actual absent Goal revision was not loaded` in parallel Goal-test changes. The targeted mode isolates the model-picker verification and now passes.
- Full application build, Store preflight, packaged/offline startup, Main/backend bootstrap integration, and real model download were not run here.

## Latest Local AI scan-flow verification

- `npm --workspace apps/desktop run typecheck:renderer`: passed after the UX changes.
- `node apps/desktop/tests/local-ai-setup-click-smoke.cjs`: passed with elevated local process permission. It mounted the real `LocalAiSetupPane` in Electron, confirmed the unscoped inventory call with `ready={false}`, clicked the retry path after a controlled error, and confirmed the decoded response cleared the error. This is a renderer/Main-envelope contract smoke, not a production hardware reprobe.
- `node apps/desktop/tests/independent-renderer-smoke.cjs --local-ai-only`: passed in installed Castlabs Electron. It verifies the scope-free inventory, a Space-bound recommendation showing model role and exact test fixture size, a separately disabled unsupported model, and that selecting a model does not plan or download before the separate review action. All provider/model capability values in this smoke are controlled fixture responses, not product readiness evidence.
- The unfiltered `independent-renderer-smoke.cjs` still stops earlier in its unrelated Native Goal section (`Actual absent Goal revision was not loaded`) before reaching Local AI. This matches the prior documented parallel Goal-test failure; the targeted Local AI mode isolates the changed flow.
- No application build, commit, push, model download, profile mutation, or real inference was performed in this phase. FIX1's separate Main hardware probe provides the current physical-device evidence in `docs/fix-agent-1-hardware-scan.md`.
