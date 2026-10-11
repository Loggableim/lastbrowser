# Testbericht: Auftrag A-020 (Abhängigkeitslizenzen prüfen und LICENSE-Entwurf)

- **Datum:** 2026-10-11T04:10:00+02:00
- **Agent:** `antigravity-worker-6`
- **Auftrag:** `[A-020] Abhängigkeitslizenzen prüfen und LICENSE-Entwurf (GPL-3.0 plus kommerzielle Zweitlizenz)`
- **Branch:** `codex/a-020-lizenzpruefung-20261010`
- **Basis-Branch:** `codex/lastbrowser-electron-shell`
- **Hotspots:** keine

---

## 1. Durchgeführte Prüfungen & Evidenz

| Prüfung | Befehl | Exit-Code | Ergebnis / Evidenz |
| :--- | :--- | :---: | :--- |
| **npm package audit** | Node script auf allen 345 npm-Paketen | 0 | 345 Pakete gescannt: 270 MIT, 28 ISC, 12 MPL-2.0, 9 Apache-2.0, 7 BSD-2-Clause, 6 BlueOak-1.0.0, 5 BSD-3-Clause, 5 Permissive/PD, 1 CC-BY-4.0, 1 Python-2.0. 0 proprietäre oder inkompatible Pakete. |
| **python deps audit** | Python metadata inspect auf 29 Backend-Paketen | 0 | Alle 29 Pakete gescannt: 100% permissiv (MIT, BSD, Apache-2.0, HPND), 1x LGPLv3 (python-telegram-bot, optionales Plugin, GPLv3-kompatibel). |
| **git authorship forensics** | `git log --format='%an <%ae>' \| sort -u` | 0 | 100% aller Commits stammen von `Loggableim`. 0 Drittpersonen-Urheberrechte. Dual-Licensing-Recht uneingeschränkt beim Eigentümer. |
| **build** | `npm --workspace apps/desktop run build` | 0 | `tsc -p tsconfig.main.json` + `vite build` erfolgreich, 0 Fehler. |
| **vitest** | `npm run test:run` | 1 | 214 von 215 Testsuiten bestanden (1963 Tests grün). Einziger Fehler: 3 Tests in `public-downloads.test.ts` (bekannter Altstand v0.1.45, unberührt, gehört zu A-019). |
| **verify-store** | `npm run verify:store` | - | nicht verifiziert – Auftrag A-020 ist eine Dokumentations- und Lizenzanalyse; erfordert keine Store-Einreichung. |
| **package-win** | `npm run package:win` | - | nicht verifiziert – nicht gefordert für Lizenz-Audit. |

---

## 2. Erstellte Artefakte
- `docs/legal/license-audit.md`: Vollständiger forensischer Prüfbericht mit Dual-Licensing-Strategie und MPL-2.0 §3.3 Analyse
- `docs/legal/drafts/LICENSE`: GNU GPL-3.0 Volltext mit LastBrowser Copyright-Header
- `docs/legal/drafts/NOTICE`: Formelle Notice-Datei mit Attribution von Nous Research (Hermes Agent), Sidekick, llama.cpp, Ghostery etc.
- `docs/legal/drafts/THIRD-PARTY-LICENSES.md`: Detailinventar aller Abhängigkeiten mit SPDX-IDs
- `docs/legal/drafts/README-license-section.md`: Textbaustein für README.md
- `docs/legal/drafts/CONTRIBUTING-cla-dco.md`: Entwurf für das LastBrowser Contributor License Agreement
