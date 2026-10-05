# Independent Agent Endbatch Manifest

Stand: 2026-10-04 Europe/Vienna. Ausführungsnachweise im aktuellen Nachtrag; ältere Abschnitte bleiben als Planhistorie erhalten.

## Aktueller Nachtrag des Rootagents

2026-10-04: Aktueller Desktopgesamtbatch 171 Dateien / 1.583 PASS; Storepreflight 39 PASS / 2 WARN / 0 FAIL. Zusatzbackendbatch 51 Dateien: 406 PASS / 1 FAIL, terminal Exit 1. Fehlender Fixture-Reset des threadlokalen Sessionpfads in `test_grill_root_api.py` korrigiert; gemeinsamer Grill-/Native-Storage-/Storage-Regressionlauf 8 PASS. Kein vollständiger 407-PASS-Neulauf. Details und Nachweisgrenzen in preparation §21.31; ältere Nicht-ausgeführt-Angaben bleiben historische Planung.

Die folgenden älteren Abschnitte sind historische Planstände. Aktuelle praktische Nachweise stehen in `docs/independent-agent-preparation.md`, Abschnitte 21.8–21.15. Offlinepreview wird tatsächlich mit `node scripts/package-feature-preview.cjs` erstellt; `package:win` wird wegen seiner Signierhooks nicht als unsignierter Testlauf verwendet. Keine Gitaktionen oder Veröffentlichung.

Frisch ausgeführter begrenzter Backendbatch: `test_grill_root_api.py`, `test_native_session_storage_regression.py`, `test_native_stream_goal_root_integration.py`, `test_native_reader_production_bounds.py`, `test_native_grill_control_safety.py`, `test_native_root_browser_transport.py`, `test_independent_acceptance_regressions.py` — **18/18 PASS, 10,32 s**, shipped Python mit `-I -B`, explizitem vorhandenem Pytest-Librarypfad, ohne Cacheprovider und Threadexceptionwarnings als Fehler. Dies aktualisiert die früheren Aussagen „noch nicht ausgeführt“ nur für diese konkreten Dateien; daraus folgt keine vollständige M4-/SDK-/GUIabnahme.

Zusätzlicher gebündelter Featurebatch 17857: 499 PASS / 5 FAIL, Abbruch bei fünf Fehlern nach 316,13 s. Fünf veraltete Fixtures korrigiert, produktive Gates unverändert. Nachlauf 52706: 34 PASS / 2 FAIL; die beiden verbleibenden Fixturefehler anschließend gezielt 2/2 PASS in 1,15 s. Keine vollständige Wiederholung der 71 Dateien. Restbatch mit 23 tatsächlichen Native-/Provider-Dateien unter Handle 24265 gestartet; dessen Abschluss separat prüfen.

Restbatch 24265 beendet mit 3 PASS / 5 FAIL; veraltete direkte Hosttests auf tatsächliche Providercapture-/Parent-RPCstrecke korrigiert. Nachlauf `test_native_chat_process.py`: 8/8 PASS, 56,76 s. Shared Fixed-SDK-Prozesstests erneut 3/3 PASS, 14,03 s. Weitere 22 Dateien: 129 PASS / 2 FAIL, 249,52 s; beide alten Datei-Dispatchfixtures ohne Parentbroker werden gezielt korrigiert und nachgeprüft. Aktueller gepackter Main-/React-/Python-Smoketest Exit 0, Bericht `output/full-app-entry-3777e963-3487-40d0-9fd0-04defae43152.json`; direkte EXE-/Modellqualitäts-/Vollabnahme daraus nicht abgeleitet.

Nachkorrektur beider Datei-Dispatchfixtures: `test_native_chat_tool_policy.py` plus `test_native_tool_paths.py` **33/33 PASS, 27,47 s**, Handle 39395 terminal Exit 0. Alle gefundenen Fehler durch konkrete Nachläufe geschlossen; kein gesamter 71-Dateienlauf pauschal als grün ausgewiesen. Keine laufenden Testhandles dieses Nachtrags.

## Regeln

- Arbeitsbaum unverändert bewahren; keine Commits, Pushes, Installationen oder Profiländerungen.
- Gebündeltes Python verwenden; `PYTHONNOUSERSITE=1` setzen und den vorhandenen System-Pytest-Pfad explizit anhängen, da `apps/desktop/runtime/python/Lib/site-packages/pytest` aktuell nicht vorhanden ist.
- Temporäre Profile/SQLite-Daten ausschließlich unter pytest `tmp_path` bzw. einem expliziten temporären Root.
- `apps/desktop/.worktrees`, `.worktrees` und vorhandene Release-Artefakte nicht als Testdaten verwenden.
- Fehlgeschlagene Tests mit exakter Datei/Funktion/Trace sammeln; keine historischen Zähler übernehmen.

## Backend-Endbatch (ausführbar, noch nicht ausgeführt)

```powershell
$env:PYTHONNOUSERSITE='1'
$py='apps/desktop/runtime/python/python.exe'
$endbatch = Join-Path (Get-Location) (".endbatch-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $endbatch | Out-Null
$code="import sys;sys.path.append('C:/Users/logga/AppData/Roaming/Python/Python314/site-packages');sys.path.insert(0,'services/sidekick');sys.path.insert(0,'services/sidekick/tests');import pytest;sys.exit(pytest.main(['services/sidekick/tests','-q','-W','error::pytest.PytestUnhandledThreadExceptionWarning','--basetemp='+r'$endbatch']))"
& $py -c $code
if (Test-Path -LiteralPath $endbatch) { Remove-Item -LiteralPath $endbatch -Recurse -Force }
```

