# Lastbrowser — Sidekick Backend Integration & Packaging Architektur

Dieses Dokument beschreibt die Architektur und Workflows für die vollständige In-Tree-Integration der Sidekick Python-Engine in Lastbrowser.

---

## 1. Monorepo-Architektur & In-Tree Source of Truth

Lastbrowser integriert das Sidekick-Backend direkt im Monorepo als permanente **Source of Truth**:
- **Pfad:** `services/sidekick/`
- **Keine externen Klone/Submodule:** Zu keinem Zeitpunkt (weder bei Entwicklung, Packaging, Test oder Laufzeit) wird ein externer Checkout von `Loggableim/sidekick-agent` oder anderen Repositories geklont oder synchronisiert.
- **Kein Regex-Patching:** Anpassungen am Backend werden direkt in den Python-Dateien unter `services/sidekick/` vorgenommen.
- **Legacy-Bereinigung:** Das historische Fragment `services/webui/` ist dauerhaft entfernt. Sämtliche API- und Agenten-Routen werden nativ von FastAPI in `services/sidekick/cli/web_server.py` und `services/sidekick/web/api/` bereitgestellt.

---

## 2. Entwicklungs-Workflow

Während der lokalen Entwicklung startet der Electron-Hauptprozess (`apps/desktop/src/main/services.ts`) das Sidekick-Backend automatisch als Sidecar-Prozess:
- **Kommando:** `python -m uvicorn cli.web_server:app --host 127.0.0.1 --port <port>`
- **Arbeitsverzeichnis (`cwd`):** `services/sidekick`
- **Python-Executable-Auflösung:**
  1. `LASTBROWSER_WEBUI_PYTHON` / `HERMES_WEBUI_PYTHON` (falls gesetzt, z.B. für eigene venvs).
  2. Lokale Desktop-Workspace-Runtime: `apps/desktop/runtime/python/python.exe`.
- **Pfad-Isolation:**
  - `web.api.config._discover_agent_dir()` und `web.api.startup._agent_dir()` lösen im integrierten Modus strikt auf `services/sidekick` auf und prüfen keine externen Benutzerordner (`~/.sidekick/sidekick-agent`, `%LOCALAPPDATA%`, etc.).
  - Veraltete Runtime-Kopien (z.B. historische `runtime/sidekick`-Ordner) werden von `resolveServiceLayout` ignoriert.

---

## 3. Packaging & Offline-Build-Vorbereitung

Der Packaging-Prozess für Windows (`npm run package:win`) ist strikt offlinefähig und deterministisch aufgebaut. Es findet eine saubere Trennung zwischen expliziter Online-Vorbereitung und Offline-Packaging statt.

### 3.1 Pinned Runtime-Abhängigkeiten & Wheelhouse
- **Anforderungsdatei:** `apps/desktop/scripts/requirements-runtime.txt`  
  Definiert exakt gepinnte Versionen aller Laufzeit-Pakete (`fastapi`, `uvicorn[standard]`, `requests`, `httpx`, `pyyaml`, `openai`, `anthropic`, `setuptools`, `wheel`).
- **Lokales Wheelhouse:** `apps/desktop/runtime/wheelhouse/`  
  Enthält alle vorkompilierten `.whl`-Dateien für die Zielplattform (Windows x64 / Python 3.12).

### 3.2 Explizite Online-Vorbereitung
Falls das Wheelhouse initial befüllt oder aktualisiert werden muss, wird dies explizit und kontrolliert ausgeführt:
```bash
# Aus dem Workspace apps/desktop:
npm run prepare:python:online

# Oder aus dem Monorepo-Root:
npm run prepare:python:online
```
Dieser Befehl lädt die Wheels via `pip download` in `apps/desktop/runtime/wheelhouse/` herunter.

### 3.3 Offline-Packaging
Beim regulären Bauen (`npm run package:win`):
1. `prepare-python-runtime.mjs` führt eine Offline-Prüfung durch (`verifyWheelhouse`).
2. **Fail-Closed bei fehlenden Abhängigkeiten:** Wenn das Wheelhouse fehlt oder leer ist, bricht der Build sofort mit einer verständlichen Fehlermeldung ab und verweist auf `npm run prepare:python:online` oder `LASTBROWSER_WHEELHOUSE`. Es werden **keine stillen Netzwerkdownloads** initiiert.
3. Die Pakete und das in-tree `services/sidekick`-Paket werden rein lokal via:
   `pip install --no-index --find-links <wheelhouseDir> --no-cache-dir --no-compile -r requirements-runtime.txt <services/sidekick>`
   in die portable Runtime (`apps/desktop/runtime/python`) installiert.
4. `electron-builder` bündelt `services/` und `runtime/python/` als Ressourcen direkt in das Installationspaket (`extraResources`).

---

## 4. Einheitliches Update-Modell (Unified Updates)

Integrierte Lastbrowser-Instanzen unterbinden alle unabhängigen Backend-Selbstupdates:
1. **Server-Side REST-API:**
   - `POST /api/sidekick/update` antwortet im integrierten Modus mit HTTP 409 Conflict (`{"ok": false, "disabled": true, "managed_by": "lastbrowser"}`).
   - Die Endpunkte `check_for_updates()`, `apply_update()` und `apply_force_update()` in `web/api/updates.py` führen keine Git-Operationen oder Upstream-Abfragen durch, sondern melden den verwalteten Lastbrowser-Status.
2. **CLI-Ebene:**
   - `sidekick update`, `sidekick update --check` und die Banner-Vorprüfung informieren den Anwender darüber, dass Sidekick als Teil von Lastbrowser aktualisiert wird, und beenden den Vorgang ohne Netzwerkzugriff.
3. **Zentraler Updater:**
   - Die Aktualisierung des Gesamtsystems (Frontend, Shell und Sidekick-Backend) erfolgt ausschließlich synchron über den Lastbrowser-Anwendungs-Updater (`window.lastbrowser.updates.check()` bzw. NSIS/Store-Updates).
