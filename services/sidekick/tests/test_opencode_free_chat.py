"""The free chat route uses the official OpenCode CLI and no user key."""
import json
import stat

import pytest

from runtime.opencode_free_chat import (
    CLI_MODEL,
    FREE_MODEL,
    FREE_PROVIDER,
    attach_free_opencode_catalog,
    free_default_choice,
    is_free_official_chat,
    openrouter_free_headers,
    stream_free_reply,
)


def test_paid_opencode_routes_are_not_the_free_default():
    assert FREE_MODEL not in {"muse-spark-1.3-contributor-free", "muse-spark-1.3-contributor", "deepseek-v4-pro"}
    assert is_free_official_chat("opencode", FREE_MODEL) is True
    assert is_free_official_chat("opencode-go", "muse-spark-1.3-contributor") is False
    assert is_free_official_chat("opencode-go", FREE_MODEL) is False
    assert is_free_official_chat("opencode", "muse-spark-1.3-contributor") is False
    assert is_free_official_chat("opencode", "deepseek-v4-pro") is False
    assert is_free_official_chat("opencode", "muse-spark-1.3-contributor-free") is False
    assert is_free_official_chat("opencode-go-free", "space-bunny-free") is True
    assert is_free_official_chat("opencode-go-free", "deepseek-v4-pro") is False
    assert is_free_official_chat("opencode-go", "space-bunny-free") is False


def test_catalog_stays_unchanged_without_the_official_client(monkeypatch, tmp_path):
    monkeypatch.delenv("LASTBROWSER_OPENCODE_BIN", raising=False)
    monkeypatch.delenv("SIDEKICK_AGENT_DIR", raising=False)
    monkeypatch.setattr("runtime.opencode_free_chat.Path.home", lambda: tmp_path)
    catalog = {"groups": [{"provider_id": "openrouter", "configured": False, "models": []}]}
    assert attach_free_opencode_catalog(catalog)["groups"][0]["provider_id"] == "openrouter"
    assert free_default_choice() == ("openrouter/free", "openrouter")
    assert is_free_official_chat("openrouter", "openrouter/free") is True
    assert is_free_official_chat("openrouter", "deepseek/deepseek-chat") is False


def test_official_client_streams_text_and_continues_the_same_session(tmp_path, monkeypatch):
    log = tmp_path / "argv.jsonl"
    binary = tmp_path / "opencode"
    binary.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "open(os.environ['FREE_CHAT_ARGV_LOG'], 'a', encoding='utf-8').write(json.dumps(sys.argv) + '\\n')\n"
        "print(json.dumps({'type':'text','sessionID':'ses_testsession1','part':{'type':'text','text':'pong'}}), flush=True)\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    monkeypatch.setenv("FREE_CHAT_ARGV_LOG", str(log))
    monkeypatch.setenv("OPENROUTER_API_KEY", "should-not-pass")
    home = tmp_path / "profile"
    chunks = []
    first = stream_free_reply(profile_home=home, session_key="chat-1", prompt="Say pong", on_text=chunks.append)
    second = stream_free_reply(profile_home=home, session_key="chat-1", prompt="Again", on_text=chunks.append)
    assert first == "pong" and second == "pong"
    assert chunks == ["pong", "pong"]
    calls = [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]
    runs = [call for call in calls if "run" in call]
    assert runs[0][runs[0].index("-m") + 1] == CLI_MODEL
    assert "--session" not in runs[0]
    assert runs[1][runs[1].index("--session") + 1] == "ses_testsession1"
    assert "http" not in " ".join(runs[0])
    assert "muse-spark" not in " ".join(runs[0])
    assert "Authorization" not in openrouter_free_headers()
    child_env_file = home / "opencode-free" / "data"
    assert child_env_file.is_dir()
    # The stored session file is runtime state, not a credential.
    saved = json.loads((home / "opencode-free" / "sessions.json").read_text(encoding="utf-8"))
    assert saved[f"chat-1:{FREE_MODEL}"] == "ses_testsession1"
    assert "should-not-pass" not in log.read_text(encoding="utf-8")


def test_provider_rejection_does_not_surface_transport_headers(tmp_path, monkeypatch):
    from runtime.opencode_free_chat import FreeChatError

    def _skip_openrouter(*_args, **_kwargs):
        raise FreeChatError("openrouter skipped")

    monkeypatch.setattr("runtime.opencode_free_chat._openrouter_free", _skip_openrouter)
    binary = tmp_path / "opencode"
    binary.write_text(
        "#!/usr/bin/env python3\n"
        "import json\n"
        "print(json.dumps({'type':'error','error':{'name':'APIError','data':{'statusCode':403,"
        "'message':'rejected','responseHeaders':{'authorization':'secret'}}}}), flush=True)\n",
        encoding="utf-8",
    )
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    with pytest.raises(RuntimeError, match="rejected the free model") as caught:
        stream_free_reply(profile_home=tmp_path / "profile", session_key="chat-1", prompt="Hi", on_text=lambda _text: None)
    assert "secret" not in str(caught.value)
    assert "authorization" not in str(caught.value)


def test_configured_catalog_offers_only_the_free_model(monkeypatch, tmp_path):
    binary = tmp_path / "opencode"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    catalog = attach_free_opencode_catalog({"groups": []})
    group = catalog["groups"][0]
    assert group["provider_id"] == FREE_PROVIDER
    assert group["configured"] is True
    assert group["models"][0]["id"] == FREE_MODEL
    assert free_default_choice() == (FREE_MODEL, FREE_PROVIDER)


def test_connection_free_group_is_not_replaced_by_the_client_list(monkeypatch, tmp_path):
    binary = tmp_path / "opencode"
    binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    binary.chmod(binary.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("LASTBROWSER_OPENCODE_BIN", str(binary))
    catalog = attach_free_opencode_catalog({"groups": [{
        "provider_id": "opencode-go-free",
        "provider": "OpenCode Go Free",
        "models": [{"id": "space-bunny-free", "label": "Space Bunny Free"}],
    }]})
    assert [group["provider_id"] for group in catalog["groups"]] == ["opencode-go-free"]
    assert catalog["groups"][0]["models"][0]["id"] == "space-bunny-free"
