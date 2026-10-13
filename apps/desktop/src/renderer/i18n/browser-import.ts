export function browserImportCopy(locale: string) {
  return locale.startsWith('de') ? {
    detected: 'Windows-Standardbrowser:', unknown: 'Nicht erkannt', profile: 'Browserprofil', noProfile: 'Kein unterstütztes Profil gefunden',
    capabilities: 'Lesezeichen und Verlauf werden direkt aus dem ausgewählten Profil übernommen. Passwörter kannst du unten separat aus einer CSV-Exportdatei übernehmen. Cookies und Suchmaschinen-Einstellungen werden noch nicht importiert. Lesezeichen können alternativ als HTML/JSON importiert werden.',
    running: 'Import läuft …', done: (b: number, h: number) => `${b} Lesezeichen und ${h} Verlaufseinträge übernommen.`,
    empty: 'Keine ausgewählten Browserdaten gefunden.', failed: 'Import fehlgeschlagen. Quellbrowser schließen und erneut versuchen, oder eine Lesezeichendatei auswählen.',
    defaultPending: 'Windows-Einstellungen sind geöffnet. Wähle LastBrowser als Standard für HTTP und HTTPS; der Status wird beim Zurückkehren erneut geprüft.',
    defaultFailed: 'Windows-Standardeinstellungen konnten nicht geöffnet werden.', defaultActive: 'LastBrowser ist dein Standardbrowser.',
    defaultRecommend: 'LastBrowser ist noch nicht dein Standardbrowser. Du kannst ihn in den Windows-Einstellungen als Standard für Weblinks festlegen.'
  } : {
    detected: 'Windows default browser:', unknown: 'Not detected', profile: 'Browser profile', noProfile: 'No supported profile found',
    capabilities: 'Bookmarks and history are read from the selected profile. Passwords can be imported separately from an exported CSV file below. Cookies and search engine settings are not imported yet. Alternatively, import bookmarks from HTML/JSON.',
    running: 'Importing …', done: (b: number, h: number) => `Imported ${b} bookmarks and ${h} history entries.`,
    empty: 'No selected browser data found.', failed: 'Import failed. Close the source browser and retry, or select an exported bookmark file.',
    defaultPending: 'Windows settings are open. Choose LastBrowser for HTTP and HTTPS; its status will be checked again when you return.',
    defaultFailed: 'Could not open Windows default app settings.', defaultActive: 'LastBrowser is your default browser.',
    defaultRecommend: 'LastBrowser is not your default browser yet. You can make it the default for web links in Windows settings.'
  };
}
