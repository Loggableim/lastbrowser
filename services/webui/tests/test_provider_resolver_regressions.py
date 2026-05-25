import io
import json
import sys
import types
from pathlib import Path

import api.config as config


def _reset_models_cache():
    config.invalidate_models_cache()
    with config._available_models_cache_lock:
        config._available_models_cache = None
        config._available_models_cache_ts = 0.0
        if hasattr(config, "_available_models_cache_source_fingerprint"):
            config._available_models_cache_source_fingerprint = None


def _isolate_config(tmp_path, monkeypatch, config_text="", auth_payload=None):
    hermes_home = tmp_path / "hermes-home"
    hermes_home.mkdir()
    config_path = hermes_home / "config.yaml"
    config_path.write_text(config_text, encoding="utf-8")
    if auth_payload is not None:
        (hermes_home / "auth.json").write_text(
            json.dumps(auth_payload),
            encoding="utf-8",
        )

    monkeypatch.setenv("HERMES_CONFIG_PATH", str(config_path))
    import api.profiles as profiles

    monkeypatch.setattr(profiles, "get_active_hermes_home", lambda: hermes_home)
    config.reload_config()
    _reset_models_cache()
    return hermes_home


def _install_runtime_provider(monkeypatch, payload):
    fake_pkg = types.ModuleType("hermes_cli")
    fake_pkg.__path__ = []
    fake_runtime = types.ModuleType("hermes_cli.runtime_provider")
    fake_runtime.resolve_runtime_provider = lambda requested=None: dict(payload)
    monkeypatch.setitem(sys.modules, "hermes_cli", fake_pkg)
    monkeypatch.setitem(sys.modules, "hermes_cli.runtime_provider", fake_runtime)


def test_resolve_active_provider_context_prefers_config_over_auth_and_runtime(tmp_path, monkeypatch):
    _isolate_config(
        tmp_path,
        monkeypatch,
        "model:\n  provider: anthropic\n  default: claude-sonnet-4.6\n",
        {"active_provider": "openai-codex"},
    )
    _install_runtime_provider(
        monkeypatch,
        {"provider": "openrouter", "model": "anthropic/claude-sonnet-4.6"},
    )

    context = config.resolve_active_provider_context()

    assert context["provider"] == "anthropic"
    assert context["model"] == "claude-sonnet-4.6"
    assert context["source"] == "config"


def test_resolve_active_provider_context_falls_back_to_auth_active_provider(tmp_path, monkeypatch):
    _isolate_config(
        tmp_path,
        monkeypatch,
        "model:\n  default: gpt-5.4\n",
        {"active_provider": "openai-codex"},
    )
    _install_runtime_provider(
        monkeypatch,
        {"provider": "openrouter", "model": "anthropic/claude-sonnet-4.6"},
    )

    context = config.resolve_active_provider_context()

    assert context["provider"] == "openai-codex"
    assert context["model"] == "gpt-5.4"
    assert context["source"] == "auth"


def test_resolve_active_provider_context_falls_back_to_runtime_status(tmp_path, monkeypatch):
    _isolate_config(tmp_path, monkeypatch, "model:\n  default: kimi-k2.6\n", {})
    _install_runtime_provider(
        monkeypatch,
        {
            "provider": "opencode-go",
            "model": "glm-5.1",
            "base_url": "https://example.invalid/v1",
        },
    )

    context = config.resolve_active_provider_context()

    assert context["provider"] == "opencode-go"
    assert context["model"] == "glm-5.1"
    assert context["base_url"] == "https://example.invalid/v1"
    assert context["source"] == "runtime"


