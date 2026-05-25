# Plan: Kanban — Status-Farbcodierung + Task-Detail rechts (Vorschlag 1)

## Ziel

Das Kanban-Panel übersichtlicher machen durch:

1. **Farbcodierung** jeder Karte/Spalte nach Task-Status (todo=blau, ready=grün, running=orange, blocked=rot, done=grau)
2. **Rechte Spalte (rightpanel)** im Kanban-Modus für Task-Detail nutzen statt Workspace-File-Tree
3. **Task-Preview-Banner** oberhalb des Boards entfernen (Detail wandert nach rechts)

---

## Aktueller Stand (Code-Struktur)

**Layout 3-Zonen:**
- Sidebar (`#panelKanban`): Filter, Bulk-Actions, Task-Liste (`#kanbanList`)
- Main (`#mainKanban`): Board-Header, `#kanbanTaskPreview` (Banner), `#kanbanBoard` (Spalten+Karten)
- Rightpanel (`<aside class="rightpanel">`): Workspace File-Tree + Preview

**Wichtige Funktionen:**
- `_kanbanRenderColumn(col)` → `<section class="kanban-column" data-status="...">`
- `_kanbanCard(task, status)` → `<article class="kanban-card">`
- `loadKanbanTask(taskId)` → rendert in `#kanbanTaskPreview` (Banner)
- `_kanbanRenderTaskDetail(data)` → HTML für das Banner
- `switchPanel('kanban')` → setzt `showing-kanban` auf `<main>`, lädt Board

**Rightpanel-Management (boot.js):**
- `_workspacePanelEls()` → `.rightpanel`
- `openWorkspacePanel()`, `closeWorkspacePanel()`, `_setWorkspacePanelMode()`
- Content: `<div class="file-tree">` + `<div class="preview-area">`

**Gmail rightpanel-Tabs (existing pattern):**
- `switchRightpanelTab(tabId)` mit `data-rtab` und `.rightpanel-tab` / `.rightpanel-tab-content`

---

## Phase 1: Status-Farbcodierung

### 1a. CSS-Variablen pro Status

In `static/style.css` definieren:

```css
/* Status-Farben */
:root {
  --kanban-todo: #4FC3F7;
  --kanban-ready: #81C784;
  --kanban-running: #FFB74D;
  --kanban-blocked: #E57373;
  --kanban-done: #90A4AE;
  --kanban-archived: #90A4AE;
}
```

Keine Änderung für Dark/Light — Farben sind beides Mal gut lesbar.

### 1b. CSS für farbige Spalten-Header

```css
.kanban-column[data-status="todo"] .kanban-column-head {
  border-bottom: 2px solid var(--kanban-todo);
}
.kanban-column[data-status="todo"] .kanban-column-head span:first-child {
  color: var(--kanban-todo);
}
/* ... analog für ready, running, blocked, done, archived */
```

Jeder Column-Header bekommt einen **farbigen Bottom-Border** + der Titel in der Statusfarbe.

### 1c. CSS für 4px Linkbordüre auf Karten

```css
.kanban-card--todo { border-left: 4px solid var(--kanban-todo); }
.kanban-card--ready { border-left: 4px solid var(--kanban-ready); }
.kanban-card--running { border-left: 4px solid var(--kanban-running); }
.kanban-card--blocked { border-left: 4px solid var(--kanban-blocked); }
.kanban-card--done { border-left: 4px solid var(--kanban-done); opacity: 0.75; }
.kanban-card--archived { border-left: 4px solid var(--kanban-archived); opacity: 0.4; }
```

Staleness (amber/red) bleibt erhalten — überschreibt die Border-Color, wenn die Karte alt ist.

### 1d. JS-Änderung: Status-Klasse auf Karten

In `_kanbanCard(task, status)`:

```javascript
// Aktuell: <article class="kanban-card ${esc(stale)}" ...>
// Neu:
const statusClass = 'kanban-card--' + (status || 'todo');
return `<article class="kanban-card ${esc(statusClass)} ${esc(stale)}" ...>`;
```

Analog in `_kanbanRenderColumn(col)` — die Spalte bekommt `data-status="${esc(col.name)}"` (bereits vorhanden!).

