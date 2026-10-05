"""Parent-owned native chat process; writer release is deliberately external."""
from __future__ import annotations
import os
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable

from .native_chat_protocol import NativeChatContext, encode_turn, verify_native_context
from .contracts import canonical_json
from .scope import canonical_path
from .worker_host import WorkerHandle, WorkerError, _SYSTEM_ENV, _RESERVED_ENV


class NativeChatStartError(WorkerError):
    def __init__(self, *, diagnostic: dict):
        self.diagnostic = diagnostic
        self.exit_confirmed = diagnostic["exitConfirmed"]
        super().__init__("native_chat_start_failed")


_RPC_DIAGNOSTIC_METHODS = frozenset({
    "auto_validate", "auto_policy", "auto_claim", "auto_observe", "auto_usage",
    "fixed_validate", "fixed_claim", "fixed_observe", "fixed_usage",
    "compute_acquire", "compute_release", "teamwork_plan", "teamwork_validate",
    "teamwork_claim", "teamwork_authorize", "teamwork_compute_acquire",
    "teamwork_compute_release", "teamwork_observe", "teamwork_usage",
    "browser_execute", "file_execute",
})


def _native_rpc_denial_receipt(method, exc):
    """Project resource-busy failures to a fixed, privacy-safe RPC receipt."""
    from .store import RESOURCE_BUSY_DIAGNOSTIC_REASONS, ResourceBusy

    if not isinstance(exc, ResourceBusy):
        return None
    reason = getattr(exc, "diagnostic_reason", None)
    return {
        "schemaVersion": 1,
        "method": method if isinstance(method, str) and method in _RPC_DIAGNOSTIC_METHODS else "unknown",
        "code": "resource_busy",
        "admissionReason": reason if isinstance(reason, str) and reason in RESOURCE_BUSY_DIAGNOSTIC_REASONS
            else "unclassified_resource_busy",
    }


def _start_diagnostic(*, stage: str, exc: BaseException, process=None, handle=None) -> dict:
    """Return bounded process facts only; exception messages can contain secrets."""
    error_type = type(exc).__name__
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", error_type):
        error_type = "Exception"
    return {
        "stage": stage,
        "exceptionClass": error_type,
        "processStarted": process is not None,
        "exitCode": process.poll() if process is not None else None,
        "stderrBytes": min(int(getattr(handle, "stderr_bytes", 0)), 1_048_576),
        "exitConfirmed": process is None or process.poll() is not None,
    }


