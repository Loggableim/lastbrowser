"""Regression for an unconfigured first-launch Home captured before settings load."""
from __future__ import annotations

import json
from pathlib import Path

import pytest


def test_first_home_bind_after_first_run_workspace_discovery_does_not_use_startup_none(tmp_path, monkeypatch):
    from runtime.independent.scope import ScopeError
    from runtime.independent.scope_binding import ProfileHub

    monkeypatch.delenv("SIDEKICK_WEBUI_DEFAULT_WORKSPACE", raising=False)
    home = tmp_path / "runtime"
    state = home / "webui"
    own_home = tmp_path / "ownHome"
    workspace = own_home / "workspace"
    home.mkdir()
    state.mkdir(parents=True)

    # Models native startup(): ProfileHub is constructed before first-run
    # load_settings creates the default workspace and persists its setting.
    hub = ProfileHub(home, default_state_dir=state)
    try:
        workspace.mkdir(parents=True)
        (state / "settings.json").write_text(
            json.dumps({"default_workspace": str(workspace)}), encoding="utf-8"
        )
        known_paths = [row["path"] for row in hub.workspace_rows("default")]
        payload = {
            "workspacePath": None,
            "browserProfileId": "default",
            "partitionKey": "persist:space_home_default",
            "backendProfileName": "default",
        }
        try:
            result = hub.bind("default", payload)
        except ScopeError as error:
            reason = "default_workspace_missing" if "existing default workspace" in str(error).lower() else "scope_error_other"
            print(f"scope_error_code={error.code} sanitized_reason={reason} knownSpacePaths={json.dumps(known_paths)}")
            pytest.fail("first Home bind rejected after trusted first-run workspace discovery")
        print(f"scope_error_code=none sanitized_reason=home_bind_passed knownSpacePaths={json.dumps(known_paths)}")
        assert result["workspacePath"] is None
        assert result["knownSpacePaths"] == [str(workspace)]
    finally:
        hub.close()


def test_unconfigured_runtime_captures_existing_os_home_workspace_after_startup(tmp_path, monkeypatch):
    """The desktop runtime Home and Sidekick Home are separate directories."""
    from runtime.independent.scope import ScopeError
    from runtime.independent.scope_binding import ProfileHub

    monkeypatch.delenv("SIDEKICK_WEBUI_DEFAULT_WORKSPACE", raising=False)
    runtime_home = tmp_path / "user-data" / "runtime"
    monkeypatch.setenv("SIDEKICK_HOME", str(runtime_home))
    monkeypatch.delenv("LASTBROWSER_HOME", raising=False)
    state = runtime_home / "webui"
    user_home = tmp_path / "user-home"
    workspace = user_home / "workspace"
    runtime_home.mkdir(parents=True)
    state.mkdir(parents=True)
    user_home.mkdir()
    monkeypatch.setattr(Path, "home", staticmethod(lambda: user_home))

    # First-run Sidekick starts before its workspace settings are persisted.
    # Its established default resolver uses <OS home>/workspace, not
    # <SIDEKICK_HOME>/workspace.
    hub = ProfileHub(runtime_home, default_state_dir=state)
    try:
        assert hub._default_workspaces["default"] is None
        workspace.mkdir()
        payload = {"workspacePath": None, "browserProfileId": "default",
                   "partitionKey": "persist:space_home_default", "backendProfileName": "default"}
        try:
            result = hub.bind("default", payload)
        except ScopeError as error:
            pytest.fail(f"existing OS-home default workspace was not captured: {error.code}")
        assert result["workspacePath"] is None
        assert result["knownSpacePaths"] == [str(workspace)]
        assert hub._default_workspaces["default"] == workspace
    finally:
        hub.close()


def test_named_backend_profile_never_inherits_default_os_home_workspace(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub

    runtime_home = tmp_path / "runtime"
    profile_home = runtime_home / "profiles" / "team"
    user_home = tmp_path / "user-home"
    (user_home / "workspace").mkdir(parents=True)
    profile_home.mkdir(parents=True)
    monkeypatch.setenv("SIDEKICK_HOME", str(runtime_home))
    monkeypatch.delenv("LASTBROWSER_HOME", raising=False)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: user_home))

    hub = ProfileHub(runtime_home, default_state_dir=runtime_home / "webui")
    try:
        assert hub._default_workspaces["team"] is None
        assert hub.workspace_rows("team") == ()
    finally:
        hub.close()


def test_foreign_sidekick_home_does_not_authorize_default_os_home_workspace(tmp_path, monkeypatch):
    from runtime.independent.scope_binding import ProfileHub

    runtime_home = tmp_path / "runtime"
    foreign_home = tmp_path / "other-runtime"
    user_home = tmp_path / "user-home"
    (user_home / "workspace").mkdir(parents=True)
    runtime_home.mkdir()
    monkeypatch.setenv("SIDEKICK_HOME", str(foreign_home))
    monkeypatch.delenv("LASTBROWSER_HOME", raising=False)
    monkeypatch.setattr(Path, "home", staticmethod(lambda: user_home))

    hub = ProfileHub(runtime_home, default_state_dir=runtime_home / "webui")
    try:
        assert hub._default_workspaces["default"] is None
        assert hub.workspace_rows("default") == ()
    finally:
        hub.close()




def test_restart_keeps_existing_home_binding_when_default_workspace_changes(tmp_path, monkeypatch):
    from runtime.independent.contracts import Scope
    from runtime.independent.scope_binding import ProfileHub

    monkeypatch.delenv("SIDEKICK_WEBUI_DEFAULT_WORKSPACE", raising=False)
    home = tmp_path / "runtime"
    state = home / "webui"
    old_workspace = tmp_path / "ownHome" / "workspace"
    new_workspace = tmp_path / "laterHome" / "workspace"
    home.mkdir()
    state.mkdir(parents=True)
    old_workspace.mkdir(parents=True)
    new_workspace.mkdir(parents=True)
    settings = state / "settings.json"
    settings.write_text(json.dumps({"default_workspace": str(old_workspace)}), encoding="utf-8")
    payload = {"workspacePath": None, "browserProfileId": "default",
               "partitionKey": "persist:space_home_default", "backendProfileName": "default"}

    first = ProfileHub(home, default_state_dir=state)
    original = first.bind("default", payload)
    first.close()

    # Simulate a restart while the saved settings are temporarily unavailable.
    # Startup caches None, then first-run settings point at another workspace.
    settings.unlink()
    restarted = ProfileHub(home, default_state_dir=state)
    settings.write_text(json.dumps({"default_workspace": str(new_workspace)}), encoding="utf-8")
    try:
        rebound = restarted.bind("default", payload)
        scope = Scope.model_validate(original["scope"])
        binding = restarted.get("default").get_binding(scope)
        print("scope_error_code=none sanitized_reason=persisted_home_binding_preserved knownSpacePaths=[]")
        assert rebound["scope"] == original["scope"]
        assert binding.workspace_locator == str(old_workspace)
        assert binding.revision == 1
    finally:
        restarted.close()
