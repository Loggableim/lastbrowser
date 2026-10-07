import { describe, expect, it } from 'vitest';
import { releaseNotesBetween } from '../src/renderer/release-notes.js';

describe('offline versioned release notes', () => {
  it('returns localized notes only for versions inside the upgrade range', () => {
    const notes = releaseNotesBetween({ fromVersion: '0.1.45', toVersion: '0.1.46' }, 'de');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ version: '0.1.46' });
    expect(notes[0].changes[0]).toContain('Zen- und Fokusmodus');
  });

  it('covers a multi-version jump with the available current release notes', () => {
    const notes = releaseNotesBetween({ fromVersion: '0.1.42', toVersion: '0.1.46' }, 'en');
    expect(notes.map((entry) => entry.version)).toEqual(['0.1.46']);
    expect(notes[0].changes).toContain('Fixed Quickchat startup on Windows.');
  });

  it('shows notes for the confirmed target when the original version is unknown', () => {
    expect(releaseNotesBetween({ fromVersion: null, toVersion: '0.1.46' }, 'de')).toHaveLength(1);
  });

  it('does not fabricate notes for an unknown or non-upgrade range', () => {
    expect(releaseNotesBetween({ fromVersion: '0.1.46', toVersion: '0.1.45' }, 'en')).toEqual([]);
    expect(releaseNotesBetween({ fromVersion: 'unknown', toVersion: '0.1.46' }, 'en')).toEqual([]);
    expect(releaseNotesBetween({ fromVersion: '0.1.48', toVersion: '0.1.49' }, 'en')).toEqual([]);
  });

  it('shows only the new localized notes for a 0.1.46 to 0.1.47 upgrade', () => {
    const notes = releaseNotesBetween({ fromVersion: '0.1.46', toVersion: '0.1.47' }, 'de');
    expect(notes.map(entry => entry.version)).toEqual(['0.1.47']);
    expect(notes[0].changes[0]).toContain('ausgewählten Space');
  });

  it('includes only 0.1.48 changes for an upgrade from 0.1.47 in every UI language', () => {
    for (const locale of ['en', 'de', 'it', 'es', 'fr', 'pt-BR', 'ru', 'ja'] as const) {
      const notes = releaseNotesBetween({ fromVersion: '0.1.47', toVersion: '0.1.48' }, locale);
      expect(notes.map(entry => entry.version)).toEqual(['0.1.48']);
      expect(notes[0].changes).toHaveLength(5);
      expect(notes[0].changes.every(change => change.trim().length > 0)).toBe(true);
    }
  });
});
