import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveChatHeaderStatus } from '../src/renderer/chat-header-status.js';
import { chatHeaderCopy } from '../src/renderer/i18n/chat-header-copy.js';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';

const readRenderer = (file: string) => fs.readFileSync(path.resolve(__dirname, '../src/renderer', file), 'utf8');

describe('compact native chat header', () => {
  it('keeps unknown, ready, starting, and unavailable runtime states distinct', () => {
    expect(resolveChatHeaderStatus(null)).toBe('unknown');
    expect(resolveChatHeaderStatus({ sidekick: 'ready', webuiHealth: 'ready', webuiUrl: 'http://127.0.0.1' })).toBe('ready');
    expect(resolveChatHeaderStatus({ sidekick: 'starting' })).toBe('starting');
    expect(resolveChatHeaderStatus({ sidekick: 'error' })).toBe('unavailable');
  });

  it('has translated overflow and status labels in every current locale', () => {
    for (const locale of desktopLocaleIds) {
      expect(chatHeaderCopy[locale].moreActions, locale).toBeTruthy();
      for (const state of ['unknown', 'ready', 'starting', 'unavailable'] as const) {
        expect(chatHeaderCopy[locale].status[state], `${locale}.${state}`).toBeTruthy();
      }
    }
  });

  it('keeps secondary actions in an accessible menu and adapts the header to narrow screens', () => {
    const component = readRenderer('panels/NativeChatMain.tsx');
    const styles = readRenderer('panels/native-chat-header.css');
    expect(component).toContain('aria-controls="native-chat-actions-menu"');
    expect(component).toContain("if (event.key === 'Escape')");
    expect(component).toContain('onPointerDown');
    expect(component).toContain('<CompressButton activeSessionId={activeSessionId}');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('.native-chat-status.unknown');
  });

  it('keeps mode, tab context, and model visible while collapsing reasoning controls', () => {
    const composer = readRenderer('panels/ChatComponents.tsx');
    const styles = readRenderer('panels/chat-composer.css');
    expect(composer).toContain('className="composer-mode"');
    expect(composer).toContain('aria-pressed={isTabsActive}');
    expect(composer).toContain('className="composer-model"');
    expect(composer).toContain('className="composer-more-options"');
    expect(composer).toContain('onChange={onReasoningEffort}');
    expect(styles).toContain('@media (max-width: 760px)');
  });
});
