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
    _safe_teamwork_rpc_failure_code,
    _teamwork_visible_content,
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


def test_teamwork_rpc_diagnostics_expose_only_allowlisted_internal_codes():
    from runtime.independent.worker_host import WorkerError

    assert _safe_teamwork_rpc_failure_code(
        WorkerError("native_chat_rpc_denied_native_teamwork_claim_contract_mismatch")
    ) == "native_teamwork_claim_contract_mismatch"
    assert _safe_teamwork_rpc_failure_code(
        WorkerError("native_chat_rpc_denied_api_key_secret")
    ) is None
    assert _safe_teamwork_rpc_failure_code(RuntimeError("https://private.example/token")) is None


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


def test_auto_scaled_plan_respects_turn_budget_cap_and_honors_planner_override():
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
    assert len(plan["workers"]) == 4
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
    # Prefer a different model/provider for synthesis when the live eligible
    # pool supports it; with one manually eligible worker, reuse is expected.
    assert plan["synthesizer"] in {"available-a", "available-b"}
    assert plan["synthesizer_provider"] in {"ollama", "openrouter"}


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


def test_streaming_worker_rejects_reasoning_only_output_without_leaking_it():
    worker = {
        "model": "model-a", "call_model": "model-a", "provider": "provider-a",
        "name": "A", "role": "Pragmatiker", "focus": "Implementation",
    }
    events = []

    def reasoning_only(*, on_reasoning, **_kwargs):
        on_reasoning("private reasoning must never become a worker draft")
        return ""

    with patch("runtime.auxiliary_client.stream_llm", side_effect=reasoning_only):
        result = _invoke_worker(
            worker,
            "synthetic task",
            "",
            [],
            allow_hot_swap=False,
            event_put=lambda event, data: events.append((event, data)),
        )

    assert result["content"] == ""
    assert result["failure_code"] == "teamwork_worker_reasoning_only"
    assert "sichtbaren Entwurf" in result["error"]
    assert "private reasoning" not in repr(result)
    worker_end = next(data for event, data in events if event == "teamwork_worker_end")
    assert worker_end["failure_code"] == "teamwork_worker_reasoning_only"
    assert worker_end["error"] == result["error"]
    assert "private reasoning" not in repr(events)


def test_teamwork_visible_content_strips_think_blocks_and_counts_reasoning_only():
    response = MagicMock()
    response.choices[0].message.content = "<think>private</think>Visible draft"
    response.choices[0].message.reasoning_content = "separate private reasoning"
    assert _teamwork_visible_content(response) == ("Visible draft", len("separate private reasoning"))

    response.choices[0].message.content = ""
    visible, reasoning_chars = _teamwork_visible_content(response)
    assert visible == ""
    assert reasoning_chars == len("separate private reasoning")


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
            with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model, {"id": "model-b", "name": "B", "provider": "mock-b", "tier": "balanced"}]), \
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


def test_teamwork_worker_ignores_late_callback_and_return_after_stop(monkeypatch):
    from runtime import auxiliary_client
    from runtime.teamwork_orchestrator import _invoke_worker

    cancel = threading.Event()
    provider_started = threading.Event()
    release_provider = threading.Event()
    callbacks = []
    calls = []
    events = []
    worker = {
        "id": "model-a", "model": "model-a", "call_model": "model-a", "provider": "fixture",
        "name": "Fixture", "role": "analyst", "focus": "stop race",
        "worker_id": "worker-1", "worker_index": 0,
    }
    backup = [{"id": "model-b", "call_model": "model-b", "provider": "fixture-b"}]

    def fake_stream_llm(*, provider, on_content, **_kwargs):
        calls.append(provider)
        callbacks.append(on_content)
        provider_started.set()
        assert release_provider.wait(timeout=2)
        on_content("late provider delta")
        return "late provider result"

    monkeypatch.setattr(auxiliary_client, "stream_llm", fake_stream_llm)
    result = []
    thread = threading.Thread(target=lambda: result.append(_invoke_worker(
        worker, "synthetic prompt", "", backup, allow_hot_swap=True,
        event_put=lambda event, data: events.append((event, data)),
        cancel_event=cancel,
    )))
    thread.start()
    assert provider_started.wait(timeout=2)

    cancel.set()
    release_provider.set()
    thread.join(timeout=2)

    assert not thread.is_alive()
    assert calls == ["fixture"]
    assert not any(event == "teamwork_worker_delta" for event, _data in events)
    assert not any(event == "teamwork_worker_end" and data["status"] == "complete"
                   for event, data in events)
    assert any(event == "teamwork_worker_end" and data["status"] == "aborted"
               for event, data in events)
    assert result[0]["error"] is not None


