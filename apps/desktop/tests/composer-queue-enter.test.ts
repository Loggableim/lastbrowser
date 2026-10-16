import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer } from '../src/renderer/panels/ChatComponents.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';
import {
  composerEnterAction,
  dequeueSessionMessage,
  enqueueSessionMessage,
  sessionQueue,
} from '../src/renderer/composer-queue.js';

describe('composer enter while a turn is running', () => {
  it('queues a non-empty standard-chat draft instead of dropping it or starting another turn', () => {
    expect(composerEnterAction({ ready: true, text: 'Send this next', running: true, busy: true, sendBlocked: false })).toBe('queue');
    expect(composerEnterAction({ ready: true, text: '   ', running: true, busy: true, sendBlocked: false })).toBe('ignore');
    expect(composerEnterAction({ ready: true, text: 'Hello', running: false, busy: false, sendBlocked: false })).toBe('send');
    expect(composerEnterAction({ ready: false, text: 'Hello', running: true, busy: true, sendBlocked: false })).toBe('ignore');
  });

  it('keeps each session queue separate and releases the oldest item first', () => {
    const first = enqueueSessionMessage({}, 'session-a', { text: 'first follow-up' });
    const both = enqueueSessionMessage(first!, 'session-a', { text: 'second follow-up' });
    const other = enqueueSessionMessage(both!, 'session-b', { text: 'other chat' });
    expect(sessionQueue(other!, 'session-a').map(item => item.text)).toEqual(['first follow-up', 'second follow-up']);
    expect(sessionQueue(other!, 'session-b').map(item => item.text)).toEqual(['other chat']);
    const released = dequeueSessionMessage(other!, 'session-a');
    expect(released.message?.text).toBe('first follow-up');
    expect(sessionQueue(released.store, 'session-a').map(item => item.text)).toEqual(['second follow-up']);
    expect(sessionQueue(released.store, 'session-b').map(item => item.text)).toEqual(['other chat']);
  });

  it('enables send during a stream and shows the queued line', () => {
    const markup = renderToStaticMarkup(React.createElement(
      DesktopI18nProvider,
      null,
      React.createElement(ChatComposer, {
        busy: true,
        mode: 'action',
        model: 'gpt-6-luna',
        modelProvider: 'openai-codex',
        modelOptions: [],
        reasoningEffort: '',
        reasoningEfforts: [],
        profile: 'default',
        ready: true,
        runState: 'streaming',
        text: 'Please also check the footer',
        workspace: 'default',
        queuedMessages: [{ text: 'Please also check the footer' }],
        onMode: () => undefined,
        onModelChange: () => undefined,
        onReasoningEffort: () => undefined,
        onSend: () => undefined,
        onStop: () => undefined,
        onText: () => undefined,
        onRemoveQueued: () => undefined,
      }),
    ));
    const sendButton = markup.match(/<button type="submit" class="composer-send"[^>]*>/)?.[0];
    expect(markup).toContain('composer-send stop');
    expect(sendButton).toBeDefined();
    expect(sendButton).not.toContain('disabled=""');
    expect(markup).toContain('data-testid="composer-queued-row"');
    expect(markup).toContain('Please also check the footer');
    expect(markup).toContain('Queued');
  });
});
