import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatTranscript, type ChatTranscriptProps } from '../src/renderer/panels/ChatComponents.js';

vi.mock('../src/renderer/i18n.js', () => ({
  useDesktopI18n: () => ({ locale: 'en', t: (key: string) => key }),
}));

const props: ChatTranscriptProps = {
  activeSession: null, error: '', developerMessages: [], loading: false,
  messages: [{ role: 'user', content: 'Hello' }], pendingUserMessage: '', ready: true,
  showDeveloperTools: false, showTokenUsage: false, showTps: false,
  showThinking: false, simplifiedToolCalling: true, latestTurnUsage: null,
  onCreateSession: () => {}, serviceStatus: null, childParentTurns: ['internal-turn-id'],
};

describe('chat child-history recovery UI', () => {
  it('does not show a debug refresh button for normal chats without child runs', () => {
    const html = renderToStaticMarkup(React.createElement(ChatTranscript, props));
    expect(html).toContain('Hello');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('internal-turn-id');
  });

  it.each(['childHistoryUnavailable', 'childHistoryResyncNeeded'] as const)(
    'keeps recovery available when %s is set without exposing the stream ID', flag => {
      const html = renderToStaticMarkup(React.createElement(ChatTranscript, { ...props, [flag]: true }));
      expect(html).toContain('<button');
      expect(html).toContain('role="status"');
      expect(html).not.toContain('internal-turn-id');
    },
  );
});
