"""Actual owned Nova artifacts, real lease proof and zero lifecycle effects."""
import builtins
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import threading

import pytest

from runtime.independent.native_chat_nova import MAX_CONTEXT_BYTES, MAX_SOURCE_BYTES, native_nova_context
from runtime.independent.native_chat_protocol import verify_native_context
from test_native_chat_process import fixture_context


@pytest.fixture
def native(tmp_path):
    context,store=fixture_context(tmp_path,"a")
    yield context,store
    store.close()


def own_nova(context,store):
    previous=Path(context.space_root)
    root=previous.parent/"nova"
    previous.rename(root)
    binding=store.get_binding(context.scope)
    store.bind_space(binding.model_copy(update={"native_slug":"nova","revision":2}),expected_revision=1)
    sessions=root/"sessions"
    path=sessions/(context.session_id+".json")
    raw=json.loads(path.read_text("utf-8"))
    raw.update(workspace=str(root),workspace_slug="nova")
    path.write_text(json.dumps(raw),"utf-8")
    updated=context.model_copy(update={"space_root":str(root),"sessions_dir":str(sessions),
        "workspace":str(root),"binding_revision":2})
    verify_native_context(updated)
    return updated


def entity(context,**values):
    root=Path(context.space_root)/"nova_data"/"entity"
    root.mkdir(parents=True,exist_ok=True)
    path=root/"entity_state.json"
    payload={"schema_version":2,"revision":7,"updated_at":"2026-10-04T00:00:00+00:00",
        "dynamic":{"presence":"available","mood":0.4,"energy":0.7,"fatigue":0.1},**values}
    path.write_text(json.dumps(payload),"utf-8")
    return path


def artifacts(home):
    # SQLite shared-memory read marks are coordination, not mutable application state.
    return {p.relative_to(home).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
        for p in home.rglob("*") if p.is_file() and not p.name.endswith("-shm")}


def test_non_nova_never_uses_cached_slug_or_ambient_foreign_nova(native,tmp_path,monkeypatch):
    context,store=native
    foreign=tmp_path/"foreign-nova"
    foreign.mkdir()
    (foreign/"session_start.py").write_text("raise RuntimeError('must never import')",encoding="utf-8")
    path=Path(context.sessions_dir)/(context.session_id+".json")
    raw=json.loads(path.read_text("utf-8")); raw["workspace_slug"]="nova"
    path.write_text(json.dumps(raw),"utf-8")
    monkeypatch.setenv("SIDEKICK_NOVA_SPACE",str(foreign))
    monkeypatch.setenv("SIDEKICK_HOME",str(foreign))
    before=artifacts(Path(context.profile_home))
    assert native_nova_context(context) is None
    assert artifacts(Path(context.profile_home)) == before


def test_actual_nova_owned_source_is_whitelisted_bounded_and_readonly(native,monkeypatch):
    context,store=native
    context=own_nova(context,store)
    source=entity(context,scope=context.scope.model_dump(by_alias=True),
        identity={"description":"private fixture never render"},auth={"password":"private fixture"},
        runtime={"autonomy_level":4,"yolo_enabled":True},messages=[{"content":"private transcript"}])
    sentinel=Path(context.space_root)/"executed-sentinel"
    (Path(context.space_root)/"session_start.py").write_text(
        f"from pathlib import Path\nPath({str(sentinel)!r}).write_text('executed')\n",encoding="utf-8")
    before=artifacts(Path(context.profile_home))
    def forbidden(*args,**kwargs): raise AssertionError("Unexpected native Nova side effect")
    original_import=builtins.__import__
    def guarded_import(name,*args,**kwargs):
        if name == "nova" or name.startswith("nova.") or name.startswith("plugins.") or name in {
            "web.api.nova_lifecycle","web.api.nova_paths","runtime.auxiliary_client","openai","anthropic"}:
            raise AssertionError("Unexpected Nova lifecycle/provider import")
        return original_import(name,*args,**kwargs)
    monkeypatch.setattr(builtins,"__import__",guarded_import)
    monkeypatch.setattr(subprocess,"Popen",forbidden)
    monkeypatch.setattr(threading,"Thread",forbidden)
    snapshot=native_nova_context(context)
    assert snapshot["spaceMode"] == "native_nova" and snapshot["readOnly"]
    assert snapshot["statusAvailable"] and snapshot["status"]["stateRevision"] == 7
    assert snapshot["status"]["presence"] == "available"
    assert snapshot["source"]["relativePath"] == "nova_data/entity/entity_state.json"
    serialized=json.dumps(snapshot)
    assert len(serialized.encode()) <= MAX_CONTEXT_BYTES
    for word in ("password","private fixture","transcript","autonomy_level","yolo_enabled","identity"):
        assert word not in serialized
    assert artifacts(Path(context.profile_home)) == before and not sentinel.exists()


