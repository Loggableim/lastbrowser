# Prüfsummen und GPG-Signatur für Windows-Releases

Dieses Dokument beschreibt das reproduzierbare Verfahren, mit dem für ein
LastBrowser-Windows-Release (z. B. `v0.1.58`) eine `SHA256SUMS`-Datei erzeugt,
verifiziert und mit einer **GPG-Detach-Signatur** (`SHA256SUMS.asc`) versehen
wird. Der private Schlüssel und die Passphrase bleiben **ausschließlich lokal
bei Cid**; im Repository, im PR und in Logs liegen keine Secrets.

## Zweck

- Nachvollziehbare SHA-256-Prüfsummen über alle veröffentlichten
  Release-Artefakte (Setup, Setup-Blockmap, Portable, `latest.yml`).
- Eine kryptografisch prüfbare Signatur (`SHA256SUMS.asc`), mit der
  Dritte die Zuordnung Release → Hersteller prüfen können.
- Kein Netzwerkzugriff nötig, um die Prüfsummen zu erzeugen oder zu prüfen.

## Voraussetzungen

- Ein Release-Ordner mit den **bereits signierten, unveränderten** Artefakten
  und der zugehörigen `latest.yml` (z. B. Ergebnis von
  `scripts/refresh-signed-release-metadata.mjs`). Beispiel:
  `apps/desktop/release-local-0.1.58-<zeitstempel>/`.
- Node.js (Projekt-Toolchain) für das Generator-Skript.
- Lokal bei Cid: `gpg` (GnuPG 2.x) mit dem Release-Signaturschlüssel und
  dessen Passphrase im lokalen Schlüsselbund bzw. auf einem lokalen
  Signatur-Token.

Die erwarteten Artefakte werden **nicht** von Hand gepflegt, sondern aus
`latest.yml` abgeleitet: alle `files[].url`-Einträge, der Blockmap des
Update-Pfads (`<path>.blockmap`) und `latest.yml` selbst. Dadurch kann die
Prüfsummenliste nicht von den ausgelieferten Executables abweichen.

## Schritt 1 – `SHA256SUMS` erzeugen

Aus dem Repository-Wurzelverzeichnis:

```bash
node scripts/generate-sha256sums.mjs apps/desktop/release-local-0.1.58-20261018-200000
```

Das Skript:

1. liest und validiert `latest.yml` (SemVer-`version`, `files[]`, `path`),
2. leitet die zu hashenden Artefakte deterministisch ab,
3. sortiert sie nach Dateiname und schreibt `SHA256SUMS` im
   GNU-coreutils-Format (`<64-hex-sha256>  <dateiname>`, zwei Leerzeichen),
4. liest `SHA256SUMS` unmittelbar danach erneut ein und vergleicht sie mit
   den frisch berechneten Hashes (Post-Write-Selbstprüfung).

Erwartete Ausgabe:

```
[sha256sums] wrote <releaseDir>/SHA256SUMS for 4 assets (version 0.1.58)
```

## Schritt 2 – `SHA256SUMS` verifizieren

```bash
node scripts/generate-sha256sums.mjs apps/desktop/release-local-0.1.58-20261018-200000 --verify
```

Erwartete Ausgabe bei Erfolg:

```
[sha256sums] verified 4 assets in <releaseDir>/SHA256SUMS
```

Da `SHA256SUMS` im Standardformat vorliegt, funktioniert zusätzlich die
Prüfung mit Coreutils:

```bash
cd apps/desktop/release-local-0.1.58-20261018-200000
sha256sum -c SHA256SUMS
```

## Schritt 3 – GPG-Detach-Signatur erzeugen (lokal bei Cid)

Alle folgenden Befehle laufen **nur lokal bei Cid**. Private Schlüssel,
Passphrase und Token verlassen die Maschine nicht. Der Schlüssel wird über
seine Key-ID bzw. `--local-user` ausgewählt; hier exemplarisch
`lastbrowser-release@lastbrowser.com`.

