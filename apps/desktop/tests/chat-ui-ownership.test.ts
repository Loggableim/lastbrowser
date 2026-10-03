import { describe, expect, it } from 'vitest';
import { ChatUiOwnership } from '../src/renderer/chat-ui-ownership.js';

describe('chat UI ownership across profile and Space switches', () => {
  it('releases the busy UI without losing a running stream and reactivates that stream once selected again', () => {
    const ownership = new ChatUiOwnership();
    const ownerId = ownership.begin('session-a');
    ownership.registerStream(ownerId, 'stream-a', 'session-a');

    ownership.releaseUiOwner();
    expect(ownership.activeSessionId).toBeNull();
    expect(ownership.isLocalTurn('session-a')).toBe(true);
    expect(ownership.ownerForStream('stream-a')).toBe(ownerId);

    expect(ownership.reactivate(ownerId, 'session-a')).toBe(true);
    expect(ownership.activeSessionId).toBe('session-a');
    expect(ownership.finish(ownerId)).toBe(true);
    expect(ownership.ownerForStream('stream-a')).toBeNull();
  });

  it('does not let an older stream completion release a newer turn busy lock', () => {
    const ownership = new ChatUiOwnership();
    const oldOwnerId = ownership.begin('session-a');
    ownership.registerStream(oldOwnerId, 'stream-a', 'session-a');
    ownership.releaseUiOwner();

    const newOwnerId = ownership.begin('session-b');
    ownership.registerStream(newOwnerId, 'stream-b', 'session-b');
    expect(ownership.finish(oldOwnerId)).toBe(false);
    expect(ownership.activeSessionId).toBe('session-b');
    expect(ownership.finish(newOwnerId)).toBe(true);
  });

  it('does not reactivate a stream under a different session', () => {
    const ownership = new ChatUiOwnership();
    const ownerId = ownership.begin('session-a');
    ownership.registerStream(ownerId, 'stream-a', 'session-a');
    ownership.releaseUiOwner();

    expect(ownership.reactivate(ownerId, 'session-b')).toBe(false);
    expect(ownership.activeSessionId).toBeNull();
  });
});