def build_native_environment(context: NativeChatContext, *, runtime_env=None) -> dict[str, str]:
    if runtime_env is None:
        from web.api.profiles import get_profile_runtime_env
        runtime_env = get_profile_runtime_env(Path(context.profile_home))
    env = {name: value for name, value in os.environ.items() if name.upper() in _SYSTEM_ENV}
    for name, value in runtime_env.items():
        upper = name.upper()
        if upper in _RESERVED_ENV or upper in _SYSTEM_ENV or upper.startswith(("PYTHON", "LB_", "LASTBROWSER_", "SIDEKICK_WEBUI_")):
            continue
        if not name or "=" in name or "\0" in name or not isinstance(value, str) or "\0" in value:
            raise WorkerError("Invalid native profile environment")
        env[name] = value
    home, space = Path(context.profile_home), Path(context.space_root)
    base = home.parent.parent if home.parent.name == "profiles" else home
    env.update({"SIDEKICK_HOME": str(home), "SIDEKICK_BASE_HOME": str(base),
        "LASTBROWSER_HOME": str(home), "HOME": str(home), "USERPROFILE": str(home),
        "APPDATA": str(home / "appdata"), "LOCALAPPDATA": str(home / "localappdata"),
        "SIDEKICK_SESSION_ID": context.session_id,
        "SIDEKICK_WEBUI_ACTIVE_WORKSPACE": space.name,
        "SIDEKICK_WEBUI_SPACES_DIR": str(space.parent), "SIDEKICK_WEBUI_WORKSPACES_DIR": str(space.parent),
        "TERMINAL_CWD": context.workspace, "SIDEKICK_STREAM_RETRIES": "0",
        "LASTBROWSER_INTEGRATED": "1", "LASTBROWSER_NATIVE_CHAT_WORKER": "1",
        # Existing auth fences disallow shared-root/ambient CLI credentials.
        "LASTBROWSER_INDEPENDENT_WORKER": "1", "LASTBROWSER_INDEPENDENT_PURPOSE": "native_chat",
        "LASTBROWSER_NATIVE_GENERATION": context.writer_generation,
        "LASTBROWSER_BACKEND_PROFILE_ID": context.scope.backend_profile_id,
        "LASTBROWSER_BROWSER_PROFILE_ID": context.scope.browser_profile_id,
        "LASTBROWSER_SPACE_ID": context.scope.space_id, "LASTBROWSER_PARTITION_KEY": context.partition_key,
        # The Host already read the exact own-profile dotenv snapshot.
        # Lazy SDK/runtime imports must not reload reserved Home/bridge fields
        # or discover the development checkout's fallback .env.
        "PYTHON_DOTENV_DISABLED": "1",
        "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    return env


class NativeChatHandle(WorkerHandle):
    def __init__(self, process, context, *, before_stop=None):
        super().__init__(process, context)
        self._control_lock = threading.Lock()
        self._control_serial = 0
        self.requested_stop: str | None = None
        self.before_stop = before_stop

    def _stop_parent_io(self, reason):
        if self.before_stop is not None:
            result = self.before_stop(reason)
            if not isinstance(result, dict) or result.get("acknowledged") is not True or result.get("processesExited") is not True:
                raise WorkerError("native_chat_file_exit_not_confirmed")

    def send_control(self, command: str, *, request_id=None, choice=None, response=None):
        if command not in {"cancel", "pause", "approval", "clarify"}:
            raise ValueError("Unsupported native chat control")
        if command in {"cancel", "pause"}:
            self._stop_parent_io(command)
        with self._control_lock:
            self._control_serial += 1
            if command in {"cancel", "pause"}:
                self.requested_stop = self.requested_stop or command
            message = self.context.envelope("control", command=command, controlSequence=self._control_serial)
            if request_id is not None:
                message["requestId"] = request_id
            if choice is not None:
                message["choice"] = choice
            if response is not None:
                message["response"] = response
            self.send(message)

    def cancel(self):
        if self.is_alive and self.requested_stop is None:
            self._stop_parent_io("cancel")
            # WorkerHandle cleanup may race with normal process teardown.
            # Cleanup cancellation is not a user-requested terminal outcome.
            with self._control_lock:
                self._control_serial += 1
                self.send(self.context.envelope("control", command="cancel", controlSequence=self._control_serial))


class NativeChatHost:
    def __init__(self, context: NativeChatContext, *, python_executable=None):
        self.context = NativeChatContext.model_validate_json(canonical_json(context))
        self.python_executable = canonical_path(python_executable or sys.executable)
        self.sidekick_root = Path(__file__).resolve().parents[2]

    def start(self, args, kwargs, *, runtime_env=None, before_stop=None) -> NativeChatHandle:
        handle, process = None, None
        stage = "context_verification"
        try:
            verify_native_context(self.context)
            stage = "turn_encoding"
            turn = encode_turn(self.context, args, kwargs)
            bootstrap = "import runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_module(sys.argv[2],run_name='__main__')"
            options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            stage = "environment_build"
            env = build_native_environment(self.context, runtime_env=runtime_env)
            stage = "process_spawn"
            process = subprocess.Popen([str(self.python_executable), "-I", "-B", "-u", "-c", bootstrap,
                str(self.sidekick_root), "runtime.independent.native_chat_worker"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8", errors="strict", bufsize=1,
                cwd=self.context.workspace, env=env,
                close_fds=True, **options)
            stage = "worker_handle_init"
            handle = NativeChatHandle(process, self.context, before_stop=before_stop)
            stage = "bootstrap_send"
            handle.send({"kind": "bootstrap", "schemaVersion": 1,
                "context": self.context.model_dump(mode="json", by_alias=True), "turn": turn})
            return handle
        except BaseException as exc:
            try:
                if handle is not None:
                    handle.terminate(grace_seconds=0, hard_seconds=1)
                elif process is not None:
                    process.kill(); process.wait(timeout=5)
                    for stream in (process.stdin, process.stdout, process.stderr):
                        stream.close()
            finally:
                raise NativeChatStartError(diagnostic=_start_diagnostic(
                    stage=stage, exc=exc, process=process, handle=handle)) from exc


def relay_native_chat(context, args, kwargs, put: Callable, *, cancelled=None,
                      on_exit=None, on_started=None, on_start_failed=None, rpc_handler=None,
                      python_executable=None, before_stop=None, on_goal_result=None):
    """Drain independently of UI attachment; never release a run/chat lease here.

    on_exit runs only after OS process wait and Windows Job cleanup. Root owns
    writer release and in-memory session invalidation after this function.
    rpc_handler(context, method, payload) must use the Parent AUTO/compute pool.
    """
    try:
        host = NativeChatHost(context, python_executable=python_executable)
    except Exception as exc:
        if on_start_failed:
            on_start_failed(_start_diagnostic(stage="host_init", exc=exc))
        raise
    try:
        handle = host.start(args, kwargs, before_stop=before_stop)
    except NativeChatStartError as exc:
        if on_start_failed: on_start_failed(exc.diagnostic)
        raise
    sequence = 0
    goal_result = None
    judge_retry = kwargs.get("native_goal_retry")
    stop_at = None
    rpc_work, rpc_done = queue.Queue(16), queue.Queue(16)
    rpc_stopped = threading.Event()
    rpc_pending = set()
    def serve_rpc():
        while not rpc_stopped.is_set():
            try:
                message = rpc_work.get(timeout=.1)
            except queue.Empty:
                continue
            try:
                result = rpc_handler(context, message["method"], message["payload"]) if rpc_handler else None
                reply = context.envelope("rpc_reply", requestId=message["requestId"],
                    ok=rpc_handler is not None, result=result)
            except Exception as exc:
                # Exception text can contain request data. Return only the
                # bounded machine code carried by internal coded denials.
                code = getattr(exc, "code", None)
                safe_code = code if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_]{1,95}", code) else None
                receipt = _native_rpc_denial_receipt(message.get("method"), exc)
                if receipt is not None:
                    try:
                        put("native_chat_rpc_denied", receipt)
                    except Exception:
                        # Diagnostics must never change a fail-closed RPC result.
                        pass
                reply = context.envelope("rpc_reply", requestId=message["requestId"], ok=False,
                    result=None, denialCode=safe_code)
            if not rpc_stopped.is_set():
                try: rpc_done.put_nowait(reply)
                except queue.Full: return
    rpc_thread = threading.Thread(target=serve_rpc, name="NativeChatParentRPC", daemon=True)
    rpc_thread.start()
    try:
        if on_started:
            on_started(handle)
        while True:
            while not rpc_done.empty():
                reply = rpc_done.get_nowait()
                rpc_pending.discard(reply["requestId"])
                if handle.is_alive:
                    handle.send(reply)
            if cancelled is not None and cancelled.is_set() and handle.requested_stop is None:
                handle.send_control("cancel")
            if handle.requested_stop is not None:
                stop_at = stop_at or time.monotonic()
                if time.monotonic() - stop_at > 3:
                    handle.terminate(grace_seconds=0, hard_seconds=1)
                    break
            message = handle.read_event(timeout=0.1)
            if message is None:
                if not handle.is_alive and not handle._reader.is_alive():
                    break
                continue
            if message.get("kind") == "eof":
                if message.get("errorCode"):
                    raise WorkerError(message["errorCode"])
                break
            context.validate_envelope(message)
            if message.get("kind") == "native_event":
                if type(message.get("sequence")) is not int or message["sequence"] != sequence + 1:
                    raise WorkerError("native_chat_sequence_gap")
                sequence += 1
                if message["event"] == "goal_judge_result":
                    from .native_goal_retry import NativeGoalRetryRequest, NativeGoalRetryResult
                    if judge_retry is None or goal_result is not None or on_goal_result is None:
                        raise WorkerError("native_goal_retry_result_unexpected")
                    request = NativeGoalRetryRequest.model_validate(judge_retry)
                    result = NativeGoalRetryResult.model_validate(message["data"])
                    if len(canonical_json(result).encode("utf-8")) > 16384 or any(
                            getattr(result, field) != getattr(request, field) for field in
                            ("request_id", "scope", "session_id", "stream_id", "goal_run_id", "goal_revision", "goal_digest")):
                        raise WorkerError("native_goal_retry_result_mismatch")
                    goal_result = result.model_dump(mode="json", by_alias=True)
                elif judge_retry is not None and message["event"] not in {"stream_end", "error", "apperror"}:
                    raise WorkerError("native_goal_retry_event_forbidden")
                else:
                    put(message["event"], message["data"])
            elif message.get("kind") == "rpc":
                if judge_retry is not None and message.get("method") in {"file_execute", "browser_execute"}:
                    raise WorkerError("native_goal_retry_effect_forbidden")
                # Host adapter never receives prompts, API keys or SDK clients.
                from .native_chat_worker import validate_rpc_payload
                validate_rpc_payload(message["method"], message["payload"])
                request_id = message.get("requestId")
                if not isinstance(request_id, str) or len(request_id) > 128 or request_id in rpc_pending or len(rpc_pending) >= 16:
                    raise WorkerError("native_chat_rpc_capacity_or_identity")
                rpc_pending.add(request_id)
                rpc_work.put_nowait(message)
            elif message.get("kind") in {"control_ack", "worker_ready", "worker_finished", "worker_fault"}:
                put(message["kind"], {key: value for key, value in message.items() if key != "kind"})
            else:
                raise WorkerError("native_chat_unknown_message")
    finally:
        rpc_stopped.set()
        try:
            handle._stop_parent_io(handle.requested_stop or "cancel")
        finally:
            handle.terminate(grace_seconds=0 if handle.requested_stop else 1, hard_seconds=3)
        if handle.is_alive:
            # Root must not release the writer if OS termination was unconfirmed.
            raise WorkerError("native_chat_exit_not_confirmed")
        if on_exit:
            on_exit(handle)
    if handle.requested_stop:
        put("worker_exit", context.envelope("worker_exit", status="paused" if handle.requested_stop == "pause" else "cancelled", returncode=handle.returncode))
    elif handle.returncode != 0:
        raise WorkerError("native_chat_worker_failed")
    elif judge_retry is not None:
        if goal_result is None or on_goal_result is None:
            raise WorkerError("native_goal_retry_result_missing")
        on_goal_result(goal_result)
    return 3 if judge_retry is not None and handle.requested_stop else handle.returncode
