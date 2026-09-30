"""Unit tests for the Teamwork Multi-Agent Orchestrator."""
import os
import json
import queue
import tempfile
import threading
import time

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
    _invoke_worker,
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


def test_nested_teamwork_config_mutation_does_not_change_cached_or_persisted_settings():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "teamwork.json"
        with patch("runtime.teamwork_orchestrator._get_teamwork_config_path", return_value=config_path):
            loaded = load_teamwork_config(reload=True)
            loaded["roles"]["planner"] = "unpersisted-model"

            reloaded_from_cache = load_teamwork_config()
            reloaded_from_disk = load_teamwork_config(reload=True)

    assert reloaded_from_cache["roles"]["planner"] == "auto"
    assert reloaded_from_disk["roles"]["planner"] == "auto"


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


def test_teamwork_config_clamps_invalid_fallback_quorum():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "teamwork.json"
        path.write_text('{"hot_swap":{"fallback_quorum_min":0}}', encoding="utf-8")
        with patch("runtime.teamwork_orchestrator._get_teamwork_config_path", return_value=path):
            cfg = load_teamwork_config(reload=True)
            assert cfg["hot_swap"]["fallback_quorum_min"] == 1
            saved = save_teamwork_config({"hot_swap": {"fallback_quorum_min": -5}})
            assert saved["hot_swap"]["fallback_quorum_min"] == 1


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


def test_teamwork_plan_deduplicates_manual_workers_and_falls_back_from_removed_roles():
    pool = [
        {"id": "available-a", "name": "A", "provider": "ollama", "tier": "balanced"},
        {"id": "available-b", "name": "B", "provider": "openrouter", "tier": "quality"},
    ]
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool):
        plan = resolve_team_plan("Review this", {
            "strategy": "balanced", "auto_scale": False, "max_subagents": 4,
            "roles": {
                "planner": "removed-model",
                "worker_pool": ["available-a", "available-a", "removed-model"],
                "critic": "removed-model",
                "synthesizer": "removed-model",
            },
        })

    assert [worker["model"] for worker in plan["workers"]] == ["available-a"]
    assert [model["id"] for model in plan["worker_pool"]] == ["available-a"]
    assert plan["planner"]["id"] in {"available-a", "available-b"}
    assert plan["critic"] in {"available-a", "available-b"}
    assert plan["critic_provider"] in {"ollama", "openrouter"}
    assert plan["synthesizer"] == plan["critic"]
    assert plan["synthesizer_provider"] == plan["critic_provider"]


def test_worker_reports_hot_swap_even_when_every_candidate_fails():
    worker = {
        "model": "model-a", "call_model": "model-a", "provider": "provider-a",
        "name": "A", "role": "Pragmatiker", "focus": "Implementation",
    }
    backup = {"id": "model-b", "call_model": "model-b", "provider": "provider-b", "name": "B"}
    with patch("runtime.auxiliary_client.call_llm", side_effect=RuntimeError("offline")):
        result = _invoke_worker(worker, "task", "", [backup])

    assert result["error"] == "provider request failed"
    assert result["model"] == "model-b"
    assert result["swapped"] is True


def test_worker_hot_swaps_when_provider_returns_empty_completion():
    worker = {
        "model": "model-a", "call_model": "model-a", "provider": "provider-a",
        "name": "A", "role": "Pragmatiker", "focus": "Implementation",
    }
    backup = {"id": "model-b", "call_model": "model-b", "provider": "provider-b", "name": "B"}
    empty_response = MagicMock()
    empty_response.choices[0].message.content = "   "
    successful_response = MagicMock()
    successful_response.choices[0].message.content = "usable draft"
    calls = []

    def return_empty_then_answer(*, provider, **_kwargs):
        calls.append(provider)
        return empty_response if len(calls) == 1 else successful_response

    with patch("runtime.auxiliary_client.call_llm", side_effect=return_empty_then_answer), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=["", "usable draft"]):
        result = _invoke_worker(worker, "task", "", [backup])

    assert calls == ["provider-a", "provider-b"]
    assert result["content"] == "usable draft"
    assert result["model"] == "model-b"
    assert result["swapped"] is True


