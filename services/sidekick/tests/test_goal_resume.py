from __future__ import annotations

import pytest


def test_cli_goal_resume_preserves_budget_progress_and_resets_parse_failure_counter(monkeypatch):
    from cli.goals import GoalManager, GoalState

    monkeypatch.setattr("cli.goals.save_goal", lambda *args, **kwargs: None)

    mgr = GoalManager("goal-session")
    mgr._state = GoalState(
        goal="Ship it",
        status="paused",
        turns_used=4,
        max_turns=12,
        paused_reason="judge paused",
        consecutive_parse_failures=3,
    )

    resumed = mgr.resume()

    assert resumed is not None
    assert resumed.status == "active"
    assert resumed.turns_used == 4
    assert resumed.consecutive_parse_failures == 0


def test_cli_goal_resume_keeps_paused_when_budget_exhausted(monkeypatch):
    from cli.goals import GoalManager, GoalState

    monkeypatch.setattr("cli.goals.save_goal", lambda *args, **kwargs: None)

    mgr = GoalManager("goal-session")
    mgr._state = GoalState(
        goal="Ship it",
        status="paused",
        turns_used=20,
        max_turns=20,
        paused_reason="turn budget exhausted (20/20)",
        consecutive_parse_failures=2,
    )

    resumed = mgr.resume()

    assert resumed is not None
    assert resumed.status == "paused"
    assert resumed.turns_used == 20
    assert resumed.consecutive_parse_failures == 2


def test_cli_goal_budget_defaults_custom_and_unlimited(monkeypatch):
    from cli.goals import GoalManager

    monkeypatch.setattr("cli.goals.save_goal", lambda *args, **kwargs: None)
    monkeypatch.setattr("cli.goals.judge_goal", lambda *args, **kwargs: ("continue", "still working", False))

    mgr = GoalManager("goal-session")

    default_state = mgr.set("Ship it")
    custom_state = mgr.set("Ship it faster", max_turns=7)
    unlimited_state = mgr.set("Keep going", unlimited=True)

    assert default_state.max_turns == 20
    assert custom_state.max_turns == 7
    assert unlimited_state.max_turns is None

    mgr._state = unlimited_state
    for _ in range(25):
        decision = mgr.evaluate_after_turn("still working")
        assert decision["status"] == "active"
        assert decision["should_continue"] is True


def test_webui_goal_resume_preserves_budget_progress_and_resets_parse_failure_counter(monkeypatch, tmp_path):
    from cli.goals import GoalState
    from web.api.goals import _ProfileGoalManager

    mgr = _ProfileGoalManager("goal-session", profile_home=tmp_path)
    mgr._state = GoalState(
        goal="Ship it",
        status="paused",
        turns_used=4,
        max_turns=12,
        paused_reason="judge paused",
        consecutive_parse_failures=3,
    )

    saved = {}

    monkeypatch.setattr(mgr, "_save", lambda state: saved.setdefault("state", state))

    resumed = mgr.resume()

    assert resumed is not None
    assert resumed.status == "active"
    assert resumed.turns_used == 4
    assert resumed.consecutive_parse_failures == 0
    assert saved["state"].consecutive_parse_failures == 0


def test_webui_goal_resume_keeps_paused_when_budget_exhausted(monkeypatch, tmp_path):
    from cli.goals import GoalState
    from web.api.goals import _ProfileGoalManager

    mgr = _ProfileGoalManager("goal-session", profile_home=tmp_path)
    mgr._state = GoalState(
        goal="Ship it",
        status="paused",
        turns_used=20,
        max_turns=20,
        paused_reason="turn budget exhausted (20/20)",
        consecutive_parse_failures=2,
    )

    saved = {}

    monkeypatch.setattr(mgr, "_save", lambda state: saved.setdefault("state", state))

    resumed = mgr.resume()

    assert resumed is not None
    assert resumed.status == "paused"
    assert resumed.turns_used == 20
    assert resumed.consecutive_parse_failures == 2
    assert saved == {}


