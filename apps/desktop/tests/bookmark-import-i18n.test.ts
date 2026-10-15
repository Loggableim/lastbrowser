import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { browserImportCopy } from '../src/renderer/i18n/browser-import.js';

describe('bookmark file import copy', () => {
  it('keeps the German file-import messages', () => {
    const copy = browserImportCopy('de');
    expect(copy.sourceBrowser).toBe('Quell-Browser auswählen');
    expect(copy.fileImported(3)).toBe('3 Lesezeichen erfolgreich importiert!');
    expect(copy.fileEmpty).toBe('Keine gültigen Lesezeichen in der Datei gefunden.');
    expect(copy.fileReadError).toBe('Fehler beim Einlesen der Lesezeichendatei.');
  });

  it('uses English file-import messages outside German', () => {
    const copy = browserImportCopy('en');
    expect(copy.sourceBrowser).toBe('Choose source browser');
    expect(copy.fileImported(3)).toBe('Imported 3 bookmarks.');
    expect(copy.fileEmpty).toBe('No valid bookmarks found in the file.');
    expect(copy.fileReadError).toBe('Could not read the bookmark file.');
    expect(browserImportCopy('fr').fileEmpty).toBe(copy.fileEmpty);
  });

  it('wires the file import path through browserImportCopy', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/renderer/components/FirstRunSetupPane.tsx'), 'utf8');
    expect(source).toContain('importCopy.fileImported(imported.length)');
    expect(source).toContain('importCopy.fileEmpty');
    expect(source).toContain('importCopy.fileReadError');
    expect(source).toContain('aria-label={importCopy.sourceBrowser}');
    expect(source).not.toContain('Lesezeichen erfolgreich importiert!');
    expect(source).not.toContain('Quell-Browser auswählen');
  });
});
