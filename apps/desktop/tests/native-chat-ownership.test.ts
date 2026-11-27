import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectNativeSession } from '../src/renderer/native-session-selection.js';

const appSource = readFileSync(resolve(process.cwd(), 'src/renderer/App.tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('native chat ownership transitions', () => {
  it('routes recent-session picks through a handler that invalidates pending creates and clears the old draft', () => {
    const recentSelection = /onSelectSession=\{\(sessionId\) => \{\s*selectNativeSession\(sessionId\);/;
    const floatingSidebar = appSource.match(/\n([ \t]*)<SidekickSidebar\s+mode=\{zenFloatingMode\}[\s\S]*?\n\1\/>/)?.[0] || '';
    const dockedSidebar = appSource.match(/\n([ \t]*)<SidekickSidebar\s+mode=\{sidebarMode\}[\s\S]*?\n\1\/>/)?.[0] || '';
    const contextSidebar = appSource.match(/\n([ \t]*)<ContextSidebar\b[\s\S]*?\n\1\/>/)?.[0] || '';
    expect(floatingSidebar).toMatch(recentSelection);
    expect(dockedSidebar).toMatch(recentSelection);
    expect(contextSidebar).toMatch(recentSelection);
    expect(appSource).toMatch(/const openNovaActivitySession = \(sessionId: string\) => \{\s*const currentScope = currentNovaAssistantScope\(\);\s*if \(novaAssistantScope && currentScope && sameAssistantScope\(novaAssistantScope, currentScope\)\) selectNativeSession\(sessionId\);/);
    expect(appSource).toContain('onSelectSession: openNovaActivitySession');
    expect(appSource).toContain('onOpenTask: openNovaActivitySession');
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

  it('clears a normal new chat before creation and keeps an existing chat until an assistant switch is verified', () => {
    const create = appSource.match(/async function createNativeSession\([^\n]*\)\s*:[^\n]*\{([\s\S]*?)\n  \}/)?.[1] || '';
    const clear = create.match(/const clearPreviousSession = \(\) => \{([\s\S]*?)\n    \};/)?.[1] || '';
    expect(clear).toContain('activeSessionIdRef.current = null');
    expect(clear).toContain("if (!keepDraft) setComposerText('')");
    expect(create).toMatch(/if \(!changesAssistant && !keepDraft\) \{[\s\S]*?clearPreviousSession\(\);\s*setActivePanel\('chat'\);\s*\}[\s\S]*?const result = await createAndLoadScopedSession/);
    expect(create).toContain('const session = result?.loaded.session');
    expect(create).toMatch(/if \(session\?\.session_id && isCurrent\(\)\) \{[\s\S]*?sameAssistantScope\(session\.space_scope, resolved\.value\.scope\)[\s\S]*?if \(changesAssistant\) \{\s*selectNovaAssistantForSpace\([^\n]+\);\s*clearPreviousSession\(\);\s*\}/);
    expect(create).toContain('activeSessionIdRef.current = session.session_id');
    expect(create).toContain('setActiveSessionId(session.session_id)');
    expect(create).toContain("setActivePanel('chat')");
    expect(appSource).toContain('if (keepDraft) draftPreservedForSessionRef.current = session.session_id;');
    expect(appSource).toContain('loadDraft: !preserveDraft');
  });

  it('wires the real guarded operation to the final Sidekick startChat transport', () => {
    expect(appSource).toContain('prepareGuardedNativeChatStart(createGuardedStartInput())');
    expect(appSource).toContain('startGuardedNativeChat(');
    expect(appSource).toMatch(/startGuardedNativeChat\(\s*createGuardedStartInput\(teamworkGroundingContext\),\s*\(payload\) => \{\s*if \(nativeStopRequestedOwnerRef\.current === uiTurnOwner\) throw stoppedBeforeAcceptance;\s*if \(submission\) submission.definitelyRejected = false;\s*return window\.lastbrowser\.sidekick\.startChat\(payload\);/);
  });
});