def test_get_available_models_uses_runtime_provider_fallback(tmp_path, monkeypatch):
    _isolate_config(tmp_path, monkeypatch, "model:\n  default: glm-5.1\n", {})
    _install_runtime_provider(
        monkeypatch,
        {"provider": "opencode-go", "model": "glm-5.1"},
    )
    fake_models = types.ModuleType("hermes_cli.models")
    fake_models.list_available_providers = lambda: []
    fake_models.provider_model_ids = lambda pid: []
    fake_auth = types.ModuleType("hermes_cli.auth")
    fake_auth.get_auth_status = lambda pid: {}
    monkeypatch.setitem(sys.modules, "hermes_cli.models", fake_models)
    monkeypatch.setitem(sys.modules, "hermes_cli.auth", fake_auth)

    result = config.get_available_models()

    assert result["active_provider"] == "opencode-go"
    assert any(group.get("provider_id") == "opencode-go" for group in result["groups"])


class _Handler:
    headers = {}

    def __init__(self):
        self.status = None
        self.body = None
        self.wfile = io.BytesIO()

    def send_response(self, status):
        self.status = status

    def send_header(self, *_args):
        pass

    def end_headers(self):
        pass


def test_chat_start_returns_structured_setup_error_when_provider_missing(monkeypatch):
    import api.routes as routes

    class Session:
        session_id = "s1"
        workspace = str(Path.cwd())
        model = ""
        model_provider = None
        messages = []
        context_messages = []
        pending_user_message = None

    monkeypatch.setattr(routes, "get_session", lambda _sid: Session())
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda raw: Path.cwd())
    monkeypatch.setattr(
        routes,
        "_resolve_compatible_session_model_state",
        lambda *_args, **_kwargs: ("", None, False),
    )

    called = {"start": False}

    def _unexpected_start(*_args, **_kwargs):
        called["start"] = True
        return {"stream_id": "should-not-start"}

    monkeypatch.setattr(routes, "_start_chat_stream_for_session", _unexpected_start)

    handler = _Handler()
    routes._handle_chat_start(
        handler,
        {"session_id": "s1", "message": "hello", "workspace": str(Path.cwd())},
    )
    payload = json.loads(handler.wfile.getvalue().decode("utf-8"))

    assert handler.status == 409
    assert payload["error"]["code"] == "llm_provider_not_configured"
    assert payload["setup_required"] is True
    assert "No LLM provider configured" not in json.dumps(payload)
    assert called["start"] is False


def test_chat_with_agent_returns_setup_required_without_fallback(monkeypatch):
    import api.agents as agents

    appended = []

    monkeypatch.setattr(
        agents,
        "get_agent",
        lambda slug: {
            "name": "Research Agent",
            "slug": slug,
            "personality": "",
        },
    )
    monkeypatch.setattr(agents, "create_agent_session", lambda _slug, title="": {"id": "sess-1"})
    monkeypatch.setattr(agents, "append_agent_message", lambda *args, **kwargs: appended.append((args, kwargs)))
    monkeypatch.setattr(agents, "get_agent_memory", lambda _slug: [])
    monkeypatch.setattr(agents, "get_agent_session", lambda *_args, **_kwargs: {"messages": []})
    monkeypatch.setattr(agents, "log_activity", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        agents,
        "_load_llm_config",
        lambda: {"api_key": "", "provider": "", "model": "", "base_url": ""},
    )

    result = agents.chat_with_agent("research", "solar punk architecture")

    assert result["setup_required"] is True
    assert result["response"] is None
    assert result["error"]["code"] == "llm_provider_not_configured"
    assert len(appended) == 1
    assert appended[0][0][1] == "sess-1"
    assert appended[0][0][2] == "user"


def test_agent_workspace_llm_config_uses_shared_provider_context(tmp_path, monkeypatch):
    import api.agent_workspace as agent_workspace

    _isolate_config(
        tmp_path,
        monkeypatch,
        "model:\n  provider: opencode-go\n  default: glm-5.1\n  base_url: https://gateway.example/v1\n  api_key: cfg-secret\n",
        {},
    )
    agent_workspace._LLM_CACHE.clear()

    cfg = agent_workspace._get_llm_config()

    assert cfg["provider"] == "opencode-go"
    assert cfg["model"] == "glm-5.1"
    assert cfg["base_url"] == "https://gateway.example/v1"
    assert cfg["api_key"] == "cfg-secret"
