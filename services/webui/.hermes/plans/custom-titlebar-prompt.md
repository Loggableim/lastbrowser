# Prompt für externes LLM: Custom Titlebar (Frameless)

**Kontext**: Hermes WebUI läuft im borderless `--app=` Chromium-Modus. Die app-titlebar existiert bereits als 38px-Header mit `-webkit-app-region: drag`, aber die nativen OS-Fenster-Buttons (Minimize/Maximize/Close) werden separat von Chromium in der `titlebar-area` gerendert.

**Ziel**: Die native Titlebar über CSS `window-controls-overlay` verstecken und eigene HTML/CSS-Buttons in die bestehende `.app-titlebar` integrieren, sodass die Leiste einheitlich ist und Platz für Features bietet.

## Implementierungs-Schritte

### 1. CSS: Environment Variables für Titlebar nutzen

Chromium setzt `env(titlebar-area-x, y, width, height)` wenn `display: borderless` aktiv ist. Die `.app-titlebar` muss sich danach richten:

```css
.app-titlebar {
  /* Vorhanden: */
  display: flex; align-items: center; height: 38px;

  /* NEU: Platz für OS-Buttons rechts reservieren */
  padding-right: env(titlebar-area-width, 0px);
  /* Drag-Region: alles links von den Buttons */
}
```

Das `.app-titlebar-inner` mit Logo/Title/Space-Selektor füllt den Rest.

### 2. HTML: Window-Controls-Buttons in die Titlebar

In `static/index.html` innerhalb `<header class="app-titlebar">`, NACH `.app-titlebar-spacer` (oder als separates `.window-controls`-Div):

```html
<div class="window-controls" style="display:none">
  <button class="window-btn" onclick="windowControls.minimize()" title="Minimize" aria-label="Minimize">
    <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
  </button>
  <button class="window-btn" onclick="windowControls.maximize()" title="Maximize" aria-label="Maximize">
    <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
  </button>
  <button class="window-btn window-btn-close" onclick="windowControls.close()" title="Close" aria-label="Close">
    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
  </button>
</div>
```

### 3. CSS: Styling der Window-Buttons

```css
.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
  margin-left: auto;
  flex-shrink: 0;
}
.window-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;
  padding: 0;
}
.window-btn:hover {
  background: var(--hover-bg);
  color: var(--text);
}
.window-btn-close:hover {
  background: rgba(255, 80, 80, 0.18);
  color: #ff4444;
}
```

### 4. JS: Fenster-Steuerung + Overlay-Erkennung

```javascript
// Fenster-API-Prüfung
const windowControls = {
  supported: navigator.windowControlsOverlay !== undefined,
  minimize() {
    if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: borderless)').matches) {
      // Im --app-Modus: CSS-only, Chromium rendert die Buttons automatisch
      // Wir nutzen navigator.windowControlsOverlay zur Erkennung
    }
    // Fallback: window.close() / standard
  },
  maximize() {},
  close() { window.close(); }
};

// Prüfen ob overlay aktiv ist
if ('windowControlsOverlay' in navigator) {
  document.querySelector('.window-controls').style.display = 'flex';
  navigator.windowControlsOverlay.addEventListener('geometrychange', (e) => {
    const { x, y, width, height } = e.titlebarAreaRect;
    document.documentElement.style.setProperty('--titlebar-width', width + 'px');
  });
}
```

### 5. Zusätzlich: Titlebar-Platz für Features nutzen

Nach der Integration der Buttons kann die `.app-titlebar` folgende zusätzliche Elemente aufnehmen:
- **System-Health-Status** (kleiner grüner/roter Punkt)
- **Panel-Name** (automatisch per `syncAppTitlebar()`)
- **Update-Badge** (bei neuer Version)
- **Mode-Indikator** (Action/Plan/BG)
- **Spacer** + rechts die Window-Controls

Alle Elemente müssen `-webkit-app-region: no-drag` haben (Buttons, Klick-Elemente), der Rest der Titlebar bleibt `drag`.

### Validierung

- Im `--app=` borderless Chromium-Fenster: Buttons sichtbar, native Titlebar verschwunden
- Klick auf Minimize/Maximize/Close funktioniert
- Drag auf Titlebar verschiebt Fenster
- Space-Selector und andere Klick-Elemente funktionieren (kein Drag-Konflikt)
- Fallback: Ohne `windowControlsOverlay`-Unterstützung bleiben Buttons versteckt (`display:none`)
