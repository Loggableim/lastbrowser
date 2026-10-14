import React, { useState } from 'react';
import { Download, ExternalLink, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useDesktopI18n } from '../i18n.js';
import type { ExtensionRecord } from '../bridge.js';
import { CURATED_EXTENSION_CATALOG } from '../curated-extension-catalog.js';
import { readExtensionUserReport, saveExtensionUserReport } from '../extension-compatibility-reports.js';
import './curated-extension-store.css';

const categories = {
  all: ['Alle', 'All'], privacy: ['Datenschutz', 'Privacy'], passwords: ['Passwörter', 'Passwords'],
  productivity: ['Tabs & Produktivität', 'Tabs & productivity'], research: ['Recherche & E-Mail', 'Research & email'],
  design: ['Darstellung', 'Appearance'], language: ['Sprachen & Schreiben', 'Language & writing'],
  developer: ['Entwicklung', 'Developer'], media: ['Medien', 'Media']
} as const;

export function ExtensionPersonalReport({ profileId, extension }: { profileId: string; extension: ExtensionRecord }): React.JSX.Element {
  const { locale } = useDesktopI18n();
  const de = locale === 'de';
  const [report, setReport] = useState(() => readExtensionUserReport(profileId, extension.id, extension.version));
  const [error, setError] = useState('');
  const choose = (works: boolean) => {
    try {
      saveExtensionUserReport(profileId, extension.id, extension.version, report?.works === works ? null : works);
      setReport(readExtensionUserReport(profileId, extension.id, extension.version));
      setError('');
    } catch { setError(de ? 'Deine Bewertung konnte nicht gespeichert werden.' : 'Your report could not be saved.'); }
  };
  return <div className="curated-extension-report">
    <span>{de ? 'Deine Erfahrung' : 'Your experience'} · v{extension.version}</span>
    <div role="group" aria-label={de ? `Funktioniert ${extension.name}?` : `Does ${extension.name} work?`}>
      <button type="button" aria-pressed={report?.works === true} onClick={() => choose(true)} title={de ? 'Funktioniert bei mir' : 'Works for me'}><ThumbsUp size={14} /><span>{de ? 'Funktioniert' : 'Works'}</span></button>
      <button type="button" aria-pressed={report?.works === false} onClick={() => choose(false)} title={de ? 'Funktioniert bei mir nicht' : 'Does not work for me'}><ThumbsDown size={14} /><span>{de ? 'Funktioniert nicht' : 'Does not work'}</span></button>
    </div>
    <small>{de ? 'Nur in diesem Profil gespeichert. Erneut klicken entfernt die Bewertung.' : 'Saved only in this profile. Click again to clear.'}</small>
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function CuratedExtensionStore({ profileId, extensions, installingId, onInstall }: {
  profileId: string; extensions: readonly ExtensionRecord[]; installingId: string | null;
  onInstall: (extensionId: string) => Promise<void>;
}): React.JSX.Element {
  const { locale } = useDesktopI18n();
  const de = locale === 'de';
  const [category, setCategory] = useState<keyof typeof categories>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const needle = search.trim().toLocaleLowerCase();
  const filtered = CURATED_EXTENSION_CATALOG.filter(entry => (category === 'all' || entry.category === category)
    && (!needle || `${entry.name} ${entry.author} ${entry.description} ${entry.descriptionDe}`.toLocaleLowerCase().includes(needle)));
  const count = Math.max(1, Math.ceil(filtered.length / 9));
  const currentPage = Math.min(page, count - 1);
  const selection = CURATED_EXTENSION_CATALOG.find(entry => entry.id === selected);
  const install = async () => {
    if (!selection?.cwsId || !accepted || installingId || !profileId) return;
    setError('');
    try { await onInstall(selection.cwsId); setSelected(null); setAccepted(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className="curated-extension-store" aria-label={de ? 'Kuratierte Erweiterungen' : 'Curated extensions'}>
    <header><h3>{de ? 'Entdecke Erweiterungen' : 'Discover extensions'}</h3>
      <p>{de ? 'Kuratierte Auswahl · LastBrowser-Kompatibilität ungetestet. Du kannst sie installieren und deine eigene Erfahrung markieren.' : 'Curated selection · LastBrowser compatibility is untested. Install an extension and record your own experience.'}</p>
    </header>
    <input type="search" value={search} aria-label={de ? 'Erweiterungen suchen' : 'Search extensions'} placeholder={de ? 'Name, Anbieter oder Funktion suchen' : 'Search name, publisher or purpose'} onChange={event => { setSearch(event.target.value); setPage(0); }} />
    <div className="curated-extension-categories" role="group" aria-label={de ? 'Kategorien' : 'Categories'}>
      {Object.entries(categories).map(([id, labels]) => <button key={id} type="button" aria-pressed={id === category}
        onClick={() => { setCategory(id as keyof typeof categories); setPage(0); }}>{labels[de ? 0 : 1]}</button>)}
    </div>
    {selection && <section className="curated-extension-consent" aria-label={de ? 'Installation bestätigen' : 'Confirm installation'}>
      <strong>{selection.name}</strong>
      <p>{de ? 'Die Erweiterung wird aus dem Chrome Web Store heruntergeladen und aktiviert. Sie kann Website-Daten lesen oder ändern und eigene Dienste verwenden. Unterstützte Funktionen und Berechtigungen unterscheiden sich von Chrome. Installierte Erweiterungen gelten derzeit browserweit; die Bewertung bleibt in deinem Profil.' : 'The extension is downloaded from the Chrome Web Store and activated. It may read or change website data and use its own services. Supported features and permissions differ from Chrome. Installed extensions currently apply browser-wide; your report remains in your profile.'}</p>
      <a href={selection.storeUrl} target="_blank" rel="noopener noreferrer">{de ? 'Anbieterinformationen im Store prüfen' : 'Review publisher information in the store'} <ExternalLink size={12} /></a>
      <label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />{de ? 'Ich möchte diese ungetestete Erweiterung installieren.' : 'I want to install this untested extension.'}</label>
      <div><button type="button" disabled={Boolean(installingId)} onClick={() => { setSelected(null); setAccepted(false); setError(''); }}>{de ? 'Abbrechen' : 'Cancel'}</button>
        <button type="button" disabled={!accepted || Boolean(installingId) || !profileId} onClick={() => void install()}>{installingId ? <Loader2 size={14} className="spin" /> : <Download size={14} />}{de ? 'Jetzt installieren' : 'Install now'}</button></div>
      {error && <p role="alert">{error}</p>}
    </section>}
    <div className="curated-extension-grid">
      {filtered.slice(currentPage * 9, (currentPage + 1) * 9).map(entry => {
        const installed = entry.cwsId ? extensions.find(item => item.id === entry.cwsId) : undefined;
        return <article key={entry.id} className="curated-extension-card">
          <header><span className="curated-extension-icon" aria-hidden="true">{installed?.iconDataUrl
            ? <img src={installed.iconDataUrl} alt="" /> : entry.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()}</span>
            <div><h4>{entry.name}</h4><small>{entry.author}</small></div></header>
          <span className="curated-extension-badge">{installed ? (de ? 'Installiert' : 'Installed') : (de ? 'Ungetestet' : 'Untested')}</span>
          <p>{de ? entry.descriptionDe : entry.description}</p>
          <div className="curated-extension-links"><a href={entry.homepageUrl} target="_blank" rel="noopener noreferrer">{de ? 'Offizielle Website' : 'Official website'} <ExternalLink size={12} /></a>
            {entry.storeUrl && <a href={entry.storeUrl} target="_blank" rel="noopener noreferrer">Chrome Web Store <ExternalLink size={12} /></a>}</div>
          {installed ? <ExtensionPersonalReport key={`${profileId}:${installed.id}:${installed.version}`} profileId={profileId} extension={installed} />
            : <button type="button" disabled={!entry.cwsId || Boolean(installingId) || !profileId} onClick={() => { setSelected(entry.id); setAccepted(false); setError(''); }}>
              <Download size={14} />{entry.cwsId ? (de ? 'Installieren…' : 'Install…') : (de ? 'Storeangebot nicht verfügbar' : 'Store listing unavailable')}</button>}
        </article>;
      })}
    </div>
    {!filtered.length && <p role="status">{de ? 'Keine passenden Erweiterungen.' : 'No matching extensions.'}</p>}
    {count > 1 && <nav className="curated-extension-pagination" aria-label={de ? 'Katalogseiten' : 'Catalog pages'}><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>{de ? 'Zurück' : 'Previous'}</button><span>{currentPage + 1} / {count}</span><button type="button" disabled={currentPage + 1 >= count} onClick={() => setPage(currentPage + 1)}>{de ? 'Weiter' : 'Next'}</button></nav>}
  </section>;
}
