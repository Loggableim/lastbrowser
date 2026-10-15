# OpenCode Go TTFT abnahme — Linux (0.1.56 bundle)

**Date:** 2026-10-15 (UTC)  
**Scope:** Nord 13:07 — OpenCode acceptance latency, no beta.10 build, no release/sign.  
**Provider / model:** `opencode-go` / `glm-5.3-flash`  
**Host:** Linux VM, integrated Lastbrowser **0.1.56** sidekick at `http://127.0.0.1:8789` (Electron bridge token)  
**Prompt:** `Reply with exactly: LATENCY-OK`  
**TTFT:** `native_chat_phase` → `stage=first_text` → `elapsed_ms` in `agent.log` (same family as prior GLM five-turn harness).

## Method

| Axis | Definition |
|------|------------|
| **Quickchat** | `POST /api/quickchat/start` + SSE `/api/chat/stream` |
| **Standard chat** | `POST /api/session/new` + `POST /api/chat/start` + SSE |
| **Cold** | First turn after **SIGTERM restart** of the integrated uvicorn sidekick (fresh in-process catalog receipt) |
| **Warm** | Second turn in the **same** quick_chat_id or standard session, same uvicorn process |
| **Catalog cache** | **No** on cold (post-restart); **Yes** on warm (second turn within `probe_catalog` in-process reuse, 300s window) |

Harness: `/opt/cursor/artifacts/opencode-abnahme-ttft.py` (API-only, no UI). Raw console log: `opencode-abnahme-ttft-run.log`. JSON: `opencode-abnahme-ttft-final.json`.

## Results (per run)

| Surface | Cold/warm | Run | Model | TTFT ms | Catalog cache |
|---------|-----------|-----|-------|---------|---------------|
| Quickchat | cold | 1 | glm-5.3-flash | 5781.2 | No |
| Quickchat | warm | 1 | glm-5.3-flash | 5618.2 | Yes |
| Quickchat | cold | 2 | glm-5.3-flash | 29028.9 | No |
| Quickchat | warm | 2 | glm-5.3-flash | 27330.5 | Yes |
| Quickchat | cold | 3 | glm-5.3-flash | *timeout / no first_text* | No |
| Quickchat | warm | 3 | glm-5.3-flash | 8515.5 | Yes |
| Quickchat | cold | 4 | glm-5.3-flash | 5021.8 | No |
| Quickchat | warm | 4 | glm-5.3-flash | 6025.6 | Yes |
| Quickchat | cold | 5 | glm-5.3-flash | *run aborted (409)* | No |
| Standard chat | cold | 1 | glm-5.3-flash | 6189.8 | No |
| Standard chat | warm | 1 | glm-5.3-flash | 9453.1 | Yes |
| Standard chat | cold | 2 | glm-5.3-flash | 19802.4 | No |
| Standard chat | warm | 2 | glm-5.3-flash | *timeout / no first_text* | Yes |
| Standard chat | cold | 3 | glm-5.3-flash | 5780.5 | No |
| Standard chat | warm | 3 | glm-5.3-flash | 5739.6 | Yes |
| Standard chat | cold | 4 | glm-5.3-flash | 7414.0 | No |
| Standard chat | warm | 4 | glm-5.3-flash | *timeout / no first_text* | Yes |
| Standard chat | cold | 5 | glm-5.3-flash | *not run (harness stopped)* | — |
| Standard chat | warm | 5 | glm-5.3-flash | *not run* | — |

## Summaries (successful samples only)

| Surface | Cold/warm | n | Median TTFT ms | Min | Max |
|---------|-----------|---|----------------|-----|-----|
| Quickchat | cold | 3 | 5781 | 5022 | 29029 |
| Quickchat | warm | 4 | 7271 | 5618 | 27331 |
| Standard chat | cold | 4 | 6802 | 5781 | 19802 |
| Standard chat | warm | 2 | 7596 | 5740 | 9453 |

## Findings

1. **OpenCode Go login held** for runs 1–4; provider returned first text for most turns (TTFT roughly **5.6–9.5s** on “good” runs; outliers **19–29s** and one **~27s** warm quickchat pair in run 2).
2. **Standard chat cold TTFT** is often **~1.2–2× Quickchat cold** on comparable successful runs (e.g. run 1: 6190 ms vs 5781 ms), consistent with heavier standard-chat startup/agent path.
3. **Warm catalog column** follows process semantics; **broker_ready** stayed ~58–61 ms across cold/warm in sampled rows — cache benefit is not visible in broker_ready alone (catalog reuse is in-process, not logged per hit).
4. **Harness limits:** sidekick **SIGTERM restarts** eventually desynced Electron bridge/scope (`quickchat_scope_denied`); run **5** and gap-fill could not complete. **agent.log** was truncated on restart, so some null TTFTs are lost log lines, not necessarily absent provider tokens.
5. **Recommendation for re-run:** cold restart via **Electron-managed sidekick recycle** (not orphan uvicorn SIGTERM), enforce **quickchat cancel** between turns, and persist **per-stream log excerpts** in the harness artifact.

## Verdict

**Partial abnahme dataset** — suitable for OpenCode Go latency triage, **not** a full 5×4 green matrix. No product code changes; measurement-only.
