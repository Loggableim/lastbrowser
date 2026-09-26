"""Unit tests for Smart Track Single-Track Orchestrator."""
import os
import json
import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from runtime.smart_track_orchestrator import (
    classify_smart_model,
    detect_prompt_intent,
    build_model_wall,
    resolve_smart_track_model,
    load_smart_track_config,
    save_smart_track_config,
    run_smart_track_turn,
    schedule_model_wall_scan,
    get_model_wall_scan_state,
)


def test_detect_prompt_intent():
    # Coding
    assert detect_prompt_intent("Schreibe eine Python function um Primzahlen zu finden") == "coding"
    assert detect_prompt_intent("```typescript\nconst x = 1;\n```") == "coding"
    assert detect_prompt_intent("Fix the bug in SQL select * from users") == "coding"

    # Web / Search
    assert detect_prompt_intent("Was sind die aktuellen News und das Wetter heute?") == "web"
    assert detect_prompt_intent("Suche die Dokumentation zu https://example.com") == "web"

    # Reasoning
    assert detect_prompt_intent("Warum ist funktionale Programmierung besser? Vergleiche Trade-offs") == "reasoning"
    assert detect_prompt_intent("Beweise mathematisch die Korrektheit des Algorithmus") == "reasoning"

    # General
    assert detect_prompt_intent("Hallo wie geht es dir?") == "general"
    assert detect_prompt_intent("") == "general"


def test_classify_smart_model():
    tier, tags = classify_smart_model("gemini-2.5-flash-lite")
    assert tier == "low"
    assert "fast" in tags

    tier, tags = classify_smart_model("gemini-2.5-flash")
    assert tier == "medium"
    assert "web" in tags

    tier, tags = classify_smart_model("gemini-2.5-pro")
    assert tier == "high"
    assert "reasoning" in tags

    tier, tags = classify_smart_model("qwen2.5-coder:7b")
    assert tier == "low"
    assert "coding" in tags
    assert "fast" in tags

    tier, tags = classify_smart_model("deepseek-r1:70b")
    assert tier == "high"
    assert "reasoning" in tags


