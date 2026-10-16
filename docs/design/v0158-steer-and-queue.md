# 0.1.58 Chat Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Lastbrowser 0.1.58, Quickchat steers the running agent immediately, and standard chat queues messages typed during a turn so each queued message can be steered or opened as a subchat.

**Architecture:** A tiny pure decision module chooses send, queue, or steer before any network call. Quickchat steer stays inside the live `run_quickchat_direct` stream and the same `quick_chat_id`. Standard-chat steer is a new native-worker control, not the tool-boundary `AIAgent.steer()` stash. Multitask starts a child session bound to the parent turn through the existing child-history store. The queue is per session and is stored on the session record.

**Tech Stack:** Electron renderer (React 19, Vitest), FastAPI routes in `services/sidekick/web/api/`, native chat worker in `services/sidekick/runtime/independent/`.

## Global Constraints

- The five-turn acceptance (Chat and Quickchat, five messages in a row, time to first token, error rate) is a 0.1.58 gate, not a blocker for 0.1.57.
- Quickchat is steered by default. A Quickchat message is immediate input to the running agent (steer). The agent receives it at once. It does not sit in a queue and it does not open a second chat.
- Standard chat: messages the user writes while a turn is active go into a queue. For each queued message the user can choose Steer (inject it into the current agent as immediate input) or Multitask (open a subchat / subagent that runs that message beside the current turn).
- Do not change the 0.1.57 demo build. Do not merge this work into `lastbrowser/demo4-final-b614` or `cid/demo4-int` as a 0.1.57 fix. Do not tag. Do not release.
- This plan's own branch is docs only. Implementation happens on a later 0.1.58 branch cut from `cid/demo4-int` after 0.1.57 is frozen.
- Desktop standard chat always queues during an active turn. Desktop Quickchat always steers during an active turn. Do not use Settings `display.busy_input_mode` (`queue` | `interrupt` | `steer`) as this product switch. Leave that dropdown and the CLI gateway (`GatewayRunner._busy_input_mode` in `services/sidekick/runtime/gateway/run.py`) alone.
- Do not bump the package version in the implementation commits that only add this behavior. Version 0.1.58 is the release that contains the finished behavior, not a side effect of the first task.

## Source read for this plan

Read-only, at the time of writing:

- `origin/cid/demo4-int` at `f838133dda618d95b28add2e6b55b1a2f0415ac7` (`feat(chat): enable the persistent chat worker for demo 0.1.57-demo.4`). Line numbers below are from this commit.
- `origin/lastbrowser/demo4-chat-latency-b614` at `60b2a5cfc905cc40dabbba3a2e7d9eb3987c15e9`, five commits ahead of that tip. The same functions exist. On the latency tip, `start_quickchat` gains a `diag=None` argument. Keep that argument if the 0.1.58 base already has it.

Re-read the named functions before editing. Do not edit `/workspace` checkouts that are on demo branches.

## Current behavior the tasks replace

| Surface | What happens today while a turn is active | File and function |
| --- | --- | --- |
| Standard chat | `handleSend` calls `enqueue` and returns. The item is not sent until the user presses Drain, and Drain only runs when `running` is false. | `apps/desktop/src/renderer/panels/NativeChatMain.tsx` `handleSend` (the `if (running)` block near line 777) |
| Queue store | One global `localStorage` key `lastbrowser.chatQueue.v1`. Not tied to `session_id`. Not written to the session JSON. Actions are Drain, Clear, Remove. | `apps/desktop/src/renderer/NativeCompressQueue.tsx` `useChatQueue`, `QueueIndicator` |
| Quickchat | `sendQuickChat` calls `stopQuickChat()` and then `startQuickChatTurn`. If the stop does not clear `streamId`, the new text is dropped (`return false`). The comment calls this steer. It is a cancel plus a new admission. | `apps/desktop/src/renderer/App.tsx` `sendQuickChat` near line 5055 |
| Quickchat engine | One provider request. No tool loop. `QuickAnswerBot` stops when `cancel_event` is set. | `services/sidekick/runtime/quickchat_direct.py` `run_quickchat_direct`, `QuickAnswerBot` |
| Quickchat HTTP | `start_quickchat` admits via `routes._start_chat_stream_for_session`. `stop_quickchat` / `cancel_quickchat` cancel that stream. There is no steer route. | `services/sidekick/web/api/quickchat.py` `start_quickchat` near line 99 |
| Legacy steer HTTP | `POST /api/chat/steer` calls `AIAgent.steer`, which stashes text until the next tool-result batch. No cached agent returns `fallback: no_cached_agent`. Native-worker turns hit that fallback. | `services/sidekick/web/api/streaming.py` `_handle_chat_steer`; `services/sidekick/run_agent.py` `AIAgent.steer` |
| Native controls | Worker accepts `cancel`, `pause`, `approval`, `clarify` only. | `services/sidekick/runtime/independent/native_chat_host.py` `NativeChatHandle.send_control`; `native_chat_worker.py` `handle_frame`; `services/sidekick/web/api/native_chats.py` `control_native_chat` |
| Children | History is read-only at `POST /api/chat/children`. Writes go through `emit_child_event`. The parent turn id is the parent `stream_id` appended in `_start_chat_stream_for_session`. Bubbles render in `ChildRunBubbles`. | `services/sidekick/web/api/child_streams.py` `child_history`; `services/sidekick/web/api/subagent_history.py` `emit_child_event`; `apps/desktop/src/renderer/components/ChildRunBubbles.tsx` |
| Five in a row | `test_persistent_worker_serves_five_turns_in_one_process` checks one worker process. It does not measure Quickchat, time to first token, or error rate. | `services/sidekick/tests/test_native_chat_persistent_worker.py` |

