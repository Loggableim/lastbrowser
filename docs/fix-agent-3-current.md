# FIX AGENT 3 — Abschluss und Sourcefreeze

Stand: 2026-10-05. Scope eingefroren für `services/sidekick/runtime/independent/manager.py`, `services/sidekick/runtime/independent/native_chat_auto.py`, `services/sidekick/tests/test_native_chat_auto.py` und den eigenen Harness `apps/desktop/tests/native-child-dispatch-probe.cjs`. `auto_provider_proxy.py` und `test_provider_admission.py` wurden geprüft, aber nicht geändert. Keine Commits, Builds außerhalb des Harnesses, Pakete oder Fullsuite ausgeführt.

## Änderung und Sicherheitsbindung

`ComputeAdmission.acquire_native_child` erlaubt höchstens zwei gleichzeitig gehaltene Compute-Slots derselben Familie. Die Familie ist aus `scope.key` (Backendprofil, Space, Browserprofil), echter Parent-Session, brokererzeugter Parent-Turn-ID und Writer-Generation gebildet. Ein Owner-Key-Replay mit geänderter Bindung wird verweigert. Andere Familien desselben Scopes sowie Legacy-/Nova-Compute bleiben exklusiv; globales Slotlimit und Provider-Quota/Admission werden nicht gelockert. `release` entfernt auch die Familienmetadaten.

Nur `NativeAutoSessionBroker` kann diesen Pfad für Claims mit internem Zweck `child` aufrufen. Parent-Turn-ID wird aus dem validierten Brokerkontext (`scope`, Session, Stream und Writer-Generation) UUID5-deterministisch erzeugt und im Vertragsformat hex-normalisiert. `auto_claim` nimmt keine Parent-Turn-ID entgegen; der native Worker-RPC-Vertrag weist ein zusätzliches `parentTurnId`-Feld ab. `_owned_claim` bindet Scope, Session, Entscheidung, Turn-ID und Runner-Generation erneut. Vor einer neuen Admission laufen Turn-/Writer-Validierung, Sessionpolicy und Permission-/Governanceprüfungen. Geschlossene Claims/Turns können keine Slots wiedererlangen; bestätigter Cancel/Release räumt Owner und Familienbindung ab.

## Gezielte Tests

Gebündeltes Python 3.12.10, pytest 9.0.2, Pydantic 2.13.5; parent-only Offline-Pytest-Overlay und Plugin-Autoload deaktiviert:

```powershell
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_native_chat_auto.py',r'$sidekick\tests\test_provider_admission.py'],plugins=[]))"
```

Ergebnis: **16 passed**. Abdeckung der Zusatzverträge: zwei gleiche Child-Siblings, dritter Child wartet/abgewiesen, andere Turn-/Generation-Bindung und Legacy-Same-Scope blockiert, Owner-ID-Replay mit anderer Scope geblockt, Cancel/Release gibt den Slot frei, modellgelieferte Parent-Turn-ID wird am Worker-RPC abgewiesen, Revoke verhindert zweite Admission auch nach Freigabe des ersten Slots, geschlossener Claim kann Compute nicht erneut erwerben und Nova-Governance verweigert Admission ohne Slot. Vorhandene Provider-Admission-Tests bestätigen weiterhin konservatives Verhalten bei unbekannten Limits.

## Nativer E5-Rohbericht und Grenze

Ein tatsächlicher Electron-/Backend-E5-Lauf nach der Admissionänderung war grün: Child Alpha und Beta erreichten den kontrollierten Provider, beide lieferten echte Deltas, beide Historyeinträge endeten `completed/persisted`, Alpha blieb nach Einklappen geschlossen und erhielt weitere Deltas, Parenttranscript blieb getrennt. Rohbericht: `output/root-native-child-dispatch-e5-487f960dadff4e04a5f9493034155e66.json`.

Nach der zusätzlichen Claim-/Turn-/Generation-Defense-in-depth-Änderung schlug ein E5-Lauf zunächst fehl: Der Parent-Turn wurde angenommen, aber die Probe wartete 45 Sekunden auf zwei laufende Child-Runs; der Provider erhielt nur den Warmuprequest, nicht `E5_CHILD_DISPATCH`. Bericht: `output/root-native-child-dispatch-e5-final-d660ad2a8e4a4dcf8a46c6fb68c8adfb.json`. Damals fehlten entscheidende Broker-/Native-Context-Diagnosen; die Ursache war damit nicht feststellbar.

Die E5-Hülle wurde danach ausschließlich diagnostisch erweitert: Während des Child-Wartefensters werden Session, Child-History, Streamstatus/Native-Control-Snapshot, Modelpolicy und native Ereignisse mit Context persistiert; auf Fehlern erfolgt ein zusätzlicher Snapshot. Die nächste reale Electron-/Backend-Wiederholung **bestand** mit dem aktuellen FIX3-Stand: 4 Providerrequests (Warmup, Parent-Toolcall, Alpha, Beta), 1 tatsächlicher Parent-Toolcall, zwei beendete und persistierte Child-Historyeinträge mit übereinstimmendem Parent-Turn und Scope. Beide Siblings lieferten echte Deltas, UI-Kollaps/Weiterstreamen und Trennung des Parenttranscripts wurden bestätigt. Der Streamstatus und alle beobachteten `nativeContext`-Ereignisse stimmten bei Scope, Session, Stream und Writer-Generation überein; 20 native Contexts in 4 Diagnose-Snapshots. Rohbericht: `output/root-native-child-dispatch-e5-diagnostic.json`. Der vorangegangene Ausfall ließ sich nicht nachträglich reproduzieren; seine konkrete Ursache bleibt unbekannt. Worker-Fehlerereignisse traten im erfolgreichen Lauf nicht auf. Rohes Worker-stderr wird absichtlich nicht nach außen gereicht und wurde daher nicht geprüft. Der isolierte E5-Beweis validiert den durchlaufenen realen Claim-/Admission-Pfad, liefert aber keine direkten IDs der internen Decision-/Claim-Datensätze.

`node --check apps/desktop/tests/native-child-dispatch-probe.cjs` und `node apps/desktop/tests/native-child-dispatch-probe.cjs` bestanden (E5-Bericht siehe oben). Vollsuite, UI-Manuellprüfung außerhalb dieser isolierten Electron-Probe, allgemeiner Build und Packaging sind nicht ausgeführt. Sourcefreeze für die oben genannten FIX3-Dateien an Root gemeldet; weitere Produktänderungen nur nach neuer Root-Zuweisung.
