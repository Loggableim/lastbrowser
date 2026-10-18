# SHA256SUMS und GPG-Detach-Signatur für Releases

Dieses Dokument beschreibt das reproduzierbare Verfahren zum Erzeugen der
`SHA256SUMS` und der zugehörigen GPG-Detach-Signatur (`SHA256SUMS.asc`) für ein
LastBrowser-Release. Referenz-Release für diese Vorbereitung ist **v0.1.58**.

Es ergänzt `docs/release.md` (tag-basierter GitHub-Release) und
`docs/local-signed-release.md` (lokaler Signatur-Build mit Certum/SimplySign +
Castlabs VMP).

## Grundsätze

- Der **private GPG-Schlüssel und die Passphrase bleiben lokal bei Cid**. Sie
  verlassen Cid nie und werden weder committet noch in PRs, Logs, CI-Secrets des
  Repos oder Kommandozeilen-Historien erfasst.
- Veröffentlicht werden ausschließlich die **öffentlichen** Artefakte
  `SHA256SUMS` und `SHA256SUMS.asc`. Eine Detach-Signatur enthält keine
  Geheimnisse.
- Signiert wird erst **nach** dem letzten Schreibzugriff auf die Release-Dateien.
  Nach der Signatur darf keine Datei mehr verändert werden, sonst ist die
  SHA-256-Kette ungültig.

## Voraussetzungen

- Ein fertig signiertes Release-Verzeichnis gemäß `docs/local-signed-release.md`,
  z. B. `apps/desktop/release-local-0.1.58-<yyyyMMdd-HHmmss>/` mit genau diesen
  vier veröffentlichten Assets:
  - `Lastbrowser-0.1.58-x64-setup.exe`
  - `Lastbrowser-0.1.58-x64-setup.exe.blockmap`
  - `Lastbrowser-0.1.58-x64-portable.exe`
  - `latest.yml`
- `node` (die Version aus dem Repository) und `gpg` (GnuPG 2.2 oder neuer) im PATH.
- Der GPG-Signaturschlüssel liegt im lokalen Keyring von Cid. Fingerprint
  ermitteln:

  ```bash
  gpg --list-secret-keys --keyid-format=long
  ```

## Schritt 1: SHA256SUMS erzeugen

Deterministisch aus dem Release-Verzeichnis, mit den erwarteten Asset-Namen aus
`latest.yml`:

```bash
node scripts/generate-sha256sums.mjs apps/desktop/release-local-0.1.58-<timestamp>
```

Das Skript

- liest `latest.yml`, prüft `version` gegen `^\d+\.\d+\.\d+$` und leitet daraus
  Setup-Exe, Setup-Blockmap und Portable-Exe ab,
- berechnet SHA-256 über die vier Assets in aufsteigender Namensreihenfolge,
- schreibt `SHA256SUMS` im GNU-coreutils-Format
  (`<hex64>␣␣<name>`, LF-Zeilenenden, eine abschließende Newline),
- liest die Datei anschließend erneut ein und verifiziert Anzahl, Namen und
  Hashes gegen die frisch berechneten Werte.

Reproduzierbarkeit prüfen, ohne erneut zu schreiben:

```bash
node scripts/generate-sha256sums.mjs apps/desktop/release-local-0.1.58-<timestamp> --check
```

## Schritt 2: Detach-Signatur erzeugen (lokal bei Cid)

Passphrase **nur** über den GPG-Pinentry-Agent eingeben — niemals als Argument,
Env-Variable oder Datei:

```bash
cd apps/desktop/release-local-0.1.58-<timestamp>
gpg --detach-sign --armor --local-user "<FINGERPRINT>" --output SHA256SUMS.asc SHA256SUMS
```

- `--detach-sign` erzeugt eine Signatur über `SHA256SUMS` als eigene Datei.
- `--armor` erzeugt die ASCII-Variante `SHA256SUMS.asc` (prüfbar, diffbar,
  ohne Secrets).
- `--local-user` adressiert den Schlüssel per Fingerprint, nicht per E-Mail.

## Schritt 3: Signatur und Checksummen verifizieren

```bash
cd apps/desktop/release-local-0.1.58-<timestamp>
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS
```

Erwartung: `gpg --verify` meldet `Good signature` mit dem erwarteten
Schlüssel-Fingerprint, `sha256sum -c` meldet für alle vier Assets `OK`.

## Schritt 4: Veröffentlichen

`SHA256SUMS` und `SHA256SUMS.asc` zusammen mit den vier bereits veröffentlichten
Assets am selben Release-Tag publizieren. Die Dateien dürfen danach nicht mehr
verändert werden. Downloads nach dem Upload erneut prüfen:

```bash
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS
```

## Exit-Codes

Skript `scripts/generate-sha256sums.mjs`:

| Exit-Code | Bedeutung |
| --- | --- |
| `0` | `SHA256SUMS` geschrieben (bzw. mit `--check` erfolgreich verifiziert). |
| `1` | Laufzeitfehler: fehlendes Asset, ungültige `latest.yml`, beschädigte `SHA256SUMS`, falsche Asset-Anzahl oder Hash-Abweichung. |
| `2` | Aufruffehler: nicht genau ein Release-Verzeichnis übergeben. |

GnuPG:

| Exit-Code | Bedeutung |
| --- | --- |
| `0` | Signatur erzeugt bzw. `--verify` mit gültiger Signatur. |
| `2` | GnuPG-Fehler (z. B. ungültige Optionen, unbekannter Schlüssel, Signatur ungültig/fehlend). |

## Secret-Hygiene

- Keine Passphrase, kein privater Schlüssel und kein Keyring-Inhalt in Code,
  Commit, PR-Beschreibung, Log oder Testfixture.
- Die Signatur passiert ausschließlich in der lokalen Umgebung von Cid; im
  Repository existiert kein Schlüsselmaterial.
- `SHA256SUMS.asc` ist öffentlich und darf veröffentlicht werden; es enthält
  keine Rückschlüsse auf die Passphrase.

## Evidenz im PR

Im PR dokumentieren: die exakten Kommandos, das Release-Verzeichnis, den
verwendeten Schlüssel-Fingerprint (öffentlich) sowie die Exit-Codes jedes
Schritts (`generate-sha256sums`, `gpg --detach-sign`, `gpg --verify`,
`sha256sum -c`).