## Gezielte Root-/Native-Abnahme

```powershell
$env:PYTHONNOUSERSITE='1'
$env:PYTHONNOUSERSITE='1'
$py='apps/desktop/runtime/python/python.exe'
$code="import sys;sys.path.append('C:/Users/logga/AppData/Roaming/Python/Python314/site-packages');sys.path.insert(0,'services/sidekick');sys.path.insert(0,'services/sidekick/tests');import pytest;sys.exit(pytest.main(['services/sidekick/tests/test_grill_root_api.py','services/sidekick/tests/test_native_session_storage_regression.py','services/sidekick/tests/test_native_stream_goal_root_integration.py','services/sidekick/tests/test_native_reader_production_bounds.py','services/sidekick/tests/test_native_grill_control_safety.py','-q','-p','no:cacheprovider','-W','error::pytest.PytestUnhandledThreadExceptionWarning']))"
& $py -c $code
```

## Desktop Build/Store/Bundle-Gesundheit

Vorher sicherstellen, dass die Testauswahl keine `.worktrees`-Pfade oder Release-Artefaktordner einliest; `npm --workspace apps/desktop run test:run` ist der aktuelle Workspace-Testlauf.

```powershell
npm --workspace apps/desktop run build
npm run verify:store
npm --workspace apps/desktop run test:run
npm --workspace apps/desktop run package:win
```

Nach dem Bundle nur lokale, unsignierte Gesundheitsprüfungen ausführen; das beweist keine Signatur, Store-Freigabe, OAuth- oder externe Providerfunktion:

```powershell
python scripts/verify-packaged-integration.py
python scripts/smoke-backend.py
```

`verify-packaged-integration.py` und `smoke-backend.py` haben keine CLI-Argumente; der Aufruf erfolgt deshalb ohne erfundene Optionen. `package:win` verwendet im aktuellen Checkout NSIS/portable und den konfigurierten `afterSign`-Hook; es ist damit kein verifizierter unsigned/offline-Build. Eine lokale electron-builder-`--dir`/Hook-Override-Rezeptur wird erst aus dem zuständigen Release-Agent übernommen und hier nicht erfunden.

## Abnahmegrenzen

`npm test`, Build, Store-Checks und Bundle-Health gelten erst nach aktuellem Exitcode 0 als bestanden. NativeFileFence, Goal-Migration und LocalRuntime-DI bleiben bis zu einem aktuellen, konkreten Owner-Nachweis offen; dieses Manifest nimmt sie nicht vorweg.

## Neu vorbereitete Root-Transportknoten

Noch nicht ausgeführt: `services/sidekick/tests/test_native_root_browser_transport.py`.

Noch nicht ausgeführt: `services/sidekick/tests/test_native_goal_ingress.py`.

- NativeBrowserOwner: `run_id=None`, Extra-Felder und forged owner werden fail-closed validiert.
- `browser.nativeValidate`: kein registrierter Manager darf keinen Parent minten.
- Runtime-Receipt: read-only unknown result ohne `cacheRoot`, Host- oder Compute-Autorität.
- Approval-CAS: `NativeBrowserApprovalCommand` UUID-/Digest-/Permission-/Control-Epoch-Vertrag.
- Registrierte Fence: `test_native_root_browser_transport.py::test_registered_native_fence_uses_actual_context_owner_and_cleans_registry` verwendet `setup_auto`/echten Manager-Broker/Writer-Context und prüft Registry-Owner/Cleanup; Transportaktion/Approval-CAS bleiben nach Source-Freeze gezielte Endbatchknoten.
- Goal-Ingress: old/unclaimed context denied, human authorization required for mutation, command identity conflict must not kickoff twice.

Geplante nächste echte Registry-Knoten (nach Source-Freeze, noch nicht ausgeführt): registrierte `NativeBrowserFence` mit echtem `NativeChatContext`/Writer-Lease, kontrollierter lokaler Main-Transport für Event-Lease-Generation, Approval-Replay/Conflict, Ablauf/Revoke/Navigation-Race sowie Shutdown mit `closed:false` bei nicht bestätigtem Stop.

Die ausführbare Endprüfung muss diese Datei zusammen mit dem Root-/Reader-/Goal-Testbatch aufnehmen und anschließend die echte registrierte NativeBrowser-Fence-/Approval-CAS-Strecke mit dem stabilisierten Backend-Broker ergänzen. Dieser vorbereitete Knoten ist daher noch kein Abnahmesignal.

## Goal-Ingress- und M4-Nodes (vorbereitet, nicht ausgeführt)

`services/sidekick/tests/test_native_goal_ingress.py` enthält jetzt einen strikten Positivpfad mit `first.ok`, non-empty `kickoff_prompt`, echtem `goals.db`/`state_meta`-Human-Index, Continuation-Claim und `native_goal_ingress_authorization`-Proof sowie Request-ID-Conflict. Der echte Retry-/Leaf-Pfad bleibt bis zum Owner-Sourcefreeze offen.

Die M4-Browser-Abnahme benötigt noch den echten `NativeBrowserFence` aus Registry/Writer-Context mit kontrolliertem Main-SDK-Transport: lease create/snapshot, typed approval UUID+CAS, stale generation, expiry/revoke, navigation epoch und late-event cleanup. Keine dieser Abnahmen wird aus den bisherigen Contract-Guards abgeleitet.
