"""Fresh real-store revocation and canonical control-file protection."""
import os
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from runtime.independent import native_chat_policy as policy
from runtime.independent.native_chat_host import build_native_environment
from test_native_chat_process import fixture_context


@pytest.fixture
def bound(tmp_path,monkeypatch):
    context,store = fixture_context(tmp_path,"a")
    for key,value in build_native_environment(context).items(): monkeypatch.setenv(key,value)
    monkeypatch.setattr(policy,"_context",None)
    policy.bind_native_policy(context)
    yield context,store
    store.close()


@pytest.fixture
def bound_file(tmp_path, monkeypatch):
    from runtime.independent import native_file_io
    from test_native_sdk_broker import setup_fixed
    from test_native_auto_auxiliary import AuxiliaryServer
    from test_independent_profile_isolation import isolated_python
    server = AuxiliaryServer()
    context = store = manager = broker = None
    try:
        context, store, manager, broker = setup_fixed(tmp_path, server)
        broker.file_fence.python_executable = str(isolated_python())
        for key, value in build_native_environment(context).items(): monkeypatch.setenv(key, value)
        monkeypatch.setattr(policy, "_context", None)
        policy.bind_native_policy(context)
        monkeypatch.setattr(native_file_io, "_bound_bridge", None)
        # Exercise the actual bridge, Parent fence, receipts and isolated file
        # process. Only the private RPC transport is local to this test.
        rpc = SimpleNamespace(call=lambda method, payload, **kwargs: broker(context, method, payload))
        native_file_io.install_native_file_bridge(context, rpc)
        yield context, store
        assert not server.requests
    finally:
        if broker: broker.close_after_exit()
        if manager: manager.shutdown()
        if store: store.close()
        server.close()


@pytest.mark.parametrize("change",["release","restart","tombstone","revision"])
def test_real_revocation_blocks_every_previously_allowed_tool(bound,change):
    context,store = bound
    assert policy.native_tool_denial("write_file",{"path":"project.txt"}) is None
    if change == "release": store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    elif change == "restart": store.recover_after_restart("new-manager-generation")
    elif change == "tombstone": store.tombstone_binding(context.scope,expected_revision=1)
    else:
        binding=store.get_binding(context.scope)
        store.bind_space(binding.model_copy(update={"revision":2}),expected_revision=1)
    for name,args in (("write_file",{"path":"project.txt"}),("read_file",{"path":"controlled.txt"}),
                      ("clarify",{}),("delegate_task",{})):
        assert policy.native_tool_denial(name,args) == "native_chat_binding_unavailable"


def test_reacquired_writer_does_not_authorize_old_process(bound):
    context,store = bound
    store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    lease=store.acquire_chat_writer(context.scope,context.session_id,"new-turn","new-generation")
    assert lease["leaseId"] != context.writer_lease_id
    assert policy.native_tool_denial("write_file",{"path":"project.txt"}) == "native_chat_binding_unavailable"


@pytest.mark.parametrize("target",["sessions/other.json","sessions/_index.json","sessions/active.json.tail",
    "space.yaml","workspace.yaml","nova-management-audit.jsonl","agents/test/model-override.yaml",
    ".env","auth.json","config.yaml","state.db","state.db-wal","state.db-shm","kanban.db",
    "goals.db","goals.db-wal","goals.db-journal","subagents.db","memory/PROFILE.md"])
def test_own_space_control_paths_are_not_mutable(bound,target):
    context,_ = bound
    path=Path(context.workspace)/target
    path.parent.mkdir(parents=True,exist_ok=True)
    if not path.exists(): path.write_text("private fixture",encoding="utf-8")
    original=path.read_bytes()
    for name in ("write_file","patch"):
        assert policy.native_tool_denial(name,{"path":str(path)}) == "native_chat_control_path_denied"
    assert path.read_bytes() == original


def test_reads_and_project_files_use_exact_locations_not_basename_bans(bound):
    context,_ = bound
    root=Path(context.workspace)
    project=root/"project"
    project.mkdir()
    for name in ("auth.json","config.yaml","space.yaml",".env","state.db"):
        path=project/name
        path.write_text("ordinary project fixture",encoding="utf-8")
        assert policy.native_tool_denial("write_file",{"path":str(path)}) is None
        assert policy.native_tool_denial("read_file",{"path":str(path)}) is None
    assert policy.native_tool_denial("read_file",{"path":str(root/"space.yaml")}) is None
    for path in (root/".env",root/"sessions"/(context.session_id+".json"),Path(context.profile_home)/"auth.json"):
        assert policy.native_tool_denial("read_file",{"path":str(path)}) is not None
    assert policy.native_tool_denial("search_files",{}) == "native_chat_control_path_denied"
    assert policy.native_tool_denial("search_files",{"path":str(project)}) is None


