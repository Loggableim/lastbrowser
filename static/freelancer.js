/**
 * Freelancer Browser Panel — Live-Screenshot + Chat-Steuerung
 * Steuert die Playwright Firefox Automation über den API-Server (Port 8790)
 */

const FL_API = 'http://127.0.0.1:8790';

let _flPollTimer = null;
let _flBrowserRunning = false;
let _flClickMode = false;

// ── Status Polling ──
async function flStartBrowser() {
  const btn = document.getElementById('flBtnStart');
  btn.disabled = true;
  addChatMsg('request', '🚀 Browser wird gestartet...');
  try {
    const r = await fetch(`${FL_API}/start`, { method: 'POST' });
    const d = await r.json();
    if (d.status === 'started' || d.status === 'already_running') {
      addChatMsg('success', '✅ Browser läuft');
      _flBrowserRunning = true;
      document.getElementById('flBtnStop').disabled = false;
      document.getElementById('flPlaceholder').style.display = 'none';
      document.getElementById('flScreenshotImg').style.display = 'block';
      setStatus('online', 'Browser läuft');
      flStartPolling();
      // Navigate to freelancer after start
      setTimeout(flNavigateToLogin, 1000);
    } else {
      addChatMsg('error', `❌ Fehler: ${d.error || 'unbekannt'}`);
      btn.disabled = false;
    }
  } catch(e) {
    addChatMsg('error', `❌ API-Verbindung fehlgeschlagen: ${e.message}`);
    btn.disabled = false;
    setStatus('offline', 'API nicht erreichbar');
  }
}

function flNavigateToLogin() {
  flNavigate('https://www.freelancer.com/dashboard');
}

async function flStopBrowser() {
  try {
    await fetch(`${FL_API}/stop`, { method: 'POST' });
    document.getElementById('flBtnStop').disabled = true;
    document.getElementById('flBtnStart').disabled = false;
    _flBrowserRunning = false;
    setStatus('offline', 'Browser gestoppt');
    if (_flPollTimer) { clearInterval(_flPollTimer); _flPollTimer = null; }
    document.getElementById('flScreenshotImg').style.display = 'none';
    document.getElementById('flPlaceholder').style.display = 'flex';
    addChatMsg('info', '🛑 Browser gestoppt');
  } catch(e) {
    addChatMsg('error', `❌ Fehler beim Stoppen: ${e.message}`);
  }
}

async function flPollStatus() {
  try {
    const r = await fetch(`${FL_API}/status`);
    const s = await r.json();
    if (s.running) {
      setStatus('online', s.url ? s.url.substring(0, 80) : 'Verbunden');
      document.getElementById('flLoginBadge').textContent = s.logged_in ? '✅ Eingeloggt' : '⚠ Nicht eingeloggt';
      _flBrowserRunning = true;
      document.getElementById('flBtnStart').disabled = true;
      document.getElementById('flBtnStop').disabled = false;
      document.getElementById('flScreenshotImg').style.display = 'block';
      document.getElementById('flPlaceholder').style.display = 'none';
    } else {
      setStatus('offline', 'Browser gestoppt');
      _flBrowserRunning = false;
      document.getElementById('flBtnStart').disabled = false;
      document.getElementById('flBtnStop').disabled = true;
    }
  } catch(e) {
    // API offline
    setStatus('offline', 'API offline');
  }
}

function flStartPolling() {
  if (_flPollTimer) clearInterval(_flPollTimer);
  _flPollTimer = setInterval(flPollStatus, 3000);
}

// ── Screenshot ──
async function flRefreshScreenshot() {
  const img = document.getElementById('flScreenshotImg');
  try {
    const r = await fetch(`${FL_API}/screenshot`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    img.src = url;
    img.style.display = 'block';
  } catch(e) {
    // silent
  }
}

// ── Navigation ──
async function flNavigate(url) {
  const input = document.getElementById('flUrlInput');
  const target = url || input.value.trim();
  if (!target) return;
  addChatMsg('request', `🔗 Navigiere zu: ${target}`);
  try {
    const r = await fetch(`${FL_API}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
    });
    const d = await r.json();
    addChatMsg('success', `📍 ${d.url || target}`);
    flRefreshScreenshot();
    // Update URL input
    if (d.url) input.value = d.url;
  } catch(e) {
    addChatMsg('error', `❌ Navigation fehlgeschlagen: ${e.message}`);
  }
}

// ── Session ──
async function flSaveSession() {
  try {
    await fetch(`${FL_API}/save-session`, { method: 'POST' });
    addChatMsg('success', '💾 Session-Cookies gespeichert!');
  } catch(e) {
    addChatMsg('error', `❌ Fehler: ${e.message}`);
  }
}

// ── Form Fields ──
async function flFormFields() {
  try {
    const r = await fetch(`${FL_API}/form-fields`);
    const d = await r.json();
    if (d.count > 0) {
      addChatMsg('system', `📋 ${d.count} Formular-Felder gefunden:`);
      d.fields.forEach(f => {
        const label = f.label || f.placeholder || '(kein Label)';
        const rect = f.rect ? ` (x:${f.rect.x} y:${f.rect.y})` : '';
        addChatMsg('info', `  #${f.id} <${f.tag}> ${label}${rect}`);
      });
    } else {
      addChatMsg('system', '📋 Keine Formular-Felder gefunden');
    }
  } catch(e) {
    addChatMsg('error', `❌ Fehler: ${e.message}`);
  }
}

