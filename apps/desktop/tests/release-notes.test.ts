import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  parseReleaseNotes,
  readLastSeenReleaseVersion,
  releaseNotesStorageKey,
  resolveReleaseNotesUpdate,
  selectReleaseNotesBetween,
  writeLastSeenReleaseVersion
} from '../src/renderer/release-notes.js';
import { ReleaseNotesDialog } from '../src/renderer/components/ReleaseNotesDialog.js';
import {
  DesktopI18nProvider,
  createDesktopI18n,
  resolveDesktopLocale
} from '../src/renderer/i18n.js';

const fixture = `# Fixture changelog

Intro text that must be ignored.

## [0.2.0] - 2026-10-19

### Highlights
- **Major** feature with \`inline code\` and a [link](https://example.com).
  - Nested detail stays visible.
- Second highlight.

### Verification
- Internal verification text must not reach the dialog.

## [0.1.9] - 2026-10-18

### Fixes
- Daily beta patch one.

## [0.1.8] - 2026-10-17

### Fixes
- Older patch outside the update window.
`;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

describe('release notes parsing and version selection', () => {
  it('parses changelog entries, sections, and plain-text bullets', () => {
    const entries = parseReleaseNotes(fixture);
    expect(entries.map((entry) => entry.version)).toEqual(['0.2.0', '0.1.9', '0.1.8']);
    expect(entries[0].date).toBe('2026-10-19');
    expect(entries[0].sections.map((section) => section.title)).toEqual(['Highlights', 'Verification']);
    expect(entries[0].sections[0].items).toEqual([
      'Major feature with inline code and a link.',
      'Nested detail stays visible.',
      'Second highlight.'
    ]);
  });

  it('compares semantic versions numerically', () => {
    expect(compareVersions('0.1.9', '0.1.10')).toBeLessThan(0);
    expect(compareVersions('v0.2.0', '0.1.99')).toBeGreaterThan(0);
    expect(compareVersions('0.1.44', '0.1.44')).toBe(0);
    expect(compareVersions('not-a-version', '0.1.44')).toBe(0);
  });

  it('selects only entries introduced by the version change, newest first', () => {
    const entries = parseReleaseNotes(fixture);
    expect(selectReleaseNotesBetween(entries, '0.1.8', '0.2.0').map((entry) => entry.version)).toEqual(['0.2.0', '0.1.9']);
    expect(selectReleaseNotesBetween(entries, '0.1.9', '0.2.0').map((entry) => entry.version)).toEqual(['0.2.0']);
    expect(selectReleaseNotesBetween(entries, '0.2.0', '0.2.0')).toEqual([]);
    expect(selectReleaseNotesBetween(entries, '0.2.0', '0.1.9')).toEqual([]);
  });

  it('skips the dialog on a first run and after an unchanged version', () => {
    const entries = parseReleaseNotes(fixture);
    expect(resolveReleaseNotesUpdate({ entries, storedVersion: null, currentVersion: '0.2.0' })).toMatchObject({
      show: false,
      fromVersion: null,
      entries: []
    });
    expect(resolveReleaseNotesUpdate({ entries, storedVersion: '0.2.0', currentVersion: '0.2.0' }).show).toBe(false);
  });

  it('shows the patches since the previously used version', () => {
    const entries = parseReleaseNotes(fixture);
    const update = resolveReleaseNotesUpdate({ entries, storedVersion: '0.1.8', currentVersion: '0.2.0' });
    expect(update.show).toBe(true);
    expect(update.fromVersion).toBe('0.1.8');
    expect(update.toVersion).toBe('0.2.0');
    expect(update.entries.map((entry) => entry.version)).toEqual(['0.2.0', '0.1.9']);
  });

  it('persists the last seen release and tolerates unavailable storage', () => {
    const storage = memoryStorage();
    expect(readLastSeenReleaseVersion(storage)).toBeNull();
    expect(writeLastSeenReleaseVersion(storage, '0.2.0')).toBe(true);
    expect(readLastSeenReleaseVersion(storage)).toBe('0.2.0');
    expect([...storage.values.keys()]).toEqual([releaseNotesStorageKey]);
    expect(writeLastSeenReleaseVersion(storage, 'invalid')).toBe(false);

    const restricted = {
      getItem: () => { throw new Error('restricted'); },
      setItem: () => { throw new Error('quota'); }
    };
    expect(readLastSeenReleaseVersion(restricted)).toBeNull();
    expect(writeLastSeenReleaseVersion(restricted, '0.2.0')).toBe(false);
  });

  it('keeps the repository changelog parseable and covers the current version', () => {
    const changelog = readFileSync(resolve(__dirname, '../../../CHANGELOG.md'), 'utf8');
    const entries = parseReleaseNotes(changelog);
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.some((entry) => entry.version === '0.1.44')).toBe(true);
  });
});

describe('release notes dialog fixture', () => {
  it('renders an accessible dialog with the patches since the last release', () => {
    const entries = selectReleaseNotesBetween(parseReleaseNotes(fixture), '0.1.8', '0.2.0');
    const markup = renderToStaticMarkup(
      React.createElement(DesktopI18nProvider, null,
        React.createElement(ReleaseNotesDialog, {
          open: true,
          fromVersion: '0.1.8',
          toVersion: '0.2.0',
          entries,
          onClose: () => undefined
        })
      )
    );
    const browserLocale = resolveDesktopLocale({ browserLanguage: typeof navigator !== 'undefined' ? navigator.language : 'en' });
    const localized = createDesktopI18n(browserLocale);
    const escapedTitle = localized.t('browser.chrome.releaseNotesTitle').replace(/'/g, '&#x27;');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-labelledby="release-notes-title"');
    expect(markup).toContain(escapedTitle);
    expect(markup).toContain(localized.t('browser.chrome.releaseNotesSince', { version: '0.1.8' }));
    expect(markup).toContain('0.1.9');
    expect(markup).toContain('Daily beta patch one.');
    expect(markup).toContain('Major feature with inline code and a link.');
    expect(markup).not.toContain('Internal verification text');
    expect(markup).not.toContain('Older patch outside the update window.');
  });

  it('renders nothing while closed', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DesktopI18nProvider, null,
        React.createElement(ReleaseNotesDialog, {
          open: false,
          fromVersion: '0.1.8',
          toVersion: '0.2.0',
          entries: parseReleaseNotes(fixture),
          onClose: () => undefined
        })
      )
    );
    expect(markup).toBe('');
  });
});
