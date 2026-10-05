"""Real ASGI contracts; deterministic replies do not prove model quality."""
import json
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.independent.assistant import SpaceAssistant
from runtime.independent.contracts import Scope, new_id
from runtime.independent.scope import ScopeResolver
from runtime.independent.scope_binding import ProfileHub


@pytest.fixture
def broker(tmp_path, monkeypatch):
    from web.api import independent as api
    from web.api import profiles
    home = tmp_path / "home"
    home.mkdir()
    state = home / "webui"
    state.mkdir()
    paths = [tmp_path / name for name in ("A", "B", "foreign-browser")]
    for path in paths:
        path.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(path), "name": path.name} for path in paths]), encoding="utf-8")
    profile_hub = ProfileHub(home, default_state_dir=state)
    scopes = [Scope.model_validate(profile_hub.bind("default", {"workspacePath": str(path), "browserProfileId": "foreign" if i == 2 else "browser-a", "partitionKey": "persist:controlled-" + str(i)})["scope"]) for i, path in enumerate(paths)]
    store, resolver = profile_hub.by_scope(scopes[0], "default")
    manager = SimpleNamespace(activity=store.activity_snapshot, attach_gateway=lambda gateway: None, interrupt_active=lambda reason: None)
    assistant = SpaceAssistant(store, resolver, manager, model=lambda *args: json.dumps({"message": "Controlled reply"}))
    secret = "bridge-" + new_id()
    monkeypatch.setattr(api, "_hub", profile_hub)
    monkeypatch.setattr(api, "_services", {store.backend_profile_id: (manager, assistant)})
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)
    monkeypatch.setattr(api, "_selections", {})
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        def post(operation, *, scope=scopes[0], payload=None, authorized=True):
            return client.post("/api/independent/v1/" + operation,
                               headers={"X-Lastbrowser-Bridge-Token": secret} if authorized else {},
                               json={"schemaVersion": 1, "scope": scope.model_dump(by_alias=True) if scope else None, "payload": payload or {}})
        yield api, client, post, scopes, store, manager, secret
    assistant.shutdown()
    profile_hub.close()


def test_private_bridge_is_required_before_scope_or_operation(broker):
    _, client, post, *_ = broker
    response = post("assistantSnapshot", authorized=False)
    assert response.status_code == 403 and response.json()["error"]["code"] == "native_bridge_required"
    assert client.get("/api/independent/v1/assistantSnapshot").status_code == 405


def test_actual_router_snapshot_and_events_are_scoped_and_versioned(broker):
    _, _, post, scopes, *_ = broker
    response = post("assistantSnapshot")
    assert response.status_code == 200
    assert response.json()["schemaVersion"] == 1 and response.json()["scope"] == scopes[0].model_dump(by_alias=True)
    assert post("events", payload={"after": 0}).status_code == 200
    assert post("notAnOperation").status_code == 400


def test_private_reset_preview_apply_and_retry_do_not_touch_foreign_space(broker):
    _, _, post, scopes, store, *_ = broker
    state = store.ensure_assistant(scopes[0])
    foreign = store.ensure_assistant(scopes[1])
    body = {"mode": "preview", "action": "reset_assistant", "expectedRevision": state.revision}
    assert post("assistantReset", payload=body, authorized=False).status_code == 403
    preview = post("assistantReset", payload=body)
    assert preview.status_code == 200 and preview.json()["scope"] == scopes[0].model_dump(by_alias=True)
    apply = {**body, "mode": "apply", "previewDigest": preview.json()["previewDigest"], "clientRequestId": new_id()}
    result = post("assistantReset", payload=apply)
    assert result.status_code == 200 and result.json()["revision"] == state.revision + 1
    assert post("assistantReset", payload=apply).json() == result.json()
    assert store.get_assistant(scopes[1]) == foreign


def test_foreign_profile_and_stale_interview_cannot_mutate(broker):
    _, _, post, scopes, store, *_ = broker
    foreign = scopes[0].model_copy(update={"backend_profile_id": new_id()})
    assert post("assistantSnapshot", scope=foreign).status_code == 403
    state = store.ensure_assistant(scopes[0])
    response = post("interviewStart", payload={"expectedRevision": state.revision + 10, "clientRequestId": new_id()})
    assert response.status_code == 409 and store.get_assistant(scopes[0]).revision == state.revision


def test_global_overview_filters_foreign_browser_and_does_not_create_binding(broker):
    _, _, post, scopes, store, *_ = broker
    before = store.list_bindings()
    response = post("globalActivity")
    assert response.status_code == 200
    result = response.json()
    assert {row["scope"]["spaceId"] for row in result["spaces"]} == {scope.space_id for scope in scopes[:2]}
    assert all(row["activity"]["scope"]["browserProfileId"] == "browser-a" for row in result["spaces"])
    assert store.list_bindings() == before


def test_selected_page_context_is_main_capture_only_and_expires(broker):
    api, _, post, scopes, *_ = broker
    response = post("selectedContext", payload={"content": {"selection": "Controlled page"}, "guestWebContentsId": 42, "navigationEpoch": 3})
    assert response.status_code == 200
    ref = response.json()["ref"]
    assert api._selected_contexts(scopes[0], [ref])[0]["selection"] == "Controlled page"
    assert post("assistantTurn", payload={"selectedContext": "forged"}).status_code == 403
    with pytest.raises(PermissionError):
        api._selected_contexts(scopes[1], [ref])
    api._selections[ref]["expires"] = 0
    with pytest.raises(PermissionError):
        api._selected_contexts(scopes[0], [ref])


def test_lost_main_heartbeat_removes_dispatch_authority_once(broker, monkeypatch):
    api, _, post, _, _, manager, _ = broker
    calls = []
    manager.attach_gateway = lambda gateway: calls.append(("attach", gateway))
    manager.interrupt_active = lambda reason: calls.append(("interrupt", reason))
    monkeypatch.setattr(api, "_gateway", object())
    monkeypatch.setattr(api, "_main_generation", "controlled-main")
    monkeypatch.setattr(api, "_last_heartbeat", 100.0)
    assert not api.poll_browser_liveness(115.0)
    assert api.poll_browser_liveness(115.1) and api._gateway is None
    assert calls == [("attach", None), ("interrupt", "main_heartbeat_lost")]
    assert not api.poll_browser_liveness(120.0)
    assert post("browser.heartbeat", scope=None, payload={"mainGeneration": "controlled-main"}).status_code == 403
