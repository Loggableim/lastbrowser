# OpenCode Auto-Router vs fixed free model — TTFT (Linux)

**Date:** 2026-10-15 (UTC)  
**Nord prompt:** Measure TTFT with `LASTBROWSER_OPENCODE_AUTO_ROUTER=1`, Auto vs fixed free model, Quickchat + Standard chat, ≥5 runs/cell. **Not** beta.10 gate. Report `#bugs`.

## Verdict

**Live matrix: NOT RUN (blocked on integration).**  
**Fixed-model baseline:** partial run from earlier same day (see [opencode-go-ttft-abnahme-linux.md](./20261015-opencode-go-ttft-abnahme-linux.md)).

## Why blocked

| Item | Status |
|------|--------|
| Linux draft PR [#139](https://github.com/Loggableim/lastbrowser/pull/139) @ `ac6424fb` | Prototype + plan + **5/5 unit tests** |
| `LASTBROWSER_OPENCODE_AUTO_ROUTER=1` in a **running chat** | **Not wired** — plan states *„Der laufende Chat ruft den Planer noch nicht“* |
| Env flag on Sidekick/Electron today | Does not change model routing or dual-lane streaming |
| Cid Slack 12:02 UTC | *„Live-Messung … vorbereitet und noch nicht gelaufen“* |

Flag gating exists only in `opencodeAutoRouterEnabled()` (tested); no `process.env` / IPC hook in the desktop shell on this SHA.

## Intended matrix (when wired)

Same prompt on both surfaces, OpenCode Go free models only:

| Cell | Mode | Surface | TTFT definition |
|------|------|---------|-----------------|
| A | **Auto** (flag=1) | Quickchat | First **streamed word** from scout lane (or merged transcript policy) |
| B | **Fixed** | Quickchat | First token, explicit free model (e.g. `glm-5.3-flash` or `deepseek-v4.1-flash`) |
| C | **Auto** (flag=1) | Standard chat | Same as A |
| D | **Fixed** | Standard chat | Same as B |

≥5 runs per cell; compare medians. **Outside** beta.10 gate (6–12 s fixed-model band is gate; auto-router is not).

## Prototype verification (this VM)

```
npm test -- --run tests/opencode-auto-router.test.ts   # 5/5 pass (files from origin/cid/linux-opencode-auto-router)
```

Heuristic classification is synchronous before any token (length, code, keywords, page context) — ready for TTFT attribution once chat calls `planOpenCodeAutoRoute`.

## Fixed-model reference (same VM, earlier harness)

Provider `opencode-go`, fixed `glm-5.3-flash`, API harness @ `8789` — **not** auto mode:

| Surface | Cold/warm | n | Median TTFT ms |
|---------|-----------|---|----------------|
| Quickchat | cold | 3 | 5781 |
| Quickchat | warm | 4 | 7271 |
| Standard chat | cold | 4 | 6802 |
| Standard chat | warm | 2 | 7596 |

Full per-run table: `docs/test-reports/20261015-opencode-go-ttft-abnahme-linux.md`. Several cells missing after Sidekick restart desync (409); run 5 incomplete.

## VM state after latency work

Integrated Lastbrowser @ `8789` was **not healthy** for new API runs at 12:05 UTC (`quickchat_scope_denied` / no listener after restart). **No new TTFT samples** were taken for Auto vs fixed in this turn.

## Next step (for a green Auto vs fixed matrix)

1. Merge chat integration that reads `LASTBROWSER_OPENCODE_AUTO_ROUTER` / `localStorage['lastbrowser.opencodeAutoRouter.v1']` and starts scout (+ strong on complex) lanes.  
2. Re-run harness: cells A–D, 5+ runs, log `stream_id` + first SSE token time + `native_chat_phase` `first_text`.  
3. Keep auto-router results **separate** from beta.10 gate reports.

No main, tag, release, or signing.