def test_worker_does_not_call_backup_when_hot_swap_is_disabled():
    worker = {
        "model": "model-a", "call_model": "model-a", "provider": "provider-a",
        "name": "A", "role": "Pragmatiker", "focus": "Implementation",
    }
    backup = {"id": "model-b", "call_model": "model-b", "provider": "provider-b", "name": "B"}
    calls = []

    def fail(provider, **_kwargs):
        calls.append(provider)
        raise RuntimeError("provider unavailable")

    with patch("runtime.auxiliary_client.call_llm", side_effect=fail):
        result = _invoke_worker(
            worker, "task", "", [backup], allow_hot_swap=False,
        )

    assert calls == ["provider-a"]
    assert result["model"] == "model-a"
    assert result["provider"] == "provider-a"
    assert result["swapped"] is False
    assert result["error"] == "provider request failed"


def test_teamwork_config_disables_backup_provider_hot_swap():
    pool = [
        {"id": "model-a", "name": "A", "provider": "provider-a", "tier": "balanced"},
        {"id": "model-b", "name": "B", "provider": "provider-b", "tier": "balanced"},
    ]
    providers = []

    def fake_call_llm(*, provider, messages, **_kwargs):
        providers.append(provider)
        response = MagicMock()
        response.choices = [MagicMock()]
        if "Arbeitsplan" in messages[0]["content"]:
            response.choices[0].message.content = "plan"
            return response
        if provider == "provider-a":
            raise RuntimeError("primary unavailable")
        response.choices[0].message.content = "backup answer"
        return response

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="answer"):
        with pytest.raises(RuntimeError, match="kein Lösungsentwurf"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "Do the task",
                config={
                    "enabled": True, "strategy": "balanced", "auto_scale": False,
                    "max_subagents": 1,
                    "roles": {
                        "planner": "model-a", "worker_pool": ["model-a"],
                        "critic": "model-a", "synthesizer": "model-a",
                    },
                    "hot_swap": {"enabled": False, "fallback_quorum_min": 1},
                },
            )

    assert providers == ["provider-a", "provider-a"]  # planner + primary worker only


def test_teamwork_cancellation_does_not_wait_for_blocked_worker():
    worker_started = threading.Event()
    release_worker = threading.Event()
    cancel = threading.Event()
    finished = threading.Event()
    model = {"id": "model-a", "name": "A", "provider": "mock", "tier": "balanced"}
    calls = 0

    def fake_call_llm(*, messages, **_kwargs):
        nonlocal calls
        calls += 1
        response = MagicMock()
        response.choices = [MagicMock()]
        if calls == 1:
            # The planner call completes so execution reaches the worker phase.
            response.choices[0].message.content = "plan"
            return response
        worker_started.set()
        if not release_worker.wait(timeout=5):
            raise RuntimeError("test worker release timed out")
        response.choices[0].message.content = "draft"
        return response

    def run():
        try:
            with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model]), \
                 patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
                 patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="answer"):
                run_teamwork_turn(
                    MagicMock(messages=[]),
                    "Do the task",
                    config={
                        "enabled": True, "strategy": "balanced", "auto_scale": False,
                        "max_subagents": 1, "roles": {},
                        "hot_swap": {"enabled": False, "fallback_quorum_min": 1},
                    },
                    cancel_event=cancel,
                )
        except InterruptedError:
            pass
        finally:
            finished.set()

    runner = threading.Thread(target=run, daemon=True)
    runner.start()
    try:
        assert worker_started.wait(timeout=2), "worker call did not start"
        cancel.set()
        assert finished.wait(timeout=1), "cancelled teamwork call waited for blocked worker"
    finally:
        # Always release the executor thread before the test exits, including
        # on assertion failure. This keeps the regression deterministic and
        # avoids leaking a non-daemon ThreadPoolExecutor worker.
        release_worker.set()
        runner.join(timeout=2)
    assert not runner.is_alive()