def test_missing_paths_unknown_tools_and_marker_drift_fail_closed(bound,monkeypatch):
    context,_=bound
    for name in ("read_file","write_file","patch"):
        assert policy.native_tool_denial(name,{}) == "native_chat_file_path_invalid"
    for name in ("terminal","browser_navigate","execute_code","mcp_foreign","connector_write"):
        assert policy.native_tool_denial(name,{}) == "native_chat_tool_requires_bound_broker"
    monkeypatch.setenv("LASTBROWSER_NATIVE_GENERATION","foreign")
    assert policy.native_tool_denial("write_file",{"path":"project.txt"}) == "native_chat_context_missing"


def test_hard_link_to_session_is_not_a_project_file(bound):
    context,_=bound
    target=Path(context.sessions_dir)/(context.session_id+".json")
    linked=Path(context.workspace)/"project-link.txt"
    os.link(target,linked)
    assert policy.native_tool_denial("write_file",{"path":str(linked)}) == "native_chat_control_path_denied"
    assert policy.native_tool_denial("read_file",{"path":str(linked)}) == "native_chat_control_path_denied"


def test_non_native_legacy_dispatch_is_unchanged(monkeypatch):
    monkeypatch.delenv("LASTBROWSER_NATIVE_CHAT_WORKER",raising=False)
    assert policy.native_tool_denial("write_file",{"path":"anything"}) is None
    assert policy.native_tool_denial("terminal",{}) is None


def test_external_ancestor_workspace_cannot_expose_own_profile(bound,monkeypatch,tmp_path):
    context,store=bound
    binding=store.get_binding(context.scope)
    store.bind_space(binding.model_copy(update={"workspace_locator":str(tmp_path),"revision":2}),expected_revision=1)
    session_path=Path(context.sessions_dir)/(context.session_id+".json")
    saved=json.loads(session_path.read_text("utf-8"))
    saved["workspace"]=str(tmp_path)
    session_path.write_text(json.dumps(saved),"utf-8")
    updated=context.model_copy(update={"workspace":str(tmp_path),"binding_revision":2})
    monkeypatch.setattr(policy,"_context",None)
    policy.bind_native_policy(updated)
    for name in ("auth.json","config.yaml",".env","state.db"):
        target=Path(context.profile_home)/name
        assert policy.native_tool_denial("read_file",{"path":str(target)}) == "native_chat_control_path_denied"
        assert policy.native_tool_denial("write_file",{"path":str(target)}) == "native_chat_control_path_denied"
    project=tmp_path/"external-project"
    project.mkdir()
    assert policy.native_tool_denial("write_file",{"path":str(project/"config.yaml")}) is None
    assert policy.native_tool_denial("search_files",{"path":str(project)}) is None


def test_actual_dispatch_writes_project_file_and_cannot_overwrite_session(bound_file):
    from model_tools import handle_function_call
    from runtime.chat_modes import ChatExecutionPolicy
    context,store=bound_file
    target=Path(context.sessions_dir)/(context.session_id+".json")
    original=target.read_bytes()
    denied=json.loads(handle_function_call("write_file",{"path":str(target),"content":"overwrite"},
        task_id=context.session_id,skip_pre_tool_call_hook=True))
    assert denied["denied"] and denied["error"] == "native_chat_control_path_denied"
    assert target.read_bytes() == original
    project=Path(context.workspace)/"actual-project.txt"
    result=json.loads(handle_function_call("write_file",{"path":str(project),"content":"actual project content"},
        task_id=context.session_id,skip_pre_tool_call_hook=True, execution_policy=ChatExecutionPolicy("action", 1)))
    assert "error" not in result and project.read_text("utf-8") == "actual project content"
    store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    denied=json.loads(handle_function_call("write_file",{"path":str(project),"content":"stale write"},
        task_id=context.session_id,skip_pre_tool_call_hook=True))
    assert denied["denied"] and denied["error"] in {
        "native_chat_binding_unavailable", "native_chat_file_binding_unavailable"}
    assert project.read_text("utf-8") == "actual project content"


def test_actual_directory_link_cannot_bypass_ancestor_checks(bound):
    context,_=bound
    root=Path(context.workspace)
    target=root/"ordinary-project"
    target.mkdir()
    (target/"file.txt").write_text("private fixture project",encoding="utf-8")
    alias=root/"linked-project"
    if os.name == "nt":
        def literal(path): return "'" + str(path).replace("'", "''") + "'"
        script=f"New-Item -ItemType Junction -Path {literal(alias)} -Target {literal(target)} -ErrorAction Stop | Out-Null"
        subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",script],
            check=True,capture_output=True,timeout=15)
    else:
        alias.symlink_to(target,target_is_directory=True)
    for name in ("read_file","write_file","patch"):
        assert policy.native_tool_denial(name,{"path":str(alias/"file.txt")}) == "native_chat_file_scope_denied"
    assert (target/"file.txt").read_text("utf-8") == "private fixture project"