def test_teamwork_worker_does_not_accept_or_retry_after_deadline(monkeypatch):
    from runtime import auxiliary_client

    calls = []
    events = []
    worker = {
        "id": "model-a", "model": "model-a", "call_model": "model-a", "provider": "fixture-a",
        "name": "Fixture A", "role": "analyst", "focus": "deadline race",
        "worker_id": "worker-1", "worker_index": 0,
    }
    backup = [{"id": "model-b", "call_model": "model-b", "provider": "fixture-b"}]

    def fake_stream_llm(*, provider, on_content, **_kwargs):
        calls.append(provider)
        time.sleep(0.03)
        on_content("late provider delta")
        return "late provider result"

    monkeypatch.setattr(auxiliary_client, "stream_llm", fake_stream_llm)
    result = _invoke_worker(
        worker, "synthetic prompt", "", backup, allow_hot_swap=True,
        deadline=time.monotonic() + 0.01,
        event_put=lambda event, data: events.append((event, data)),
    )

    assert calls == ["fixture-a"]
    assert not any(event == "teamwork_worker_delta" for event, _data in events)
    assert any(event == "teamwork_worker_end" and data["status"] == "aborted"
               for event, data in events)
    assert result["failure_code"] == "teamwork_turn_deadline_exceeded"


def test_teamwork_planner_deadline_is_an_error_and_stops_later_stages(monkeypatch):
    from types import SimpleNamespace
    from runtime import auxiliary_client, teamwork_orchestrator as orchestrator

    monkeypatch.setattr(orchestrator, "TEAMWORK_TURN_TIMEOUT_SECONDS", 0.02)
    calls = []
    events = []
    provider_finished = threading.Event()
    session = MagicMock(messages=[])
    model = {"id": "model-a", "call_model": "model-a", "provider": "fixture-a", "name": "Fixture A"}
    plan = {
        "planner": model,
        "workers": [{**model, "worker_id": "worker-1", "worker_index": 0,
                      "model": "model-a", "role": "analyst", "focus": "deadline"}],
        "worker_pool": [model], "pool": [model],
        "critic": "model-a", "critic_provider": "fixture-a",
        "synthesizer": "model-a", "synthesizer_provider": "fixture-a",
        "provider_count": 1, "reduced_mode": False,
    }

    def fake_call_llm(*, model, **_kwargs):
        calls.append(model)
        time.sleep(0.04)
        provider_finished.set()
        return SimpleNamespace(choices=[])

    monkeypatch.setattr(auxiliary_client, "call_llm", fake_call_llm)
    with pytest.raises(TimeoutError, match="teamwork_turn_deadline_exceeded"):
        orchestrator._run_teamwork_turn(
            session, "synthetic prompt", config={"enabled": True, "strategy": "balanced"},
            stream_put=lambda event, data: events.append((event, data)),
            plan_override=plan,
        )

    assert provider_finished.wait(timeout=1)
    assert calls == ["model-a"]
    assert not any(event in {"teamwork_worker_start", "teamwork_critic", "teamwork_complete"}
                   for event, _data in events)
    assert session.messages == []


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


