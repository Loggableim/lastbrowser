# Windows Store 0.1.61: Castlabs und Local AI

## Windows-Taskleistensymbol

Am 26. November wurde der lokale 0.1.62-RC2-Payload auf Issue #293 geprüft. Das `app.asar` enthält `dist/renderer/Lastbrowser.ico`. Das mit `System.Drawing.Icon.ExtractAssociatedIcon` gelesene 32-Pixel-Symbol der gepackten `Lastbrowser.exe` entspricht jedoch dem Symbol der verwendeten Castlabs-`electron.exe` und unterscheidet sich von `apps/desktop/build/icon.ico`. Der Store-Payload-Build setzt `win.signAndEditExecutable` explizit auf `false`. Diese Prüfung belegt den EXE-Ressourcenunterschied, aber noch nicht, welches Symbol Windows bei der installierten Store-App in der Taskleiste anzeigt.

Der offene PR #323 schlägt eine AppUserModelID und Icon-Fallbacks vor. Vor einer Übernahme muss die Identität der MSIX-App berücksichtigt und der tatsächliche Taskleistenauftritt des installierten Pakets geprüft werden. Ein Ändern der Castlabs-EXE muss mit den Anforderungen an Widevine und die Signaturreihenfolge vereinbar sein.

Stand 19. November 2026. Basis ist der Store-Zweig mit Nova-Assistenten und verschlüsselten Spaces ab `dc3683d`.

## Browser-Engine

Windows x64 aus dem offiziellen Castlabs-Archiv gestartet. `44.9.3+wvcus` meldet Chromium `152.0.7977.167`. `45.2.1+wvcus` meldet `156.0.8078.75` und ist mit Commit `ab2120c6a5d49d412bcb2b7e3f9c9c3e74cb0243` gepinnt. Das Archiv für Win32 x64 entspricht der offiziellen SHA-256 `a17f87a95a62e8f336d6fa18e57b9bc83d513b02211e4e5771a45cfd7482740e`.

§10.2.1 verlangt für Browser höchstens zwei Hauptversionen Abstand und zeitnahe Sicherheitskorrekturen. Chromium 156 liegt innerhalb von zwei Hauptversionen zu 158. Der Castlabs-Build liegt unter dem Chromium-156-Sicherheitsstand `156.0.8078.100` der neueren Upstream-Electron-Reihe. Vor öffentlicher Einreichung muss geklärt sein, ob die einschlägigen Korrekturen in einem aktualisierten Castlabs-Build vorliegen. VMP und Wiedergabe im fertigen Windows-Paket sind separat abzunehmen.

