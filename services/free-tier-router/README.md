# Free-Tier Router (M1) — `#320`

Grundgerüst: FastAPI-Gateway, Redis-Queues (high/standard/low), Telemetrie, Ollama-Cloud-Anbindung.

**Kein Deploy.** Keine Kosten. API-Key nur per Env.

## Modelle (Ollama Cloud, Cid / PR #321)

| Tier | Modell | Reasoning | Ollama `think` | Wer |
|------|--------|-----------|----------------|-----|
| leicht | `nemotron-3-nano` | off | `false` | alle |
| mittel | `gpt-oss:20b` | off | `false` | alle |
| schwer | `glm-5.3-flash` | low | `"low"` | **nur Opt-in** |

Env: `MODEL_*`, `REASONING_*` (`off`\|`low`\|`high`\|`max`). Entfernt: `deepseek-v4.1-flash`, `gpt-oss:120b`.

Thinking-API: [docs.ollama.com/capabilities/thinking](https://docs.ollama.com/capabilities/thinking), [glm-5.3-flash](https://ollama.com/library/glm-5.3-flash).

Tagesbudget: `DAILY_BUDGET_EUR`. Key: `OLLAMA_CLOUD_API_KEY` (nie committen).

## Lokal

```bash
cd services/free-tier-router
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
pytest -q
uvicorn app.main:app --host 127.0.0.1 --port 8088
```

## Endpoints

- `GET /health` — inkl. Modell+Reasoning-Mapping
- `GET /metrics`
- `POST /v1/chat` (+ `X-Opt-In: true|false`)
