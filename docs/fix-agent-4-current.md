# FIX AGENT 4 – Paketzuordnung und Source-Grenze

Prüfzeit: 2026-10-04, nach dem Feature-Testbuild `18-49-45-775Z-45c99ab2`.
Nur dieses Handoff-Dokument wurde durch FIX AGENT 4 geändert.

## Autoritative Zuordnung

Das getestete Preview ist
[`output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2/win-unpacked/Lastbrowser.exe`](../output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2/win-unpacked/Lastbrowser.exe).
Die getrennt gebauten Distributionsdateien sind
[`Lastbrowser-0.1.43-x64-setup.exe`](../output/dist-preview-2026-10-04T18-49-45-775Z-45c99ab2/Lastbrowser-0.1.43-x64-setup.exe)
und
[`Lastbrowser-0.1.43-x64-portable.exe`](../output/dist-preview-2026-10-04T18-49-45-775Z-45c99ab2/Lastbrowser-0.1.43-x64-portable.exe).
Alle gehören zur selben Preview-ID, Version 0.1.43 / Sidekick 0.8.84 / Castlabs Electron 37.10.3+wvcus.

| Artefakt | Bytes | SHA-256 |
| --- | ---: | --- |
| Unpacked `Lastbrowser.exe` | 205,065,216 | `1f5e6d19b915dcddea6d07a42e9a60bf959d4495c778a6aaf8c0926562fbcd52` |
| `resources/app.asar` | 63,651,013 | `f1e4f44ab9df6e8dad966f8ae9bd0c17eb4dda933f6de978503e3c8e01fed332` |
| NSIS setup | 175,070,066 | `6750e81b6e648b25a3b79a6701eb05c965f251c9a33a206fc6fb9c63191cd81b` |
| Portable | 174,715,920 | `31f73754485e6581aec82984b818e9e4b11cb48ebdd404e0739a91c3f5a89b1d` |

The package's `preview-result.json` records 10,241 resources, `blocked: []`,
`unsigned: true`, `published: false`, and `fullAcceptanceVerified: false`.
`resource-hashes.json` hashes the packaged tree; it is not a source-freeze
manifest. `START-HERE.md` records the build-time claims and boundaries.

## Runtime evidence and limits

The existing Direct EXE report is `output/direct-exe-d5b2d3e0-9638-4951-8486-f891f0dafa6b.json`;
the Portable report is `output/portable-exe-14776413-08ab-448b-9d38-3bc9c25d8c34.json`.
Both record a controlled isolated-profile launch, bundled Sidekick ready, exit
code 0 and cleanup. They are launch smokes, not full feature acceptance or
model inference. The direct report's CDP `Browser.close` acknowledgement timed
out despite process exit 0; shutdown logs also contain transient connection
errors. These are limitations of the recorded smoke, not hidden pass claims.

The CRT report `output/local-ai-crt-report-20261004-205448.json` confirms the
three app-local CRT files and successful host `--version`/`--help` runs. Its
verdict is WARN: clean-Windows dependency closure is unverified because the
host has matching System32 CRT files. The source manifests still say
`licenseClosureVerified: false`; formal Microsoft redistribution review and
model weights/inference remain open. Do not describe local AI as ready for
inference or redistribution.

## Current-source comparison

I compared selected files from the live source tree with the packaged resource
tree by byte count and SHA-256. These backend files currently match exactly:
`web/api/streaming.py`, `web/api/independent.py`,
`runtime/independent/scope_binding.py`, `runtime/independent/runner.py`,
`runtime/independent/native_chat_auto.py`, `web/api/profiles.py`,
`cli/profiles.py`, `web/api/model_policy.py`, and the three
`runtime/independent/native_browser*.py` files. The entries for
`provider_evidence.py` are absent in both trees; evidence is implemented in
`streaming.py`, so that absent optional path is not counted as a pass.

