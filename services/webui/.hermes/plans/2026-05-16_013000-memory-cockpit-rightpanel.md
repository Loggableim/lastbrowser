# Plan: Memory-Cockpit mit rechter Werkzeugleiste (Vorschlag 1)

## Ziel

Das Memory-Panel übersichtlicher und funktionaler machen durch:

1. **Rightpanel** im Memory-Modus: Workspace-Tree durch Memory-Werkzeugleiste ersetzen (Suche, Statistik, Schnellaktionen)
2. **Sidebar** (`#panelMemory`): Karten-Layout mit Farbcodierung + Status-Dots + Tags + Timestamps
3. **Main-Area**: Editor aufwerten (Toolbar mit Markdown-Shortcuts, Wort-/Zeichenzähler)

---

## Aktueller Stand

**Layout 3-Zonen (für Memory ungenutzt):**
- Sidebar (`#panelMemory`): 4 flache Buttons (My Notes, User Profile, Supermemory, Hybrid)
- Main (`#mainMemory`): Editor/Preview für eine Sektion
- Rightpanel (`<aside class="rightpanel">`): Zeigt weiterhin Workspace-Tree (nicht Memory-bezogen)

**Bestehende Funktionen (panels.js):**
- `MEMORY_SECTIONS` Array mit 4 Keys: `memory`, `user`, `supermemory`, `hybrid`
- `loadMemory(force)` → `/api/memory` → rendert Sidebar-Buttons
- `openMemorySection(section, el)` → rendert Detail oder Suche in Main
- `_renderMemoryDetail(section)` → zeigt Markdown-Text + Edit-Button
- `_renderMemoryEdit(section)` → Textarea für Bearbeitung
- `submitMemorySave()` → POST `/api/memory/write`
- `_renderSupermemoryView()` → Suchfeld + Ergebnisse
- `_renderHybridView()` → Hybrid-Suche

**Bereits etabliertes Rightpanel-Switching-Pattern:**
- `.rightpanel-content--workspace`, `.rightpanel-content--kanban`, `.rightpanel-content--gmail`
- CSS: `body.showing-kanban .rightpanel-content--workspace { display: none }` etc.
- Gmail-style `data-rtab` Tab-System in `switchRightpanelTab(tabId)`

---

## Phase 1: Rightpanel — Memory-Werkzeugleiste

### 1a. HTML: Neuer Container `rightpanel-content--memory`

In `static/index.html`, nach dem Gmail-Container einfügen:

```html
<!-- Memory Tools Content -->
<div class="rightpanel-content rightpanel-content--memory">
  <div class="panel-header">
    <span>Memory Tools</span>
    <div class="panel-actions">
      <button class="panel-icon-btn has-tooltip has-tooltip--bottom" onclick="closeMemoryTools()" data-tooltip="Close" aria-label="Close">
        <svg width="14" height="14" viewBox="..." stroke="currentColor"...><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>
  <div class="memory-tools-panel" id="memoryToolsPanel">
    <!-- Suchleiste -->
    <div class="mem-tools-section">
      <div class="mem-tools-search">
        <input id="memToolsSearch" type="text" placeholder="🔍 Memory durchsuchen..." class="mem-tools-search-input">
      </div>
    </div>
    <!-- Quick-Stats -->
    <div class="mem-tools-section">
      <div class="mem-tools-section-title">Statistik</div>
      <div id="memToolsStats" class="mem-tools-stats">
        <div class="mem-stat-item"><span class="mem-stat-label">Notes</span><span class="mem-stat-value" id="memStatNotes">—</span></div>
        <div class="mem-stat-item"><span class="mem-stat-label">Profile</span><span class="mem-stat-value" id="memStatProfile">—</span></div>
        <div class="mem-stat-item"><span class="mem-stat-label">Zuletzt geändert</span><span class="mem-stat-value" id="memStatMtime">—</span></div>
      </div>
    </div>
    <!-- Schnellaktionen -->
    <div class="mem-tools-section">
      <div class="mem-tools-section-title">Aktionen</div>
      <div class="mem-tools-actions">
        <button class="mem-tools-btn" onclick="copyMemoryContent()" data-action="copy">📋 Kopieren</button>
        <button class="mem-tools-btn" onclick="exportMemoryMD()" data-action="export">📤 Export MD</button>
        <button class="mem-tools-btn" onclick="openMemorySearch()" data-action="search">🔎 Suchen</button>
        <button class="mem-tools-btn" onclick="enrichMemoryWithAI()" data-action="ai">🤖 Mit AI erweitern</button>
      </div>
    </div>
    <!-- Verknüpfungen -->
    <div class="mem-tools-section" id="memToolsLinks">
      <div class="mem-tools-section-title">Kontext</div>
      <div id="memToolsContext" class="mem-tools-context">
        <div class="mem-context-item">Space: <span id="memCtxSpace">—</span></div>
      </div>
    </div>
  </div>
</div>
```

