import { describe, expect, it } from 'vitest';
import { CHAT_COMPLETION_NOTIFICATION, shouldNotifyChatCompletion } from '../src/main/chat-notifications.js';

describe('background chat completion notifications', () => {
  it('notifies only when the saved preference is explicitly enabled and the window is unfocused', () => {
    expect(shouldNotifyChatCompletion(true, false)).toBe(true);
    expect(shouldNotifyChatCompletion(true, true)).toBe(false);
    expect(shouldNotifyChatCompletion(false, false)).toBe(false);
    expect(shouldNotifyChatCompletion(undefined, false)).toBe(false);
  });

  it('uses generic copy without including chat content', () => {
    expect(CHAT_COMPLETION_NOTIFICATION).toEqual({
      title: 'Lastbrowser',
      body: 'Eine Antwort ist fertig.'
    });
  });
});