def test_webui_goal_command_resume_uses_budget_exhausted_message(monkeypatch):
    from cli.goals import GoalState
    from web.api import goals as goal_api

    class FakeManager:
        def __init__(self):
            self.state = GoalState(
                goal="Ship it",
                status="paused",
                turns_used=20,
                max_turns=20,
                paused_reason="turn budget exhausted (20/20)",
                consecutive_parse_failures=0,
            )

        def resume(self):
            return self.state

    fake_mgr = FakeManager()
    monkeypatch.setattr(goal_api, "_manager", lambda *args, **kwargs: fake_mgr)

    payload = goal_api.goal_command_payload("goal-session", "resume")

    assert payload["goal"]["status"] == "paused"
    assert payload["message_key"] == "goal_paused_budget_exhausted"
    assert payload["message_args"] == [20, "20"]
    assert "turns used" in payload["message"].lower()


def test_webui_goal_command_resume_uses_budget_exhausted_message_without_reason(monkeypatch):
    from cli.goals import GoalState
    from web.api import goals as goal_api

    class FakeManager:
        def __init__(self):
            self.state = GoalState(
                goal="Ship it",
                status="paused",
                turns_used=20,
                max_turns=20,
                paused_reason="",
                consecutive_parse_failures=0,
            )

        def resume(self):
            return self.state

    fake_mgr = FakeManager()
    monkeypatch.setattr(goal_api, "_manager", lambda *args, **kwargs: fake_mgr)

    payload = goal_api.goal_command_payload("goal-session", "resume")

    assert payload["goal"]["status"] == "paused"
    assert payload["message_key"] == "goal_paused_budget_exhausted"
    assert payload["message_args"] == [20, "20"]
    assert "turns used" in payload["message"].lower()


@pytest.mark.parametrize("command", ["pause", "clear"])
def test_queued_goal_continuation_is_rejected_after_pause_or_clear(monkeypatch, command, tmp_path):
    from cli.goals import GoalState
    from web.api import goals as goal_api
    from web.api import routes

    class FakeManager:
        def __init__(self):
            self.state = GoalState(goal="Finish the task", status="active", created_at=42)

        def is_active(self):
            return self.state is not None and self.state.status == "active"

        def next_continuation_prompt(self):
            if not self.is_active():
                return None
            return goal_api.CONTINUATION_PROMPT_TEMPLATE.format(goal=self.state.goal)

        def pause(self, reason="user-paused"):
            self.state.status = "paused"
            self.state.paused_reason = reason
            return self.state

        def has_goal(self):
            return self.state is not None

        def clear(self):
            if self.state is not None:
                self.state.status = "cleared"
            self.state = None

    manager = FakeManager()
    monkeypatch.setattr(goal_api, "_manager", lambda *_args, **_kwargs: manager)
    profile_home = tmp_path / "profile"
    continuation = manager.next_continuation_prompt()
    assert goal_api.queue_goal_continuation(
        "goal-race-session", continuation, profile_home=profile_home, space_slug="work"
    )

    payload = goal_api.goal_command_payload(
        "goal-race-session", command, profile_home=profile_home, space_slug="work"
    )
    assert payload["action"] == command

    class Session:
        session_id = "goal-race-session"
        profile = "default"
        workspace = "workspace"
        workspace_slug = "work"
        space_slug = None
        space = None
        active_stream_id = None

    monkeypatch.setattr(
        "web.api.profiles.get_profile_home", lambda _profile: profile_home
    )
    response = routes._start_chat_stream_for_session(
        Session(),
        msg=continuation,
        workspace="workspace",
        model="model",
        model_provider="provider",
    )

    assert response["error_code"] == "goal_continuation_cancelled"
    assert response["_status"] == 409