The current main-process build no longer matches the packaged ASAR:
`dist/main/sidekick-api.js` is 73,682 bytes now versus 73,636 bytes packaged
(different SHA-256). `dist/main/independent-controller.js` still matches.
The renderer bundle is definitively stale: the package contains
`index-DYQvYgfb.js` (2,236,000 bytes, SHA-256
`b9d428c22402f0f475cc8dd559a88bfcc46aaa601ef7dc9bfc68427458afcfd5`), while
current `apps/desktop/dist/renderer/assets/index-D-UzvM8A.js` is 2,235,703
bytes (SHA-256 `0e0d05c980b0357725e2f2acf0b052e30ba7c2ec48af893a43357d480cdefc68`).
Current `App.tsx`, `session-list-scope.ts`, and `sidekick-api.ts` have source
changes after this package. Root additionally confirms the latest renderer
scope-guard change is absent from this preview. Therefore its Backend Profile
dropdown and prior two-profile launch evidence do not validate that latest
guard. Current renderer build output was written at 21:04 Vienna, later than
the package.

## Safe test choice and repack scope

For hands-on testing of the already recorded build, use the linked unpacked
EXE above. The portable EXE has its own passing launcher smoke and can be used
when portable behavior is specifically under test. These are test artifacts,
not a current-source release.

To test the latest source, wait for the coordinated source freeze, rebuild
Main and Renderer, then create a new offline unsigned `win-unpacked` package
and regenerate both setup and portable artifacts from that same package ID.
The backend files checked above do not currently require repacking on their
own, but any further backend/profile/evidence changes before freeze must be
included. Do not reuse the 18:49 hashes or its smoke reports as evidence for
the new source. CRT clean-machine closure, Microsoft license approval and real
model inference remain separate open checks.

## Aktueller Offline-Preview-Neubau (4. Oktober 2026)

Auf Root-Freigabe wurde nach grünem Renderer-Typecheck/20 Scope-Tests und
unverändertem Produktquellstand genau ein erfolgreicher Offline-Preview-Build
erstellt. Verwendet wurde
[`output/feature-preview-2026-10-04T19-23-57-326Z-679964ac/win-unpacked/Lastbrowser.exe`](../output/feature-preview-2026-10-04T19-23-57-326Z-679964ac/win-unpacked/Lastbrowser.exe).
SHA-256 EXE: `3aff1c4c5ed08e983cb869f49e11cd532cf4aaeeb4f93004252e0811691633a8`;
SHA-256 app.asar: `745bfb70d714e418b69591ca9e7973b9d44712f0db368505d466042de38531d8`.
`preview-result.json`: 10,241 Ressourcen, `blocked: []`, unsigned,
unpublished, `fullAcceptanceVerified: false`. Es wurden keine Setup- oder
Portable-Installer und keine Laufzeit-Smokes ausgeführt.

`npm --workspace apps/desktop run build` war nach einem ersten Sandbox-Fehler
(`esbuild` spawn `EPERM`) beim Wiederholen erfolgreich: Main-TS/preload,
Renderer-Typecheck und Vite-Build; Vite meldete nur den Chunkgrößenhinweis.
`node scripts/package-feature-preview.cjs` scheiterte im Sandboxlauf beim
Child-Process (`spawn EPERM`), der identische Offline-Lauf außerhalb der
Spawn-Sandbox war erfolgreich. Der fehlgeschlagene Versuch hinterließ den
unvollständigen Ordner
`output/feature-preview-2026-10-04T19-23-32-883Z-64a193fe`; er wurde nicht
verändert oder entfernt.

Vorher-/Nachher-SHA-256 sind für `apps/desktop/src/main/main.ts`,
`apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/main/sidekick-api.ts`,
`services/sidekick/runtime/independent/runner.py` und
`services/sidekick/web/api/streaming.py` identisch. Der gemessene Quellstand
blieb während Build und Packaging unverändert.

## Isolierter Direct-EXE-Smoke

