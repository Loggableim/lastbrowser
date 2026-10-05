import json
from pathlib import Path

import pytest
import yaml

from runtime.independent.scope import ScopeError
from runtime.independent.scope_binding import ProfileHub


def setup(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    state = home / "webui"
    state.mkdir()
    workspace = tmp_path / "work"
    workspace.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "Research"}]), encoding="utf-8")
    return ProfileHub(home, default_state_dir=state), home, workspace


def bind(hub, workspace, **kwargs):
    return hub.bind("default", {"workspacePath": str(workspace), "browserProfileId": "browser-a", "partitionKey": "persist:historic-a", **kwargs})


def test_explicit_bind_uses_existing_engine_id_and_preserves_partition(tmp_path):
    hub, home, workspace = setup(tmp_path)
    first = bind(hub, workspace)
    second = bind(hub, workspace)
    assert first == second and first["partitionKey"] == "persist:historic-a"
    from runtime.independent.contracts import Scope
    scope = Scope.model_validate(first["scope"])
    store, resolver = hub.by_scope(scope, "default")
    resolved = resolver.resolve(scope)
    assert resolved.space.load_config()["space_id"] == scope.space_id
    assert (resolved.space.agents_dir / "default" / "SOUL.md").is_file()
    hub.close()
    reopened = ProfileHub(home, default_state_dir=home / "webui")
    assert bind(reopened, workspace)["scope"] == first["scope"]
    reopened.close()


def test_unknown_profile_and_workspace_never_fall_back(tmp_path):
    hub, _, workspace = setup(tmp_path)
    with pytest.raises(ScopeError):
        hub.get("deleted-profile")
    foreign = tmp_path / "foreign"
    foreign.mkdir()
    with pytest.raises(ScopeError):
        bind(hub, foreign)
    hub.close()


def test_rename_locator_keeps_native_identity_and_cookie_partition(tmp_path):
    hub, home, workspace = setup(tmp_path)
    first = bind(hub, workspace)
    renamed = workspace.with_name("renamed")
    workspace.rename(renamed)
    (home / "webui" / "workspaces.json").write_text(json.dumps([{"path": str(renamed), "name": "New display name"}]), encoding="utf-8")
    result = bind(hub, renamed, nativeSpaceId=first["scope"]["spaceId"])
    assert result["scope"] == first["scope"] and result["partitionKey"] == first["partitionKey"]
    hub.close()


def test_two_backend_homes_use_separate_bindings(tmp_path):
    hub, home, workspace = setup(tmp_path)
    named = home / "profiles" / "other"
    named.mkdir(parents=True)
    state = named / "webui_state"
    state.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "Other"}]), encoding="utf-8")
    a = bind(hub, workspace)
    b = hub.bind("other", {"workspacePath": str(workspace), "browserProfileId": "browser-b", "partitionKey": "persist:historic-b"})
    assert a["scope"]["backendProfileId"] != b["scope"]["backendProfileId"]
    from runtime.independent.contracts import Scope
    with pytest.raises(ScopeError):
        hub.by_scope(Scope.model_validate(a["scope"]), "other")
    hub.close()


def home_payload(browser="browser-a", **extra):
    return {"workspacePath": None, "browserProfileId": browser, "partitionKey": f"persist:space_home_{browser}", **extra}


