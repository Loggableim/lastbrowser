import React, { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { mailRequest, type MailAccount } from '../mail-plugin.js';
import { usePanelStore } from '../stores/usePanelStore.js';
type RecordData = Record<string, any>;
export function NativeMailMain({ workspace, ready, activeContextItem = 'Inbox' }: { workspace: string; ready: boolean; activeContextItem?: string }): JSX.Element {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [account, setAccount] = useState('');
  const [folder, setFolder] = useState('INBOX');
  const [folders, setFolders] = useState<RecordData[]>([]);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<RecordData[]>([]);
  const [detail, setDetail] = useState<RecordData | null>(null);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null); const composeForm = useRef<HTMLFormElement>(null);
  useEffect(() => { if (activeContextItem === 'Search') searchInput.current?.focus(); if (activeContextItem === 'Compose') composeForm.current?.scrollIntoView({ block: 'start' }); if (activeContextItem === 'Mail settings') settings(); }, [activeContextItem]);
  useEffect(() => { setAttachments([]); setConfirmSend(false); }, [workspace, account]);
  const generation = useRef(0);
  const listing = useRef(0); const reading = useRef(0);
  const [attachments, setAttachments] = useState<RecordData[]>([]);
  useEffect(() => {
    const token = ++generation.current;
    setAccounts([]); setAccount(''); setFolders([]); setMessages([]); setDetail(null); setCompose({ to: '', subject: '', body: '' }); setError(''); setNotice(''); setEnabled(false); setAttachments([]); setConfirmSend(false); setBusy(false); setFolder('INBOX');
    if (ready) mailRequest(workspace, 'accounts').then((result) => { if (generation.current === token) { const list = result.accounts as MailAccount[]; setAccounts(list); setEnabled(result.enabled === true); setAccount(list[0]?.id || ''); } }).catch((failure) => { if (generation.current === token) setError(String(failure)); });
    return () => { generation.current++; };
  }, [workspace, ready]);
  const tokenKey = `${workspace}\0${account}\0${folder}`;
  const activeKey = useRef(tokenKey); activeKey.current = tokenKey;
  async function refresh(search = query) {
    if (!account || !enabled) return;
    const key = tokenKey; const request = ++listing.current;
    setBusy(true); setError('');
    try {
      const payload = await mailRequest(workspace, search.trim() ? 'search' : 'list', undefined, { account, folder, max: 50, query: search });
      if (activeKey.current === key && listing.current === request) setMessages((payload.emails || payload.messages || []) as RecordData[]);
    } catch (failure) { if (activeKey.current === key) setError(String(failure)); } finally { if (activeKey.current === key) setBusy(false); }
  }
  useEffect(() => {
    setDetail(null); setMessages([]);
    if (account && enabled) {
      const key = tokenKey;
      void refresh('');
      mailRequest(workspace, 'folders', undefined, { account }).then((payload) => { if (activeKey.current === key) setFolders(payload.folders as RecordData[]); }).catch((failure) => { if (activeKey.current === key) setError(String(failure)); });
    }
  }, [workspace, account, folder, enabled]);
  function settings() { const store = usePanelStore.getState(); store.setActiveContextItem('plugins'); store.setActivePanel('settings'); }
  async function read(item: RecordData) {
    const key = tokenKey;
    const request = ++reading.current;
    setDetail(null); setError('');
    try { const payload = await mailRequest(workspace, 'read', undefined, { account, folder, id: String(item.id) }); if (activeKey.current === key && reading.current === request) setDetail(payload); } catch (failure) { if (activeKey.current === key) setError(String(failure)); }
  }
  async function download(index: number) {
    const key = tokenKey;
    try {
      const payload = await mailRequest(workspace, 'attachment', undefined, { account, folder, id: String(detail?.id), index });
      if (activeKey.current !== key) return;
      const bytes = Uint8Array.from(atob(payload.content_b64 as string), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: String(payload.mimetype) }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = String(payload.filename); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { if (activeKey.current === key) setError(String(failure)); }
  }
  return <section className="browser-main native-rest-main mail-main">
    <header className="native-rest-header"><div className="native-rest-title"><Mail size={21}/><div><span className="eyebrow">Mail-Plugin</span><h1>Mail</h1><p>Postfach dieses Spaces</p></div></div><button type="button" onClick={settings}>Mail-Einstellungen</button></header>
    {!enabled || !accounts.length ? <div className="native-work-card"><p>{!ready ? 'Sidekick startet…' : 'Für diesen Space ist noch kein Mailkonto aktiviert.'}</p><button type="button" onClick={settings}>Mailkonto einrichten</button></div> : <>
      <div className="native-card-actions"><label>Konto<select value={account} onChange={(event) => { setQuery(''); setCompose({ to: '', subject: '', body: '' }); setAccount(event.target.value); }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
        <label>Ordner<select value={folder} onChange={(event) => { setQuery(''); setFolder(event.target.value); }}><option value="INBOX">Posteingang</option>{folders.filter((item) => (item.name || item.id) !== 'INBOX').map((item) => <option key={item.name || item.id} value={item.name || item.id}>{item.label || item.name || item.id}</option>)}</select></label>
        <form onSubmit={(event) => { event.preventDefault(); void refresh(); }}><input ref={searchInput} aria-label="Mails durchsuchen" value={query} placeholder="Mails durchsuchen" onChange={(event) => setQuery(event.target.value)}/><button disabled={busy}>Suchen / Aktualisieren</button></form>
      </div>
      <div className="native-rest-split"><aside className="integration-list">{messages.map((item) => <button key={item.id} type="button" className="integration-row" onClick={() => void read(item)}><span>{item.subject || '(Kein Betreff)'}</span><small>{item.from_name || item.from} · {item.date}</small></button>)}{!messages.length && !busy && <p>Keine Nachrichten gefunden.</p>}</aside>
      <main className="native-rest-detail">{detail && <article className="native-work-card"><h2>{detail.subject || '(Kein Betreff)'}</h2><p>{detail.from} · {detail.date}</p><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detail.body_plain || detail.body || 'Diese Nachricht enthält nur HTML oder Anhänge.'}</pre>{(detail.attachments || []).map((name: string, index: number) => <button key={index} type="button" onClick={() => void download(index)}>Anhang herunterladen: {name}</button>)}<button type="button" onClick={() => { setCompose({ to: detail.from_email || detail.from || '', subject: `Re: ${detail.subject || ''}`, body: '' }); }}>Antworten</button></article>}
        <form ref={composeForm} className="native-work-card gmail-compose" onSubmit={(event) => { event.preventDefault(); if (!confirmSend) { setConfirmSend(true); return; } setConfirmSend(false);
          const key = tokenKey; setBusy(true); setError(''); setNotice('');
          mailRequest(workspace, 'send', { ...compose, account, attachments }).then(() => { if (activeKey.current === key) { setCompose({ to: '', subject: '', body: '' }); setAttachments([]); setNotice('Mail wurde gesendet.'); } }).catch((failure) => { if (activeKey.current === key) setError(String(failure)); }).finally(() => { if (activeKey.current === key) setBusy(false); });
        }}><h2>Neue Nachricht</h2><label>An<input type="email" required value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })}/></label><label>Betreff<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })}/></label><label>Nachricht<textarea required value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })}/></label><label>Anhänge (insgesamt maximal 10 MB)<input type="file" multiple onChange={async (event) => {
          const files = Array.from(event.target.files || []); const key = tokenKey;
          if (files.length > 10 || files.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) { setError('Maximal 10 Dateien und insgesamt 10 MB.'); event.target.value = ''; return; }
          const items = await Promise.all(files.map((file) => new Promise<RecordData>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve({ filename: file.name, mimetype: file.type || 'application/octet-stream', content_b64: String(reader.result).split(',')[1] }); reader.readAsDataURL(file); })));
          if (activeKey.current === key) setAttachments(items);
        }}/></label>{attachments.map((item) => <span key={item.filename}>{item.filename}</span>)}<button type="submit" disabled={busy || !ready || !compose.to.trim() || !compose.body.trim()}>{confirmSend ? `Jetzt an ${compose.to} senden` : 'Senden'}</button>{confirmSend && <button type="button" onClick={() => setConfirmSend(false)}>Abbrechen</button>}</form>
      </main></div>
    </>}{error && <div className="workspace-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
  </section>;
}