```bash
cd apps/desktop/release-local-0.1.58-20261018-200000

# ASCII-armierte Detach-Signatur der Prüfsummendatei
gpg --armor --detach-sign \
    --local-user lastbrowser-release@lastbrowser.com \
    --output SHA256SUMS.asc \
    SHA256SUMS
```

- `--detach-sign` signiert nur `SHA256SUMS`; die signierten Artefakte bleiben
  unverändert.
- `--armor` erzeugt einen textbasierten `.asc`-Block, der neben den Binärdateien
  veröffentlicht und im PR/Release-Text lesbar ist.
- Die Passphrase wird interaktiv von GnuPG abgefragt und **niemals** auf der
  Kommandozeile, in einer Datei oder in einer Log-Ausgabe übergeben.

`SHA256SUMS` selbst wird **nicht** verändert: Zuerst `SHA256SUMS` erzeugen und
verifizieren, danach exakt diese Datei signieren. Wird `SHA256SUMS` nach dem
Signieren neu erzeugt, ist die Signatur ungültig und Schritt 1–3 sind zu
wiederholen.

## Schritt 4 – Signatur prüfen

```bash
gpg --verify SHA256SUMS.asc SHA256SUMS
```

Erwartete Ausgabe (Auszug):

```
gpg: Good signature from "LastBrowser Release <lastbrowser-release@lastbrowser.com>"
```

Zusätzlich den Fingerprint aus der lokalen Vertrauensbasis bestätigen:

```bash
gpg --verify --status-fd 1 SHA256SUMS.asc SHA256SUMS
```

Im Release-Beleg werden Fingerprint, Ausgabe von `gpg --verify` und die
Exit-Codes der Schritte 1–4 festgehalten.

## Veröffentlichung

Veröffentlicht werden ausschließlich die geprüften, unveränderten Dateien:

- `Lastbrowser-0.1.58-x64-setup.exe`
- `Lastbrowser-0.1.58-x64-setup.exe.blockmap`
- `Lastbrowser-0.1.58-x64-portable.exe`
- `latest.yml`
- `SHA256SUMS`
- `SHA256SUMS.asc` (öffentliche Signatur)

Die öffentlichen Artefakte `SHA256SUMS` und `SHA256SUMS.asc` sind
veröffentlichbar; private Schlüssel, Passphrasen und Token sind es nicht.
Kein Artefakt darf nach Schritt 1 verändert werden – jede Änderung macht
Prüfsummen und Signatur ungültig.

## Exit-Codes

`scripts/generate-sha256sums.mjs` verwendet feste Exit-Codes, die im PR und im
Release-Beleg dokumentiert werden:

| Exit-Code | Bedeutung |
| :--- | :--- |
| `0` | Erfolg (erzeugen oder verifizieren) |
| `1` | Verwendung Fehler (unbekanntes Argument / zu viele Argumente) |
| `2` | Manifest-/Asset-Fehler (fehlende oder ungültige `latest.yml`, fehlendes Artefakt, fehlerhafte `SHA256SUMS`-Zeile) |
| `3` | Prüfsummen-Abweichung (`SHA256SUMS` passt nicht zu den Artefakten) |

Für die GPG-Schritte gilt: `gpg --detach-sign` bzw. `gpg --verify` liefern `0`
nur bei Erfolg; ein Exit-Code ungleich `0` bricht den Ablauf ab.

## Sicherheit

- Keine Secrets (privater Schlüssel, Passphrase, Token) in Code, PR, Logs oder
  diesem Dokument.
- Nur der öffentliche Schlüssel (`gpg --armor --export <key-id>`) wird
  veröffentlicht.
- Signiert wird erst nach erfolgreichem Schritt 2; die signierte Datei
  `SHA256SUMS` bleibt byte-identisch zu der verifizierten Datei.