[Store-Richtlinie](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#102-security) · [Castlabs 45.2.1](https://github.com/castlabs/electron-releases/releases/tag/v45.2.1%2Bwvcus) · [Upstream Electron 45.4.1](https://releases.electronjs.org/release/v45.4.1)

## Local AI

Alle vier CPU- und Vulkan-Engine-Inventare wurden aus den gepinnten Herstellerarchiven und Lizenzquellen bezogen. Alle 162 inventarisierten Dateien wurden auf Größe und SHA-256 geprüft. Auf Windows 10 22H2 stürzte llama.cpp b11429 in beiden Varianten bei `--version` und `--help` mit `0xC0000005` ab. In einer lokalen Kopie liefen dieselben Binaries mit den App-lokalen VC++-DLLs. Windows `System32` hatte eine ältere VC++-Laufzeit und kein `vcruntime140_1.dll`.

Die Release-Eingabe ist Microsofts Paket `Microsoft.VC.14.44.17.14.CRT.Redist.X64.base` Version `14.44.35211` (VSIX-SHA-256 `4aaf54db0bfc9435f7c3660e1a00237a4b556042bfeea64bde44c2e0194e6ee5`). Es werden nur unveränderte, gültig Microsoft-signierte Dateien aus `Contents/VC/Redist/MSVC/14.44.35112/x64/Microsoft.VC143.CRT` übernommen. `msvcp140_codecvt_ids.dll` wird zusätzlich für Stable Diffusion mitgeführt. Die Dateipins stehen in `apps/desktop/scripts/prepare-local-model-engines.mjs`. Die Weitergabe erfolgt nach den anwendbaren Visual-Studio-Lizenzbedingungen.

Vorbereitung vom Repo-Stamm:

```powershell
node apps/desktop/scripts/prepare-local-model-engines.mjs --source "<geprüfte Engine-Eingaben>" --vc-runtime-source "<extrahiertes VC143.CRT-Verzeichnis>"
node apps/desktop/scripts/prepare-local-model-engines.mjs --verify .
```

Der Paketbau verifiziert das Inventar im Arbeitsbaum, im entpackten Paket und vor dem MSIX-Packen. Eine fehlende DLL wurde im negativen Test abgewiesen. Nach Staging aus dem Microsoft-Paket bestanden `--version` und `--help` für alle vier Engines. Das beweist die lokale Startfähigkeit, noch keine Inferenz auf allen Geräten oder die Abnahme des installierten MSIX.

llama.cpp b11429 erzeugte mit dem offiziellen Testmodell `stories260K.gguf` eine Textantwort über die lokale HTTP-Schnittstelle auf der CPU. Die Windows-Testsitzung stellte kein nutzbares Vulkan-Gerät bereit. Das Testmodell liegt außerhalb des Paketinputs. Bildgenerierung wurde noch nicht end-to-end geprüft.

[Visual C++-Weitergabe](https://learn.microsoft.com/cpp/windows/redistributing-visual-cpp-files) · [Redistributionsliste Visual Studio 2022](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution)

## Paketinhalte

Der erste vollständige Windows-Payload enthielt ein 1.335.937.026 Byte großes `app.asar`. Darin lagen zusätzlich zum vorgesehenen Programm etwa 1,17 GB an Laufzeiten und Cache-Archiven. Ursache war die normalisierte Electron-Builder-Konfiguration: Ein separater Windows-Dateifilter mit ausschließlich Ausschlüssen erhielt implizit `**/*`. Der Store-Build führt die Windows-Ausschlüsse jetzt in derselben Allowlist wie die allgemeinen Regeln. Die MSIX-Erstellung lässt im ASAR-Stamm nur `dist`, `node_modules` und `package.json` zu. Das fehlerhafte Archiv wurde damit vor MakeAppx abgewiesen.

Der Windows-Spaces-Test mit dem neu bereitgestellten JDK, dem gepinnten Cryptomator-Bestand und der vorhandenen Entwicklungs-Electron-Laufzeit mountete einen synthetischen Tresor. Der Test fand in 100 geprüften Backing-Dateien keinen synthetischen Klartext und bestätigte, dass das Profil nach Sperren und Wiederöffnen erhalten blieb. Das Testlaufwerk wurde ausgehängt. Dieser Lauf ersetzt weder die Prüfung aus dem fertigen MSIX noch einen physischen Wiederherstellungstest mit TPM.

## Kombiniertes Windows-Testpaket

- `LastBrowser-0.1.61-castlabs45.2.1-local-ai-qa.msix`, SHA-256 `d02ae667c5df063a48871f0f4c0a23ad87334a81e7d6e42279e731e874287e23`, 681.014.752 Byte. Identität `CIDAPPS.LastBrowserBeta`, Paketversion `1.1.61.0`, Anzeigename **LastBrowser**. Das korrigierte ASAR enthält am Stamm nur `dist`, `node_modules` und `package.json` und ist 141.027.795 Byte groß. MakeAppx wurde aus PowerShell 7 aufgerufen, da das lange Arbeitsverzeichnis unter Windows PowerShell 5.1 fehlschlug.
- Der MSIX-Registrierungstest startete das Paket mit frischem Profil. 32 Aufnahmen in acht Sprachen wurden an die SHA-256 von MSIX, EXE und ASAR gebunden. Die App endete mit Code 0 und die temporäre Registrierung wurde entfernt. Der Vorabcheck mit exakt diesem Paket und Aufnahmenachweis meldete 37 bestandene Prüfungen, keine Warnungen und keine Fehler.
- Der separate Assistententest startete die exakt gleiche EXE mit isoliertem Profil. Sidekick meldete Bereitschaft. Der Einstieg, drei Reiter, zehn Vorlagen, beide Aktivitätslisten und das Speichern und Wiederöffnen eines eigenen Assistenten wurden geprüft. Die App- und ASAR-Hashes des Assistententests stimmen mit dem MSIX-Aufnahmenachweis überein.
- Alle vier Local-AI-Inventare sind im Paket erneut vollständig verifiziert. llama.cpp erzeugte mit dem aus dem Testpaket stammenden Server und den enthaltenen VC++-DLLs eine CPU-Textantwort. Vulkan-Inferenz und Bildgenerierung bleiben offen.
- Der Kandidat wurde vor Ergänzung der versionsgenauen Lizenztexte für SIV Mode 1.5.2 und Bouncy Castle 1.78 gebaut. Beide Texte sind im Quellbaum eingebunden und nach erneutem Staging anhand der Upstream-Prüfsummen verifiziert. Die genaue Azul-CRaC-Quelle und der Bezugsweg für korrespondierende Quellen fehlen noch. Für die Einreichung sind außerdem Chromium-Sicherheitspatches, Altersfreigabe, geprüfte Live-Links und der endgültige Windows-Paketstand offen. Dieses lokale Paket wurde nicht hochgeladen.

## Reduzierter Spaces-Bestand für das nächste Paket

Die bisherige Azul-Quellanfrage betrifft den archivierten QA-Kandidaten. Die aktuelle Staging-Regel übernimmt aus dem gepinnten Cryptomator-Archiv nur die 41 JARs unter `app/mods` und `LICENSE.txt`. Ausführung und Initialisierung verwenden wie bisher das separat gepinnte Microsoft-JDK. Die Regel für das MSIX fordert die SIV-Mode- und Bouncy-Castle-Hinweise und weist den nicht verwendeten Launcher und dessen Java-Verzeichnis ab.

Die neue Staging-Regel wurde aus allen drei verifizierten Eingangspaketen ausgeführt. Der synthetische WinFsp-Test mit dem reduzierten Bestand ließ sich erneut sperren und öffnen, hängte das Testlaufwerk aus und fand in 100 geprüften Backing-Dateien keinen synthetischen Klartext.

## Windows-Testpaket mit reduziertem Spaces-Bestand

- `LastBrowser-0.1.61-no-azul-verified-qa.msix`, SHA-256 `36123e87e13a810972582ca4fa40d7bba03023ce9cae85cdd38530cf876f9974`. Alle 41 JARs und der Cryptomator-Lizenztext stimmen mit den Dateien im gepinnten Cryptomator-Archiv überein. Das MSIX enthält das Microsoft-JDK sowie die Lizenztexte für SIV Mode und Bouncy Castle. Der Preflight wies den archivierten Kandidaten mit eingebettetem Azul-JRE ab.
- Die Windows-Startprüfung mit frischem Profil beendete die App mit Code 0 und entfernte die temporäre Registrierung. Der Bericht bindet die 32 Aufnahmen in acht Sprachen an das MSIX, die EXE und das `app.asar`. Der Preflight meldete 37 bestandene Prüfungen und keine Fehler, einschließlich aller 30 Systemintegrationstests.
- Der aus diesem MSIX stammende llama.cpp-Server erzeugte lokal eine CPU-Textantwort. Die Testsitzung stellte kein nutzbares Vulkan-Gerät bereit. Die zusätzlichen Hinweise zu Logback, Gson und JSR-305 wurden nach dem Paketbau in den Arbeitsbaum übernommen und sind für den nächsten Build vorgesehen.
- Der separat extrahierte Browser aus demselben MSIX (identische EXE und identisches `app.asar`) installierte Widevine CDM `4.10.3112.0` in einem frischen Profil. Windows meldete eine gültige Authenticode-Signatur für `widevinecdm.dll`. Auf einer lokalen Testseite stellte `com.widevine.alpha` für H.264/MP4 die EME-`MediaKeys` bereit und band sie an ein Videoelement. Die EME-Sitzung endete mit Code 0. Lizenzserver, Wiedergabe verschlüsselter Medien und Produktions-VMP wurden dabei nicht geprüft.
- Das installierte Windows App Certification Kit erfordert Administratorrechte. Der lokale Aufruf im aktiven Benutzerprofil erzeugte wegen fehlender Rechte keinen XML-Bericht. Der Repository-Preflight und die Store-Zertifizierung sind getrennte Prüfungen.
- Windows 10 registrierte aus dem Manifest und der EXE des exakten QA-MSIX für `http`, `https`, `.html`, `.htm`, `.shtml` und `.xhtml` sechs vorhandene AppX-Handler. Die temporäre Entwicklerregistrierung wurde entfernt und die vorhandenen Standardbrowser-Einstellungen waren danach identisch. Die Auswahl von LastBrowser als Standardbrowser und das anschließende Öffnen eines Links wurden dabei nicht durchgeführt.
- Mit dem aus dem QA-MSIX extrahierten Browser und dem gebündelten Sidekick stoppte reguläres Schließen den Browser (Code 0) und beide Python-Prozesse. Nach erzwungenem Beenden des Browserprozesses blieb der Uvicorn-Kindprozess des bereits beendeten Python-Supervisors über die achtsekündige Prüfphase hinaus aktiv. Der Testprozess wurde nach der Diagnose beendet.

## Widevine-Start im nächsten Paket

Am 26. November 2026 spielte ein isoliertes Windows-Testprofil mit dem lokal gebauten, nicht veröffentlichten 0.1.62-Entwicklungspaket den öffentlichen Shaka-Widevine-Testtitel auch nach einem Sprung auf Sekunde 12 ab: `currentTime` erreichte 13,18, `readyState` war 4, MediaKeys waren vorhanden und der Player meldete keinen Fehler. Der Test nutzt den öffentlichen No-Auth-Lizenzserver und prüft damit eine konkrete verschlüsselte Teststrecke; er beweist weder Spotify- noch Disney+-Wiedergabe und ersetzt keinen Test des endgültigen Store-Pakets. Aufruf: `LASTBROWSER_SMOKE_DRM=1`, `LASTBROWSER_SMOKE_OLLAMA=0` und `LASTBROWSER_EXE` auf das lokale Testpaket setzen, dann `node scripts/smoke-browser.mjs`. [Shaka-Testinhalt und Lizenzserver](https://github.com/shaka-project/shaka-player/blob/main/docs/tutorials/license-server-auth.md)

Ein weiterer Lauf mit `LASTBROWSER_SMOKE_STREAMING_PAGES=1` öffnete Spotify, Netflix und Disney+ im frischen Profil ohne Anmeldung. Die jeweiligen WebViews meldeten `readyState=complete` und einen DOM-Body; Spotify- und Netflix-Wiedergabe sowie Disney+-Wiedergabe wurden dabei nicht geprüft. Bei Disney+ trat während einer Weiterleitung zusätzlich `ERR_ABORTED` auf; daraus allein folgt kein Lade- oder Wiedergabefehler. Der User-Agent enthielt in allen drei WebViews `Electron/`; ob ein Dienst dies für die Wiedergabe berücksichtigt, ist nicht belegt. Die regulären Browserprüfungen bestanden mit 67/67, zwei alte Prüfungen wurden übersprungen.

Der neu gebaute lokale Windows-Payload `goal-local-test-r6-20261126/win-unpacked` wurde anschließend mit `LASTBROWSER_SMOKE_DRM=1`, `LASTBROWSER_SMOKE_STREAMING_PAGES=1` und isoliertem Profil geprüft: **68/68 Prüfungen bestanden**, zwei wurden übersprungen. Das öffentliche Widevine-Testvideo spielte nach Lizenzabruf bis 13,02 Sekunden (`readyState=4`, MediaKeys vorhanden, kein Playerfehler). Die öffentlichen Spotify-, Netflix- und Disney+-Seiten meldeten jeweils einen vollständigen DOM ohne angemeldete Wiedergabe. Bei der Disney+-Weiterleitung trat erneut `ERR_ABORTED` auf. Dies belegt weder eine Ursache für Issue #386 noch die Wiedergabefähigkeit dieser Kontodienste; der lokale Payload ist kein final geprüftes Store-MSIX.

Ein weiterer lokaler Windows-Payload `goal-local-test-r7-20261126/win-unpacked` bestand am 26. November 2026 denselben isolierten Browsertest mit **68/68 Prüfungen**, zwei übersprungenen Prüfungen und Exit-Code 0. Das öffentliche DRM-Testvideo erhielt eine Lizenz und spielte bis 13,03 Sekunden; die öffentlichen Seiten von Spotify, Netflix und Disney+ wurden ohne Anmeldung geladen. Bei Disney+ trat während einer Weiterleitung erneut `ERR_ABORTED` auf. Die Kontowiedergabe wurde nicht getestet. Der Payload wurde ohne VMP-Signierung gebaut und enthält keinen gebündelten OpenCode-Client. Eine nach diesem Paketbau ergänzte Erkennung abgekürzter PowerShell-Parameter ist darin noch nicht enthalten; das Paket ist kein Nachweis für den danach geänderten Quellstand oder ein endgültiges Store-MSIX.

Beim Start des QA-MSIX meldete der ESM-Hauptprozess zunächst die Edge-CDM-Erkennung, obwohl die Castlabs-Laufzeit die native Komponenten-API exportiert. Die synchrone Erkennung verwendete CommonJS-`require` aus einem ESM-Modul und fiel daraufhin zur Systemsuche zurück. Beide Startpfade verwenden nun denselben Electron-ESM-Import. Der Regressionstest schlug mit dem bisherigen Import fehl. Danach bestanden alle 25 Widevine-Tests und der Hauptprozess-Build. Ein Minimallauf mit der aus dem QA-MSIX extrahierten Castlabs-EXE und dem neu kompilierten Modul meldete Castlabs-Erkennung ohne Systemsuche und ohne CDM-Pfadschalter. Der Fix steht für den nächsten Paketbau bereit.

## Sidekick nach einem abrupten Windows-Prozessende

Ein isolierter Vergleich mit der vorhandenen Electron-Entwicklungs-EXE 44.5.1 reproduzierte, dass der eingebundene Python-Wächter beim abrupten Ende des Elternprozesses seinen Aufräumcode nicht erreichte. Derselbe Test mit dem Windows-Startparameter `detached` erkannte das Prozessende. `taskkill` beendete den synthetischen Webserver und der Wächter endete mit Code 0. Der Start des Windows-WebUI-Wächters verwendet diesen Parameter jetzt regulär. Beim normalen Schließen beendet der vorhandene Prozessbaum-Stopp weiterhin den Server und seinen Wächter. Ein gezielter Regressionstest schlug ohne die Änderung fehl. Danach bestanden alle 47 Service-, Gateway- und Widevine-Tests und der Hauptprozess-Build. [Node.js-Prozessstart](https://nodejs.org/api/child_process.html#optionsdetached)

## Neu gebautes QA-MSIX mit den Korrekturen und Lizenzhinweisen

- `LastBrowser-0.1.61-verified-notices-qa.msix`, Windows x64, Version `1.1.61.0`, 656.089.331 Byte, SHA-256 `f2e8fdb11184e3290fb690f4bd87cac1e180f1551c4189ffe35db3f7c558348d`. Die Archivprüfung bestätigte alle 41 Cryptomator-JARs, zehn versionsgebundene Lizenz- und Attributionsdateien und die kompilierten Widevine- und Sidekick-Korrekturen.
- Das Entwicklerpaket startete mit frischem Profil, lieferte 32 Store-Aufnahmen in acht Sprachen und endete mit Code 0. Die Aufnahmen sind an MSIX, EXE und ASAR gebunden. Der vollständige Store-Vorabcheck meldete 37 bestandene Prüfungen und keine Fehler. Das temporär registrierte Paket wurde entfernt. Beim normalen Beenden und nach einem erzwungenen Abbruch des separaten Tests stoppte der Sidekick-Supervisor zusammen mit Uvicorn.
- Der Tresortest nutzte die beiden aus dem Paket-ASAR entnommenen Vault-Module, den gepackten Java-Initializer, das gepackte JDK und alle 41 verifizierten Cryptomator-JARs. WinFsp mountete einen synthetischen Tresor auf Q:, erhielt die Testdatei über Sperren und erneutes Öffnen hinweg und hängte das Laufwerk aus. Die geprüften Backing-Dateien enthielten die synthetischen Marker und den Schlüssel weder als Klartext noch in der geprüften Hex-Darstellung. TPM-Wiederherstellung wurde dabei nicht getestet.
- Der im MSIX enthaltene llama.cpp-Server erzeugte mit dem kleinen extern bereitgestellten Testmodell eine CPU-Textantwort. Die Windows-Sitzung stellte kein nutzbares Vulkan-Gerät bereit. GPU-Inferenz und Bildgenerierung bleiben offen.
- Dominik bestätigte am 19. November 2026 erfolgreiche Wiedergabe bei Netflix und weiteren, nicht einzeln benannten Streamingdiensten im isolierten Profil mit den aus diesem QA-MSIX entpackten Programmdateien. EXE und ASAR wurden zuvor gegen das Archiv verifiziert. Die Bestätigung gilt für diese Testumgebung. Eine Zusage für einzelne weitere Dienste oder die endgültige Store-Fassung folgt daraus nicht.
- Die Einreichung bleibt im Entwurf, bis ein stabiles Castlabs-Update den aktuellen Sicherheitspatchstand belegt. Widevine bleibt laut Herausgeberentscheidung Teil der Store-Fassung. [Entscheidung im Slack-Release-Thread](https://loggableim.slack.com/archives/C0CKC081TJQ/p1795102529521099)