def test_repeated_worker_cancellation_keeps_executor_threads_within_global_bound(monkeypatch):
    from runtime import teamwork_orchestrator as orchestrator

    # Use a small deterministic process-wide cap to prove a second cancelled
    # turn cannot create another executor thread while the first turn's
    # synchronous provider calls remain blocked.
    class TrackingSemaphore:
        def __init__(self, value):
            self._semaphore = threading.BoundedSemaphore(value)
            self.waiting = threading.Event()

        def acquire(self, timeout=None):
            acquired = self._semaphore.acquire(timeout=timeout)
            if not acquired:
                self.waiting.set()
            return acquired

        def release(self):
            self._semaphore.release()

    worker_slots = TrackingSemaphore(2)
    monkeypatch.setattr(orchestrator, "_TEAMWORK_WORKER_SLOTS", worker_slots)
    workers = [
        {"id": f"model-{index}", "call_model": f"model-{index}", "provider": "mock",
         "name": f"M{index}", "role": "analyst", "focus": "test", "tier": "balanced"}
        for index in range(2)
    ]
    plan = {
        "workers": workers,
        "critic": "model-0", "critic_provider": "mock",
        "synthesizer": "model-0", "synthesizer_provider": "mock",
        "pool": workers, "planner": None,
    }
    release_workers = threading.Event()
    started_workers = queue.Queue()
    worker_thread_ids = set()
    worker_thread_ids_lock = threading.Lock()
    runners = []

    def blocked_worker(worker, *_args, **_kwargs):
        with worker_thread_ids_lock:
            worker_thread_ids.add(threading.get_ident())
        started_workers.put(worker["id"])
        if not release_workers.wait(timeout=5):
            raise RuntimeError("test worker release timed out")
        return {
            "model": worker["id"], "provider": "mock", "name": worker["name"],
            "role": worker["role"], "focus": worker["focus"], "content": "draft",
            "execution_ms": 1, "error": None, "swapped": False,
        }

    def live_worker_threads():
        with worker_thread_ids_lock:
            known_thread_ids = set(worker_thread_ids)
        return {thread.ident for thread in threading.enumerate()
                if thread.is_alive() and thread.ident in known_thread_ids}

    def start_cancelled_turn():
        cancel = threading.Event()
        entered = threading.Event()
        finished = threading.Event()

        def run():
            entered.set()
            try:
                orchestrator.run_teamwork_turn(
                    MagicMock(messages=[]), "Do the task",
                    config={"shared_grounding": False,
                            "hot_swap": {"enabled": False, "fallback_quorum_min": 1}},
                    cancel_event=cancel,
                )
            except InterruptedError:
                pass
            finally:
                finished.set()

        runner = threading.Thread(target=run, daemon=True)
        runner.start()
        runners.append(runner)
        assert entered.wait(timeout=1)
        return cancel, finished, runner

    try:
        with patch.object(orchestrator, "resolve_team_plan", return_value=plan), \
             patch.object(orchestrator, "_invoke_worker", side_effect=blocked_worker):
            first_cancel, first_finished, first_runner = start_cancelled_turn()
            assert {started_workers.get(timeout=2), started_workers.get(timeout=2)} == {
                "model-0", "model-1",
            }
            first_cancel.set()
            assert first_finished.wait(timeout=1), "first cancellation waited for blocked workers"
            assert len(live_worker_threads()) == 2

            second_cancel, second_finished, second_runner = start_cancelled_turn()
            assert worker_slots.waiting.wait(timeout=1), "second run did not wait for a worker slot"
            second_cancel.set()
            assert second_finished.wait(timeout=1), "slot-waiting cancellation did not return"
            assert started_workers.empty(), "a second run started workers beyond the process-wide cap"
            assert len(live_worker_threads()) == 2
            first_runner.join(timeout=1)
            second_runner.join(timeout=1)
            assert not first_runner.is_alive()
            assert not second_runner.is_alive()
    finally:
        release_workers.set()
        for runner in runners:
            runner.join(timeout=2)
        deadline = time.monotonic() + 3
        while live_worker_threads() and time.monotonic() < deadline:
            time.sleep(0.02)
        assert not live_worker_threads(), "blocked worker executor threads leaked after test cleanup"


