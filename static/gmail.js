/**
 * Gmail Panel — Rich email client for Hermes WebUI
 * Handles inbox, reading, search, compose, folders, delete, move.
 * With animations, loading states, and toast notifications.
 * Multi-Account support: dropdown switcher for connected accounts.
 */

// ── State ──
const GMAIL = {
  currentTab: 'inbox',
  currentFolder: 'INBOX',
  currentAccount: 'dominik',
  accounts: [],
  emails: [],
  loaded: false,
  loading: false,
  pollInterval: null,
};

// ── Helper: add account parameter to URLs ──
function _gmailAccount(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}account=${encodeURIComponent(GMAIL.currentAccount)}`;
}

// ── Init ──
function loadGmailPanel() {
  if (!GMAIL.loaded) {
    // Inject CSS once
    if (!document.getElementById('gmailPanelCss')) {
      const link = document.createElement('link');
      link.id = 'gmailPanelCss';
      link.rel = 'stylesheet';
      link.href = 'static/gmail-panel.css?v=__WEBUI_VERSION__';
      document.head.appendChild(link);
    }
    // Start polling when panel loads
    if (GMAIL.pollInterval) { clearInterval(GMAIL.pollInterval); GMAIL.pollInterval = null; }
    GMAIL.pollInterval = setInterval(gmailPollUnread, 30000);
    GMAIL.loaded = true;
    // Load accounts
    loadGmailAccounts();
  }
  // Always refresh when panel opens
  gmailRefresh();
}

// ── Load available accounts ──
async function loadGmailAccounts() {
  try {
    const res = await fetch('/api/gmail/accounts');
    const data = await res.json();
    GMAIL.accounts = data.accounts || [];
    // If current account not in list, reset to first
    if (!GMAIL.accounts.find(a => a.id === GMAIL.currentAccount)) {
      GMAIL.currentAccount = GMAIL.accounts[0]?.id || 'dominik';
    }
    // Populate dropdown
    const sel = document.getElementById('gmailAccountSelect');
    if (sel) {
      sel.innerHTML = GMAIL.accounts.map(a =>
        `<option value="${a.id}" ${a.id === GMAIL.currentAccount ? 'selected' : ''}>${a.email}</option>`
      ).join('');
    }
  } catch (e) {
    console.warn('Could not load Gmail accounts:', e);
  }
}

// ── Switch account ──
function gmailSwitchAccount(accountId) {
  if (accountId === GMAIL.currentAccount) return;
  GMAIL.currentAccount = accountId;
  // Update dropdown display
  const display = document.getElementById('gmailAccountDisplay');
  if (display) {
    const acc = GMAIL.accounts.find(a => a.id === accountId);
    display.textContent = acc ? acc.email : accountId;
  }
  // Refresh
  gmailSwitchTab(GMAIL.currentTab);
}

// ── Tab switching ──
function gmailSwitchTab(tab) {
  GMAIL.currentTab = tab;
  document.querySelectorAll('.gmail-tab').forEach(t => t.classList.remove('gmail-active'));
  const activeTab = document.querySelector(`.gmail-tab[data-gmail-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('gmail-active');

  const content = document.getElementById('gmailContent');
  if (!content) return;

  if (tab === 'inbox') gmailRefresh();
  else if (tab === 'search') renderSearch();
  else if (tab === 'compose') renderCompose();
  else if (tab === 'folders') gmailLoadFolders();
}

// ── Toast notification ──
function gmailToast(msg, type = 'info') {
  const existing = document.querySelector('.gmail-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `gmail-toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `${icons[type] || 'ℹ️'} ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Format date ──
function gmailFormatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000*60*60*24));
    if (diffDays === 0) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return d.toLocaleDateString('de-DE', { weekday: 'short' });
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  } catch { return dateStr.slice(0, 10); }
}

