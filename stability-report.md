# Stabilitätsreport Hermes WebUI v0.51.44
Erstellt: 11.05.2026

## Zusammenfassung
- 30 Stabilitätsprobleme identifiziert (9 HIGH, 17 MEDIUM, 4 LOW)
- WebUI läuft aktuell stabil auf Port 8787
- Frühere Crashes (12x Exit-Code 1) durch transiente Netzwerk-Timeouts

---

## 🔴 HIGH (9 Issues)

### 1. Crash-Loop bei Netzwerk-Timeout (Exit-Code 1)
**Ort:** `server.py` / `start-windows.bat`
**Problem:** Bei DNS/Netzwerk-Ausfall schlagen `hermes_cli`-Imports fehl, was den Server mit Exit-Code 1 beendet. Der Auto-Restart (10x) verbraucht sich dann schnell.
**Fix:** Graceful Degradation — Server sollte auch ohne `hermes_cli` laufen (tut er aktuell, ABER nur wenn der Import selbst nicht crasht).
**Status:** ✅ Läuft aktuell — aber nicht zukunftssicher bei Netzwerk-Trouble.

### 2. gmail.js: 9 fetch() ohne .catch() 
**Ort:** `static/gmail.js`
**Problem:** 9 API-Aufrufe ohne Fehlerbehandlung. Bei Netzwerk-Fehler unhandled Promise Rejection.
**Beispiel:** `fetch('/api/gmail/list')` ohne `.catch()` oder `await` in try/catch.

### 3. enhancements.js: 5 fetch(), nur 2 .catch()
**Ort:** `static/enhancements.js`
**Problem:** 3 ungeschützte fetch()-Aufrufe → unhandled rejections bei API-Timeouts.

### 4. panels.js: setInterval ohne clearInterval (Memory Leak)
**Ort:** `static/panels.js`
**Problem:** Ein `setInterval()` ohne entsprechendes `clearInterval()`. Läuft ewig weiter, auch wenn Panel geschlossen wird.
**Behebung:** `clearInterval()` in cleanup-Funktion oder `onHide`-Callback.

### 5. gmail.js: setInterval ohne clearInterval
**Ort:** `static/gmail.js`
**Problem:** Mail-Polling-Intervall wird nie gestoppt → CPU/Memory-Leak bei langer Laufzeit.

### 6. enhancements.js: 2 setInterval, nur 1 clearInterval
**Ort:** `static/enhancements.js`
**Problem:** Ein Polling-Intervall ohne cleanup → potenzieller Memory Leak.

### 7. login.js: setInterval ohne clearInterval
**Ort:** `static/login.js`
**Problem:** Session-Heartbeat-Intervall nach Login nie gecleart → unnötiger Traffic.

