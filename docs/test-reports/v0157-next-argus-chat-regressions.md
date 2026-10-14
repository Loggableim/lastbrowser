# Next Argus test: chat deletion and Updates missing

User report and explicit next-test instruction, 2026-10-13.
Reported while using the newly supplied private 0.1.57-beta.1 candidate;
the exact installed executable/version must be recorded by Argus.

## 1. Chat deletion has no effect

User: delete is clickable but the chat is not deleted.

In the next already authorized VM run, using disposable chats only:
- Record the tested version, installer hash, profile and Space.
- Hover a chat, click delete, then confirm at the same position.
- Observe whether the row disappears, remains absent after refresh/restart,
  and is actually removed from persisted session storage.
- Check single deletion and Shift-selected batch deletion separately.
- Record inline feedback, IPC/API response and relevant logs when available.
- Preserve user sessions; do not bulk-delete real history for reproduction.

## 2. Chatbox displays "Updates missing"

User reports this exact text inside the chatbox. Its relationship to deletion
is not established. Source search locates the label in ChildRunBubbles, but
this alone is not proof of the runtime cause.

- Capture the label's location and the action immediately preceding it.
- Record whether it appears on opening a chat, deleting a chat, sending a
  message, or displaying assistant/subagent activity.
- Record corresponding stream/network errors if present.
- Separate a genuine missing-update event from stale or incorrect UI state.

Status: reported, queued for the next Argus test; no VM reproduction or fix
acceptance claimed. Existing signed beta.1 artifacts remain unchanged.
VM interaction exclusively through Slack assignments to Argus.
