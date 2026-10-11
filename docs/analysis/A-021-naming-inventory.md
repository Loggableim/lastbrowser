# Analyse & Inventar A-021: Namensgebung vereinheitlichen

**Auftrag:** A-021 | P3 | Bereich: Website / Doku / i18n | Typ: Doku / Inventar  
**Bearbeiter:** `antigravity-worker-6`  
**Datum:** 11. Oktober 2026  
**Status:** Inventar & Vorschläge abgeschlossen (wartet auf A-020 Freigabe vor Website-Rollout)  

---

## 1. Leitlinie & Grundsatzentscheidung (Cid, 10.10.2026)

1. **„Lastbrowser“** ist der alleinige Produktname des Browsers.
2. **„Sidekick“** ist die allgemeine, dauerhafte Bezeichnung für das KI-System / die Engine im Browser (Backend-Engine, Runtime, CLI, Architektur).
3. **„Nova“** ist ausschließlich der Standardname des KI-Agenten / Assistenten (im Onboarding-Wizard und in den Einstellungen vom Benutzer frei umbenennbar, z. B. in „Jarvis“, „Aura“ etc.).
4. **„Nova AI“** entfällt vollständig als zusammengesetzter Produkt- oder Systemname.
5. **Keine Schlüsseländerungen:** In Sprachdateien (`apps/desktop/src/renderer/i18n/`) werden nur die Anzeigetexte angepasst; die i18n-Schlüssel (z. B. `commands.category.nova`) bleiben unverändert, um Test- und Codeverträge nicht zu brechen.
6. **Synchronisation mit Lizenzumstellung:** Das Scharfschalten auf der Website (`lastbrowser.com`) erfolgt am Tag der LICENSE-Umstellung (Auftrag A-022) zusammen mit dem Lizenztext.

---

## 2. Inventar der Fundstellen

### A. Website (`lastbrowser.com`)

| Datei | Zeile | Aktueller Text (Auszug) | Problem / Fundstelle | Textvorschlag (Neu) |
| :--- | :--- | :--- | :--- | :--- |
| `index.html` (DE) | 40, 106 | `...mit Nova AI Copilot, 48 Workflows...` | Produktname „Nova AI“ | `...mit integriertem Sidekick KI-Assistenten (Nova), 48 Workflows...` |
| `index.html` (DE) | 128 | `🤖 Nova AI Split-View` | Button-Beschriftung | `🤖 Sidekick Split-View (Nova)` |
| `index.html` (DE) | 202 | `Nova AI & BYOK-Modelle` | Überschrift | `Sidekick KI & BYOK-Modelle` |
| `privacy/index.html` | 99 | `Wenn Sie den Nova AI Copilot nutzen...` | Datenschutztext | `Wenn Sie den Sidekick KI-Assistenten nutzen...` |
| `shortcuts/index.html` | 127 | `Nova AI Copilot im 70/30 Split-View ein- oder ausblenden` | Shortcut-Tabelle | `Sidekick Split-View (Nova) ein- oder ausblenden` |
| `en/index.html` | 40, 106 | `...with Nova AI, ConPTY terminal...` | Englischer Hero-Text | `...with Sidekick AI (Nova), ConPTY terminal...` |
| `es/index.html` | 40, 106 | `...con copiloto Nova AI...` | Spanischer Hero-Text | `...con el asistente Sidekick (Nova)...` |
| `fr/index.html` | 40, 106 | `...avec le copilote Nova AI...` | Französischer Hero-Text | `...avec l'assistant Sidekick (Nova)...` |
| `it/index.html` | 40, 106 | `...con copilota Nova AI...` | Italienischer Hero-Text | `...con l'assistente Sidekick (Nova)...` |
| `ja/index.html` | 40, 106 | `Nova AI、ConPTYターミナル...` | Japanischer Hero-Text | `Sidekick AI（Nova）、ConPTYターミナル...` |
| `pt/index.html` | 40, 106 | `...com Nova AI e 48 fluxos...` | Portugiesischer Hero-Text | `...com o assistente Sidekick (Nova)...` |
| `llms.txt` | 3 | `...integrated AI Copilot (Nova AI)...` | LLM-Übersicht | `...integrated Sidekick AI engine (default agent: Nova)...` |
| `llms-full.txt` | 29 | `### 3.3 Nova AI Copilot & 48 Agentic Workflows` | LLM-Volltext | `### 3.3 Sidekick AI Engine & 48 Agentic Workflows` |

---

### B. UI- und Sprachdateien (`apps/desktop/src/renderer/i18n/`)

