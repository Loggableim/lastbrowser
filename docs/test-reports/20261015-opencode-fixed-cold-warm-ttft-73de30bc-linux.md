# OpenCode Go fixed model — cold/warm TTFT @ 73de30bc (Linux)

**Date:** 2026-10-15 (UTC)  
**Stand:** `73de30bc` (Sidekick bridge rebind after SIGTERM; **Auto-Router aus**)  
**Provider / model:** `opencode-go` / `glm-5.3-flash` (pinned)  
**Host:** Linux VM, Electron shell + Sidekick @ `127.0.0.1:8789`, OpenCode device auth OK  
**Prompt:** `Reply with exactly: LATENCY-OK`  
**TTFT:** `native_chat_phase` → `stage=first_text` → `elapsed_ms` in `agent.log`  
**Harness run:** ~10 min wall clock for 5×4 cells (legacy harness drains full SSE; see faster script below)

---

## FUER-FELIX (#bugs)

**Kurz:** Latenz-Abnahme für **festes OpenCode-Go-Modell** (ohne Auto-Router) ist auf dem **73de30bc**-Stand **ausreichend** gemessen (5 Läufe je Zelle kalt/warm, Quickchat + Standard-Chat). **Kein `quickchat_scope_denied`** in dieser Session; **1×409** `scope_mismatch` nur Quickchat **kalt Run 1** (Sidekick-Neustart + manuell respawnter uvicorn — siehe Patch-Hinweis). **Alle erfolgreichen TTFTs liegen über 12 s** (beta.10-Gate-Band); das ist für die Gate-Entscheidung dokumentiert, kein Blocker für „weiter zur nächsten Beta“.

**Mediane (ms):**

| Surface | Cold | Warm |
|---------|------|------|
| Quickchat | 14 232 (n=4) | 14 441 (n=5) |
| Standard chat | 24 179 (n=5) | 24 655 (n=5) |

**409 / Ausreißer:** 1×409 mitgezählt; **19/19** erfolgreiche Samples **>12 s**; Standard kalt Run 2 **39 337 ms** als Spitze.

**Nächste Schritte:** Auto-Router-TTFT-Matrix **parken**; Fokus **nächste Beta**. Für künftige Läufe: `scripts/probe-opencode-ttft-cold-warm.py` mit `ELECTRON_MANAGED_RESTART=1` + `FAST_TTFT=1` (Abbruch nach `first_text`, kein zweiter uvicorn).

Rohdaten: `/opt/cursor/artifacts/opencode-fixed-cold-warm-73de30bc.json` (CI/VM-Artefakt, nicht im Repo).

---

## Method

| Axis | Definition |
|------|------------|
| **Quickchat** | `POST /api/quickchat/start` + stream until first token logged |
| **Standard chat** | `POST /api/session/new` + `POST /api/chat/start` |
| **Cold** | First turn after **SIGTERM** Sidekick restart |
| **Warm** | Second turn, same `quick_chat_id` / session, same process |
| **Outlier** | TTFT **> 12 000 ms** (beta.10 gate band) |
| **409** | HTTP 409 / `error_code` recorded per row |

## Per-run table

| Surface | Temp | Run | TTFT ms | >12s | 409 | error_code |
|---------|------|-----|---------|------|-----|------------|
| Quickchat | cold | 1 | — | | yes | scope_mismatch |
| Quickchat | warm | 1 | 14441 | yes | | |
| Standard | cold | 1 | 24122 | yes | | |
| Standard | warm | 1 | 24434 | yes | | |
| Quickchat | cold | 2 | 14271 | yes | | |
| Quickchat | warm | 2 | 15941 | yes | | |
| Standard | cold | 2 | 39337 | yes | | |
| Standard | warm | 2 | 24655 | yes | | |
| Quickchat | cold | 3 | 23016 | yes | | |
| Quickchat | warm | 3 | 13856 | yes | | |
| Standard | cold | 3 | 25297 | yes | | |
| Standard | warm | 3 | 24736 | yes | | |
| Quickchat | cold | 4 | 14193 | yes | | |
| Quickchat | warm | 4 | 14563 | yes | | |
| Standard | cold | 4 | 24149 | yes | | |
| Standard | warm | 4 | 24745 | yes | | |
| Quickchat | cold | 5 | 13755 | yes | | |
| Quickchat | warm | 5 | 14146 | yes | | |
| Standard | cold | 5 | 24179 | yes | | |
| Standard | warm | 5 | 24306 | yes | | |

## Findings

1. **OpenCode Go inference works** with device credentials; broker_ready ~1.5 s stable across rows.
2. **Standard chat TTFT ~1.7× Quickchat** on medians (cold and warm).
3. **Warm vs cold:** Quickchat warm ≈ cold; Standard warm ≈ cold (catalog warm path does not shrink TTFT much here).
4. **Gate:** All successful samples exceed **12 s** fixed-model gate; track separately from Auto-Router work.
5. **Harness speed:** Full SSE drain makes runs ~2× slower than needed; use `scripts/probe-opencode-ttft-cold-warm.py` for the next pass.

No main, tag, release, or signing.