`AIAgent.steer` must not be the 0.1.58 Quickchat path. Quickchat never produces a tool result, so that stash waits until the turn ends and `streaming.py` emits `pending_steer_leftover`. That is a queue. The locked rule says the running agent receives the text at once.

## Steer, queue, and multitask

- **Send.** No turn is active. Standard chat calls the existing `onSend`. Quickchat calls the existing `startQuickChatTurn` on the current `quickChatId`.
- **Queue.** Standard chat only, and only while `running` is true (`runState` is `starting`, `streaming`, or `cancelling` in `NativeChatMain`). The text is stored on that session. It is not admitted to the parent agent and it does not open a child.
- **Steer.** The same agent, the same conversation id, the same worker process. The in-flight provider read is closed and the next provider request on that same stream starts with the steered text as the newest user message. Partial assistant text already shown stays in the transcript. No second chat id. No queue slot.
- **Multitask.** Standard chat only, chosen per queued item. The parent turn keeps running. A child session starts beside it, recorded with `emit_child_event` against the parent turn id, and shown by the existing `ChildRunBubbles`. It is not a new top-level chat and it is not a steer.

A message already in the queue stays there until one of these happens:

- The user presses **Steer** on that row. That row is removed only after the steer call returns accepted. The other rows stay. The parent turn is not cancelled as a user-visible stop and is not replaced by a new session.
- The user presses **Multitask** on that row. That row is removed only after `POST /api/chat/multitask` returns a `childSessionId`. The other rows stay. The parent stream id does not change.
- The user presses **Remove** on that row, or **Clear** for every row of this session.
- The parent turn reaches a terminal state (`done`, `stream_end`, `error`, `cancel`) and this row is still the head. The head is then sent with the normal idle `onSend` path, one message per finished turn, FIFO. Rows already steered or multitasked are gone and are not sent again.

Doing nothing does not steer and does not open a subchat. The text waits, then becomes the next parent turn.

## File map

- Create `apps/desktop/src/renderer/chat-control.ts`. Pure decisions: outgoing disposition, queue-row actions, id checks.
- Create `apps/desktop/tests/chat-control.test.ts`.
- Modify `apps/desktop/src/renderer/NativeCompressQueue.tsx`. Session-scoped queue plus Steer and Multitask buttons.
- Modify `apps/desktop/src/renderer/panels/NativeChatMain.tsx` `handleSend` and the `QueueIndicator` props.
- Modify `apps/desktop/src/renderer/App.tsx` `sendQuickChat`.
- Modify `apps/desktop/src/main/sidekick-api.ts`. Add `steerQuickChat` and `startUserSubchat` next to `startQuickChat`.
- Modify `apps/desktop/src/main/preload.ts` and `apps/desktop/src/main/main.ts` to add `quickChat.steer`, matching the existing `quickChat.stop` channel. Session queue and multitask use the existing `sidekick.requestWebui` from the renderer.
- Modify `services/sidekick/web/api/quickchat.py`. Add `steer_quickchat`.
- Modify `services/sidekick/runtime/quickchat_direct.py` `QuickAnswerBot` and `run_quickchat_direct`.
- Create `services/sidekick/web/api/session_queue.py` with `save_composer_queue` and `load_composer_queue`.
- Modify `services/sidekick/web/api/routes.py`. Route `/api/quickchat/steer`, `/api/session/queue`, and `/api/chat/multitask`.
- Modify `services/sidekick/runtime/independent/native_chat_host.py` `send_control`, `native_chat_worker.py` `handle_frame`, and `services/sidekick/web/api/native_chats.py` `control_native_chat`.
- Modify `services/sidekick/web/api/streaming.py` `_handle_chat_steer` so a live native stream is forwarded to that control instead of `no_cached_agent`.
- Create `services/sidekick/web/api/user_subchat.py`.
- Create `scripts/probe-v0158-five-turn.py`.
- Tests named in each task. Do not add the five-turn script to `npm test` or to the 0.1.57 store preflight.

---

### Task 1: Outgoing disposition

**Files:**

- Create: `apps/desktop/src/renderer/chat-control.ts`
- Test: `apps/desktop/tests/chat-control.test.ts`

**Interfaces:**

- Consumes: nothing
- Produces: `decideOutgoingChat(input: { surface: 'standard' | 'quickchat'; turnActive: boolean }): 'send' | 'queue' | 'steer'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { decideOutgoingChat } from '../src/renderer/chat-control.js';

describe('decideOutgoingChat', () => {
  it('sends either surface when no turn is active', () => {
    expect(decideOutgoingChat({ surface: 'standard', turnActive: false })).toBe('send');
    expect(decideOutgoingChat({ surface: 'quickchat', turnActive: false })).toBe('send');
  });

  it('queues standard chat and steers Quickchat while a turn is active', () => {
    expect(decideOutgoingChat({ surface: 'standard', turnActive: true })).toBe('queue');
    expect(decideOutgoingChat({ surface: 'quickchat', turnActive: true })).toBe('steer');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts`

