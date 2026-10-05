# Fix 2: Quickchat routing and lifecycle

## Current finding

Initial finding: the desktop had no mounted Quickchat surface or Quickchat transport contract; page actions flowed through `startNativeChat`, which can create a normal saved session. FIX3 has now added the explicit IPC/Main/Sidekick adapter in the shared tree. The renderer integration mounts `CopilotSplitView` in a dedicated Quickchat mode with a private in-memory transcript and no ordinary session history.

Do not route Quickchat through `startNativeChat(sessionId: null)`, `SpaceAssistantPanel`, or the ordinary `assistantTurn` state. Those paths either create/list a normal session or couple the transient conversation to Space Assistant state.

## Required Main/Sidekick contract

The agreed adapter contract is:

- `startQuickChat` accepts a renderer-generated `quickChatId`, the validated browser/profile/Space scope, selected model/provider, prompt and bounded page context. Main resolves and binds the saved scope; the renderer cannot provide runtime authority or filesystem partition paths.
- The response binds the same `quickChatId` and scope to a unique `streamId`.
- Stream events carry the same chat ID, stream ID and scope; Main validates that binding before forwarding chunks.
- `cancelQuickChat` can cancel only the matching chat ID, stream ID and captured scope. Reset clears only local Quickchat state and invokes that cancellation.
- Backend conversation history is transient and isolated per `quickChatId`. Starting a Quickchat must not create a saved session, goal, run, or row in the ordinary session list.
- Scope changes and resets advance a renderer generation. Chunks from an older generation or scope are ignored even if cancellation races.

The adapter reuses model resolution and the existing event transport, without reusing the normal-session start endpoint. FIX3 owns backend and Main IPC changes; do not edit those files from the renderer stream.

## Page-action policy

Short, page-local requests such as Summarize, Explain selection, and TL;DR open or append to the current Quickchat. Research, extraction, export, and other long-running or artifact-producing tasks stay on the normal work/session flow. The renderer routes titlebar actions and chips this way and hides workflow templates in Quickchat.

Renderer events are filtered by generation, quickChatId, streamId, resolved scope, and the currently selected browser Space key. Events arriving before `start` resolves are buffered and replayed after the stream binding is established. Stop cancels only the exact active stream while retaining the private transcript and identity so the user can continue. Reset rotates the identity and deletes only the captured private quickchat record; after Stop, reset uses an empty stream ID under the same scope binding.

## Acceptance checks

- Quickchat start, stream, reset, cancellation, and stale-event behavior have focused tests.
- A Quickchat action does not create or alter ordinary sessions, goals, or runs.
- Reset affects only the selected Quickchat and cancels only its own active stream.
- Switching Spaces cannot display chunks from the prior scope.
- Long-running actions continue through their existing normal-work path.