### 1b. CSS für `rightpanel-content--memory`

```css
/* Rightpanel Visibility — Memory-Modus */
.rightpanel-content--memory {
  display: none;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
body.showing-memory .rightpanel-content--workspace {
  display: none !important;
}
body.showing-memory .rightpanel-content--memory {
  display: flex;
}

/* Memory Tools Panel */
.memory-tools-panel {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.mem-tools-section {
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
}
.mem-tools-section-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--muted);
  margin-bottom: 8px;
}
.mem-tools-search {
  display: flex;
  gap: 6px;
}
.mem-tools-search-input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  font-size: 12px;
  outline: none;
}
.mem-tools-search-input:focus {
  border-color: var(--accent);
}
.mem-tools-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mem-stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  padding: 2px 0;
}
.mem-stat-label { color: var(--muted); }
.mem-stat-value { color: var(--text); font-weight: 500; }
.mem-tools-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.mem-tools-btn {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text);
  font-size: 11px;
  cursor: pointer;
  text-align: center;
  transition: all .15s;
}
.mem-tools-btn:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
}
.mem-tools-context {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.6;
}
.mem-context-item { padding: 2px 0; }
```

**Achtung**: Die `.memory-tools-panel`-Klassen MÜSSEN ausserhalb des Media-Query-Blocks für `.memory-panel` definiert werden (diese Regeln sind aktuell mit 2-Space-Einrückung in style.css ~Zeile 1430, vermutlich innerhalb von `@media` oder einem Wrapper). Die neuen Regeln kommen als eigener Block, z.B. nach dem Gmail-Rightpanel-CSS (nach Zeile 5024).

### 1c. JS: Rightpanel-Logik für Memory

In `static/panels.js`:

**A) `openMemoryTools()` — Wird beim Aktivieren des Memory-Panels aufgerufen**
```javascript
function openMemoryTools() {
  // Stats aktualisieren
  _updateMemoryToolsStats();
}
```

**B) `_updateMemoryToolsStats()` — Memory-Daten ins Rightpanel schreiben**
```javascript
function _updateMemoryToolsStats() {
  if (!_memoryData) return;
  const notesSize = (_memoryData.memory || '').length;
  const profileSize = (_memoryData.user || '').length;
  const mtime = _memoryData.memory_mtime || _memoryData.user_mtime || 0;
  
  const notesEl = $('memStatNotes');
  const profileEl = $('memStatProfile');
  const mtimeEl = $('memStatMtime');
  
  if (notesEl) notesEl.textContent = _memFormatSize(notesSize);
  if (profileEl) profileEl.textContent = _memFormatSize(profileSize);
  if (mtimeEl) mtimeEl.textContent = mtime ? new Date(mtime * 1000).toLocaleString() : '—';
}
```

**C) `_memFormatSize(bytes)` — Byte-Größe formatieren**
```javascript
function _memFormatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}
```

**D) `closeMemoryTools()` — Rightpanel zurücksetzen**
```javascript
function closeMemoryTools() {
  // Nichts Besonderes — CSS blendet Workspace-Content wieder ein
}
```

**E) Schnellaktionen (einfaches Copy/Export)**
```javascript
function copyMemoryContent() {
  if (!_currentMemorySection) return;
  const text = _memorySectionContent(_currentMemorySection);
  if (!text) { showToast('No content to copy', 'error'); return; }
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied to clipboard'),
    () => showToast('Clipboard write failed', 'error')
  );
}

function exportMemoryMD() {
  if (!_currentMemorySection) return;
  const text = _memorySectionContent(_currentMemorySection);
  if (!text) { showToast('No content to export', 'error'); return; }
  const meta = _memorySectionMeta(_currentMemorySection);
  const md = `# ${t(meta.labelKey)}\n\n` + text;
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `memory-${_currentMemorySection}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function enrichMemoryWithAI() {
  showToast('AI enrichment coming soon', 'info');
}

function openMemorySearch() {
  // Fokussiert die Suchleiste im Rightpanel
  const input = $('memToolsSearch');
  if (input) input.focus();
}
```