def test_pending_goal_continuations_are_isolated_by_session_profile_and_space(monkeypatch, tmp_path):
    from cli.goals import GoalState
    from web.api import goals as goal_api

    class FakeManager:
        def __init__(self, goal):
            self.state = GoalState(goal=goal, status="active")

        def is_active(self):
            return self.state.status == "active"

        def next_continuation_prompt(self):
            if not self.is_active():
                return None
            return goal_api.CONTINUATION_PROMPT_TEMPLATE.format(goal=self.state.goal)

    managers = {}

    def manager_for(session_id, *, profile_home=None, space_slug=None):
        key = (session_id, str(profile_home), space_slug)
        return managers[key]

    monkeypatch.setattr(goal_api, "_manager", manager_for)
    profile_a = tmp_path / "profile-a"
    profile_b = tmp_path / "profile-b"
    managers[("shared-id", str(profile_a), "alpha")] = FakeManager("Goal A")
    managers[("shared-id", str(profile_a), "beta")] = FakeManager("Goal B")
    managers[("other-id", str(profile_a), "alpha")] = FakeManager("Goal C")
    prompt_a = managers[("shared-id", str(profile_a), "alpha")].next_continuation_prompt()
    prompt_b = managers[("shared-id", str(profile_a), "beta")].next_continuation_prompt()
    prompt_c = managers[("other-id", str(profile_a), "alpha")].next_continuation_prompt()

    assert goal_api.queue_goal_continuation("shared-id", prompt_a, profile_home=profile_a, space_slug="alpha")
    assert goal_api.queue_goal_continuation("shared-id", prompt_b, profile_home=profile_a, space_slug="beta")
    assert goal_api.queue_goal_continuation("other-id", prompt_c, profile_home=profile_a, space_slug="alpha")

    assert goal_api.consume_goal_continuation("shared-id", prompt_a, profile_home=profile_a, space_slug="alpha") == "active"
    assert goal_api.consume_goal_continuation("shared-id", prompt_b, profile_home=profile_a, space_slug="beta") == "active"
    assert goal_api.consume_goal_continuation("other-id", prompt_c, profile_home=profile_a, space_slug="alpha") == "active"
    assert goal_api.consume_goal_continuation("shared-id", prompt_a, profile_home=profile_b, space_slug="alpha") == "cancelled"


def test_goal_continuation_recovers_after_backend_restart_from_active_persisted_goal(monkeypatch, tmp_path):
    from web.api import goals as goal_api

    monkeypatch.setattr(goal_api, "_space_goals_path", lambda *_args, **_kwargs: None)
    goal_api._DB_CACHE.clear()
    goal_api._PENDING_CONTINUATIONS.clear()
    goal_api._CANCELLED_CONTINUATIONS.clear()
    profile_home = tmp_path / "profile"
    session_id = "restart-continuation-active"

    created = goal_api.goal_command_payload(
        session_id, "Finish after restarting", profile_home=profile_home,
    )
    assert created["ok"] is True
    prompt = goal_api.CONTINUATION_PROMPT_TEMPLATE.format(goal="Finish after restarting")

    # Simulate a process restart: the goal DB survives, but pending in-memory
    # hand-off state is gone before the renderer POST arrives.
    goal_api._DB_CACHE.clear()
    goal_api._PENDING_CONTINUATIONS.clear()
    goal_api._CANCELLED_CONTINUATIONS.clear()

    assert goal_api.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"


@pytest.mark.parametrize("command", ["pause", "clear"])
def test_orphaned_goal_continuation_after_restart_is_rejected(monkeypatch, tmp_path, command):
    from web.api import goals as goal_api

    monkeypatch.setattr(goal_api, "_space_goals_path", lambda *_args, **_kwargs: None)
    goal_api._DB_CACHE.clear()
    goal_api._PENDING_CONTINUATIONS.clear()
    goal_api._CANCELLED_CONTINUATIONS.clear()
    profile_home = tmp_path / "profile"
    session_id = f"restart-continuation-{command}"
    goal = "Stop this continuation"

    assert goal_api.goal_command_payload(
        session_id, goal, profile_home=profile_home,
    )["ok"] is True
    prompt = goal_api.CONTINUATION_PROMPT_TEMPLATE.format(goal=goal)
    assert goal_api.goal_command_payload(
        session_id, command, profile_home=profile_home,
    )["action"] == command

    # Lose the process-local tombstone and reload only the durable state.
    goal_api._DB_CACHE.clear()
    goal_api._PENDING_CONTINUATIONS.clear()
    goal_api._CANCELLED_CONTINUATIONS.clear()

    assert goal_api.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "cancelled"


