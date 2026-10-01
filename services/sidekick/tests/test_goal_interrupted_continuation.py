"""Recovery when a claimed persistent-goal turn never reaches evaluation."""


def _prepare_claimed_continuation(monkeypatch, tmp_path):
    from web.api import goals

    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(goals, "_DB_CACHE", {})
    monkeypatch.setattr(goals, "_PENDING_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_CANCELLED_CONTINUATIONS", {})
    monkeypatch.setattr(goals, "_IN_FLIGHT_CONTINUATIONS", set())
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profiles" / "work"
    session_id = "interrupted-goal-session"

    assert goals.goal_command_payload(
        session_id, "Finish the persistent task", profile_home=profile_home,
    )["ok"] is True
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: ("continue", "more work", False))
    decision = goals.evaluate_goal_after_turn(
        session_id, "The first step is done.", profile_home=profile_home,
    )
    prompt = decision["continuation_prompt"]
    assert prompt
    assert goals.queue_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) is True
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"
    claim_turn = goals.goal_continuation_claim_turn(
        session_id, profile_home=profile_home,
    )
    assert claim_turn == 1
    return goals, session_id, profile_home, prompt, claim_turn


def _queue_prompt_for_route_retry(goals, session_id, profile_home, prompt):
    """Undo the fixture's direct consume so the route can claim the prompt."""
    goals._IN_FLIGHT_CONTINUATIONS.clear()
    manager = goals._manager(session_id, profile_home=profile_home)
    manager.state.consumed_continuation_turn = manager.state.turns_used - 1
    manager._save(manager.state)
    assert goals.queue_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) is True


def test_cancelled_goal_continuation_rearms_the_same_turn(monkeypatch, tmp_path):
    goals, session_id, profile_home, prompt, claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )

    # Streaming finalization also runs after cancellation. Since no evaluator
    # advanced turns_used, it releases the idempotency claim for one retry.
    assert goals.finish_goal_continuation(
        session_id, claim_turn=claim_turn, profile_home=profile_home,
    ) is True
    goals._DB_CACHE.clear()
    recovered = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert recovered["status"] == "active"
    assert recovered["continuation_prompt"] == prompt
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "cancelled"


def test_backend_restart_rearms_claim_only_after_process_inflight_state_is_lost(monkeypatch, tmp_path):
    goals, session_id, profile_home, prompt, _claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    # While the worker is live, a session refresh cannot steal its claim.
    current = goals.goal_state_for_session(
        session_id, profile_home=profile_home, recover_incomplete=True,
    )
    assert "continuation_prompt" not in current

    # Simulate a process restart: the durable claim remains, but all process-
    # local worker/DB state is gone. An idle session read now repairs the claim.
    goals._IN_FLIGHT_CONTINUATIONS.clear()
    goals._DB_CACHE.clear()
    recovered = goals.goal_state_for_session(
        session_id, profile_home=profile_home, recover_incomplete=True,
    )
    assert recovered["status"] == "active"
    assert recovered["continuation_prompt"] == prompt
    assert goals.goal_continuation_claim_turn(
        session_id, profile_home=profile_home,
    ) is None
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"


def test_old_worker_finalizer_cannot_rearm_a_later_goal_turn(monkeypatch, tmp_path):
    goals, session_id, profile_home, _prompt, old_claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    monkeypatch.setattr(goals, "judge_goal", lambda *_args, **_kwargs: ("continue", "keep going", False))
    decision = goals.evaluate_goal_after_turn(
        session_id, "The continuation completed one more step.", profile_home=profile_home,
        user_initiated=False,
    )
    next_prompt = decision["continuation_prompt"]
    assert next_prompt
    assert goals.queue_goal_continuation(
        session_id, next_prompt, profile_home=profile_home,
    ) is True

    # The previous worker may finish its cleanup after the evaluator has
    # advanced state. That cleanup must not release the next turn's prompt.
    assert goals.finish_goal_continuation(
        session_id, claim_turn=old_claim_turn, profile_home=profile_home,
    ) is False
    goals._DB_CACHE.clear()
    state = goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )
    assert state["turns_used"] == 2
    assert state["continuation_prompt"] == next_prompt


