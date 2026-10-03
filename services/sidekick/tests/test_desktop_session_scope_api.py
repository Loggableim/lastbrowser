from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlencode

import pytest

TestClient = pytest.importorskip("fastapi.testclient").TestClient


def _profile_headers(web_server, profile: str) -> dict[str, str]:
    return {
        web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN,
        "Cookie": f"sidekick_profile={profile}",
    }


def _make_space(profile: str, slug: str, project: Path) -> None:
    from web.api.profiles import clear_request_profile, set_request_profile
    from web.api.space_engine import Space

    token = set_request_profile(profile)
    try:
        Space(slug, slug).save_config({"name": slug, "project_dir": str(project)}, mint_space_id=True)
    finally:
        clear_request_profile(token)


def _write_indexed_session(profile: str, session_id: str, title: str, workspace: Path, *, message: bool) -> None:
    from web.api.profiles import clear_request_profile, set_request_profile
    from web.api.space_engine import DEFAULT_SPACE_SLUG, get_workspace

    token = set_request_profile(profile)
    try:
        owner = get_workspace(DEFAULT_SPACE_SLUG)
        assert owner is not None
        owner.sessions_dir.mkdir(parents=True, exist_ok=True)
        now = 1_800_000_000.0
        messages = ([{"role": "user", "content": "saved user turn"}] if message else [])
        row = {
            "session_id": session_id,
            "title": title,
            "workspace": str(workspace.resolve()),
            "workspace_slug": DEFAULT_SPACE_SLUG,
            "profile": profile,
            "messages": messages,
            "message_count": len(messages),
            "created_at": now,
            "updated_at": now,
        }
        (owner.sessions_dir / f"{session_id}.json").write_text(
            json.dumps(row), encoding="utf-8"
        )
        index_path = owner.sessions_dir / "_index.json"
        index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
        index.append({key: value for key, value in row.items() if key != "messages"})
        index_path.write_text(json.dumps(index), encoding="utf-8")
    finally:
        clear_request_profile(token)


