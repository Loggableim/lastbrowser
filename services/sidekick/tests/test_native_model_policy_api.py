"""Leaf API proves actual file metadata, native writer reservation and policy CAS."""
import json
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import new_id
from runtime.independent.scope import ScopeError
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import ResourceBusy
from test_model_selection_policy import auto_fixture, draft
from web.api.model_policy import handle_model_policy


def setup(tmp_path, monkeypatch):
    home, scope, sid, store, manager, service = auto_fixture(tmp_path, monkeypatch)
    resolved = manager.resolver.resolve(scope)
    session = SimpleNamespace(session_id=sid, space_scope=scope.model_dump(mode="json", by_alias=True),
        profile="research", workspace=str(resolved.space_root), independent=None)
    path = resolved.space.sessions_dir / (sid + ".json")
    path.write_text(json.dumps({"session_id": sid, "space_scope": session.space_scope, "profile": "research",
        "workspace": session.workspace, "messages": []}), "utf-8")
    hub = ProfileHub(home.parent.parent)
    hub._stores["research"] = store
    monkeypatch.setattr("web.api.independent._service_pair", lambda *_: (manager, None))
    return scope, session, path, hub, manager, store


def test_get_readonly_policy_and_set_real_native_metadata_writer_cas(tmp_path, monkeypatch):
    scope, session, path, hub, manager, store = setup(tmp_path, monkeypatch)
    body = {"space_scope": session.space_scope, "session_id": session.session_id}
    try:
        before = path.read_bytes()
        got = handle_model_policy(session, body, "research", hub)
        assert got["policy"]["mode"] == "fixed" and got["policy"]["revision"] == 0
        assert got["executionAvailability"]["available"] is False and got["status"] == []
        assert path.read_bytes() == before
        request = {**body, "action": "set", "draft": draft(), "expectedRevision": 0, "clientRequestId": new_id()}
        saved = handle_model_policy(session, request, "research", hub)
        assert saved["policy"]["revision"] == 1 and saved["policy"]["mode"] == "auto"
        assert handle_model_policy(session, request, "research", hub)["policy"] == saved["policy"]
        assert all(row["snapshots"] == [] for row in saved["status"])
        assert store.list_leases(active_only=True) == () and path.read_bytes() == before
    finally:
        manager.shutdown()
        hub.close()


def test_other_profile_scope_forged_saved_metadata_and_active_writer_denied(tmp_path, monkeypatch):
    scope, session, path, hub, manager, store = setup(tmp_path, monkeypatch)
    body = {"space_scope": session.space_scope}
    try:
        with pytest.raises(ScopeError):
            handle_model_policy(session, body, "default", hub)
        raw = json.loads(path.read_text("utf-8"))
        raw["space_scope"]["spaceId"] = new_id()
        path.write_text(json.dumps(raw), "utf-8")
        with pytest.raises(ScopeError):
            handle_model_policy(session, body, "research", hub)
        raw["space_scope"] = session.space_scope
        path.write_text(json.dumps(raw), "utf-8")
        lease = store.acquire_chat_writer(scope, session.session_id, "other-live-turn", manager.generation)
        with pytest.raises(ResourceBusy):
            handle_model_policy(session, {**body, "action": "set", "draft": draft(), "expectedRevision": 0, "clientRequestId": new_id()}, "research", hub)
        store.release_lease(lease["leaseId"], owner_generation=manager.generation)
    finally:
        manager.shutdown()
        hub.close()


def test_client_cannot_supply_selection_dispatch_or_claim_authority(tmp_path, monkeypatch):
    _, session, _, hub, manager, _ = setup(tmp_path, monkeypatch)
    try:
        for extra in ({"action": "select"}, {"actor": "research"}, {"decisionId": new_id()}, {"draft": {}}):
            with pytest.raises(ValueError):
                handle_model_policy(session, {"space_scope": session.space_scope, **extra}, "research", hub)
    finally:
        manager.shutdown()
        hub.close()
