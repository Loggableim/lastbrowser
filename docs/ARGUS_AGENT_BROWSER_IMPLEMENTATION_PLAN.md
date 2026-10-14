# Umsetzung des Agentenzugangs und der Browserdiagnose für LastBrowser

Empfänger: Vesper. Auftraggeber: Cid. Argus bleibt für Browserdiagnose, Willhaben sowie GPT, OpenCode und Quickchat zuständig. Vesper implementiert den hier beschriebenen Ausbau. Nord koordiniert Integration und private Windows-Testbetas. Dieser Auftrag umfasst auch Main-, Renderer- und Sidekick-Code; Vespers sonstige Linux-Zuständigkeit beschränkt diesen ausdrücklich zugewiesenen Implementierungsauftrag nicht.

Der Ausbau beginnt auf dem [Diagnose-v1-Pull-Request 104](https://github.com/Loggableim/lastbrowser/pull/104), Branch `codex/argus-diagnostics-v1-20261014`. Der Diagnose-Codecommit ist `fad627730504a51876227011003e54fa54bea8c7`. Er verwendet die vorhandenen Browser-Leases, Action-Permits, Journale und Widerrufsgates. Das Ergebnis ist ein einheitlicher Ablauf: beobachten, ein eindeutig gebundenes Ziel auswählen, eine geprüfte Aktion ausführen, deren Ergebnis beobachten und einen begrenzten Diagnosebeleg erzeugen.

## Ausgangslage und verbindliche Abgrenzung

Die Diagnose-v1-Basis enthält `window.__lastbrowserDiagnostics` mit `enable`, `disable`, `status`, `read`, `query`, `summary`, `snapshot`, `export` und `clear`. Sie sammelt standardmäßig nichts. Aktiviert speichert sie maximal 500 bereinigte Ereignisse, puffert im Speicher und schreibt gebündelt im Abstand von 250 ms. Browser-Lifecycle und Chat-/Quickchat-Phasen sind vorhanden. Der Snapshot dieser API enthält Shell-Zustände und Webview-Geometrie; er ist noch keine semantische Elementkarte einer Website.

Der PR basiert auf `9858e1fac5f3849affe9713a04106df40d517227`, dem eingefrorenen Beta-1-Quellstand. Die getestete VM-Beta 6 wurde als Quelle `260557ce1b84804350bcd3f46ea47ff3dde9a00c` übergeben. Dieser Commit war am erreichbaren Origin nicht abrufbar. Diese Differenz muss vor einer Releaseintegration mit Nord/Anker geklärt werden. Keine Versionsnummer ändern, keinen ganzen alten Quellbaum über einen neueren Releasebaum kopieren.

Der vorhandene Main-Gateway unterstützt `navigate`, `read`, `click`, `type` und `screenshot`. Klick und Eingabe benutzen CSS-Selektoren im oberen Dokument. Die Main-seitige Navigation-Epoch erkennt Navigationen, aber nicht jede DOM-Änderung einer SPA. Der bisherige Klickbeleg `clicked: true` bestätigt die Eingabesendung, nicht den beabsichtigten Seiteneffekt.

Im alten Sidekick-Browserruntime existieren bereits `@eN`-Referenzen. Sie sind nicht der sichere native Gateway-Pfad und dürfen nicht unverändert als vertrauenswürdige neue Elementreferenzen übernommen werden. Native Verträge lehnen diese alten Referenzen derzeit ausdrücklich ab.

Implementiere alle unten aufgeführten Arbeitspakete. Führe sie in dieser Reihenfolge aus und veröffentliche den Ausbau zunächst hinter einer standardmäßig ausgeschalteten Featurefreigabe. Einzelne Fähigkeiten werden erst angeboten, wenn ihr Main-/Sidekick-Vertrag und ihre Tests vollständig sind. Browserseiten können keine Agentenrechte oder Diagnosefreigaben erteilen.

## Arbeitsregeln für die ausführende Implementierung

1. Lies `AGENTS.md` und alle darunter geltenden Anweisungen. Arbeite in einem isolierten Worktree und einem neuen Branch. Verändere keine fremden Arbeitsverzeichnisse.
2. Halte `services/sidekick/` als Backendquelle in-tree. Keine externe Backendkopie, keine Regex-Monkeypatch-Skripte, kein Wiederbeleben von `services/webui/`.
3. Erhalte die v1-Diagnose und vorhandene Tools rückwärtskompatibel. Neue semantische Aktionen erhalten eigene Namen und Verträge. Ein neues Elementref ist niemals heimlich ein CSS-Selektor.
4. Führe eine Fortschrittsdatei `docs/ARGUS_AGENT_BROWSER_PROGRESS.md`: Paket, Commit, geänderte Dateien, Testbefehl, Ergebnis, offene Einschränkung. Aktualisiere sie nach jedem Paket. Nicht allein einen Plan als erledigte Implementierung melden.
5. Ändere Frontend, Main, Python-Mappings, Schemas und Tests gemeinsam, wenn sie denselben Vertrag betreffen. Kein Commit mit einem beworbenen Tool, dessen Empfänger fehlt.
6. Ein alter Testfehler wird erst als bestehender Fehler bezeichnet, wenn derselbe Test auf unveränderter Basis mit derselben Umgebung reproduziert wurde. Keine Testlöschung, keine pauschalen `skip`-Markierungen, keine abgeschwächten Sicherheitsprüfungen zum Grünmachen.
7. Bei fehlenden Abhängigkeiten: deklarierte, gepinnte Versionen lokal installieren. Keine Änderungen an einem über Junction geteilten `node_modules` eines fremden Worktrees. Build und Tests nicht durch erfundene Moduldeklarationen scheinbar reparieren.
8. Kein Merge, Tag, öffentlicher Release oder signierter Paketbau aus diesem Implementierungsprompt. Erstelle einen Draft-PR und einen konkreten Übergabebericht; Nord organisiert die anschließenden Releasearbeiten.

## Dateien und Verantwortungsgrenzen

| Bereich | Vorhandene Einstiegspunkte | Geplanter Ausbau |
| --- | --- | --- |
| Diagnose | `apps/desktop/src/renderer/browser-diagnostics.ts`, `App.tsx`, `docs/ARGUS_DIAGNOSTICS.md` | Bounded Sessions, Korrelation, bessere Fehler-/Latenzbelege |
| Browserbesitz | `apps/desktop/src/main/independent-browser-host.ts`, `independent-controller.ts` | Snapshotregistrierung, Referenzauflösung, Aktionsprüfung |
| Privater Transport | `apps/desktop/src/main/independent-browser-gateway.ts` | Strikte neue Action-Kinds; bestehender Transport bleibt |
| Python Gateway | `services/sidekick/runtime/independent/browser_gateway.py` | Schemaabgleich, vollständiger Digest, Ergebnisse |
| Native Chattools | `native_browser_contracts.py`, `native_browser.py`, `native_browser_bridge.py` im selben Verzeichnis; `services/sidekick/model_tools.py` | Neue Tooldefinitionen, Parentbindung, bestehendes Journal |
| Independent Runs | `services/sidekick/runtime/independent/manager.py`, `policy.py`; `services/sidekick/tools/independent_browser_tool.py` | Gleiche Fähigkeiten und Policy auf diesem Pfad |
| Alte Browsertools | `services/sidekick/web/api/browser_runtime.py`, `services/sidekick/tools/browser_tool.py` | Nur untersuchen; keine automatische Vermischung der Referenzen |
| Desktoptests | `apps/desktop/tests/independent-browser-host.test.ts`, `independent-browser-gateway.test.ts`, `independent-controller.test.ts` | Identität, Stale-Ziele, Race-Fälle, Darstellung |
| Backendtests | `services/sidekick/tests/test_native_chat_tool_policy.py`, `test_native_root_browser_transport.py`, `test_native_chat_transport.py`, `test_independent_runs.py`, `test_independent_governance.py` | Vertrag, Policy, Zustimmung, unbekannte Outcomes |

Die kurzen Python-Dateinamen in dieser Tabelle liegen, sofern kein anderer Pfad angegeben ist, unter `services/sidekick/runtime/independent/`. Neue kleine Module dürfen dort beziehungsweise unter `apps/desktop/src/main/` ergänzt werden. Im Bericht jedes neue Modul samt Zweck aufführen. Keine zweite allgemeine Browsersteuerungsarchitektur neben dem Gateway aufbauen.

## Architekturentscheidungen

### Identität einer Beobachtung

Jede semantische Beobachtung bekommt eine Main-erzeugte, zufällige `snapshotId`. Sie bindet an `leaseId`, tatsächlichen `targetId`, Main-/Runner-Generation, Navigation-/Permission-Epoch sowie den exakten Frame und das Dokument. Nur Main speichert die Zuordnung von `elementRef` zum echten DOM-/Accessibility-Knoten. Der Worker liefert lediglich `snapshotId` und `elementRef`; er darf kein Ziel oder Backendnode festlegen.

In der ersten Implementierung bleibt pro Lease nur der neueste aktive semantische Snapshot gültig. Ein neuer Snapshot invalidiert die Referenzen des alten. TTL: 30 Sekunden. Maximal 300 Elementeinträge, 100 Frameeinträge und 256 KiB serialisierte Textmetadaten pro Snapshot. Text pro Elementname maximal 256 Zeichen. Trunkierung wird mit `truncated` und der Ursache ausgewiesen, nicht als vollständige Seite ausgegeben. Screenshotdaten haben ein separates Bytebudget; niemals in dieses Textbudget hineinmogeln.

Navigation, Dokumentersetzung, relevante Layout-/Semantikänderung, Berechtigungswechsel, Widerruf, Targetverlust und Lease-Ende invalidieren den Snapshot. Ein Main-erzeugter semantischer Fingerprint und eine erneute DOM-/Actionability-Prüfung erfassen Änderungen, die eine Navigation-Epoch allein nicht erkennt. Ein Modell oder die Webseite darf eine Revision nicht als autoritativ festlegen. Eine Änderung im DOM bedeutet nicht immer, dass die ganze Seite unsicher ist; v1 des Ausbaus darf konservativ einen frischen Snapshot verlangen.

### Versioniertes Antwortformat

Die neuen Verträge heißen Version 2. Die vorhandene Diagnose-v1-Schnittstelle bleibt Version 1. Die folgenden JSON-Beispiele sind der Sollvertrag, keine schon implementierten Funktionen. Identitätsdaten in Antworten stammen von Main; sie werden nicht vom Modell als Autorisierung zurückgenommen.

```json
{
  "schemaVersion": 2,
  "snapshotId": "opaque-main-generated-id",
  "observedAt": "ISO-8601-UTC",
  "expiresAt": "ISO-8601-UTC",
  "identity": {"leaseId": "lease", "targetId": "target", "navigationEpoch": 3, "permissionEpoch": 2},
  "viewport": {"widthCssPx": 1280, "heightCssPx": 720, "devicePixelRatio": 1, "scrollX": 0, "scrollY": 0},
  "elements": [
    {"elementRef": "opaque-ref", "displayNumber": 17, "frameRef": "main", "role": "link", "name": "Marktplatz", "visible": true, "enabled": true, "rectCssPx": {"x": 50, "y": 80, "width": 100, "height": 30}}
  ],
  "truncated": false,
  "unsupported": []
}
```

`identity` muss im vollständigen Vertrag auch die beiden Generationen und die erforderliche Dokument-/Frameidentität abbilden. Die Beispiele sind absichtlich lesbar; entferne deshalb keine vorhandenen Identitätsfelder aus den echten Permits. `displayNumber` dient ausschließlich der Bildmarkierung. `elementRef` ist ein opaker Schlüssel, kein erlaubter Ausdruck und kein CSS-Selektor.

Toolargumente bleiben klein:

```json
{"snapshotId":"opaque-main-generated-id","elementRef":"opaque-ref","expectation":{"kind":"navigation"}}
```

`effect`, Lease, Target, Owner und Zustimmung werden von der bestehenden vertrauenswürdigen Kette bestimmt. Ein Seitentext, eine Modellbehauptung oder eine erwartete Navigation darf einen Schreibvorgang nicht zu einem Lesevorgang herabstufen.

### Neue Toolnamen

Führe die unten genannten Namen als neue Fähigkeiten ein. Entdecke zuerst die tatsächlich verwendeten Registry-/Policy-Pfade. Jeder Name bekommt eine JSON-Schema-Definition mit `additionalProperties: false`, Main-Validator, Python-Validator, Toolmapping und Tests. Tools werden über Native Chat und Independent Runs konsistent angeboten.

| Tool | Argumente und Bedeutung |
| --- | --- |
| `agent_browser_observe` | Begrenzte Optionsflags für Elementkarte, Frames und Screenshot; Target aus der vorhandenen Bindung |
| `agent_browser_click` | `snapshotId`, `elementRef`, optional erlaubte Ergebniserwartung |
| `agent_browser_fill` | `snapshotId`, `elementRef`, `text`, `clear`; vertrauliche Werte nie im Diagnosetrace |
| `agent_browser_capture` | Exakte `snapshotId`, optional region-/elementgebundener Crop und Overlayflag |
| `agent_browser_changes` | Aktuelle und vorige Snapshot-ID; nur Metadatendifferenz gültiger Beobachtungen |
| `agent_browser_scroll` | Snapshot und Containerref, begrenzte Richtung/Distanz in CSS-Pixeln |
| `agent_browser_hover` | Snapshot und Elementref |
| `agent_browser_key` | Snapshot, Fokusref, Taste aus expliziter Allowlist |
| `agent_browser_drag` | Snapshot, Source- und Targetref; keine beliebigen OS-Koordinaten |
| `agent_browser_wait` | Snapshot, begrenzte Bedingung, höchstens 10 Sekunden; Widerruf bricht sofort ab |
| `agent_browser_grid` | Snapshotgebundene Region, Rasterauflösung und Crop; nur Beobachtung |
| `agent_browser_pointer` | Gridref und Zelle/Offset, bestehende Mutationsfreigabe und frische Trefferprüfung |
| `agent_shell_observe` | Begrenzter Zustand von LastBrowser-Shell und ihren eigenen Controls |
| `agent_shell_action` | Feste Aktion plus Shellref; z. B. Quickchat öffnen, Tab aktivieren oder schließen |

Ein allgemeiner `evaluate`-, `executeScript`-, Raw-CDP-, Cookie- oder globaler Targetzugang wird dadurch nicht eingeführt. Ein späterer MCP-Adapter transportiert nur dieselben geprüften Tools; er erhält keine mächtigere Hintertür.

Die genannten Feature-, Größen-, Zeit- und Refgrenzen sind festgelegte Startwerte. Ändere sie nur anhand eines dokumentierten Messbefunds und mit weiterhin begrenztem Verhalten. Replay und MCP gehören zum Gesamtumfang; separates Opt-in ist kein Grund, sie als Attrappe zu liefern. Bei einem bestehenden Policykonflikt den schmalen gebundenen Adapterpfad implementieren, statt generell unbekannte MCP-Tools zu erlauben.

## Paket P00 Quellbasis und Testbaseline sichern

**Ziel:** Auf dem Diagnose-PR beginnen und für die spätere Releaseintegration eine nachprüfbare Basis haben.

1. [PR 104](https://github.com/Loggableim/lastbrowser/pull/104) über GitHub lesen; Basisbranch, Head-SHA und Diagnoseänderungen erfassen. `fad627730504a51876227011003e54fa54bea8c7` muss im übernommenen PR-Head enthalten sein; Dokumentationscommits dürfen danach folgen.
2. PR-Head in einen isolierten Worktree holen, dort einen neuen Branch `codex/vesper-agent-browser-v2` anlegen, sofern der Name noch frei ist. Bei vorhandenem Branch nur den eigenen passenden Arbeitsstand fortsetzen.
3. Prüfen, ob die Diagnosequelle und ihre Tests tatsächlich vorhanden sind. Nur die PR-Referenz aufzulisten reicht nicht.
4. Nord/Anker müssen den privaten Beta-6-Commit oder einen neueren vereinbarten Integrationsstand erreichbar machen. Solange das fehlt, auf dem PR-Head weiterimplementieren und die Releaseintegration als offen dokumentieren. Nicht die technische Implementierung unnötig stoppen.
5. Desktopbuild, gezielte Diagnose-/Gatewaytests und geltende Backendtests ausführen. Fehlerliste samt unverändertem Basisvergleich und Umgebung speichern. Alle Logs ohne Credentials.

Die Ausgangsprüfung des Diagnose-PRs: Desktopbuild und Python-Syntaxcheck erfolgreich; Store-Preflight 39 bestanden, 0 Fehler, 2 Warnungen zu provisorischen Screenshots und fehlendem finalen signierten Paket. Zweiter Gesamttestlauf nach Dependencyauflösung: 2247 bestanden, 50 Fehler in 28 Dateien. Der unveränderte Basisvergleich reproduzierte 48 genau gleich benannte Fehler in 26 Dateien. Der neue globale Webview-Stringtest-Fehlalarm wurde auf den Spacewechsel begrenzt; diese Suite und der zusätzliche Smoke-Timeout bestanden anschließend isoliert mit zusammen 17 Tests. Ein vollständiger grüner Gesamtlauf wird nicht behauptet. Vesper führt die Baseline erneut in seiner Umgebung aus und übernimmt nicht blind alte Zahlen als aktuelle Ergebnisse.

**Abnahme:** Branch-/SHA-Nachweis, reproduzierbare Befehle, Testbaseline und eindeutige Trennung zwischen Entwicklungsbasis und späterer Releasebasis.

## Paket P01 Diagnosebasis für mehrere Fenster und längere Tests härten

**Dateien:** `browser-diagnostics.ts`, `App.tsx`, dazu Tests und bei einem Main-Sink die vorhandenen IPC-/Preload-Grenzen.

1. Ergänze Diagnose-Session-ID und Renderer-/Window-ID. Ereignisse bekommen eine monotone Sequenz pro Session und eine monotone lokale Zeit zusätzlich zur UTC-Zeit. IDs enthalten keine Profilnamen, URLs oder Credentials.
2. Vermeide konkurrierende Überschreibung durch mehrere Renderer im gemeinsamen localStorage. Baue einen begrenzten Main-Sink über bestehende IPC-/Preload-Grenzen mit Senderprüfung gegen eigene Shell-WebContents. Renderer liefern nur bereinigte Batches mit Session-/Window-ID und Sequenz; Main prüft erneut und schreibt mit genau einem Writer. Kein neuer Port. Die synchronen v1-Methoden `read/query/summary` bleiben lokale Rendereransichten; sessionweite v2-Abfragen werden ausdrücklich asynchron eingeführt. Keine stille Umstellung einer Arrayantwort auf ein Promise. Nach erfolgreicher Aktivierung einer Main-Session wird der gemeinsame localStorage-Ereigniswriter für diesen v2-Modus ausgeschaltet. Alte Exporte bleiben lesbar, alte Keys erst bei explizitem clear entfernen. Sessionablauf/Stop beendet Writer und Aktivierung, statt beim Neustart automatisch zu sammeln.
3. Definiere feste Byte-, Ereignis- und Lebensdauerlimits; Default höchstens 500 Ereignisse pro Renderer und 2 MiB pro Diagnosesession. Export weist fehlende Batches/Trunkierung aus. Nach Abschalten werden alle Listener/Timer/Sinks beendet; Normalbetrieb schreibt keine neuen Diagnosedaten.
4. Korrigiere oder versioniere die bisherigen `chat-chat-started`-/`chat-chat-failed`-/`chat-chat-finished`-Namen, ohne alte Exporte falsch auszulesen. Bekannte Eventtypen behalten; Freitext nicht als Eventtyp akzeptieren.
5. Quickchat bekommt eine lokale Turn-Korrelations-ID: send, preflight, accepted, first-delta, completed/cancelled/error. Keine echten Stream-/Session-IDs exportieren. Anzeige-/Providerzeit getrennt ausweisen. Die Animation-Frame-Messung heißt weiter Zustand-commit-to-frame; nicht als garantierte Pixel-Paintzeit bezeichnen.

**Tests:** Default aus; zwei Fenster verlieren keine Ereignisse; deaktiviert keine Timer; fehlender Storage/Sink blockiert keinen Chat; Bytebudget; harte Unterbrechung und Export; bekannte Ereignisse und keine Inhalte/Secrets. **Abnahme:** Eine Verzögerung kann pro Quickchat-Turn bis zur richtigen Phase verfolgt werden.

## Paket P02 Verträge und Capability Discovery festlegen

**Ziel:** Main und Python können nicht unterschiedliche Operationen interpretieren.

1. Ergänze ein kleines Main-Modul für v2-Vertragstypen und strikte Runtimevalidierung; beispielsweise `apps/desktop/src/main/browser-agent-contracts.ts`. Ergänze ein passendes Python-Vertragsmodul im vorhandenen Independent-Verzeichnis. Diese neuen Pfade sind Sollpfade, keine Behauptung über vorhandene Dateien.
2. Definiere Snapshot, Element, Frame, Screenshotbezug, ActionReceipt und strukturierte Fehler mit Obergrenzen aus diesem Plan. Prüfe Zahlen auf endliche Werte; bool darf nicht als Python-int durchgehen. Unbekannte Schlüssel und nicht angebotene Features ablehnen.
3. Füge einen read-only Capability-Query an den bestehenden gebundenen Transport an. Antwort enthält Versionsnummer und ausschließlich implementierte Operationen/Frame-/Shadowfähigkeiten. Keine Targetliste und keine globalen Profile.
4. Halte `browserActionDigest()` und Python `action_digest()` konsistent. Der Digest umfasst jede neue Snapshot-/Ref-/Text-/Erwartungsangabe. Bestehende Permit-Signaturen und Einmalverwendung beibehalten.
5. Ergänze gemeinsame Testvektoren für kanonische Digests und alle Operationen. Kein Tool in der Modellregistry registrieren, bevor sein Main-/Python-Vertrag durchgängig ist.

**Tests:** TS/Python-Digestgleichheit, falsche Version, unbekannte Felder, extreme Zahlen, Unicode, Größenlimits, fehlende Pflichtelemente, verweigerte Capability. **Abnahme:** Jeder neue Toolcall hat genau eine geprüfte Bedeutung.

## Paket P03 Main eigene Snapshotregistrierung implementieren

**Dateien:** `independent-browser-host.ts` und ein kleines neues Registry-Modul, z. B. `browser-agent-snapshots.ts`.

1. Speichere pro Lease den aktuellen Snapshot und eine begrenzte Refzuordnung in Main-RAM. Kein ungeschütztes globales Dictionary im Renderer, keine vom Worker erzeugten DOM-IDs.
2. Capture und Registryänderung laufen auf derselben Lease-Queue wie Aktionen. Gates vor Beginn, nach jedem asynchronen CDP-Schritt und vor Ausgabe erneut prüfen. Die Queue macht Webseite und DOM nicht unveränderlich; Capture muss Änderungen während der Aufnahme erkennen.
3. Erzeuge Referenzen mit Main-Zufall. Binde jede Ref an Snapshot, Lease, Target, Generationen, Permission-/Navigation-Epoch, Frame-/Dokumentidentität, Backendnode und sicheren Fingerprint aus Tag, Role, Name und relevanten Zuständen. Fingerprint dient ausschließlich dem Abgleich; Seitendaten sind keine Autorität.
4. Lausche auf Target-/Dokument-/Frameverlust und vorhandene Widerrufsereignisse. Invalidate entfernt Maps sofort. Listener bei Lease-Ende vollständig entfernen. Eine abgelaufene Ref führt zum Fehler `stale_snapshot`, niemals zu einem automatischen Selektor-Fallback.
5. Ergänze Prüfung auf SPA-Knotenwechsel: resolve den gespeicherten Backendnode erneut und vergleiche Dokumentidentität und Semantik. Unterscheide fehlend, ersetzt und unzugänglich. Ein gleich benannter neuer Button bekommt eine neue Ref.

**Tests:** Cross-Lease, Cross-Target, andere Generation, falscher Owner/Scope, Ablauf, dokumentgleicher Knotenwechsel, gleicher Name in zwei Buttons, neue Beobachtung, queued revoke, in-flight revoke, Targetverlust, begrenzte Speichergröße. **Abnahme:** Keine Ref kann in ein fremdes oder ersetztes Ziel umgedeutet werden.

## Paket P04 Semantische Elementkarte erzeugen

**Ziel:** Agenten können eine normale Website über Rollen und Namen lesen und bedienen.

1. Nutze den CDP-Accessibility-Baum und eine fest im Code definierte begrenzte DOM-Projektion. Code stammt aus Main, nicht aus dem Modell oder Seitentext. Accessibility-Rolle, Accessible Name und Zustand bevorzugen; bei fehlendem Namen einen begrenzten sichtbaren Label-/Textfallback verwenden.
2. Erfasse zuerst sichtbare interaktive Elemente: Links, Buttons, Inputs, Textareas, Selects, Checkboxen, Radiobuttons, Dialoge und explizit interaktive ARIA-Rollen. Gib auch disabled/readonly/checked/expanded und die relevanten Eigenschaften aus. Keine Passwortwerte, vollständigen Formwerte, versteckten DOM-Dumps oder beliebigen Attribute.
3. Ergänze auswählbare Textbereiche als separate, begrenzte Beobachtungsfunktion für Recherche. Nicht die gesamte Webseite ungefragt in jeden Toolcall kopieren. Browserinhalt bleibt untrusted Taskdata und wird im Modellkontext eindeutig als solcher eingerahmt.
4. Sortiere Einträge deterministisch nach visueller Reihenfolge und danach DOM-Reihenfolge. Nummerierung ist pro Snapshot fest. Doppelte Namen bleiben verschiedene Elemente; kein unsichtbares Zusammenlegen.
5. Liefere strukturierte JSON-Elemente und eine daraus abgeleitete kompakte Textansicht. Beide verwenden dieselben Refs. Unterstütze einen begrenzten Bereichssnapshot, damit lange Seiten kein unnötiges Kontextbudget verbrauchen.

**Tests:** Accessible Names, Iconbuttons mit aria-label, deaktivierte Controls, Mehrfachnamen, Offscreen/Overlay, Nullgröße, Texttrunkierung, Passwortfeld ohne Wert, bösartige Labels ohne Toolautorität. **Abnahme:** Testseite vollständig sinnvoll bedienbar anhand der Textkarte; unbeschriftete Ziele ausdrücklich gekennzeichnet.

## Paket P05 Frame und Shadow DOM Zugehörigkeit ergänzen

1. P04 zunächst für das Hauptdokument abnehmen. Danach separate Frame-Tabelle mit Main-erzeugten `frameRef`s und exakter Eltern-/Dokumentbindung ergänzen. Frame-URLs niemals als Berechtigungsbeweis nutzen.
2. Same-origin Frames und offene Shadow Roots zuerst implementieren. Jedes Element behält seinen Frame-/Shadow-Pfad. Nodeauflösung und Hit-Test erfolgen im richtigen Dokument; niemals zum Hauptdokument ausweichen.
3. Cross-origin und Out-of-process Frames nur über gebundene Untertargets öffnen, deren Zugehörigkeit zum eigenen WebContents/Main-Target nachgewiesen ist. Origins gegen die bestehende Allowlist prüfen. Nicht alle Debuggertargets auflisten oder fremde Sessions übernehmen.
4. Geschlossene Shadow Roots nur über vorhandene, eindeutig gebundene CDP-/Accessibility-Knoten unterstützen. Ist der Zugriff nicht verlässlich möglich, Capability und Elementkarte melden `closed_shadow_unsupported`. Keine zufällige Ersatzkoordinate als erfolgreiche Unterstützung ausgeben.
5. Child-Frame-Navigation und Dokumentersetzung invalidieren betroffene Beobachtungen. Scroll-/Transform-Koordinaten durch die ganze Framekette in Top-Viewport-CSS-Pixel umrechnen. Bei nicht verlässlich berechenbarer Transformation explizit verweigern.

**Tests:** verschachtelte Frames, erlaubter/verbotener Frameorigin, Frame-Ersetzung ohne Topnavigation, OOPIF, offene/geschlossene Roots, gleichnamige Ziele in verschiedenen Frames, CSS-Transform und gezoomtes Fenster. **Abnahme:** Capability-Matrix dokumentiert unterstützt oder ausdrücklich nicht unterstützt; die implementierten Fälle sind live getestet. Erweiterte Frame-Unterstützung nicht vor ihren Prüfungen anbieten.

## Paket P06 Snapshot gebundene Klicks und Eingaben

**Dateien:** Main-Actionunion, Gatewayvalidator, Sidekick-Nativeverträge/-Bridge/-Fence, Manager/Policies/Toolregistries und ihre Tests gemeinsam ändern.

1. Neue Action-Kinds für Click/Fill mit `snapshotId` und `elementRef` einführen. Native und Independent-Pfad auf diese neuen Tools mappen. Bestehende selectorbasierte Tools behalten ihre eigene Bedeutung.
2. Vor einem Klick: Refbindung und TTL prüfen, Knoten erneut auflösen, verbunden/sichtbar/enabled prüfen, Größe prüfen, erforderliches ScrollIntoView durchführen, dann mindestens zwei Animationsframes stabile Geometrie beobachten. Vorhandene Timeouts und sofortige Widerrufbarkeit erhalten.
3. Hit-Test am beabsichtigten Punkt muss Ziel oder zulässigen eigenen Nachfahren ergeben. Ein Cookiebanner oder anderes Element darüber führt zu `obstructed`. Kein `force`-Klick und kein `HTMLElement.click()` als heimlicher Fallback.
4. Ein durch die eigene Aktion nötiges Scrollen darf die gebundene Semantik nicht austauschen: im selben Main-Aktionskontext Geometrie erneut bestimmen und Fingerprint/Gates prüfen. Externes Scrollen oder Layoutänderung verlangt eine neue Beobachtung. Nach dem Klick Snapshot als verbraucht/invalide behandeln.
5. Fill prüft editable/readonly/disabled, exakten Fokus und bestehende Textlimits. Neue Textwerte nicht im Diagnosejournal speichern. `clear` wird explizit gehandhabt. Fokus auf das falsche Dokument ist ein Fehler.
6. Alle Änderungen gehen durch vorhandenen Action-Digest, zustimmungsgebundene Permits und einmalige Dispatchlogik. Hat die Aktion nachweislich nicht dispatcht, darf der Agent neu beobachten. Bei unbekanntem Ergebnis einer Schreibaktion darf kein automatischer Wiederholungsklick erfolgen.

**Tests:** Verdeckt, disabled, readonly, bewegender Button, Scroll nötig, Mutation zwischen Observe/Permit/Queue/MouseDown, Permissionrevoke, Fokusverlust, Unicodeinput, Digest mit anderer Ref oder anderem Text, unknown write outcome. **Abnahme:** Klick trifft das beobachtete Element; ein ersetztes Ziel wird verweigert, auch wenn CSS und Label gleich sind.

## Paket P07 Ergebnisbelege und bedingungsgebundenes Warten

1. Erweitere das vorhandene Actionjournal und `NativeActionRecord`; erfinde keine zweite Idempotenzdatenbank. Jeder Beleg enthält operation_id, vorherige Snapshot-/Refidentität, Status, Dispatchstatus, Zeit und begrenzten Nachzustand.
2. Erlaube nur feste Ergebniserwartungen: `navigation`, `element_visible`, `element_hidden`, `dialog_open`, `text_changed` in einem gebundenen Bereich. Keine beliebigen JavaScript-Predicates oder Seitenskripte. Die Erwartung ersetzt keine Berechtigungsklassifizierung.
3. Unterscheide `not_dispatched`, `dispatched`, `verified`, `verification_failed`, `interrupted_unknown`. Eine fehlgeschlagene Verifikation nach Dispatch bleibt eine möglicherweise ausgeführte Aktion. Nicht als sicher wiederholbar markieren.
4. `agent_browser_wait` lauscht bevorzugt auf relevante Ereignisse und verwendet begrenzte Nachprüfungen. Kein permanenter vollständiger DOM-Poll und keine Browserreloads zum Warten. Höchstens 10 Sekunden pro Aufruf, einmalige Verwendung des Action-Kontexts, sofortiger Abbruch bei Pause/Widerruf.
5. Zustandsänderung löst einen neuen Snapshot aus. Das Receipt referenziert diesen Nachsnapshot oder weist ausdrücklich aus, dass die Nachbeobachtung nicht erfolgreich war. Bei Transportverlust bleibt die ursprüngliche Dispatchhistorie maßgeblich.

**Tests:** Klick ohne Navigation, verzögerter Dialog, Erfolg nach kurzer Wartezeit, Timeout nach tatsächlicher Eingabe, Parentverlust während Ergebnisprüfung, Wiederholung derselben operation_id mit gleicher/anderer Aktion. **Abnahme:** Das Tool sagt nicht mehr nur, dass eine Eingabe gesendet wurde, sondern welche Wirkung beobachtet wurde oder unbekannt blieb.

## Paket P08 Screenshots und nummerierte Overlays

1. Capture auf der vorhandenen Lease-Queue und über den vorhandenen Screenshotpfad ausführen. Aufnahme an dieselbe Snapshot-/Target-/Dokument-/Epochidentität binden. Vorher und nachher Identität und Geometrie prüfen. Eine Queue allein verhindert DOM-Änderungen während der Aufnahme nicht.
2. Liefere screenshotId, MIME-Type, Pixelabmessungen, Hash, Aufnahmezeit sowie die Umrechnung von Top-Viewport-CSS-Pixeln zu Bildpixeln. Browserzoom und devicePixelRatio ausdrücklich unterscheiden. Screenshot max. 8 MiB, begrenzte Bilddimensionen; größere Ergebnisse als Crop oder kontrollierte Skalierung mit Transform-Metadaten.
3. Overlay wird in einem vertrauenswürdigen Main-/Shell-/Bildpfad aus der Refkarte auf das Bild gezeichnet. Keine DOM-Injektion in die Website. Dadurch verändern Labels weder Layout noch Hit-Targets oder Seitenskripte.
4. Jedes Label entspricht einer `displayNumber` und `elementRef` desselben Snapshots. Bei Identitäts-/Layoutänderung während Capture: höchstens zwei reine Aufnahmeversuche, dann `unstable_snapshot`. Niemals einen alten DOM-Snapshot auf ein neues Bild legen und als aktuell ausgeben.
5. Element-/Bereichscrops liefern dieselbe Identität und einen exakten Rücktransform. Plain Screenshot und Overlay sind alternative Darstellungen desselben Captures, kein neuer globaler Snapshot.

**Tests:** DPI 100/125/150/200 Prozent, Browserzoom, kleiner Viewport, Scroll, Frameoffsets, Labelkollisionen, Capture unter Mutation, Hash/Ref-Mismatch, Crop-Rücktransform, fehlende Displaysurface, revoke während Capture. **Abnahme:** Markierter Button im Bild und Textref zeigen auf exakt dieselbe Beobachtung; kein Overlay verändert die Website.

## Paket P09 Änderungen kompakt zurückgeben

1. Erzeuge eine semantische Metadatendifferenz zweier unmittelbar aufeinanderfolgender Snapshotversionen derselben Lease. Die alte Version darf dafür als read-only Vergleich bis zur nächsten Beobachtung aufbewahrt werden, ihre Actionrefs bleiben ungültig. Höchstens zwei Vergleichsversionen.
2. Liefere hinzugefügte, entfernte und geänderte Rollen/Namen/Zustände/Geometrien. Nodeidentität nur intern zum Matching nutzen. Keine alte Ref für einen neuen Knoten wiederverwenden.
3. Wenn Matching nicht sicher ist, melde entfernt plus hinzugefügt. Keine Modellschätzung als technisch bestätigte Elementkontinuität darstellen.
4. Behalte eine begrenzte Vollsnapshot-Funktion. Diffs weisen ihre Basis-ID aus; fehlende Basis führt zu `diff_base_missing`. Antwortlimits und Trunkierung bleiben erhalten.

**Tests:** Sortierreihenfolge geändert, DOM-Ersetzung mit gleichem Namen, neuer Dialog, entfernter Button, andere Lease, fehlende Basis, Budgetüberschreitung. **Abnahme:** Agent kann einen Nachzustand aus begrenzter Änderungsliste verstehen und nutzt nur die neuen Actionrefs.

## Paket P10 Raster und visuelle Ziele ergänzen

1. `agent_browser_grid` erzeugt aus einem gebundenen Capture eine begrenzte Karte, z. B. 8 Spalten und 6 Zeilen. Zellen werden eindeutig als A1 bis H6 benannt; jeder gridRef bindet an Snapshot, Screenshot-Hash, Crop und Transform.
2. Ein Agent kann eine Zelle vergrößern und dort ein feineres Raster anfordern. Keine freie Zeichenkette wie „irgendwo rechts“ als ausführbare Koordinate. Erlaubte Rasterauflösung 2 bis 16 je Achse, insgesamt maximal 256 Zellen.
3. Pointeraktionen enthalten gridRef, Zelle, Aktion und optional einen Offset im Bereich 0 bis 1. Main berechnet daraus Koordinaten. Exakte Aktion und Raster-/Snapshotidentität gehören in den Digest. Der Worker erhält keine generelle OS-Mauskontrolle.
4. Vor Pointerdispatch Layout, Capturefrische und Hit-Target prüfen. Bei semantisch verfügbarem Element seine Ref bevorzugen. Für Canvas muss der beobachtete Canvas beziehungsweise die freigegebene Region das tatsächliche Hit-Target sein. Eine Änderung des Canvasinhalts ohne Geometrieänderung muss bei der Frischeprüfung berücksichtigt werden.
5. Fremde Iframes, Videos oder dauerhaft animierte Flächen können `unstable_visual_target` zurückgeben. Dieses Ergebnis nicht durch blindes Wiederholen umgehen.

**Tests:** Zellgrenzen, Crops, fraktionale DPI, veralteter Screenshot, Animation, verdeckter Canvas, Pointer außerhalb Bereich, geänderte Bildgröße, andere gridRef/Lease. **Abnahme:** Ein lokales Canvas-Testformular ist mit Textbefehlen über Raster bedienbar; stale/unknown Aktionen werden nicht wiederholt.

## Paket P11 Ergänzende Bedienaktionen

1. Containergebundenes Scrollen implementieren; Richtung und Distanz begrenzen, Nachzustand messen und Snapshot invalidieren. Nested Scroll muss das ausgewählte Element statt des Body treffen.
2. Hover sendet echte Pointerbewegung und prüft danach Tooltip/Popup, falls erwartet. Keine synthetische JS-Eventinjektion als Ersatz für tatsächliche Eingabe.
3. Key-Aktionen auf gebundenen Fokus beschränken. Erste Allowlist: Enter, Escape, Tab, Shift+Tab und Pfeiltasten. Weitere Shortcuts nur als benannte, getestete Aktion. Kein beliebiger String als Native-Keycode.
4. Dropdown-/Checkbox-/Radioverhalten über feste semantische Aktionen oder sorgfältig geprüfte echte Eingaben abbilden. Ergebnis `checked`/`selected` bestätigen. Ein Tool darf nicht eine Valueeigenschaft ändern und dadurch erfolgte Nutzerbedienung behaupten.
5. Drag-and-drop bindet Source und Target an denselben aktiven Snapshot, prüft beide, hält die Gates zwischen Bewegungsschritten und bringt bei Abbruch die Eingabe in einen definierten Zustand. Kein blindes erneutes Drag nach unbekanntem Outcome.
6. Filechooser und Download ergänzen erst nach explizitem Vertrag für erlaubte lokale Pfade und vorhandene Zustimmung. Nicht aus einem Webseite-Label einen beliebigen Dateizugriff ableiten. Downloads liefern lokal begrenzte Artefaktmetadaten; kein automatisches Öffnen oder Ausführen.

**Tests:** Nested Scroll, Tooltipverdeckung, Fokuswechsel, Radio-/Selectzustand, Dragabbruch/Widerruf, Ausführung außerhalb erlaubter Region, Pfad außerhalb erlaubter Auswahl, Downloadverwechslung. **Abnahme:** Jede angebotene Aktion ist funktional und hat einen überprüften Outcome. Noch nicht implementierte File-/Downloadfähigkeiten nicht bewerben.

## Paket P12 LastBrowser Shell bedienbar machen

1. Erfasse ausschließlich eigene Shellcontrols über stabile interne IDs und Accessibility-Metadaten. Shellref und Websiteref sind unterschiedliche Typen/Namensräume; kein Element einer Website kann als Quickchat- oder Tabcontrol ausgeführt werden.
2. `agent_shell_observe` liefert aktive Panel-/Tabidentität, gebundene Controls, Fenstergeometrie und zulässige Aktionen. Keine Chattexte, Kontodaten oder pauschale Profilliste im Diagnosesnapshot.
3. Beginne mit festen Aktionen: Tab aktivieren, Tab schließen, gebundene Adresse navigieren, zurück/vorwärts/stop, Quickchat öffnen/schließen, eigenes Chatpanel öffnen. Bestehende Handler wiederverwenden. Nicht durch DOM-Klicksimulation dieselben Dinge indirekt erneut implementieren.
4. Normale Nutzertabs brauchen eine explizite User-/Parentbindung. Ein Agenten-Lease berechtigt nicht automatisch zur Manipulation aller Nutzertabs. Independent-Targets behalten den existing Ownerflow inklusive Pause/Takeover.
5. Userinput, Fokuswechsel und manuelle Übernahme invalidieren betroffene Shellrefs. Die Toolantwort bestätigt den tatsächlichen React-/Main-Zustand. Quickchatöffnung unabhängig von einem Providerrequest testen.
6. Diagnoseenable/-disable ist eine interne, vertrauenswürdig ausgelöste Aktion. Kein allgemeines Website-Tool darf Diagnose oder globales CDP einschalten. Es entstehen keine sichtbaren normalen Nutzerbuttons nur zum Debuggen.

**Tests:** gleich benannter Websitebutton, anderes Fenster, geschlossenes Tab, geänderter Fokus, User-/Agentkonflikt, Quickchat noch ohne Provider, Stop der richtigen Seite. **Abnahme:** Argus kann die Browserschale ohne Pixelraten prüfen und steuert stets das gebundene Ziel.

## Paket P13 Aktionen und Netzwerkdiagnose verbinden

1. Verknüpfe den vorhandenen Actionbeleg mit Diagnose-Session und operation_id. Öffentliche Text-/Bildartefakte und bereinigter Diagnosetrace sind getrennte Datenklassen. Ein autorisierter Agent darf Taskseiten lesen; das erlaubt noch keinen unbegrenzten Hintergrundmitschnitt.
2. Network/Runtime-Diagnose nur bei aktivierter Session an das erlaubte eigene Target anhängen. Bestehenden Electron-Debuggerzugang und Ownership benutzen; nicht durch eine zweite CDP-Attach-Verbindung den Independent Host detach-en.
3. Defaultdaten: monotone Zeiten, Ressourcentyp, Methode, Status, numerischer Fehler, gekürzte/gesalzene lokale Requestkorrelation, initiator-Kategorie und Haupt-/Unterframebezug. Keine Bodies, Cookies, Authorizationheader, Queryparameter oder Konsolenargumentwerte. Erweiterte sensible Capturemodi brauchen einen gesonderten expliziten Auftrag und begrenzte lokale Retention.
4. Erfasse Request-/Navigationrate in einem gleitenden Fenster und Wiederholungsmuster. Ein wachsender Adblockzähler ist ein Symptom und kein Beweis für Seitenreloads. Diagnose muss Reloads, SPA-Requeries, Adblockblockierung, Redirects und Webview-Neumounts getrennt darstellen können.
5. Implementiere einen konfigurierbaren Watchdog: zunächst read-only Warnsignal; automatische Stop-/Tabclose-Aktion nur für den gebundenen Testlauf mit vorher festgelegtem Budget und erlaubter Aktion. Empfehlung für Argus-Willhaben-Test: maximale Aufnahme 15 Sekunden und Stop bei drei Hauptframe-Navigationsstarts binnen zehn Sekunden. Das sind Testbudgets, kein bewiesener Defektgrenzwert.
6. Auf 429/Challenge Hinweise pausieren und Belege sichern. Kein automatisches Reloadrennen, keine Challengeumgehung. Diagnose-Listener dürfen keine Requestpolicy verändern.
7. Export verknüpft Capabilitystand, Appbuild, Session, Aktionen, begrenzte Ereignisse und Trunkierung. Disable/Lease-Ende entfernt alle Listener. Kein permanenter Performanceoverhead im Normalbetrieb.

**Tests:** zwei Leases, gleichzeitige Diagnose/Agentsteuerung ohne Debuggerdetach, Listenercleanup, Requeststurm, Adblockzählanstieg ohne Navigation, Redirectkette, Watchdog mit/ohne Stopfreigabe, Inhalte/Secrets werden verworfen. **Abnahme:** Argus kann das Willhaben-Verhalten belegen, ohne die Seite durch das Diagnosesystem zusätzlich zu refreshen.

## Paket P14 Reproduzierbare Abläufe und optionaler MCP Adapter

1. Speichere erfolgreiche Abläufe als strukturierte Schritte mit semantischen Zielbeschreibungen, Operationtypen und Ergebniserwartungen. Keine historischen snapshotId-/elementRef-Werte als wiederverwendbare Klickziele persistieren.
2. Beim Wiederholen immer frisch beobachten, das semantische Ziel eindeutig auflösen und einen neuen Permit-/Operationkontext benutzen. Ambiguity stoppt den Ablauf. Schreibaktionen behalten bestehende Zustimmungsgates und Unknown-Outcomes.
3. In der ersten Abnahme nur lokale Fixtureseiten replayen. Echte Shops, Nachrichten oder andere externe Seiteneffekte nicht als unbeaufsichtigte Replaytests benutzen.
4. Ergänze einen schmalen MCP-Adapter als separat deaktivierte Integrationsschicht, wenn die bestehenden Sidekick-MCP-Verträge dies erlauben. Verwende Stdio oder den vorhandenen authentifizierten Transport; kein neuer ungeschützter HTTP-Server. Clientidentität wird an Parent/Scope/Owner gebunden und kann nicht vom Modell frei behauptet werden.
5. Tooldefinitionen aus denselben v2-Verträgen beziehen. Arbiträres MCP ist im nativen Policy-Pfad derzeit verweigert; ändere diese Policy nicht pauschal. Wenn die konkrete Adapterroute dort nicht sauber autorisierbar ist, stelle den Adapter separat mit expliziter Bindung bereit und behalte die feste Native-Toolroute.

**Tests:** Replay nach Layoutänderung, doppelte Labels, verschwundenes Ziel, neue Refauflösung, Clientwechsel, fehlende Ownerbindung, falscher Scope, deaktivierter Adapter, Drop der Verbindung nach Dispatch. **Abnahme:** Gleicher erlaubter Ablauf lässt sich testen; kein Adapter ist mächtiger als der direkte Toolpfad.

## Paket P15 Performance und Regressionen messen

1. Nutze lokale feste HTML-Fixtures und einen lokalen HTTP-Server. Keine externen Websites für Unit-/Integrationtests. Fixturequellen gehören ins Repo, enthalten keine Secrets und keine externen Skripte.
2. Baue Fixtures für Standardcontrols, SPA-Knotenwechsel, Overlay, verschachtelte Scroller, same-origin und cross-origin Frames, offene Shadow Roots, Canvas, verzögerte Navigation/Dialoge und Requestschleife. Cross-origin mit zwei lokalen Ports und getrennten Allowlists testen.
3. Messe auf derselben VM: Capabilityabfrage, kleine Observekarte, Click inklusive Vorprüfung, Snapshot mit Bild/Overlay, Diagnose aus/an und Quickchatöffnung. Warm/cold getrennt, mindestens 20 Wiederholungen für reine lokale Read-/UI-Aktionen; keine 20 Providerrequests.
4. Zielbudgets: warme kleine Observekarte p95 unter 500 ms, reiner Main-/Bridge-Overhead einer gebundenen Aktion p95 unter 100 ms ohne Warte-/Renderingzeit, Standardcapture mit Overlay p95 unter 1,5 s. Diese Budgets sind Abnahmeziele, keine bereits gemessenen Leistungsversprechen. Bei Überschreitung Ursache, Zielgröße und tatsächliche Messwerte angeben.
5. Default-aus-Diagnose darf keine Background-Captures, Polls oder lokalen Writer haben. Feature-aus muss bisherige Browser-/Chatbedienung erhalten. Keine großen Vollsnapshotantworten pro Token oder Poll.
6. Prüfe Bounds bei absichtlich riesigem DOM, viel Streaming und dauerhaft animierter Seite. Retention bleibt begrenzt, UI antwortet, Cancel/Stop bleibt schnell. Erfolgskriterium ist nicht das vollständige Einlesen jeder beliebig großen Seite.

**Abnahme:** Messprotokoll mit Build-/VM-/DPI-/Viewportangaben und den tatsächlich gemessenen p50/p95-Werten. Bekannte Limitierungen sind konkret und reproduzierbar.

## Paket P16 Gesamtprüfung und Übergabe

Führe nach der letzten Codeänderung die Repo-Gates aus. Auf Windows bei verfügbarem npm:

```text
npm --workspace apps/desktop run test:run
npm --workspace apps/desktop run build
npm run verify:store
python -m compileall -q services/sidekick
python -m pytest services/sidekick/tests/test_native_chat_tool_policy.py services/sidekick/tests/test_native_root_browser_transport.py services/sidekick/tests/test_native_chat_transport.py services/sidekick/tests/test_independent_runs.py services/sidekick/tests/test_independent_governance.py
```

Ergänze die tatsächlichen neuen Snapshot-/Action-/Overlaytests. Testkonfiguration und Python-Testabhängigkeiten zuerst prüfen; eine fehlende `pytest`-Installation ist kein bestandenes Backendgate. Nutze auf Linux die dafür geltenden Repoanweisungen und kennzeichne den nicht ausgeführten Windows-Storegate als ausständig. Vesper darf den Implementierungscode auf Linux bearbeiten; Windows-Liveabnahme und private Paketintegration gehen an Nord/Argus.

Falls bereits die PR-Basis Fehler enthält: mit unverändertem Worktree unter derselben Umgebung vergleichen; separat dokumentieren; keine ungeprüfte Releasefreigabe. Kein neuer Fehler darf unter der Baseline verschwinden. Alle neuen Tests müssen grün sein. Statische Stringtests allein sind kein Beweis für reale Klick-/Frame-/Capturefunktion; ergänze echte lokale Chromium/Electron-Fixtures.

Erstelle einen Draft-PR mit Bezug zum Diagnose-v1-PR. Beschreibung: neue Fähigkeiten, betroffene Verträge, Belege, Grenzen, Featureflags und Rückbau. Übergebe Nord konkrete Commits und den Basisabgleich. Kein Windows-Paket aus einem falschen alten Stand erzeugen.

Argus testet anschließend die neue Windowsbeta: Diagnose aus/an; kurzer Willhaben-Marktplatzlauf; Toolbar-Quickchat; Standardchat; GPT-/OpenCode-Prompt, Streaming, Cancel/Stop und Follow-up; Fixtureseite mit Elementkarte, markiertem Screenshot, SPA-Staleref und Canvasraster. Für externe Provider genügen wenige explizite Testprompts; keine automatisierten Lasttests.

## Fehlerantworten und Entscheidungshilfen

| Fehler | Bedeutung | Nächster erlaubter Schritt |
| --- | --- | --- |
| `stale_snapshot` | Snapshot abgelaufen oder Zustand verändert | Frisch beobachten; alte Ref verwerfen |
| `element_missing` | Gespeicherter Knoten ist weg | Neu beobachten; niemals still zum ähnlichen Ziel klicken |
| `ambiguous_target` | Semantische Auswahl ist mehrdeutig | Weitere Beobachtung oder eindeutigen Bereich wählen |
| `not_visible` / `disabled` / `readonly` | Gewünschte Bedienung nicht möglich | Zustand beobachten; höchstens begrenzt warten |
| `obstructed` | Anderes Element nimmt den Klick entgegen | Overlay beobachten; nur autorisiert bedienen |
| `origin_denied` | Ziel außerhalb gebundener Originfreigabe | Keine Aktion; zuständigen Freigabeflow verwenden |
| `unsupported_frame` / `closed_shadow_unsupported` | Dieser Dokumenttyp ist nicht umgesetzt | Capabilitygrenze melden, keinen Ersatz erfinden |
| `unstable_snapshot` / `unstable_visual_target` | Keine verlässliche Bild-/DOM-Paarung | Begrenzte neue Beobachtung; danach klare Grenze |
| `verification_failed` | Aktion dispatcht, Wirkung nicht bestätigt | Nachzustand prüfen; Schreibaktion nicht blind wiederholen |
| `interrupted_unknown` | Nach Dispatch ist Ergebnis unbekannt | Bestehendes Journal und Zustand abgleichen |
| `permission_revoked` / `target_lost` | Autorisierung oder Ziel beendet | Sofort stoppen, alte Refs und Permits verwerfen |
| `budget_exceeded` | Größe, Zeit oder Retention ausgeschöpft | Begrenzten Bereich neu beobachten oder Test beenden |

Ein Fehlername allein genügt nicht: Response muss schemaVersion, operation_id, `dispatched`, Retryklassifizierung und die vom bisherigen Journal bestimmte Outcome-Sicherheit enthalten. Kein Payload darf ausführbaren Seitencode, Tokens oder Loginwerte im Fehlertext wiedergeben.

## Vollständige Abnahmematrix

| Prüffall | Erwartetes Ergebnis |
| --- | --- |
| Defaultzustand | Neue Agentenfähigkeiten und Diagnose ohne Freigabe aus |
| Normaler Button | Textref, Screenshotlabel und tatsächliches Klickziel identisch |
| Button ersetzt, Name gleich | Staleref abgewiesen; neue Ref nötig |
| Dialog über Button | Verdecktes Ziel abgewiesen, keine Klickdurchleitung |
| Alter Snapshot nach Scroll | Kein stiller Koordinatenfallback |
| Zweiter Nutzer/Owner/Lease | Fremde Refs, Captures und Permits abgewiesen |
| Widerruf vor Queueausführung | Kein CDP-Eingabedispatch |
| Widerruf während Aktion | Sofortiger Stop, Outcome nach Dispatch konservativ unbekannt |
| Same/cross-origin Frame | Exakte Dokumentbindung, nicht freigegebener Frame abgewiesen |
| Offener/geschlossener Shadowroot | Implementierte Fälle funktionieren, Rest eindeutig ausgewiesen |
| DPI/Zoom/Crop | Bildnummern und Koordinatentransform stimmen |
| Canvasraster | Zellaktion trifft freigegebene Region, stale Bild abgewiesen |
| Gleichzeitige Diagnose und Agent | Kein Debuggerdetach, keine verlorene Ownership |
| Quickchat langsam | Messung trennt Öffnen, Discovery, Backendakzeptanz und First-delta |
| Requestschleife | Diagnose trennt Request-/Navigation-/Mount-Ereignisse; Budget stoppt nur autorisiert |
| Wiederholung nach Transportverlust | Kein zweiter möglicherweise ausgeführter Schreibvorgang |
| Riesige Seite/Streams | Trunkierung sichtbar, Speicher begrenzt, UI und Stop reagieren |
| Privater Beta-Livecheck | Argus liefert Belege; kein behaupteter Willhabenfix allein durch Diagnosepatch |

## Bewusste Grenzen und Rollback

Kein CAPTCHA-/Cloudflare-Bypass, keine globale OS-Fernsteuerung, keine neue Webseite-injizierte Debugkonsole, kein ungeprüftes Download-Execute und kein unbegrenzter CDP-Proxy. Diese Grenzen sind technische Scopegrenzen des Ausbauauftrags, kein Ersatz für die bereits vorhandenen Nutzerfreigaben.

Rollback erfolgt zuerst durch Ausschalten der neuen Featurefreigabe und Beenden der Diagnosesessions. Bestehende v1-Diagnose und alte Browsertools bleiben benutzbar. Listener, Queuejobs und Refmaps werden aufgeräumt; In-flight-Outcomes bleiben im bisherigen Journal erhalten. Vertragscommits, die Main und Python gemeinsam ändern, werden gemeinsam revertiert. Bereits gesendete externe Aktionen kann ein Code-Revert nicht rückgängig machen.

## Bestehende Werkzeuge als technische Referenz

- [Playwright Actionability](https://playwright.dev/docs/actionability): sichtbare, stabile, aktivierte und unverdeckte Ziele sowie begrenztes Warten.
- [Playwright Accessibility Snapshots](https://playwright.dev/docs/aria-snapshots): strukturierte Rollen-/Namenbeschreibung als Referenz für die Textansicht.
- [Chromium Accessibility](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/), [DOMSnapshot](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/) und [Page](https://chromedevtools.github.io/devtools-protocol/tot/Page/): vorhandene Chromium-Bausteine für begrenzte Beobachtungen und Captures. Gegen die tatsächlich gebündelte Electron/Chromium-Version prüfen.
- [Playwright MCP](https://github.com/microsoft/playwright-mcp), [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp): Referenzen für Toolschnittstellen. Keine automatische Übernahme ihrer allgemeinen Zugriffsrechte oder Dependencies.
- [Microsoft UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/entry-uiautocore-overview): mögliche zusätzliche Windows-Shell-Anbindung. Die eigene Electron-Shell bietet hier zuerst direkte, feste Aktionen.

## Bericht den Vesper liefern muss

Abschlussbericht enthält PR-/Commitlinks, erfüllte Pakete P00 bis P16, Capability-Matrix, tatsächliche Test-/Buildresultate, Basisvergleich bei Fehlern, gemessene Performance, verbleibende Limitierungen und einen genauen Beta-Testauftrag an Nord/Argus. Ein Paket mit Attrappen, ungetesteten entscheidenden Pfaden oder still übersprungenen Teilfähigkeiten ist nicht erledigt. Fehlende externe Releasequelle blockiert nur Releaseintegration; die hier autorisierte Implementierung wird weitergeführt.
