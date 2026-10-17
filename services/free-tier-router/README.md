# Free-Tier Router (M1) — `#320`

Grundgerüst: FastAPI-Gateway, Redis-Queues (high/standard/low), Telemetrie, Ollama-Cloud-/LiteLLM-Anbindung.

**Kein Deploy.** Keine Kosten. API-Key nur per Env.

## Modelle (Ollama Cloud, Cid)

| Tier   | Modell |
|--------|--------|
| leicht | `nemotron-3-nano` (`MODEL_LIGHT`) |
| mittel | `gpt-oss:120b` / Alt `glm-5.3-flash` (`MODEL_MID` / `MODEL_MID_ALT`) |
| schwer | `deepseek-v4.1-flash` (`MODEL_HEAVY`) |

Tagesbudget: `DAILY_BUDGET_EUR` (Platzhalter-Betrag, setzt Cid). Key: `OLLAMA_CLOUD_API_KEY` (nie committen).

## Lokal

```bash
cd services/free-tier-router
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Key + Budget eintragen
pytest -q
uvicorn app.main:app --host 127.0.0.1 --port 8088
```

Ohne erreichbares Redis → In-Memory-Queues. Live-Calls nur wenn Key gesetzt und `dry_run=False` (M1 default: Stub).

## Endpoints

- `GET /health`
- `GET /metrics`
- `POST /v1/chat` (+ Header `X-Opt-In: true|false`)

## Nicht in M1

Klassifikator-Training (M3), Opt-in-UI/DSGVO (M4), Lasttest (M5), Rollout (M6).