def test_teamwork_explicitly_pins_every_role_to_ollama_cloud():
    catalog = {
        "groups": [
            {"provider_id": "ollama-cloud", "provider": "Ollama Cloud", "models": [
                {"id": "deepseek-v4.1-flash"},
                {"id": "qwen3-coder:cloud"},
            ]},
            {"provider_id": "openrouter", "provider": "OpenRouter", "models": [
                {"id": "backup-model"},
            ]},
        ]
    }
    model_calls = []
    stream_calls = []

    def fake_call_llm(*, provider, model, **_kwargs):
        model_calls.append((provider, model))
        response = MagicMock()
        response.choices = [MagicMock()]
        response.choices[0].message.content = "Ollama draft"
        return response

    def fake_stream_llm(*, provider, model, on_content, **_kwargs):
        stream_calls.append((provider, model))
        on_content("Ollama synthesis")
        return "Ollama synthesis"

    roles = {
        "planner": "deepseek-v4.1-flash",
        "worker_pool": ["deepseek-v4.1-flash", "qwen3-coder:cloud"],
        "critic": "qwen3-coder:cloud",
        "synthesizer": "deepseek-v4.1-flash",
    }
    with patch("web.api.config.get_available_models", return_value=catalog), \
         patch("cli.auth.resolve_api_key_provider_credentials", return_value={"api_key": "test-key"}), \
         patch("cli.models.fetch_ollama_cloud_models", return_value=["deepseek-v4.1-flash", "qwen3-coder:cloud"]), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call_llm), \
         patch("runtime.auxiliary_client.extract_content_or_reasoning", return_value="Ollama draft"), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
        result = run_teamwork_turn(
            MagicMock(messages=[]),
            "Complete the task",
            config={
                "strategy": "balanced",
                "auto_scale": False,
                "max_subagents": 2,
                "shared_grounding": False,
                "roles": roles,
                "hot_swap": {"enabled": True, "fallback_quorum_min": 1},
            },
        )

    assert result["content"] == "Ollama synthesis"
    assert len(model_calls) == 4  # planner, two parallel workers, and critic
    assert set(model_calls) == {
        ("ollama-cloud", "deepseek-v4.1-flash"),
        ("ollama-cloud", "qwen3-coder:cloud"),
    }
    assert stream_calls == [("ollama-cloud", "deepseek-v4.1-flash")]
    assert all(provider == "ollama-cloud" for provider, _model in model_calls + stream_calls)


def test_teamwork_fails_clearly_when_no_models_are_available():
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[]), \
         patch("runtime.auxiliary_client.call_llm") as call_llm:
        with pytest.raises(RuntimeError, match="keine aktuell verfügbaren Modelle"):
            run_teamwork_turn(MagicMock(messages=[]), "Review this change")
        call_llm.assert_not_called()


def test_teamwork_zero_quorum_cannot_succeed_without_any_worker_draft():
    model = {"id": "model-a", "name": "A", "provider": "mock", "tier": "balanced"}
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model, {"id": "model-b", "name": "B", "provider": "mock-b", "tier": "balanced"}]), \
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


def test_teamwork_rejects_quorum_above_planned_workers_before_provider_calls():
    model = {"id": "model-a", "name": "A", "provider": "ollama-cloud", "tier": "fast"}
    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model]), \
         patch("runtime.auxiliary_client.call_llm") as call_llm, \
         patch("runtime.auxiliary_client.stream_llm") as stream_llm:
        with pytest.raises(RuntimeError, match=r"Mindestquorum ist nicht erreichbar.*2.*nur 1 Worker geplant"):
            run_teamwork_turn(
                MagicMock(messages=[]),
                "What is 2 + 2?",
                config={
                    "enabled": True,
                    "strategy": "balanced",
                    "auto_scale": False,
                    "max_subagents": 1,
                    "roles": {},
                    "hot_swap": {"enabled": True, "fallback_quorum_min": 2},
                },
            )

    call_llm.assert_not_called()
    stream_llm.assert_not_called()


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

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model, {"id": "model-b", "name": "B", "provider": "mock-b", "tier": "balanced"}]), \
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


