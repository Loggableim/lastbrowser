# A034 User avatar presentation

## Scope

User messages in `ChatTranscript` use the existing Sidekick image at 19 by 19 pixels, grayscale and 50% opacity. The user avatar tile is transparent. The 34-pixel avatar column and 12-pixel message gap remain unchanged. This applies to persisted messages and the pending-message fallback. Assistant and system avatar rendering and role labels remain unchanged.

No chat stream, send, authentication, or stop behavior was changed. The deferred thinking indicator is outside this change.

## Evidence

- [Before capture](evidence/a034-user-avatar/before.png) and [after capture](evidence/a034-user-avatar/after.png) show the real `ChatTranscript` component in Chromium using synthetic P004 sentinel messages. This is renderer evidence, not packaged Electron or VM acceptance.
- `apps/desktop/tests/chat-user-avatar.test.ts`: 1 focused renderer test passed, covering persisted and pending user avatars.

## Coordination

The planned `ChatComponents.tsx` transcript and pending fallback, plus `styles.css` user modifier, were posted in the CTO/P004 thread. The P004 repair owner had not replied at capture time. The change stays isolated from chat flow behavior and requires independent review before integration into PR #55.

## Acceptance boundary

Source-renderer visual and focused test evidence only. No Electron package, VM, Store, signed artifact, or release acceptance is claimed.
