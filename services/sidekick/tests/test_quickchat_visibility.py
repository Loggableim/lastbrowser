from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient

from cli import web_server


QUICK_ID = "a" * 32
CHAT_ID = "c" * 32
SCOPE = {
    "backendProfileId": "11111111-1111-4111-8111-111111111111",
    "spaceId": "22222222-2222-4222-8222-222222222222",
    "browserProfileId": "browser-a",
}


def _rows(workspace: Path):
    return [
        {"session_id": QUICK_ID, "title": "Quickchat", "workspace": str(workspace),
         "session_kind": "quickchat", "quick_chat_id": QUICK_ID, "updated_at": 20},
        {"session_id": CHAT_ID, "title": "Saved chat", "workspace": str(workspace),
         "updated_at": 10},
    ]


def test_normal_session_list_hides_explicit_quickchat_for_all_route_scopes(monkeypatch, tmp_path):
    rows = _rows(tmp_path)

    class FakeDb:
        def list_sessions(self, **_kwargs):
            return [dict(row) for row in rows]

        def close(self):
            pass

    monkeypatch.setattr("runtime._compat.shim_state.SessionDB", FakeDb)
    monkeypatch.setattr(web_server, "_load_space_sessions", lambda _slug: [dict(row) for row in rows])
    monkeypatch.setattr(web_server, "_bound_workspace_sessions", lambda _path: [])
    monkeypatch.setattr(web_server, "_workspace_path_from_request",
        lambda request: tmp_path if request.query_params.get("workspace_path") else None)
    client = TestClient(web_server.app)
    headers = {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN,
        "Cookie": "sidekick_profile=default"}

    for query in ("", "?workspace=research", "?workspace_path=ignored"):
        response = client.get("/api/sessions" + query + "&limit=20" if query else "/api/sessions?limit=20",
            headers=headers)
        assert response.status_code == 200
        payload = response.json()
        assert [row["session_id"] for row in payload["sessions"]] == [CHAT_ID]
        assert payload["total"] == 1

    # Filtering happens before scoped pagination/counts, so the private row
    # cannot consume the ordinary chat's page slot.
    for query in ("?workspace=research", "?workspace_path=ignored"):
        payload = client.get("/api/sessions" + query + "&limit=1&offset=0", headers=headers).json()
        assert [row["session_id"] for row in payload["sessions"]] == [CHAT_ID]
        assert payload["total"] == 1
        assert client.get("/api/sessions" + query + "&limit=1&offset=1", headers=headers).json()["sessions"] == []


def test_default_space_index_source_is_private_filtered_in_slug_and_path_routes(monkeypatch, tmp_path):
    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir()
    rows = _rows(tmp_path)
    for row in rows:
        (sessions_dir / f"{row['session_id']}.json").write_text(json.dumps({
            **row, "messages": [],
        }), encoding="utf-8")
    (sessions_dir / "_index.json").write_text(json.dumps(rows), encoding="utf-8")
    workspace = SimpleNamespace(sessions_dir=sessions_dir)
    monkeypatch.setattr(web_server, "_get_space_workspace", lambda _slug: (workspace, "research"))
    monkeypatch.setattr(web_server, "_repair_stale_space_index", lambda *_args: 0)
    monkeypatch.setattr(web_server, "_bound_workspace_sessions", lambda _path: [])
    monkeypatch.setattr(web_server, "_workspace_path_from_request", lambda request:
        tmp_path if request.query_params.get("workspace_path") else None)
    client = TestClient(web_server.app)
    headers = {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN,
        "Cookie": "sidekick_profile=default"}

    for query in ("?workspace=research", "?workspace_path=ignored"):
        first = client.get("/api/sessions" + query + "&limit=1&offset=0", headers=headers)
        next_page = client.get("/api/sessions" + query + "&limit=1&offset=1", headers=headers)
        assert first.status_code == next_page.status_code == 200
        assert [row["session_id"] for row in first.json()["sessions"]] == [CHAT_ID]
        assert first.json()["total"] == 1 and next_page.json()["sessions"] == []


def test_bound_workspace_scan_filters_before_projection_but_keeps_quickchat_detail(monkeypatch, tmp_path):
    from runtime.independent.contracts import Scope

    scope = Scope.model_validate(SCOPE)
    space_root = tmp_path / "native-space"
    sessions_dir = space_root / "sessions"
    sessions_dir.mkdir(parents=True)
    binding = SimpleNamespace(scope=scope, native_slug="research")
    monkeypatch.setattr(web_server, "_bound_workspace_spaces",
        lambda _workspace: [(binding, space_root, "default")])
    monkeypatch.setattr(web_server, "_load_space_sessions", lambda _slug: [])
    monkeypatch.setattr(web_server, "_workspace_path_from_request", lambda request:
        tmp_path if request.query_params.get("workspace_path") else None)
    for sid, title, markers in (
        (QUICK_ID, "Quickchat", {"session_kind": "quickchat", "quick_chat_id": QUICK_ID}),
        (CHAT_ID, "Saved chat", {}),
    ):
        (sessions_dir / f"{sid}.json").write_text(json.dumps({
            "session_id": sid, "title": title, "profile": "default",
            "workspace": str(tmp_path), "space_scope": scope.model_dump(mode="json", by_alias=True),
            "messages": [], **markers,
        }), encoding="utf-8")

    client = TestClient(web_server.app)
    headers = {web_server._SESSION_HEADER_NAME: web_server._SESSION_TOKEN,
        "Cookie": "sidekick_profile=default"}
    listed = client.get("/api/sessions?workspace_path=ignored&limit=1&offset=0", headers=headers)
    assert listed.status_code == 200
    assert [row["session_id"] for row in listed.json()["sessions"]] == [CHAT_ID]
    assert listed.json()["total"] == 1
    assert client.get("/api/sessions?workspace_path=ignored&limit=1&offset=1", headers=headers).json()["sessions"] == []

    # Hiding a private transcript from ordinary navigation does not break the
    # internal workspace-bound detail read used by the Quickchat surface.
    detail = client.get(f"/api/session?workspace_path=ignored&session_id={QUICK_ID}", headers=headers)
    assert detail.status_code == 200
    detail_session = detail.json().get("session", detail.json())
    assert detail_session["session_kind"] == "quickchat"
    assert detail_session["quick_chat_id"] == QUICK_ID


def test_legacy_session_without_quickchat_metadata_stays_visible():
    assert not web_server._is_private_quickchat_session({"session_id": CHAT_ID, "title": "Legacy"})
    assert web_server._is_private_quickchat_session({"session_id": CHAT_ID, "session_kind": "quickchat"})
    assert web_server._is_private_quickchat_session({"session_id": CHAT_ID, "quick_chat_id": QUICK_ID})