### 1e. Farbige Status-Dots in der Sidebar-Liste

In `_kanbanRenderSidebar(columns)` — der `.kanban-list-status`-Span bekommt einen farbigen Dot:

```javascript
// Aktuell:
<span class="kanban-list-status">${esc(_kanbanColumnLabel(task.status))}</span>
// Neu:
<span class="kanban-list-status" style="color:var(--kanban-${esc(task.status)})">
  ● ${esc(_kanbanColumnLabel(task.status))}
</span>
```

### 1f. Statusfarben auch im Task-Preview/Detail

Die Status-Buttons im Banner (und später im rightpanel) bekommen die Farbe des jeweiligen Status. Dazu ein neues CSS-Snippet:

```css
.kanban-status-actions .btn[data-status] {
  border-color: var(--kanban-status);
}
```

---

## Phase 2: Rightpanel als Task-Detail nutzen

### 2a. HTML-Änderung: Rightpanel-Tabs für Kanban

In `static/index.html` — im `<aside class="rightpanel">` eine Tab-Leiste + Kanban-Content-Container einfügen:

```html
<aside class="rightpanel">
  <!-- Workspace-Content (bestehend, bleibt) -->
  <div class="rightpanel-content rightpanel-content--workspace">
    <div class="panel-header">...</div>
    <div class="breadcrumb-bar" ...></div>
    <div class="file-tree" id="fileTree">...</div>
    <div id="wsEmptyState" ...></div>
    <div class="preview-area" ...>...</div>
  </div>

  <!-- NEU: Kanban-Detail-Content (standardmäßig versteckt) -->
  <div class="rightpanel-content rightpanel-content--kanban" style="display:none">
    <div class="panel-header">
      <span>Task-Detail</span>
      <div class="panel-actions">
        <button class="panel-icon-btn" onclick="closeKanbanTaskDetail()">✕</button>
      </div>
    </div>
    <div class="kanban-detail-panel" id="kanbanDetailPanel">
      <div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">
        Klicke auf eine Karte, um Details zu sehen.
      </div>
    </div>
  </div>
</aside>
```

### 2b. CSS für Rightpanel-Kanban-Content

```css
.rightpanel-content--kanban {
  display: none;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
body.showing-kanban .rightpanel-content--workspace {
  display: none;
}
body.showing-kanban .rightpanel-content--kanban {
  display: flex;
}
.kanban-detail-panel {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
```

**Alternativ mit Tabs** (erweiterter Ansatz):
Falls später mehrere Rightpanel-Modi (Kanban-Detail, Quick-Stats, Dispatcher-Log) gewünscht sind, direkt die `data-rtab`-Struktur nutzen (wie Gmail):

```html
<div class="rightpanel-tabs" style="display:none">
  <button class="rightpanel-tab" data-rtab="kanban-detail" onclick="switchRightpanelTab('kanban-detail')">Detail</button>
  <button class="rightpanel-tab" data-rtab="kanban-stats" onclick="switchRightpanelTab('kanban-stats')">Stats</button>
</div>
```

Für Phase 1 reicht die einfache Variante ohne Tabs.

### 2c. JS: loadKanbanTask rendert ins Rightpanel

```javascript
// Aktuell in loadKanbanTask(taskId):
const preview = $('kanbanTaskPreview');
if (preview) {
  preview.style.display = '';
  preview.innerHTML = _kanbanRenderTaskDetail(data);
}

// Neu:
const detailPanel = $('kanbanDetailPanel');
if (detailPanel) {
  detailPanel.innerHTML = _kanbanRenderTaskDetail(data);
}
// Workspace-Rightpanel automatisch ausgeblendet via CSS (showing-kanban)
// Kanban-Detail-Panel automatisch eingeblendet via CSS
```

### 2d. JS: closeKanbanTaskDetail