**F) Suchleiste im Rightpanel — lokale Memory-Durchsuchung**
```javascript
function _initMemoryToolsSearch() {
  const input = $('memToolsSearch');
  if (!input) return;
  input.oninput = () => {
    const q = input.value.trim().toLowerCase();
    if (!q || !_memoryData) {
      document.querySelectorAll('#panelMemory .side-menu-item').forEach(el => el.style.display = '');
      return;
    }
    // Durchsuche allen Memory-Content
    const haystacks = {};
    for (const s of MEMORY_SECTIONS) {
      haystacks[s.key] = _memorySectionContent(s.key).toLowerCase();
    }
    document.querySelectorAll('#panelMemory .side-menu-item').forEach(el => {
      const key = el.dataset.memoryKey;
      const matches = key && haystacks[key] ? haystacks[key].includes(q) : false;
      el.style.display = matches ? '' : 'none';
    });
  };
}
```

### 1g. Rightpanel-Lebenzyklus in switchPanel

In `switchPanel()` in `panels.js` (analog zum Kanban-Kanal):

```javascript
// ── Memory-Detail-Lifecycle ──
if (nextPanel === 'memory' && prevPanel !== 'memory') {
  // Tools im Rightpanel aktivieren
  if (typeof openMemoryTools === 'function') openMemoryTools();
  // Suchleiste initialisieren
  if (typeof _initMemoryToolsSearch === 'function') setTimeout(_initMemoryToolsSearch, 100);
}
```

---

## Phase 2: Sidebar — Karten-Layout mit Farbcodierung

### 2a. HTML: Sidebar Panel aktualisieren

Die `#panelMemory` Sidebar in `index.html` bleibt gleich (Zeile 318-323), aber das Rendering in `loadMemory()` ändert sich:

**Aktuell (panels.js ~Zeile 5146-5154):**
```javascript
panel.innerHTML = '';
for (const s of MEMORY_SECTIONS) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'side-menu-item';
  el.innerHTML = `${li(s.iconKey,16)}<span>${esc(t(s.labelKey))}</span>`;
  el.onclick = () => openMemorySection(s.key, el);
  panel.appendChild(el);
}
```

**Neu mit data-key Attribut:**
```javascript
panel.innerHTML = '';
for (const s of MEMORY_SECTIONS) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'side-menu-item';
  el.dataset.memoryKey = s.key;
  el.innerHTML = `${li(s.iconKey,16)}<span>${esc(t(s.labelKey))}</span>`;
  el.onclick = () => openMemorySection(s.key, el);
  panel.appendChild(el);
}
```

### 2b. Status-Dots in der Sidebar

Jeder Eintrag bekommt einen farbigen Dot:

