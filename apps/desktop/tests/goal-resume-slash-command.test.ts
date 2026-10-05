import { describe, expect, it } from 'vitest';
import { createChatCommandAction, parseChatCommand } from '../src/renderer/chat-command-registry.js';

describe('persistent goal resume slash command', () => {
  const context = { sessionId: 'goal-session', profileId: 'default', spacePath: 'C:/probe-space',
    browserProfileId: 'default' };
  const capabilities = { plan: false, grill_me: false, boost: false, goal: true, gquota: false, plugins: false };

  it('parses /goal resume as a composer Goal action rather than ordinary chat text', () => {
    expect(parseChatCommand('/goal resume')).toMatchObject({ command: { id: 'goal' }, args: 'resume' });
    expect(createChatCommandAction('/goal resume', 'composer', context, capabilities, () => 'resume-request'))
      .toMatchObject({ kind: 'goal_command', args: 'resume', context, clientRequestId: 'resume-request' });
  });
});