// ── Evaluate JS ──
async function flEvaluate(js) {
  try {
    const r = await fetch(`${FL_API}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ js }),
    });
    const d = await r.json();
    const result = d.result !== undefined ? JSON.stringify(d.result, null, 2) : JSON.stringify(d);
    addChatMsg('success', `📤 Resultat:`);
    addChatMsg('result', result.substring(0, 1000));
    return d.result;
  } catch(e) {
    addChatMsg('error', `❌ Evaluate fehlgeschlagen: ${e.message}`);
    return null;
  }
}

// ── Click coordinates ──
async function flClick(x, y) {
  try {
    const r = await fetch(`${FL_API}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x, y }),
    });
    const d = await r.json();
    addChatMsg('success', `👆 Geklickt bei (${x}, ${y}) → ${d.url || ''}`);
    flRefreshScreenshot();
  } catch(e) {
    addChatMsg('error', `❌ Click fehlgeschlagen: ${e.message}`);
  }
}

// ── Fill field ──
async function flFill(selector, text) {
  try {
    const r = await fetch(`${FL_API}/fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selector, text }),
    });
    addChatMsg('success', `✏️ Gefüllt: ${selector} = "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    flRefreshScreenshot();
  } catch(e) {
    addChatMsg('error', `❌ Fill fehlgeschlagen: ${e.message}`);
  }
}

// ── Chat ──
function addChatMsg(type, text) {
  const log = document.getElementById('flChatLog');
  const div = document.createElement('div');
  div.className = `fl-chat-msg ${type}-msg`;
  
  if (type === 'system') div.style.borderLeftColor = 'var(--accent, #6e6af0)';
  else if (type === 'success') div.style.borderLeftColor = '#2ea043';
  else if (type === 'error') div.style.borderLeftColor = '#da3633';
  else if (type === 'request') div.style.borderLeftColor = '#58a6ff';
  else if (type === 'info') div.style.borderLeftColor = '#8b949e';
  
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function flSendChat() {
  const input = document.getElementById('flChatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  flHandleChat(text);
}

function flChatKeyDown(e) {
  if (e.key === 'Enter') flSendChat();
}

async function flHandleChat(text) {
  addChatMsg('request', `👤 ${text}`);

  // Commands
  if (text.startsWith('/start')) {
    return flStartBrowser();
  }
  if (text.startsWith('/stop')) {
    return flStopBrowser();
  }
  if (text.startsWith('/click ')) {
    const parts = text.replace('/click ', '').split(',');
    if (parts.length === 2) {
      return flClick(parseInt(parts[0].trim()), parseInt(parts[1].trim()));
    }
    // Click at a URL
    if (text.includes('://')) {
      const url = text.replace('/click ', '').trim();
      return flNavigate(url);
    }
    return addChatMsg('error', '❌ /click x,y erwartet (z.B. /click 500,300)');
  }
  if (text.startsWith('/fill ')) {
    const rest = text.replace('/fill ', '');
    const colon = rest.indexOf(':');
    if (colon > 0) {
      const selector = rest.substring(0, colon).trim();
      const value = rest.substring(colon + 1).trim();
      return flFill(selector, value);
    }
    return addChatMsg('error', '❌ /fill selector:value (z.B. /fill #emailOrUsernameInput:email@test.com)');
  }
  if (text === '/fields' || text === '/form') {
    return flFormFields();
  }
  if (text.startsWith('/eval ')) {
    const js = text.replace('/eval ', '').trim();
    return flEvaluate(js);
  }
  if (text === '/save' || text === '/session') {
    return flSaveSession();
  }
  if (text === '/refresh' || text === '/reload') {
    return flRefreshScreenshot();
  }
  if (text === '/help') {
    addChatMsg('system', `📖 Befehle:
  /start              - Browser starten
  /stop               - Browser stoppen
  /navigate <url>     - Seite öffnen
  /click x,y          - Bei Koordinaten klicken
  /fill #id:text      - Feld füllen
  /fields             - Formular-Felder auslesen
  /eval js            - JavaScript ausführen
  /save               - Session speichern
  /refresh            - Screenshot aktualisieren
  /help               - Diese Hilfe`);
    return;
  }

  // Default: navigate if it looks like a URL
  if (text.startsWith('http://') || text.startsWith('https://')) {
    return flNavigate(text);
  }

  addChatMsg('system', `❓ Unbekannter Befehl. /help für Hilfe.`);
}

// ── Helper: Screenshot Refresh Loop ──
// Polls screenshot every 2s when browser is running (separate from status poll)
setInterval(() => {
  if (_flBrowserRunning) flRefreshScreenshot();
}, 2000);

// ── Helper: Status Dot ──
function setStatus(state, label) {
  const dot = document.getElementById('flStatusDot');
  const lbl = document.getElementById('flStatusLabel');
  dot.className = `fl-status-dot ${state}`;
  lbl.textContent = label;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  flPollStatus();
  // Start polling on init too
  if (!_flPollTimer) {
    _flPollTimer = setInterval(flPollStatus, 3000);
  }
});