### 8. Stale models_cache.json.*.tmp Files (11 Stück)
**Ort:** `C:\Users\logga\.hermes\webui\`
**Problem:** Bei every Crash bleiben temp-Dateien liegen. 11 Stück, bis zu 17KB.
**Risiko:** Keine Datenkorruption, aber verschwendet Speicher und könnte bei Update-Konflikten stören.
**Fix:** Temp-Files beim Startup löschen.

### 9. 119 broad `except Exception:` in routes.py
**Ort:** `api/routes.py`
**Problem:** Zu viele generische Exception-Handler verstecken echte Fehler. Debugging wird erschwert.
**Fix:** Spezifische Exception-Typen fangen wo möglich.

---

## 🟡 MEDIUM (17 Issues)

### 10. messages.js: 19 addEventListener, 0 removeEventListener
**Ort:** `static/messages.js`
**Problem:** Event-Listener werden registriert aber nie entfernt → Memory Leak bei langer Session.

### 11. terminal.js: 14 addEventListener, 0 removeEventListener
**Ort:** `static/terminal.js`
**Problem:** Terminal-Listener ohne Cleanup → Akkumulation bei Terminal-Neustarts.

### 12. sessions.js: 12 addEventListener, 5 removeEventListener
**Ort:** `static/sessions.js`
**Problem:** 7 Listener ohne Cleanup → schleichender Memory Leak.

### 13. enhancements.js: 12 addEventListener, 2 removeEventListener
**Ort:** `static/enhancements.js`
**Problem:** 10 ungecleante Listener.

### 14. ui.js: 9 addEventListener, 3 removeEventListener
**Ort:** `static/ui.js`
**Problem:** 6 ungecleante Listener.

### 15. boot.js: 41 globale Variablen (window./this.)
**Ort:** `static/boot.js`
**Problem:** Starke globale Pollution → Konflikte mit anderen Skripten/Plugins möglich.
**Fix:** Module-Pattern oder IIFE für Isolation.

### 16. terminal.js: 7 globale Variablen
**Ort:** `static/terminal.js`
**Problem:** Globale Zustände für Terminal-Instanz → Probleme bei mehreren Terminal-Tabs.

### 17. panels.js: 26 innerHTML Assignments (XSS)
**Ort:** `static/panels.js`
**Problem:** User-generierte Inhalte (Session-Titel, Messages) via innerHTML → XSS-Risiko bei bösartigen Inputs.

### 18. gmail.js: 25 innerHTML Assignments
**Ort:** `static/gmail.js`
**Problem:** E-Mail-Inhalte via innerHTML → XSS-Risiko.

### 19. onboarding.js: 17 innerHTML Assignments
**Ort:** `static/onboarding.js`
**Problem:** Konfigurierbare Texte via innerHTML → potentielles XSS.

### 20. ui.js: 8 innerHTML Assignments
**Ort:** `static/ui.js`
**Problem:** UI-Updates via innerHTML statt textContent/innerText.

### 21. workspace.js: 6 innerHTML Assignments
**Ort:** `static/workspace.js`
**Problem:** Error-Meldungen, die User-Input enthalten, via innerHTML.

### 22. sessions.js: 4 innerHTML Assignments
**Ort:** `static/sessions.js`
**Problem:** Session-Listen-Items via innerHTML.

### 23. messages.js: 5 innerHTML Assignments
**Ort:** `static/messages.js`
**Problem:** Nachrichten-Anzeige via innerHTML (höchstes Risiko, da Chat-Inhalte oft User-generiert sind).

### 24. boot.js: 21 leere catch-Blöcke
**Ort:** `static/boot.js`
**Problem:** `catch(e) {}` ohne logging → Fehler werden verschluckt, nicht diagnostizierbar.

### 25. terminal.js: 16 leere catch-Blöcke
**Ort:** `static/terminal.js`
**Problem:** Terminal-Fehler werden verschluckt.

### 26. messages.js: 11 leere catch-Blöcke
**Ort:** `static/messages.js`
**Problem:** Chat-Fehler werden verschluckt.

---

## 🟢 LOW (4 Issues)

### 27. api/config.py: 8 broad except Exception
**Ort:** `api/config.py`
**Problem:** Generische Exception-Handler in Config-Logik → Fehler bei Config-Reload schwer debugbar.

### 28. missing agent_dir führt zu startup Warnung
**Ort:** `api/config.py` → `HERMES_WEBUI_AGENT_DIR`
**Problem:** Agent-Verzeichnis wird nicht gefunden → "NOT FOUND" Warnung beim Start.
**Lösung:** `HERMES_WEBUI_AGENT_DIR=E:\hermes\agent` setzen (wird in start-windows.bat versucht, aber nicht korrekt erkannt).

### 29. Zustandsloses Login (keine Passwort-Hinterlegung)
**Ort:** `auth.py` / `settings.json`
**Problem:** Passwort wurde gelöscht (auth disabled) — konnte nicht wiederhergestellt werden.
**Fix:** Passwort-Reset-Funktion implementieren.

### 30. Kein Error-DB-Setup beim ersten Start
**Ort:** `api/error_logger.py`
**Problem:** errors.db wird erst beim ersten `log_error()`-Aufruf angelegt. Keine initiale Schema-Prüfung beim Startup.
**Fix:** Einmal `log_error()` beim Startup aufrufen oder Schema separat anlegen.

---

## Empfehlungen (Top 5 Priority Fixes)

1. **Fetch-Catch in gmail.js + enhancements.js** — 14 ungeschützte fetch-Aufrufe
2. **setInterval-Cleanup in panels.js + gmail.js** — Memory Leaks verhindern  
3. **Event-Listener Cleanup in messages.js + terminal.js** — 33 Listener ohne Remove
4. **Temp-File Cleanup** — `*.tmp` models_cache beim Startup löschen
5. **Graceful Degradation bei Netzwerk-Ausfall** — Server startet auch ohne hermes_cli sauber