// ── Refresh inbox ──
async function gmailRefresh() {
  const content = document.getElementById('gmailContent');
  if (!content) return;
  if (GMAIL.loading) return;
  GMAIL.loading = true;

  content.innerHTML = `<div class="gmail-loading"><div class="gmail-shimmer"></div><span>📬 Lade E-Mails...</span></div>`;

  try {
    const url = _gmailAccount(`/api/gmail/list?max=25&folder=${encodeURIComponent(GMAIL.currentFolder)}`);
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">📭</div>${data.error}</div>`;
      return;
    }
    GMAIL.emails = data.emails || [];
    renderInbox(data);
  } catch (e) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>Verbindungsfehler: ${e.message}</div>`;
  } finally {
    GMAIL.loading = false;
  }
}

// ── Render inbox ──
function renderInbox(data) {
  const content = document.getElementById('gmailContent');
  const emails = data.emails || [];

  if (emails.length === 0) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">📨</div>Keine E-Mails gefunden</div>`;
    return;
  }

  const accountEmail = GMAIL.accounts.find(a => a.id === GMAIL.currentAccount)?.email || GMAIL.currentAccount;
  let html = `<div class="gmail-list-header"><span><span class="count">${data.count || emails.length}</span> E-Mails · ${data.folder} · <span style="opacity:0.6">${accountEmail}</span></span><span style="font-size:11px">🔄 eben aktualisiert</span></div>`;
  html += '<div class="gmail-list">';

  for (const email of emails) {
    const sender = email.from_name || email.from || 'Unbekannt';
    const subj = email.subject || '(kein Betreff)';
    const date = gmailFormatDate(email.date);
    const senderShort = sender.length > 28 ? sender.slice(0, 26) + '…' : sender;
    html += `<div class="gmail-card" data-id="${email.id}" onclick="gmailOpenEmail('${email.id}')" title="${sender} · ${subj}">
      <span class="sender">${senderShort}</span>
      <span class="subject">${subj}</span>
      <span class="date">${date}</span>
    </div>`;
  }

  html += '</div>';
  content.innerHTML = html;

  // Stagger animation via CSS
  document.querySelectorAll('.gmail-card').forEach((el, i) => {
    el.style.animation = `gmailFadeIn 0.25s ease-out ${i * 0.03}s both`;
  });
}

// ── Open email ──
async function gmailOpenEmail(id) {
  const content = document.getElementById('gmailContent');
  content.innerHTML = `<div class="gmail-loading"><div class="gmail-shimmer"></div><span>📧 Lade E-Mail...</span></div>`;

  try {
    const url = _gmailAccount(`/api/gmail/read?id=${encodeURIComponent(id)}`);
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>${data.error}</div>`;
      return;
    }
    renderEmailDetail(data);
  } catch (e) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>Fehler: ${e.message}</div>`;
  }
}

function renderEmailDetail(data) {
  const content = document.getElementById('gmailContent');
  const body = data.body || '(kein Inhalt)';
  const truncated = body.length > 10000 ? body.slice(0, 10000) + '\n\n[... weitergekürzt]' : body;

  content.innerHTML = `
    <div class="gmail-detail">
      <div class="gmail-detail-head">
        <button class="gmail-back-btn" onclick="gmailRefresh()">← Zurück</button>
        <h3>${data.subject || '(kein Betreff)'}</h3>
        <div class="gmail-detail-meta">
          <span>📤 ${data.from || 'Unbekannt'}</span>
          <span>📅 ${data.date || ''}</span>
          ${data.attachments && data.attachments.length ? `<span>📎 ${data.attachments.join(', ')}</span>` : ''}
          ${data.account ? `<span style="opacity:0.6">📧 ${data.account}</span>` : ''}
        </div>
      </div>
      <div class="gmail-detail-body">${escHtml(truncated)}</div>
      <div class="gmail-detail-actions">
        <button onclick="gmailDeleteEmail('${data.id}')" class="btn-danger" title="In Papierkorb">🗑️ Löschen</button>
        <button onclick="gmailMoveEmail('${data.id}')" title="In Ordner verschieben">📂 Verschieben</button>
        <button onclick="gmailShowFolders('${data.id}')" title="Ordner anzeigen">📁 Ordner</button>
      </div>
    </div>`;
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ── Delete email ──
async function gmailDeleteEmail(id, folder) {
  const card = document.querySelector(`.gmail-card[data-id="${id}"]`);
  if (card) card.classList.add('gmail-trashing');

  try {
    const res = await fetch('/api/gmail/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, folder: folder || GMAIL.currentFolder, account: GMAIL.currentAccount }),
    });
    const data = await res.json();
    if (data.status === 'deleted' || data.status === 'trashed') {
      gmailToast('🗑️ In Papierkorb verschoben', 'success');
      setTimeout(() => gmailRefresh(), 400);
    } else {
      gmailToast('❌ ' + (data.error || 'Löschen fehlgeschlagen'), 'error');
    }
  } catch (e) {
    gmailToast('❌ Fehler: ' + e.message, 'error');
  }
}

