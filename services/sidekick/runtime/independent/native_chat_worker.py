"""Fixed-profile adapter around the existing ordinary Session/Goal engine."""
from __future__ import annotations
import json
import os
import queue
import re
import sys
import threading
import time
import uuid
from pathlib import Path

from .contracts import canonical_json
from .native_chat_protocol import NativeChatContext, decode_turn, verify_native_context
from .worker_host import MAX_EVENTS, MAX_LINE_BYTES, WorkerError

_RPC_METHODS = frozenset({"auto_validate", "auto_policy", "auto_claim", "auto_observe", "auto_usage",
    "fixed_validate", "fixed_claim", "fixed_observe", "fixed_usage", "compute_acquire", "compute_release",
    "teamwork_plan", "teamwork_validate", "teamwork_claim", "teamwork_authorize",
    "teamwork_compute_acquire", "teamwork_compute_release", "teamwork_observe", "teamwork_usage"})
_RPC_KEYS = frozenset({"decision", "claim", "claimId", "receiptRefs", "model", "provider", "headers", "status", "usage", "deliveredDelta", "outputTokens", "inputTokensUpperBound", "inputBoundSource", "requestPurpose", "acknowledged", "state", "requirements", "errorCode"})
_stage = "bootstrap"
_failure_sink = None


