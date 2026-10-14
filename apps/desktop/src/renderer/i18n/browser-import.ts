export function browserImportCopy(locale: string) {
  return locale.startsWith('de') ? {
    detected: 'Windows-Standardbrowser:', unknown: 'Nicht erkannt', profile: 'Browserprofil', noProfile: 'Kein unterstütztes Profil gefunden',
    capabilities: 'Wähle ein Browserprofil und die verfügbaren Datenarten. Passwörter werden separat aus einem bewusst erstellten CSV-Export in den verschlüsselten Passwortspeicher übernommen.',
    installed: 'Profil gefunden', notInstalled: 'Kein lokales Profil gefunden', discovering: 'Profile werden gesucht …', defaultTag: 'Standardbrowser',
    browserFoundNoProfile: 'Browser gefunden · kein lesbares Profil',
    passwords: 'Passwörter (CSV-Export)', passwordHelp: (family: string) => family === 'firefox' || family === 'gecko'
      ? 'Öffne die Passwortverwaltung im Quellbrowser, wähle Passwörter exportieren und speichere die CSV-Datei. Wähle sie anschließend im Passwortspeicher unten aus.'
      : 'Öffne den Passwortmanager im Quellbrowser und exportiere deine gespeicherten Passwörter als CSV. Wähle diese Datei anschließend im Passwortspeicher unten aus.',
    passwordBoundary: 'Passwörter werden nicht direkt aus der verschlüsselten Datenbank eines anderen Browsers ausgelesen. Den Export bestätigst du im Quellbrowser.',
    unsupported: 'Noch kein Importziel in LastBrowser:', unsupportedTypes: 'Cookies, aktive Anmeldungen, Autofill-Adressen, Zahlungsdaten, Erweiterungsdaten und sonstige Browser-Einstellungen.',
    noDirectData: 'Für dieses Profil wurden keine direkt importierbaren Daten gefunden. Du kannst weiterhin eine exportierte Lesezeichen- oder Passwortdatei auswählen.',
    warnings: 'Hinweise zum Import',
    discoveryFailed: 'Browserprofile konnten nicht ermittelt werden. Ein Datei-Export ist weiterhin möglich.',
    truncated: 'Der Import hat eine Verarbeitungsgrenze erreicht. Es wurden nicht alle Quelldaten übernommen; beachte die Angaben unten.',
    running: 'Import läuft …', done: (b: number, h: number) => `${b} Lesezeichen und ${h} Verlaufseinträge übernommen.`,
    empty: 'Keine ausgewählten Browserdaten gefunden.', failed: 'Import fehlgeschlagen. Quellbrowser schließen und erneut versuchen, oder eine Lesezeichendatei auswählen.',
    defaultPending: 'Windows-Einstellungen sind geöffnet. Wähle LastBrowser als Standard für HTTP und HTTPS; der Status wird beim Zurückkehren erneut geprüft.',
    defaultFailed: 'Windows-Standardeinstellungen konnten nicht geöffnet werden.', defaultActive: 'LastBrowser ist dein Standardbrowser.',
    defaultRecommend: 'LastBrowser ist noch nicht dein Standardbrowser. Du kannst ihn in den Windows-Einstellungen als Standard für Weblinks festlegen.'
  } : {
    detected: 'Windows default browser:', unknown: 'Not detected', profile: 'Browser profile', noProfile: 'No supported profile found',
    capabilities: 'Select a browser profile and its available data types. Passwords are imported separately from an explicitly exported CSV file into the encrypted password vault.',
    installed: 'Profile found', notInstalled: 'No local profile found', discovering: 'Looking for profiles …', defaultTag: 'Default browser',
    browserFoundNoProfile: 'Browser found · no readable profile',
    passwords: 'Passwords (CSV export)', passwordHelp: (family: string) => family === 'firefox' || family === 'gecko'
      ? 'Open the source browser’s password manager, choose to export passwords and save the CSV file. Then select it in the password vault below.'
      : 'Open the source browser’s password manager and export saved passwords as CSV. Then select that file in the password vault below.',
    passwordBoundary: 'Passwords are not read directly from another browser’s encrypted database. You confirm the export in the source browser.',
    unsupported: 'No LastBrowser import destination yet:', unsupportedTypes: 'Cookies, active logins, autofill addresses, payment data, extension data and other browser preferences.',
    noDirectData: 'No directly importable data was found for this profile. You can still select an exported bookmark or password file.',
    warnings: 'Import notes',
    discoveryFailed: 'Browser profiles could not be detected. File export remains available.',
    truncated: 'The import reached a processing limit. Not all source data was imported; see the details below.',
    running: 'Importing …', done: (b: number, h: number) => `Imported ${b} bookmarks and ${h} history entries.`,
    empty: 'No selected browser data found.', failed: 'Import failed. Close the source browser and retry, or select an exported bookmark file.',
    defaultPending: 'Windows settings are open. Choose LastBrowser for HTTP and HTTPS; its status will be checked again when you return.',
    defaultFailed: 'Could not open Windows default app settings.', defaultActive: 'LastBrowser is your default browser.',
    defaultRecommend: 'LastBrowser is not your default browser yet. You can make it the default for web links in Windows settings.'
  };
}