// ── Move email ──
async function gmailMoveEmail(id, toFolder) {
  if (!toFolder) {
    gmailShowFolders(id);
    return;
  }
  try {
    const res = await fetch('/api/gmail/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, to_folder: toFolder, from_folder: GMAIL.currentFolder, account: GMAIL.currentAccount }),
    });
    const data = await res.json();
    if (data.status === 'moved') {
      gmailToast(`📨 → ${toFolder}`, 'success');
      gmailRefresh();
    } else {
      gmailToast('❌ ' + (data.error || 'Verschieben fehlgeschlagen'), 'error');
    }
  } catch (e) {
    gmailToast('❌ Fehler: ' + e.message, 'error');
  }
}

// ── Show folder picker for moving ──
let _moveTargetId = null;

async function gmailShowFolders(emailId) {
  _moveTargetId = emailId;
  const content = document.getElementById('gmailContent');
  content.innerHTML = `<div class="gmail-loading"><div class="gmail-shimmer"></div><span>📁 Lade Ordner...</span></div>`;

  try {
    const url = _gmailAccount('/api/gmail/folders');
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    let html = `<div style="padding:12px">
      <button class="gmail-back-btn" onclick="gmailOpenEmail('${emailId}')">← Zurück zur E-Mail</button>
      <h3 style="margin:8px 0 12px;font-size:14px;color:var(--text)">📁 In Ordner verschieben</h3>
      <div class="gmail-folders">`;

    const folderIcons = {
      'INBOX': '📥', '[Gmail]/Gesendet': '📤', '[Gmail]/Papierkorb': '🗑️',
      '[Gmail]/Entwürfe': '📝', '[Gmail]/Spam': '⚠️', '[Gmail]/Wichtig': '⭐',
      '[Gmail]/Alle Nachrichten': '📬',
    };

    for (const f of data.folders || []) {
      if (f.name === GMAIL.currentFolder) continue;
      const icon = folderIcons[f.name] || '📁';
      html += `<div class="gmail-folder-item" onclick="gmailMoveEmail('${emailId}', '${escHtml(f.name)}')">
        <span class="gmail-folder-icon">${icon}</span> ${f.name}
      </div>`;
    }

    html += '</div></div>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>${e.message}</div>`;
  }
}

// ── Search ──
function renderSearch() {
  const content = document.getElementById('gmailContent');
  content.innerHTML = `
    <div class="gmail-search-box">
      <input id="gmailSearchInput" type="text" placeholder="from:github, subject:deploy, Freitext..." autofocus
             onkeydown="if(event.key==='Enter') gmailDoSearch()">
      <button onclick="gmailDoSearch()">🔍 Suchen</button>
    </div>
    <div class="gmail-empty" style="height:150px">
      <div class="gmail-empty-icon">🔍</div>
      Gib einen Suchbegriff ein<br><span style="font-size:11px">Beispiele: from:github · subject:deploy · has:attachment</span>
    </div>`;
  setTimeout(() => document.getElementById('gmailSearchInput')?.focus(), 100);
}