`node scripts/probe-preview-executable.cjs output/feature-preview-2026-10-04T19-23-57-326Z-679964ac`
bestand nach Sandbox-`spawn EPERM` beim Wiederholen außerhalb der Sandbox.
JSON-Bericht: `output/direct-exe-9e3cb5f0-3865-46c0-a064-8fa21b6a096e.json`
(Exitcode 0). Shell und Setup-UI wurden geladen; Sidekick/WebUI meldeten
`ready` (`v0.8.84`) im isolierten temporären Profil. Der EXE-Prozess endete
mit 0 und das Testprofil wurde bereinigt. Einschränkungen: CDP
`Browser.close`-Bestätigung lief in ein Timeout; Log enthält außerdem eine
kurze Port-8788-Bindekollision mit Restart und Verbindungsfehler. Somit nur
kontrollierter Start-/Health-Smoke, keine Inferenz oder Vollabnahme.

`START-HERE.md` im Preview-Ordner beschreibt den Befund und die Artefaktgrenze.
Die Setup-/Portable-Dateien aus Preview `18-49-45-775Z-45c99ab2` bleiben
historisch; sie enthalten nicht den neuesten Renderer Profile-Scope-Guard und
validieren ihn nicht. Für dieses Preview wurden keine Installer erzeugt.

## Nach Root-Korrektur: Preview und Dist (4. Oktober 2026)

Root korrigierte danach die Reihenfolge, sodass die explizite Backendprofilwahl
vor dem Erstellen eines Spaces gesetzt wird. Root meldete Scope-Tests und
Renderer-Typecheck grün; ich erstellte aus diesem eingefrorenen Stand genau
einen neuen Offline-Build:
`output/feature-preview-2026-10-04T19-40-59-132Z-ff82ee5e`.
`npm --workspace apps/desktop run build` bestand (Main/Preload,
Renderer-Typecheck, Vite; Chunkgrößenwarnung). `node
scripts/package-feature-preview.cjs` bestand: 10.241 Ressourcen,
`blocked: []`, unsigned, unpublished, `fullAcceptanceVerified: false`.
Vorher-/Nachher-SHA-256 für `main.ts`, `App.tsx`, `sidekick-api.ts`,
`runner.py` und `streaming.py` waren identisch; `App.tsx` enthält dabei Root's
neue Bindungsreihenfolge.

Gemessene SHA-256 vor und nach Build/Packaging (jeweils identisch):
`apps/desktop/src/main/main.ts` `1ba8fb5451ec6cf622e3d59914fe0838201c776fb40bfa19c7fee2a37b14902e`;
`apps/desktop/src/renderer/App.tsx` `6dc54ab364a699aa197b813a0b342205b5b04e7eee374f445edde18e783fcd85`;
`apps/desktop/src/main/sidekick-api.ts` `2391da29e7b2fa87a646a5190c11daa026bc42725271a3760834437fef5270c4`;
`services/sidekick/runtime/independent/runner.py` `1bf154fab22682050b641d05468487605eb955d39cc2f828f4b0880693668247`;
`services/sidekick/web/api/streaming.py` `df73dcd922848884f3339ea086b6854cda8f5daa61703431ae69427edc89365a`.

`node scripts/package-dist-preview.cjs
output/feature-preview-2026-10-04T19-40-59-132Z-ff82ee5e` bestand offline
(`npm_config_offline`, `ELECTRON_BUILDER_OFFLINE`, Proxy auf unerreichbarem
loopback-Port). Electron Builder protokollierte Signierung übersprungen.
Setup und Portable wurden im selben Lauf aus genau
`.../feature-preview-2026-10-04T19-40-59-132Z-ff82ee5e/win-unpacked` erstellt:

| Artefakt | Bytes | SHA-256 |
| --- | ---: | --- |
| Preview `resources/app.asar` | 63,651,051 | `74a6b9328df36ce9a3cbcb3267dd04639f55f25dbc107386002862be410099de` |
| `dist-preview-2026-10-04T19-40-59-132Z-ff82ee5e/Lastbrowser-0.1.43-x64-setup.exe` | 175,070,003 | `45f95ddf2b5e0db416a36a27ba0209bcd48b9f00981d89a3afd5850803083460` |
| `dist-preview-2026-10-04T19-40-59-132Z-ff82ee5e/Lastbrowser-0.1.43-x64-portable.exe` | 174,715,772 | `2dd13750508d65d2c667def51a1a7eaeba570716e887a3e64c3561ef6d585289` |