@pytest.mark.parametrize("blocked_stage", ["planner", "critic"])
def test_teamwork_cancellation_interrupts_blocked_planner_and_critic_without_unbounded_threads(blocked_stage):
    from runtime import teamwork_orchestrator as orchestrator

    started = threading.Event()
    release_provider = threading.Event()
    cancel = threading.Event()
    finished = threading.Event()
    model = {"id": "model-a", "name": "A", "provider": "mock", "tier": "balanced"}
    plan = {
        "workers": [dict(model, role="analyst", focus="analyze", call_model="model-a")],
        "critic": "model-a", "critic_provider": "mock",
        "synthesizer": "model-a", "synthesizer_provider": "mock",
        "pool": [model],
        "planner": dict(model, call_model="model-a") if blocked_stage == "planner" else None,
    }

    def blocked_call(**_kwargs):
        started.set()
        if not release_provider.wait(timeout=5):
            raise RuntimeError("test provider release timed out")
        return MagicMock()

    def run():
        try:
            with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
                 patch("runtime.teamwork_orchestrator._invoke_worker", return_value={
                     "model": "model-a", "provider": "mock", "name": "A", "role": "analyst",
                     "focus": "analyze", "content": "draft", "execution_ms": 1,
                     "error": None, "swapped": False,
                 }), \
                 patch("runtime.auxiliary_client.call_llm", side_effect=blocked_call), \
                 patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="text"):
                run_teamwork_turn(
                    MagicMock(messages=[]), "Do the task",
                    config={"enabled": True, "shared_grounding": False,
                            "hot_swap": {"enabled": False, "fallback_quorum_min": 1}},
                    cancel_event=cancel,
                )
        except InterruptedError:
            pass
        finally:
            finished.set()

    runner = threading.Thread(target=run, daemon=True)
    runner.start()
    try:
        assert started.wait(timeout=2), f"{blocked_stage} provider call did not start"
        before = {thread.ident for thread in threading.enumerate() if thread.name == "teamwork-provider-call"}
        cancel.set()
        assert finished.wait(timeout=1), f"cancellation waited for blocked {blocked_stage} provider"
        current = [thread for thread in threading.enumerate() if thread.name == "teamwork-provider-call"]
        assert len(current) <= 2, "detached provider calls exceeded the global bound"
        assert len({thread.ident for thread in current} - before) <= 1
    finally:
        release_provider.set()
        runner.join(timeout=2)
    assert not runner.is_alive()


def test_teamwork_cancellable_calls_apply_backpressure_at_global_limit():
    cancel = threading.Event()
    result = []
    # Fill the semaphore with two deliberately blocked calls.
    from runtime import teamwork_orchestrator as orchestrator
    orchestrator._CANCELLABLE_CALL_SLOTS.acquire()
    orchestrator._CANCELLABLE_CALL_SLOTS.acquire()
    runner = threading.Thread(target=lambda: _run_cancelled_call(result, cancel), daemon=True)
    runner.start()
    try:
        cancel.set()
        runner.join(timeout=1)
        assert not runner.is_alive(), "waiting for a call slot ignored cancellation"
        assert result == ["cancelled"]
    finally:
        orchestrator._CANCELLABLE_CALL_SLOTS.release()
        orchestrator._CANCELLABLE_CALL_SLOTS.release()


def _run_cancelled_call(result, cancel):
    from runtime.teamwork_orchestrator import _call_llm_cancellable
    try:
        _call_llm_cancellable(lambda: "unexpected", cancel_event=cancel)
    except InterruptedError:
        result.append("cancelled")


def test_teamwork_does_not_invent_models_when_provider_catalog_is_empty():
    with patch("web.api.config.get_available_models", return_value={"groups": []}):
        assert get_teamwork_model_pool() == []
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[]):
        plan = resolve_team_plan("Review this change")
    assert plan["workers"] == []
    assert plan["critic"] == ""
    assert plan["synthesizer"] == ""


def test_teamwork_model_discovery_preserves_colon_tagged_model_ids():
    catalog = {
        "groups": [{
            "provider_id": "ollama",
            "provider": "Ollama",
            "models": [
                {"id": "qwen3:4b", "label": "Qwen 3 4B"},
                {"id": "deepseek-r1:70b", "label": "DeepSeek R1 70B"},
            ],
        }]
    }
    with patch("web.api.config.get_available_models", return_value=catalog):
        models = get_teamwork_model_pool()
    assert [model["id"] for model in models] == ["qwen3:4b", "deepseek-r1:70b"]
    assert [model["tier"] for model in models] == ["fast", "quality"]