def test_build_model_wall():
    mock_catalog = {
        "groups": [
            {
                "provider_id": "google-gemini-cli",
                "provider": "Google Gemini",
                "models": [
                    {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite"},
                    {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
                    {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
                ],
            }
        ]
    }
    with patch("web.api.config.get_available_models", return_value=mock_catalog):
        wall = build_model_wall()
        assert "low" in wall
        assert "medium" in wall
        assert "high" in wall

        assert wall["low"]["default"] == "gemini-2.5-flash-lite"
        assert wall["medium"]["default"] == "gemini-2.5-flash"
        assert wall["high"]["default"] == "gemini-2.5-pro"


def test_smart_track_model_wall_preserves_ollama_model_size_tags():
    catalog = {
        "groups": [{
            "provider_id": "ollama",
            "provider": "Ollama",
            "models": [
                {"id": "qwen3:4b", "name": "Qwen 3 4B"},
                {"id": "deepseek-r1:70b", "name": "DeepSeek R1 70B"},
            ],
        }]
    }
    with patch("web.api.config.get_available_models", return_value=catalog):
        wall = build_model_wall()
    assert wall["low"]["models"][0]["id"] == "qwen3:4b"
    assert wall["high"]["models"][0]["id"] == "deepseek-r1:70b"


def test_empty_model_catalog_does_not_inject_gemini_fallbacks():
    with patch("web.api.config.get_available_models", return_value={"groups": []}):
        wall = build_model_wall()
    assert all(tier["models"] == [] and tier["default"] == "" for tier in wall.values())
    with patch("runtime.smart_track_orchestrator.build_model_wall", return_value=wall):
        with pytest.raises(RuntimeError, match="keine aktuell verfügbaren Modelle"):
            resolve_smart_track_model(effort="medium", prompt="Hello")


def test_smart_track_config_persistence(tmp_path):
    mock_file = tmp_path / "smart_track.json"
    with patch("runtime.smart_track_orchestrator.get_smart_track_config_path", return_value=mock_file):
        cfg = load_smart_track_config(reload=True)
        assert cfg["effort"] == "medium"

        save_smart_track_config({"effort": "high", "preplan_on_high": False, "overrides": {"high": "my-custom-model"}})
        updated = load_smart_track_config(reload=True)
        assert updated["effort"] == "high"
        assert updated["preplan_on_high"] is False
        assert updated["overrides"]["high"] == "my-custom-model"


def test_automatic_model_scan_respects_disabled_config(tmp_path):
    config_file = tmp_path / "smart_track.json"
    config_file.write_text(json.dumps({"auto_scan": False}), encoding="utf-8")
    with patch("runtime.smart_track_orchestrator.get_smart_track_config_path", return_value=config_file), \
         patch("runtime.smart_track_orchestrator.build_model_wall") as build:
        assert schedule_model_wall_scan() is False
        build.assert_not_called()


def test_forced_model_scan_runs_even_when_automatic_scan_is_disabled(tmp_path):
    config_file = tmp_path / "smart_track.json"
    config_file.write_text(json.dumps({"auto_scan": False}), encoding="utf-8")
    started = threading.Event()
    release = threading.Event()

    def scan():
        started.set()
        assert release.wait(2)
        return {"low": {"models": []}}

    with patch("runtime.smart_track_orchestrator.get_smart_track_config_path", return_value=config_file), \
         patch("runtime.smart_track_orchestrator.build_model_wall", side_effect=scan):
        assert schedule_model_wall_scan(force=True) is True
        assert started.wait(1)
        assert get_model_wall_scan_state()["status"] == "scanning"
        release.set()
        deadline = time.monotonic() + 2
        while get_model_wall_scan_state()["status"] == "scanning" and time.monotonic() < deadline:
            time.sleep(0.01)
        assert get_model_wall_scan_state()["status"] == "complete"


def test_automatic_model_scan_is_background_and_records_errors():
    started = threading.Event()
    release = threading.Event()

    def scan():
        started.set()
        assert release.wait(2)
        raise RuntimeError("catalog unavailable")

    with patch("runtime.smart_track_orchestrator.load_smart_track_config", return_value={"auto_scan": True}), \
         patch("runtime.smart_track_orchestrator.build_model_wall", side_effect=scan):
        before = time.monotonic()
        assert schedule_model_wall_scan() is True
        assert time.monotonic() - before < 0.5
        assert started.wait(1)
        release.set()
        deadline = time.monotonic() + 2
        while get_model_wall_scan_state()["status"] == "scanning" and time.monotonic() < deadline:
            time.sleep(0.01)
        assert get_model_wall_scan_state() == {"status": "failed", "last_error": "catalog unavailable"}


@pytest.mark.parametrize("path", ["/api/providers", "/api/providers/delete"])
def test_provider_credential_routes_schedule_auto_scan(monkeypatch, path):
    import io
    from urllib.parse import urlparse
    from web.api import routes
    from runtime import smart_track_orchestrator as orchestrator

    body = json.dumps({"provider": "ollama", "api_key": "local-test-key"}).encode("utf-8")
    class Handler:
        headers = {"Content-Length": str(len(body)), "Content-Type": "application/json", "Host": "127.0.0.1"}
        client_address = ("127.0.0.1", 12345)
        def __init__(self):
            self.rfile = io.BytesIO(body)
            self.wfile = io.BytesIO()
            self.status_code = None
        def send_response(self, status):
            self.status_code = status
        def send_header(self, name, value):
            pass
        def end_headers(self):
            pass

    scheduled = []
    monkeypatch.setattr(orchestrator, "schedule_model_wall_scan", lambda: scheduled.append(True) or True)
    monkeypatch.setattr(routes, "set_provider_key", lambda *args: {"ok": True})
    monkeypatch.setattr(routes, "remove_provider_key", lambda *args: {"ok": True})
    handler = Handler()
    routes.handle_post(handler, urlparse(path))
    assert handler.status_code == 200
    assert scheduled == [True]


def test_explicit_model_wall_scan_runs_when_auto_scan_disabled(monkeypatch):
    import io
    from urllib.parse import urlparse
    from web.api import routes
    from runtime import smart_track_orchestrator as orchestrator

    class Handler:
        headers = {"Content-Length": "0", "Content-Type": "application/json", "Host": "127.0.0.1"}
        client_address = ("127.0.0.1", 12345)
        def __init__(self):
            self.rfile = io.BytesIO(b"")
            self.wfile = io.BytesIO()
            self.status_code = None
        def send_response(self, status):
            self.status_code = status
        def send_header(self, name, value):
            pass
        def end_headers(self):
            pass

    expected_wall = {"low": {"models": []}}
    monkeypatch.setattr(orchestrator, "build_model_wall", lambda: expected_wall)
    monkeypatch.setattr(orchestrator, "load_smart_track_config", lambda reload=False: {"auto_scan": False})
    handler = Handler()
    routes.handle_post(handler, urlparse("/api/smart-track/scan"))
    assert handler.status_code == 200
    payload = json.loads(handler.wfile.getvalue().decode("utf-8"))
    assert payload["ok"] is True
    assert payload["wall"] == expected_wall


def test_resolve_smart_track_model():
    mock_wall = {
        "low": {
            "default": "gemini-2.5-flash-lite",
            "coding": "qwen:7b-coder",
            "web": "gemini-2.5-flash-lite",
            "reasoning": "gemini-2.5-flash-lite",
            "models": [
                {"id": "gemini-2.5-flash-lite", "name": "Flash Lite", "provider": "google", "tags": ["fast"]},
                {"id": "qwen:7b-coder", "name": "Qwen Coder 7B", "provider": "ollama", "tags": ["coding", "fast"]},
            ],
        },
        "medium": {
            "default": "gemini-2.5-flash",
            "coding": "gemini-2.5-flash",
            "web": "gemini-2.5-flash",
            "reasoning": "gemini-2.5-flash",
            "models": [
                {"id": "gemini-2.5-flash", "name": "Flash", "provider": "google", "tags": ["web"]},
            ],
        },
        "high": {
            "default": "gemini-2.5-pro",
            "coding": "gemini-2.5-pro",
            "web": "gemini-2.5-pro",
            "reasoning": "gemini-2.5-pro",
            "models": [
                {"id": "gemini-2.5-pro", "name": "Pro", "provider": "google", "tags": ["reasoning"]},
            ],
        },
    }

    with patch("runtime.smart_track_orchestrator.build_model_wall", return_value=mock_wall):
        # Coding intent on low tier matches qwen:7b-coder
        res = resolve_smart_track_model(effort="low", prompt="def test(): pass")
        assert res["model"] == "qwen:7b-coder"
        assert res["tier"] == "low"
        assert res["intent"] == "coding"

        # High tier matches gemini-2.5-pro
        res_high = resolve_smart_track_model(effort="high", prompt="Warum ist das so?")
        assert res_high["model"] == "gemini-2.5-pro"
        assert res_high["tier"] == "high"
        assert res_high["intent"] == "reasoning"


def test_run_smart_track_turn_medium():
    session = MagicMock()
    session.messages = []
    events = []

    def mock_put(ev, data):
        events.append((ev, data))

    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = "Hier ist die Antwort für Medium Effort."

    with patch("runtime.auxiliary_client.call_llm", return_value=mock_resp), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="Hier ist die Antwort für Medium Effort."):
        result = run_smart_track_turn(
            session=session,
            prompt="Erkläre kurz DNS",
            effort="medium",
            stream_put=mock_put,
        )

        assert result["content"] == "Hier ist die Antwort für Medium Effort."
        assert len(session.messages) == 1
        msg = session.messages[0]
        assert msg["role"] == "assistant"
        assert msg["content"] == "Hier ist die Antwort für Medium Effort."
        assert "smartTrack" in msg
        assert msg["smartTrack"]["effort"] == "medium"

        # Check emitted events
        event_names = [e[0] for e in events]
        assert "smart_track_routed" in event_names
        assert "smart_track_step" in event_names
        assert "delta" in event_names
        assert "smart_track_complete" in event_names


def test_run_smart_track_turn_high_preplan():
    session = MagicMock()
    session.messages = []
    events = []

    def mock_put(ev, data):
        events.append((ev, data))

    # Preplan call returns structured steps; main call returns final answer
    calls = []
    def mock_call_llm(*args, **kwargs):
        calls.append(kwargs)
        resp = MagicMock()
        resp.choices = [MagicMock()]
        if len(calls) == 1:
            resp.choices[0].message.content = "1. Zielanalyse\n2. Randbedingungen"
        else:
            resp.choices[0].message.content = "Finale tiefgehende Begründung."
        return resp

    def mock_extract(resp):
        return resp.choices[0].message.content

    wall = {
        "low": {"default": "qwen3:4b", "models": [{"id": "qwen3:4b", "name": "Qwen", "provider": "ollama"}]},
        "medium": {"default": "gemini-flash", "models": [{"id": "gemini-flash", "name": "Gemini Flash", "provider": "google-gemini-cli"}]},
        "high": {"default": "gemini-pro", "reasoning": "gemini-pro", "models": [{"id": "gemini-pro", "name": "Gemini Pro", "provider": "google-gemini-cli"}]},
    }

    with patch("runtime.auxiliary_client.call_llm", side_effect=mock_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=mock_extract), \
         patch("runtime.smart_track_orchestrator.build_model_wall", return_value=wall):
        result = run_smart_track_turn(
            session=session,
            prompt="Analysiere die Systemarchitektur",
            effort="high",
            stream_put=mock_put,
            config={"preplan_on_high": True},
        )

        assert result["content"] == "Finale tiefgehende Begründung."
        assert len(calls) == 2  # Preplan + Main execution
        assert calls[0].get("provider") == "ollama"
        assert calls[0].get("model") == "qwen3:4b"
        assert calls[1].get("provider") == "google-gemini-cli"
        assert calls[1].get("model") == "gemini-pro"

        event_names = [e[0] for e in events]
        assert "smart_track_preplan" in event_names
        assert "smart_track_complete" in event_names
        assert session.messages[0]["smartTrack"]["effort"] == "high"
        assert "preplan" in session.messages[0]["smartTrack"]
