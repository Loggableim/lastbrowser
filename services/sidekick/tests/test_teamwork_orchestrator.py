"""Unit tests for the Teamwork Multi-Agent Orchestrator."""
import os
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from runtime.teamwork_orchestrator import (
    DEFAULT_TEAMWORK_CONFIG,
    classify_model_tier,
    evaluate_task_complexity,
    get_teamwork_config_path,
    get_teamwork_model_pool,
    load_teamwork_config,
    resolve_team_plan,
    save_teamwork_config,
    run_teamwork_turn,
    _scaled_worker_target,
)


@pytest.fixture(autouse=True)
def reset_config_cache():
    import runtime.teamwork_orchestrator as to
    to._CACHED_CONFIG = None
    yield
    to._CACHED_CONFIG = None


def test_classify_model_tier():
    assert classify_model_tier("gemini-2.5-pro") == "quality"
    assert classify_model_tier("deepseek-r1:70b") == "quality"
    assert classify_model_tier("claude-3-5-sonnet") == "quality"
    assert classify_model_tier("gemini-2.5-flash-lite") == "fast"
    assert classify_model_tier("llama3.2:3b") == "fast"
    assert classify_model_tier("gemini-2.5-flash") == "balanced"
    assert classify_model_tier("qwen2.5-coder:14b") == "balanced"


def test_evaluate_task_complexity():
    assert evaluate_task_complexity("Hallo, wie geht es dir?") == 1
    complex_prompt = (
        "Refaktoriere bitte die gesamte Architektur des Backends und implementiere "
        "einen Multi-Agent Orchestrator mit Consensus & Debate. "
        "Hier ist der Code:\n```python\ndef test(): pass\n```\n"
        "Vergleiche die Performance und optimiere die Schnittstellen."
    )
    assert evaluate_task_complexity(complex_prompt) >= 4


@pytest.mark.parametrize(
    ("cap", "complexity", "expected"),
    [(1, 5, 1), (4, 1, 2), (4, 5, 4), (8, 1, 2), (8, 3, 5), (8, 5, 8), (20, 5, 8)],
)
def test_auto_scale_uses_configured_worker_cap(cap, complexity, expected):
    assert _scaled_worker_target(complexity, cap) == expected


def test_config_load_and_save():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / "teamwork.json"
        with patch("runtime.teamwork_orchestrator._get_teamwork_config_path", return_value=tmp_path):
            # Load default
            cfg = load_teamwork_config()
            assert cfg["enabled"] is True
            assert cfg["strategy"] == "balanced"
            assert cfg["max_subagents"] == 4

            # Save mutation
            saved = save_teamwork_config({
                "strategy": "quality",
                "max_subagents": 6,
                "auto_scale": False,
            })
            assert saved["strategy"] == "quality"
            assert saved["max_subagents"] == 6
            assert saved["auto_scale"] is False

            # Reload
            reloaded = load_teamwork_config()
            assert reloaded["strategy"] == "quality"
            assert reloaded["max_subagents"] == 6


def test_removed_autonomous_tools_flag_is_not_returned_or_persisted():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "teamwork.json"
        path.write_text('{"allow_autonomous_tools": true}', encoding="utf-8")
        with patch("runtime.teamwork_orchestrator._get_teamwork_config_path", return_value=path):
            cfg = load_teamwork_config(reload=True)
            assert "allow_autonomous_tools" not in cfg
            saved = save_teamwork_config({"allow_autonomous_tools": False})
            assert "allow_autonomous_tools" not in saved
            assert "allow_autonomous_tools" not in json.loads(path.read_text(encoding="utf-8"))


def test_resolve_team_plan():
    mock_pool = [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google-gemini-cli", "tier": "balanced"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "provider": "google-gemini-cli", "tier": "quality"},
        {"id": "deepseek-r1:70b", "name": "DeepSeek R1", "provider": "ollama", "tier": "quality"},
        {"id": "llama3.2:3b", "name": "Llama 3.2 3B", "provider": "ollama", "tier": "fast"},
    ]
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=mock_pool):
        # Auto-scale test on simple prompt
        plan = resolve_team_plan("Was ist 2 + 2?")
        assert len(plan["workers"]) == 2
        assert plan["complexity"] <= 2
        assert plan["critic"] in [m["id"] for m in mock_pool]

        # Quality strategy on complex prompt
        plan_q = resolve_team_plan(
            "Vergleiche die Architektur und implementiere ein komplexes Refactoring ```ts class A {} ```",
            config={"strategy": "quality", "auto_scale": True, "max_subagents": 4, "roles": {}},
        )
        assert len(plan_q["workers"]) >= 3
        # Should assign diverse perspectives
        perspectives = [w["role"] for w in plan_q["workers"]]
        assert len(set(perspectives)) == len(perspectives)


def test_auto_scaled_plan_uses_cap_eight_and_honors_planner_override():
    mock_pool = [
        {"id": f"model-{i}", "name": f"Model {i}", "provider": f"provider-{i}", "tier": "balanced"}
        for i in range(8)
    ]
    complex_prompt = "Please refactor and compare architecture; implement design. " + "x" * 700 + " ```python\nclass Example: pass\n```"
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=mock_pool):
        plan = resolve_team_plan(complex_prompt, {
            "strategy": "balanced", "auto_scale": True, "max_subagents": 8,
            "roles": {"planner": "model-7"},
        })
    assert len(plan["workers"]) == 8
    assert plan["planner"]["id"] == "model-7"


def test_teamwork_does_not_invent_models_when_provider_catalog_is_empty():
    with patch("web.api.config.get_available_models", return_value={"groups": []}):
        assert get_teamwork_model_pool() == []
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[]):
        plan = resolve_team_plan("Review this change")
    assert plan["workers"] == []
    assert plan["critic"] == ""
    assert plan["synthesizer"] == ""


def test_teamwork_fails_clearly_when_no_models_are_available():
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[]), \
         patch("runtime.auxiliary_client.call_llm") as call_llm:
        with pytest.raises(RuntimeError, match="keine aktuell verfügbaren Modelle"):
            run_teamwork_turn(MagicMock(messages=[]), "Review this change")
        call_llm.assert_not_called()


def test_run_teamwork_turn_flow():
    mock_session = MagicMock()
    mock_session.messages = []
    events = []

    def stream_put(ev, data):
        events.append((ev, data))

    # Mock call_llm
    def fake_call_llm(model=None, **kwargs):
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = f"Lösungsansatz von {model}"
        return resp

    mock_pool = [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google-gemini-cli", "tier": "balanced"},
        {"id": "deepseek-r1", "name": "DeepSeek R1", "provider": "ollama", "tier": "quality"},
    ]

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=mock_pool), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm):
        result = run_teamwork_turn(
            mock_session,
            "Erstelle eine REST API für Lastbrowser",
            grounding_context="Aktiver Tab: https://lastbrowser.com",
            stream_put=stream_put,
        )

        assert result["content"]
        assert "metadata" in result
        assert result["metadata"]["planner"] == "gemini-2.5-flash"
        assert len(mock_session.messages) == 1
        assert "teamwork" in mock_session.messages[0]

        # Verify emitted stages
        stage_names = [data["stage"] for ev, data in events if ev == "teamwork_stage"]
        assert "grounding" in stage_names
        assert "planning" in stage_names
        assert "debate" in stage_names
        assert "critic" in stage_names
        assert "synthesizing" in stage_names