def test_teamwork_balanced_auto_routing_uses_ollama_cloud_default_and_classifies_flash_as_fast():
    from runtime.teamwork_orchestrator import classify_model_tier

    catalog = {
        "groups": [
            {"provider_id": "openai", "provider": "OpenAI", "models": [
                {"id": "general-balanced-model"},
            ]},
            {"provider_id": "ollama-cloud", "provider": "Ollama Cloud", "models": [
                {"id": "deepseek-v4.1-flash"},
            ]},
            {"provider_id": "anthropic", "provider": "Anthropic", "models": [
                {"id": "claude-3-7-sonnet"},
            ]},
        ]
    }

    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": "test-key"}), \
         patch("cli.models.fetch_ollama_cloud_models", return_value=["deepseek-v4.1-flash"]):
        pool = get_teamwork_model_pool()
        plan = resolve_team_plan(
            "Review this change",
            config={
                "strategy": "balanced", "auto_scale": False, "max_subagents": 2,
                "roles": {"planner": "auto", "worker_pool": "auto", "critic": "auto", "synthesizer": "auto"},
            },
        )

    ollama_default = next(model for model in pool if model["provider"] == "ollama-cloud")
    assert ollama_default["tier"] == "fast"
    assert classify_model_tier("deepseek-v4.1-flash", "ollama-cloud") == "fast"
    assert plan["planner"]["id"] == "deepseek-v4.1-flash"
    assert "deepseek-v4.1-flash" in [worker["model"] for worker in plan["workers"]]
    assert len(plan["workers"]) == 2


def test_teamwork_excludes_ollama_cloud_setup_hints_without_credentials():
    catalog = {
        "groups": [
            {"provider_id": "ollama-cloud", "provider": "Ollama Cloud", "models": [
                {"id": "deepseek-v4.1-flash"},
            ]},
            {"provider_id": "anthropic", "provider": "Anthropic", "models": [
                {"id": "claude-3-7-sonnet"},
            ]},
        ]
    }

    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": ""}), \
         patch("cli.models.fetch_ollama_cloud_models", side_effect=AssertionError("must not fetch without a key")):
        models = get_teamwork_model_pool()

    assert [(model["provider"], model["id"]) for model in models] == [
        ("anthropic", "claude-3-7-sonnet"),
    ]


def test_teamwork_only_routes_ollama_cloud_models_in_live_account_catalog():
    catalog = {
        "groups": [{"provider_id": "ollama-cloud", "provider": "Ollama Cloud", "models": [
            {"id": "deepseek-v4.1-flash"},
            {"id": "qwen3-coder:cloud"},
        ]}]
    }

    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": "test-key"}), \
         patch("cli.models.fetch_ollama_cloud_models", return_value=["deepseek-v4.1-flash"]):
        models = get_teamwork_model_pool()

    assert [model["id"] for model in models] == ["deepseek-v4.1-flash"]


def test_teamwork_keeps_provider_qualified_duplicate_and_routes_bare_model_to_provider():
    catalog = {
        "groups": [
            {"provider_id": "anthropic", "provider": "Anthropic", "models": [{"id": "shared-model"}]},
            {"provider_id": "openrouter", "provider": "OpenRouter", "models": [{"id": "@openrouter:shared-model"}]},
        ]
    }
    calls = []
    def fake_call_llm(*, provider, model, **kwargs):
        calls.append((provider, model))
        response = MagicMock()
        response.choices = [MagicMock()]
        response.choices[0].message.content = "answer"
        return response

    session = MagicMock(messages=[])
    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="answer"):
        pool = get_teamwork_model_pool()
        assert [(m["id"], m["provider"]) for m in pool] == [
            ("shared-model", "anthropic"),
            ("@openrouter:shared-model", "openrouter"),
        ]
        run_teamwork_turn(
            session,
            "Review this change",
            config={
                "strategy": "balanced", "auto_scale": False, "max_subagents": 1,
                "roles": {
                    "planner": "@openrouter:shared-model",
                    "worker_pool": ["@openrouter:shared-model"],
                    "critic": "@openrouter:shared-model",
                    "synthesizer": "@openrouter:shared-model",
                },
                "hot_swap": {"enabled": True, "fallback_quorum_min": 1},
            },
        )

    assert calls
    assert all(call == ("openrouter", "shared-model") for call in calls)


def test_teamwork_fails_clearly_when_no_models_are_available():
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[]), \
         patch("runtime.auxiliary_client.call_llm") as call_llm:
        with pytest.raises(RuntimeError, match="keine aktuell verfügbaren Modelle"):
            run_teamwork_turn(MagicMock(messages=[]), "Review this change")
        call_llm.assert_not_called()


def test_teamwork_zero_quorum_cannot_succeed_without_any_worker_draft():
    model = {"id": "model-a", "name": "A", "provider": "mock", "tier": "balanced"}
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model]), \
         patch("runtime.auxiliary_client.call_llm", side_effect=RuntimeError("provider offline")):
        with pytest.raises(RuntimeError, match="kein Lösungsentwurf"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "Do the task",
                config={
                    "enabled": True, "strategy": "balanced", "auto_scale": False,
                    "max_subagents": 1, "roles": {},
                    "hot_swap": {"fallback_quorum_min": 0},
                },
            )