def test_actual_nova_missing_state_is_unavailable_without_default_or_creation(native):
    context,store=native
    context=own_nova(context,store)
    before=artifacts(Path(context.profile_home))
    snapshot=native_nova_context(context)
    assert snapshot["unavailableReason"] == "entity_state_missing" and not snapshot["statusAvailable"]
    assert "status" not in snapshot and not (Path(context.space_root)/"nova_data").exists()
    assert artifacts(Path(context.profile_home)) == before


def test_enabled_linked_space_does_not_fallback_to_source_nova(native):
    import yaml
    context,store=native
    config=Path(context.space_root)/"space.yaml"
    raw=yaml.safe_load(config.read_text("utf-8"))
    raw["nova"]={"enabled":True,"source_space":"nova"}
    config.write_text(yaml.safe_dump(raw),"utf-8")
    foreign=Path(context.profile_home)/"spaces"/"nova"/"nova_data"/"entity"
    foreign.mkdir(parents=True)
    (foreign/"entity_state.json").write_text(json.dumps({"schema_version":2,"revision":999,
        "dynamic":{"presence":"busy"}}),"utf-8")
    snapshot=native_nova_context(context)
    assert snapshot["spaceMode"] == "nova_enabled" and snapshot["novaEnabled"]
    assert snapshot["unavailableReason"] == "entity_state_missing" and "status" not in snapshot
    entity(context)
    assert native_nova_context(context)["status"]["stateRevision"] == 7


@pytest.mark.parametrize("change",["release","restart","tombstone","revision"])
def test_revoked_actual_lease_or_scope_cannot_supply_nova_facts(native,change):
    context,store=native
    context=own_nova(context,store)
    entity(context)
    if change == "release": store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    elif change == "restart": store.recover_after_restart("new-generation")
    elif change == "tombstone": store.tombstone_binding(context.scope,expected_revision=2)
    else:
        binding=store.get_binding(context.scope)
        store.bind_space(binding.model_copy(update={"revision":3}),expected_revision=2)
    with pytest.raises(PermissionError): native_nova_context(context)


@pytest.mark.parametrize("kind",["malformed","oversized","wrong_schema","foreign_scope","bad_scope"])
def test_invalid_or_foreign_source_stays_unavailable_and_unchanged(native,kind):
    context,store=native
    context=own_nova(context,store)
    path=entity(context)
    expected="entity_state_invalid"
    if kind == "malformed": path.write_text("{broken",encoding="utf-8")
    elif kind == "oversized":
        path.write_bytes(b" "*(MAX_SOURCE_BYTES+1)); expected="entity_state_too_large"
    else:
        raw=json.loads(path.read_text("utf-8"))
        if kind == "wrong_schema": raw["schema_version"]=1
        elif kind == "bad_scope": raw["scope"]={"password":"private fixture"}; expected="entity_state_scope_invalid"
        else:
            raw["scope"]={**context.scope.model_dump(by_alias=True),"browserProfileId":"foreign"}
            expected="entity_state_scope_mismatch"
        path.write_text(json.dumps(raw),encoding="utf-8")
    before=path.read_bytes()
    snapshot=native_nova_context(context)
    assert not snapshot["statusAvailable"] and snapshot["unavailableReason"] == expected
    assert "status" not in snapshot and path.read_bytes() == before


def test_source_hardlink_to_another_file_is_not_owned_state(native,tmp_path):
    context,store=native
    context=own_nova(context,store)
    path=entity(context)
    os.link(path,tmp_path/"foreign-state.json")
    assert native_nova_context(context)["unavailableReason"] == "entity_state_path_linked"


def test_unknown_status_strings_and_nonfinite_values_are_never_context(native):
    context,store=native
    context=own_nova(context,store)
    entity(context,dynamic={"presence":"private fixture password","energy":float("nan"),
        "focus":True,"fatigue":float("inf"),"restlessness":10**300,"mood":-0.4})
    snapshot=native_nova_context(context)
    assert snapshot["status"] == {"stateRevision":7,"sourceUpdatedAt":"2026-10-04T00:00:00Z",
        "dynamic":{"mood":-0.4}}


def test_real_directory_link_cannot_supply_other_nova_state(native,tmp_path):
    context,store=native
    context=own_nova(context,store)
    foreign=tmp_path/"other-profile-state"
    foreign.mkdir()
    (foreign/"entity_state.json").write_text(json.dumps({"schema_version":2,"revision":999,
        "dynamic":{"presence":"busy"}}),"utf-8")
    parent=Path(context.space_root)/"nova_data"
    parent.mkdir()
    alias=parent/"entity"
    if os.name == "nt":
        def literal(path): return "'" + str(path).replace("'","''") + "'"
        subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",
            f"New-Item -ItemType Junction -Path {literal(alias)} -Target {literal(foreign)} -ErrorAction Stop | Out-Null"],
            check=True,capture_output=True,timeout=15)
    else:
        alias.symlink_to(foreign,target_is_directory=True)
    before=(foreign/"entity_state.json").read_bytes()
    snapshot=native_nova_context(context)
    assert snapshot["unavailableReason"] == "entity_state_path_linked" and "status" not in snapshot
    assert (foreign/"entity_state.json").read_bytes() == before


