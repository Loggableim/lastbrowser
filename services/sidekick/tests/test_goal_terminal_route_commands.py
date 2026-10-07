"""Route-level regression for terminal goal controls not starting chat streams."""
from types import SimpleNamespace

import pytest


@pytest.mark.parametrize("command", ["complete", "cancel"])
def test_terminal_goal_control_does_not_resolve_kickoff_or_start_stream(
    monkeypatch, tmp_path, command,
):
    from web.api import goals, routes

    goals._DB_CACHE.clear()
    monkeypatch.setattr(goals, "_space_goals_path", lambda *_args, **_kwargs: None)
    profile_home = tmp_path / "profile"
    session = SimpleNamespace(
        session_id=f"terminal-{command}",
        profile="default",
        workspace=str(tmp_path),
        workspace_slug=None,
        space_slug=None,
        space=None,
        goal_space_slug=None,
        model="test-model",
        model_provider="test-provider",
        active_stream_id=None,
        messages=[],
        context_messages=[],
        pending_user_message=None,
    )

    monkeypatch.setattr(routes, "require", lambda _body, _key: None)
    monkeypatch.setattr(routes, "get_session", lambda _sid: session)
    monkeypatch.setattr("web.api.profiles.get_profile_home", lambda _profile: profile_home)

    def forbidden(*_args, **_kwargs):
        pytest.fail("terminal goal control entered provider kickoff path")

    monkeypatch.setattr(routes, "resolve_trusted_workspace", forbidden)
    monkeypatch.setattr(routes, "_resolve_compatible_session_model_state", forbidden)
    monkeypatch.setattr(routes, "_start_chat_stream_for_session", forbidden)
    monkeypatch.setattr(routes, "j", lambda _handler, payload, status=200, **_kw: (status, payload))

    assert goals.goal_command_payload(
        session.session_id, "Create test goal", profile_home=profile_home,
    )["ok"] is True

    status, payload = routes._handle_goal_command(
        object(),
        {"session_id": session.session_id, "args": command},
    )

    assert status == 200
    assert payload["ok"] is True
    assert payload["action"] == ("complete" if command == "complete" else "clear")
    goals._DB_CACHE.clear()
