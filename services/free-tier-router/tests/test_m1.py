from app.config import Settings, get_settings, think_value
from app.policy import decide


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["backend"] == "ollama_cloud"
    assert data["models"]["leicht"]["model"] == "nemotron-3-nano"
    assert data["models"]["leicht"]["reasoning"] == "off"
    assert data["models"]["leicht"]["think"] is False
    assert data["models"]["mittel"]["model"] == "gpt-oss:20b"
    assert data["models"]["mittel"]["reasoning"] == "off"
    assert data["models"]["schwer"]["model"] == "glm-5.3-flash"
    assert data["models"]["schwer"]["reasoning"] == "low"
    assert data["models"]["schwer"]["think"] == "low"
    assert data["models"]["schwer"]["opt_in_only"] is True
    assert "deepseek" not in str(data["models"]).lower()
    assert "120b" not in str(data["models"])


def test_metrics(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    client.post("/v1/chat", json={"prompt": "hi"}, headers={"X-Opt-In": "false"})
    r2 = client.get("/metrics")
    assert r2.status_code == 200
    assert b"ftr_requests_total" in r2.content


def test_opt_in_schwer_glm_reasoning_low(client):
    r = client.post(
        "/v1/chat",
        json={"prompt": "Please refactor this multi-step tool pipeline with browser MCP."},
        headers={"X-Opt-In": "true"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["queue"] == "high"
    assert body["tier"] == "schwer"
    assert body["model"] == "glm-5.3-flash"
    assert body["reasoning"] == "low"
    assert body["think"] == "low"
    assert body["result"]["stub"] is True
    assert body["result"]["think"] == "low"


def test_no_opt_in_never_schwer():
    decision = decide(
        "Write a complex multi-step tool-using agent with browser MCP and long code ```def x(): pass``` " * 20,
        opt_in=False,
    )
    assert decision.tier != "schwer"
    assert decision.model != "glm-5.3-flash"
    assert decision.queue in {"low", "standard"}
    assert decision.reasoning == "off"
    assert decision.think is False


def test_config_cid_mapping():
    get_settings.cache_clear()
    s = Settings(
        MODEL_LIGHT="nemotron-3-nano",
        MODEL_MID="gpt-oss:20b",
        MODEL_HEAVY="glm-5.3-flash",
        REASONING_LIGHT="off",
        REASONING_MID="off",
        REASONING_HEAVY="low",
        DAILY_BUDGET_EUR=0,
        OLLAMA_CLOUD_API_KEY="",
    )
    assert s.model_for("leicht") == "nemotron-3-nano"
    assert s.model_for("mittel") == "gpt-oss:20b"
    assert s.model_for("schwer") == "glm-5.3-flash"
    assert s.reasoning_for("leicht") == "off"
    assert s.reasoning_for("mittel") == "off"
    assert s.reasoning_for("schwer") == "low"
    assert think_value("off") is False
    assert think_value("low") == "low"
    assert s.daily_budget_eur == 0.0


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