def test_desktop_session_scope_survives_create_rename_reload_and_lists_by_profile_and_space(
    monkeypatch, tmp_path
):
    """Desktop session creation, retrieval, and listing use one profile/Space scope."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from cli import web_server
    from web.api import profiles, space_engine

    profiles.refresh_profile_base_home_from_env()
    space_engine._invalidate_space_cache()

    default_alpha = tmp_path / "projects" / "default-alpha"
    default_beta = tmp_path / "projects" / "default-beta"
    for project in (default_alpha, default_beta):
        project.mkdir(parents=True)
    from web.api.space_engine import DEFAULT_SPACE_SLUG

    _make_space("default", DEFAULT_SPACE_SLUG, default_alpha)
    _make_space("default", "beta", default_beta)
    # The same browser folder can be explicitly trusted in two profiles; the
    # session stores must still remain profile-owned.
    _make_space("work", DEFAULT_SPACE_SLUG, default_alpha)

    # The read-only resolver is exercised elsewhere; this test isolates the
    # profile/storage/filter contract while keeping the request filesystem-free.
    monkeypatch.setattr(
        web_server,
        "_workspace_path_from_request",
        lambda request: Path(request.query_params["workspace_path"]).resolve()
        if request.query_params.get("workspace_path")
        else None,
    )

    client = TestClient(web_server.app)
    headers = _profile_headers(web_server, "default")
    workspace_query = ""

    created_response = client.post(
        f"/api/session/new{workspace_query}",
        headers=headers,
        json={
            "profile": "default",
            "workspace": str(default_alpha),
            "scope_goals_to_workspace": True,
        },
    )
    assert created_response.status_code == 200, created_response.text
    created = created_response.json()["session"]
    session_id = created["session_id"]
    assert created["workspace"] == str(default_alpha.resolve())
    assert created["workspace_slug"] == DEFAULT_SPACE_SLUG
    assert created["goal_space_slug"].startswith("lbws-")

    renamed = client.post(
        f"/api/session/rename{workspace_query}",
        headers=headers,
        json={"session_id": session_id, "title": "Empty scoped fixture"},
    )
    assert renamed.status_code == 200, renamed.text

    fetched = client.get(
        f"/api/session?session_id={session_id}&workspace_path={default_alpha}",
        headers=headers,
    )
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["session"]["session_id"] == session_id
    assert fetched.json()["session"]["goal_space_slug"] == created["goal_space_slug"]
    foreign_profile_detail = client.get(
        f"/api/session?session_id={session_id}&workspace_path={default_alpha}",
        headers=_profile_headers(web_server, "work"),
    )
    assert foreign_profile_detail.status_code == 404

    # The list must include the renamed empty session while keeping persisted
    # nonempty sessions from other Spaces and profiles out of this result.
    _write_indexed_session("default", "default-alpha-nonempty", "Saved alpha turn", default_alpha, message=True)
    _write_indexed_session("default", "default-beta-session", "Beta session", default_beta, message=False)
    work_headers = _profile_headers(web_server, "work")
    _write_indexed_session("work", "work-alpha-session", "Work profile alpha", default_alpha, message=False)

    alpha_rows = client.get(f"/api/sessions?workspace_path={default_alpha}", headers=headers)
    assert alpha_rows.status_code == 200, alpha_rows.text
    alpha_ids = {row["session_id"] for row in alpha_rows.json()["sessions"]}
    assert session_id in alpha_ids
    assert "default-alpha-nonempty" in alpha_ids
    assert "default-beta-session" not in alpha_ids
    assert "work-alpha-session" not in alpha_ids
    work_cannot_load_default_session = client.get(
        f"/api/session?session_id={session_id}&workspace_path={default_alpha}",
        headers=work_headers,
    )
    assert work_cannot_load_default_session.status_code == 404

    beta_rows = client.get(f"/api/sessions?workspace_path={default_beta}", headers=headers)
    assert beta_rows.status_code == 200, beta_rows.text
    assert {row["session_id"] for row in beta_rows.json()["sessions"]} == {"default-beta-session"}

    work_rows = client.get(f"/api/sessions?workspace_path={default_alpha}", headers=work_headers)
    assert work_rows.status_code == 200, work_rows.text
    assert {row["session_id"] for row in work_rows.json()["sessions"]} == {"work-alpha-session"}


def test_legacy_browser_goal_namespace_is_migrated_without_becoming_storage_owner(
    monkeypatch, tmp_path
):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))

    from cli import web_server
    from web.api import goals, profiles, space_engine

    profiles.refresh_profile_base_home_from_env()
    space_engine._invalidate_space_cache()
    workspace = tmp_path / "projects" / "legacy-browser-space"
    workspace.mkdir(parents=True)
    _make_space("default", space_engine.DEFAULT_SPACE_SLUG, workspace)
    monkeypatch.setattr(
        web_server,
        "_workspace_path_from_request",
        lambda request: Path(request.query_params["workspace_path"]).resolve()
        if request.query_params.get("workspace_path")
        else None,
    )

    owner = space_engine.get_workspace(space_engine.DEFAULT_SPACE_SLUG)
    assert owner is not None
    owner.sessions_dir.mkdir(parents=True, exist_ok=True)
    legacy_slug = "lbws-0123456789abcdef0123456789abcdef"
    profile_token = profiles.set_request_profile("default")
    try:
        legacy_goal_manager = goals._manager(
            "legacy-goal-session", space_slug=legacy_slug
        )
        legacy_goal_manager.set("Finish the legacy workspace migration", max_turns=7)
    finally:
        profiles.clear_request_profile(profile_token)

    row = {
        "session_id": "legacy-goal-session",
        "title": "Legacy scoped chat",
        "workspace": str(workspace.resolve()),
        "workspace_slug": legacy_slug,
        "profile": "default",
        "messages": [],
        "message_count": 0,
        "created_at": 1_800_000_000,
        "updated_at": 1_800_000_000,
    }
    (owner.sessions_dir / "legacy-goal-session.json").write_text(json.dumps(row), encoding="utf-8")
    (owner.sessions_dir / "_index.json").write_text(
        json.dumps([{key: value for key, value in row.items() if key != "messages"}]),
        encoding="utf-8",
    )

    response = TestClient(web_server.app).get(
        f"/api/session?session_id=legacy-goal-session&workspace_path={workspace}&messages=0",
        headers=_profile_headers(web_server, "default"),
    )
    assert response.status_code == 200, response.text
    session = response.json()["session"]
    assert session["workspace_slug"] == space_engine.DEFAULT_SPACE_SLUG
    assert session["goal_space_slug"] == legacy_slug
    assert session["goal"]["goal"] == "Finish the legacy workspace migration"
    assert session["goal"]["status"] == "active"
    assert session["goal"]["space"] == legacy_slug
    profile_home = profiles.get_profile_home("default")
    assert goals.goal_state_for_session(
        "legacy-goal-session",
        profile_home=profile_home,
        space_slug=legacy_slug,
    )["goal"] == "Finish the legacy workspace migration"
    assert goals.goal_state_for_session(
        "legacy-goal-session",
        profile_home=profile_home,
        space_slug=space_engine.DEFAULT_SPACE_SLUG,
    ) is None
    persisted = json.loads((owner.sessions_dir / "legacy-goal-session.json").read_text(encoding="utf-8"))
    assert persisted["workspace_slug"] == space_engine.DEFAULT_SPACE_SLUG
    assert persisted["goal_space_slug"] == legacy_slug


def test_desktop_workspace_path_api_rejects_untrusted_profile_path_without_resolver_bypass(
    monkeypatch, tmp_path
):
    """Native session filters must run the real profile-aware trust resolver."""
    base_home = tmp_path / "sidekick-home"
    foreign_workspace = base_home / "profiles" / "work" / "project"
    foreign_workspace.mkdir(parents=True)
    safe_user_home = tmp_path / "user-home"
    safe_user_home.mkdir()
    monkeypatch.setenv("SIDEKICK_HOME", str(base_home))

    from cli import web_server
    from web.api import profiles, workspace

    profiles.refresh_profile_base_home_from_env()
    monkeypatch.setattr(profiles, "_DEFAULT_SIDEKICK_HOME", base_home)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(
        workspace.Path,
        "home",
        classmethod(lambda _cls: safe_user_home),
    )

    query = urlencode({"workspace_path": str(foreign_workspace)})
    response = TestClient(web_server.app).get(
        f"/api/sessions?{query}",
        headers=_profile_headers(web_server, "default"),
    )

    assert response.status_code == 400, response.text
    assert "another profile" in response.json()["detail"].lower()
