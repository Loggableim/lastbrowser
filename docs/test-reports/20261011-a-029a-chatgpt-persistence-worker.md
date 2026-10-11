# A-029a – Provider-/Modellpersistenz beim Backend-Neustart

- Agent: `chatgpt-persistence-worker`
- Datum: 2026-10-11, Europe/Vienna
- Branch: `codex/a-029a-provider-persistence-20261011`
- Basis/Ziel: `origin/release/v0.1.52` (`d39ae7fa`)
- Scope: `services/sidekick/web/api/fastapi_bridge.py`, neuer Backend-Regressionstest, dieser Bericht. CTO hat diese Hotspots vor dem Edit freigegeben; kein Renderer-/Settings-/IPC-Fehlertext-Overlap mit A-026/A-027/A-029b.

## Ursache und Speichervertrag

`apps/desktop/src/main/services.ts` löst den Backend-Home sowohl im Quelltag `test-v0.1.47-20261007-f67320f` als auch auf der aktuellen Basis als `app.getPath('userData')/runtime` auf (normalerweise `%APPDATA%/Lastbrowser/runtime`). Installationsressourcen und Backend-Home sind getrennt. `apps/desktop/build/installer.nsh` schützt Nutzerdaten bei Auto-Update bzw. stillem Uninstall. Ein allgemeines Überschreiben des Profilordners durch Updates ist damit nicht belegt.

Provider-Konfiguration, aktives Standardmodell und Modell-Allowlist liegen in `<home>/config.yaml` (`model`, `providers.<id>.models`); API-Schlüssel je nach Provider in YAML oder `<home>/.env`, OAuth-Zustand in `<home>/auth.json`. Benannte Profile verwenden `<base>/profiles/<name>`. Die gespeicherte Auswahl steht in `<base>/active_profile`. Im Browser gespeicherte Space-/Chat-Auswahl ist zusätzlicher Renderer-Zustand und wird durch diesen Fix nicht verändert.

Konkreter Fehler: `web/api/config.py` initialisiert am Modulende das gespeicherte Profil über `profiles.init_profile_state()`. Danach ruft `fastapi_bridge._prepare_webui_runtime()` nochmals `refresh_profile_base_home_from_env()` auf. Diese Routine setzt `_active_profile = 'default'`. Das nächste Lesen der Config verwendet dadurch die Root-Config statt der weiterhin vorhandenen Config des benannten Profils. Derselbe fehlerhafte Refresh-Aufruf ist bereits im geprüften 0.1.47-Quelltag vorhanden; der Fehler wird beim Neustart sichtbar, nicht erst durch eine neue Schema-Version.

Fix: Beim interaktiven Bridge-Startup Profilwahl, Home und `.env` gemeinsam über die bestehende Initialisierung herstellen und Config anschließend neu laden. Der Independent-Worker-Pfad bleibt von der interaktiven Auswahl/.env-Initialisierung ausgenommen. Keine Datenmigration, kein Schema-Bump, kein Resetschreiben und kein Verschieben von Homes notwendig.

## Regression und Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Neuer Regressionstest vor Produktfix | **ROT:** 1 failed / 1 passed. `personal` wurde zu `default` zurückgesetzt. |
| Neuer Regressionstest nach Fix | **GRÜN:** 3 passed. Zwei frische Python-Prozesse je Root-/Named-Profil; Schema 11, Provider/Standardmodell/Allowlist/unbekannte Felder erhalten; Config und synthetische OAuth-Datei bytegleich; korrekter OAuth-Pfad; Independent-Worker lädt keine interaktive `.env`. |
| Backend: neue Persistenztests + FastAPI-Bridge + Independent-Profilisolation | **GRÜN:** 67 passed, 2 DeprecationWarnings. Für die vorhandenen `-I`-Worker wurde explizit der vorhandene gebündelte Python-3.12-Runtime unter `C:/projekte/lastbrowser/apps/desktop/runtime/python/python.exe` ausgewählt; Teststeuerung mit Dev-Python. |
| `npm ci` | Exit 0; 424 Pakete installiert. Bestehender npm Audit meldet 33 Findings; keine Abhängigkeitsänderungen. |
| `npm run test:run` | **GRÜN:** 215 Dateien, 1967 Tests. |
| `npm run build` | Exit 0; TypeScript + Vite erfolgreich. Bestehende Chunkgrößenwarnung. |
| `npm run verify:store` | Exit 0; 39 PASS, 2 WARN, 0 FAIL. Warnungen: vorläufige Store-Screenshots und fehlendes finales signiertes Paket. |
| `python -m compileall -q services/sidekick` | Exit 0. |
| `git diff --check` | Exit 0. |

Die erste npm-Suite hatte 1950 PASS / 17 übersprungen, weil `npm ci` keinen Windows-Electron-Executable bereitgestellt hatte. Nach Entpacken des bereits lokal gecachten CastLabs `37.10.3+wvcus` Windows-Archivs in das ungetrackte `node_modules/electron/dist` bestand die vollständige Suite einschließlich DOM-Probe. Archiv-SHA256: `CA9EAF74DA06A72E9FAE62B52C0EEA87A5F90456A41FBDD106333ADDBD1DC97D`.

Der erste breitere Backend-Lauf hatte 62 PASS / 5 FAIL: vorhandene Independent-Tests verwenden `-I`, wodurch dem Dev-Python 3.14 die nur im User-Site installierten Dependencies (u. a. PyYAML) fehlten. Die Wiederholung mit dem vorhandenen gebündelten Runtime bestand alle 67 Tests. Kein Produktionsprofil und keine echten Secrets wurden in Tests ausgegeben oder verändert.

## Offene Praxisprüfung

Installer-/Paket-Update 0.1.47 → neue Version, VM und Cids reale Provider-Anbindungen sind **nicht verifiziert**. Der Test belegt den reproduzierten Source-/Backend-Neustartfehler mit synthetischen alten Profilen. Er beweist weder, dass dies jede gemeldete Verbindungslücke erklärt, noch eine reale Provider-Anmeldung. VM-/Cid-Updateprüfung bleibt erforderlich; A-029b untersucht Ollama-Verbindungsprobe/Fehlertext separat. Merge nur durch Cid; kein Merge, Signieren, Tag oder Release durch diesen Auftrag.
