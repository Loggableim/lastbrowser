import { roadmapCatalog } from './roadmap-catalog.js';

const de = document.documentElement.lang.startsWith('de');
const words = de ? {
  vote: 'Upvote', undo: 'Stimme zurücknehmen', unavailable: 'Abstimmung momentan nicht verfügbar.',
  loading: 'Stimmen werden geladen …', saved: 'Stimme gespeichert.', removed: 'Stimme zurückgenommen.',
  failed: 'Stimme konnte nicht bestätigt werden. Bitte erneut versuchen.', retry: 'Erneut laden',
  limit: 'Zu viele Änderungen. Bitte in einer Minute erneut versuchen.'
} : {
  vote: 'Upvote', undo: 'Remove vote', unavailable: 'Voting is currently unavailable.',
  loading: 'Loading votes …', saved: 'Vote saved.', removed: 'Vote removed.',
  failed: 'Your vote could not be confirmed. Please try again.', retry: 'Reload',
  limit: 'Too many changes. Please try again in a minute.'
};
const catalog = new Map(roadmapCatalog);
const labels = new Map(roadmapCatalog.map(([id, label]) => [label, id]));
const buttons = new Map();
let snapshot = null, busy = false;
const notice = document.querySelector('[data-vote-status]');
const retry = document.querySelector('[data-vote-retry]');
function status(message) { if (notice) notice.textContent = message; }
function render() {
  for (const [id, button] of buttons) {
    const selected = snapshot?.selected.includes(id) || false;
    button.disabled = busy || !snapshot;
    button.setAttribute('aria-pressed', String(selected));
    button.textContent = `${selected ? '✓' : '↑'} ${snapshot ? snapshot.counts[id] || 0 : '—'}`;
    button.setAttribute('aria-label', `${selected ? words.undo : words.vote}: ${button.dataset.label}`);
    button.title = selected ? words.undo : words.vote;
  }
}
async function call(method = 'GET', body) {
  const response = await fetch('/api/roadmap-votes', { method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000),
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Roadmap-Vote': '1' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(response.status === 429 ? 'rate' : 'request');
  return response.json();
}
function accept(data) {
  if (!data || typeof data.counts !== 'object' || !data.counts || Array.isArray(data.counts)
    || !Array.isArray(data.selected) || typeof data.session !== 'boolean'
    || !Object.values(data.counts).every(value => Number.isSafeInteger(value) && value >= 0)
    || !data.selected.every(id => catalog.has(id))) throw new Error('data');
  snapshot = data;
}
async function load() {
  if (busy) return;
  busy = true; render(); status(words.loading);
  try { accept(await call()); status(''); if (retry) retry.hidden = true; }
  catch { snapshot = null; status(words.unavailable); if (retry) retry.hidden = false; }
  finally { busy = false; render(); }
}
async function vote(id) {
  if (busy || !snapshot) return;
  const voted = !snapshot.selected.includes(id);
  busy = true; render();
  try {
    if (!snapshot.session) await call('POST', { action: 'session' });
    accept(await call('PUT', { featureId: id, voted }));
    status(voted ? words.saved : words.removed);
  } catch (error) {
    // A network failure may follow a successful write. Read persisted state;
    // never blindly invert or increment a counter in the browser.
    try { accept(await call()); } catch { snapshot = null; }
    status(error.message === 'rate' ? words.limit : words.failed);
    if (retry) retry.hidden = false;
  } finally { busy = false; render(); }
}
for (const node of document.querySelectorAll('.kanban-card h4, .kanban-card li > strong, [data-roadmap-id]')) {
  const id = node.dataset.roadmapId || labels.get(node.textContent.trim().replace(/:$/, ''));
  if (!catalog.has(id) || buttons.has(id)) continue;
  const target = node.closest('li') || node.closest('.kanban-card') || node;
  target.classList.add('roadmap-votable');
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'roadmap-upvote';
  button.dataset.label = node.textContent.trim().replace(/:$/, '');
  button.addEventListener('click', () => void vote(id));
  buttons.set(id, button); target.append(button);
}
if (retry) { retry.textContent = words.retry; retry.addEventListener('click', () => void load()); }
if (buttons.size) {
  void load();
  setInterval(() => { if (!document.hidden) void load(); }, 60000);
}
