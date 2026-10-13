import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import './password-vault-panel.css';

type Entry = { id: string; origin: string; username: string; createdAt: number };
export function PasswordVaultPanel({ profileId, compact = false }: { profileId?: string; compact?: boolean }): JSX.Element {
  const { locale } = useDesktopI18n();
  const de = locale.startsWith('de');
  const copy = (german: string, english: string) => de ? german : english;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [authorizationRequired, setAuthorizationRequired] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const profileRef = useRef(profileId);
  profileRef.current = profileId;
  const requestRef = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = (profile: string, serial: number) => mounted.current && profileRef.current === profile && requestRef.current === serial;
  async function load(): Promise<void> {
    if (!profileId) return;
    const profile = profileId, serial = ++requestRef.current;
    setBusy(true); setError('');
    try {
      const result = await window.lastbrowser.passwords.list({ profileId: profile });
      if (!current(profile, serial)) return;
      setAvailable(result.available); setAuthorizationRequired(Boolean(result.authorizationRequired)); setEntries(result.entries);
    } catch {
      if (current(profile, serial)) { setAvailable(null); setEntries([]); setError(copy('Passwortspeicher nicht erreichbar. Entsperre den Browser und versuche es erneut.', 'Password storage is unavailable. Unlock the browser and try again.')); }
    } finally { if (current(profile, serial)) setBusy(false); }
  }
  useEffect(() => {
    ++requestRef.current; setEntries([]); setAvailable(null); setAuthorizationRequired(true); setError(''); setMessage(''); setConfirmId(null); setSearch(''); setVisibleCount(50); setBusy(false);
    void load();
    return () => { ++requestRef.current; };
  }, [profileId]);
  async function openStorage(): Promise<void> {
    if (!profileId || busy) return;
    const profile = profileId, serial = ++requestRef.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const opened = await window.lastbrowser.passwords.open({ profileId: profile });
      if (!opened || !current(profile, serial)) return;
      const result = await window.lastbrowser.passwords.list({ profileId: profile });
      if (current(profile, serial)) { setAvailable(result.available); setAuthorizationRequired(Boolean(result.authorizationRequired)); setEntries(result.entries); }
    } catch { if (current(profile, serial)) setError(copy('Speicher konnte nicht geöffnet werden. Entsperre den Browser und bestätige das gewünschte Profil.', 'Could not open storage. Unlock the browser and confirm the intended profile.')); }
    finally { if (current(profile, serial)) setBusy(false); }
  }
  async function importPasswords(): Promise<void> {
    if (!profileId || busy) return;
    const profile = profileId, serial = ++requestRef.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await window.lastbrowser.passwords.importCsv({ profileId: profile });
      if (!current(profile, serial)) return;
      if (!result.cancelled) setMessage(copy(
        `${result.imported} Passwörter importiert · ${result.duplicates} bereits vorhanden · ${result.conflicts} abweichende Einträge behalten · ${result.invalid} ungültig.`,
        `${result.imported} passwords imported · ${result.duplicates} already saved · ${result.conflicts} conflicting entries kept · ${result.invalid} invalid.`));
      const list = await window.lastbrowser.passwords.list({ profileId: profile });
      if (current(profile, serial)) { setAvailable(list.available); setAuthorizationRequired(Boolean(list.authorizationRequired)); setEntries(list.entries); }
    } catch {
      if (current(profile, serial)) setError(copy('Import fehlgeschlagen. Verwende einen CSV-Export aus dem Passwortmanager deines Browsers. Bestehende Passwörter bleiben erhalten.', 'Import failed. Choose a CSV export from your browser password manager. Existing passwords are preserved.'));
    } finally { if (current(profile, serial)) setBusy(false); }
  }
  async function removePassword(id: string): Promise<void> {
    if (!profileId || busy) return;
    const profile = profileId, serial = ++requestRef.current;
    setBusy(true); setError('');
    try {
      const removed = await window.lastbrowser.passwords.remove({ profileId: profile, id });
      if (current(profile, serial)) {
        if (removed) { setEntries(items => items.filter(item => item.id !== id)); setConfirmId(null); }
        else setError(copy('Der Eintrag konnte nicht gelöscht werden. Bitte neu laden.', 'Could not delete the entry. Please reload.'));
      }
    } catch { if (current(profile, serial)) setError(copy('Löschen fehlgeschlagen.', 'Could not delete the password.')); }
    finally { if (current(profile, serial)) setBusy(false); }
  }
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = entries.filter(entry => `${entry.origin} ${entry.username}`.toLocaleLowerCase().includes(normalizedSearch));
  return <section className="password-vault-panel" aria-label={copy('Passwörter importieren und verwalten', 'Import and manage passwords')}>
    <p className="password-vault-description"><ShieldCheck size={16} aria-hidden="true" />{copy('Lokal verschlüsselt und getrennt für dieses Browserprofil gespeichert.', 'Encrypted locally and stored separately for this browser profile.')}</p>
    <p>{copy('Exportiere die Passwörter aus Chrome, Edge, Brave, Firefox oder Zen als CSV und wähle die Datei hier aus.', 'Export passwords from Chrome, Edge, Brave, Firefox or Zen as CSV, then choose the file here.')}</p>
    <div className="password-vault-toolbar">
      <button type="button" className="button button-secondary" disabled={!profileId || busy || available !== true} onClick={() => void importPasswords()}><Download size={15} aria-hidden="true" />{busy ? copy('Bitte warten …', 'Please wait …') : copy('Passwörter aus CSV importieren', 'Import passwords from CSV')}</button>
      <button type="button" className="button button-secondary" disabled={!profileId || busy} onClick={() => void load()} aria-label={copy('Passwortspeicher neu laden', 'Reload password storage')}><RefreshCw size={15} aria-hidden="true" /></button>
      {available === true && authorizationRequired && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void openStorage()}>{copy('Speicher öffnen', 'Open storage')}</button>}
      {available === true && !authorizationRequired && <span>{entries.length} {copy('gespeichert', 'saved')}</span>}
    </div>
    {available === true && authorizationRequired && <p role="status">{copy('Bestätige das Zielprofil im Browserdialog, um gespeicherte Zugänge zu sehen oder Passwörter zu importieren.', 'Confirm the destination profile in the browser dialog to view saved accounts or import passwords.')}</p>}
    {available === false && <p role="status">{copy('Die Betriebssystem-Verschlüsselung ist auf diesem Gerät nicht verfügbar. Der Import ist deaktiviert.', 'Operating system encryption is unavailable on this device. Import is disabled.')}</p>}
    {error && <p className="password-vault-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <details className="password-vault-help"><summary>{copy('So verwendest du importierte Passwörter', 'How to use imported passwords')}</summary>
      <p>{copy('Auf der passenden HTTPS-Anmeldeseite: Rechtsklick → gespeicherten Zugang auswählen. LastBrowser füllt Benutzername und Passwort nach deiner Auswahl aus und sendet das Formular nicht ab.', 'On the matching HTTPS sign-in page: right-click and choose a saved account. LastBrowser fills the username and password after your selection without submitting the form.')}</p>
      <p>{copy('Die Exportdatei enthält lesbare Passwörter. Entferne sie nach erfolgreichem Import aus deinem Downloadordner und Papierkorb, wenn du sie nicht mehr brauchst.', 'The exported file contains readable passwords. Remove it from Downloads and the recycle bin after import when you no longer need it.')}</p>
    </details>
    {!compact && available === true && !authorizationRequired && <div className="password-vault-entries">
      {!entries.length && <p>{copy('Noch keine Passwörter gespeichert.', 'No passwords saved yet.')}</p>}
      {entries.length > 0 && <label className="password-vault-search">{copy('Gespeicherte Zugänge suchen', 'Search saved accounts')}<input type="search" value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(50); }} /></label>}
      {entries.length > 0 && filtered.length === 0 && <p>{copy('Keine passenden Zugänge.', 'No matching accounts.')}</p>}
      {filtered.slice(0, visibleCount).map(entry => <div key={entry.id} className="password-vault-entry">
        <div><strong>{entry.origin}</strong><span>{entry.username || copy('Ohne Benutzername', 'No username')}</span></div>
        {confirmId === entry.id ? <div className="password-vault-confirm">
          <span>{copy('Eintrag löschen?', 'Delete entry?')}</span>
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => void removePassword(entry.id)}>{copy('Löschen', 'Delete')}</button>
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => setConfirmId(null)}>{copy('Abbrechen', 'Cancel')}</button>
        </div> : <button type="button" className="button button-secondary" disabled={busy} aria-label={copy(`Zugang für ${entry.origin} löschen`, `Delete account for ${entry.origin}`)} onClick={() => setConfirmId(entry.id)}><Trash2 size={15} aria-hidden="true" /></button>}
      </div>)}
      {filtered.length > visibleCount && <button type="button" className="button button-secondary" onClick={() => setVisibleCount(count => count + 50)}>{copy('Weitere Zugänge anzeigen', 'Show more accounts')}</button>}
    </div>}
  </section>;
}