def test_resume_kickoff_failure_restores_the_pre_resume_goal(monkeypatch, tmp_path):
    """A failed resume kickoff must not clear the previously paused goal."""
    from types import SimpleNamespace
    from web.api import goals as goal_api
    from web.api import routes

    goal_api._DB_CACHE.clear()
    monkeypatch.setattr(goal_api, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "resume-kickoff-failure"
    assert goal_api.goal_command_payload(
        session_id, "Continue shipping", profile_home=profile_home,
    )["ok"] is True
    paused = goal_api.goal_command_payload(
        session_id, "pause", profile_home=profile_home,
    )
    assert paused["goal"]["status"] == "paused"

    session = SimpleNamespace(
        session_id=session_id,
        profile="default",
        workspace=str(tmp_path),
        model="test-model",
        model_provider="test-provider",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(
        routes,
        "_resolve_compatible_session_model_state",
        lambda _model, _provider: ("test-model", "test-provider", False),
    )
    monkeypatch.setattr(
        routes,
        "_start_chat_stream_for_session",
        lambda *_args, **_kwargs: {"_status": 503, "error": "chat start failed"},
    )
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200, **_kwargs: (status, payload))

    status, payload = routes._handle_goal_command(
        object(),
        {"session_id": session_id, "args": "resume", "workspace": str(tmp_path)},
    )

    assert status == 503
    assert payload["ok"] is False
    goal_api._DB_CACHE.clear()
    restored = goal_api.goal_state_for_session(session_id, profile_home=profile_home)
    assert restored is not None
    assert restored["goal"] == "Continue shipping"
    assert restored["status"] == "paused"


def test_failed_resume_kickoff_does_not_resurrect_goal_cleared_during_start(monkeypatch, tmp_path):
    """A concurrent clear must not be overwritten by failed-kickoff rollback."""
    from types import SimpleNamespace
    from web.api import goals as goal_api
    from web.api import routes

    goal_api._DB_CACHE.clear()
    monkeypatch.setattr(goal_api, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "resume-kickoff-concurrent-clear"
    assert goal_api.goal_command_payload(
        session_id, "Continue shipping", profile_home=profile_home,
    )["ok"] is True
    assert goal_api.goal_command_payload(
        session_id, "pause", profile_home=profile_home,
    )["goal"]["status"] == "paused"

    session = SimpleNamespace(
        session_id=session_id,
        profile="default",
        workspace=str(tmp_path),
        model="test-model",
        model_provider="test-provider",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(
        routes,
        "_resolve_compatible_session_model_state",
        lambda _model, _provider: ("test-model", "test-provider", False),
    )

    def clear_then_fail(*_args, **_kwargs):
        cleared = goal_api.goal_command_payload(
            session_id, "clear", profile_home=profile_home,
        )
        assert cleared["action"] == "clear"
        return {"_status": 503, "error": "chat start failed"}

    monkeypatch.setattr(routes, "_start_chat_stream_for_session", clear_then_fail)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200, **_kwargs: (status, payload))

    status, payload = routes._handle_goal_command(
        object(), {"session_id": session_id, "args": "resume", "workspace": str(tmp_path)},
    )

    assert status == 503
    assert payload["ok"] is False
    goal_api._DB_CACHE.clear()
    assert goal_api.goal_state_for_session(session_id, profile_home=profile_home) is None


def test_failed_resume_kickoff_snapshots_state_atomically_with_resume(monkeypatch, tmp_path):
    """A clear between resume and its rollback snapshot must remain cleared."""
    import threading
    from types import SimpleNamespace
    from web.api import goals as goal_api
    from web.api import routes

    goal_api._DB_CACHE.clear()
    monkeypatch.setattr(goal_api, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session_id = "resume-snapshot-concurrent-clear"
    assert goal_api.goal_command_payload(
        session_id, "Continue shipping", profile_home=profile_home,
    )["ok"] is True
    assert goal_api.goal_command_payload(
        session_id, "pause", profile_home=profile_home,
    )["goal"]["status"] == "paused"

    session = SimpleNamespace(
        session_id=session_id,
        profile="default",
        workspace=str(tmp_path),
        model="test-model",
        model_provider="test-provider",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr(
        routes,
        "_resolve_compatible_session_model_state",
        lambda _model, _provider: ("test-model", "test-provider", False),
    )

    clear_started = threading.Event()
    clear_finished = threading.Event()
    original_goal_command = goal_api.goal_command_payload

    def concurrent_clear_after_resume(sid, args="", **kwargs):
        result = original_goal_command(sid, args, **kwargs)
        if args == "resume":
            def clear_goal():
                clear_started.set()
                original_goal_command(sid, "clear", **kwargs)
                clear_finished.set()

            threading.Thread(target=clear_goal, daemon=True).start()
            assert clear_started.wait(timeout=2)
            # The route must still hold the lifecycle lock while it captures
            # the expected post-resume state.
            assert not clear_finished.wait(timeout=0.1)
        return result

    monkeypatch.setattr(goal_api, "goal_command_payload", concurrent_clear_after_resume)

    def fail_after_concurrent_clear(*_args, **_kwargs):
        assert clear_finished.wait(timeout=2)
        return {"_status": 503, "error": "chat start failed"}

    monkeypatch.setattr(routes, "_start_chat_stream_for_session", fail_after_concurrent_clear)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200, **_kwargs: (status, payload))

    status, payload = routes._handle_goal_command(
        object(), {"session_id": session_id, "args": "resume", "workspace": str(tmp_path)},
    )

    assert status == 503
    assert payload["ok"] is False
    goal_api._DB_CACHE.clear()
    assert goal_api.goal_state_for_session(session_id, profile_home=profile_home) is None


def test_webui_goal_command_passes_custom_and_unlimited_budget(monkeypatch):
    from web.api import goals as goal_api
    from web.api import routes

    class Session:
        session_id = "goal-session"
        profile = "default"
        workspace = "workspace"
        workspace_slug = None
        space_slug = None
        space = None
        active_stream_id = None
        model = "model"
        model_provider = "provider"

    captured = {}

    monkeypatch.setattr(routes, "require", lambda body, key: None)
    monkeypatch.setattr(routes, "get_session", lambda session_id: Session())
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda workspace: workspace)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", lambda model, provider: (model, provider, model))
    monkeypatch.setattr(goal_api, "goal_state_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr(goal_api, "restore_goal_state", lambda *args, **kwargs: None)

    def fake_goal_command_payload(session_id, goal_args, **kwargs):
        captured["session_id"] = session_id
        captured["goal_args"] = goal_args
        captured["kwargs"] = kwargs
        return {"ok": True, "message": "ok", "goal": {"goal": goal_args}, "kickoff_prompt": ""}

    monkeypatch.setattr(goal_api, "goal_command_payload", fake_goal_command_payload)
    monkeypatch.setattr(routes, "j", lambda handler, payload, status=None: {"payload": payload, "status": status})
    monkeypatch.setattr(routes, "bad", lambda handler, message, status=400: {"error": message, "status": status})

    result = routes._handle_goal_command(object(), {
        "session_id": "goal-session",
        "args": "Build it",
        "goal_steps": "37",
    })

    assert captured["session_id"] == "goal-session"
    assert captured["goal_args"] == "Build it"
    assert captured["kwargs"]["max_turns"] == 37
    assert captured["kwargs"]["unlimited"] is False
    assert result["status"] is None

    captured.clear()
    result = routes._handle_goal_command(object(), {
        "session_id": "goal-session",
        "args": "Keep going",
        "goal_unlimited": True,
    })

    assert captured["kwargs"]["max_turns"] is None
    assert captured["kwargs"]["unlimited"] is True
    assert result["status"] is None


def test_webui_goal_command_ignores_blank_max_turns_when_goal_steps_present(monkeypatch):
    from web.api import goals as goal_api
    from web.api import routes

    class Session:
        session_id = "goal-session"
        profile = "default"
        workspace = "workspace"
        workspace_slug = None
        space_slug = None
        space = None
        active_stream_id = None
        model = "model"
        model_provider = "provider"

    captured = {}

    monkeypatch.setattr(routes, "require", lambda body, key: None)
    monkeypatch.setattr(routes, "get_session", lambda session_id: Session())
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda workspace: workspace)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", lambda model, provider: (model, provider, model))
    monkeypatch.setattr(goal_api, "goal_state_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr(goal_api, "restore_goal_state", lambda *args, **kwargs: None)

    def fake_goal_command_payload(session_id, goal_args, **kwargs):
        captured["kwargs"] = kwargs
        return {"ok": True, "message": "ok", "goal": {"goal": goal_args}, "kickoff_prompt": ""}

    monkeypatch.setattr(goal_api, "goal_command_payload", fake_goal_command_payload)
    monkeypatch.setattr(routes, "j", lambda handler, payload, status=None: {"payload": payload, "status": status})
    monkeypatch.setattr(routes, "bad", lambda handler, message, status=400: {"error": message, "status": status})

    result = routes._handle_goal_command(object(), {
        "session_id": "goal-session",
        "args": "Build it",
        "goal_steps": "37",
        "max_turns": "",
    })

    assert captured["kwargs"]["max_turns"] == 37
    assert captured["kwargs"]["unlimited"] is False
    assert result["status"] is None


def test_webui_goal_command_treats_unlimited_string_as_unlimited(monkeypatch):
    from web.api import goals as goal_api
    from web.api import routes

    class Session:
        session_id = "goal-session"
        profile = "default"
        workspace = "workspace"
        workspace_slug = None
        space_slug = None
        space = None
        active_stream_id = None
        model = "model"
        model_provider = "provider"

    captured = {}

    monkeypatch.setattr(routes, "require", lambda body, key: None)
    monkeypatch.setattr(routes, "get_session", lambda session_id: Session())
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda workspace: workspace)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", lambda model, provider: (model, provider, model))
    monkeypatch.setattr(goal_api, "goal_state_snapshot", lambda *args, **kwargs: None)
    monkeypatch.setattr(goal_api, "restore_goal_state", lambda *args, **kwargs: None)

    def fake_goal_command_payload(session_id, goal_args, **kwargs):
        captured["kwargs"] = kwargs
        return {"ok": True, "message": "ok", "goal": {"goal": goal_args}, "kickoff_prompt": ""}

    monkeypatch.setattr(goal_api, "goal_command_payload", fake_goal_command_payload)
    monkeypatch.setattr(routes, "j", lambda handler, payload, status=None: {"payload": payload, "status": status})
    monkeypatch.setattr(routes, "bad", lambda handler, message, status=400: {"error": message, "status": status})

    result = routes._handle_goal_command(object(), {
        "session_id": "goal-session",
        "args": "Build it",
        "goal_steps": "unlimited",
    })

    assert captured["kwargs"]["max_turns"] is None
    assert captured["kwargs"]["unlimited"] is True
    assert result["status"] is None


def test_webui_goal_command_resume_reports_budget_exhausted(monkeypatch):
    from cli.goals import GoalState
    from web.api import goals as goal_api

    class FakeManager:
        def __init__(self):
            self.state = GoalState(
                goal="Ship it",
                status="paused",
                turns_used=20,
                max_turns=20,
                paused_reason="turn budget exhausted (20/20)",
                consecutive_parse_failures=0,
            )

        def resume(self):
            return self.state

    fake_mgr = FakeManager()
    monkeypatch.setattr(goal_api, "_manager", lambda *args, **kwargs: fake_mgr)

    payload = goal_api.goal_command_payload("goal-session", "resume")

    assert payload["goal"]["status"] == "paused"
    assert payload["message_key"] == "goal_paused_budget_exhausted"
    assert payload["message_args"] == [20, "20"]
    assert "turns used" in payload["message"].lower()


def test_cli_goal_command_resume_reports_budget_exhausted(monkeypatch):
    from cli.goals import GoalState
    from cli import cli as cli_module

    class FakeManager:
        def __init__(self):
            self._state = GoalState(
                goal="Ship it",
                status="paused",
                turns_used=20,
                max_turns=20,
                paused_reason="turn budget exhausted (20/20)",
                consecutive_parse_failures=0,
            )

        def resume(self):
            return self._state

        def status_line(self):
            return "  ⏸ Goal (paused, 20/20 turns used, turn budget exhausted (20/20)): Ship it"

    outputs = []
    dummy = type("DummyCLI", (), {"_get_goal_manager": lambda self: FakeManager(), "_pending_input": None})()
    monkeypatch.setattr(cli_module, "_cprint", lambda msg: outputs.append(msg))

    cli_module.SidekickCLI._handle_goal_command(dummy, "/goal resume")

    assert any("paused" in line.lower() for line in outputs)
    assert all("resumed" not in line.lower() for line in outputs)


def test_chat_start_fails_retryably_when_goal_state_cannot_be_read(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import goals, routes

    session = SimpleNamespace(
        session_id="goal-state-unavailable",
        profile="default",
        workspace=str(tmp_path),
        workspace_slug="work",
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _session_id: session)
    monkeypatch.setattr(routes, "resolve_trusted_workspace", lambda value: value)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: tmp_path)
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_profile_db", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        routes,
        "j",
        lambda _handler, payload, status=200, **_kwargs: {**payload, "_status": status},
    )
    monkeypatch.setattr(
        routes.threading,
        "Thread",
        lambda **_kwargs: pytest.fail("chat must not start when goal state is unknown"),
    )

    response = routes._handle_chat_start(object(), {
        "session_id": session.session_id,
        "message": "continue working",
        "workspace": session.workspace,
        "model": session.model,
    })

    assert response["_status"] == 503
    assert response["error_code"] == "goal_state_unavailable"
    assert response["retryable"] is True


def test_goal_command_fails_closed_when_profile_scope_cannot_be_resolved(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import routes

    session = SimpleNamespace(
        session_id="profile-scope-unavailable",
        profile="work",
        workspace=str(tmp_path),
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )
    monkeypatch.setattr(routes, "get_session", lambda _session_id: session)

    def unavailable(_profile):
        raise OSError("profile store unavailable")

    monkeypatch.setattr("web.api.profiles.get_profile_home", unavailable)
    monkeypatch.setattr(
        routes,
        "j",
        lambda _handler, payload, status=200, **_kwargs: {**payload, "_status": status},
    )

    response = routes._handle_goal_command(object(), {
        "session_id": session.session_id,
        "args": "Keep working",
    })

    assert response["_status"] == 503
    assert response["error"] == "goal_state_unavailable"
    assert response["retryable"] is True


@pytest.mark.parametrize("failure_stage", ["continuation", "active_goal"])
def test_stream_start_fails_closed_when_goal_state_is_unknown(monkeypatch, tmp_path, failure_stage):
    from types import SimpleNamespace
    from web.api import routes

    session = SimpleNamespace(
        session_id=f"goal-state-{failure_stage}",
        profile="default",
        workspace_slug="work",
        active_stream_id=None,
    )

    def unavailable(*_args, **_kwargs):
        raise OSError("goal store temporarily unavailable")

    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: tmp_path)
    monkeypatch.setattr(
        "web.api.goals.consume_goal_continuation",
        unavailable if failure_stage == "continuation" else lambda *_args, **_kwargs: "none",
    )
    monkeypatch.setattr(
        "web.api.goals.has_active_goal",
        unavailable if failure_stage == "active_goal" else lambda *_args, **_kwargs: False,
    )

    response = routes._start_chat_stream_for_session(
        session,
        msg="continue working",
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
    )

    assert response["_status"] == 503
    assert response["error_code"] == "goal_state_unavailable"
    assert response["retryable"] is True


def test_unknown_persisted_goal_cannot_fall_through_as_a_continuation_message(monkeypatch):
    from web.api import goals

    monkeypatch.setattr(goals, "_manager", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("store unavailable")))
    prompt = goals.CONTINUATION_PROMPT_TEMPLATE.format(goal="Keep the app stable")

    assert goals.consume_goal_continuation("session-1", prompt) == "cancelled"


def test_cancelled_continuation_is_rejected_even_when_another_goal_is_active(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import routes

    session = SimpleNamespace(
        session_id="replacement-goal-active",
        profile="default",
        workspace_slug="work",
        active_stream_id=None,
    )
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: tmp_path)
    monkeypatch.setattr(
        "web.api.goals.consume_goal_continuation",
        lambda *_args, **_kwargs: "cancelled",
    )
    monkeypatch.setattr(
        routes.threading,
        "Thread",
        lambda **_kwargs: pytest.fail("stale goal continuation must not start a stream"),
    )

    response = routes._start_chat_stream_for_session(
        session,
        msg="[INTERNAL GOAL CONTINUATION] old goal",
        workspace=str(tmp_path),
        model="deepseek-v4.1-flash",
        model_provider="ollama-cloud",
        goal_related=True,
    )

    assert response["_status"] == 409
    assert response["error_code"] == "goal_continuation_cancelled"