```javascript
function closeKanbanTaskDetail() {
  _kanbanCurrentTaskId = null;
  const detailPanel = $('kanbanDetailPanel');
  if (detailPanel) {
    detailPanel.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">
      ${esc(t('kanban_select_task_hint') || 'Klicke auf eine Karte, um Details zu sehen.')}
    </div>`;
  }
  // Deselektieren der Karte im Board
  const board = $('kanbanBoard');
  if (board) {
    board.querySelectorAll('.kanban-card.selected').forEach(c => c.classList.remove('selected'));
  }
}
```

### 2e. Kanban-Detail-Content an Rightpanel anpassen

`_kanbanRenderTaskDetail(data)` muss für das Rightpanel optimiert werden:

- Weniger Padding als im Banner
- Kompaktere Status-Buttons (kleiner)
- Scrollbarer Inhalt
- `kanban-back-btn` kann als "✕"-Button im Panel-Header bleiben

CSS-Anpassungen für `.kanban-detail-panel`:
```css
.kanban-detail-panel .kanban-task-preview-header {
  flex-wrap: wrap;
}
.kanban-detail-panel .kanban-detail-grid {
  grid-template-columns: 1fr;
}
.kanban-detail-panel .kanban-comment-form {
  flex-wrap: wrap;
}
```

### 2f. Kanban-Aktivierung/Deaktivierung in switchPanel

In `switchPanel()` in `panels.js` beim Umschalten auf/nach `kanban`:

```javascript
// Beim aktivieren von Kanban:
if (nextPanel === 'kanban') {
  // CSS-Klasse showing-kanban wird bereits gesetzt (siehe switchPanel)
  // Rightpanel-Content wird automatisch via CSS umgeschaltet
  // Workspace-Content bleibt im DOM, nur ausgeblendet
  // Bei Bedarf: rightpanel öffnen, falls geschlossen
}

// Beim Deaktivieren von Kanban (prevPanel === 'kanban'):
else if (prevPanel === 'kanban') {
  closeKanbanTaskDetail();
}
```

---

## Phase 3: Task-Preview-Banner entfernen

### 3a. HTML: `#kanbanTaskPreview` ausblenden oder entfernen

Das Banner `<div class="kanban-task-preview" id="kanbanTaskPreview">` bleibt im DOM (für Rückwärtskompatibilität), wird aber via CSS standardmäßig ausgeblendet:

```css
.kanban-task-preview { display: none !important; }
```

Oder wir entfernen es ganz — da `loadKanbanTask()` nicht mehr darauf schreibt, hat es keine Funktion mehr.

### 3b. Main-Area Layout-optimierung

Durch Wegfall des Banners bekommt `#kanbanBoard` mehr vertikalen Platz. Prüfen, ob `.kanban-board-wrap` bereits `flex:1; min-height:0` hat (ja, tut es in style.css Zeile 4661).

Falls nötig: `#mainKanban` als `display:flex; flex-direction:column` setzen, damit das Board den verbleibenden Platz sauber füllt.

---

## Phase 4: Edge Cases & Optimierungen

### 4a. Mobile Viewport (< 641px)

Auf mobilen Geräten:
- Rightpanel ist standardmäßig geschlossen/hinter Overlay
- Task-Klick sollte weiterhin in `#kanbanTaskPreview` rendern (oder modaler Dialog)
- Daher: `loadKanbanTask()` prüft Viewport-Breite und rendert entweder ins Rightpanel oder zurück ins Banner

```javascript
const isMobile = window.innerWidth < 641;
if (isMobile) {
  // Alte Logik: ins #kanbanTaskPreview rendern
} else {
  // Neue Logik: ins rightpanel rendern
}
```

Das Banner bleibt daher im DOM — für mobile Geräte.

### 4b. Rightpanel-Zustand beim Kanban-Verlassen

Wenn der User von Kanban zu Chat wechselt:
- `closeKanbanTaskDetail()` aufrufen
- Workspace-Content im Rightpanel wieder einblenden (CSS entfernt `display:none`)
- Rightpanel-Zustand (offen/geschlossen) bleibt erhalten

### 4c. Workspace-Panel-Toggle in Kanban

Der Collapse-Button (`#btnCollapseWorkspacePanel`) im Rightpanel-Header bleibt sichtbar. In Kanban verbirgt er das gesamte Rightpanel (inkl. Kanban-Detail). Logik:

```javascript
// In toggleWorkspacePanel / _setWorkspacePanelMode:
// Wenn showing-kanban aktiv ist, wird das rightpanel ausgeblendet
// und der Kanban-Detail-Content verschwindet ebenfalls
```

