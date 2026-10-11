# Technisches Lizenz- und Provenienz-Audit (A-020)

**Stand:** 11. Oktober 2026<br>
**Status:** Arbeitsentwurf, unvollständig, keine Freigabeentscheidung<br>
**Quellbasis:** v0.1.54 Source-Integration auf PR42-Head `353146c3cdb50977b7b8938e800122be24e2b019`, ergänzt um PR31-Metadaten. Die Inventurdatei bindet ihre konkreten Eingaben und SHA-256-Werte.

## Ergebnis in Kürze

Dieses Audit ist eine technische Bestandsaufnahme. Es stellt weder GPL-Kompatibilität noch Eigentum, eine Rechteübertragung, eine CLA-Wirkung oder die Zulässigkeit eines Dual-Licensing-Modells fest. Die Lizenzdateien in `docs/legal/drafts/` bleiben Entwürfe und dürfen nicht als beschlossene Projektlizenz veröffentlicht werden.

| Bereich | Beobachtung | Status |
| --- | --- | --- |
| npm-Abhängigkeiten | `package-lock.json` enthält 488 Drittanbieter-Einträge; Lizenzangaben stammen aus Lockfile-Metadaten. Lizenztexte und Weitergabepflichten wurden nicht paketweise verifiziert. | Teilinventar, rechtlich nicht bewertet |
| Desktop-Python-Runtime | 51 Pins aus `apps/desktop/scripts/requirements-runtime.txt` stimmen mit dem übergebenen Runtime-Interpreter überein. Fünf installierte Pakete haben in diesem Interpreter keine License-Metadaten. | Versionsgebundener Snapshot; offene Metadaten |
| `mcp==1.26.0` | Der frühere Review nennt diese Version. Sie steht nicht in `package-lock.json`, `pyproject.toml` oder der aktuellen Runtime-Pinliste und wurde im untersuchten Runtime-Interpreter nicht gefunden. | Herkunft, Shipping-Status und Lizenz unbekannt |
| Sidekick/Hermes | `services/sidekick/LICENSE` enthält MIT-Text und Urhebervermerke. Das belegt allein weder den vollständigen Codeursprung noch eine Rechteübertragung an LastBrowser. | Rechtekette ungeprüft |
| `jo.wav` | Im Repository liegt kein Herkunfts- oder Lizenzbeleg vor. | Lizenz unbekannt |
| Dual Licensing | Git-Autor- und Committerfelder sind keine Rechteübertragung. Für übernommene und gemeinschaftliche Beiträge fehlt hier eine vollständige Rechteakte. | Keine Freigabe oder Rechtsaussage |

## Reproduzierbare Eingaben

Die maschinenlesbare Momentaufnahme ist [`third-party-inventory-20261011.json`](drafts/third-party-inventory-20261011.json). Sie wurde mit `scripts/generate-third-party-license-inventory.py` erzeugt. Das Skript liest `package-lock.json`, die gepinnte Runtime-Liste und Paketmetadaten des ausdrücklich übergebenen Python-Interpreters. Es speichert Eingabe-Hashes, Paketversionen, Lizenzmetadaten, Bezugs-URLs und nicht auflösbare Fälle.

Für eine erneute Erstellung muss ein Python-Interpreter mit dem erwarteten Inhalt bereitgestellt werden. Der in der Snapshot-Datei gebundene Interpreter lag unter `C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe`; sein SHA-256 steht in der Inventur. Die Datei ist ein lokales Runtime-Artefakt und wird nicht durch diesen Auditbericht als Git-Datei behauptet.

Lizenzfelder aus npm- oder Python-Paketmetadaten sind Hinweise des jeweiligen Distributionsdatensatzes, kein Ersatz für eine Prüfung der vollständigen Lizenztexte, Copyright-Notices, Modell-/Font-/Medienbedingungen und Weitergabepflichten. Das Snapshot-Skript nimmt keine GPL-Kompatibilitätsbewertung vor.

## Rechte- und Herkunftsfragen

`git log` kann Autoren- und Committerkennungen für die untersuchte Historie zeigen. Es kann nicht beweisen, wer das Urheberrecht an importierten Dateien besitzt, ob frühere Rechte wirksam übertragen wurden oder ob alle externen Beiträge erfasst sind. Die Git-Historie wird deshalb nicht als Eigentumsnachweis verwendet.

Für Sidekick/Hermes sind Ursprungsrepository, übernommene Dateien, Lizenzhinweise und etwaige Rechteübertragungen vor einer abschließenden Aussage zu dokumentieren. Die vorhandene MIT-Datei ist als Herkunftshinweis relevant, schließt diese Lücke aber nicht.

Die im früheren Audit als „permissiv“ bezeichnete Audiodatei `services/sidekick/tools/neutts_samples/jo.wav` bleibt bis zu einem belastbaren Beleg **unbekannt**. Gleiches gilt für das vom Review gemeldete MCP-Paket, solange es keinem ausgelieferten Abhängigkeitsweg zugeordnet ist.

## Entwürfe und offene Entscheidungen

- `docs/legal/drafts/LICENSE`: GPLv3-Textentwurf; Tippfehler aus dem CTO-Review korrigiert und mit dem offiziellen GNU-Text abgeglichen.
- `NOTICE`, `THIRD-PARTY-LICENSES.md`, README-Lizenzabschnitt und CLA/DCO bleiben unverbindliche Entwürfe.
- Der kommerzielle Lizenztext und die Rechtekette sind nicht geprüft oder beschlossen.
- Kein Auditresultat autorisiert ein Lizenzversprechen, eine Veröffentlichung oder eine Rechtebehauptung.

Dies ist keine Rechtsberatung. Die offenen Rechte- und Weitergabefragen benötigen belastbare Herkunftsunterlagen und gegebenenfalls anwaltliche Prüfung, bevor die Entwürfe in Root- oder Website-Dateien übernommen werden.
