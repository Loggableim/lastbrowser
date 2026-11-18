import { describe, expect, it } from 'vitest';
import { desktopLocaleIds } from '../src/renderer/i18n/keys.js';
import { bundledNovaAssistants } from '../src/renderer/nova-assistant-templates.js';

describe('bundled Nova assistant roles', () => {
  it('preserves the ten established choices with distinct stable identities across locales', () => {
    const english = bundledNovaAssistants('en');
    expect(english.map(({ name }) => name)).toEqual([
      'Developer Agent', 'Project Manager', 'Social Media Manager', 'Research Agent',
      'System Administrator', 'Data Analyst', 'DevOps Engineer', 'Mentor', 'Friend', 'Creative Writer',
    ]);
    const identities = english.map(({ id }) => id);
    expect(new Set(identities).size).toBe(10);
    expect(identities.every(id => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(id))).toBe(true);
    for (const locale of desktopLocaleIds) {
      const assistants = bundledNovaAssistants(locale);
      expect(assistants.map(({ id }) => id)).toEqual(identities);
      expect(assistants.every(({ instructions }) => instructions.trim().length > 0)).toBe(true);
    }
    expect(bundledNovaAssistants('de').map(({ name }) => name)).toEqual(expect.arrayContaining(['Projektmanager', 'Freund']));
  });
});