Expected: FAIL, `decideOutgoingChat` is not defined.

- [ ] **Step 3: Implement the decision**

```ts
export type ChatSurface = 'standard' | 'quickchat';
export type OutgoingDisposition = 'send' | 'queue' | 'steer';

export function decideOutgoingChat(input: { surface: ChatSurface; turnActive: boolean }): OutgoingDisposition {
  if (!input.turnActive) return 'send';
  return input.surface === 'quickchat' ? 'steer' : 'queue';
}
```

- [ ] **Step 4: Re-run the test**

Run: `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/chat-control.ts apps/desktop/tests/chat-control.test.ts
git commit -m "feat(chat): decide queue versus steer by surface"
```

### Task 2: Session queue record

**Files:**

- Modify: `apps/desktop/src/renderer/chat-control.ts`
- Modify: `apps/desktop/tests/chat-control.test.ts`
- Modify: `services/sidekick/web/api/routes.py` (the `/api/session/draft` handler near line 7676 is the pattern)
- Modify: `services/sidekick/web/api/models.py` session fields, next to `composer_draft`
- Test: `services/sidekick/tests/test_session_queue.py`

**Interfaces:**

- Consumes: `decideOutgoingChat`
- Produces:
  - `QueuedChatMessage = { id: string; sessionId: string; text: string; model?: string; profile?: string; reasoningEffort?: string; createdAt: number }`
  - `queueStorageKey(sessionId: string): string` returns `lastbrowser.chatQueue.v2:<sessionId>`
  - `applyQueueAction(queue: readonly QueuedChatMessage[], action: { type: 'steer' | 'multitask' | 'remove'; id: string } | { type: 'clear' }): QueuedChatMessage[]`
  - `save_composer_queue(session, items) -> list` and `load_composer_queue(session) -> list` in `services/sidekick/web/api/session_queue.py`
  - `POST /api/session/queue` and `GET /api/session/queue` call those functions. Body `{ session_id, items }` returns `{ ok: true, items }`

Limits, matching the draft caps in the draft handler: at most 20 items, each `text` at most 50_000 characters, `id` matches `[a-z0-9]{16,64}`. Reject a Quickchat session (`session_kind == "quickchat"`) with 409 `quickchat_queue_disabled`. Reject another profile's session the same way `/api/session/draft` rejects a missing session.

- [ ] **Step 1: Write the failing renderer test**

```ts
import { describe, expect, it } from 'vitest';
import { applyQueueAction, queueStorageKey, type QueuedChatMessage } from '../src/renderer/chat-control.js';

const item = (id: string): QueuedChatMessage => ({
  id, sessionId: 'sess_a', text: id, createdAt: 1,
});

describe('session queue', () => {
  it('keys storage by session and removes only the acted row', () => {
    expect(queueStorageKey('sess_a')).toBe('lastbrowser.chatQueue.v2:sess_a');
    const queue = [item('aaaaaaaabbbbbbbb'), item('ccccccccdddddddd')];
    expect(applyQueueAction(queue, { type: 'steer', id: 'aaaaaaaabbbbbbbb' }).map(row => row.id))
      .toEqual(['ccccccccdddddddd']);
    expect(applyQueueAction(queue, { type: 'multitask', id: 'ccccccccdddddddd' }).map(row => row.id))
      .toEqual(['aaaaaaaabbbbbbbb']);
    expect(applyQueueAction(queue, { type: 'clear' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Write the failing Python test**

```python
def test_session_queue_roundtrip_and_quickchat_rejection(tmp_path, monkeypatch):
    from web.api.models import Session
    from web.api.session_queue import load_composer_queue, save_composer_queue
    monkeypatch.setattr(Session, "save", lambda self: None)
    standard = Session(session_id="sess_standard", workspace=str(tmp_path), profile="default")
    saved = save_composer_queue(standard, [{
        "id": "aaaaaaaabbbbbbbb",
        "text": "follow up",
        "model": "glm-5.3-flash",
        "createdAt": 1,
    }])
    assert saved[0]["text"] == "follow up"
    assert load_composer_queue(standard)[0]["id"] == "aaaaaaaabbbbbbbb"
    quick = Session(session_id="quick_1", workspace=str(tmp_path), profile="default",
                    session_kind="quickchat", quick_chat_id="quick_1")
    with pytest.raises(PermissionError) as raised:
        save_composer_queue(quick, [])
    assert str(raised.value) == "quickchat_queue_disabled"
```

`Session(...)` is the constructor in `services/sidekick/web/api/models.py`. The route handler around `/api/session/draft` translates `PermissionError` into HTTP 409 `{ error_code: "quickchat_queue_disabled" }`.

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts`

Run: `python -m pytest services/sidekick/tests/test_session_queue.py -q`

Expected: both FAIL on missing symbols.