Beide Targets stammen aus demselben vorgepackten Preview-Verzeichnis; der
Build extrahierte jedoch nicht separat deren eingebettetes ASAR für einen
erneuten Inhalts-Hash. Setup erhielt keinen Runtime-Smoke. Der genau eine
isolierte Portable-Smoke-Befehl
`node scripts/probe-portable-executable.cjs
output/dist-preview-2026-10-04T19-40-59-132Z-ff82ee5e` schlug fehl:
`Portable launcher successfully extracted and exposed app:// renderer`
assertion nach 90 Sekunden; der JSON-Bericht ist
`output/portable-exe-93fdfcea-20c1-4b02-8e6f-1a44d02400d1.json` (Exitcode 1).
Eine gezielte Nachschau nur im owned temp tree bestätigte Portable-Extraktion:
`tmp\3KFAoDBmm5DXoe1Ywv6yCvNtmEN\Lastbrowser.exe` (205,065,216 Bytes) und
`resources\app.asar` (63,651,051 Bytes); ein zweiter 7z-Extraktionspfad enthält
dieselbe ASAR-SHA-256 wie das Preview. Konkret fehlte der CDP-Renderer bis zur
90-Sekunden-Grenze. Der Bericht hat keinen Kind-PID/Exitcode und leeren
`logTail`; im owned temp tree fanden sich keine `.log`, `.err` oder `.out`
Dateien und die isolierten AppData/LocalAppData-Verzeichnisse waren leer.
Deshalb bleiben „EXE-Start blockiert/fehlgeschlagen“ und „nur CDP nicht
erreichbar“ unterscheidbare, aber unbelegte Ursachen; Sidekick-Start ist nicht
nachgewiesen. Der Tempbaum `%TEMP%\lastbrowser-portable-aVHgqi` (ca. 1.4 GB)
bleibt für Diagnose erhalten. Der Bericht enthält keine PID; `Get-Process`
ergab keinen zugänglichen exakten Pfadtreffer, die CIM-Abfrage war verweigert.
Aus Vorsicht wurde daher kein Prozess beendet und kein Tempinhalt gelöscht.
Kein zweiter Smoke wurde gestartet. Der frühere Direct-EXE-Nachweis gehört
zur 19:23-Preview vor dieser Root-Korrektur und belegt die aktuelle Preview
nicht.

Die älteren Setup-/Portable-Artefakte vom 19:23-Lauf wurden fertiggestellt,
als Root-Korrektur während des laufenden Packaging eintraf; sie sind nur
Zwischenstand und wurden nicht getestet: Setup 183,363,965 Bytes, SHA-256
`74a7c618a2129bf36b240f3149b1f4f90c43a84172d847d5008c574d163355a2`;
Portable 183,009,730 Bytes, SHA-256
`d298d1feab08587710c075faa23fbc7c25d1e9dd3189f4a52f7062356fadf6a5`.

`output/feature-preview-2026-10-04T19-40-59-132Z-ff82ee5e/START-HERE.md`
ordnet Installer, Hashes, Smoke-Fehler und Beweisgrenzen zu. Goal/AUTO,
Abdeckung der zwei Backend-UIs, CRT-Lizenz und Clean-VM-CRT-Abschluss bleiben
offen; der Packaging-Erfolg ist keine Vollabnahme und kein Inferenzbeleg.

## Finale FIX3-UX-Preview und Direct-EXE-Nachweis

Nach dem gemeldeten FIX3-Sourcefreeze (Root: 30/30 fokussierte Tests und
Renderer-Typecheck grün) habe ich genau einen Desktopbuild und ein Offline-
Preview erstellt: `output/feature-preview-2026-10-04T19-56-14-043Z-6a599cdb`.
Der Build bestand für Main/Preload, Renderer-Typecheck und Vite; Vite gab nur
die Chunkgrößenwarnung aus. Preview: 10.241 Ressourcen, `blocked: []`,
unsigned, unpublished, `fullAcceptanceVerified: false`. Vorher-/Nachherhashes
für `SpaceAssistantPanel.tsx`, `independent-assistant.css`, `main.ts`,
`App.tsx`, `sidekick-api.ts`, `runner.py` und `streaming.py` blieben gleich.

