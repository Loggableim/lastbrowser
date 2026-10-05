from pathlib import Path

from fastapi.testclient import TestClient
from test_desktop_session_scope_api import _make_space, _profile_headers


def test_http_session_new_legacy_storage_survives_reload_without_ambient_mirror(monkeypatch, tmp_path):
    """The ordinary HTTP endpoint keeps legacy sessions in the selected Space store."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "home"))
    from cli import web_server
    from web.api import profiles, space_engine
    from web.api.models import get_session

    profiles.refresh_profile_base_home_from_env()
    space_engine._invalidate_space_cache()
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    _make_space("default", space_engine.DEFAULT_SPACE_SLUG, workspace)
    client = TestClient(web_server.app)
    response = client.post("/api/session/new", headers=_profile_headers(web_server, "default"),
                           json={"profile": "default", "workspace": str(workspace)})
    assert response.status_code == 200, response.text
    session_id = response.json()["session"]["session_id"]
    loaded = get_session(session_id)
    assert loaded is not None
    assert Path(loaded.path).parent.name == "sessions"
    assert Path(loaded.path).parent == Path(tmp_path / "home" / "state" / "webui" / "sessions")
    assert not (Path(loaded.workspace) / "nova" / "sessions" / f"{session_id}.json").exists()

    # Reload under an unrelated ambient profile must not change the persisted owner.
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "foreign"))
    reloaded = get_session(session_id)
    assert reloaded is not None
    assert Path(reloaded.path) == Path(loaded.path)
