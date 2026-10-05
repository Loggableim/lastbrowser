# Independent-Agent Test Evidence

Stand: 4. Oktober 2026, Europe/Vienna. Dieser Bericht wurde aus einem frischen lokalen Lauf erstellt. Er ersetzt keine vollständige Produkt- oder Providerabnahme.

## Ausgeführter Lauf

Gebündelter Launcher:

```powershell
apps/desktop/runtime/python/python.exe -c "import sys;sys.path.append('C:/Users/logga/AppData/Roaming/Python/Python314/site-packages');sys.path.insert(0,'services/sidekick');sys.path.insert(0,'services/sidekick/tests');import pytest;sys.exit(pytest.main([...,'-q','-W','error::pytest.PytestUnhandledThreadExceptionWarning']))"
```

Die Auswahl umfasste `test_independent*`, `test_native_chat*`, `test_model_selection*`, `test_provider_admission*`, `test_auto_provider*`, `test_local_ai*`, `test_child*`, `test_chat_mode*`, `test_goal_revision*` und `test_transport_reasoning*`.

Ergebnis: 583 bestanden, 2 fehlgeschlagen, Exitcode 1, Laufzeit 3:14. Thread-Exception-Warnings wurden als Fehler behandelt.

Fehlgeschlagene Tests:

- `services/sidekick/tests/test_native_chat_auto_process.py:77` — `test_actual_native_auto_builder_file_tool_receipts_and_parent_compute`
- `services/sidekick/tests/test_native_chat_auto.py:88` — `test_actual_native_auto_sdk_tool_turn_has_exact_model_claims_and_own_home`

Gemeinsame Reproduktion: `runtime/independent/native_chat_auto.py:104` validiert eine Payload mit `requirements.dataClasses=['workspace']` gegen `runtime/independent/model_selection.py:ModelRequirements`, dessen Vertrag nur `data_class` kennt. Der aktuelle Fehler lautet `ValidationError: dataClasses Extra inputs are not permitted`. Das ist ein produktiver AUTO-/Native-Adapter-Vertragsfehler, kein Testfixture- oder Threadteardownfehler.

## Aktuelle Zusatznachweise

Die eigenen Native-Control-/Route-Tests wurden separat mit demselben shipped-Python und `-W error::pytest.PytestUnhandledThreadExceptionWarning` ausgeführt: 15/15 bestanden. Der Desktoptransporttest `npm --workspace apps/desktop run test:run -- tests/native-chat-controls.test.ts` bestand mit 5/5. Diese Tests decken Header-, Scope-, CAS-, Replay-, Child-Recovery- und Control-Pipe-Verträge ab.

## Abnahmematrix

| Bereich | Aktueller Nachweis | Status / offene Lücke |
| --- | --- | --- |
| A01–A11 Interview/Profil | Unit-/Leaftests und Onboardingtests vorhanden | Fixture-/Vertragsnachweis; echte Providerqualität und vollständige UI-Abnahme offen |
| A12–A18 Scope, Account, Stop, Approval | Scope-, Governance-, Native-Control- und Lease-Tests grün | Echte externe Accounts/Provider und vollständige Electron-Praxis offen |
| A19–A25 Runs, Recovery, Budget, Untrusted Content | Independent run/progress/governance/child tests grün | AUTO-Adapter aktuell 2 Fehler; vollständige Kill/Restart-/Browserprobe offen |
| A26–A33 Legacy, i18n, Isolation, Browser-Gates | Jeweilige Unit-/Renderer-/Hosttests vorhanden | Vollständige reale UI-/Partitionabnahme offen |
| A34–A40 Preferences, capability, Nova, navigation | Leaf-/policy-/browser tests vorhanden | Externe Connectoren, Nova/Swarm-Praxis und Popup-/Download-Harness offen |
| A41–A53 Panel, activity, dispatch, context, stop | Renderer-/control-/route tests vorhanden | Vollständige Panel-/Castlabs-/Packaged-End-to-End-Abnahme offen |
| C01–C18 / D11–D14 | Child contracts, history, command/goal/control tests vorhanden | Vollständige echte Zwei-Child-SDK- und UI-Recoveryprobe offen |
| D10 / AUTO / Local AI | Model-selection, admission und local-AI-Tests vorhanden | AUTO-Blocker oben; keine echte Hardware-/Provider-/Modelldatenabnahme |

## Verifikationseinstufung

