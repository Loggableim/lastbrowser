"""Bounded private JSONL transport to an isolated in-tree Python process.

This is ownership/transport, not another agent engine. The runner entry uses
the existing AIAgent. A UI profile switch cannot retarget an already spawned
process, and no credential-shaped parent environment is inherited implicitly.
"""
from __future__ import annotations

import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Iterator

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    __package__ = "runtime.independent"

from .contracts import RunContext, canonical_json
from .scope import canonical_path

MAX_LINE_BYTES = 1024 * 1024
MAX_EVENTS = 128
_ENTRY_MODULES = {"runtime.independent.runner", "runtime.independent.worker_host"}
_SYSTEM_ENV = frozenset({"SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "TZ"})
_RESERVED_ENV = frozenset({"SIDEKICK_HOME", "SIDEKICK_BASE_HOME", "LASTBROWSER_HOME", "SIDEKICK_SESSION_ID", "SIDEKICK_WEBUI_SPACES_DIR", "SIDEKICK_WEBUI_WORKSPACES_DIR", "SIDEKICK_STREAM_RETRIES", "TERMINAL_CWD", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PYTHONUSERBASE"})


class WorkerError(RuntimeError):
    pass


def build_worker_environment(context: RunContext, *, runtime_env: dict[str, str] | None = None) -> dict[str, str]:
    home = canonical_path(context.resolved_profile_home)
    space = canonical_path(context.resolved_space_root)
    if not space.is_relative_to(home):
        raise WorkerError("Worker Space is outside the bound Profile Home")
    if runtime_env is None:
        from web.api.profiles import get_profile_runtime_env
        runtime_env = get_profile_runtime_env(home)
    env = {name: value for name, value in os.environ.items() if name.upper() in _SYSTEM_ENV}
    for name, value in runtime_env.items():
        upper = name.upper()
        if upper in _RESERVED_ENV or upper in _SYSTEM_ENV or upper.startswith(("PYTHON", "LB_", "LASTBROWSER_", "SIDEKICK_WEBUI_")):
            continue
        if not name or "=" in name or "\0" in name or not isinstance(value, str) or "\0" in value:
            raise WorkerError("Invalid profile environment entry")
        env[name] = value
    base_home = home.parent.parent if home.parent.name == "profiles" else home
    env.update({
        "SIDEKICK_HOME": str(home), "SIDEKICK_BASE_HOME": str(base_home),
        "LASTBROWSER_HOME": str(home), "HOME": str(home), "USERPROFILE": str(home),
        "SIDEKICK_SESSION_ID": context.run_id,
        "SIDEKICK_WEBUI_ACTIVE_WORKSPACE": space.name,
        "SIDEKICK_WEBUI_SPACES_DIR": str(space.parent),
        "SIDEKICK_WEBUI_WORKSPACES_DIR": str(space.parent),
        "SIDEKICK_STREAM_RETRIES": "0",
        "TERMINAL_CWD": str(space),
        "LASTBROWSER_INTEGRATED": "1", "LASTBROWSER_INDEPENDENT_WORKER": "1",
        "LASTBROWSER_RUN_ID": context.run_id,
        "LASTBROWSER_BACKEND_PROFILE_ID": context.scope.backend_profile_id,
        "LASTBROWSER_BROWSER_PROFILE_ID": context.scope.browser_profile_id,
        "LASTBROWSER_SPACE_ID": context.scope.space_id,
        "LASTBROWSER_PARTITION_KEY": context.partition_key,
        "LASTBROWSER_RUNNER_GENERATION": context.runner_generation,
        "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1",
    })
    return env


def bind_worker_context(context: RunContext) -> None:
    """Initialize existing defaults only inside a dedicated immutable child.

    Provider SDK calls create ordinary threads without copying ContextVars.
    Their fallback profile/Space must therefore be the same fixed child scope.
    No parent process global or live UI profile is changed by this function.
    """
    if os.environ.get("LASTBROWSER_INDEPENDENT_WORKER") != "1" or os.environ.get("SIDEKICK_HOME") != context.resolved_profile_home:
        raise WorkerError("Worker context may only bind its isolated process")
    from web.api import profiles
    from web.api.config import set_session_dir
    from web.api.space_engine import set_active_space
    profiles._active_profile = context.backend_profile_name
    profiles.set_request_profile(context.backend_profile_name)
    if canonical_path(profiles.get_active_profile_home()) != canonical_path(context.resolved_profile_home):
        raise WorkerError("Worker profile resolver does not match its bound Home")
    set_active_space(Path(context.resolved_space_root).name)
    set_session_dir(str(Path(context.resolved_space_root) / "sessions"))


class _ProcessTree:
    """Windows job object kills descendant MCP/helpers when the owner closes."""
    def __init__(self, process: subprocess.Popen):
        self.handle = None
        if os.name != "nt":
            return
        import ctypes
        from ctypes import wintypes

        class BasicLimits(ctypes.Structure):
            _fields_ = [("processTime", ctypes.c_longlong), ("jobTime", ctypes.c_longlong), ("flags", wintypes.DWORD), ("minimum", ctypes.c_size_t), ("maximum", ctypes.c_size_t), ("activeProcesses", wintypes.DWORD), ("affinity", ctypes.c_size_t), ("priority", wintypes.DWORD), ("scheduling", wintypes.DWORD)]

        class IoCounters(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in ("readOps", "writeOps", "otherOps", "readBytes", "writeBytes", "otherBytes")]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [("basic", BasicLimits), ("io", IoCounters), ("processMemory", ctypes.c_size_t), ("jobMemory", ctypes.c_size_t), ("peakProcessMemory", ctypes.c_size_t), ("peakJobMemory", ctypes.c_size_t)]

        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        kernel.SetInformationJobObject.restype = wintypes.BOOL
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        handle = kernel.CreateJobObjectW(None, None)
        if not handle:
            raise WorkerError("Worker process-tree isolation is unavailable")
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)) or not kernel.AssignProcessToJobObject(handle, int(process._handle)):
            kernel.CloseHandle(handle)
            raise WorkerError("Worker process could not enter its isolated job")
        self.handle, self.kernel = handle, kernel

    def close(self):
        if self.handle is not None:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


class WorkerHandle:
    def __init__(self, process: subprocess.Popen, context: RunContext):
        self.process = process
        self.context = context
        self.pid = process.pid
        self._events: queue.Queue[dict[str, Any]] = queue.Queue(MAX_EVENTS)
        self._write_lock = threading.Lock()
        self._stopping = threading.Event()
        self.stderr_bytes = 0
        self.stderr_failure_type = "unknown"
        self.stderr_missing_module = "none"
        self.transport_error: str | None = None
        self._tree = _ProcessTree(process)
        self._reader = threading.Thread(target=self._read_stdout, name="IndependentWorkerTransport", daemon=True)
        self._errors = threading.Thread(target=self._drain_stderr, name="IndependentWorkerErrors", daemon=True)
        self._reader.start()
        self._errors.start()

    @property
    def is_alive(self) -> bool:
        return self.process.poll() is None

    @property
    def returncode(self) -> int | None:
        return self.process.poll()

    def safe_exit_diagnostic(self) -> str:
        """Bounded process facts only; never expose worker stderr contents."""
        transport = self.transport_error
        if transport not in {None, "worker_event_buffer_overflow", "worker_message_too_large",
                "worker_invalid_protocol", "worker_transport_closed"}:
            transport = "unknown"
        code = self.returncode
        if code is None:
            try:
                code = self.process.wait(timeout=0.2)
            except subprocess.TimeoutExpired:
                pass
        return f"exit_{code if type(code) is int else 'running'}_stderr_bytes_{self.stderr_bytes}_failure_{self.stderr_failure_type}_missing_{self.stderr_missing_module}_transport_{transport or 'none'}"

    def _offer(self, value: dict[str, Any]):
        try:
            self._events.put(value, timeout=0.25)
        except queue.Full:
            self.transport_error = "worker_event_buffer_overflow"
            # Do not block a provider indefinitely behind a vanished UI.
            self.process.terminate()

    def _read_stdout(self):
        import json
        try:
            while True:
                line = self.process.stdout.readline(MAX_LINE_BYTES + 1)
                if not line:
                    break
                if len(line.encode("utf-8")) > MAX_LINE_BYTES or not line.endswith("\n"):
                    self.transport_error = "worker_message_too_large"
                    self.process.terminate()
                    break
                try:
                    message = json.loads(line)
                except (ValueError, TypeError):
                    self.transport_error = "worker_invalid_protocol"
                    self.process.terminate()
                    break
                if not isinstance(message, dict):
                    self.transport_error = "worker_invalid_protocol"
                    self.process.terminate()
                    break
                self._offer(message)
        except (OSError, UnicodeError):
            self.transport_error = "worker_transport_closed"
        finally:
            self._offer({"kind": "eof", "errorCode": self.transport_error})

    def _drain_stderr(self):
        # Never persist/log agent stderr: third-party providers may print
        # credential-bearing HTTP URLs or environment diagnostics there.
        try:
            while data := self.process.stderr.read(4096):
                encoded = data.encode("utf-8", errors="replace")
                self.stderr_bytes = min(self.stderr_bytes + len(encoded), MAX_LINE_BYTES)
                # Parse only safe type/module identifiers in this read chunk;
                # no raw stderr bytes or text are retained or surfaced.
                failure = re.findall(r"(?m)^([A-Z][A-Za-z0-9_.]{0,78}(?:Error|Exception|Exit))(?::|$)", data)
                if failure:
                    self.stderr_failure_type = failure[-1].rsplit(".", 1)[-1]
                missing = re.findall(r"No module named ['\"]([A-Za-z_][A-Za-z0-9_.]{0,79})['\"]", data)
                if missing:
                    self.stderr_missing_module = missing[-1].replace(".", "_")
        except (OSError, UnicodeError):
            pass

    def send(self, message: dict[str, Any]) -> None:
        encoded = canonical_json(message) + "\n"
        if len(encoded.encode("utf-8")) > MAX_LINE_BYTES:
            raise WorkerError("Worker message exceeds protocol limit")
        with self._write_lock:
            if not self.is_alive:
                raise WorkerError("Worker is no longer running")
            try:
                self.process.stdin.write(encoded)
                self.process.stdin.flush()
            except (OSError, ValueError) as exc:
                raise WorkerError("Worker transport closed") from exc

    def read_event(self, timeout: float | None = 0.0) -> dict[str, Any] | None:
        try:
            return self._events.get(timeout=timeout)
        except queue.Empty:
            return None

    def iter_events(self) -> Iterator[dict[str, Any]]:
        while True:
            message = self.read_event(timeout=0.25)
            if message is None:
                if not self.is_alive and not self._reader.is_alive():
                    return
                continue
            yield message
            if message.get("kind") == "eof":
                return

    def cancel(self) -> None:
        self._stopping.set()
        if self.is_alive:
            self.send({"kind": "control", "command": "cancel", "runId": self.context.run_id, "controlEpoch": self.context.control_epoch + 1})

    def terminate(self, *, grace_seconds: float = 5.0, hard_seconds: float = 15.0) -> int | None:
        if grace_seconds < 0 or hard_seconds < grace_seconds or hard_seconds > 15:
            raise ValueError("Worker termination deadline is bounded to 15 seconds")
        started = time.monotonic()
        try:
            try:
                self.cancel()
            except WorkerError:
                # Exit can race with the cancellation write. Cleanup and
                # process-tree termination remain mandatory after pipe loss.
                pass
            if self.is_alive:
                try:
                    self.process.wait(timeout=grace_seconds)
                except subprocess.TimeoutExpired:
                    self.process.terminate()
            if self.is_alive:
                try:
                    self.process.wait(timeout=max(0.05, hard_seconds - (time.monotonic() - started)))
                except subprocess.TimeoutExpired:
                    self.process.kill()
        finally:
            self._tree.close()
            if self.is_alive:
                self.process.kill()
            try:
                self.process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
            for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                try:
                    stream.close()
                except OSError:
                    pass
            self._reader.join(timeout=0.25)
            self._errors.join(timeout=0.25)
        return self.returncode


class WorkerHost:
    def __init__(self, context: RunContext, *, python_executable: str | Path | None = None):
        # Revalidation creates a detached immutable model even if the parent
        # constructed it through unchecked model_copy.
        self.context = RunContext.model_validate_json(canonical_json(context))
        self.python_executable = canonical_path(python_executable or sys.executable)
        self.sidekick_root = Path(__file__).resolve().parents[2]

    def start(self, *, entry_module: str = "runtime.independent.runner", payload: dict[str, Any] | None = None, runtime_env: dict[str, str] | None = None) -> WorkerHandle:
        if entry_module not in _ENTRY_MODULES:
            raise WorkerError("Worker entry is not an in-tree approved runtime adapter")
        env = build_worker_environment(self.context, runtime_env=runtime_env)
        # This purpose is supplied by the private parent adapter, never a
        # profile .env. Discovery cannot refresh or exchange account tokens.
        env["LASTBROWSER_INDEPENDENT_PURPOSE"] = str((payload or {}).get("mode", "run"))
        bootstrap = "import runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_module(sys.argv[2],run_name='__main__')"
        options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
        process = subprocess.Popen([str(self.python_executable), "-I", "-B", "-u", "-c", bootstrap, str(self.sidekick_root), entry_module], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="strict", bufsize=1, cwd=self.context.resolved_space_root, env=env, close_fds=True, **options)
        try:
            handle = WorkerHandle(process, self.context)
            handle.send({"kind": "bootstrap", "schemaVersion": 1, "context": self.context.model_dump(mode="json", by_alias=True), "payload": payload or {}})
            return handle
        except BaseException:
            process.kill()
            process.wait(timeout=5)
            for stream in (process.stdin, process.stdout, process.stderr):
                stream.close()
            raise


def _probe_main():
    """Controlled profile/global/thread probe; never reads real credentials."""
    import json
    from contextvars import copy_context
    line = sys.stdin.readline(MAX_LINE_BYTES + 1)
    if not line or len(line.encode("utf-8")) > MAX_LINE_BYTES:
        return 2
    initial = json.loads(line)
    context = RunContext.model_validate(initial["context"])
    payload = initial.get("payload", {})
    from web.api import profiles
    bind_worker_context(context)
    # Actual imported runtime registries are confined to this process. These
    # synthetic names are not connection URLs/accounts and start no services.
    import model_tools
    import tools.mcp_tool as mcp
    marker = str(payload.get("marker", "probe"))
    model_tools._last_resolved_tool_names = [marker]
    mcp._servers = {marker: {"synthetic": True}}
    observed = []
    copied = copy_context()
    def read_bound_thread(copied_context=True):
        observed.append({"profile": profiles.get_active_profile_name(), "home": str(profiles.get_active_profile_home()), "marker": model_tools._last_resolved_tool_names[0], "mcpKeys": sorted(mcp._servers), "copiedContext": copied_context, "space": os.getenv("SIDEKICK_WEBUI_ACTIVE_WORKSPACE")})
    thread = threading.Thread(target=lambda: copied.run(read_bound_thread), name="BoundProfileProbe")
    thread.start()
    thread.join(timeout=5)
    plain_thread = threading.Thread(target=lambda: read_bound_thread(False), name="PlainProviderThreadProbe")
    plain_thread.start()
    plain_thread.join(timeout=5)
    import yaml
    config_path = Path(context.resolved_profile_home) / "config.yaml"
    cfg = yaml.safe_load(config_path.read_text("utf-8")) if config_path.exists() else {}
    auth_present = {}
    if payload.get("authProviderIds"):
        from cli.auth import get_provider_auth_state, read_credential_pool
        for provider_id in payload["authProviderIds"]:
            auth_present[provider_id] = {"state": bool(get_provider_auth_state(provider_id)), "pool": bool(read_credential_pool(provider_id))}
    print(canonical_json({"kind": "probe", "pid": os.getpid(), "runId": context.run_id, "scope": context.scope.model_dump(mode="json", by_alias=True), "profileHome": os.environ["SIDEKICK_HOME"], "providerMarker": (cfg or {}).get("probe_provider"), "envMarker": os.getenv("PROFILE_PROBE_MARKER"), "thread": observed, "toolNames": model_tools._last_resolved_tool_names, "mcpKeys": sorted(mcp._servers), "authPresent": auth_present}), flush=True)
    if payload.get("hold"):
        while command := sys.stdin.readline(MAX_LINE_BYTES + 1):
            value = json.loads(command)
            if value.get("kind") == "control" and value.get("command") == "cancel":
                break
            if value.get("kind") == "probe_again":
                print(canonical_json({"kind": "probe_again", "profileHome": os.environ["SIDEKICK_HOME"], "toolNames": model_tools._last_resolved_tool_names, "mcpKeys": sorted(mcp._servers)}), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(_probe_main())
    except Exception:
        # No exception text from imports/config/provider ever crosses stdout.
        print('{"kind":"error","code":"profile_probe_failed"}', flush=True)
        sys.exit(1)
