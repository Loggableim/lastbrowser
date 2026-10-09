# VM-Testauftrag: LastBrowser 0.1.52 (Unsignierter Testkandidat)

**Erstellt:** 2026-10-09  
**Verfasser:** Antigravity Agent  
**Empfänger:** Qualitätsprüfung / VM-Tester (CTO-Team)  
**Status:** BEREIT FÜR VM-TEST (UNSIGNIERT, TESTKANDIDAT)

---

## 1. Artefaktidentität & Prüfsummen

Zur Sicherstellung der Artefakt-Integrität vor Beginn der Prüfung müssen die folgenden Hashes mit den in der VM bereitgestellten Dateien übereinstimmen:

| Artefakt | Typ | Dateigröße | SHA-256 Prüfsumme | Signaturstatus |
| :--- | :--- | :--- | :--- | :--- |
| **`Lastbrowser-0.1.52-x64-setup.exe`** | NSIS Installer | 160.133.018 Bytes | `FE0CD66BF14BCF4AAA9B0B84105C748FC84DE05EF39EF58C0939E1B0F0F5D5DE` | `NotSigned` |
| **`Lastbrowser-0.1.52-x64-portable.exe`** | Portable EXE | 159.778.878 Bytes | `4D5F86EE9282CE96C8BE7C40BAE0D9CA01DECA451B1971B522102F9FA70E0CBD` | `NotSigned` |
| **`win-unpacked\Lastbrowser.exe`** | Direkt-Start | 205.065.216 Bytes | `0B77A4B642F56DE004AF7064CED64166A72FEE6D61759809262ED93B1A2407E9` | `NotSigned` |
| **`win-unpacked\resources\app.asar`** | Core ASAR | 63.982.571 Bytes | `B1CF5C429A00F6A8AD48E983A9EF603668C28C4260D9CDC001F7325D940C6297` | N/A |

> [!NOTE]  
> **Quell-Herkunft:** Commit `1c43f3f60208492a04a20742b05c7538444c1d88` (Tree: `c84e9a796916ebe6b6493e292241674c9ac3d5f6`), Branch `codex/guest-v2-fix-2eeb`.  
> Windows SmartScreen / UAC-Warnungen wegen fehlender Signatur sind für diesen Testkandidaten **erwartet**.

---

## 2. Testumgebung & Randbedingungen

- **Betriebssystem:** Windows 10 (21H2+) oder Windows 11 (22H2/23H2/24H2) in einer sauberen VM (Clean State oder Snapshot).
- **Netzwerk:** Für Offline-Integritätstests zunächst ohne Internet starten; für Live-Chat-Prüfung bei Bedarf Netzwerk aktivieren.
- **Benutzerrechte:** Standard-Benutzerkonto (keine Zwangs-Elevation erforderlich).
- **Keine automatische Aktualisierung:** Der integrierte Auto-Updater ist durch `lastbrowser-build-variant.json` (`offline-test`) hart deaktiviert und darf keine Produktionsupdates anfragen.

---

## 3. Durchzuführende Testschritte

### Test 1: Setup-Installation & Verknüpfungen
1. Führe `Lastbrowser-0.1.52-x64-setup.exe` aus.
2. Prüfe, ob der Setup-Assistent startet (Sprachauswahl, Zielverzeichnis frei wählbar).
3. Schließe die Installation ab.
4. **Prüfpunkte:**
   - [ ] Desktop-Verknüpfung wurde angelegt und zeigt das LastBrowser-Icon.
   - [ ] Startmenü-Eintrag "LastBrowser" existiert.
   - [ ] Installationsverzeichnis enthält `Lastbrowser.exe`, `resources/app.asar` und `resources/runtime/python/`.

### Test 2: Portable-Modus
1. Kopiere `Lastbrowser-0.1.52-x64-portable.exe` in ein separates Verzeichnis (z. B. `C:\TestPortable`).
2. Führe die Datei aus.
3. **Prüfpunkte:**
   - [ ] Browser startet ohne Installationsdialog.
   - [ ] Keine persistenten Registry-Schlüssel für Dateizuordnungen hinterlassen.

### Test 3: Erststart & Benutzeroberfläche
1. Starte `Lastbrowser.exe`.
2. **Prüfpunkte:**
   - [ ] Fenster öffnet sich flüssig ohne Flackern oder "White Screen of Death".
   - [ ] Titelleiste zeigt "LastBrowser" korrekt an.
   - [ ] Sidekick-Seitenleiste / Copilot-Panel lädt und signalisiert Betriebsbereitschaft.
   - [ ] Tab-Verwaltung (Öffnen neuer Tabs, Schließen, Adressleisteneingabe) reagiert verzögerungsfrei.

### Test 4: Lokale Python-Engine (Sidekick)
1. Überprüfe im Task-Manager oder in den Logs unter `%APPDATA%\Lastbrowser\logs`:
   - [ ] Sidekick Python-Prozess (`resources\runtime\python\python.exe`) läuft im Hintergrund.
   - [ ] Keine Fehlermeldung bezüglich fehlender Python-Module oder unerreichbarer FastAPIs.
   - [ ] Keine Zombie-Prozesse nach dem Schließen des Browsers.

### Test 5: Modell-Auswahl & Chat-Verhalten
1. Öffne das Chat-Panel in der Seitenleiste.
2. Prüfe den Modell-Picker:
   - [ ] Standardmäßig wird `openai-codex / gpt-6-luna` bzw. das konfigurierte Paar angefragt.
   - [ ] Unqualifizierte/Beta-Modelle bleiben hinter der expliziten Beta-Aktivierung geschützt.
   - [ ] Falls kein aktiver API-Schlüssel hinterlegt ist: Saubere Fehlermeldung im UI ("Offline" / "Nicht konfiguriert"), kein unbehandelter Absturz des Renderers.

### Test 6: Deinstallation
1. Schließe LastBrowser vollständig.
2. Führe die Deinstallation über `Apps & Features` (Windows-Einstellungen) oder den Uninstaller im Programmordner aus.
3. **Prüfpunkte:**
   - [ ] Installationsordner wird rückstandsfrei entfernt.
   - [ ] Verknüpfungen auf dem Desktop und im Startmenü werden sauber gelöscht.
   - [ ] Keine blockierten Dateisperren.

---

## 4. Rückmeldung & Fehlerprotokoll

Ergebnisse und etwaige Auffälligkeiten bitte mit folgenden Details rückmelden:
- VM-Version / Windows-Build (`winver`)
- Getesteter Artefakt-Typ (Setup, Portable oder Unpacked)
- Logdateien aus `%APPDATA%\Lastbrowser\logs`
- Screenshots bei UI-Anomalien