- RealRuntime: shipped Python 3.12.10, reale temporäre SQLite/ProfileHub-Stores, echte SessionJSON-Ownerdaten, echte Control-/Child-/Model-Policy-Adapter; der Lauf ist wegen der zwei AUTO-Fehler nicht grün.
- Fixture: deterministische Provider, lokale HTTP-/SSE-Harnesses, kontrollierte SDK-/Browsergrenzen und Renderertransporttests.
- Extern offen: reale Modellanbieterqualität, OAuth-/Connector-Endablauf, echte Benutzerkonten, signiertes/gepacktes Artifact, Store-/Publishabnahme und vollständige sichtbare Electron-Praxis.

## Nächste konkrete Prüfung

Der Besitzer von `runtime/independent/model_selection.py` und `runtime/independent/native_chat_auto.py` muss den Feldvertrag vereinheitlichen: entweder `dataClasses` normiert in `data_class` überführen oder den `ModelRequirements`-Vertrag bewusst erweitern. Danach die beiden exakten AUTO-Tests zuerst mit shipped Python und anschließend die thematische Suite erneut ausführen. Bis dahin darf AUTO nicht als vollständig abgenommen gelten.

## Einzelmatrix A01–A53 / C01–C18

Statuswerte: `proven` = aktueller konkreter Test/Probe; `partial` = Teilvertrag oder Fixture; `open` = keine aktuelle vollständige Abnahme.

| ID | Kriterium | Aktueller Beleg | Fehlende Abnahme | Status |
|---|---|---|---|---|
| A01 | Frageoptionen 3/4 + Freitext | `test_independent_onboarding.py` | sichtbare UI-Sprachen | partial |
| A02 | Freitextprofil/Folgemaß | onboarding tests | echte Inferenz | partial |
| A03 | Multi-Topic-Antwort | onboarding tests | UI-Folgefrage | partial |
| A04 | keine fixe Turngrenze | onboarding continuation tests | lange UI-Unterhaltung | partial |
| A05 | Teilprofil/Weiter | onboarding tests | reale Navigation | partial |
| A06 | Finishphrase Review | onboarding tests | UI-End-to-end | partial |
| A07 | negative Finishphrase | onboarding tests | Browser-UI | open |
| A08 | Review ohne Dispatch | onboarding tests | echte UI | partial |
| A09 | Korrektur verwirft späte Antwort | clarification tests | Reload-Praxis | partial |
| A10 | malformed/timeout fail-closed | onboarding tests | echter Provider | partial |
| A11 | Connection failure erhält Profil | connection tests | echter Login | partial |
| A12 | Accountbindung A/B | scope/connection tests | zwei echte Konten | open |
| A13 | Scopewechsel erhält Lease | native/scope tests | Electron-Switch | partial |
| A14 | minimierter Host | Host probe historisch | frischer Packaged-Smoke | open |
| A15 | Takeover wartet ACK | control tests | echte Mausabnahme | partial |
| A16 | Cancel-Epoch blockiert spät | `test_independent_acceptance_regressions.py::test_reset_cancels_actual_inflight_reply_without_late_dispatch` | Kill/Restart | partial |
| A17 | Approval expiry/digest | policy tests | reale UI-Aktion | partial |
| A18 | Revoke Dispatch Barrier | governance tests | externe Verbindung | partial |
| A19 | duplicate start unique | run tests | echte Schedulerlast | partial |
| A20 | reload/resubscribe dedupe | event tests | Electron reload | partial |
| A21 | stale generation recovery | recovery tests | echter Prozesskill | partial |
| A22 | Budgetzähler | progress tests | Providerverbrauch | partial |
| A23 | Space tombstone | lifecycle tests | echte UI-Löschung | partial |
| A24 | DST gap/fold | scheduling tests | OS-Schlaf | partial |
| A25 | untrusted content no authority | policy tests | reale Seite | partial |
| A26 | Legacy read-only | legacy tests | alter Installstand | partial |
| A27 | Keyboard/i18n fit | renderer i18n tests | alle UI-Layouts | partial |
| A28 | parallel profile isolation | profile tests | echte Workerlast | partial |
| A29 | frozen run profile | runner tests | UI-Profilwechsel | partial |
| A30 | revision snapshot/revoke | assistant tests | echte Modellturns | partial |
| A31 | URL-only capability | capability tests | Pluginpraxis | partial |
| A32 | spoofed sender/raw CDP | gateway tests | Castlabs-Praxis | partial |
| A33 | UNC/junction escape | policy tests | Windows Junction-Harness | open |
| A34 | interview preferences only | assistant tests | bestehende Aufgabe UI | partial |
| A35 | waiting resource slot | governance tests | parallele Accounts | partial |
| A36 | close/quit cleanup | lifecycle tests | zwei Fenster Electron | open |
| A37 | existing provider no global setup | provider tests | echter Provider | partial |
| A38 | stale cursor snapshot | event tests | Retentionstress | partial |
| A39 | Nova/Swarm admission | governance tests | echter Swarm | open |
| A40 | popup/download scope | browser tests | Packaged popup | open |
| A41 | panel icon scope | renderer tests | sichtbares Produkt | open |
| A42 | panel late reply | renderer tests | Castlabs panel | partial |
| A43 | grounded activity | `test_independent_acceptance_regressions.py::test_readonly_status_question_uses_actual_assistant_state_without_dispatch` | weitere reale Statusquellen | partial |
| A44 | dispatch materialization | dispatch tests | UI-Navigation | partial |
| A45 | capability no start | assistant tests | reale UI-Frage | partial |
| A46 | assistant/workchat streams | stream tests | Mehrfach-SDK | partial |
| A47 | panel close unsubscribe | renderer tests | laufender Packaged-Host | open |
| A48 | terminal outbox once | event tests | Reconnectpraxis | partial |
| A49 | stale source handling | activity tests | Backendunterbrechung | partial |
| A50 | duplicate late dispatch | dispatch tests | Startresponseverlust | partial |
| A51 | selected context epoch | context tests | echte Tabs | partial |
| A52 | old Copilot preserved | session tests | alter Userchat | partial |
| A53 | targeted ambiguous stop | control tests | zwei echte Runs UI | partial |
| C01 | Child identity/relay | child history tests | echte Zwei-Child-SDK | partial |
| C02 | Child scope immutability | child contract tests | UI bubble | partial |
| C03 | Child sequence cursor | child history tests | reconnect | partial |
| C04 | Child actual output | child stream tests | real model | partial |
| C05 | Child terminal state | child tests | process restart | partial |
| C06 | Child recovery | native controls tests | packaged recovery | partial |
| C07 | Parent linkage | child contract tests | visible transcript | partial |
| C08 | Slash registry | renderer tests | all locales UI | partial |
| C09 | keyboard menu | renderer tests | accessibility UI | partial |
| C10 | model selection action | API tests | real provider | partial |
| C11 | new session action | command tests | Electron persistence | partial |
| C12 | stop action | native control tests | two live runs | partial |
| C13 | persistent Goal controls | goal tests | full UI | partial |
| C14 | Goal CAS/replay | goal revision tests | restart race | partial |
| C15 | Plan backend gate | chat mode tests | all tool paths | partial |
| C16 | Boost budget/admission | chat mode tests | shared SDK admission | partial |
| C17 | Grill-me tool denial | chat mode tests | adaptive UI | partial |
| C18 | AUTO selection/admission | model policy tests | current AUTO suite has failures | open |

