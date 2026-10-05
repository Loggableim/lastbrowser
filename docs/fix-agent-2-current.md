# Fix Agent 2: native chat feature-runtime probe

## Scope

Workspace: `C:\projekte\lastbrowser`. This task owns this handoff and `scripts/probe-chat-feature-runtime.cjs` only; product source was not edited. The probe reuses the existing full-app entry unchanged and captures metadata only from its isolated temporary userData before cleanup. It does not copy prompts, responses, credentials or user profile data.

## Runtime result

Ran `node scripts/probe-chat-feature-runtime.cjs output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2` once in the sandbox and once more with the authorized process-launch escalation after the first `spawn EPERM`. The second run completed successfully in the real Electron Main/Renderer + packaged Sidekick path. The preview was unsigned and unpublished. Three shell reloads completed; zero native terminal diagnostics were reported.

The normal native chat persisted through reload with session `8448a1e2192e`, stream/turn ID `adbaccad48314606b50f6403917463f3`, and scope `(backendProfileId 1542b8e47b28439d94bc089f4f0a1ae8, spaceId 334586f6a0e54a4da279ded6dafb8fee, browserProfileId default)`. Before isolated userData cleanup, its saved assistant turn had content and successful provider evidence matching that stream ID: provider `custom:full-app`, model `full-app-model`. This establishes persistence for the controlled fixed-provider run only; it does **not** establish AUTO provider-selection evidence persistence.

The existing delegated browser scenario also observed a saved original answer and reload survival for run `63545dcbabe640e9b9b21393d198c094`, target session `94513a78752a42fc915a4c6f6af813bc`, and a different space (`42dc7c583e3143ff86c8094119d0aaf5`). Its exported result does not include the complete backend event sequence (`subagentEventsObserved: null`).

Persistent goals were not created or inspected by this probe. Treat this as `not_exercised`, not a product failure. No real profile/account, external provider, signed or published app was used. The tested preview is historical relative to current Renderer/Main sources; its source hashes are in the report. Do not treat this run as validation of later source changes.

## Reports

- Metadata-only feature report: `output/chat-feature-runtime-390e616f-c915-4af1-8884-1ba028d418d9.json`
- Underlying full-app run: `output/full-app-entry-b60be2d0-3076-4e76-a259-4acfc99aa329.json`

The first sandboxed attempt failed before Electron launch (`spawn EPERM`), so it did not start a renderer or backend turn. The authorized, exact retry above supplied the runtime evidence. No more builds, broad suites, commits or pushes were part of this task.

## Follow-up against the fresh preview

Coordinator supplied `output/feature-preview-2026-10-04T19-23-57-326Z-679964ac` with expected ASAR SHA-256 `745bfb70d714e418b69591ca9e7973b9d44712f0db368505d466042de38531d8`. The first sandboxed attempt failed before Electron launch (`spawn EPERM`): `output/full-app-entry-72d97ff2-6abc-464e-9b1f-c8e646936115.json` and `output/chat-feature-runtime-edcebe85-cff0-490b-8bcc-2c1ba7f15984.json`. The authorized elevated run then completed successfully in 75 seconds against the fresh preview. Authoritative reports: `output/full-app-entry-f6c7d212-f3fd-4628-9e79-7c5181f381c5.json` and `output/chat-feature-runtime-93f032e8-4caa-45c4-a238-3f1873ac3f80.json`. It exercised first-launch hardware UI, controlled SDK, normal native chat and delegated/browser flows, survived three renderer reloads, and cleaned its isolated userData. Provider calls: 6; external proxy denials: none. The persisted native assistant turn retained successful fixed test-provider evidence `custom:full-app` / `full-app-model` for stream/turn `36bab490e612472593e9fbf8f79e2bef` after reload.

## Targeted native persistent-goal check

Added an opt-in `--goal` step to `scripts/probe-full-app-entry.cjs` and ran exactly once against the supplied existing preview (no repack). Report: `output/full-app-entry-567dc9ea-b8fc-4bf7-a2da-f83768e66a5e.json`. The unsigned preview ASAR hash matched `745bfb70d714e418b69591ca9e7973b9d44712f0db368505d466042de38531d8`; isolated userData cleanup completed, child exit was 0, and no owned children remained.

On the actual Renderer with genuine preload, the probe read empty goal state through `window.lastbrowser.sidekick.goalCommand`, created a bounded validation-only goal with `expectedRevision=0` and a client request ID, then immediately paused it using the returned revision and a second client request ID. It reloaded the Renderer and read status through the same Main IPC contract. The same native session and Space returned `paused`, revision 2; create and pause committed revisions 1 and 2 respectively. No goal kickoff turn was started. This proves persistence through the Main/Backend command path for that session; it is not a click-level test of the GoalControls component. AUTO selection remains unexercised; the separate successful assistant turn used the controlled fixed provider.

## Remaining targeted acceptance checks

Using a fresh preview built from the final changed source, extend or invoke the normal native runner to (1) exercise an actual AUTO-selected turn and verify its resolved provider/model evidence remains attached to the same stream/turn after reload, (2) create a persistent goal through normal native IPC and verify the same goal/run/Space IDs and saved state after reload, and (3) export and inspect the actual backend subagent event sequence. Do not infer these outcomes from UI text, source inspection or synthetic parser helpers.
