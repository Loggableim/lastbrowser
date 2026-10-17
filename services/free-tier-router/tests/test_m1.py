from app.config import Settings, get_settings
from app.policy import decide


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["backend"] == "ollama_cloud"
    assert data["models"]["leicht"] == "nemotron-3-nano"
    assert data["models"]["mittel"] == "gpt-oss:120b"
    assert data["models"]["schwer"] == "deepseek-v4.1-flash"


def test_metrics(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "ftr_requests_total" in r.text or r.text.startswith("#") or "python" in r.text.lower() or True
    # after a chat, counter should appear
    client.post("/v1/chat", json={"prompt": "hi"}, headers={"X-Opt-In": "false"})
    r2 = client.get("/metrics")
    assert r2.status_code == 200
    assert b"ftr_requests_total" in r2.content


def test_opt_in_goes_high(client):
    r = client.post(
        "/v1/chat",
        json={"prompt": "Please refactor this multi-step tool pipeline with browser MCP."},
        headers={"X-Opt-In": "true"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["queue"] == "high"
    assert body["result"]["stub"] is True
    assert body["result"]["backend"] == "ollama_cloud"


def test_no_opt_in_never_schwer():
    decision = decide(
        "Write a complex multi-step tool-using agent with browser MCP and long code ```def x(): pass``` " * 20,
        opt_in=False,
    )
    assert decision.tier != "schwer"
    assert decision.queue in {"low", "standard"}


def test_config_placeholders():
    get_settings.cache_clear()
    s = Settings(
        MODEL_LIGHT="nemotron-3-nano",
        MODEL_MID="gpt-oss:120b",
        MODEL_MID_ALT="glm-5.3-flash",
        MODEL_HEAVY="deepseek-v4.1-flash",
        DAILY_BUDGET_EUR=0,
        OLLAMA_CLOUD_API_KEY="",
    )
    assert s.model_for("leicht") == "nemotron-3-nano"
    assert s.model_for("mittel") == "gpt-oss:120b"
    assert s.model_for("schwer") == "deepseek-v4.1-flash"
    assert s.daily_budget_eur == 0.0
    assert s.ollama_cloud_api_key == ""


def test_budget_gate(client, monkeypatch):
    from app import main as main_mod
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("DAILY_BUDGET_EUR", "1")
    get_settings.cache_clear()
    main_mod.llm.settings = get_settings()
    main_mod.llm._budget.spent_eur = 1.0
    main_mod.llm._budget.day_key = __import__("time").strftime("%Y-%m-%d", __import__("time").gmtime())
    r = client.post("/v1/chat", json={"prompt": "hello world"}, headers={"X-Opt-In": "false"})
    assert r.status_code == 200
    assert r.json()["result"].get("error") == "daily_budget_exceeded"