## Nachfolgender Regressionlauf

Ein weiterer gezielter Lauf über Legacy-, Native-Chat-, Child-, Local-AI- und Transporttests ergab 173 bestanden und 4 fehlgeschlagen, Exitcode 1. Die vier aktuellen Befunde sind:

- `test_native_chat_controls.py` verwendete zunächst den alten String-Pendingwert; nach Aktualisierung auf den tatsächlichen `pending_control_snapshot`-DTO-Vertrag läuft die eigene Datei shipped mit 15/15.
- `test_native_chat_auto_process.py::test_actual_native_auto_builder_file_tool_receipts_and_parent_compute[True]` erwartet einen abgebrochenen zweiten Providerclaim, erhält keinen Claim mit `state=cancelled`.
- `test_native_chat_rehydration.py::test_parent_goal_handoff_waits_for_writer_release_and_actual_current_owner[False|True]` erhält `goal_command_payload(...)=action:error,error=unavailable`, weil der profile-/space-scoped Goalstore nicht verfügbar ist.
- Die übrigen Native-AUTO-Fälle aus dem vorherigen Lauf scheiterten am inzwischen bestätigten `dataClasses`/`data_class`-Vertragsdrift.

Diese Ergebnisse sind aktuelle Fixture-/Runtimebefunde und keine Abnahme. Die Fehler wurden an Root gemeldet; keine Runtime- oder Route-Datei wurde von FIX AGENT 3 geändert.