@pytest.mark.parametrize("shared_grounding", [True, False])
def test_teamwork_only_uses_browser_grounding_when_setting_is_enabled(shared_grounding):
    session = MagicMock()
    session.messages = []
    model = {"id": "model-a", "name": "Model A", "provider": "mock", "tier": "balanced"}
    calls = []

    def fake_call_llm(*, messages, **kwargs):
        calls.append(messages)
        response = MagicMock()
        response.choices = [MagicMock()]
        response.choices[0].message.content = "mock answer"
        return response

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model]), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="mock answer"):
        run_teamwork_turn(
            session,
            "Answer the question",
            grounding_context="URL: https://example.test/path\nTitel: Example\nSichtbarer Auszug: relevant snippet",
            config={
                "enabled": True,
                "strategy": "balanced",
                "auto_scale": False,
                "max_subagents": 1,
                "shared_grounding": shared_grounding,
                "roles": {},
                "hot_swap": {"enabled": True, "fallback_quorum_min": 1},
            },
        )

    serialized_calls = "\n".join(str(messages) for messages in calls)
    assert ("relevant snippet" in serialized_calls) is shared_grounding


def test_run_teamwork_turn_flow():
    mock_session = MagicMock()
    mock_session.messages = []
    events = []

    def stream_put(ev, data):
        events.append((ev, data))

    # Mock call_llm
    llm_calls = []
    def fake_call_llm(model=None, **kwargs):
        llm_calls.append((model, kwargs))
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = f"Lösungsansatz von {model}"
        return resp

    def fake_stream_llm(*, on_content, on_reasoning=None, **kwargs):
        on_reasoning("prüft den Entwurf")
        on_content("Finale Antwort ")
        on_content("wird gestreamt.")
        return "Finale Antwort wird gestreamt."

    mock_pool = [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "provider": "google-gemini-cli", "tier": "balanced"},
        {"id": "deepseek-r1", "name": "DeepSeek R1", "provider": "ollama", "tier": "quality"},
    ]

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=mock_pool), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
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
        assert mock_session.messages[0]["reasoning"] == "prüft den Entwurf"
        assert any(model == "deepseek-r1" and kwargs.get("provider") == "ollama" for model, kwargs in llm_calls)
        assert result["content"] == "Finale Antwort wird gestreamt."
        assert [data["content"] for event, data in events if event == "delta"] == [
            "Finale Antwort ",
            "wird gestreamt.",
        ]
        assert [data["text"] for event, data in events if event == "reasoning"] == [
            "prüft den Entwurf",
        ]

        # Verify emitted stages
        stage_names = [data["stage"] for ev, data in events if ev == "teamwork_stage"]
        assert "grounding" in stage_names
        assert "planning" in stage_names
        assert "debate" in stage_names
        assert "critic" in stage_names
        assert "synthesizing" in stage_names