- [ ] **Step 4: Implement the types, the route, and the session field**

Add the TypeScript types and `applyQueueAction` to `chat-control.ts`. `applyQueueAction` filters by `id` for `steer`, `multitask`, and `remove`. `clear` returns `[]`. An unknown id returns the same array.

Put `save_composer_queue` and `load_composer_queue` in `services/sidekick/web/api/session_queue.py`. Sanitize to at most 20 items. Keep `id`, `text`, optional `model`, `profile`, `reasoningEffort`, and `createdAt`. Store the list on `s.composer_queue` and call `s.save()`. In `routes.py`, copy the lock and session lookup of `/api/session/draft`. GET returns `{ items: load_composer_queue(s) }`. POST returns `{ ok: true, items: save_composer_queue(s, body.get("items") or []) }`. Include `composer_queue` in the session JSON fields in `models.py` next to `composer_draft`.

On the renderer, `useChatQueue(sessionId)` in Task 3 reads this key. Hydrate from GET when the local list for that session is empty. After every local change, POST the list. A failed POST keeps the local list and surfaces the existing chat status line. Never POST a Quickchat id.

Migration from `lastbrowser.chatQueue.v1`: if the v2 key for the open standard session is empty and v1 is a non-empty array, copy v1 into that session once, POST it, then delete v1. If no standard session is open, delete v1 without attaching it to a different chat.

- [ ] **Step 5: Re-run both tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/chat-control.ts apps/desktop/tests/chat-control.test.ts services/sidekick/web/api/session_queue.py services/sidekick/web/api/routes.py services/sidekick/web/api/models.py services/sidekick/tests/test_session_queue.py
git commit -m "feat(chat): persist the standard-chat queue on the session"
```

### Task 3: Queue rows can steer or multitask

**Files:**

- Modify: `apps/desktop/src/renderer/NativeCompressQueue.tsx`
- Modify: `apps/desktop/src/renderer/panels/NativeChatMain.tsx` `handleSend` and the `QueueIndicator` usage near line 929
- Test: `apps/desktop/tests/chat-control.test.ts`

**Interfaces:**

- Consumes: `decideOutgoingChat`, `QueuedChatMessage`, `applyQueueAction`
- Produces: `QueueIndicator` props `onSteer(item)`, `onMultitask(item)` in addition to the current drain, clear, and remove callbacks

- [ ] **Step 1: Write the failing branch test**

```ts
import { decideOutgoingChat } from '../src/renderer/chat-control.js';

it('does not treat a busy standard send as a steer', () => {
  expect(decideOutgoingChat({ surface: 'standard', turnActive: true })).not.toBe('steer');
});
```

- [ ] **Step 2: Change `handleSend`**

Replace the `if (running) { enqueue(...); return; }` block with:

```ts
import { decideOutgoingChat } from '../chat-control.js';