## Neue Boundary-Testdateien

Die ausdrücklich beauftragten neuen Dateien wurden erstellt und mit shipped Python ausgeführt:

- `services/sidekick/tests/test_native_route_boundaries.py`: 4 Tests für native Legacy-Control-Sperren, FIFO-Schutz und ungebundene Legacy-Kompatibilität.
- `services/sidekick/tests/test_local_ai_root_transport.py`: 2 Tests für fail-closed Leaf-Felder und Cache-Root-Linkgrenzen.

## Abschlussmapping (Einzelstatus, 2026-10-04)

Status: `sourceImplemented` = Quellpfad vorhanden; `targetedProven` = konkreter aktueller Test grün; `manualPending` = praktische/UI/Provider-Prüfung offen; `unresolvedOwner` = aktueller Fehler einem Owner zugewiesen.

| ID | Konkreter aktueller Test/Proof | Status |
|---|---|---|
| A01–A15 | Onboarding-, Scope-, Account-, Control- und Lease-Tests in `services/sidekick/tests/test_independent_*.py` / `test_native_chat_controls.py` | sourceImplemented/manualPending |
| A16 | `test_independent_acceptance_regressions.py::test_reset_cancels_actual_inflight_reply_without_late_dispatch` | targetedProven |
| A17–A42 | Policy-, Governance-, Run-, Recovery-, Legacy-, Renderer-, Gateway- und Browsertests in den benannten Familien | sourceImplemented/manualPending |
| A43 | `test_independent_acceptance_regressions.py::test_readonly_status_question_uses_actual_assistant_state_without_dispatch` | targetedProven |
| A44–A52 | Dispatch-, Activity-, Context- und Sessiontests in `services/sidekick/tests` / `apps/desktop/tests` | sourceImplemented/manualPending |
| A53 | `test_native_chat_controls.py` targeted stop/control | targetedProven |
| C01–C11 | Child identity/history/stream/recovery, slash, model and session command tests | sourceImplemented/manualPending |
| C12 | Native control tests | targetedProven |
| C13–C17 | Goal revision, chat mode, admission and Grill denial tests | sourceImplemented/manualPending |
| C18 | Native AUTO tests; aktuelle Fehler beim Backend-Broker | unresolvedOwner |
| D10 | Model-selection/admission tests; kein echter Provider | unresolvedOwner/manualPending |
| D11 | `test_native_stream_goal_root_integration.py` | targetedProven |
| D12 | `test_native_reader_production_bounds.py` | targetedProven |
| D13 | `test_native_grill_control_safety.py` | targetedProven |
| D14 | `test_grill_root_api.py` | targetedProven |

### Einzelauflösung A01–A53