def validate_rpc_payload(method, payload):
    if method == "browser_execute":
        from .native_browser_contracts import validate_browser_payload
        validate_browser_payload(payload)
        return
    if method == "file_execute":
        from .native_file_contracts import validate_file_payload
        validate_file_payload(payload)
        return
    if method not in _RPC_METHODS or not isinstance(payload, dict) or set(payload) - _RPC_KEYS:
        raise WorkerError("native_chat_rpc_not_allowed")
    # Reject secret/prompt-shaped metadata at every nesting level.
    def check(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if str(key).lower().replace("_", "").replace("-", "") in {"apikey", "authorization", "proxyauthorization", "cookie", "setcookie", "password", "credentials", "content", "prompt", "messages", "input", "secret", "token", "accesstoken", "refreshtoken"}:
                    raise WorkerError("native_chat_rpc_private_data_forbidden")
                check(item)
        elif isinstance(value, list):
            for item in value: check(item)
    check(payload)
    if len(canonical_json(payload).encode("utf-8")) > 65536:
        raise WorkerError("native_chat_rpc_too_large")


class NativeRPC:
    """Bounded multiplexing; the independent stdin reader never waits for RPC."""
    def __init__(self, context, emit, stopped):
        self.context, self.emit, self.stopped = context, emit, stopped
        self._lock = threading.Lock()
        self._pending = {}

    def call(self, method, payload, *, timeout=15):
        validate_rpc_payload(method, payload)
        if self.stopped.is_set():
            raise WorkerError("native_chat_rpc_interrupted")
        request_id, response = uuid.uuid4().hex, queue.Queue(1)
        with self._lock:
            if len(self._pending) >= 16:
                raise WorkerError("native_chat_rpc_capacity")
            self._pending[request_id] = response
        try:
            self.emit(self.context.envelope("rpc", requestId=request_id, method=method, payload=payload))
            deadline = time.monotonic() + min(max(timeout, 0), 60 if method == "browser_execute" else 30)
            while not self.stopped.is_set():
                try:
                    message = response.get(timeout=min(.1, max(.001, deadline-time.monotonic())))
                    if message.get("ok") is not True:
                        denial = message.get("denialCode")
                        if not isinstance(denial, str) or not re.fullmatch(r"[a-z][a-z0-9_]{1,95}", denial):
                            denial = "unclassified"
                        raise WorkerError("native_chat_rpc_denied_" + denial)
                    return message.get("result")
                except queue.Empty:
                    if time.monotonic() >= deadline:
                        break
            raise WorkerError("native_chat_rpc_interrupted")
        finally:
            with self._lock:
                self._pending.pop(request_id, None)

    def resolve(self, message):
        with self._lock:
            response = self._pending.get(message.get("requestId"))
            if response is None:
                return False
            try:
                response.put_nowait(message)
                return True
            except queue.Full:
                return False


def bind_native_context(context):
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1" or os.getenv("SIDEKICK_HOME") != context.profile_home:
        raise WorkerError("native_chat_not_private")
    verify_native_context(context)
    from web.api import profiles, config
    profiles._active_profile = context.profile_name
    profiles.set_request_profile(context.profile_name)
    if profiles.get_active_profile_home().resolve() != Path(context.profile_home).resolve():
        raise WorkerError("native_chat_profile_resolver_mismatch")
    # config is imported before the request-profile binding above. Legacy
    # provider helpers read its cfg alias directly, so refresh the private
    # process cache before any model/SDK resolution, not only afterwards.
    if config._get_config_path().resolve() != (Path(context.profile_home) / "config.yaml").resolve():
        raise WorkerError("native_chat_config_resolver_mismatch")
    config.get_config()
    # Bare SDK/title/checkpoint threads use these private process defaults.
    config.SESSION_DIR = Path(context.sessions_dir)
    config.SESSION_INDEX_FILE = config.SESSION_DIR / "_index.json"
    config.set_session_dir(context.sessions_dir)
    from web.api.space_engine import set_active_space
    set_active_space(Path(context.space_root).name)
    from .native_chat_policy import bind_native_policy
    bind_native_policy(context)


class ExactPendingBridge:
    """Bind server IDs to actual pending entry objects; never FIFO fallback."""
    def __init__(self, context):
        self.context = context
        self._lock = threading.Lock()
        self._entries = {}

    @staticmethod
    def module(kind):
        if kind == "approval":
            from tools import approval
            return approval
        from web.api import clarify
        return clarify

    def bind(self, kind, data):
        module = self.module(kind)
        with module._lock:
            candidates = [entry for entry in module._gateway_queues.get(self.context.session_id, [])
                if not entry.event.is_set() and all(entry.data.get(key) == value for key, value in data.items())]
        if len(candidates) != 1:
            raise WorkerError("native_chat_pending_entry_ambiguous")
        entry = candidates[0]
        with self._lock:
            for request_id, pair in self._entries.items():
                if pair == (kind, entry):
                    return {**data, "requestId": request_id}
            if len(self._entries) >= 32:
                raise WorkerError("native_chat_pending_capacity")
            request_id = uuid.uuid4().hex
            self._entries[request_id] = (kind, entry)
        return {**data, "requestId": request_id}

    def resolve(self, kind, request_id, value):
        if kind == "approval" and value not in {"once", "session", "always", "deny"}:
            return False
        if kind == "clarify" and (not isinstance(value, str) or len(value) > 16384):
            return False
        with self._lock:
            pair = self._entries.get(request_id)
            if pair is None or pair[0] != kind:
                return False
            module, entry = self.module(kind), pair[1]
            with module._lock:
                entries = module._gateway_queues.get(self.context.session_id, [])
                if entry not in entries or entry.event.is_set():
                    return False
                entries.remove(entry)
                if not entries:
                    module._gateway_queues.pop(self.context.session_id, None)
                    module._pending.pop(self.context.session_id, None)
                elif kind == "clarify":
                    module._pending[self.context.session_id] = entries[0].data
                entry.result = value
                entry.event.set()
            self._entries.pop(request_id)
        # Approval module applies once/session/always to the actual command
        # after the waiting engine reads this exact entry.result.
        return True


class _Channel:
    def __init__(self):
        self.queue = queue.Queue(MAX_EVENTS)
        self.overflow = threading.Event()
    def put_nowait(self, item):
        try:
            self.queue.put_nowait(item)
        except queue.Full:
            self.overflow.set()
            raise


def main():
    global _stage, _failure_sink
    protocol_output = sys.stdout
    # Isolated Python ignores PYTHONIOENCODING; Windows pipes need an explicit codec.
    protocol_output.reconfigure(encoding="utf-8", errors="strict")
    sys.stdin.reconfigure(encoding="utf-8", errors="strict")
    sys.stderr.reconfigure(encoding="utf-8", errors="strict")
    # Provider diagnostics never enter the protocol or Parent logs.
    sys.stdout = sys.stderr
    write_lock = threading.Lock()
    def emit(value):
        encoded = canonical_json(value) + "\n"
        if len(encoded.encode("utf-8")) > MAX_LINE_BYTES:
            raise WorkerError("native_chat_message_too_large")
        with write_lock:
            protocol_output.write(encoded); protocol_output.flush()
    line = sys.stdin.readline(MAX_LINE_BYTES + 1)
    if not line or not line.endswith("\n") or len(line.encode("utf-8")) > MAX_LINE_BYTES:
        return 2
    initial = json.loads(line)
    if initial.get("kind") != "bootstrap" or initial.get("schemaVersion") != 1:
        return 2
    context = NativeChatContext.model_validate(initial["context"])
    def failure_sink(exc):
        # Only allowlisted static diagnostics; never provider exception text.
        reasons = {"Configured path is not available":"configured_path_unavailable",
            "An absolute, broker-resolved path is required":"absolute_path_required",
            "Native chat selection policy changed":"selection_policy_changed",
            "Native chat metadata cannot be verified":"session_metadata_unavailable",
            "Native chat owner metadata is unavailable":"session_owner_unavailable",
            "Native chat binding changed":"binding_changed"}
        emit(context.envelope("worker_fault", stage=_stage, errorType=type(exc).__name__,
            errorCode=reasons.get(str(exc), "worker_adapter_failed")))
    _failure_sink = failure_sink
    if context.selection_mode == "fixed" and context.provider_capture is None and not context.teamwork:
        _stage = "fixed_capture"
        raise WorkerError("native_fixed_provider_capture_missing")
    _stage = "bind_context"
    bind_native_context(context)
    _stage = "decode_turn"
    args, kwargs = decode_turn(context, initial["turn"])
    judge_retry = "native_goal_retry" in kwargs
    from web.api import config
    from web.api.models import Session, SESSIONS
    from .chat_binding import _OWN_WRITERS
    from contextvars import copy_context
    # Load without stale-stream repair: the actual Parent writer is alive.
    actual_path = Path(context.sessions_dir) / (context.session_id + ".json")
    if not actual_path.is_file() or actual_path.is_symlink():
        raise WorkerError("native_chat_saved_session_missing")
    session = Session(**json.loads(actual_path.read_text("utf-8")))
    if (session.session_id != context.session_id or (session.profile or "default") != context.profile_name
        or session.space_scope != context.scope.model_dump(mode="json", by_alias=True)
        or session.active_stream_id != context.stream_id):
        raise WorkerError("native_chat_saved_session_mismatch")
    if Path(session.workspace).resolve() != Path(context.workspace).resolve():
        raise WorkerError("native_chat_saved_workspace_mismatch")
    SESSIONS[context.session_id] = session
    channel, stopped, finished = _Channel(), threading.Event(), threading.Event()
    config.STREAMS[context.stream_id] = channel
    bridge = ExactPendingBridge(context)
    rpc = NativeRPC(context, emit, stopped)
    # Purpose-owned SDK integration installed by the same private builder.
    # AUTO cannot silently use an unproven client or a second compute pool.
    teamwork_turn = str(args[2]).strip().lower() == "teamwork" or str(kwargs.get("mode") or "").strip().lower() == "teamwork"
    if str(args[2]).strip().lower() == "auto":
        raise WorkerError("native_chat_pseudo_model_forbidden")
    if teamwork_turn:
        _stage = "teamwork_install"
        from .native_teamwork import install_native_teamwork_bridge
        install_native_teamwork_bridge(context, rpc)
    elif context.selection_mode == "auto":
        _stage = "auto_install"
        from .native_chat_auto import install_native_auto_bridge
        install_native_auto_bridge(context, rpc)
    else:
        _stage = "fixed_install"
        from .native_sdk_broker import install_native_sdk_bridge
        install_native_sdk_bridge(context, rpc)
    if judge_retry:
        def cancel_stream(_stream_id):
            return None
    elif teamwork_turn:
        # Teamwork models receive no browser or file tool bridge. The ordinary
        # SSE cancellation boundary still owns the whole turn.
        from web.api.streaming import _run_agent_streaming, cancel_stream
    else:
        from .native_file_io import install_native_file_bridge
        install_native_file_bridge(context, rpc)
        from .native_browser_bridge import install_native_browser_bridge
        install_native_browser_bridge(context, rpc)
        from web.api.streaming import _run_agent_streaming, cancel_stream
    stop_command = [None]
    control_sequence = [0]
    def interrupt():
        # Controls can arrive before core creates its CANCEL_FLAGS entry.
        stopped.set()
        cancel_stream(context.stream_id)
    def controls():
        try:
            while not finished.is_set():
                raw = sys.stdin.readline(MAX_LINE_BYTES + 1)
                if not raw:
                    interrupt(); return
                if not raw.endswith("\n") or len(raw.encode("utf-8")) > MAX_LINE_BYTES:
                    interrupt(); return
                message = json.loads(raw)
                context.validate_envelope(message)
                if message.get("kind") == "rpc_reply":
                    rpc.resolve(message); continue
                if message.get("kind") != "control":
                    interrupt(); return
                serial = message.get("controlSequence")
                if type(serial) is not int or serial != control_sequence[0] + 1:
                    emit(context.envelope("control_ack", accepted=False, code="stale_control")); continue
                control_sequence[0] = serial
                command = message.get("command")
                if command in {"cancel", "pause"}:
                    stop_command[0] = stop_command[0] or command
                    emit(context.envelope("control_ack", accepted=True, command=command, status="stopping", controlSequence=serial))
                    interrupt()
                elif command in {"approval", "clarify"}:
                    value = message.get("choice") if command == "approval" else message.get("response")
                    accepted = bridge.resolve(command, message.get("requestId"), value)
                    emit(context.envelope("control_ack", accepted=accepted, command=command,
                        requestId=message.get("requestId"), controlSequence=serial))
                else:
                    emit(context.envelope("control_ack", accepted=False, code="unknown_control", controlSequence=serial))
        except Exception:
            interrupt()
    failure = []
    def run():
        global _stage
        try:
            config.set_session_dir(context.sessions_dir)
            if not stopped.is_set():
                actual_args, actual_kwargs = args, kwargs
                if teamwork_turn:
                    # The Parent has already fixed every Teamwork role/model
                    # pair. Do not route this virtual model through ordinary
                    # AUTO/FIXED single-model selection.
                    actual_args, actual_kwargs = args, kwargs
                elif context.selection_mode == "auto":
                    # RPC requires the separate stdin reader to be running.
                    from .native_chat_auto import prepare_native_auto_turn
                    _stage = "auto_prepare"
                    actual_args, actual_kwargs = prepare_native_auto_turn(args, kwargs)
                    from .native_chat_auto import get_bound_native_auto_bridge
                    auto_bridge = get_bound_native_auto_bridge()
                    if auto_bridge is None or auto_bridge.decision is None:
                        raise WorkerError("native_auto_decision_missing")
                    # Safe user-visible routing receipt: public_view deliberately
                    # excludes the captured RunContext and any prompt/provider secrets.
                    channel.put_nowait(("auto_route", auto_bridge.decision.public_view()))
                else:
                    from .native_sdk_broker import prepare_native_fixed_turn
                    _stage = "fixed_prepare"
                    actual_args, actual_kwargs = prepare_native_fixed_turn(args, kwargs)
                _stage = "engine"
                if judge_retry:
                    _stage = "goal_judge_retry"
                    from .native_goal_retry import run_native_goal_retry
                    run_native_goal_retry(context, kwargs["native_goal_retry"],
                        execution_policy=kwargs["execution_policy"],
                        put=lambda event, data: channel.put_nowait((event, data)))
                else:
                    _run_agent_streaming(*actual_args, **actual_kwargs)
        except BaseException as exc:
            failure.append(type(exc).__name__)
            if not stopped.is_set():
                _failure_sink(exc)
        finally:
            finished.set()
    token = _OWN_WRITERS.set((context.writer_lease_id,))
    try:
        engine_context = copy_context()
    finally:
        _OWN_WRITERS.reset(token)
    reader = threading.Thread(target=controls, name="NativeChatControl", daemon=True)
    engine = threading.Thread(target=lambda: engine_context.run(run), name="NativeChatEngine", daemon=True)
    reader.start(); engine.start()
    observed = []
    def observe_plain_thread():
        from web.api import profiles
        observed.append({"profileName": profiles.get_active_profile_name(),
            "profileHome": str(profiles.get_active_profile_home()),
            "sessionsDir": str(config.get_session_dir())})
    auxiliary = threading.Thread(target=observe_plain_thread, name="NativeChatSourceObservation")
    auxiliary.start(); auxiliary.join(timeout=1)
    emit(context.envelope("worker_ready", pid=os.getpid(), auxiliarySources=observed))
    sequence, stop_at = 0, None
    while engine.is_alive() or not channel.queue.empty():
        if stopped.is_set():
            stop_at = stop_at or time.monotonic()
            # Repeat to close the pre-start CANCEL_FLAGS race.
            cancel_stream(context.stream_id)
            if time.monotonic() - stop_at > 2:
                return 3  # Job exit, never a false graceful engine completion.
        if channel.overflow.is_set():
            interrupt(); return 4
        try:
            event, data = channel.queue.get(timeout=.05)
        except queue.Empty:
            continue
        if event in {"approval", "clarify"}:
            data = bridge.bind(event, data)
        sequence += 1
        emit(context.envelope("native_event", sequence=sequence, event=event, data=data))
    engine.join(timeout=.1)
    emit(context.envelope("worker_finished", status="stopped" if stopped.is_set() else "finished", failed=bool(failure)))
    return 1 if failure else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        # No exception/traceback carries provider secrets into stdout.
        if _failure_sink:
            _failure_sink(exc)
        sys.exit(1)
