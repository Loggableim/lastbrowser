from __future__ import annotations

import importlib
import builtins
import json
from pathlib import Path
import cli.auth as auth
from cli.models import normalize_opencode_model_id, opencode_model_api_mode, opencode_provider_for_model
import cli.runtime_provider as runtime_provider
from web.api import providers as provider_api
from runtime.auxiliary_client import _API_KEY_PROVIDER_AUX_MODELS_FALLBACK
from runtime.transports import ChatCompletionsTransport
from types import SimpleNamespace


def test_opencode_go_keeps_deepseek_model_ids():
    assert normalize_opencode_model_id("opencode-go", "deepseek-v4-flash") == "deepseek-v4-flash"
    assert normalize_opencode_model_id("opencode-go", "opencode-go/deepseek-v4-flash") == "deepseek-v4-flash"
    assert normalize_opencode_model_id("opencode-go", "deepseek/deepseek-v4-flash") == "deepseek-v4-flash"
    assert opencode_model_api_mode("opencode-go", "deepseek-v4-flash") == "chat_completions"
    # This model is listed by both current OpenCode catalogs, so a caller's
    # provider selection disambiguates which endpoint should receive it.
    assert opencode_provider_for_model("opencode-zen", "deepseek-v4-flash") == "opencode-zen"
    assert opencode_provider_for_model("opencode-go", "deepseek-v4-flash") == "opencode-go"


def test_opencode_cli_credentials_are_profile_scoped_for_zen_and_go(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "get_sidekick_home", lambda: tmp_path)
    auth_dir = tmp_path / "opencode-data" / "opencode"
    auth_dir.mkdir(parents=True)
    (auth_dir / "auth.json").write_text(json.dumps({
        "opencode": {"type": "api", "key": "zen-test-key"},
        "opencode-go": {"type": "api", "key": "go-test-key"},
    }), encoding="utf-8")

    zen = auth.get_api_key_provider_status("opencode-zen")
    go = auth.get_api_key_provider_status("opencode-go")
    assert zen["configured"] is True
    assert zen["key_source"] == "opencode_cli"
    assert go["configured"] is True
    assert go["key_source"] == "opencode_cli"
    assert auth.resolve_api_key_provider_credentials("opencode-zen")["api_key"] == "zen-test-key"
    assert auth.resolve_api_key_provider_credentials("opencode-go")["api_key"] == "go-test-key"


def test_opencode_cli_does_not_read_global_auth_store(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "get_sidekick_home", lambda: tmp_path / "profile")
    global_data = tmp_path / "global" / "opencode"
    global_data.mkdir(parents=True)
    (global_data / "auth.json").write_text(json.dumps({
        "opencode": {"type": "api", "key": "global-only-test-key"},
    }), encoding="utf-8")
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "global"))

    status = auth.get_api_key_provider_status("opencode-zen")
    assert status["configured"] is False


def test_provider_list_sees_profile_bound_opencode_cli_credentials(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "get_sidekick_home", lambda: tmp_path)
    auth_dir = tmp_path / "opencode-data" / "opencode"
    auth_dir.mkdir(parents=True)
    (auth_dir / "auth.json").write_text(json.dumps({
        "opencode": {"type": "api", "key": "zen-test-key"},
    }), encoding="utf-8")

    assert provider_api._provider_has_key("opencode-zen") is True


def test_opencode_go_aux_default_has_large_context_for_compression():
    assert _API_KEY_PROVIDER_AUX_MODELS_FALLBACK["opencode-go"] == "deepseek-v4-flash"
    assert opencode_model_api_mode("opencode-go", "glm-5.1") == "chat_completions"


def test_runtime_provider_preserves_provider_for_shared_deepseek_flash(monkeypatch):
    monkeypatch.setattr(runtime_provider, "resolve_provider", lambda *args, **kwargs: "opencode-zen")
    monkeypatch.setattr(
        runtime_provider,
        "_get_model_config",
        lambda: {
            "provider": "opencode-zen",
            "default": "deepseek-v4-flash",
            "base_url": "https://opencode.ai/zen/v1",
        },
    )
    monkeypatch.setattr(runtime_provider, "load_pool", lambda provider: None)
    monkeypatch.setattr(
        runtime_provider,
        "resolve_api_key_provider_credentials",
        lambda provider: {
            "api_key": "test-key",
            "base_url": runtime_provider.PROVIDER_REGISTRY[provider].inference_base_url,
            "source": "test",
        },
    )

    runtime = runtime_provider.resolve_runtime_provider(
        requested="opencode-zen",
        target_model="deepseek-v4-flash",
    )

    assert runtime["provider"] == "opencode-zen"
    assert runtime["api_mode"] == "chat_completions"
    assert runtime["base_url"] == "https://opencode.ai/zen/v1"


def test_cron_scheduler_uses_modern_runtime_provider_import():
    source = Path("runtime/cron/scheduler.py").read_text(encoding="utf-8")

    assert "from cli.runtime_provider import (" in source
    assert "from runtime._compat.shim_cli.runtime_provider import" not in source


def test_cron_scheduler_prefers_direct_tools_config_import():
    source = Path("runtime/cron/scheduler.py").read_text(encoding="utf-8")

    assert "from cli.tools_config import _get_platform_tools" in source
    assert source.index("from cli.tools_config import _get_platform_tools") < source.index("from runtime._compat.shim_cli.tools_config import _get_platform_tools")


def test_cron_tools_config_shim_exports_platform_tool_resolver():
    mod = importlib.import_module("runtime._compat.shim_cli.tools_config")

    assert callable(mod._get_platform_tools)


def test_cron_tools_config_shim_resolves_without_cli_tools_config(monkeypatch):
    mod = importlib.import_module("runtime._compat.shim_tools_config")
    real_import = builtins.__import__

    def blocked_import(name, *args, **kwargs):
        if name == "cli.tools_config":
            raise ImportError("blocked cli.tools_config")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked_import)

    resolved = mod._get_platform_tools({}, "cron")

    assert "terminal" in resolved
    assert "cronjob" in resolved
    assert "moa" not in resolved


def test_chat_completions_transport_validates_choices_response():
    class Response:
        choices = [object()]

    assert ChatCompletionsTransport().validate_response(Response()) is True
    assert ChatCompletionsTransport().validate_response(None) is False


def test_chat_completions_transport_normalizes_first_choice_message():
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content="ok", tool_calls=None),
                finish_reason="stop",
            )
        ]
    )

    message = ChatCompletionsTransport().normalize_response(response)

    assert message.content == "ok"
    assert message.tool_calls is None
    assert message.finish_reason == "stop"