| ID | aktueller konkreter Pfad/Funktion | Status |
|---|---|---|
| A01 | `test_independent_onboarding.py` | sourceImplemented/manualPending |
| A02 | `test_independent_onboarding.py` | sourceImplemented/manualPending |
| A03 | `test_independent_onboarding.py` | sourceImplemented/manualPending |
| A04 | onboarding continuation tests | sourceImplemented/manualPending |
| A05 | onboarding continuation tests | sourceImplemented/manualPending |
| A06 | onboarding finish tests | sourceImplemented/manualPending |
| A07 | onboarding negative-finish tests | manualPending |
| A08 | onboarding review tests | sourceImplemented/manualPending |
| A09 | clarification tests | sourceImplemented/manualPending |
| A10 | onboarding malformed/timeout tests | sourceImplemented/manualPending |
| A11 | connection setup tests | sourceImplemented/manualPending |
| A12 | `test_independent_scope_binding.py` | sourceImplemented/manualPending |
| A13 | `test_native_chat_controls.py` | targetedProven |
| A14 | kein aktueller Packaged-Minimised-Host-Test | manualPending |
| A15 | `test_native_chat_controls.py` | targetedProven |
| A16 | `test_independent_acceptance_regressions.py::test_reset_cancels_actual_inflight_reply_without_late_dispatch` | targetedProven |
| A17 | policy tests | sourceImplemented/manualPending |
| A18 | governance tests | sourceImplemented/manualPending |
| A19 | run tests | sourceImplemented/manualPending |
| A20 | event tests | sourceImplemented/manualPending |
| A21 | recovery tests | sourceImplemented/manualPending |
| A22 | progress tests | sourceImplemented/manualPending |
| A23 | lifecycle tests | sourceImplemented/manualPending |
| A24 | scheduling tests | sourceImplemented/manualPending |
| A25 | policy tests | sourceImplemented/manualPending |
| A26 | legacy tests | sourceImplemented/manualPending |
| A27 | renderer i18n tests | sourceImplemented/manualPending |
| A28 | `test_independent_profile_isolation.py` | sourceImplemented/manualPending |
| A29 | runner tests | sourceImplemented/manualPending |
| A30 | assistant tests | sourceImplemented/manualPending |
| A31 | capability tests | sourceImplemented/manualPending |
| A32 | gateway tests | sourceImplemented/manualPending |
| A33 | path/junction tests | manualPending |
| A34 | assistant preference tests | sourceImplemented/manualPending |
| A35 | governance slot tests | sourceImplemented/manualPending |
| A36 | lifecycle cleanup tests | manualPending |
| A37 | provider admission tests | sourceImplemented/manualPending |
| A38 | event cursor tests | sourceImplemented/manualPending |
| A39 | governance/Nova tests | manualPending |
| A40 | browser popup/download tests | manualPending |
| A41 | renderer panel tests | manualPending |
| A42 | renderer late-reply tests | sourceImplemented/manualPending |
| A43 | `test_independent_acceptance_regressions.py::test_readonly_status_question_uses_actual_assistant_state_without_dispatch` | targetedProven |
| A44 | dispatch materialization tests | sourceImplemented/manualPending |
| A45 | assistant no-start tests | sourceImplemented/manualPending |
| A46 | stream tests | sourceImplemented/manualPending |
| A47 | renderer unsubscribe tests | manualPending |
| A48 | event outbox tests | sourceImplemented/manualPending |
| A49 | activity tests | sourceImplemented/manualPending |
| A50 | dispatch duplicate tests | sourceImplemented/manualPending |
| A51 | context epoch tests | sourceImplemented/manualPending |
| A52 | session compatibility tests | sourceImplemented/manualPending |
| A53 | `test_native_chat_controls.py` | targetedProven |

### Einzelauflösung C01–C18 / D10–D14

| ID | aktueller konkreter Pfad/Funktion | Status |
|---|---|---|
| C01 | child identity/relay tests | sourceImplemented/manualPending |
| C02 | child contract scope tests | sourceImplemented/manualPending |
| C03 | child history cursor tests | sourceImplemented/manualPending |
| C04 | child stream tests | sourceImplemented/manualPending |
| C05 | child terminal tests | sourceImplemented/manualPending |
| C06 | native child recovery tests | sourceImplemented/manualPending |
| C07 | child linkage tests | sourceImplemented/manualPending |
| C08 | renderer slash registry tests | sourceImplemented/manualPending |
| C09 | renderer keyboard tests | sourceImplemented/manualPending |
| C10 | model policy API tests | sourceImplemented/manualPending |
| C11 | command/session tests | sourceImplemented/manualPending |
| C12 | native control tests | targetedProven |
| C13 | goal control tests | sourceImplemented/manualPending |
| C14 | goal revision tests | sourceImplemented/manualPending |
| C15 | chat mode dispatch tests | sourceImplemented/manualPending |
| C16 | model admission tests | sourceImplemented/manualPending |
| C17 | `test_chat_mode_dispatch.py` Grill denial | sourceImplemented/manualPending |
| C18 | Native AUTO tests | unresolvedOwner |
| D10 | model selection/admission tests | unresolvedOwner/manualPending |
| D11 | `test_native_stream_goal_root_integration.py` | targetedProven |
| D12 | `test_native_reader_production_bounds.py` | targetedProven |
| D13 | `test_native_grill_control_safety.py` | targetedProven |
| D14 | `test_grill_root_api.py` | targetedProven |

## Aktueller FIX-AGENT-3-Lauf (2026-10-04)

