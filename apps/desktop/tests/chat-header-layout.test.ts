import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';

const renderer = (file: string) => readFileSync(path.resolve(process.cwd(), 'src/renderer', file), 'utf8').replace(/\r\n/g, '\n');

describe('compact native chat header contract', () => {
  it('keeps existing chat actions and puts secondary actions in the accessible overflow', () => {
    const source = renderer('panels/NativeChatMain.tsx');
    expect(source).toContain('brandAssets.sidekickAvatar');
    expect(source).toContain('onClick={onCreateSession}');
    expect(source).toContain('setShowControlCenter(true)');
    expect(source).toContain('setShowDeveloperTools((current) => !current)');
    expect(source).toContain('<CompressButton activeSessionId={activeSessionId}');
    expect(source).toContain('aria-controls="native-chat-actions-menu"');
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain('onPointerDown');
  });

  it('uses translated status labels for every locale and has a neutral unknown state', () => {
    for (const locale of desktopLocaleIds) {
      for (const key of ['chat.header.moreActions', 'chat.header.status.unknown', 'chat.header.status.ready', 'chat.header.status.starting', 'chat.header.status.unavailable'] as const) {
        expect(desktopLocaleOverrides[locale][key], `${locale}.${key}`).toBeTruthy();
      }
    }
    const css = renderer('styles.css');
    expect(css).toContain('.native-chat-status .status-dot {');
    expect(css).toContain('.native-chat-status.ready .status-dot');
    expect(css).not.toMatch(/\.native-chat-status\.unknown[^}]*green/i);
  });

  it('uses the selected accent token and provides narrow viewport layout rules', () => {
    const css = renderer('styles.css');
    const start = css.indexOf('.native-chat-header {');
    const end = css.indexOf('.chat-transcript {', start);
    const headerCss = css.slice(start, end);
    expect(headerCss).toContain('var(--lb-accent)');
    expect(headerCss).toContain('@media (max-width: 760px)');
    expect(headerCss).toContain('@media (max-width: 420px)');
    expect(headerCss).toContain('border-radius: 7px');
  });
});
