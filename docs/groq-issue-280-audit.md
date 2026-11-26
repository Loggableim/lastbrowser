# Groq-Anbieter: Abgleich mit Issue 280

Stand: 26. November 2026. [Issue 280](https://github.com/Loggableim/lastbrowser/issues/280) verlangt einen nicht standardmäßig aktiven Beta-Anbieter mit eigenem Schlüssel, Live-Modellliste, Streaming und verständlichen Fehlern.

- [PR 281](https://github.com/Loggableim/lastbrowser/pull/281) und der jüngere [PR 345](https://github.com/Loggableim/lastbrowser/pull/345) sind beide offen. PR 345 basiert auf `codex/lastbrowser-electron-shell` und ist ein Entwurf; er ist nicht Teil des hier geprüften Arbeitsstands. Eine Integration muss mit der heutigen Anbieter-, Beta- und Settings-Architektur abgeglichen werden.
- Der Patch von PR 345 enthält ein Provider-Profil, einen festen Groq-Modelllisten-Endpunkt und HTTP-Mocks. Laut PR-Beschreibung wurden die Python-Tests dort nicht mit pytest ausgeführt; ein echter Chat und Quickchat mit je fünf Turns sind im ursprünglichen Testplan offen. Keine Schlüssel wurden für diese Prüfung gesucht oder verwendet.
- Der Patch `services/sidekick/runtime/groq_errors.py` gibt die neuen 401- und 429-Hinweise ausschließlich auf Deutsch zurück. Vor einer Übernahme müssen diese in der gewählten Sprache erscheinen und dürfen keinen Schlüssel oder rohen Providerfehler offenlegen.
- Die Beta-Sichtbarkeit, der tatsächliche Streaming-Pfad, deaktivierte Modelle und die Fehlerbehandlung müssen gegen den aktuellen Arbeitsstand und mit geeigneten Tests geprüft werden. Eine Live-Prüfung erfordert ein vom Nutzer bereitgestelltes Konto; aus einem gemockten Modellkatalog folgt keine erfolgreiche Chat-Antwort.