```javascript
// In loadMemory(), nach load der Daten, vor Rendern:
function _memorySidebarDots() {
  for (const s of MEMORY_SECTIONS) {
    const items = document.querySelectorAll(`#memoryPanel .side-menu-item`);
    items.forEach(el => {
      const key = el.dataset.memoryKey;
      if (!key) return;
      const content = _memorySectionContent(key);
      const mtime = _memorySectionMtime(key);
      if (key === 'supermemory' || key === 'hybrid') {
        // Such-Modi immer aktiv
        el.dataset.memStatus = 'search';
        return;
      }
      if (!content) {
        el.dataset.memStatus = 'empty';
      } else {
        el.dataset.memStatus = 'active';
      }
      // Timestamp als subtitle
      if (mtime) {
        const subtitle = el.querySelector('.mem-subtitle');
        if (!subtitle) {
          const sub = document.createElement('span');
          sub.className = 'mem-subtitle';
          sub.textContent = _memTimeAgo(mtime);
          el.appendChild(sub);
        }
      }
    });
  }
}
```

### 2c. CSS für Sidebar-Upgrade

```css
#memoryPanel .side-menu-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 12px;
  margin-bottom: 2px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: all .12s;
}
#memoryPanel .side-menu-item::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
#memoryPanel .side-menu-item[data-mem-status="active"]::before {
  background: var(--success, #22c55e);
}
#memoryPanel .side-menu-item[data-mem-status="empty"]::before {
  background: var(--muted, #888);
  opacity: .4;
}
#memoryPanel .side-menu-item[data-mem-status="search"]::before {
  background: var(--accent);
}
#memoryPanel .side-menu-item:hover::before {
  transform: scale(1.2);
}
.mem-subtitle {
  font-size: 10px;
  color: var(--muted);
  opacity: .6;
  font-weight: 400;
}
```

### 2d. Hilfsfunktion `_memTimeAgo()`

```javascript
function _memTimeAgo(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp * 1000;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.round(hours / 24);
  return `vor ${days}d`;
}
```

---

## Phase 3: Main-Area Editor-Toolbar

### 3a. Editor-Toolbar in `_renderMemoryEdit()`

In `_renderMemoryEdit()` wird der Textarea eine Toolbar vorangestellt:

```javascript
// Zusätzlich zum bestehenden Inhalt:
body.innerHTML = `
  <div class="main-view-content">
    <form class="detail-form" onsubmit="event.preventDefault(); submitMemorySave();">
      <div class="mem-editor-toolbar">
        <button type="button" class="mem-tb-btn" onclick="_memInsertMarkdown('**', '**')" title="Fett">B</button>
        <button type="button" class="mem-tb-btn" onclick="_memInsertMarkdown('*', '*')" title="Kursiv">I</button>
        <button type="button" class="mem-tb-btn mono" onclick="_memInsertMarkdown('\\`', '\\`')" title="Code">&lt;/&gt;</button>
        <button type="button" class="mem-tb-btn" onclick="_memInsertMarkdown('- ', '')" title="Liste">• List</button>
        <button type="button" class="mem-tb-btn" onclick="_memInsertMarkdown('## ', '')" title="Heading">H2</button>
        <button type="button" class="mem-tb-btn" onclick="_memInsertMarkdown('---\\n', '')" title="Trennlinie">—</button>
        <span class="mem-tb-spacer"></span>
        <span class="mem-tb-wordcount" id="memWordCount">0 Wörter</span>
      </div>
      <div class="detail-form-row">
        <textarea id="memEditContent" rows="20" spellcheck="false"
          oninput="_memUpdateWordCount()">${esc(content)}</textarea>
      </div>
      <div id="memEditError" class="detail-form-error" style="display:none"></div>
    </form>
  </div>`;
```

### 3b. Toolbar-Funktionen

```javascript
function _memInsertMarkdown(before, after) {
  const ta = $('memEditContent');
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const text = ta.value;
  const selected = text.substring(start, end);
  const newText = text.substring(0, start) + before + selected + after + text.substring(end);
  ta.value = newText;
  ta.selectionStart = start + before.length;
  ta.selectionEnd = start + before.length + selected.length;
  ta.focus();
  _memUpdateWordCount();
}