const disposition = decideOutgoingChat({
  surface: 'standard',
  turnActive: running,
});
if (disposition === 'queue') {
  enqueue({
    id: newIndependentRequestId().replaceAll('-', '').slice(0, 32),
    sessionId: activeSessionId,
    text: messageToSend,
    model,
    profile,
    reasoningEffort: sendEffort,
    createdAt: Date.now(),
  });
  setStatusMessage(`Queued: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
  return;
}
onSend(messageToSend, sendEffort || undefined);
```

Require `activeSessionId`. If it is missing, keep the current status and do not write the v1 global key.

- [ ] **Step 3: Extend `QueueIndicator`**

Each row keeps the truncated text and the remove button. Add two buttons, disabled while `busy` is false only for Steer (nothing to inject). Multitask stays enabled while the parent turn is active; when `busy` is false, hide Multitask because the head will send as the next parent turn instead.

```tsx
<button type="button" disabled={!busy} onClick={() => onSteer(msg)}>Steer</button>
{busy && <button type="button" onClick={() => onMultitask(msg)}>Multitask</button>}
```

`onSteer` and `onMultitask` call the functions added in Tasks 5 and 6. In this task's commit, both handlers are real functions in `NativeChatMain` that POST `/api/chat/steer` and `/api/chat/multitask`. A non-200 response leaves the row in the queue and sets the status line from `chat.queue.steerFailed` or `chat.queue.multitaskFailed`. Neither handler calls `onSend` or `enqueue`. Tasks 5 and 6 make those POSTs succeed; this task does not stub them with a temporary label.

Add English and German strings in the existing desktop i18n tables used by the chat header (`settings.panels.preferences.steer` is the settings label "Steer mid-turn"; add chat-scoped keys `chat.queue.steer` and `chat.queue.multitask` rather than reusing the settings sentence).

Keep Drain. Drain still sends only the head, and only when `running` is false, through `handleSend`.

- [ ] **Step 4: Auto-send the head when the parent turn ends**

In `NativeChatMain`, add an effect: when `running` transitions from true to false, `queue[0].sessionId === activeSessionId`, and `writerProtected` is false, call `dequeue()` and `onSend(head.text, head.reasoningEffort || undefined)` once. Guard with a ref so a re-render does not send the head twice. If `onSend` fails, put the head back at index 0 and show the error on the status line.

- [ ] **Step 5: Run the desktop test**

Run: `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/NativeCompressQueue.tsx apps/desktop/src/renderer/panels/NativeChatMain.tsx apps/desktop/src/renderer/chat-control.ts apps/desktop/tests/chat-control.test.ts
git commit -m "feat(chat): show steer and multitask on each queued message"
```

### Task 4: Quickchat steer on the same stream

**Files:**

- Modify: `services/sidekick/runtime/quickchat_direct.py` `QuickAnswerBot`, `run_quickchat_direct`
- Modify: `services/sidekick/web/api/quickchat.py`
- Modify: `services/sidekick/web/api/routes.py` next to the `/api/quickchat/start` branch near line 8165
- Modify: `apps/desktop/src/main/sidekick-api.ts` next to `startQuickChat`
- Modify: `apps/desktop/src/main/quick-chat-controller.ts` `start` path, add `steer`
- Modify: `apps/desktop/src/renderer/App.tsx` `sendQuickChat`
- Test: `services/sidekick/tests/test_quickchat_steer.py`
- Test: extend `apps/desktop/tests/quick-chat.test.ts` only for the live decision. The legacy `QuickChat.send` in `apps/desktop/src/renderer/quick-chat.ts` returns early when `busy` and is not mounted (`useQuickChat` has no callers). Leave that class. Do not make it the product path.

**Interfaces:**

- Consumes: `decideOutgoingChat`
- Produces:
  - `steer_quickchat(body, handler) -> tuple[dict, int]`
  - `POST /api/quickchat/steer` body `{ quick_chat_id, stream_id, space_scope, profile, workspace, prompt }`
  - Response `{ ok: true, quick_chat_id, stream_id }` or the same error codes as `stop_quickchat` (`quickchat_not_found`, `quickchat_binding_conflict`, `quickchat_stream_mismatch`)
  - `QuickAnswerBot.submit_steer(text: str) -> bool`

- [ ] **Step 1: Write the failing engine test**

```python
def test_quickchat_steer_replaces_the_provider_read_without_a_new_session(monkeypatch):
    bot = QuickAnswerBot(bridge=object(), provider="custom", model="controlled-model",
                         runtime={}, cancel_event=threading.Event(), delta=lambda text: None)
    assert bot.submit_steer("use the short form") is True
    assert bot.take_steer() == "use the short form"
    assert bot.submit_steer("") is False
```

Add a second test that runs `run_quickchat_direct` with a fake client whose first stream yields one token and whose second stream yields `STEERED`. After the first token, call `submit_steer("shorter")`. Assert one session id, two provider calls, the second request's last user message is `shorter`, and the cancel event is still clear.

- [ ] **Step 2: Run it**

Run: `python -m pytest services/sidekick/tests/test_quickchat_steer.py -q`

Expected: FAIL, `submit_steer` missing.

- [ ] **Step 3: Implement immediate steer inside the direct request**

On `QuickAnswerBot`, add a lock and `_steer_text: str | None`. `submit_steer` stores stripped text and returns False when empty. In the chunk loop, beside the `cancel_event` check, call `take_steer()`. When it returns text:

- close `self.stream`
- do not raise `InterruptedError`
- return that text to `run_quickchat_direct`

`run_quickchat_direct` then appends the partial assistant text already emitted, appends the steered user text, and starts one more provider request with the same `bot`, same `context.stream_id`, and same `session`. Cap this at 4 steers in one stream so a stuck client cannot loop the provider. The 5th steer returns accepted False with `error_code: quickchat_steer_limit`.

`steer_quickchat` copies the binding checks in `stop_quickchat` (same id, same scope, same profile, active stream id matches). It loads the bot from `AGENT_INSTANCES[stream_id]` (the object `_register_quick_answer` already stores in `streaming.py`). It calls `submit_steer`. It does not call `control_native_chat(..., command="cancel")` and does not call `start_quickchat`.

- [ ] **Step 4: Point the renderer at it**

In `sendQuickChat`, replace the stop-then-start block:

```ts
const disposition = decideOutgoingChat({
  surface: 'quickchat',
  turnActive: quickChatBusyRef.current || quickChatAwaitingStartRef.current,
});
if (disposition === 'steer') {
  const binding = quickChatBindingRef.current;
  if (!binding) return false;
  const steered = await window.lastbrowser.quickChat.steer({
    quickChatId: binding.quickChatId,
    streamId: binding.streamId,
    scope: binding.scope,
    prompt,
  });
  if (!steered.ok) return false;
  updateQuickChatMessagesForScope(scopeKey, current => [...current, { role: 'user', content: prompt }]);
  return true;
}
return await startQuickChatTurn(prompt, context, preserveUnknownOutcome, reasoningEffort);
```

Do not call `stopQuickChat` on this path. Do not assign a new `quickChatId`. Do not write `composer_queue`.

The IPC handler in `QuickChatController.steer` checks the same sender and binding rules as `stop` (`quick-chat-controller.ts`). The main-process API posts `/api/quickchat/steer` with the same scope fields as `/api/quickchat/stop`.

- [ ] **Step 5: Re-run the tests**

Run: `python -m pytest services/sidekick/tests/test_quickchat_steer.py services/sidekick/tests/test_quickchat.py -q`

Run: `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts tests/quick-chat-controller.test.ts`

Expected: PASS. Existing stop and cancel tests still pass.

- [ ] **Step 6: Commit**

```bash
git add services/sidekick/runtime/quickchat_direct.py services/sidekick/web/api/quickchat.py services/sidekick/web/api/routes.py services/sidekick/tests/test_quickchat_steer.py apps/desktop/src/main/sidekick-api.ts apps/desktop/src/main/quick-chat-controller.ts apps/desktop/src/renderer/App.tsx apps/desktop/src/main/preload.ts apps/desktop/src/main/main.ts
git commit -m "feat(quickchat): steer the running answer in the same chat"
```

### Task 5: Standard-chat steer from a queued row

**Files:**

- Modify: `services/sidekick/runtime/independent/native_chat_host.py` `NativeChatHandle.send_control`
- Modify: `services/sidekick/runtime/independent/native_chat_worker.py` `handle_frame`
- Modify: `services/sidekick/web/api/native_chats.py` `control_native_chat`
- Modify: `services/sidekick/web/api/routes.py` `_handle_native_chat_control`
- Modify: `services/sidekick/web/api/streaming.py` `_handle_chat_steer`
- Modify: `apps/desktop/src/renderer/panels/NativeChatMain.tsx` `onSteer`
- Test: `services/sidekick/tests/test_native_chat_controls.py`

**Interfaces:**

- Consumes: queued row from Task 3
- Produces: native control command `steer` with `response` set to the user text (the existing `response` field is already forwarded for `clarify`; reuse it so the envelope does not grow a new key). `control_native_chat` returns True when the worker ack says `accepted: true`.

- [ ] **Step 1: Extend the control test**

Add this test next to `test_native_control_registry_rejects_foreign_scope_and_forwards_stop` in `services/sidekick/tests/test_native_chat_controls.py`. It uses the same `native` fixture and `native_chats.register_native_chat`.

```python
def test_steer_control_is_forwarded_without_a_stop(native):
    from web.api import native_chats
    hub, scope, _, session = native
    context = SimpleNamespace(session_id=session.session_id, stream_id="stream-steer", profile_name="default", scope=scope)
    entry = native_chats.register_native_chat(context)
    sent = []
    entry.handle = SimpleNamespace(is_alive=True, send_control=lambda *args, **kwargs: sent.append((args, kwargs)))
    try:
        assert native_chats.control_native_chat(
            session.session_id, "stream-steer", actor="default", scope=scope,
            command="steer", response="check the second heading") is True
        assert sent[-1][0][0] == "steer"
        assert sent[-1][1]["response"] == "check the second heading"
        assert entry.stop_command is None
    finally:
        native_chats._active.pop("stream-steer", None)
```

- [ ] **Step 2: Run it**

Run: `python -m pytest services/sidekick/tests/test_native_chat_controls.py -q`

Expected: FAIL, unsupported control.

- [ ] **Step 3: Accept `steer` without stopping the worker**

In `send_control`, add `steer` to the allowed set. Do not call `_stop_parent_io` for it. Pass `response` as the text. Reject empty text and text longer than 50_000 characters with `ValueError`.

In `handle_frame`, a `steer` command does not call `interrupt()`. It calls a new `apply_native_steer(text)` in the worker:

- If the in-process agent has `steer` and a tool batch is open, call `agent.steer(text)` and ack `accepted: true`.
- Otherwise set a turn-local `steer_text` that the provider read loop checks the same way `QuickAnswerBot.take_steer` does, ack `accepted: true`, and let the current model call end so the same worker process continues the same session with the new user message. Do not spawn a second process. The persistent-worker test `test_persistent_worker_serves_five_turns_in_one_process` must still see one pid.

In `_handle_chat_steer`, before the `SESSION_AGENT_CACHE` lookup: if `control_native_chat` can see a live stream for this session, forward `command="steer"` and return `{ accepted, fallback: null, stream_id }`. Only use `AIAgent.steer` when no native stream is active. Do not fall back to interrupt when steer is rejected. Return `accepted: false` and leave the queue row in place.

`onSteer` in `NativeChatMain`:

```ts
const result = await window.lastbrowser.sidekick.requestWebui({
  method: 'POST',
  path: '/api/chat/steer',
  body: { session_id: activeSessionId, text: item.text },
});
if (result?.accepted !== true) {
  setStatusMessage(t('chat.queue.steerFailed'));
  return;
}
removeQueued(item.id);
```

- [ ] **Step 4: Re-run controls and the five-turn unit test**

Run: `python -m pytest services/sidekick/tests/test_native_chat_controls.py services/sidekick/tests/test_native_chat_persistent_worker.py -q`

Expected: PASS. The unit test is still not the release gate.

- [ ] **Step 5: Commit**

```bash
git add services/sidekick/runtime/independent/native_chat_host.py services/sidekick/runtime/independent/native_chat_worker.py services/sidekick/web/api/native_chats.py services/sidekick/web/api/routes.py services/sidekick/web/api/streaming.py services/sidekick/tests/test_native_chat_controls.py apps/desktop/src/renderer/panels/NativeChatMain.tsx
git commit -m "feat(chat): steer a queued standard-chat message into the live turn"
```

### Task 6: Multitask opens a child beside the parent

**Files:**

- Create: `services/sidekick/web/api/user_subchat.py`
- Modify: `services/sidekick/web/api/routes.py` next to `POST /api/chat/children`
- Modify: `apps/desktop/src/renderer/panels/NativeChatMain.tsx` `onMultitask`
- Test: `services/sidekick/tests/test_user_subchat.py`
- The renderer already polls child history through `useChildRunHistory` and renders `ChildRunBubbles` in `apps/desktop/src/renderer/panels/ChatComponents.tsx`. Do not add a second transcript panel.

**Interfaces:**

- Consumes: `capture_native_parent` in `services/sidekick/runtime/independent/child_runtime.py`; `emit_child_event` in `services/sidekick/web/api/subagent_history.py`; `ChildRunContext` in `services/sidekick/runtime/independent/child_contracts.py`
- Produces: `POST /api/chat/multitask` body `{ session_id, space_scope, parent_turn_id, text, model, model_provider }` returns `{ schemaVersion: 1, subagentId, childSessionId, parentSessionId, parentTurnId }`

- [ ] **Step 1: Write the failing test**

```python
def test_multitask_starts_a_child_and_leaves_the_parent_stream(parent_turn):
    response = parent_turn.post("/api/chat/multitask", json={
        "session_id": parent_turn.session_id,
        "space_scope": parent_turn.scope,
        "parent_turn_id": parent_turn.stream_id,
        "text": "look this up separately",
        "model": parent_turn.model,
        "model_provider": parent_turn.provider,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["parentSessionId"] == parent_turn.session_id
    assert body["parentTurnId"] == parent_turn.stream_id
    assert body["childSessionId"] != parent_turn.session_id
    assert parent_turn.active_stream_id == parent_turn.stream_id
    history = parent_turn.child_history()
    assert any(run["subagentId"] == body["subagentId"] for run in history["runs"])
```

Build `parent_turn` with the native chat fixture used by `services/sidekick/tests/test_child_run_history.py`. A second case posts after the parent stream is gone and expects 409 `turn_finished`.

- [ ] **Step 2: Run it**

Run: `python -m pytest services/sidekick/tests/test_user_subchat.py -q`

Expected: FAIL, route missing.

- [ ] **Step 3: Implement `start_user_subchat`**

The module imports `uuid`, `capture_native_parent`, `ChildRunContext`, `emit_child_event`, and the chat start helper `routes._start_chat_stream_for_session`. `create_child_session` lives in the same file.

```python
def start_user_subchat(parent, body, *, actor: str) -> dict:
    parent_turn_id = body["parent_turn_id"]
    if getattr(parent, "active_stream_id", None) != parent_turn_id:
        raise PermissionError("turn_finished")
    text = str(body.get("text") or "").strip()
    if not text or len(text) > 50_000:
        raise ValueError("invalid multitask text")
    child = create_child_session(parent, text, model=body.get("model"), provider=body.get("model_provider"))
    parent_context = capture_native_parent(parent, parent.session_id, parent_turn_id)
    run = ChildRunContext(parent=parent_context, subagent_id=uuid.uuid4().hex, child_session_id=child.session_id,
                          depth=1, model=child.model, model_provider=child.model_provider or "")
    emit_child_event(run, event_type="started", payload={"text": text[:500]})
    started = routes._start_chat_stream_for_session(child, msg=text, attachments=[], workspace=child.workspace,
                                                    model=child.model, model_provider=child.model_provider,
                                                    goal_related=False, mode="action")
    if int(started.get("_status", 200)) >= 400:
        emit_child_event(run, event_type="status", payload={"status": "failed"})
        raise RuntimeError(started.get("error_code") or "multitask_start_failed")
    return {"schemaVersion": 1, "subagentId": run.subagent_id, "childSessionId": child.session_id,
            "parentSessionId": parent.session_id, "parentTurnId": parent_turn_id}
```

`create_child_session` copies the parent's scope, workspace, profile, and model onto a new `Session`. It does not copy `active_stream_id`. It does not call `delegate_task`. The parent lock is not held across the child start.

Route errors: 409 with `error_code: turn_finished` when the parent turn is gone. The desktop then leaves the row in the queue so the auto-send in Task 3 can deliver it as the next parent turn. On 200, `onMultitask` calls `applyQueueAction` for that id only.

- [ ] **Step 4: Re-run child tests**

Run: `python -m pytest services/sidekick/tests/test_user_subchat.py services/sidekick/tests/test_child_run_history.py -q`

Expected: PASS. Parent `active_stream_id` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add services/sidekick/web/api/user_subchat.py services/sidekick/web/api/routes.py services/sidekick/tests/test_user_subchat.py apps/desktop/src/renderer/panels/NativeChatMain.tsx
git commit -m "feat(chat): open a queued message as a subchat beside the current turn"
```

### Task 7: Five-turn gate for 0.1.58

**Files:**

- Create: `scripts/probe-v0158-five-turn.py`
- Modify: `docs/ttft-benchmarking.md` with one subsection that points at this script and states it is a 0.1.58 gate

**Interfaces:**

- Consumes: `POST /api/session/new`, `POST /api/chat/start`, `POST /api/quickchat/start`, and `native_chat_phase stage=first_text` as documented in `docs/ttft-benchmarking.md`
- Produces: a JSON report `{ version: "0.1.58", surfaces: { standard: Turn[5], quickchat: Turn[5] } }` where each turn is `{ index, stream_id, ttft_ms, error }`

This script is not part of `npm test`, `npm run verify:store`, or the 0.1.57 demo checklist. Do not run it against `lastbrowser/demo4-final-b614`, a 0.1.57 package, or the current demo process.

- [ ] **Step 1: Add the script**

Copy the HTTP helpers `headers`, `start_quickchat`, `start_standard`, `new_session`, and the `PHASE_RE` log parser from `scripts/probe-opencode-ttft-cold-warm.py`. Change the loop:

- One standard session, then five prompts: `Turn 1` through `Turn 5`, each `Reply with exactly: TURN-N`.
- Wait until `stage=first_text` for that `stream_id`. Record `elapsed_ms` as `ttft_ms`.
- Then wait until `stream_end` or `error` for that stream before sending the next prompt. Do not set `FAST_TTFT=1`. Do not cancel the stream. Cancelling would make the next message a steer or a queue item and would not measure five completed turns.
- Repeat on one `quick_chat_id` for five Quickchat prompts. Same id for all five. No second id.
- A missing `first_text` within 180 seconds, an HTTP status >= 400, or an `error` event sets `error` on that turn.
- Print one line per turn: `surface index ttft_ms error`.
- Exit 0 only when all 10 turns have `error` null and a numeric `ttft_ms`. Exit 1 otherwise.
- Write the JSON to `OUTPUT_JSON` (default `v0158-five-turn.json` in the current directory).

Do not encode a millisecond pass/fail. The beta.10 note in `docs/ttft-benchmarking.md` that counts TTFT above 12_000 ms as an outlier stays a benchmarking note. The 0.1.58 gate is error rate: 0 errors out of 5 standard turns and 0 errors out of 5 Quickchat turns, with TTFT recorded for each.

- [ ] **Step 2: Document the run**

Append to `docs/ttft-benchmarking.md`:

```markdown
## 0.1.58 five-turn gate

Not a 0.1.57 blocker. Run `python3 scripts/probe-v0158-five-turn.py` on a 0.1.58 build with Sidekick already bound to the desktop bridge (`ELECTRON_MANAGED_RESTART=1`). One standard session and one Quickchat id, five finished turns each. Pass means every turn has a `first_text` time and a null error. Record the ten `ttft_ms` values in the 0.1.58 test report. Do not run this script to accept or reject the 0.1.57 demo.
```

- [ ] **Step 3: Dry-run the script's argument parser**

Run: `python3 scripts/probe-v0158-five-turn.py --help`

Expected: exit 0 and the help text names both surfaces. Do not point it at a live 0.1.57 Sidekick.

- [ ] **Step 4: Commit**

```bash
git add scripts/probe-v0158-five-turn.py docs/ttft-benchmarking.md
git commit -m "test(chat): add the 0.1.58 five-turn gate script"
```

The live run itself happens once on the 0.1.58 release candidate, after Tasks 1–6 are on that branch. Save the JSON report under `docs/test-reports/` in a follow-up commit. A non-zero exit blocks the 0.1.58 tag. It does not block 0.1.57.

## Verification before the 0.1.58 tag

Run on the 0.1.58 implementation branch, not on the demo branch:

- `npm --workspace apps/desktop exec vitest run tests/chat-control.test.ts tests/quick-chat-controller.test.ts`
- `python -m pytest services/sidekick/tests/test_session_queue.py services/sidekick/tests/test_quickchat_steer.py services/sidekick/tests/test_quickchat.py services/sidekick/tests/test_native_chat_controls.py services/sidekick/tests/test_user_subchat.py services/sidekick/tests/test_native_chat_persistent_worker.py -q`
- `python -m compileall -q services/sidekick`
- `python3 scripts/probe-v0158-five-turn.py` against the 0.1.58 desktop with a real provider, then archive the JSON

Manual check on that build:

- Standard chat, turn in progress, type two messages. Both appear in the queue for that session only. Reload the window. Both are still there. A different session does not show them.
- Press Steer on the second row. That text is injected, the first row remains, and no new top-level session appears.
- Press Multitask on the remaining row. The parent answer keeps streaming. A child bubble appears under that turn.
- Let a later queued head sit with no button press. When the parent turn finishes, that head sends as the next parent turn.
- Quickchat, turn in progress, send another message. The same Quickchat transcript shows the new user line immediately. No queue chip. The Quickchat id in the binding does not change.

## Out of scope

- Any edit to the 0.1.57 demo branch, its package, or its tag.
- Changing `display.busy_input_mode` or the CLI `/busy` command.
- Making `AIAgent.steer` the Quickchat implementation.
- A TTFT millisecond budget.
- Merging this plan into `cid/demo4-int` as a product change. The plan document can sit in a draft PR. The behavior lands only with the 0.1.58 implementation.
