# Argus: PR #76 profilgebundener Modellkatalog

Datum: 12. Oktober 2026 (Pacific). Ergebnis: **29/29 fokussierte Backend-Tests bestanden**.

## Geprüfter Stand und Umfang

- PR-Ref: `refs/pull/76/head`, frisch geholt als `b8631596` (`fix: keep explicit model config unverified`).
- Getestet: `services/sidekick/tests/test_independent_scoped_models.py` am exakten PR-Head.
- Der Test prüft den profilgebundenen Modellkatalog, Konfigurationsinvalidierung, CAS-/Retry-Verhalten, Zurückweisung fremder Modelle sowie zwei isolierte Workerprofile mit kontrolliertem Loopback-Katalogendpunkt.
- Der Worker-Test verwendete die reale JSONL-Workergrenze und echte Imports. Der lokale Endpunkt protokollierte ausschließlich `/models`; ein Inferenzaufruf war ausdrücklich als HTTP 405 ausgeschlossen. Keine GPT-, MiMo- oder OpenCode-Anfrage, kein Credentialzugriff und kein VM-Paketstart.

## Ablauf und Ergebnis

Der Hauptcheckout hatte weder `pytest` noch die benötigten Sidekick-Abhängigkeiten. Der PR-Head wurde deshalb in einem neuen, getrennten temporären Worktree getestet; eine eigene Python-Umgebung außerhalb des Tester-Checkouts erhielt die für den Test benötigten Pakete. Ein erster Lauf mit nur `pytest` und `PyYAML` ergab 16 PASS / 13 Setupfehler, weil u. a. `requests` fehlte und die isolierten Worker davon betroffen waren. Nach Bereitstellung der Laufzeitabhängigkeiten in der temporären Umgebung lief derselbe Test vollständig grün:

```text
29 passed in 11.05s
```

Befehl:

```text
python -m pytest -q --tb=short services/sidekick/tests/test_independent_scoped_models.py
```

Der Test lief unter Python 3.12 in einem temporären venv mit den im Projekt deklarierten Sidekick-Abhängigkeiten. Die Abhängigkeiten und Testartefakte wurden nicht in den PR oder den Tester-Checkout geschrieben.

## Grenzen der Aussage

Das ist ein gezielter **Quelltest des Backend-Katalogs**. Renderer-/Vitest-Abdeckung, vollständige Suite, Desktop-Build, installierter Kandidat, Provider-Anmeldung und echte GPT-/MiMo-/OpenCode-Chats wurden damit nicht bestätigt. PR #76 bleibt Review-Arbeit; es wurde nichts daran geändert.

Der aktuelle v0.1.56-Preview-Download bleibt separat vor dem Paket-Hashgate blockiert. Dieser Test ersetzt weder die exakte Paket-/ASAR-Prüfung noch die P004-Abnahme.