### 4d. Task-Selektion bei Board-Refresh

Bei `loadKanban(true)` wird das Board neu gerendert. Danach prüfen, ob `_kanbanCurrentTaskId` gesetzt ist und die Karte im Board markieren (bereits vorhanden in `_kanbanRenderBoard()`? Prüfen!).

Nach dem Rendern `_kanbanRestoreTaskSelection()` aufrufen.

---

## Dateien mit Änderungen

| Datei | Änderungen |
|-------|-----------|
| `static/style.css` | + Status-Farbvariablen, + `.kanban-card--*` Klassen, + `.rightpanel-content--kanban`, + `.kanban-column[data-status] .kanban-column-head` Farbregeln, + Mobile-Media-Query-Anpassungen |
| `static/index.html` | + `<div class="rightpanel-content--kanban">` Container im Rightpanel |
| `static/panels.js` | `_kanbanCard()`: Status-Klasse hinzufügen; `_kanbanRenderSidebar()`: farbige Dots; `loadKanbanTask()`: Rendering ins Rightpanel; `closeKanbanTaskDetail()`: neue Funktion; `_kanbanRenderTaskDetail()`: kompaktere Darstellung; `switchPanel()`: Kanban-Aktiv/Deaktiv-Lifecycle |

---

## Validierung & Tests

1. **Manuell**: Kanban-Panel öffnen — Spalten-Header haben Status-Farbe
2. **Manuell**: Karten haben linke 4px-Bordüre in Statusfarbe
3. **Manuell**: Klick auf Karte → Detail erscheint rechts (nicht im Banner)
4. **Manuell**: "✕" im Rightpanel schließt Detail, Board-Ansicht bleibt
5. **Manuell**: Wechsel zu Chat → Rightpanel zeigt wieder Workspace-Tree
6. **Manuell**: Mobile Viewport (< 641px) → Detail weiter im Banner
7. **Regression**: Board-Switcher, Board-Erstellung, Bulk-Actions, Dispatcher-Buttons funktionieren noch
8. **Regression**: Drag&Drop zwischen Spalten funktioniert noch
9. **Regression**: Gmail-Panel zeigt weiterhin seinen Rightpanel-Tab

---

## Risiken & Offene Fragen

1. **Rightpanel-Collapse in Kanban**: Wenn der User das Rightpanel collapsed hat und Kanban öffnet — soll das Panel automatisch aufgeklappt werden? *Vorschlag: Nein, erst bei Task-Klick -> dann per `openWorkspacePanel('browse')` öffnen.*
2. **Workspace-Preview in Kanban**: Wenn eine Datei-Vorschau im Rightpanel offen ist und der User zu Kanban wechselt — was passiert mit der Preview? *Vorschlag: Preview bleibt im DOM, wird aber ausgeblendet. Beim Zurückwechseln wieder sichtbar.*
3. **SSE-Kanban-Events (Live-Update)**: Das Live-Update (`_kanbanEventSource`) aktualisiert das Board periodisch. Dabei könnte eine selektierte Task-Detail-Ansicht im Rightpanel überschrieben werden. *Vorschlag: `loadKanban()` überschreibt `#kanbanDetailPanel` NICHT — nur wenn ein Task neu angeklickt wird.*
4. **Mehrere Kanban-Boards**: Die Implementierung muss board-unabhängig sein — die Detail-Ansicht rechts gilt für alle Boards gleichermaßen.

---

## Nächste Schritte (Umsetzungs-Reihenfolge)

1. CSS-Variablen + `.kanban-card--*`-Klassen + Column-Header-Farben
2. `_kanbanCard()` und `_kanbanRenderSidebar()` JS-Anpassungen
3. Rightpanel-HTML (`.rightpanel-content--kanban`) einfügen
4. Rightpanel-Kanban-CSS
5. `loadKanbanTask()` auf Rightpanel umbiegen + `closeKanbanTaskDetail()`
6. `switchPanel()` Lifecycle-Erweiterung
7. `_kanbanRenderTaskDetail()` kompakter für Rightpanel
8. Mobile-Fallback (Banner beibehalten)
9. Testen, Testen, Testen