def test_teamwork_workers_stream_in_parallel_and_feed_critic_and_synthesis():
    """Both provider streams overlap while visible drafts reach later stages."""
    from types import SimpleNamespace

    pool = [
        {"id": "@ollama-cloud:model-a", "call_model": "model-a", "provider": "ollama-cloud",
         "name": "Provider A", "tier": "fast"},
        {"id": "@openai-codex:model-b", "call_model": "model-b", "provider": "openai-codex",
         "name": "Provider B", "tier": "balanced"},
    ]
    plan = {
        "strategy": "balanced", "planner": None,
        "workers": [
            {"worker_id": "worker-1", "worker_index": 1, "model": pool[0]["id"], "call_model": "model-a",
             "provider": "ollama-cloud", "name": "Provider A", "role": "Analyst", "focus": "edge cases"},
            {"worker_id": "worker-2", "worker_index": 2, "model": pool[1]["id"], "call_model": "model-b",
             "provider": "openai-codex", "name": "Provider B", "role": "Designer", "focus": "contracts"},
        ],
        "worker_pool": pool, "pool": pool,
        "critic": pool[0]["id"], "critic_provider": pool[0]["provider"],
        "synthesizer": pool[1]["id"], "synthesizer_provider": pool[1]["provider"],
        "provider_count": 2, "reduced_mode": False,
    }
    both_started = threading.Barrier(2, timeout=3)
    lock = threading.Lock()
    active = 0
    max_active = 0
    phases = []
    critic_seen = []

    def fake_stream(*, provider, model, messages, on_content, **kwargs):
        nonlocal active, max_active
        with lock:
            active += 1
            max_active = max(max_active, active)
        try:
            both_started.wait()
            answer = f"visible draft from {model}"
            on_content(answer)
            phases.append(("worker", model, kwargs.get("max_tokens")))
            return answer
        finally:
            with lock:
                active -= 1

    def fake_call(*, provider, model, messages, **kwargs):
        content = messages[0].get("content", "")
        if "PARALLELEN ENTWÜRFE" in content:
            critic_seen.append(content)
            phases.append(("critic", model, kwargs.get("max_tokens")))
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="visible critic review"))])
        raise AssertionError("unexpected planner or completion")

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream), \
         patch("runtime.auxiliary_client.call_llm", side_effect=fake_call):
        import runtime.teamwork_orchestrator as orchestrator
        result = orchestrator._run_teamwork_turn(
            MagicMock(messages=[]), "Design a bounded API", config={"enabled": True, "shared_grounding": False,
            "strategy": "balanced", "auto_scale": False, "max_subagents": 2,
            "hot_swap": {"enabled": False, "fallback_quorum_min": 2}},
            stream_put=lambda *_: None, cancel_event=threading.Event(), plan_override=plan)

    assert max_active == 2
    assert len([draft for draft in result["metadata"]["drafts"] if not draft.get("error")]) == 2
    assert "visible draft from model-a" in critic_seen[0]
    assert "visible draft from model-b" in critic_seen[0]
    assert result["metadata"]["critic"]["review"] == "visible critic review"
    assert result["content"] in {"visible draft from model-a", "visible draft from model-b"}
    assert {phase for phase, *_ in phases} == {"worker", "critic"}


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
         patch("runtime.auxiliary_client.call_llm", side_effect=ProviderError), \
         patch("runtime.auxiliary_client.stream_llm", side_effect=ProviderError):
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