def test_fresh_workspace_registry_uses_captured_settings_default_without_creating_or_changing_it(tmp_path):
    home, state, workspace = tmp_path / "home", tmp_path / "state", tmp_path / "configured-work"
    home.mkdir(); state.mkdir(); workspace.mkdir()
    (state / "settings.json").write_text(json.dumps({"default_workspace": str(workspace)}), encoding="utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    assert hub.workspace_rows("default") == ({"path": str(workspace), "name": "Home"},)
    registered = bind(hub, workspace)
    implicit = hub.bind("default", home_payload())
    assert registered["workspacePath"] == str(workspace) and implicit["workspacePath"] is None
    assert registered["scope"]["spaceId"] != implicit["scope"]["spaceId"]
    assert registered["partitionKey"] == "persist:historic-a" and implicit["partitionKey"] == "persist:space_home_browser-a"
    assert not (state / "workspaces.json").exists()
    from runtime.independent.contracts import Scope
    store, resolver = hub.by_scope(Scope.model_validate(implicit["scope"]), "default")
    assert resolver.resolve(Scope.model_validate(implicit["scope"])).binding.workspace_locator == str(workspace)
    hub.close()
    reopened = ProfileHub(home, default_state_dir=state)
    assert reopened.bind("default", home_payload()) == implicit
    assert bind(reopened, workspace) == registered
    reopened.close()


def test_home_uses_explicit_profile_defaults_and_stays_isolated_after_process_globals_change(tmp_path, monkeypatch):
    base = tmp_path / "home"; other = base / "profiles" / "other"
    base.mkdir(); other.mkdir(parents=True)
    default_work, other_work, foreign = base / "workspace", other / "work", tmp_path / "foreign"
    default_work.mkdir(); other_work.mkdir(); foreign.mkdir()
    (base / "config.yaml").write_text(yaml.safe_dump({"workspace": str(default_work)}), encoding="utf-8")
    (other / "config.yaml").write_text(yaml.safe_dump({"terminal": {"cwd": str(other_work)}}), encoding="utf-8")
    hub = ProfileHub(base, default_workspace_hint=foreign)
    monkeypatch.setenv("SIDEKICK_HOME", str(foreign)); monkeypatch.setenv("SIDEKICK_WEBUI_DEFAULT_WORKSPACE", str(foreign))
    (other / "config.yaml").write_text(yaml.safe_dump({"workspace": str(foreign)}), encoding="utf-8")
    a = hub.bind("default", home_payload("browser-a")); b = hub.bind("other", home_payload("browser-b"))
    assert a["scope"]["backendProfileId"] != b["scope"]["backendProfileId"]
    from runtime.independent.contracts import Scope
    assert hub.by_scope(Scope.model_validate(a["scope"]), "default")[0].get_binding(Scope.model_validate(a["scope"])).workspace_locator == str(default_work)
    assert hub.by_scope(Scope.model_validate(b["scope"]), "other")[0].get_binding(Scope.model_validate(b["scope"])).workspace_locator == str(other_work)
    with pytest.raises(ScopeError):
        hub.by_scope(Scope.model_validate(a["scope"]), "other")
    hub.close()


def test_home_preserves_a_legitimate_existing_native_default_identity(tmp_path):
    home = tmp_path / "home"; workspace = home / "workspace"
    workspace.mkdir(parents=True)
    from web.api.space_engine import create_space, DEFAULT_SPACE_SLUG
    native = create_space(DEFAULT_SPACE_SLUG, "Existing central Space", custom_root=home / "spaces")
    identity = native.load_config()["space_id"]
    hub = ProfileHub(home)
    first = hub.bind("default", home_payload())
    assert first["scope"]["spaceId"] == identity
    assert native.load_config()["name"] == "Existing central Space"
    assert hub.bind("default", home_payload())["scope"] == first["scope"]
    hub.close()


@pytest.mark.parametrize("home_first", [True, False])
def test_native_default_workspace_and_browser_home_never_overwrite_each_others_cookie_binding(tmp_path, home_first):
    home = tmp_path / "home"; workspace = home / "workspace"
    workspace.mkdir(parents=True)
    from web.api.space_engine import create_space, DEFAULT_SPACE_SLUG
    native = create_space(DEFAULT_SPACE_SLUG, "Existing central Space", custom_root=home / "spaces")
    config = native.load_config(); config["project_dir"] = str(workspace); native.save_config(config)
    original_id = config["space_id"]
    hub = ProfileHub(home)
    if home_first:
        implicit = hub.bind("default", home_payload()); registered = bind(hub, workspace)
        assert implicit["scope"]["spaceId"] == original_id
    else:
        registered = bind(hub, workspace); implicit = hub.bind("default", home_payload())
        assert registered["scope"]["spaceId"] == original_id
    assert registered["scope"]["spaceId"] != implicit["scope"]["spaceId"]
    assert bind(hub, workspace) == registered and hub.bind("default", home_payload()) == implicit
    assert registered["partitionKey"] == "persist:historic-a" and implicit["partitionKey"] == "persist:space_home_browser-a"
    hub.close()


def test_home_rejects_arbitrary_partition_directory_and_unknown_native_identity(tmp_path):
    home = tmp_path / "home"; (home / "workspace").mkdir(parents=True)
    foreign = tmp_path / "foreign"; foreign.mkdir()
    hub = ProfileHub(home)
    with pytest.raises(ScopeError, match="Home partition"):
        hub.bind("default", home_payload(partitionKey="persist:foreign"))
    with pytest.raises(ScopeError, match="registered"):
        bind(hub, foreign)
    with pytest.raises(ScopeError, match="Unknown Space identity"):
        hub.bind("default", home_payload(nativeSpaceId="00000000-0000-0000-0000-000000000000"))
    assert hub.get("default").list_bindings() == ()
    hub.close()


def test_default_configuration_cannot_select_another_profile_home(tmp_path):
    base = tmp_path / "home"; other_work = base / "profiles" / "other" / "workspace"
    other_work.mkdir(parents=True)
    (base / "config.yaml").write_text(yaml.safe_dump({"workspace": str(other_work)}), encoding="utf-8")
    with pytest.raises(ScopeError, match="another profile"):
        ProfileHub(base)


def test_missing_default_is_an_error_and_does_not_create_a_workspace(tmp_path):
    home = tmp_path / "home"; home.mkdir()
    absent = home / "workspace"
    hub = ProfileHub(home, default_workspace_hint=absent)
    assert hub.workspace_rows("default") == ()
    with pytest.raises(ScopeError, match="existing default workspace"):
        hub.bind("default", home_payload())
    assert not absent.exists()
    hub.close()


def test_context_metadata_is_captured_only_for_its_actual_bound_model_provider(tmp_path):
    from runtime.independent.scope_binding import provider_selection, configured_context_length
    from runtime.independent.contracts import Scope
    hub, home, workspace = setup(tmp_path)
    config = {"model": {"provider": "custom:local", "default": "actual-home", "context_length": 64000},
              "custom_providers": [{"name": "local", "models": {"other:literal": {"context_length": 128000}}}],
              "providers": {"openai": {"models": {"specific": {"context_length": 96000}}}}}
    (home / "config.yaml").write_text(yaml.safe_dump(config), "utf-8")
    scope = Scope.model_validate(bind(hub, workspace)["scope"])
    resolved = hub.by_scope(scope, "default")[1].resolve(scope)
    captured, _ = provider_selection(resolved)
    assert captured.context_length == 64000
    chosen, _ = provider_selection(resolved, space_config={"model": {"model": "other:literal", "provider": "custom:local"}})
    assert chosen.context_length == 128000
    unknown, _ = provider_selection(resolved, space_config={"model": {"model": "unknown", "provider": "custom:local"}})
    assert unknown.context_length is None  # Never inherit 64k from another model.
    assert configured_context_length(config, "specific", "openai") == 96000
    assert configured_context_length(config, "specific", "other-provider") is None
    for value in (True, "64000", 0, 16000001):
        assert configured_context_length({"model": {"default": "actual-home", "provider": "custom:local", "context_length": value}}, "actual-home", "custom:local") is None
    config["model"]["context_length"] = 32000
    (home / "config.yaml").write_text(yaml.safe_dump(config), "utf-8")
    assert captured.context_length == 64000 and provider_selection(resolved)[0].context_length == 32000
    hub.close()
