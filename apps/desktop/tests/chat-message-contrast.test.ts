import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(__dirname, '../src/renderer/styles.css'), 'utf8');
const appearance = readFileSync(resolve(__dirname, '../src/renderer/appearance.css'), 'utf8');
const richText = readFileSync(resolve(__dirname, '../src/renderer/NativeRichText.tsx'), 'utf8');

function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start < 0) return '';
  const end = styles.indexOf('}', start);
  return styles.slice(start, end < 0 ? undefined : end + 1);
}

describe('native chat message contrast', () => {
  it('sets a foreground on the plain-text renderer container and its paragraphs', () => {
    expect(richText).toContain('className="rich-text-renderer"');
    expect(rule('.message-body .rich-text-renderer')).toContain('color: var(--lb-chat-message-text)');
    expect(rule('.message-body .rich-text-renderer')).not.toContain('font-size:');
    expect(rule('.message-body .chat-reasoning-details')).toContain('color: var(--lb-chat-message-text)');
    expect(rule('.message-body p')).toContain('color: var(--lb-chat-message-text)');
    expect(rule('.message-body p')).toContain('font-size: 14px');
    expect(rule('.message-body p')).toContain('line-height: 1.55');
  });

  it('pairs dark, light, and OLED bubbles with matching text and surfaces', () => {
    const dark = rule(':root');
    const light = rule('html.theme-light');
    const oled = rule('html.theme-oled');

    expect(dark).toContain('--lb-chat-message-bg: rgba(255, 255, 255, .055)');
    expect(dark).toContain('--lb-chat-message-text: rgba(248, 251, 255, .9)');
    expect(light).toContain('--lb-chat-message-bg: rgba(255, 255, 255, .94)');
    expect(light).toContain('--lb-chat-message-text: #0c1624');
    expect(oled).toContain('--lb-chat-message-bg: #0f131a');
    expect(oled).toContain('--lb-chat-message-text: #ffffff');
  });

  it('themes structured cards and chips while keeping code previews dark', () => {
    expect(styles).toContain('.message-body .chat-structured-header strong');
    expect(styles).toContain('color: var(--lb-chat-message-label)');
    expect(rule('.chat-chip-row span')).toContain('color: var(--lb-chat-chip-text)');
    expect(rule('.message-body .chat-result-card')).toContain('background: var(--lb-chat-structured-bg)');
    expect(rule('.message-body .chat-html-preview')).toContain('color: var(--lb-chat-code-text)');
    expect(styles).toContain('--lb-chat-chip-text: #0c1624');
    expect(styles).toMatch(/\.message-body \.rich-text-renderer a\s*\{[^}]*color: var\(--lb-chat-link-text\)/s);
    expect(styles).toMatch(/\.message-body \.tab-citation-pill\s*\{[^}]*color: var\(--lb-chat-link-text\) !important;[^}]*background: var\(--lb-chat-chip-bg\) !important/s);
    expect(styles).toMatch(/\.copilot-bubble \.rich-text-renderer a\s*\{[^}]*color: #4fd4ff/s);
  });

  it('keeps the later bubbles-layout user override on the light chat surface', () => {
    expect(appearance).toMatch(/html\[data-message-layout="bubbles"\] \.chat-message\.user \.message-body\s*\{[^}]*background:\s*var\(--lb-chat-user-message-bg/s);
    expect(appearance).toMatch(/html\[data-message-layout="bubbles"\] \.chat-message\.user \.message-body\s*\{[^}]*border-color:\s*var\(--lb-chat-user-message-border/s);
    expect(rule('html.theme-light')).toContain('--lb-chat-user-message-bg: #e1f4ff');
  });

  it('keeps Copilot message foregrounds paired with its intentionally dark panel in every layout', () => {
    const copilotOverrides = styles.slice(styles.lastIndexOf('/* The Copilot split panel'));
    for (const layout of ['bubbles', 'expanded']) {
      expect(copilotOverrides).toContain(`html[data-message-layout="${layout}"] .copilot-bubble.assistant`);
      expect(copilotOverrides).toContain(`html[data-message-layout="${layout}"] .copilot-bubble.user`);
    }
    expect(copilotOverrides).toContain('background: rgba(16, 24, 48, 0.85)');
    expect(copilotOverrides).toContain('color: rgba(232, 242, 255, 0.9)');
    expect(copilotOverrides).toContain('background: rgba(14, 165, 233, 0.14)');
    expect(copilotOverrides).toContain('color: #ffffff');
    expect(styles).toMatch(/\.copilot-bubble\.assistant\s*\{[^}]*color:\s*rgba\(232, 242, 255, 0\.9\)/s);
    expect(styles).toMatch(/\.copilot-bubble\.user\s*\{[^}]*color:\s*#ffffff/s);
  });

  it('keeps native code, citations, and activity metadata readable on light message surfaces', () => {
    expect(styles).toMatch(/\.message-body \.rich-code-block pre\s*\{[^}]*background: #07111f/s);
    expect(styles).toMatch(/\.message-body \.rich-code-block code,\s*\.message-body \.rich-code-header\s*\{[^}]*color: var\(--lb-chat-code-text\)/s);
    expect(styles).toMatch(/\.message-body \.rich-code-header \.rich-code-copy\s*\{[^}]*color: var\(--lb-chat-code-text\)/s);
    expect(styles).toMatch(/\.message-body \.chat-turn-usage\s*\{[^}]*color: var\(--lb-chat-message-meta\)/s);
    expect(styles).toMatch(/\.message-body \.chat-activity-details,\s*\.message-body \.chat-tool-call-details\s*\{[^}]*color: var\(--lb-chat-message-text\)/s);
    expect(styles).toMatch(/\.message-body \.chat-activity-details > summary,\s*\.message-body \.chat-tool-call-details > summary\s*\{[^}]*color: var\(--lb-chat-message-meta\)/s);
  });
});