async function gmailDoSearch() {
  const input = document.getElementById('gmailSearchInput');
  const query = input?.value.trim();
  if (!query) return;

  const content = document.getElementById('gmailContent');
  content.innerHTML = `<div class="gmail-loading"><div class="gmail-shimmer"></div><span>🔍 Suche "${query}"...</span></div>`;

  try {
    const url = _gmailAccount(`/api/gmail/search?query=${encodeURIComponent(query)}&max=25`);
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const emails = data.emails || [];
    if (emails.length === 0) {
      content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">🔍</div>Keine Treffer für "${query}"</div>`;
      return;
    }

    let html = `<div class="gmail-list-header"><span>🔍 "${query}" · <span class="count">${data.count}</span> Treffer</span></div>`;
    html += '<div class="gmail-list">';
    for (const email of emails) {
      const sender = email.from_name || email.from || 'Unbekannt';
      const subj = email.subject || '(kein Betreff)';
      const date = gmailFormatDate(email.date);
      html += `<div class="gmail-card" data-id="${email.id}" onclick="gmailOpenEmail('${email.id}')">
        <span class="sender">${sender.length > 30 ? sender.slice(0, 28) + '…' : sender}</span>
        <span class="subject">${subj}</span>
        <span class="date">${date}</span>
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>Fehler: ${e.message}</div>`;
  }
}

// ── Compose ──
function renderCompose() {
  const content = document.getElementById('gmailContent');
  const accountEmail = GMAIL.accounts.find(a => a.id === GMAIL.currentAccount)?.email || GMAIL.currentAccount;
  content.innerHTML = `
    <div class="gmail-compose">
      <div style="font-size:11px;color:var(--muted);padding:2px 0 6px;border-bottom:1px solid var(--border);margin-bottom:8px;">
        📧 Sende als: <strong>${accountEmail}</strong>
      </div>
      <input id="gmailTo" type="email" placeholder="An (E-Mail-Adresse)" autofocus>
      <input id="gmailSubject" type="text" placeholder="Betreff">
      <textarea id="gmailBody" placeholder="Nachricht schreiben..."></textarea>
      <button class="send-btn" onclick="gmailSend()">
        <span>✉️</span> Senden
      </button>
      <div id="gmailSendStatus" style="font-size:12px;color:var(--muted);min-height:20px"></div>
    </div>`;
  setTimeout(() => document.getElementById('gmailTo')?.focus(), 100);
}

async function gmailSend() {
  const to = document.getElementById('gmailTo')?.value.trim();
  const subject = document.getElementById('gmailSubject')?.value.trim();
  const body = document.getElementById('gmailBody')?.value.trim();
  const status = document.getElementById('gmailSendStatus');
  const btn = document.querySelector('.send-btn');

  if (!to || !subject || !body) {
    status.textContent = '⚠️ Bitte alle Felder ausfüllen';
    status.style.color = '#ef4444';
    return;
  }

  if (!to.includes('@')) {
    status.textContent = '⚠️ Ungültige E-Mail-Adresse';
    status.style.color = '#ef4444';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '⏳ Wird gesendet...';
  status.textContent = '📤 Sende...';
  status.style.color = 'var(--muted)';

  try {
    const res = await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, account: GMAIL.currentAccount }),
    });
    const data = await res.json();

    if (data.status === 'sent') {
      status.textContent = `✅ Gesendet an ${to}`;
      status.style.color = '#22c55e';
      btn.innerHTML = '✅ Gesendet';
      document.querySelector('.gmail-compose')?.classList.add('gmail-send-flash');
      gmailToast(`✉️ Gesendet an ${to}`, 'success');
    } else {
      throw new Error(data.error || 'Send failed');
    }
  } catch (e) {
    status.textContent = `❌ Fehler: ${e.message}`;
    status.style.color = '#ef4444';
    btn.disabled = false;
    btn.innerHTML = '<span>✉️</span> Senden';
  }
}

// ── Load folders ──
async function gmailLoadFolders() {
  const content = document.getElementById('gmailContent');
  content.innerHTML = `<div class="gmail-loading"><div class="gmail-shimmer"></div><span>📁 Lade Ordner...</span></div>`;

  try {
    const url = _gmailAccount('/api/gmail/folders');
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const folderIcons = {
      'INBOX': '📥', '[Gmail]/Gesendet': '📤', '[Gmail]/Papierkorb': '🗑️',
      '[Gmail]/Entwürfe': '📝', '[Gmail]/Spam': '⚠️', '[Gmail]/Wichtig': '⭐',
      '[Gmail]/Alle Nachrichten': '📬',
    };

    let html = '<div class="gmail-folders">';
    for (const f of data.folders || []) {
      const icon = folderIcons[f.name] || '📁';
      const active = f.name === GMAIL.currentFolder ? ' active' : '';
      html += `<div class="gmail-folder-item${active}" onclick="gmailSelectFolder('${escHtml(f.name)}')">
        <span class="gmail-folder-icon">${icon}</span> ${f.name}
      </div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  } catch (e) {
    content.innerHTML = `<div class="gmail-empty"><div class="gmail-empty-icon">⚠️</div>${e.message}</div>`;
  }
}

function gmailSelectFolder(name) {
  GMAIL.currentFolder = name;
  gmailRefresh();
}

// ── Auto-poll for unread indicator ──
async function gmailPollUnread() {
  try {
    const url = _gmailAccount('/api/gmail/list?max=1');
    const res = await fetch(url);
    const data = await res.json();
    const dot = document.getElementById('gmailUnreadDot');
    if (dot) {
      const hasNew = data.count && data.count > 0;
      dot.style.display = hasNew ? 'block' : 'none';
    }
  } catch {}
}

// Start polling is handled in loadGmailPanel()
