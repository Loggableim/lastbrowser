# Analyse A-025: Startverzögerung & Sperrbildschirm „Checking the secure session…“

**Auftrag:** A-025 | P1 | Bereich: B-003 Electron-Main / B-004 Identität (Start)  
**Bearbeiter:** `antigravity-worker-6`  
**Datum:** 11. Oktober 2026  
**Status:** Analyse abgeschlossen  
**Referenz-Tests / Evidenz:** `docs/test-reports/lastbrowser-0.1.50-vm-test-2026-10-09.md` (Zeile 1–8: 14–30s Startverzögerung bis Settings)  

---

## 1. Problemstellung

Beim Start der Desktop-Anwendung zeigt LastBrowser auf Windows für 15 bis 30 Sekunden ausschließlich die modale Karte:
> **„LASTBROWSER – Checking the secure session…“**  
> (Schild-Symbol, Subtitle: *Checking the secure session…*, Button: *Try again*)

Erst nach Verstreichen dieser Zeitspanne wird die normale Browser-Oberfläche (Tabs, Adressleiste, Sidebar, Webview) freigegeben.

---

## 2. Fundstellen im Quellcode

1. **Rendering der Sperrkarte (UI-Ebene):**
   - Datei: [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx#L3765-L3796)
   - Code:
     ```tsx
     if (!canRenderBrowserForAccessAuth(accessAuthChecked, {
       auth_enabled: accessAuthRequired || !accessAuthChecked,
       logged_in: accessAuthChecked && !accessAuthRequired
     })) {
       return (
         <main className="access-lock-screen">
           <section className="access-lock-card" aria-labelledby="access-lock-title">
             <div className="access-lock-icon"><ShieldCheck size={28} /></div>
             <p className="eyebrow">Lastbrowser</p>
             <h1 id="access-lock-title">{accessAuthRequired ? t('access.lock.title') : t('access.lock.checking')}</h1>
             <p>{accessAuthRequired
               ? t('access.lock.description')
               : (accessAuthError || t('access.lock.checking'))}</p>
             ...
     ```

2. **Fail-Closed Authentifizierungs-Gate:**
   - Datei: [`apps/desktop/src/renderer/access-auth.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/access-auth.ts#L7-L13)
   - Code:
     ```ts
     export function canRenderBrowserForAccessAuth(
       checked: boolean,
       status: AccessAuthStatus | null | undefined
     ): boolean {
       if (!checked || !status) return false;
       return status.auth_enabled !== true || status.logged_in === true;
     }
     ```
   - *Befund:* Solange `checked` (`accessAuthChecked`) nicht explizit `true` ist, gibt die Funktion **immer `false`** zurück. Der gesamte Render-Baum wird unterbrochen.

3. **Statusprüfungs-Hook & Sidekick-Transport-Abhängigkeit:**
   - Datei: [`apps/desktop/src/renderer/App.tsx`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/App.tsx#L1106-L1139)
   - Code:
     ```tsx
     const sidekickTransportReady = canCallSidekickApi(status);
     useEffect(() => {
       if (!sidekickTransportReady) return;
       let alive = true;
       const checkAccessStatus = async (): Promise<void> => {
         try {
           const auth = await window.lastbrowser.sidekick.getAccessAuthStatus();
           if (!alive) return;
           setAccessAuthRequired(Boolean(auth.auth_enabled && !auth.logged_in));
           setAccessAuthChecked(true);
           setAccessAuthError('');
         } catch (error) {
           if (!alive) return;
           setAccessAuthError(error instanceof Error ? error.message : String(error));
           setAccessAuthChecked(false);
         }
       };
       void checkAccessStatus();
     ```
   - *Befund:* Der Hook hat eine harte Early-Exit-Bedingung: `if (!sidekickTransportReady) return;`.

4. **Definition der Transport-Bereitschaft:**
   - Datei: [`apps/desktop/src/renderer/runtime-readiness.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/renderer/runtime-readiness.ts#L9-L16)
   - Code:
     ```ts
     export function canCallSidekickApi(status: RuntimeStatusLike): boolean {
       return status?.sidekick === 'ready'
         && status.webuiHealth === 'ready'
         && Boolean(status.webuiUrl);
     }
     ```

5. **Asynchroner Sidecar-Start & Health-Loop im Main-Prozess:**
   - Datei: [`apps/desktop/src/main/main.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/main.ts#L1283-L1287)
   - Code:
     ```ts
     services = new SidecarServices(resolveServiceLayout(appResourcesDir()));
     void services.start().then(() => ensureSidecarAuth());
     registerIpc();
     appReady = true;
     createWindow();
     ```
   - Datei: [`apps/desktop/src/main/services.ts`](file:///c:/projekte/lastbrowser/apps/desktop/src/main/services.ts#L600-L728)
   - Healthloop pollt mit 1.500 ms Intervall (`services.ts:701`).

---

## 3. Ablauf des Starts als Zeitleiste (Datei:Zeile)

| Zeitmarke | Komponente | Datei : Zeile | Vorgang / Aktion | Auswirkung auf UI |
| :--- | :--- | :--- | :--- | :--- |
| **T + 0.0 s** | Electron Main | `main.ts:1284` | `void services.start()` startet Uvicorn FastAPI Subprozess im Hintergrund. | Keine UI. |
| **T + 0.1 s** | Electron Main | `main.ts:1287` | `createWindow()` initialisiert BrowserWindow und lädt `app://index.html`. | Fenster öffnet sich. |
| **T + 0.5 s** | Renderer | `App.tsx:3765` | React mountet. State `accessAuthChecked = false`. `canRenderBrowserForAccessAuth` liefert `false`. | **Sperrkarte „Checking the secure session…“ wird sichtbar.** |
| **T + 0.5 s** | Renderer | `App.tsx:1110` | `sidekickTransportReady` ist `false`, da Python-Backend noch bootet. `checkAccessStatus()` bricht sofort ab. | Stillstand. Warten auf Sidekick. |
| **T + 1.0 s .. 20.0 s** | Python Engine | `services.ts:635` | Python 3.11/3.12 lädt Uvicorn, FastAPI, Pydantic, SQLite und initialisiert das Sidekick-Backend. | Sperrkarte blockiert weiterhin die gesamte Interaktion. |
| **T + 15.0 s .. 25.0 s** | Main Healthloop | `services.ts:717` | HTTP-GET `/api/health` liefert erstmals Status 200 OK. `webuiHealth` springt auf `'ready'`. IPC sendet ServiceStatus. | Sperrkarte noch aktiv. |
| **T + 25.1 s** | Renderer | `App.tsx:1114` | `sidekickTransportReady` wird wahr. `checkAccessStatus()` ruft `getAccessAuthStatus()` auf. | IPC-Call wird ausgeführt. |
| **T + 25.2 s** | Python Backend | `routes.py` | Liefert `{ auth_enabled: false, logged_in: false }`. | Passwort ist unkonfiguriert. |
| **T + 25.3 s** | Renderer | `App.tsx:1117` | `setAccessAuthChecked(true)` wird gesetzt. `canRenderBrowserForAccessAuth` liefert nun `true`. | **Sperrkarte verschwindet; Browser ist benutzbar.** |

---

## 4. Verhalten bei „Try again“, Offline & Netzwerkproblemen

1. **Klick auf „Try again“ (`App.tsx:3786`):**
   - Klickt der Nutzer während der Wartezeit auf „Try again“, wird `getAccessAuthStatus()` im Main-Prozess aufgerufen (`main.ts:716`).
   - `requireWebuiUrl()` in `main.ts:1191` wirft:
     `Error: Sidekick service is not ready yet.`
   - Der Fehler wird in `accessAuthError` geschrieben (`App.tsx:3791`).
   - Die Sperrkarte bleibt bestehen und zeigt nun den roten Fehlertext an.

2. **Offline-Start / Fehlendes Internet:**
   - Da Uvicorn und die Sidekick-Engine rein lokal auf `127.0.0.1` lauschen, tritt die Verzögerung auch ohne jede Internetverbindung auf. Sie ist ein lokaler Python-Kaltstart-Bottleneck.

3. **Blockade-Grad:**
   - **100 % Blockade.** Der Nutzer kann weder Tabs öffnen, noch URLs eingeben, noch Einstellungen aufrufen.

---

## 5. Ursachenanalyse & Fazit

- **Hauptursache:** Die Anwendung blockiert den gesamten Browser präventiv für ein Sicherheitsfeature (WebUI-Passwortschutz), das im Regelfall gar nicht aktiviert ist (`auth_enabled: false`).
- **Architektonischer Bruch:** Das Surfen im Web wird mit dem Laden des lokalen KI-Agenten synchronisiert, obwohl der Webbrowser auch ohne Sidekick voll funktionsfähig ist.

---

## 6. Lösungsvorschläge & Sanierungsplan

### Vorschlag A: Synchrones Cache-Flag (Sofortmaßnahme / Minimalinvasiv)
- Im `localStorage` des Renderers oder in den synchron geladenen Prefs der Electron-Shell wird ein Flag `lastbrowser_access_lock_configured` hinterlegt (Standard: `false`).
- Wenn dieses Flag `false` ist, startet `accessAuthChecked = true` und `accessAuthRequired = false` sofort.
- Wird in den Einstellungen ein Passwort vergeben, wird das Flag auf `true` gesetzt. Nur dann blockiert der Startbildschirm.

### Vorschlag B: Vollständige Entkopplung (Zielarchitektur)
- Der Browser-Shell rendert immer sofort.
- Nur das Sidekick-Panel (Sidebar / Copilot) zeigt einen Ladezustand („Sidekick starting…“), solange Uvicorn bootet.

---

## 7. Eintrag für Dauerauftrag BUGSUCHE (B-003 / B-004)

```
BUG | B-003 / B-004 | Kaltstart-Blockade durch access.lock.checking Sperrbildschirm | Schwere: hoch | Schritte: App frisch starten | erwartet: Shell und Tabs in <1s einsatzbereit | tatsächlich: 15-30s Vollbild-Sperre "Checking the secure session..." bis Python Uvicorn hochgefahren ist | Fundstelle: apps/desktop/src/renderer/App.tsx:3765-3796, access-auth.ts:7 | Beleg: VM-Testbericht 0.1.50, Zeitleisten-Codeanalyse | verifiziert: ja | Vorschlag: Fail-Open bei unkonfiguriertem Passwort / synchrones LocalStorage-Flag
```
