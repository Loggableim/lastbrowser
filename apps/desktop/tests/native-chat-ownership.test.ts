import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectNativeSession } from '../src/renderer/native-session-selection.js';

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('native chat ownership transitions', () => {
  it('routes recent-session picks through a handler that invalidates pending creates and clears the old draft', () => {
    expect((appSource.match(/selectNativeSession\(sessionId\);/g) || [])).toHaveLength(3);
    const handler = appSource.match(/function selectNativeSession\(sessionId: string\): void \{([\s\S]*?)\n  \}/)?.[1] || '';
    expect(handler).toContain('selectNativeChatSession(sessionId, activeSessionIdRef.current');
    expect(handler).toContain('createSessionRequestRef.current += 1');
    expect(handler).toContain('activeSessionIdRef.current = nextSessionId');
    expect(handler).toContain("setComposerText('')");
    expect(handler).toContain('selectSession: setActiveSessionId');
  });

  it('applies recent-session selection effects in order and does not activate an empty ID', () => {
    const events: string[] = [];
    const effects = {
      invalidatePendingCreation: () => events.push('invalidate-create'),
      bindSessionRef: (id: string) => events.push(`bind:${id}`),
      clearPreviousSessionView: () => events.push('clear-transcript-and-draft'),
      selectSession: (id: string) => events.push(`select:${id}`),
      openChatPanel: () => events.push('open-chat'),
    };
    expect(selectNativeSession('recent-b', 'old-a', effects)).toBe(true);
    expect(events).toEqual(['invalidate-create', 'bind:recent-b', 'clear-transcript-and-draft', 'select:recent-b', 'open-chat']);
    events.length = 0;
    expect(selectNativeSession('', 'old-a', effects)).toBe(false);
    expect(events).toEqual([]);
  });

  it('starts each new session with an empty, unbound composer and activates it only after scoped load', () => {
    const create = appSource.match(/async function createNativeSession\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] || '';
    expect(create).toContain('activeSessionIdRef.current = null');
    expect(create).toContain("setComposerText('')");
    expect(create).toContain('const session = result?.loaded.session');
    expect(create).toContain('activeSessionIdRef.current = session.session_id');
    expect(create).toContain('setActiveSessionId(session.session_id)');
    expect(create).toContain("setActivePanel('chat')");
  });

  it('wires the real guarded operation to the final Sidekick startChat transport', () => {
    expect(appSource).toContain('prepareGuardedNativeChatStart(createGuardedStartInput())');
    expect(appSource).toContain('startGuardedNativeChat(');
    expect(appSource).toContain('(payload) => window.lastbrowser.sidekick.startChat(payload)');
  });
});
