# TTFT benchmarking (OpenCode / native chat)

## Metric (canonical)

**TTFT** = time until the first user-visible token, logged as:

```text
native_chat_phase stream=<id> stage=first_text elapsed_ms=<ms>
```

in Sidekick `agent.log`. Do **not** use full stream completion or assistant message length for gate comparisons.

**Secondary:** `stage=broker_ready` — time until the broker accepts the turn. Report `broker_to_first_ms = first_text − broker_ready` to see post-broker delay.

## Harness

Script: `scripts/probe-opencode-ttft-cold-warm.py`

| Env | Meaning |
|-----|---------|
| `FAST_TTFT=1` (default) | Poll `first_text`, then cancel stream (fast runs) |
| `ELECTRON_MANAGED_RESTART=1` (default) | SIGTERM Sidekick only; **LastBrowser** respawns + rebinds bridge — do not spawn a second uvicorn |
| `OPENCODE_MODEL` | Pinned model (default `glm-5.3-flash`) |
| `LATENCY_RUNS` | Runs per cold/warm cell (default 5) |

**Reference surface:** Compare **Quickchat** vs **Standard chat** on the same model; Quickchat is the lower-latency reference path.

**Auto-Router:** Off for gate-style runs; separate matrix when the flag ships.

## Cold / warm

- **Cold:** first turn after Sidekick process restart.
- **Warm:** second turn, same `quick_chat_id` or standard session, same process.

Count HTTP **409** and TTFT **> 12 000 ms** as documented outliers (beta.10 band), not as harness failures.