def test_actual_isolated_shipped_python_projects_owned_nova_without_script_effects(native):
    from test_independent_profile_isolation import isolated_python
    from runtime.independent.native_chat_host import build_native_environment
    context,store=native
    context=own_nova(context,store)
    entity(context)
    sentinel=Path(context.space_root)/"script-ran"
    (Path(context.space_root)/"session_start.py").write_text(
        f"from pathlib import Path\nPath({str(sentinel)!r}).write_text('unexpected')\n",encoding="utf-8")
    services=Path(__file__).resolve().parents[1]
    script=(f"import sys,json;sys.path.insert(0,{str(services)!r});"
        "from runtime.independent.native_chat_protocol import NativeChatContext;"
        "from runtime.independent.native_chat_nova import native_nova_context;"
        "ctx=NativeChatContext.model_validate(json.loads(sys.stdin.read()));"
        "print(json.dumps(native_nova_context(ctx)))")
    before=artifacts(Path(context.profile_home))
    result=subprocess.run([isolated_python(),"-I","-B","-u","-c",script],
        input=json.dumps(context.model_dump(mode="json")),text=True,encoding="utf-8",
        capture_output=True,env=build_native_environment(context),cwd=context.workspace,timeout=20)
    assert result.returncode == 0, "Isolated Nova projection did not complete"
    snapshot=json.loads(result.stdout)
    assert snapshot["scope"] == context.scope.model_dump(mode="json",by_alias=True)
    assert snapshot["status"]["stateRevision"] == 7 and not sentinel.exists()
    assert artifacts(Path(context.profile_home)) == before


def test_readonly_legacy_goal_namespace_probe_never_migrates_or_replays(native):
    from cli.goals import GoalState
    from web.api.goals import lastbrowser_workspace_goal_slug
    context,store=native
    old_slug=lastbrowser_workspace_goal_slug(context.workspace)
    assert old_slug.startswith("lbws-")
    old_dir=Path(context.profile_home)/"browser-spaces"/old_slug
    old_dir.mkdir(parents=True)
    old_db=old_dir/"goals.db"
    goal=GoalState(goal="Controlled existing goal",status="paused",revision=3,
        continuation_owner="legacy_chat",turns_used=1,max_turns=4)
    with sqlite3.connect(old_db) as connection:
        connection.execute("CREATE TABLE state_meta(key TEXT PRIMARY KEY,value TEXT)")
        connection.execute("INSERT INTO state_meta VALUES(?,?)",("goal:"+context.session_id,goal.to_json()))
    current_db=Path(context.space_root)/"goals.db"
    original=old_db.read_bytes()
    with sqlite3.connect(old_db.as_uri()+"?mode=ro",uri=True) as connection:
        row=connection.execute("SELECT value FROM state_meta WHERE key=?",("goal:"+context.session_id,)).fetchone()
        restored=GoalState.from_json(row[0])
    assert restored.revision == 3 and restored.continuation_owner == "legacy_chat"
    assert restored.status == "paused" and restored.turns_used == 1
    assert not current_db.exists() and old_db.read_bytes() == original
    # Native Nova read cannot migrate goal data or invoke a goal manager either.
    assert native_nova_context(context) is None
    assert not current_db.exists() and old_db.read_bytes() == original


def test_nova_status_never_grants_governance_or_changes_permission_records(native):
    import yaml
    context,store=native
    context=own_nova(context,store)
    entity(context,runtime={"yolo_enabled":True,"autonomy_level":4},permissions={"allow":"everything"})
    config=Path(context.space_root)/"space.yaml"
    raw=yaml.safe_load(config.read_text("utf-8"))
    raw["nova_management"]={"enrolled":True,"yolo":True,"revision":1}
    config.write_text(yaml.safe_dump(raw),"utf-8")
    original_permissions=store.get_permission_state(context.scope)
    original_leases=store.list_leases()
    snapshot=native_nova_context(context)
    assert snapshot["readOnly"] and snapshot["statusAvailable"]
    for field in ("permissions","role","claims","autonomy_level","yolo_enabled","nova_management"):
        assert field not in json.dumps(snapshot)
    assert store.get_permission_state(context.scope) == original_permissions
    assert store.list_leases() == original_leases
