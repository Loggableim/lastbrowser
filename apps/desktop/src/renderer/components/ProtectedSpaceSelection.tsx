import { useEffect, useState, type FormEvent } from 'react';
import { loadBookmarks } from '../bookmarks.js';
import { splitProtectedSpacePair } from '../space-renderer-migration.js';
import type { SpaceMigrationPrerequisite } from '../../main/windows-space-runtime.js';
import type { SpaceProtection } from '../../main/active-space-config.js';

type Choice = { spaceId: string; name: string; profileId: string; spacePath: string; sessionKey: string };

export function ProtectedSpaceSelection({ german }: { german: boolean }) {
  const [spaces, setSpaces] = useState<Choice[] | null>(null);
  const [unavailable, setUnavailable] = useState<SpaceMigrationPrerequisite | null>('runtime');
  const [hardwareUnavailable, setHardwareUnavailable] = useState<SpaceMigrationPrerequisite | null>('runtime');
  const [protection, setProtection] = useState<SpaceProtection>('local');
  const restriction = protection === 'local' ? unavailable : hardwareUnavailable;
  const available = restriction === null;
  const [primary, setPrimary] = useState('');
  const [decoy, setDecoy] = useState('');
  const [status, setStatus] = useState<'submitting' | 'invalid' | 'passwords' | null>(null);
  const t = (de: string, en: string) => german ? de : en;

  useEffect(() => {
    let cancelled = false;
    window.lastbrowser?.protectedSpaceSelection?.().then(result => {
      if (!cancelled && result && 'spaces' in result) {
        setUnavailable(result.unavailable);
        setHardwareUnavailable(result.hardwareUnavailable);
        setSpaces(result.spaces);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const primarySpace = spaces?.find(space => space.spaceId === primary);
    const decoySpace = spaces?.find(space => space.spaceId === decoy);
    if (!available || !primarySpace || !decoySpace || status === 'submitting') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const primaryInput = form.elements.namedItem('primaryPassword') as HTMLInputElement;
    const emergencyInput = form.elements.namedItem('emergencyPassword') as HTMLInputElement;
    if (!primaryInput.value || !emergencyInput.value || primaryInput.value === emergencyInput.value) {
      setStatus('passwords');
      return;
    }
    const encoder = new TextEncoder();
    const primaryBytes = encoder.encode(primaryInput.value);
    const emergencyBytes = encoder.encode(emergencyInput.value);
    primaryInput.value = emergencyInput.value = '';
    data.delete('primaryPassword');
    data.delete('emergencyPassword');
    setStatus('submitting');
    try {
      const { rendererSeeds, legacyUpdates, expectedLegacyValues } = splitProtectedSpacePair(window.localStorage,
        { ...primarySpace, bookmarkIds: data.getAll('primaryBookmarks').map(String) },
        { ...decoySpace, bookmarkIds: data.getAll('decoyBookmarks').map(String) });
      const started = await window.lastbrowser.configureProtectedSpaces?.({
        primarySpaceId: primary, decoySpaceId: decoy, protection, rendererSeeds,
        rendererStore: { legacyUpdates, expectedLegacyValues }
      }, primaryBytes, emergencyBytes);
      if (!started) setStatus('invalid');
    } catch {
      setStatus('invalid');
    } finally {
      primaryBytes.fill(0);
      emergencyBytes.fill(0);
    }
  }

  if (!spaces || spaces.length < 2) return null;
  function select(label: string, value: string, excluded: string, change: (value: string) => void) {
    return (
      <label>
        <span>{label}</span>
        <select value={value} disabled={!available || status === 'submitting'} onChange={event => {
          change(event.target.value);
          setStatus(null);
        }}>
          <option value="">{t('Space auswählen', 'Select a Space')}</option>
          {spaces?.filter(space => space.spaceId !== excluded).map(space => (
            <option key={space.spaceId} value={space.spaceId}>{space.name}</option>
          ))}
        </select>
      </label>
    );
  }

  const bookmarks = loadBookmarks();
  const prerequisites = {
    runtime: t('Die Windows-Komponenten für die Space-Verschlüsselung sind nicht verfügbar.', 'The Windows components for Space encryption are unavailable.'),
    portable: t('Verwende zur Einrichtung der Space-Verschlüsselung die installierte Windows-Version.', 'Use the installed Windows version to set up Space encryption.'),
    winfsp: t('Die Space-Verschlüsselung benötigt einen verfügbaren WinFsp-Treiber.', 'Space encryption requires an available WinFsp driver.'),
    tpm: t('Der hardwaregestützte Modus benötigt ein verfügbares TPM 2.0.', 'Hardware-backed protection requires an available TPM 2.0.'),
    'tpm-owner': t('Windows stellt die TPM-Berechtigung für die Einrichtung nicht bereit.', 'Windows is not providing the TPM authorization needed for setup.')
  };
  return (
    <form className="settings-field-grid" aria-label={t('Space-Verschlüsselung', 'Space encryption')} onSubmit={event => void configure(event)}>
      <label>
        <span>{t('Schlüsselschutz', 'Key protection')}</span>
        <select value={protection} disabled={status === 'submitting'} onChange={event => {
          setProtection(event.target.value === 'tpm' ? 'tpm' : 'local');
          setStatus(null);
        }}>
          <option value="local">{t('Lokal verschlüsselt', 'Local encryption')}</option>
          <option value="tpm">{t('Hardwaregestützt (TPM 2.0)', 'Hardware-backed (TPM 2.0)')}</option>
        </select>
      </label>
      {select(t('Hauptspace', 'Primary Space'), primary, decoy, setPrimary)}
      {select(t('Tarnspace', 'Decoy Space'), decoy, primary, setDecoy)}
      {available && <>
        <label>{t('Hauptpasswort', 'Primary password')}<input name="primaryPassword" type="password" autoComplete="new-password" required /></label>
        <label>{t('Notfallpasswort', 'Emergency password')}<input name="emergencyPassword" type="password" autoComplete="new-password" required /></label>
        {bookmarks.length > 0 && <>
          <label>{t('Lesezeichen für den Hauptspace', 'Primary Space bookmarks')}
            <select name="primaryBookmarks" multiple>{bookmarks.map(bookmark => <option key={bookmark.id} value={bookmark.id}>{bookmark.title}</option>)}</select>
          </label>
          <label>{t('Lesezeichen für den Tarnspace', 'Decoy Space bookmarks')}
            <select name="decoyBookmarks" multiple>{bookmarks.map(bookmark => <option key={bookmark.id} value={bookmark.id}>{bookmark.title}</option>)}</select>
          </label>
        </>}
        <p>{protection === 'local'
          ? t('Das Notfallpasswort löscht den aktuellen lokalen Hauptschlüssel und öffnet den Tarnspace. Alte vollständige Backups bleiben mit dem Hauptpasswort entschlüsselbar.',
            'The emergency password deletes the current local primary key and opens the decoy Space. Old complete backups remain decryptable with the primary password.')
          : t('Das Notfallpasswort widerruft den TPM-Schlüssel des Hauptspaces und öffnet den Tarnspace.',
            'The emergency password revokes the primary Space TPM key and opens the decoy Space.')}</p>
        <p>{t('LastBrowser startet für die Einrichtung neu.', 'LastBrowser restarts to finish setup.')}</p>
        <button className="button button-secondary" type="submit" disabled={!primary || !decoy || status === 'submitting'}>
          {t('Verschlüsselung einrichten', 'Set up encryption')}
        </button>
      </>}
      {restriction && <p role="status">{prerequisites[restriction]}</p>}
      {status === 'submitting' && <p role="status">{t('LastBrowser bereitet die Migration vor.', 'LastBrowser is preparing the migration.')}</p>}
      {status === 'passwords' && <p role="alert">{t('Wähle zwei unterschiedliche Passwörter.', 'Choose two different passwords.')}</p>}
      {status === 'invalid' && <p role="alert">{t('Die Migration konnte nicht gestartet werden. Prüfe die Auswahl und die Lesezeichen.', 'Migration could not start. Check the selected Spaces and bookmarks.')}</p>}
    </form>
  );
}