SHA-256 (jeweils vor und nach Build identisch): `SpaceAssistantPanel.tsx`
`896506d2d85baa44f6d05a6f326c847621a382b0820e74e3b0a7e80bc1a7218d`,
`independent-assistant.css`
`ad1a6ce8dfb4460ffa2d7f18e7604a6a833a23ee6f56e394bfdadaa4eb429569`,
`main.ts` `1ba8fb5451ec6cf622e3d59914fe0838201c776fb40bfa19c7fee2a37b14902e`,
`App.tsx` `6dc54ab364a699aa197b813a0b342205b5b04e7eee374f445edde18e783fcd85`,
`sidekick-api.ts` `2391da29e7b2fa87a646a5190c11daa026bc42725271a3760834437fef5270c4`,
`runner.py` `1bf154fab22682050b641d05468487605eb955d39cc2f828f4b0880693668247`,
`streaming.py` `df73dcd922848884f3339ea086b6854cda8f5daa61703431ae69427edc89365a`.

Ein Offline-Dist-Lauf aus genau diesem Preview erstellte Setup und Portable
unsigned. Source-ASAR: 63,654,252 Bytes, SHA-256
`82275de7e28c2ce1b51e662e75170137fdadf2e3add283fca6349952368b5903`.

| Artefakt | Bytes | SHA-256 |
| --- | ---: | --- |
| `dist-preview-2026-10-04T19-56-14-043Z-6a599cdb/Lastbrowser-0.1.43-x64-setup.exe` | 175,069,775 | `a3f9c8aeb7a6f20510c0df91ea603652c5f6bf7d7d20c06f9b322f9ade884c39` |
| `dist-preview-2026-10-04T19-56-14-043Z-6a599cdb/Lastbrowser-0.1.43-x64-portable.exe` | 174,715,547 | `6ae870b57211fd7db7340fdd7157f23907b31c7e4d6c5878531dc4a8d94d12cd` |

Der Packaginglauf verwendete dasselbe `win-unpacked`-Verzeichnis als Quelle,
extrahierte aber nicht für jeden Installer separat ein internes ASAR zum
Inhalts-Hashvergleich. Es gab keine Installation oder Signierung.

Genau ein `node scripts/probe-preview-executable.cjs
output/feature-preview-2026-10-04T19-56-14-043Z-6a599cdb` bestand:
`output/direct-exe-119b926c-ae72-49b7-b8e8-db2aa82fa6c8.json` (Exitcode 0).
Shell und Setup UI erschienen; Sidekick/WebUI waren `ready` (`v0.8.84`), das
owned Testprofil wurde bereinigt. Einschränkungen: CDP `Browser.close` ACK
Timeout sowie kurzzeitige Startup-/Shutdown-Logs `ECONNREFUSED`/`ECONNRESET`.
Dies ist nur ein isolierter Start-/Health-Smoke. Es wurde weder Portable
gestartet noch Setup installiert. Der 19:40-Portable-Timeout ist ein
separater historischer Befund und gilt nicht als Test des FIX3-Artefakts.

Kein Screenshot des offenen Space Assistant wurde erfasst: die vorhandene
Probe verlässt First Run nicht und navigiert nicht zum Assistant; die dafür
erforderlichen profilgebundenen UI-Schritte gingen über die kleine Probe-
Erweiterung hinaus. Goal/AUTO, beide Backend-UIs, CRT-Lizenz, Clean-VM-
Abschluss und Vollabnahme bleiben offen. Vollständige Artefaktzuordnung und
Grenzen stehen in
`output/feature-preview-2026-10-04T19-56-14-043Z-6a599cdb/START-HERE.md`.
