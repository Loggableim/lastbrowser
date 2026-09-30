import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { desktopLocaleIds, desktopLocaleOverrides } from '../src/renderer/i18n.js';

const sourcePath = path.resolve(process.cwd(), 'src/renderer/panels/AgentPanels.tsx');

describe('AgentPanels localization wiring', () => {
  const source = readFileSync(sourcePath, 'utf8');

  it('uses the shared desktop translation context in every native panel', () => {
    expect(source).toContain("import { useDesktopI18n } from '../i18n.js';");
    for (const component of ['NativeSkillsMain', 'NativeAgentsMain', 'NativeProfilesMain', 'NativeMemoryMain']) {
      const start = source.indexOf(`export function ${component}`);
      expect(start, `${component} exists`).toBeGreaterThanOrEqual(0);
      const nextComponent = source.indexOf('\nexport function ', start + 1);
      const body = source.slice(start, nextComponent < 0 ? undefined : nextComponent);
      expect(body, `${component} uses translated copy`).toMatch(/const \{ t \} = useDesktopI18n\(\);/);
    }
  });

  it('provides every AgentPanels translation referenced by the renderer in all locales', () => {
    const referenced = new Set(
      [...source.matchAll(/t\('(agentPanels\.[^']+)'/g)].map((match) => match[1])
    );
    expect(referenced.size).toBeGreaterThan(50);

    for (const locale of desktopLocaleIds) {
      const catalog = desktopLocaleOverrides[locale];
      for (const key of referenced) {
        const value = catalog[key as keyof typeof catalog];
        expect(value?.trim(), `${locale}.${key} is translated`).toBeTruthy();
        expect(value, `${locale}.${key} does not expose its key`).not.toBe(key);
        const englishParams = [...(desktopLocaleOverrides.en[key as keyof typeof desktopLocaleOverrides.en] || '').matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        const localeParams = [...(value || '').matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        expect(localeParams, `${locale}.${key} interpolation parameters`).toEqual(englishParams);
      }
    }
  });

  it('keeps the previously hardcoded user-facing labels on translation paths', () => {
    for (const literal of [
      'Search skills...', 'No skills found.', 'Sidekick is starting.', 'Message agent...',
      'Workspace Terminal', 'Terminal events will appear here.', 'Search memory...',
      'Supermemory ist noch nicht konfiguriert.', 'Neues Profil', 'Dieses Profil aktivieren',
      'Bereit für Agenten-Sessions', 'ACTIVE PROFILE', 'TOTAL PROFILES', 'Gateway Architektur'
    ]) {
      expect(source, `${literal} should not be hardcoded in AgentPanels`).not.toContain(literal);
    }
  });

  it('renders skill category objects by their display field instead of coercing them to object text', () => {
    expect(source).toContain('normalizeSkillCategories(skillsState.data?.categories)');
    expect(source).toContain('normalizeSkillCategory(skill.category)');
    expect(source).not.toContain('text(selectedSkill?.category)');
  });
});