def test_teamwork_config_cache_isolated_per_named_profile(tmp_path, monkeypatch):
    from runtime import teamwork_orchestrator as orchestrator
    from web.api import profiles

    homes = {name: tmp_path / name for name in ("default", "alpha", "beta")}
    for home in homes.values():
        home.mkdir()
    (homes["default"] / "teamwork.json").write_text('{"strategy":"cost"}', encoding="utf-8")
    (homes["beta"] / "teamwork.json").write_text('{"strategy":"quality"}', encoding="utf-8")
    monkeypatch.setattr(profiles, "get_profile_home", lambda name: homes.get(name, homes["default"]))
    monkeypatch.setattr(profiles, "get_active_profile_home", lambda: homes["default"])
    orchestrator._CACHED_CONFIG = None

    assert load_teamwork_config(profile_name="default")["strategy"] == "cost"
    assert load_teamwork_config(profile_name="beta")["strategy"] == "quality"
    assert load_teamwork_config(profile_name="alpha")["strategy"] == "balanced"
    save_teamwork_config({"strategy": "quality"}, profile_name="alpha")

    assert load_teamwork_config(profile_name="default")["strategy"] == "cost"
    assert load_teamwork_config(profile_name="beta")["strategy"] == "quality"
    assert load_teamwork_config(profile_name="alpha")["strategy"] == "quality"
    assert json.loads((homes["default"] / "teamwork.json").read_text(encoding="utf-8"))["strategy"] == "cost"
    assert get_teamwork_config_path("alpha") == homes["alpha"] / "teamwork.json"


def test_teamwork_pool_keeps_same_model_from_different_connected_providers_and_unknown_limits(monkeypatch):
    from runtime import teamwork_orchestrator as orchestrator
    from web.api import config

    observed_profiles = []
    monkeypatch.setattr(config, "get_available_models", lambda: (
        observed_profiles.append(__import__("web.api.profiles", fromlist=["get_active_profile_name"]).get_active_profile_name())
        or {"groups": [
            {"provider_id": "openai", "provider": "OpenAI", "models": [{"id": "shared-model"}]},
            {"provider_id": "gemini-router", "provider": "Gemini", "models": [{"id": "shared-model", "context_window": 8192}]},
        ]}
    ))
    pool = orchestrator.get_teamwork_model_pool(profile_name="alpha")

    assert [(row["provider"], row["id"]) for row in pool] == [
        ("openai", "shared-model"), ("gemini-router", "shared-model")
    ]
    assert "context_window" not in pool[0]
    assert pool[1]["context_window"] == 8192
    assert observed_profiles == ["alpha"]


def test_single_connected_provider_uses_one_bounded_stream_without_team_escalation():
    model = {"id": "gemini-2.5-flash", "call_model": "gemini-2.5-flash", "name": "Gemini Flash", "provider": "gemini-router", "tier": "balanced"}
    events = []
    session = MagicMock()
    session.profile = "fixture"
    session.session_id = "fixture-session"
    session.active_stream_id = "fixture-stream"
    session.messages = []

    def fake_stream_llm(*, on_content, max_tokens, **kwargs):
        assert max_tokens == 768
        on_content("Local fixture answer")
        return "Local fixture answer"

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=[model]), \
         patch("runtime.auxiliary_client.call_llm") as call_llm, \
         patch("runtime.auxiliary_client.stream_llm", side_effect=fake_stream_llm):
        result = run_teamwork_turn(session, "Answer this", config={"enabled": True, "shared_grounding": False},
                                   stream_put=lambda name, data: events.append((name, data)))

    call_llm.assert_not_called()
    assert result["metadata"]["mode"] == "single_provider_reduced"
    assert result["metadata"]["budget"] == {
        "requests_reserved": 1, "requests_limit": 8,
        "output_tokens_reserved": 768, "output_tokens_limit": 4096,
    }
    assert result["content"] == "Local fixture answer"
    assert [name for name, _data in events if name == "teamwork_complete"] == ["teamwork_complete"]


def test_teamwork_request_budget_is_thread_safe_and_enforced_before_dispatch():
    from concurrent.futures import ThreadPoolExecutor
    from runtime.teamwork_orchestrator import _TeamworkCallBudget

    budget = _TeamworkCallBudget()
    with ThreadPoolExecutor(max_workers=16) as executor:
        outcomes = list(executor.map(lambda _index: budget.reserve(128), range(32)))
    assert sum(outcomes) == 8
    assert budget.snapshot() == {
        "requests_reserved": 8, "requests_limit": 8,
        "output_tokens_reserved": 1024, "output_tokens_limit": 4096,
    }
    token_budget = _TeamworkCallBudget()
    assert token_budget.reserve(4096)
    assert not token_budget.reserve(1)
