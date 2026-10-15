/** German UI stays German. Every other locale uses the English string. */
export function shellText(locale: string, german: string, english: string): string {
  return locale.startsWith('de') ? german : english;
}

export function readShellLocale(): string {
  try {
    const saved = globalThis.localStorage?.getItem('lastbrowser.locale');
    if (saved) return saved;
  } catch {
    // The crash screen can render before storage is available.
  }
  if (typeof document !== 'undefined' && document.documentElement.lang) return document.documentElement.lang;
  return 'en';
}