@pytest.mark.parametrize("failed_stage", ["planner", "critic", "synthesizer"])
def test_ollama_cloud_teamwork_failure_stages_keep_a_visible_answer(failed_stage):
    from types import SimpleNamespace

    model_id = "@ollama-cloud:deepseek-v4.1-flash"
    model = {
        "id": model_id,
        "call_model": "deepseek-v4.1-flash",
        "name": "DeepSeek V4.1 Flash",
        "provider": "ollama-cloud",
        "tier": "fast",
    }
    plan = {
        "strategy": "balanced",
        "planner": model if failed_stage == "planner" else None,
        "workers": [{
            "model": model_id,
            "call_model": model["call_model"],
            "provider": model["provider"],
            "name": model["name"],
            "role": "Pragmatiker",
            "focus": "direct answer",
        }],
        "critic": model_id,
        "critic_provider": model["provider"],
        "synthesizer": model_id,
        "synthesizer_provider": model["provider"],
        "pool": [model],
    }
    calls = []
    events = []
    session = MagicMock(messages=[])

    def fake_call_llm(*, provider, model, messages, **_kwargs):
        content = str(messages[0].get("content", ""))
        role = "planner" if "Arbeitsplan" in content else "critic"
        calls.append((role, provider, model))
        if role == failed_stage:
            raise RuntimeError(f"{role} unavailable")
        return SimpleNamespace(choices=[SimpleNamespace(
            message=SimpleNamespace(content=f"{role} result"),
        )])

    def fake_stream_llm(*, provider, model, on_content, on_reasoning=None, **_kwargs):
        calls.append(("synthesizer", provider, model))
        if failed_stage == "synthesizer":
            raise RuntimeError("synthesizer unavailable before first token")
        on_content("synthesized answer")
        return "synthesized answer"

    worker_result = {
        "model": model_id,
        "provider": model["provider"],
        "name": model["name"],
        "role": "Pragmatiker",
        "focus": "direct answer",
        "content": "worker draft fallback",
        "execution_ms": 1,
        "error": None,
        "swapped": False,
    }
    config = {"shared_grounding": False, "hot_swap": {"enabled": False, "fallback_quorum_min": 1}}

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.teamwork_orchestrator._invoke_worker", return_value=worker_result), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda r: r.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
        result = run_teamwork_turn(
            session,
            "Answer a small question using Ollama Cloud.",
            config=config,
            stream_put=lambda event, data: events.append((event, data)),
        )

    expected = "worker draft fallback" if failed_stage == "synthesizer" else "synthesized answer"
    assert result["content"] == expected
    assert session.messages[-1]["content"] == expected
    assert any(event == "teamwork_complete" for event, _data in events)
    assert calls and all(
        provider == model["provider"] and selected_model == model["call_model"]
        for _role, provider, selected_model in calls
    )
    if failed_stage == "critic":
        assert "Kritik konnte nicht separat generiert werden" in result["metadata"]["critic"]["review"]
    if failed_stage == "synthesizer":
        assert [data["content"] for event, data in events if event == "delta"] == [expected]


@pytest.mark.parametrize(
    ("status_code", "expected_hint"),
    [
        (401, "Prüfe die gespeicherten Zugangsdaten"),
        (429, "Warte auf die Rücksetzung oder aktiviere einen weiteren Anbieter"),
    ],
)
def test_singleton_ollama_cloud_quorum_failure_is_actionable_and_does_not_echo_provider_error(
    status_code, expected_hint,
):
    model_id = "@ollama-cloud:deepseek-v4.1-flash"
    model = {
        "id": model_id,
        "call_model": "deepseek-v4.1-flash",
        "name": "DeepSeek V4.1 Flash",
        "provider": "ollama-cloud",
        "tier": "fast",
    }
    plan = {
        "strategy": "balanced",
        "planner": None,
        "workers": [{
            "model": model_id,
            "call_model": model["call_model"],
            "provider": model["provider"],
            "name": model["name"],
            "role": "Pragmatiker",
            "focus": "direct answer",
        }],
        "critic": model_id,
        "critic_provider": model["provider"],
        "synthesizer": model_id,
        "synthesizer_provider": model["provider"],
        "pool": [model],
    }
    events = []
    session = MagicMock(messages=[])

    class ProviderError(Exception):
        def __init__(self):
            super().__init__("provider error containing private request details")
            self.status_code = status_code

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.auxiliary_client.call_llm", side_effect=ProviderError):
        with pytest.raises(RuntimeError) as exc_info:
            run_teamwork_turn(
                session,
                "Answer a small question using Ollama Cloud.",
                config={"shared_grounding": False, "hot_swap": {"enabled": True, "fallback_quorum_min": 1}},
                stream_put=lambda event, data: events.append((event, data)),
            )

    assert expected_hint in str(exc_info.value)
    assert str(status_code) in str(exc_info.value)
    assert "private request details" not in str(exc_info.value)
    draft_error = next(data["error"] for event, data in events if event == "teamwork_draft")
    assert draft_error == f"HTTP {status_code}"
    assert "private request details" not in draft_error


