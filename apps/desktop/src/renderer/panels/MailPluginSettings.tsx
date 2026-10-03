import React, { useEffect, useRef, useState } from 'react';
import { Mail, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { mailRequest, type MailAccount, type MailConfig } from '../mail-plugin.js';
const empty = (): MailAccount => ({ id: crypto.randomUUID().replaceAll('-', ''), email: '', username: '', provider: 'gmail', imap_host: '', imap_port: 993, imap_security: 'ssl', smtp_host: '', smtp_port: 587, smtp_security: 'starttls' });
export function MailPluginSettings({ workspace, ready }: { workspace: string; ready: boolean }): JSX.Element {
  const [cfg, setCfg] = useState<MailConfig>({ enabled: false, accounts: {} });
  const [account, setAccount] = useState<MailAccount>(empty);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scope = useRef(workspace); scope.current = workspace;
  useEffect(() => {
    let current = true;
    setCfg({ enabled: false, accounts: {} }); setAccount(empty()); setPassword(''); setError(''); setNotice(''); setBusy(false);
    if (ready) mailRequest(workspace, 'config').then((result) => { if (current) { const config = result as MailConfig; setCfg(config); setAccount(Object.values(config.accounts)[0] || empty()); } }).catch((failure) => { if (current) setError(String(failure)); });
    return () => { current = false; };
  }, [workspace, ready]);
  async function run(action: () => Promise<void>) {
    const current = workspace;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { if (scope.current === current) setError(failure instanceof Error ? failure.message : String(failure)); } finally { if (scope.current === current) setBusy(false); }
  }
  return <section className="native-work-card mail-plugin-settings" aria-label="Mail-Plugin">
    <header><Mail size={20}/><strong>Mail-Plugin</strong><span>Konfiguration für diesen Space</span></header>
    <p>Gmail oder einen anderen Anbieter über IMAP/SMTP verbinden. Konten und Zugangsdaten bleiben auf diesen Space beschränkt.</p>
    <label><input type="checkbox" checked={cfg.enabled} disabled={!ready || busy} onChange={(event) => {
      const enabled = event.target.checked;
      void run(async () => { const result = await mailRequest(workspace, 'config', { enabled }) as MailConfig; if (scope.current !== workspace) return; setCfg(result); setNotice(enabled ? 'Mail aktiviert.' : 'Mail deaktiviert.'); });
    }}/>Mail in diesem Space aktivieren</label>
    <div className="native-card-actions">{Object.values(cfg.accounts).map((item) => <button key={item.id} type="button" onClick={() => { setAccount(item); setPassword(''); setNotice(''); }}><Mail size={14}/>{item.email}</button>)}<button type="button" onClick={() => { setAccount(empty()); setPassword(''); setNotice(''); }}><Plus size={14}/>Konto hinzufügen</button></div>
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const result = await mailRequest(workspace, 'config', { enabled: true, account: { ...account, password } }) as MailConfig;
      if (scope.current !== workspace) return;
      setCfg(result); setAccount(result.accounts[account.id]);
      setPassword('');
      await mailRequest(workspace, 'test', { account: account.id });
      if (scope.current !== workspace) return;
      setNotice('Verbindung erfolgreich: Empfangen und Senden sind angemeldet.');
    }); }}>
      <div className="settings-field-grid">
        <label>Anbieter<select value={account.provider} onChange={(event) => setAccount({ ...account, provider: event.target.value as MailAccount['provider'] })}><option value="gmail">Gmail</option><option value="imap">Anderer Anbieter (IMAP/SMTP)</option></select></label>
        <label>Mailadresse<input type="email" autoComplete="off" required value={account.email} onChange={(event) => setAccount({ ...account, email: event.target.value })}/></label>
        <label>{account.provider === 'gmail' ? 'Google-App-Passwort' : 'Passwort'}<input type="password" autoComplete="new-password" value={password} placeholder={account.has_password ? 'Gespeichertes Passwort beibehalten' : ''} required={!account.has_password} onChange={(event) => setPassword(event.target.value)}/></label>
      </div>
      {account.provider === 'gmail' ? <p>Ein App-Passwort verwenden. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Bei Google erstellen</a>. IMAP und SMTP werden automatisch eingestellt.</p> : <div className="settings-field-grid">
        <label>Benutzername<input value={account.username || ''} placeholder={account.email} onChange={(event) => setAccount({ ...account, username: event.target.value })}/></label>
        {(['imap', 'smtp'] as const).map((kind) => <fieldset key={kind}><legend>{kind.toUpperCase()}</legend>
          <label>Server<input required value={account[`${kind}_host`] || ''} onChange={(event) => setAccount({ ...account, [`${kind}_host`]: event.target.value })}/></label>
          <label>Port<input type="number" min={1} max={65535} required value={account[`${kind}_port`]} onChange={(event) => setAccount({ ...account, [`${kind}_port`]: Number(event.target.value) })}/></label>
          <label>Verschlüsselung<select value={account[`${kind}_security`]} onChange={(event) => setAccount({ ...account, [`${kind}_security`]: event.target.value })}><option value="ssl">TLS</option><option value="starttls">STARTTLS</option></select></label>
        </fieldset>)}
      </div>}
      <div className="native-card-actions"><button type="submit" disabled={!ready || busy}><RefreshCw size={14}/>{busy ? 'Verbindung wird geprüft…' : 'Speichern und Verbindung testen'}</button>
        {cfg.accounts[account.id] && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Dieses Mailkonto aus diesem Space entfernen?')) void run(async () => { const result = await mailRequest(workspace, 'config', { remove: account.id }) as MailConfig; if (scope.current !== workspace) return; setCfg(result); setAccount(empty()); setPassword(''); }); }}><Trash2 size={14}/>Konto entfernen</button>}
      </div>
    </form>
    {error && <div role="alert" className="workspace-error">{error}</div>}{notice && <p role="status">{notice}</p>}
  </section>;
}
