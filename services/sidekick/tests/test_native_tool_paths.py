"""Actual file IO stays at its checked path despite a different live cwd."""
import json
from pathlib import Path

from test_native_chat_tool_policy import bound, bound_file
from runtime.chat_modes import ChatExecutionPolicy


def test_native_actual_file_dispatch_uses_checked_workspace_not_live_terminal_cwd(bound_file, tmp_path, monkeypatch):
    from model_tools import handle_function_call
    from tools import file_tools, terminal_tool
    from tools.environments.local import LocalEnvironment
    from tools.file_operations import ShellFileOperations
    from sidekick_cli import plugins
    context, store = bound_file
    foreign = tmp_path / "different-live-cwd"
    foreign.mkdir()
    (foreign / "controlled.txt").write_text("foreign file must not be read", "utf-8")
    project = Path(context.workspace) / "project"
    project.mkdir()
    task = "native_checked_path_" + context.writer_generation
    environment = LocalEnvironment(cwd=str(foreign), timeout=5)
    monkeypatch.setitem(terminal_tool._task_env_overrides, task, {"cwd": str(foreign)})
    monkeypatch.setitem(terminal_tool._active_environments, task, environment)
    monkeypatch.setitem(terminal_tool._last_activity, task, 0)
    monkeypatch.setitem(file_tools._file_ops_cache, task, ShellFileOperations(environment))
    hook_calls = []
    monkeypatch.setattr(plugins, "invoke_hook", lambda name, **kwargs: hook_calls.append(name) or [])
    # The test installs an actual local terminal at a deliberately wrong cwd;
    # it does not stub the policy, file handler, registry or file IO.
    try:
        read = handle_function_call("read_file", {"path": "controlled.txt"}, task_id=task,
            execution_policy=ChatExecutionPolicy("action", 1))
        assert "content-a" in read and "foreign file must not be read" not in read
        write = json.loads(handle_function_call("write_file", {"path": "project/actual.txt", "content": "bound actual content"},
            task_id=task, skip_pre_tool_call_hook=True, execution_policy=ChatExecutionPolicy("action", 1)))
        assert "error" not in write and (project / "actual.txt").read_text("utf-8") == "bound actual content"
        assert not (foreign / "project" / "actual.txt").exists()
        search = handle_function_call("search_files", {"path": "project", "pattern": "bound actual content"},
            task_id=task, skip_pre_tool_call_hook=True, execution_policy=ChatExecutionPolicy("action", 1))
        assert "bound actual content" in search
        store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
        denied = json.loads(handle_function_call("write_file", {"path": "project/actual.txt", "content": "stale mutation"},
            task_id=task, skip_pre_tool_call_hook=True))
        assert denied["denied"] and denied["error"] == "native_chat_binding_unavailable"
        assert (project / "actual.txt").read_text("utf-8") == "bound actual content"
        assert not hook_calls
    finally:
        file_tools._read_tracker.pop(task, None)
        environment.cleanup()


def test_native_file_dispatch_cannot_create_unbound_remote_backend(bound, monkeypatch):
    from model_tools import handle_function_call
    from tools import terminal_tool
    context, _ = bound
    attempted = []
    monkeypatch.setenv("TERMINAL_ENV", "ssh")
    monkeypatch.setattr(terminal_tool, "_create_environment", lambda **kwargs: attempted.append(kwargs))
    original = (Path(context.workspace) / "controlled.txt").read_bytes()
    result = json.loads(handle_function_call("read_file", {"path": "controlled.txt"}, task_id=context.session_id))
    assert result["denied"] and result["error"] == "native_chat_local_file_adapter_required"
    assert not attempted and (Path(context.workspace) / "controlled.txt").read_bytes() == original
