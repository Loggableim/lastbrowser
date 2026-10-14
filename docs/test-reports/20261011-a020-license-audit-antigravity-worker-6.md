# A-020 Lizenzinventur: Worker-6-Testbericht

**Datum:** 2026-10-11 (Erstlauf antigravity-worker-6), Nacharbeit Quarz 2026-10-14  
**Status:** Teilinventur, keine rechtliche Freigabe  
**Maßgeblich:** [`docs/legal/license-audit.md`](../legal/license-audit.md) (PR #88 / A-020)  
**PR-Branch:** `cursor/a-020-license-cto-e679`  
**Rebase-Basis (Nacharbeit):** `codex/lastbrowser-electron-shell` @ `b5db4360`

---

## 1. Abgleich mit `docs/legal/license-audit.md`

Dieser Bericht hält Erzeugungsbefehle und technische Hilfsnachweise fest. Rechtliche Bewertungen, Freigaben und Dual-Licensing-Folgerungen stehen **ausschließlich** im Auditbericht (§1–§7). Frühere worker-6-Formulierungen zu „100 % permissiv“, alleinigen Rechten aus dem Git-Log oder uneingeschränktem Dual-Licensing sind **zurückgenommen** und im Audit korrigiert.

| Thema | Stand laut Auditbericht |
| :--- | :--- |
| npm-Inventur | **406** npm-Lockfile-Einträge in `package-lock.json` (§4.1); maschinenlesbar unter `docs/legal/inventory/` |
| Python-Runtime | 66 gepinnte Pakete in `apps/desktop/scripts/requirements-runtime.txt` (§4.2); `mcp==1.26.0` in der Pinliste, PyPI-Feld MIT |
| Sidekick/Nous-Rechtekette | **ungeprüft** (§3) |
| `jo.wav` | Lizenz **unbekannt** (§4.4) |
| Entwürfe | nur unter `docs/legal/drafts/` (§6); keine Root-`LICENSE` |

---

## 2. Erzeugung & Evidenz

| Schritt | Befehl | Exit | Ergebnis |
| :--- | :--- | :---: | :--- |
| npm-/Python-Inventur | `node scripts/legal-inventory.mjs` (Repo-Root) | 0 | schreibt `docs/legal/inventory/dependency-licenses.md` und `.json`; Zählmethode siehe Audit §7.5 |
| Git-Autorenliste | `git log --format='%an <%ae>' \| sort -u` | — | nur Identität, **kein** Rechtebeleg (Audit §2) |

---

## 3. Technische Prüfungen (A-020, optional)

| Prüfung | Status |
| :--- | :--- |
| `npm --workspace apps/desktop run build` | **nicht verifiziert** (Dokumentations-Nacharbeit Quarz) |
| `npm run test:run` | **nicht verifiziert** |
| `npm run verify:store` | **nicht verifiziert** – für A-020 nicht gefordert |
| `npm run package:win` | **nicht verifiziert** |

---

## 4. Artefakte (Audit §6)

- `docs/legal/license-audit.md`
- `docs/legal/drafts/LICENSE`, `NOTICE`, `THIRD-PARTY-LICENSES.md`, `README-license-section.md`, `CONTRIBUTING-cla-dco.md`
- `docs/legal/inventory/dependency-licenses.{md,json}`
- `scripts/legal-inventory.mjs`