def test_worker_without_registered_stream_releases_claim(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import streaming
    from web.api import routes

    goals, session_id, profile_home, prompt, claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    monkeypatch.setattr(streaming, "STREAMS", {})
    stale = SimpleNamespace(
        active_stream_id="missing-stream-channel",
        pending_user_message=prompt,
        messages=[],
    )
    clear_options = []
    monkeypatch.setattr("web.api.models.get_session", lambda *_args, **_kwargs: stale)
    monkeypatch.setattr(
        routes,
        "_clear_stale_stream_state",
        lambda current, **kwargs: clear_options.append(kwargs),
    )

    # This is the worker's earliest exit: its channel disappeared before the
    # thread got CPU time, so neither provider work nor the normal finally can
    # run. The claim still needs to be released for a retry.
    streaming._run_agent_streaming(
        session_id,
        prompt,
        "test-model",
        str(tmp_path),
        "missing-stream-channel",
        goal_related=True,
        goal_claim_turn=claim_turn,
        goal_claim_profile_home=profile_home,
    )

    recovered = goals.goal_state_for_session(session_id, profile_home=profile_home)
    assert recovered["continuation_prompt"] == prompt
    assert goals.goal_continuation_claim_turn(
        session_id, profile_home=profile_home,
    ) is None
    assert clear_options == [{"materialize_pending": False}]
    assert stale.messages == []


def test_thread_start_failure_releases_claim_and_removes_stream(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import routes

    goals, session_id, profile_home, prompt, _claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    _queue_prompt_for_route_retry(goals, session_id, profile_home, prompt)
    monkeypatch.setattr(routes, "STREAMS", {})
    monkeypatch.setattr(routes, "STREAM_GOAL_RELATED", {})
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "activate_kanban_orchestration", lambda *_args: None)
    monkeypatch.setattr(routes, "_resolve_cli_toolsets", lambda: [])
    monkeypatch.setattr(routes, "set_last_workspace", lambda _workspace: None)

    session = SimpleNamespace(
        session_id=session_id, profile="work", workspace_slug=None,
        space_slug=None, space=None, active_stream_id=None,
        pending_user_message=None, pending_started_at=1.0, messages=[],
    )

    def prepare(_session, *, stream_id, **_kwargs):
        session.active_stream_id = stream_id
        session.pending_user_message = prompt
        session.pending_started_at = 1.0

    monkeypatch.setattr(routes, "_prepare_chat_start_session_for_stream", prepare)
    materialize_attempts = []

    def clear_stale(current, *, materialize_pending=True):
        materialize_attempts.append(materialize_pending)
        if materialize_pending and current.pending_user_message:
            current.messages.append({"role": "user", "content": current.pending_user_message})
        current.active_stream_id = None
        current.pending_user_message = None

    monkeypatch.setattr(routes, "_clear_stale_stream_state", clear_stale)
    monkeypatch.setattr(routes, "create_stream_channel", lambda: object())

    class FailingThread:
        def __init__(self, **_kwargs):
            pass

        def start(self):
            raise RuntimeError("thread could not start")

    monkeypatch.setattr(routes.threading, "Thread", FailingThread)

    import pytest
    with pytest.raises(RuntimeError, match="thread could not start"):
        routes._start_chat_stream_for_session(
            session,
            msg=prompt,
            workspace=str(tmp_path),
            model="test-model",
        )

    assert routes.STREAMS == {}
    assert routes.STREAM_GOAL_RELATED == {}
    assert session.active_stream_id is None
    assert materialize_attempts == [False]
    assert session.messages == []
    recovered = goals.goal_state_for_session(session_id, profile_home=profile_home)
    assert recovered["continuation_prompt"] == prompt

    # Retry the same internal continuation. Startup should now succeed and the
    # control prompt must still not have become a visible user transcript row.
    class WorkingThread:
        def __init__(self, **_kwargs):
            pass

        def start(self):
            return None

    monkeypatch.setattr(routes.threading, "Thread", WorkingThread)
    retry = routes._start_chat_stream_for_session(
        session,
        msg=prompt,
        workspace=str(tmp_path),
        model="test-model",
    )
    assert retry["session_id"] == session_id
    assert session.messages == []


def test_pending_session_save_failure_releases_claim(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import routes

    goals, session_id, profile_home, prompt, _claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    _queue_prompt_for_route_retry(goals, session_id, profile_home, prompt)
    monkeypatch.setattr(routes, "STREAMS", {})
    monkeypatch.setattr(routes, "STREAM_GOAL_RELATED", {})
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)
    monkeypatch.setattr(routes, "activate_kanban_orchestration", lambda *_args: None)
    monkeypatch.setattr(routes, "_resolve_cli_toolsets", lambda: [])
    clear_options = []
    monkeypatch.setattr(
        routes,
        "_clear_stale_stream_state",
        lambda current, **kwargs: clear_options.append(kwargs) or setattr(current, "active_stream_id", None),
    )

    session = SimpleNamespace(
        session_id=session_id, profile="work", workspace_slug=None,
        space_slug=None, space=None, active_stream_id=None,
        pending_user_message=None, pending_started_at=1.0,
    )

    def fail_during_save(_session, *, stream_id, **_kwargs):
        session.active_stream_id = stream_id
        raise OSError("session save failed")

    monkeypatch.setattr(routes, "_prepare_chat_start_session_for_stream", fail_during_save)

    import pytest
    with pytest.raises(OSError, match="session save failed"):
        routes._start_chat_stream_for_session(
            session,
            msg=prompt,
            workspace=str(tmp_path),
            model="test-model",
        )

    recovered = goals.goal_state_for_session(session_id, profile_home=profile_home)
    assert recovered["continuation_prompt"] == prompt
    assert routes.STREAMS == {}
    assert clear_options == [{"materialize_pending": False}]


def test_provider_error_rearms_goal_without_persisting_control_prompt(monkeypatch, tmp_path):
    from types import SimpleNamespace
    from web.api import streaming

    goals, session_id, profile_home, prompt, claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    session = SimpleNamespace(
        pending_user_message=prompt,
        pending_attachments=[],
        pending_started_at=123.0,
        messages=[],
    )

    # Mirror both provider-error branches: preserve the assistant error for UI
    # inspection, but do not turn the internal continuation prompt into a user
    # history row that will be duplicated when the goal retries it.
    assert streaming._materialize_pending_user_turn_before_error(
        session, internal_goal_continuation=True,
    ) is False
    ordinary_session = SimpleNamespace(
        pending_user_message="My ordinary user request",
        pending_attachments=[],
        pending_started_at=124.0,
        messages=[],
    )
    assert streaming._materialize_pending_user_turn_before_error(ordinary_session) is True
    assert ordinary_session.messages[0]["content"] == "My ordinary user request"
    session.pending_user_message = None
    session.messages.append({
        "role": "assistant", "content": "**Error:** provider unavailable", "_error": True,
    })
    assert goals.finish_goal_continuation(
        session_id, claim_turn=claim_turn, profile_home=profile_home,
    ) is True

    state = goals.goal_state_for_session(session_id, profile_home=profile_home)
    assert state["continuation_prompt"] == prompt
    assert not any(m.get("role") == "user" and m.get("content") == prompt for m in session.messages)
    assert streaming._sanitize_messages_for_api(session.messages) == []
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"


def test_cancelled_goal_stream_does_not_persist_internal_user_or_cancel_marker(monkeypatch, tmp_path):
    import contextlib
    import threading
    from types import SimpleNamespace
    from web.api import config, streaming

    goals, session_id, profile_home, prompt, claim_turn = _prepare_claimed_continuation(
        monkeypatch, tmp_path,
    )
    stream_id = "cancelled-goal-stream"
    stream = SimpleNamespace(items=[])

    def put_nowait(item):
        stream.items.append(item)

    stream.put_nowait = put_nowait
    cancel_flag = threading.Event()
    session = SimpleNamespace(
        session_id=session_id,
        profile="work",
        pending_user_message=prompt,
        pending_attachments=[],
        pending_started_at=123.0,
        active_stream_id=stream_id,
        messages=[],
        save=lambda: None,
    )

    class Agent:
        def __init__(self):
            self.session_id = session_id

        def interrupt(self, _reason):
            pass

    stream_map = {stream_id: stream}
    flags = {stream_id: cancel_flag}
    agents = {stream_id: Agent()}
    goal_claims = {
        stream_id: {
            "session_id": session_id,
            "claim_turn": claim_turn,
            "profile_home": profile_home,
            "space_slug": None,
        }
    }
    monkeypatch.setattr(config, "STREAMS", stream_map)
    monkeypatch.setattr(config, "CANCEL_FLAGS", flags)
    monkeypatch.setattr(config, "AGENT_INSTANCES", agents)
    monkeypatch.setattr(config, "STREAM_GOAL_CLAIMS", goal_claims)
    monkeypatch.setattr(config, "STREAM_PARTIAL_TEXT", {})
    monkeypatch.setattr(config, "STREAM_REASONING_TEXT", {})
    monkeypatch.setattr(config, "STREAM_LIVE_TOOL_CALLS", {})
    monkeypatch.setattr(config, "STREAMS_LOCK", threading.RLock())
    monkeypatch.setattr(streaming, "STREAMS", stream_map)
    monkeypatch.setattr(streaming, "CANCEL_FLAGS", flags)
    monkeypatch.setattr(streaming, "AGENT_INSTANCES", agents)
    monkeypatch.setattr(streaming, "STREAM_GOAL_CLAIMS", goal_claims)
    monkeypatch.setattr(streaming, "STREAM_PARTIAL_TEXT", config.STREAM_PARTIAL_TEXT)
    monkeypatch.setattr(streaming, "STREAM_REASONING_TEXT", config.STREAM_REASONING_TEXT)
    monkeypatch.setattr(streaming, "STREAM_LIVE_TOOL_CALLS", config.STREAM_LIVE_TOOL_CALLS)
    monkeypatch.setattr(streaming, "STREAMS_LOCK", config.STREAMS_LOCK)
    monkeypatch.setattr(streaming, "get_session", lambda *_args, **_kwargs: session)
    monkeypatch.setattr(streaming, "_get_session_agent_lock", lambda *_args: contextlib.nullcontext())

    assert streaming.cancel_stream(stream_id) is True
    assert session.pending_user_message is None
    assert session.messages == []
    assert stream_id not in goal_claims

    # The worker's finally releases the claim after cancellation; the same
    # prompt is then eligible for retry, with no duplicate transcript context.
    assert goals.finish_goal_continuation(
        session_id, claim_turn=claim_turn, profile_home=profile_home,
    ) is True
    assert goals.goal_state_for_session(
        session_id, profile_home=profile_home,
    )["continuation_prompt"] == prompt
    assert goals.consume_goal_continuation(
        session_id, prompt, profile_home=profile_home,
    ) == "active"
