"""Real profile stores and registry mutations; transport acknowledgements controlled."""
import json
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import Scope, new_id
from runtime.independent.manager import RunManager
from runtime.independent.scope import ScopeError, ScopeResolver
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.space_lifecycle import legacy_removal_requires_scope, retire_workspace
from runtime.independent.store import ResourceBusy


@pytest.fixture
def owners(tmp_path):
    home, state = tmp_path / "home", tmp_path / "state"
    home.mkdir()
    state.mkdir()
    paths = [tmp_path / value for value in ("A", "B")]
    for path in paths:
        path.mkdir()
    registry = state / "workspaces.json"
    registry.write_text(json.dumps([{"path": str(path), "name": path.name} for path in paths]), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    scopes = [Scope.model_validate(hub.bind("default", {"workspacePath": str(path), "browserProfileId": browser,
        "partitionKey": "persist:lifecycle-" + str(i)})["scope"])
        for i, (path, browser) in enumerate(((paths[0], "browser-a"), (paths[0], "browser-b"), (paths[1], "browser-a")))]
    store = hub.get("default")
    manager = RunManager(store, ScopeResolver(store, profiles_provider=hub.profiles))
    cancelled = []
    assistant = SimpleNamespace(cancel_scope=cancelled.append)
    yield hub, store, manager, assistant, scopes, paths, registry, cancelled
    manager.shutdown()
    hub.close()


def test_all_browser_owners_retire_but_other_space_and_data_survive(owners):
    hub, store, manager, assistant, scopes, paths, registry, cancelled = owners
    foreign = store.get_binding(scopes[2])
    before = registry.read_bytes()
    receipts = retire_workspace(profile_hub=hub, actor="default", raw_scope=scopes[0].model_dump(by_alias=True),
        workspace=str(paths[0]), service_pair=lambda *args: (manager, assistant))
    assert len(receipts) == 2 and all(row["acknowledged"] for row in receipts)
    assert all(store.get_binding(scope).tombstoned_at for scope in scopes[:2])
    assert store.get_binding(scopes[2]) == foreign
    assert registry.read_bytes() == before and all(path.is_dir() for path in paths)
    epochs = [store.get_permission_state(scope)["controlEpoch"] for scope in scopes[:2]]
    retire_workspace(profile_hub=hub, actor="default", raw_scope=scopes[0].model_dump(by_alias=True),
        workspace=str(paths[0]), service_pair=lambda *args: (manager, assistant))
    assert epochs == [store.get_permission_state(scope)["controlEpoch"] for scope in scopes[:2]]
    assert set(scope.key for scope in cancelled) == set(scope.key for scope in scopes[:2])
    assert legacy_removal_requires_scope(store.profile_home, str(paths[0]))


@pytest.mark.parametrize("foreign", ["path", "profile", "scope"])
def test_invalid_authority_cannot_tombstone_any_binding(owners, foreign):
    hub, store, manager, assistant, scopes, paths, *_ = owners
    raw = scopes[0].model_dump(by_alias=True)
    actor, path = "default", str(paths[0])
    if foreign == "path": path = str(paths[1])
    if foreign == "profile": actor = "missing"
    if foreign == "scope": raw = {**raw, "backendProfileId": new_id()}
    before = store.list_bindings()
    with pytest.raises(ScopeError):
        retire_workspace(profile_hub=hub, actor=actor, raw_scope=raw, workspace=path,
                         service_pair=lambda *args: (manager, assistant))
    assert store.list_bindings() == before


def test_route_keeps_registry_until_ack_and_requires_private_scope(owners, monkeypatch):
    from web.api import independent as api, profiles, routes
    hub, store, manager, assistant, scopes, paths, registry, _ = owners
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", "controlled-private-bridge")
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "default")
    monkeypatch.setattr(routes, "get_active_webui_home", lambda: store.profile_home)
    monkeypatch.setattr(routes, "load_workspaces", lambda: json.loads(registry.read_text(encoding="utf-8")))
    monkeypatch.setattr(routes, "save_workspaces", lambda rows: registry.write_text(json.dumps(rows), encoding="utf-8"))
    monkeypatch.setattr(routes, "j", lambda handler, body, status=200: (status, body))
    monkeypatch.setattr(api, "_service_pair", lambda *args: (manager, assistant))
    body = {"path": str(paths[0]), "space_scope": scopes[0].model_dump(by_alias=True)}
    private = SimpleNamespace(headers={"X-Lastbrowser-Bridge-Token": "controlled-private-bridge"})
    before = registry.read_bytes()
    assert routes._handle_workspace_remove(SimpleNamespace(headers={}), body)[0] == 403
    assert routes._handle_workspace_remove(private, {"path": str(paths[0])})[0] == 403
    actual_retire = manager.retire_scope
    def lost_ack(*args, **kwargs):
        return {**actual_retire(*args, **kwargs), "acknowledged": False}
    monkeypatch.setattr(manager, "retire_scope", lost_ack)
    assert routes._handle_workspace_remove(private, body)[0] == 409
    assert registry.read_bytes() == before and store.get_binding(scopes[0]).tombstoned_at
    monkeypatch.setattr(manager, "retire_scope", actual_retire)
    assert routes._handle_workspace_remove(private, body)[0] == 200
    assert json.loads(registry.read_text(encoding="utf-8")) == [{"path": str(paths[1]), "name": "B"}]
    assert paths[0].is_dir() and store.get_binding(scopes[2]).tombstoned_at is None
