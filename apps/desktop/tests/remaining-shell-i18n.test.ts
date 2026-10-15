import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readShellLocale, shellText } from '../src/renderer/i18n/shell-text.js';

const renderer = (name: string) => readFileSync(resolve(__dirname, '../src/renderer', name), 'utf8');

describe('remaining shell copy', () => {
  it('keeps German on de and uses English for en_US', () => {
    const german = 'Kante berühren, um Seitenleiste einzublenden';
    const english = 'Touch the edge to show the sidebar';
    expect(shellText('de', german, english)).toBe(german);
    expect(shellText('de-DE', german, english)).toBe(german);
    expect(shellText('en', german, english)).toBe(english);
    expect(shellText('en-US', german, english)).toBe(english);
  });

  it('reads the saved shell locale before the document language', () => {
    const values = new Map<string, string>([['lastbrowser.locale', 'de']]);
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (key: string) => values.get(key) ?? null }
    });
    try {
      expect(readShellLocale()).toBe('de');
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it('routes the zen edge and crash screen through shell copy', () => {
    const app = renderer('App.tsx');
    const main = renderer('main.tsx');
    const dock = renderer('components/NovaDock.tsx');
    expect(app).toContain('shellText(locale, "Kante berühren, um Seitenleiste einzublenden", "Touch the edge to show the sidebar")');
    expect(app).not.toContain('title="Kante berühren, um Seitenleiste einzublenden"');
    expect(main).toContain("shellText(locale, 'Unerwarteter Anzeigefehler', 'Unexpected display error')");
    expect(dock).toContain('shellText(locale, "App anheften", "Pin an app")');
  });
});