| Datei | i18n-Schlüssel (bleibt unverändert) | Aktueller String | Empfohlener neuer String |
| :--- | :--- | :--- | :--- |
| `locales/de.ts:406` | `'firstRun.preferredModelLabel'` | `'Bevorzugtes Modell für Nova AI:'` | `'Bevorzugtes Modell für Nova (Sidekick):'` |
| `locales/en.ts:325` | `'sidebar.drawer.aiTitle'` | `'Nova AI, Agents & Skills'` | `'Sidekick: Agents & Skills'` |
| `locales/en.ts:406` | `'firstRun.preferredModelLabel'` | `'Preferred Model for Nova AI:'` | `'Preferred Model for Nova (Sidekick):'` |
| `locales/en.ts:422` | `'firstRun.runtimeReady'` | `'Nova AI Runtime: Ready'` | `'Sidekick Runtime: Ready'` |
| `locales/en.ts:423` | `'firstRun.runtimeStarting'` | `'Nova AI Runtime: Starting...'` | `'Sidekick Runtime: Starting...'` |
| `locales/en.ts:446` | `'commands.category.nova'` | `'Nova AI'` | `'Nova (Agent)'` |
| `locales/ja.ts:37` | `'commands.category'` -> `nova` | `'Nova AI'` | `'Nova（エージェント）'` |
| `locales/ja.ts:47` | `'preferredModelLabel'` | `'Nova AI の優先モデル：'` | `'Nova（Sidekick）の優先モデル：'` |
| `locales/ja.ts:47` | `'runtimeReady'` | `'Nova AI ランタイム：準備完了'` | `'Sidekick ランタイム：準備完了'` |
| `locales/ru.ts:439` | `'firstRun.runtimeReady'` | `'Среда Nova AI: готова'` | `'Среда Sidekick: готова'` |
| `locales/ru.ts:465` | `'commands.category.nova'` | `'Nova AI'` | `'Nova (Агент)'` |

---

### C. Store-Assets & Fremdmarken (`assets/store/`)

Mara (10.10.) stellte fest, dass zwei Screenshot-Dateien nach Fremdmarken benannt sind und generische Mockups darstellen:
1. `assets/store/store-screen-1-zen-sidebar.png`
   - *Problem:* Benannt nach „Zen“ (Fremdbrowser).
   - *Vorschlag:* Umbenennung in `store-screen-1-vertical-sidebar.png`
2. `assets/store/store-screen-2-copilot-splitview.png`
   - *Problem:* Benannt nach „Copilot“ (Microsoft-Marke).
   - *Vorschlag:* Umbenennung in `store-screen-2-sidekick-splitview.png`

*Hinweis für die Veröffentlichung:* Microsoft Store verlangt echte Windows 10/11 Screenshots der aktuellen App-Version (v0.1.53). Die Screenshots werden im Zuge des Praxistests (P-002) in der VM nativ erfasst.

---

### D. Audit der Aussagen auf `lastbrowser.com` gegen Ist-Stand v0.1.53 (Mara-Funde)

| Aussage auf Website | Ist-Stand v0.1.53 | Bewertung & Maßnahme |
| :--- | :--- | :--- |
| **„v0.1.45 Beta“** | Aktueller Release ist **v0.1.53** | Korrigieren: In allen Download- und Headerzeilen auf v0.1.53 aktualisieren (in PR #32 durch Worker 5 bereits vorbereitet). |
| **„48 Workflows“** | `services/sidekick/skills` enthält 48 Agentic Workflows | **Korrekt.** Zahl ist belegt und kann beibehalten werden. |
| **„100% Local-First“** | Lokale Datenablage in `%APPDATA%\Lastbrowser`, Llama.cpp / Ollama lokal; externe APIs optional per BYOK | **Präzisieren:** „Local-First Architektur (lokale Datenhaltung & optionale lokale LLMs via Ollama)“. |
| **„Kostenlos & Open-Source für Privat“** | Keine `LICENSE`-Datei im Monorepo vorhanden (Stand vor A-020/A-022) | **Dringend anpassen:** Aussage erst am Tag der A-022-Umsetzung freischalten („Open Source unter GPL-3.0 plus kommerzielle Lizenz“). Bis dahin vorübergehend neutral formulieren („Kostenlos für Privatanwender“). |

---

## 3. Nächste Schritte

1. **Ablage:** Dieses Inventar liegt als dauerhafter Referenzbericht unter `docs/analysis/A-021-naming-inventory.md`.
2. **Abhängigkeit:** Nach Freigabe von PR #33 (A-020) durch Cid werden die Textanpassungen auf `lastbrowser.com` und in den i18n-Dateien im Rahmen von Auftrag A-022 in einem geschlossenen PR umgesetzt.