@pytest.mark.parametrize("visible_output", ["content", "reasoning"])
@pytest.mark.parametrize("failure_mode", ["exception", "empty"])
def test_teamwork_synthesis_never_replaces_visible_partial_output(visible_output, failure_mode):
    from types import SimpleNamespace

    model_id = "@ollama-cloud:deepseek-v4.1-flash"
    model = {
        "id": model_id,
        "call_model": "deepseek-v4.1-flash",
        "name": "DeepSeek V4.1 Flash",
        "provider": "ollama-cloud",
        "tier": "fast",
    }
    plan = {
        "strategy": "balanced",
        "planner": None,
        "workers": [{
            "model": model_id,
            "call_model": model["call_model"],
            "provider": model["provider"],
            "name": model["name"],
            "role": "Pragmatiker",
            "focus": "direct answer",
        }],
        "critic": model_id,
        "critic_provider": model["provider"],
        "synthesizer": model_id,
        "synthesizer_provider": model["provider"],
        "pool": [model],
    }
    worker_result = {
        "model": model_id,
        "provider": model["provider"],
        "name": model["name"],
        "role": "Pragmatiker",
        "focus": "direct answer",
        "content": "worker draft fallback",
        "execution_ms": 1,
        "error": None,
        "swapped": False,
    }
    events = []

    def fake_call_llm(**_kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="critic result"))])

    def fake_stream_llm(*, on_content, on_reasoning=None, **_kwargs):
        if visible_output == "content":
            on_content("partial synthesis")
        else:
            on_reasoning("partial synthesis reasoning")
        if failure_mode == "exception":
            raise RuntimeError("synthesis stream failed")
        return ""

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.teamwork_orchestrator._invoke_worker", return_value=worker_result), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda r: r.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
        with pytest.raises(RuntimeError, match="after partial output"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "Answer a small question using Ollama Cloud.",
                config={"shared_grounding": False, "hot_swap": {"enabled": False, "fallback_quorum_min": 1}},
                stream_put=lambda event, data: events.append((event, data)),
            )

    assert not any(event == "teamwork_complete" for event, _data in events)
    assert [data["content"] for event, data in events if event == "delta"] == (
        ["partial synthesis"] if visible_output == "content" else []
    )
    assert [data["text"] for event, data in events if event == "reasoning"] == (
        ["partial synthesis reasoning"] if visible_output == "reasoning" else []
    )


@pytest.mark.parametrize("visible_output", ["content", "reasoning"])
@pytest.mark.parametrize("failure_mode", ["exception", "empty"])
def test_teamwork_synthesis_never_replaces_visible_partial_output(visible_output, failure_mode):
    from types import SimpleNamespace

    model_id = "@ollama-cloud:deepseek-v4.1-flash"
    model = {
        "id": model_id,
        "call_model": "deepseek-v4.1-flash",
        "name": "DeepSeek V4.1 Flash",
        "provider": "ollama-cloud",
        "tier": "fast",
    }
    plan = {
        "strategy": "balanced",
        "planner": None,
        "workers": [{
            "model": model_id,
            "call_model": model["call_model"],
            "provider": model["provider"],
            "name": model["name"],
            "role": "Pragmatiker",
            "focus": "direct answer",
        }],
        "critic": model_id,
        "critic_provider": model["provider"],
        "synthesizer": model_id,
        "synthesizer_provider": model["provider"],
        "pool": [model],
    }
    worker_result = {
        "model": model_id,
        "provider": model["provider"],
        "name": model["name"],
        "role": "Pragmatiker",
        "focus": "direct answer",
        "content": "worker draft fallback",
        "execution_ms": 1,
        "error": None,
        "swapped": False,
    }
    events = []

    def fake_call_llm(**_kwargs):
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="critic result"))])

    def fake_stream_llm(*, on_content, on_reasoning=None, **_kwargs):
        if visible_output == "content":
            on_content("partial synthesis")
        else:
            on_reasoning("partial synthesis reasoning")
        if failure_mode == "exception":
            raise RuntimeError("synthesis stream failed")
        return ""

    with patch("runtime.teamwork_orchestrator.resolve_team_plan", return_value=plan), \
         patch("runtime.teamwork_orchestrator._invoke_worker", return_value=worker_result), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", side_effect=lambda r: r.choices[0].message.content), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
        with pytest.raises(RuntimeError, match="after partial output"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "Answer a small question using Ollama Cloud.",
                config={"shared_grounding": False, "hot_swap": {"enabled": False, "fallback_quorum_min": 1}},
                stream_put=lambda event, data: events.append((event, data)),
            )

    assert not any(event == "teamwork_complete" for event, _data in events)
    assert [data["content"] for event, data in events if event == "delta"] == (
        ["partial synthesis"] if visible_output == "content" else []
    )
    assert [data["text"] for event, data in events if event == "reasoning"] == (
        ["partial synthesis reasoning"] if visible_output == "reasoning" else []
    )
