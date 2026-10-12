"""Device inference routing contracts; no network or model calls."""
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest


def _canonical_ai_agent():
    # The CLI can register a compatibility shim under the run_agent module
    # name during other tests. Load the in-tree implementation explicitly.
    source = Path(__file__).resolve().parents[1] / "run_agent.py"
    spec = importlib.util.spec_from_file_location("_opencode_device_test_run_agent", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.AIAgent


@pytest.fixture
def device(monkeypatch):
    connection = {"api_key": "test-" + "device-credential", "base_url": "https://opencode.ai/inference/openai/v1",
                  "api_mode": "chat_completions", "model": "configured-model", "models": ["configured-model"],
                  "headers": {"User-Agent": "LastBrowser/0.1.55", "x-opencode-session": "chat-session"}}
    module = SimpleNamespace(has_credentials=Mock(return_value=True),
                             resolve_connection=Mock(return_value=connection),
                             discovered_models=Mock(return_value=["configured-model"]))
    monkeypatch.setitem(sys.modules, "cli.opencode_device", module)
    return module


def test_device_credentials_do_not_use_legacy_environment_or_endpoint(device, monkeypatch):
    from cli.auth import resolve_api_key_provider_credentials
    monkeypatch.setenv("OPENCODE_GO_BASE_URL", "https://invalid.example")
    result = resolve_api_key_provider_credentials("opencode-go")
    assert result["source"] == "opencode_device"
    assert result["base_url"] == "https://opencode.ai/inference/openai/v1"
    assert result["api_mode"] == "chat_completions"


def test_failed_device_refresh_cannot_fall_back_to_legacy_key(device):
    from cli.auth import resolve_api_key_provider_credentials
    device.resolve_connection.side_effect = PermissionError("login required")
    with pytest.raises(PermissionError, match="login required"):
        resolve_api_key_provider_credentials("opencode-go")


def test_device_catalog_never_falls_back_to_hardcoded_model(device):
    from cli.models import provider_model_ids, get_default_model_for_provider, opencode_model_api_mode, opencode_provider_for_model
    assert provider_model_ids("opencode-go") == ["configured-model"]
    assert get_default_model_for_provider("opencode-go") == "configured-model"
    assert opencode_model_api_mode("opencode-go", "configured-model") == "chat_completions"
    assert opencode_provider_for_model("opencode-go", "claude-static-model") == "opencode-go"
    device.discovered_models.return_value = []
    assert provider_model_ids("opencode-go") == []
    assert get_default_model_for_provider("opencode-go") == ""


def test_refresh_uses_real_chat_session_and_updates_sdk_headers(device):
    AIAgent = _canonical_ai_agent()
    agent = AIAgent.__new__(AIAgent)
    agent.provider, agent.model, agent.api_mode = "opencode-go", "configured-model", "chat_completions"
    agent.session_id = "chat-session"
    agent._client_kwargs = {}
    agent._replace_primary_openai_client = Mock(return_value=True)
    agent._refresh_opencode_device_connection()
    device.resolve_connection.assert_called_once_with("opencode-go", model="configured-model", session_id="chat-session")
    assert agent._client_kwargs["default_headers"]["x-opencode-session"] == "chat-session"
    assert agent._client_kwargs["api_key"] == device.resolve_connection.return_value["api_key"]


def test_refresh_rejects_changed_protocol_before_rebuilding_sdk(device):
    AIAgent = _canonical_ai_agent()
    agent = AIAgent.__new__(AIAgent)
    agent.provider, agent.model, agent.api_mode, agent.session_id = "opencode-go", "configured-model", "anthropic_messages", "chat-session"
    agent._replace_primary_openai_client = Mock()
    with pytest.raises(PermissionError, match="configuration_changed"):
        agent._refresh_opencode_device_connection()
    agent._replace_primary_openai_client.assert_not_called()


def test_runtime_resolution_uses_config_protocol_and_ignores_stale_override(device, monkeypatch):
    import cli.runtime_provider as runtime
    monkeypatch.setattr(runtime, "_get_model_config", lambda: {"provider": "opencode-go", "default": "configured-model", "base_url": "https://invalid.example"})
    result = runtime.resolve_runtime_provider(requested="opencode-go", target_model="configured-model",
        explicit_base_url="https://invalid.example", explicit_api_key="legacy-" + "credential")
    assert result["base_url"] == "https://opencode.ai/inference/openai/v1"
    assert result["api_mode"] == "chat_completions"
    assert result["source"] == "opencode_device"
    device.resolve_connection.assert_called_once_with("opencode-go", model="configured-model")


def test_anthropic_device_client_uses_bearer_and_own_identity(monkeypatch):
    from runtime import anthropic_adapter as adapter
    constructor = Mock(return_value=object())
    monkeypatch.setattr(adapter, "_get_anthropic_sdk", lambda: SimpleNamespace(Anthropic=constructor))
    headers = {"User-Agent": "LastBrowser/0.1.55", "x-opencode-session": "chat-session"}
    adapter.build_anthropic_client("device-" + "credential", "https://opencode.ai/inference/anthropic/v1", default_headers=headers)
    kwargs = constructor.call_args.kwargs
    assert kwargs["auth_token"] == "device-" + "credential"
    assert "api_key" not in kwargs
    assert kwargs["default_headers"]["User-Agent"] == "LastBrowser/0.1.55"
    assert kwargs["default_headers"]["x-opencode-session"] == "chat-session"
    assert "x-app" not in kwargs["default_headers"]
    assert kwargs["base_url"] == "https://opencode.ai/inference/anthropic"


def test_anthropic_uses_the_bundled_sdks_exported_timeout(monkeypatch):
    from runtime import anthropic_adapter as adapter
    constructor = Mock(return_value=object())
    sdk_timeout = Mock(return_value=object())
    monkeypatch.setattr(adapter, "_get_anthropic_sdk", lambda: SimpleNamespace(Anthropic=constructor, Timeout=sdk_timeout))
    adapter.build_anthropic_client("mock-" + "credential", "https://opencode.ai/inference/anthropic/v1", timeout=30)
    sdk_timeout.assert_called_once_with(timeout=30.0, connect=10.0)
    assert constructor.call_args.kwargs["timeout"] is sdk_timeout.return_value


@pytest.mark.parametrize("async_mode", [False, True])
def test_auxiliary_real_sdk_uses_workspace_endpoint_and_session_headers(device, async_mode):
    from runtime import auxiliary_client as auxiliary
    auxiliary.set_runtime_main("opencode-go", "configured-model", session_id="chat-session")
    try:
        client, model = auxiliary.resolve_provider_client("opencode-go", model="configured-model",
            explicit_base_url="https://invalid.example", explicit_api_key="legacy-" + "credential", async_mode=async_mode)
        assert model == "configured-model"
        assert str(client.base_url).rstrip("/") == "https://opencode.ai/inference/openai/v1"
        assert client.api_key == "test-" + "device-credential"
        assert client.default_headers["User-Agent"] == "LastBrowser/0.1.55"
        assert client.default_headers["x-opencode-session"] == "chat-session"
        device.resolve_connection.assert_called_once_with("opencode-go", model="configured-model", session_id="chat-session")
        if async_mode:
            import asyncio
            asyncio.run(client.close())
        else:
            client.close()
    finally:
        auxiliary.clear_runtime_main()


def test_auxiliary_device_requires_task_local_session(device):
    from contextvars import Context
    from runtime import auxiliary_client as auxiliary
    auxiliary.set_runtime_main("opencode-go", "configured-model", session_id="other-chat")
    try:
        with pytest.raises(PermissionError, match="session_required"):
            Context().run(auxiliary.resolve_provider_client, "opencode-go", model="configured-model")
        device.resolve_connection.assert_not_called()
    finally:
        auxiliary.clear_runtime_main()