function _memUpdateWordCount() {
  const ta = $('memEditContent');
  const wc = $('memWordCount');
  if (!ta || !wc) return;
  const text = ta.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  wc.textContent = `${words} Wörter · ${chars} Zeichen`;
}
```

### 3c. CSS für Editor-Toolbar

```css
.mem-editor-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
}
.mem-tb-btn {
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all .12s;
  line-height: 1.4;
}
.mem-tb-btn:hover {
  border-color: var(--border);
  background: var(--hover-bg);
  color: var(--text);
}
.mem-tb-btn.mono { font-family: var(--mono); }
.mem-tb-spacer { flex: 1; }
.mem-tb-wordcount {
  font-size: 10px;
  color: var(--muted);
  opacity: .6;
}
```

---

## Phase 4: Integration und Lifecycle

### 4a. `loadMemory()` aktualisieren

Nach dem Rendern der Sidebar-Buttons den `data-mem-status` setzen und die Stats im Rightpanel aktualisieren:

```javascript
async function loadMemory(force) {
  // ... bestehende Logik ...
  panel.innerHTML = '';
  for (const s of MEMORY_SECTIONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'side-menu-item';
    el.dataset.memoryKey = s.key;  // NEU
    el.innerHTML = `${li(s.iconKey,16)}<span>${esc(t(s.labelKey))}</span>`;
    el.onclick = () => openMemorySection(s.key, el);
    panel.appendChild(el);
  }
  // NEU: Dots + Stats
  _memorySidebarDots();
  _updateMemoryToolsStats();
  // ... restliche Logik ...
}
```

### 4b. `switchPanel()` Lifecycle

Nach dem bestehenden Kanban-Lifecycle-Hook einfügen:

```javascript
// ── Memory-Detail-Lifecycle ──
if (nextPanel === 'memory' && prevPanel !== 'memory') {
  // Rightpanel-Tools aktivieren
  if (typeof openMemoryTools === 'function') openMemoryTools();
  if (typeof _initMemoryToolsSearch === 'function') setTimeout(_initMemoryToolsSearch, 100);
} else if (prevPanel === 'memory' && nextPanel !== 'memory') {
  // Beim Verlassen cleanup (derzeit nichts erforderlich)
}
```

---

## Dateien mit Änderungen

| Datei | Änderungen |
|-------|-----------|
| `static/index.html` | + `.rightpanel-content--memory` Container (nach Gmail-Container, ~Zeile 1615) |
| `static/style.css` | + `.rightpanel-content--memory` Visibility-Regeln (nach bestehendem Rightpanel-CSS ~Zeile 5024) |
| | + `.memory-tools-panel`, `.mem-tools-*`, `.mem-editor-toolbar`, `.mem-tb-*`, Sidebar-Upgrade-CSS |
| `static/panels.js` | `loadMemory()`: `data-memoryKey` Attribut + `_memorySidebarDots()` + `_updateMemoryToolsStats()` |
| | `_renderMemoryEdit()`: Toolbar-HTML einfügen + `_memUpdateWordCount()` |
| | NEU: `openMemoryTools()`, `_updateMemoryToolsStats()`, `_memFormatSize()`, `closeMemoryTools()` |
| | NEU: `copyMemoryContent()`, `exportMemoryMD()`, `enrichMemoryWithAI()`, `openMemorySearch()` |
| | NEU: `_initMemoryToolsSearch()`, `_memInsertMarkdown()`, `_memUpdateWordCount()`, `_memTimeAgo()` |
| | NEU: `_memorySidebarDots()` |
| | `switchPanel()`: Memory-Lifecycle-Hook |
| `static/i18n.js` | (optional) i18n-Keys für Tooltips/Labels |

---

## Validierung & Tests

1. **Memory-Panel öffnen** → Sidebar zeigt 4 Einträge mit Status-Dots (grün=Inhalt, grau=leer, accent=Suche)
2. **Rechte Spalte** → Workspace-Tree verschwindet, Memory-Tools erscheinen
3. **Stats** → Zeigen korrekte KB-Größen und letzte Änderung
4. **Suche** (im Rightpanel) → Filtert Sidebar-Einträge in Echtzeit
5. **Kopieren** → Inhalt in Zwischenablage
6. **Export MD** → Lädt `.md`-Datei herunter
7. **Editor-Toolbar** → Buttons fügen Markdown um Selektion ein
8. **Wordcount** → Aktualisiert live während des Tippens
9. **Panel-Wechsel** → Zu Chat/Gmail -> Workspace-Tree wieder sichtbar
10. **Regression**: Bestehende Memory-Funktionen (Editieren, Speichern, Supermemory-Suche, Hybrid-Suche) arbeiten weiter

---

## Risiken & Offene Fragen

1. **Rightpanel-Collapse**: Wenn Memory-Panel aktiv ist und User das Rightpanel collapsed — soll die Werkzeugleiste dann auch verschwinden? *Vorschlag: Ja, `_setWorkspacePanelMode()` blendet alles aus.*
2. **Mobile**: Auf schmalen Viewports (< 641px) ist das Rightpanel ohnehin versteckt — keine Änderung nötig.
3. **AI-Erweiterung**: `enrichMemoryWithAI()` ist vorerst ein Placeholder. Spätere Implementierung könnte `/api/memory/enrich` aufrufen.
4. **Memory-Datenformat**: Die aktuelle API liefert nur 2 große Strings (`memory`, `user`). Strukturierte Memory-Einträge (mehrere Notizen mit Tags) brauchen eine separate API-Erweiterung — nicht Teil dieses Plans.

---

## Nächste Schritte (Umsetzungs-Reihenfolge)

1. CSS: Rightpanel-Visibility + Memory-Tools-Styles
2. HTML: `.rightpanel-content--memory` Container
3. JS: Hilfsfunktionen (`_memFormatSize`, `_memTimeAgo`, `_memInsertMarkdown`, `_memUpdateWordCount`)
4. JS: `loadMemory()` Upgrade (data-memoryKey + Dots)
5. JS: `_renderMemoryEdit()` Toolbar + Wordcount
6. JS: Rightpanel-Tools (`openMemoryTools`, Stats, Suche, Aktionen)
7. JS: `switchPanel()` Lifecycle-Hook
8. Testen