- `test_native_stream_read_api.py`: 3/3 bestanden mit echter `fixture_context`-Session, echtem `ProfileHub`, Header-/Scope-/Actor-Gates und exaktem Read-Response-Schema.
- `test_native_session_storage.py`: 1/1 bestanden mit echtem HTTP `POST /api/session/new`, Reload und absichtlich verändertem ambientem `SIDEKICK_HOME`; Legacy-Storage bleibt stabil, kein Nova-Mirror wird erzeugt.
- Zusammenlauf beider Dateien: 4 bestanden, Exitcode 0; nur pytest-Cache-Berechtigungswarnung.
- Breiter aktueller shipped-Python-Lauf: 559 bestanden, 5 fehlgeschlagen, Exitcode 1. Die fünf Fehler liegen in Native-AUTO/Process/Parent-Assertions und melden `controlled.txt` als nicht gefunden bzw. fehlende `subagent.answer_delta`; sie sind offen und nicht als grün zu werten.
- Grill-Regressionsabdeckung: `test_real_handler_restart_answer_correction_review_and_user_finish`, `test_commands_replay_exact_request_and_reject_stale_reuse`, `test_actual_writer_blocks_user_command_and_is_released_after_save_failure` und `test_foreign_identity_or_mode_cannot_mutate` bestanden (21/21 in `test_grill.py`). Ein echter HTTP-/TestClient-Lauf gegen `_handle_grill` mit persistierter `Session.load` blieb in diesem Paket offen; die vorhandenen Tests sind direkte scoped Handler-/Store-Tests und werden nicht als HTTP-Abnahme gezählt.
- Neuer Root-API-Lauf: `test_grill_root_api.py` führt `_handle_grill` mit echter `Session.load`, realer Native-Fixture/ProfileHub, privatem Bridge-Header und persistiertem `grill_state` aus. `test_root_grill_http_handler_get_start_answer_review_finish_and_reload` sowie `test_root_grill_http_handler_rejects_foreign_scope_and_active_writer_before_mutation`: 2/2 bestanden.
- Native-Session-Storage-Regressionslauf: `test_native_session_new_uses_canonical_space_storage_and_reloads` bestanden. `test_native_session_metadata_remains_verifiable_when_large_fields_are_saved` schlägt reproduzierbar fehl: `validate_native_session()` liest nur 65536 Bytes und erhält bei `pending_user_message`/`grill_state` größer als 65536 ein abgeschnittenes JSON (`JSONDecodeError: Unterminated string`, `model_policy_session.py:31-45`). Das ist ein offener Backend-Vertragsfehler, kein grüner Test.
- Nach Ambient-/Fixture-Bereinigung: kombinierter frischer Lauf `test_grill_root_api.py`, `test_native_session_storage_regression.py`, `test_native_chat_nova.py` mit `-p no:cacheprovider`: 23/23 bestanden. Die direkte `routes.j`-Zuweisung im Grill-Test wurde auf `monkeypatch.setattr` umgestellt; damit bleibt der HTTP-Handler-Zustand zwischen Testdateien sauber.
- Frischer breiter Lauf der Independent-/Native-/AUTO-/Grill-/Local-AI-Familien: 670 bestanden, 12 fehlgeschlagen, Exitcode 1. Aktuelle Fehler sind getrennt an Root gemeldet; sie umfassen Native-AUTO/AIAgent-Argument `native_sdk_bridge`, kontrollierte Toolpfade/`controlled.txt`, einen Writer-Race-Fall mit fehlendem `workspace` in einer SimpleNamespace-Fixture sowie lokale Shell-Signalpipe-Fehler.
- Streaming-/Goal-Namespace-Roottests: `test_native_stream_goal_root_integration.py` 3/3 bestanden mit echtem gebundenem `NativeChatContext`, ProfileHub/ScopeResolver und privaten Worker-Umgebungsbindungen. Geprüft: tatsächlicher Stream-Space, Stream-/Workspace-Mismatch-Ablehnung, Goal-Kontext mit verifiziertem Profil-/Space-Slug und `native_goal_migration_required` vor Mutation.
- Reader-/Control-Sicherheitslauf: `test_native_reader_production_bounds.py` 3/3 und `test_native_grill_control_safety.py` 1/1 bestanden. Geprüft: gespeicherter Native-Reader trotz >64-KiB-Pending/Grill-Feldern, Foreign-Scope/Actor, unbekannter Stream ohne Ambient-Fallback sowie Cancel-Antwort ohne Bridge-/Credential-Token.

Ergebnis des exakten shipped-Python-Laufs nach Root-Review-Korrektur: 4 Local-AI-Root-Tests bestanden, Exitcode 0, keine Threadwarnung. Gültige Foreign-Backend-ID erreicht den erwarteten 403-Scope-Gate; ein Start mit gültigem Digest/Request-ID und nicht-kanonischem Cachepfad wird vor Consent/Netzwerk mit 400 abgewiesen. Die Tests ersetzen keinen echten Local-AI-Download oder externen Hardware-/Providerlauf.
