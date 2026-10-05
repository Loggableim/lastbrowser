# FIX AGENT 1 – Backendprofil-UI-Probe

Prüfzeit: 2026-10-04, korrigiertes Preview `19-40-59-132Z-ff82ee5e`.
Die isolierte Probe läuft über `scripts/probe-backend-profile-ui.cjs` mit dem
gebündelten Electron, Main, Preload, Renderer und Sidekick-Python des Preview.
Testprofile, Workspaces und Provider liegen ausschließlich in einem eigenen
temporären `%TEMP%`-Verzeichnis. Es gab keine Produktänderung in diesem Paket.

## Ergebnis

Das Preview enthält den korrigierten Space-Setup-Ablauf. Alpha und Beta wurden
jeweils über den echten Space-Setup-Dialog mit dem jeweiligen Backendprofil
angelegt. Die anschließende Main-Abfrage `profileBindings` enthielt für jeden
Space genau ein Binding, und der erste `resolveScope`-Request trug bereits das
ausgewählte Profil:

| Space | Backendprofil | `backendProfileId` | `spaceId` |
| --- | --- | --- | --- |
| Alpha isolated space | `alpha` | `54740e4b824c4b86a5616ba1dd3d3e24` | `42e22cd8e877446d8916f945f1b889b2` |
| Beta isolated space | `beta` | `3cd7620e076e44f18888e096a60c22aa` | `0f14dfc2cbee47b6a1266d0f867d1ba4` |

Der vorherige Previewlauf hatte vor der expliziten Profilbindung zusätzlich je
Space ein `default`-Binding angelegt. Im korrigierten Paket trat diese
Doppelbindung nicht auf.

Während der Alpha-Antwort offen gehalten wurde, wechselte die echte UI zu Beta.
Der kontrollierte lokale Provider erhielt anschließend zwei getrennte Aufrufe:
`/alpha/v1/chat/completions` mit `ALPHA-ORIGINAL` und
`/beta/v1/chat/completions` mit `BETA-ISOLATED`. Damit sind die Profilwahl und
die A→B-Provider-Routen belegt.

## Offene Grenze und Probe-Korrektur

Der Provider-Routingnachweis oben stammt aus Report `422cbed2…`: Alpha wurde
offengehalten, während Beta seinen getrennten lokalen Request erhielt. Die
Probe erreichte dort aber keine sichtbare Beta-Antwort und kein B→A.

Bei der anschließenden Probe-Korrektur wurde deutlich, dass der Space zunächst
nur die optionale Profil-Einführung zeigt. Die Probe hatte vorher einmalig
`Boolean(.space-interview)` abgefragt und damit das noch nicht gestartete
Interview übersehen. Der korrigierte Lauf wartete auf `.space-interview`, löste
aber zuvor den Button zum Start der optionalen Einrichtung nicht aus und endete
deshalb beim Profil-Einstieg. Das ist ein Probe-Sequenzfehler und kein Beleg für
einen Produktfehler. Das Skript löst den Einstieg nun aus, wartet auf das echte
Interview, überspringt es bewusst und prüft anschließend die normale
Conversation-Ansicht. Diese letzte Skriptanpassung wurde syntaktisch geprüft,
aber nicht erneut als Paketlauf ausgeführt.

Der Main-Fetch-Sicherheitsguard blockierte beobachtete Versuche, Inhalte von
`raw.githubusercontent.com` abzurufen (240 blockierte Main-Fetch-Versuche,
`deniedProxyRequests=0`). Diese Versuche sind keine erfolgreichen externen
Zugriffe und werden nicht als Netzwerk-PASS gewertet. Der Paketstart nutzte die isolierte
`app.setPath`-Sicherheitsnaht der Probe; die Preview-EXE selbst wurde nicht
direkt gestartet oder signiert geprüft.

## Artefakt und Bereinigung

- Preview: `output/feature-preview-2026-10-04T19-40-59-132Z-ff82ee5e`
- ASAR SHA-256: `74a6b9328df36ce9a3cbcb3267dd04639f55f25dbc107386002862be410099de`
- Receipt: unsigned, unpublished, 10.241 Ressourcen, `blocked: []`
- Provider-Routing-Report: `output/backend-profile-ui-422cbed2-7c7e-4761-81a8-5ec8ffcb3701.json`
- Korrigierter, aber vor UI-Assertions abgebrochener Lauf: `output/backend-profile-ui-0a70f827-deaf-41a6-811f-0afa2ffe9d0f.json`
- Probe-Syntax: `node --check scripts/probe-backend-profile-ui.cjs` erfolgreich
- Isolierte Temp-Profile: durch die Läufe entfernt; keine eigenen Kindprozesse
  verblieben.

Die Probe belegt Space-Binding und A→B-Provider-Routing, aber keine sichtbare
Beta-Antwort, keinen vollständigen A→B→A-Lauf und keinen Release-Status.
