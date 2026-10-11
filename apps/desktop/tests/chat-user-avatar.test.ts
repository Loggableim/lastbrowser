import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatTranscript } from '../src/renderer/panels/ChatComponents.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import { brandAssets } from '../src/renderer/brand.js';

describe('ChatTranscript user avatars', () => {
  it('uses the compact Sidekick image for persisted and pending user messages', () => {
    const html = renderToStaticMarkup(createElement(DesktopI18nProvider, null,
      createElement(ChatTranscript, {
        activeSession: { session_id: 'avatar-test' } as never,
        error: '',
        developerMessages: [],
        loading: false,
        messages: [
          { role: 'user', content: 'Persisted user message' },
          { role: 'assistant', content: 'Assistant response' },
        ],
        pendingUserMessage: 'Pending user message',
        ready: true,
        showDeveloperTools: false,
        showTokenUsage: false,
        showTps: false,
        showThinking: false,
        simplifiedToolCalling: true,
        latestTurnUsage: null,
        onCreateSession: () => undefined,
        serviceStatus: null,
      } as never)));

    const userAvatarCount = (html.match(/message-avatar message-avatar--user/g) || []).length;
    expect(userAvatarCount).toBe(2);
    expect(html).toContain(`<img src="${brandAssets.sidekickAvatar}" alt=""/>`);
    expect(html).toContain('message-avatar"><img');
    expect(html).toContain('message-avatar message-avatar--user"><img');
    expect(html).toContain('class="message-avatar"><img');
    expect(html).toContain('Persisted user message');
    expect(html).toContain('Pending user message');
    expect(html).toContain('Assistant response');
  });
});
