"""Parent-owned native chat process; writer release is deliberately external."""
from __future__ import annotations
import hashlib
import os
import logging
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

logger = logging.getLogger(__name__)


class NativeChatStartError(WorkerError):
    def __init__(self, *, diagnostic: dict):
        self.diagnostic = diagnostic
        self.exit_confirmed = diagnostic["exitConfirmed"]
        super().__init__("native_chat_start_failed")


_RPC_DIAGNOSTIC_METHODS = frozenset({
    "auto_validate", "auto_policy", "auto_claim", "auto_observe", "auto_usage", "auto_subscription_fallback",
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
    from web.api.runtime_identity import RUNTIME_GENERATION
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
        # Session id and writer generation change every turn. They are stamped
        # onto the process when that turn binds, so a warm worker can be reused
        # for the next chat in the same profile, Space and workspace.
        "SIDEKICK_SESSION_ID": "persistent",
        "SIDEKICK_WEBUI_ACTIVE_WORKSPACE": space.name,
        "SIDEKICK_WEBUI_SPACES_DIR": str(space.parent), "SIDEKICK_WEBUI_WORKSPACES_DIR": str(space.parent),
        "TERMINAL_CWD": context.workspace, "SIDEKICK_STREAM_RETRIES": "0",
        "LASTBROWSER_INTEGRATED": "1", "LASTBROWSER_NATIVE_CHAT_WORKER": "1",
        # Existing auth fences disallow shared-root/ambient CLI credentials.
        "LASTBROWSER_INDEPENDENT_WORKER": "1", "LASTBROWSER_INDEPENDENT_PURPOSE": "native_chat",
        "LASTBROWSER_NATIVE_GENERATION": "persistent",
        # Completion proofs belong to the owning desktop runtime. Without
        # this, each worker invents an unrelated generation and valid chats
        # can never qualify their provider/model in the renderer.
        "LASTBROWSER_RUNTIME_GENERATION": RUNTIME_GENERATION,
        "LASTBROWSER_BACKEND_PROFILE_ID": context.scope.backend_profile_id,
        "LASTBROWSER_BROWSER_PROFILE_ID": context.scope.browser_profile_id,
        "LASTBROWSER_SPACE_ID": context.scope.space_id, "LASTBROWSER_PARTITION_KEY": context.partition_key,
        # The Host already read the exact own-profile dotenv snapshot.
        # Lazy SDK/runtime imports must not reload reserved Home/bridge fields
        # or discover the development checkout's fallback .env.
        "PYTHON_DOTENV_DISABLED": "1",
        "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    from runtime.opencode_free_chat import free_client_path
    binary = free_client_path()
    if binary:
        env["LASTBROWSER_OPENCODE_BIN"] = binary
    return env


class NativeChatHandle(WorkerHandle):
    def __init__(self, process, context, *, before_stop=None):
        super().__init__(process, context)
        self._control_lock = threading.Lock()
        self._control_serial = 0
        self.requested_stop: str | None = None
        self.before_stop = before_stop
        # Persistent workers serve several turns of one pool key; the serial above continues across them.
        self.turns = 1
        self.turn_quiescent = False
        self.fingerprint: str | None = None
        self.pool_key = None
        self.idle_timer = None

    def rebind_turn(self, context, *, before_stop=None):
        """Idle reuse only: bind the next turn's context and per-turn stop state."""
        self.context = context
        self.before_stop = before_stop
        self.requested_stop = None
        self.turn_quiescent = False
        self.turns += 1

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
        from .worker_host import _interpreter_path, resolve_worker_python_executable
        self.python_executable = _interpreter_path(Path(python_executable or resolve_worker_python_executable()))
        self.sidekick_root = Path(__file__).resolve().parents[2]

    def pool_key(self):
        context = self.context
        provider = context.provider_capture.provider.provider if context.provider_capture is not None else None
        return (str(canonical_path(context.profile_home)), str(canonical_path(context.space_root)),
                context.selection_mode, provider)

    def _fingerprint(self, env) -> str:
        """Every spawn-time input. A changed value starts a fresh worker, never a reused one."""
        return native_worker_fingerprint(env=env, workspace=self.context.workspace,
            python_executable=self.python_executable, sidekick_root=self.sidekick_root)

    def prepare(self, args, kwargs, *, runtime_env=None):
        """Reuse path: the same verification, turn encoding and fingerprint as start()."""
        verify_native_context(self.context)
        turn = encode_turn(self.context, args, kwargs)
        env = build_native_environment(self.context, runtime_env=runtime_env)
        frame = {"kind": "bootstrap", "schemaVersion": 1, "persistent": True,
            "context": self.context.model_dump(mode="json", by_alias=True), "turn": turn}
        return frame, self._fingerprint(env)

    def start(self, args, kwargs, *, runtime_env=None, before_stop=None, persistent=False) -> NativeChatHandle:
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
            handle.fingerprint = self._fingerprint(env)
            handle.pool_key = self.pool_key()
            stage = "bootstrap_send"
            handle.send({"kind": "bootstrap", "schemaVersion": 1, "persistent": persistent,
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


# Measured default; LASTBROWSER_CHAT_PERSISTENT_WORKER=1 or 0 always overrides it.
# ON for demo 0.1.57-demo.4: the policy, SDK, file, browser and auto/teamwork bridges
# are released at the turn boundary (fb249ae4), so a reused worker serves several turns.
_PERSISTENT_WORKER_DEFAULT = True


def persistent_worker_enabled() -> bool:
    raw = os.environ.get("LASTBROWSER_CHAT_PERSISTENT_WORKER", "").strip()
    if raw == "":
        return _PERSISTENT_WORKER_DEFAULT
    return raw == "1"


def _retire_worker(handle) -> None:
    """Terminate an idle or unusable worker; it has no turn left to report to."""
    handle.before_stop = None
    handle.turn_quiescent = False
    try:
        handle.terminate(grace_seconds=0, hard_seconds=1)
    except Exception:
        logger.warning("native_chat_worker_retire_failed")


def native_worker_fingerprint(*, env, workspace, python_executable, sidekick_root) -> str:
    """Hash spawn inputs. Turn identity is not included; bind stamps it per turn."""
    payload = {"env": env, "cwd": str(workspace),
               "python": str(python_executable), "root": str(sidekick_root)}
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


class _NativeWorkerPool:
    """At most one idle persistent worker per Profile Home, Space and provider.

    A worker is reused only with an identical spawn fingerprint (environment,
    workspace and interpreter). The session and writer generation are applied
    when the next turn binds. Idle workers expire after the TTL.
    """
    idle_ttl_seconds = 120.0
    max_turns = 64

    def __init__(self):
        self._lock = threading.Lock()
        self._idle = {}

    def take(self, key, fingerprint):
        with self._lock:
            entry = self._idle.pop(key, None)
        if entry is None:
            return None
        handle, held_fingerprint = entry
        timer, handle.idle_timer = handle.idle_timer, None
        if timer is not None:
            timer.cancel()
        if (held_fingerprint != fingerprint or handle.turns >= self.max_turns or not handle.is_alive
                or handle.transport_error is not None or not handle._events.empty()):
            _retire_worker(handle)
            return None
        return handle

    def give_back(self, key, handle):
        with self._lock:
            previous = self._idle.pop(key, None)
            self._idle[key] = (handle, handle.fingerprint)
        if previous is not None:
            _retire_worker(previous[0])
        timer = threading.Timer(self.idle_ttl_seconds, self._expire, args=(key, handle))
        timer.daemon = True
        handle.idle_timer = timer
        timer.start()

    def _expire(self, key, handle):
        with self._lock:
            entry = self._idle.get(key)
            if entry is None or entry[0] is not handle:
                return
            del self._idle[key]
        _retire_worker(handle)


NATIVE_WORKER_POOL = _NativeWorkerPool()
_PREWARM_LIMIT = 4


def prewarm_persistent_chat_workers() -> int:
    """Import the chat runtime in an idle worker before the first send.

    The first turn of a fresh process spends several seconds importing the
    agent before the provider is contacted. A desktop that is already open
    can pay that cost at startup. Failure leaves chat correct and cold.
    Returns how many idle workers were parked.
    """
    if not persistent_worker_enabled() or os.environ.get("LASTBROWSER_INTEGRATED") != "1":
        return 0
    if os.environ.get("LASTBROWSER_CHAT_WORKER_PREWARM") == "0":
        return 0
    started = time.monotonic()
    parked = 0
    try:
        from types import SimpleNamespace
        from web.api.independent import hub
        from .scope import ScopeResolver, canonical_path
        from .scope_binding import provider_selection
        from .worker_host import _interpreter_path, resolve_worker_python_executable
        current = hub()
        python_executable = _interpreter_path(Path(resolve_worker_python_executable()))
        sidekick_root = Path(__file__).resolve().parents[2]
        for profile in current.profiles():
            if parked >= _PREWARM_LIMIT:
                break
            database = Path(profile["path"]) / "state.db"
            if not database.is_file():
                continue
            try:
                store = current.get(profile["name"])
            except Exception:
                logger.debug("native_chat_worker_prewarm profile skipped", exc_info=True)
                continue
            resolver = ScopeResolver(store, profiles_provider=current.profiles)
            try:
                bindings = store.list_bindings()
            except Exception:
                logger.debug("native_chat_worker_prewarm bindings skipped", exc_info=True)
                continue
            for binding in bindings:
                if parked >= _PREWARM_LIMIT or binding.tombstoned_at is not None:
                    continue
                workspace = str(binding.workspace_locator or "")
                if not workspace or not Path(workspace).is_dir():
                    continue
                try:
                    resolved = resolver.resolve(binding.scope, authenticated_profile_name=profile["name"])
                    selection, _digest = provider_selection(resolved)
                except Exception:
                    logger.debug("native_chat_worker_prewarm resolve skipped", exc_info=True)
                    continue
                provider = str(getattr(selection, "provider", "") or "").strip()
                if not provider:
                    continue
                stub = SimpleNamespace(profile_home=str(resolved.profile_home),
                    space_root=str(resolved.space_root), session_id="persistent",
                    workspace=workspace, writer_generation="persistent",
                    scope=binding.scope, partition_key=binding.partition_key)
                try:
                    env = build_native_environment(stub)
                except Exception:
                    logger.debug("native_chat_worker_prewarm environment skipped", exc_info=True)
                    continue
                fingerprint = native_worker_fingerprint(env=env, workspace=workspace,
                    python_executable=python_executable, sidekick_root=sidekick_root)
                key = (str(canonical_path(resolved.profile_home)), str(canonical_path(resolved.space_root)),
                       "fixed", provider)
                if _park_warm_worker(env, workspace, key, fingerprint, python_executable, sidekick_root):
                    parked += 1
    except Exception:
        logger.info("native_chat_worker_prewarm skipped")
        return parked
    logger.info("native_chat_worker_prewarm ready elapsed_ms=%.0f workers=%s",
        (time.monotonic() - started) * 1000, parked)
    return parked


def _park_warm_worker(env, workspace, key, fingerprint, python_executable, sidekick_root) -> bool:
    """Start one imported worker and leave it idle. The warmup flag is not fingerprinted."""
    from types import SimpleNamespace
    spawn_env = dict(env)
    spawn_env["LASTBROWSER_CHAT_WORKER_WARMUP"] = "1"
    bootstrap = "import runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_module(sys.argv[2],run_name='__main__')"
    options = {"creationflags": subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    process = None
    handle = None
    try:
        process = subprocess.Popen([str(python_executable), "-I", "-B", "-u", "-c", bootstrap,
            str(sidekick_root), "runtime.independent.native_chat_worker"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="strict", bufsize=1,
            cwd=workspace, env=spawn_env, close_fds=True, **options)
        handle = NativeChatHandle(process, SimpleNamespace(run_id="warm", control_epoch=0))
        message = handle.read_event(timeout=90)
        if not isinstance(message, dict) or message.get("kind") != "worker_warm" or not handle._events.empty():
            handle.terminate(grace_seconds=0, hard_seconds=1)
            return False
        handle.turns = 0
        handle.fingerprint = fingerprint
        handle.pool_key = key
        NATIVE_WORKER_POOL.give_back(key, handle)
        return True
    except Exception:
        logger.debug("native_chat_worker_prewarm spawn skipped", exc_info=True)
        if handle is not None:
            try:
                handle.terminate(grace_seconds=0, hard_seconds=1)
            except Exception:
                pass
        elif process is not None:
            try:
                process.kill()
            except Exception:
                pass
        return False


def _take_persistent_worker(host, args, kwargs, before_stop):
    """Return an idle worker bound to this turn, or None for a fresh spawn."""
    try:
        frame, fingerprint = host.prepare(args, kwargs)
    except Exception:
        return None  # start() repeats the same verification and reports its diagnostics.
    handle = NATIVE_WORKER_POOL.take(host.pool_key(), fingerprint)
    if handle is None:
        return None
    try:
        handle.rebind_turn(host.context, before_stop=before_stop)
        handle.send(frame)
    except Exception:
        _retire_worker(handle)  # No turn started yet, so a fresh worker can run it.
        return None
    return handle


def relay_native_chat(context, args, kwargs, put: Callable, *, cancelled=None,
                      on_exit=None, on_started=None, on_start_failed=None, rpc_handler=None,
                      python_executable=None, before_stop=None, on_goal_result=None):
    """Drain independently of UI attachment; never release a run/chat lease here.

    on_exit runs only after OS process wait and Windows Job cleanup. Root owns
    writer release and in-memory session invalidation after this function.
    rpc_handler(context, method, payload) must use the Parent AUTO/compute pool.
    """
    phase_start = time.monotonic()
    ready_logged = False
    first_event_logged = False
    first_text_logged = False
    try:
        host = NativeChatHost(context, python_executable=python_executable)
    except Exception as exc:
        if on_start_failed:
            on_start_failed(_start_diagnostic(stage="host_init", exc=exc))
        raise
    persistent = persistent_worker_enabled() and kwargs.get("native_goal_retry") is None
    handle = _take_persistent_worker(host, args, kwargs, before_stop) if persistent else None
    if handle is None:
        try:
            handle = host.start(args, kwargs, before_stop=before_stop, persistent=persistent)
        except NativeChatStartError as exc:
            if on_start_failed: on_start_failed(exc.diagnostic)
            raise
    logger.info("native_chat_phase stream=%s stage=spawn_sent elapsed_ms=%.1f",
        context.stream_id, (time.monotonic() - phase_start) * 1000)
    sequence = 0
    goal_result = None
    judge_retry = kwargs.get("native_goal_retry")
    stop_at = None
    rpc_work, rpc_done = queue.Queue(16), queue.Queue(16)
    rpc_stopped = threading.Event()
    rpc_pending = set()
    turn_end = None
    reusable = False
    def serve_rpc():
        while not rpc_stopped.is_set():
            try:
                message = rpc_work.get(timeout=.1)
            except queue.Empty:
                continue
            try:
                rpc_started = time.monotonic()
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
            logger.debug("native_chat_phase stream=%s stage=rpc_%s elapsed_ms=%.1f",
                context.stream_id, message.get("method"), (time.monotonic() - rpc_started) * 1000)
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
                if not first_event_logged:
                    first_event_logged = True
                    logger.info("native_chat_phase stream=%s stage=first_worker_event elapsed_ms=%.1f",
                        context.stream_id, (time.monotonic() - phase_start) * 1000)
                if message.get("event") == "token" and not first_text_logged:
                    first_text_logged = True
                    logger.info("native_chat_phase stream=%s stage=first_text elapsed_ms=%.1f",
                        context.stream_id, (time.monotonic() - phase_start) * 1000)
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
            elif message.get("kind") == "worker_phase":
                # Phase timing only: the UI never receives worker phase marks.
                logger.info("native_chat_phase stream=%s stage=worker_%s wall=%.6f",
                    context.stream_id, message.get("phase"), float(message.get("wall") or 0.0))
            elif message.get("kind") in {"control_ack", "worker_ready", "worker_finished", "worker_fault"}:
                if message["kind"] == "worker_ready" and not ready_logged:
                    ready_logged = True
                    logger.info("native_chat_phase stream=%s stage=worker_ready elapsed_ms=%.1f",
                        context.stream_id, (time.monotonic() - phase_start) * 1000)
                elif message["kind"] == "worker_finished":
                    logger.info("native_chat_phase stream=%s stage=worker_finished elapsed_ms=%.1f",
                        context.stream_id, (time.monotonic() - phase_start) * 1000)
                put(message["kind"], {key: value for key, value in message.items() if key != "kind"})
                if persistent and message["kind"] == "worker_finished":
                    # The worker stays alive for the next turn; nothing more belongs to this turn.
                    turn_end = message
                    break
            else:
                raise WorkerError("native_chat_unknown_message")
    finally:
        rpc_stopped.set()
        try:
            handle._stop_parent_io(handle.requested_stop or "cancel")
            reusable = bool(persistent and turn_end is not None and turn_end.get("reusable") is True
                and handle.is_alive and handle.transport_error is None and handle._events.empty())
        finally:
            if not reusable:
                handle.terminate(grace_seconds=0 if handle.requested_stop else 1, hard_seconds=3)
        if handle.is_alive and not reusable:
            # Root must not release the writer if OS termination was unconfirmed.
            raise WorkerError("native_chat_exit_not_confirmed")
        if reusable:
            # Idle worker: no engine thread, no pending RPC and no stream state for this turn.
            handle.turn_quiescent = True
        try:
            if on_exit:
                on_exit(handle)
        except BaseException:
            if reusable:
                _retire_worker(handle)
            raise
        if reusable:
            NATIVE_WORKER_POOL.give_back(handle.pool_key, handle)
    exit_code = 0 if reusable else handle.returncode
    if handle.requested_stop:
        put("worker_exit", context.envelope("worker_exit", status="paused" if handle.requested_stop == "pause" else "cancelled", returncode=exit_code))
    elif exit_code != 0:
        raise WorkerError("native_chat_worker_failed")
    elif judge_retry is not None:
        if goal_result is None or on_goal_result is None:
            raise WorkerError("native_goal_retry_result_missing")
        on_goal_result(goal_result)
    return 3 if judge_retry is not None and handle.requested_stop else exit_code
