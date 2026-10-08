# LastBrowser 0.1.48 9A943 — VM-Laufbericht

- Zeitpunkt: 2026-10-08 15:08 UTC
- Auftrag: `VM-9A943-TEST-ORDER-20261008.md`, Order-Branch-Commit `48176ef1534063846198b906fe8fc35eb6cf617e`
- Zusatzszenario: `AI_NEW_CHAT_20261008`, Revision 1, gleicher Kandidat
- Kandidat: `store-package-candidate-9a943408-20261008`, Sourcecommit `9a94340853c90dd9f19393e83ae5c09fa1a430b1`, Source-tree `7e5f3e931e1487754d4b68c7cce5efa59cddbb8a`
- Umgebung: dedizierte synthetische Windows-VM; Windows 11 Enterprise Evaluation, Build 26300, x64. Belegte Clean-Snapshot-ID fehlt. `BASELINE-UI-20261008` ist nur eine historische, nicht getestete Baseline und wurde nicht erneut aufgenommen oder verändert.
- Providerturns, Modellinferenz und Kosten: 0.

## Ergebnis

| Fall | Status | Beobachtung |
|---|---|---|
| `9A943-IDENTITY` — heruntergeladene Artefaktpins | PASS | ZIP 348038467 Bytes / `8df8036f72d7be22cbfe0c5095ef6825235118a109fb31375a17e9160ce0f813`; Standalone-Manifest 3074 Bytes / `33785913589f2ef9d1a9b092366775afed424fe70d0b2c82cff6bcd4f5a12bb6`; Setup 174192397 Bytes / `9ef5c38cc670f3ff1ad4dff6fb586b48a64c8bfbc2bfd1e6d6ba5daa86e47d13`; Portable 173838167 Bytes / `d42cfe64f77577830d501228ca8a677335d25399ef8507a51dc80419a56034c6`. Wrapper waren wie erwartet unsigniert. Im Portable-Extraktionsbaum wurde `app.asar` mit 64049484 Bytes / `69732f7115157fc5405db63d2dbfad5e24fff87f1f91aa14eb67db9079511adc` gefunden. Die tatsächliche UI-Version wurde nicht abgelesen. |
| `9A943-PORTABLE-LIFECYCLE` | FAIL | Den exakt gepinnten Portable-Wrapper einmal mit isolierten temporären Profil-/AppData-Verzeichnissen gestartet. Er erzeugte einen Extraktionsbaum mit passendem ASAR, aber kein Kandidaten-Appprozess/-fenster war danach sichtbar; der Wrapperprozess endete. Exitcode bzw. konkrete Abbruchursache wurden nicht erfasst. Normaler App-Quit und Neustart daher nicht erreicht. Keine alten/installierten LastBrowser-Prozesse bedient. |
| `AI_NEW_CHAT_20261008` Revision 1 | BLOCKED | Computer Use war verfügbar. Zum Prüfzeitpunkt meldete die Fensterliste nur ChatGPT; kein Kandidatenfenster und kein Kandidatenprozess waren vorhanden. Daher AI-Reiter/„Neuer Chat“, Fokusmessungen, synthetische Eingabe und Screenshots nicht ausgeführt. Erwartung und vermutete Ursache werden nicht als Beobachtung ausgegeben. |
| `9A943-SETUP-LIFECYCLE` / `9A943-SETUP-UNINSTALL` | BLOCKED | Keine Installation oder Deinstallation ohne belegte Clean-Snapshot-ID; dieser Bericht startet ausdrücklich keine Setup-Installation. |
| `9A943-CLEAN-CRT` | NOT_VERIFIED | Clean Snapshot, unabhängige System32-Baseline und geladene Modulbelege fehlen. Keine Aussage zu Native Runtime Rights. |
| `9A943-NEW-TAB-EXPANDED`, `9A943-NEW-TAB-SLIM`, `9A943-CHAT-DEFAULTS`, `9A943-OFFLINE-STARTUP`, `9A943-YOUTUBE-BASELINE` | NOT_TESTED | Kandidaten-UI blieb nicht verfügbar. Keine Provider-/Netzwerkaktionen, Downloads oder externen Navigationsziele ausgelöst. |

## Reproduktion und Beleggrenzen

1. Aktuellen Runner und den 9A943-Auftrag read-only vom Order-Branch gelesen.
2. Bereits heruntergeladenes Guest-Bundle, separates Manifest und beide Wrapper gegen die dort gepinnten Größen und SHA-256 geprüft.
3. Den Portable-Wrapper einmal unter einem neu erzeugten isolierten temporären Profil gestartet. Der Wrapper extrahierte die Anwendung; `app.asar` entsprach dem Pin. Danach waren weder LastBrowser-Prozess noch Kandidatenfenster sichtbar. Computer-Use-Fensterliste: ausschließlich ChatGPT.
4. Kein UI-Schritt am zuvor installierten LastBrowser ausgeführt; keine Screenshots erzeugt, da kein Kandidatenfenster sichtbar wurde. Die Abwesenheit eines Fensters ist keine Diagnose der Absturzursache.

Erforderliche Voraussetzung für weitere UI-Abnahme: belegte Clean-Snapshot-/Baseline-ID für das synthetische Guest-Profil. Für den Portable-Retest muss außerdem der Startabbruch mit nachvollziehbarem Prozess-/Fensterbeleg untersucht werden. Keine Produktdateien geändert. Dieser Bericht enthält keine persönlichen Profilpfade, Kontodaten oder Geheimnisse.
