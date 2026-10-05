"""Thin Parent adapter for ordinary private workers and existing SSE channels.

The renderer subscribes; it never owns the worker. No second Session/Goal
engine lives here. Control identity always comes from the accepted saved Chat.
"""
from __future__ import annotations
from collections import OrderedDict
from dataclasses import dataclass, field
import json
import logging
import os
import re
from pathlib import Path
import threading
import tempfile
import time

from runtime.independent.contracts import Scope
from runtime.independent.native_chat_protocol import NativeChatContext
from runtime.independent.native_chat_host import relay_native_chat
from runtime.independent.scope import ScopeError

_lock = threading.Lock()
logger = logging.getLogger(__name__)
_active: dict[str, "_Entry"] = {}
_settled: OrderedDict[str, NativeChatContext] = OrderedDict()
_goal_handoffs: OrderedDict[str, tuple[NativeChatContext, dict]] = OrderedDict()
_terminal_pending: OrderedDict[str, NativeChatContext] = OrderedDict()


@dataclass
class _Entry:
    context: NativeChatContext
    cancelled: threading.Event = field(default_factory=threading.Event)
    handle: object | None = None
    stop_command: str | None = None
    pending: dict[str, dict] = field(default_factory=dict)
    settled: bool = False
    execution_exited: bool = False
    completion_committed: bool = False


def register_native_chat(context: NativeChatContext):
    """Root calls after saved-session preparation and before Thread.start."""
    with _lock:
        current = _active.get(context.stream_id)
        if current is not None:
            if current.context != context:
                raise ScopeError("Native stream identity is already bound")
            return current
        if len(_active) >= 256:
            raise RuntimeError("Native chat worker capacity reached")
        entry = _Entry(context)
        _active[context.stream_id] = entry
        _settled.pop(context.stream_id, None)
        return entry


def native_chat_exit_confirmed(context: NativeChatContext) -> bool:
    with _lock:
        entry = _active.get(context.stream_id)
        return entry.settled if entry is not None and entry.context == context else _settled.get(context.stream_id) == context


def abandon_unstarted_native_chat(context: NativeChatContext) -> bool:
    """Root Thread.start failure only; cannot abandon a created process."""
    with _lock:
        entry = _active.get(context.stream_id)
        if entry is None or entry.context != context or entry.handle is not None:
            return False
        entry.settled = True
        _active.pop(context.stream_id)
        _settled[context.stream_id] = context
        while len(_settled) > 1024:
            _settled.popitem(last=False)
        return True


def get_context(session_id: str, stream_id: str, *, actor: str, scope) -> NativeChatContext | None:
    selected = Scope.model_validate(scope)
    with _lock:
        entry = _active.get(stream_id)
        if entry is None:
            return None
        context = entry.context
        if context.session_id != session_id or context.profile_name != actor or context.scope != selected:
            raise ScopeError("Native chat control belongs to another accepted scope")
        return context


def is_native_session(session) -> bool:
    # Even terminal native sessions must not fall back to FIFO/ambient controls.
    return getattr(session, "space_scope", None) is not None


def is_native_stream(stream_id: str) -> bool:
    with _lock:
        return stream_id in _active or stream_id in _settled


def get_native_stream_context(stream_id: str) -> NativeChatContext | None:
    """Captured identity for trusted readers; callers must authorize access."""
    with _lock:
        entry = _active.get(stream_id)
        return entry.context if entry is not None else _settled.get(stream_id)


def get_session_native_context(session_id: str) -> NativeChatContext | None:
    """Resolve the latest accepted worker context for a session-owned reset."""
    with _lock:
        active = [entry.context for entry in _active.values() if entry.context.session_id == session_id]
        if len(active) > 1:
            raise ScopeError("Native session has conflicting active worker bindings")
        if active:
            return active[0]
        return next((context for context in reversed(_settled.values()) if context.session_id == session_id), None)


def pending_control_snapshot(session_id: str, stream_id: str, *, actor: str, scope) -> dict | None:
    """Actual registry recovery only; a missing/terminal worker has no requests."""
    context=get_context(session_id,stream_id,actor=actor,scope=scope)
    if context is None: return None
    with _lock:
        entry=_active.get(stream_id)
        if entry is None or entry.context!=context: return None
        return {"schemaVersion":1,"scope":context.scope.model_dump(mode="json",by_alias=True),
            "sessionId":context.session_id,"streamId":context.stream_id,
            "writerGeneration":context.writer_generation,"processExited":entry.settled,
            "status":"stopping" if entry.stop_command else "running",
            "pendingControls":[json.loads(json.dumps(item)) for item in entry.pending.values()]}


def _pending_control_view(context,kind,data):
    request_id=data.get("requestId")
    if not isinstance(request_id,str) or not 1<=len(request_id)<=128:
        raise ValueError("Invalid actual pending control identity")
    # Exact typed fields, bounded display values; never generic metadata/config.
    allowed={"clarify":("question","choices_offered","requested_at","timeout_seconds","expires_at"),
        "approval":("command","description","pattern_key","pattern_keys","requested_at","timeout_seconds","expires_at")}[kind]
    fields={}
    for key in allowed:
        value=data.get(key)
        if isinstance(value,str): fields[key]=value[:8192]
        elif isinstance(value,list) and all(isinstance(item,str) for item in value): fields[key]=[item[:1024] for item in value[:32]]
        elif type(value) in {int,float}: fields[key]=value
    return {"schemaVersion":1,"type":kind,"requestId":request_id,
        "scope":context.scope.model_dump(mode="json",by_alias=True),
        "sessionId":context.session_id,"streamId":context.stream_id,
        "writerGeneration":context.writer_generation,"data":fields}


def _cleanup_saved_pending(context, *, materialize_pending=True, partial_text="", reasoning_text="",
                          completed_text=None, completed_metadata=None):
    """Own captured path, full transcript and held writer; no ambient save."""
    from runtime.independent.native_chat_protocol import verify_native_context
    # Cleanup never grants model/tool rights; a changed policy cannot strand
    # the actual user's accepted message after the owning process has exited.
    verify_native_context(context,check_selection_policy=False)
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    if not path.is_file() or path.is_symlink() or path.resolve().parent != Path(context.sessions_dir).resolve():
        raise ScopeError("Native chat storage changed")
    before = path.stat()
    raw = json.loads(path.read_text("utf-8"))
    if (raw.get("session_id") != context.session_id or (raw.get("profile") or "default") != context.profile_name
        or raw.get("space_scope") != context.scope.model_dump(mode="json", by_alias=True)):
        raise ScopeError("Native chat saved owner changed")
    if raw.get("active_stream_id") != context.stream_id:
        return
    messages = raw.get("messages")
    if not isinstance(messages, list):
        raise ScopeError("Native chat full transcript cannot be verified")
    pending = raw.get("pending_user_message")
    if materialize_pending and isinstance(pending, str) and pending:
        last = messages[-1] if messages else None
        if not isinstance(last, dict) or last.get("role") != "user" or " ".join(str(last.get("content") or "").split()) != " ".join(pending.split()):
            message = {"role":"user", "content":pending}
            if isinstance(raw.get("pending_started_at"), (int,float)):
                message["timestamp"] = int(raw["pending_started_at"])
            if raw.get("pending_attachments"):
                message["attachments"] = raw["pending_attachments"]
            messages.append(message)
    if isinstance(completed_text,str) and completed_text:
        last=messages[-1] if messages else None
        if not isinstance(last,dict) or last.get("role")!="assistant" or last.get("content")!=completed_text:
            message={"role":"assistant","content":completed_text,"timestamp":int(time.time())}
            if isinstance(completed_metadata,dict):
                message["autoRouting"]=completed_metadata
                evidence=completed_metadata.get("provider_evidence")
                if isinstance(evidence,dict):
                    message["provider_evidence"]=evidence
                    message["execution_evidence"]=evidence
                    message["turn_id"]=context.stream_id
                    message["stream_id"]=context.stream_id
            messages.append(message)
    elif partial_text:
        # Only actual forwarded SDK deltas from this exact stream are eligible.
        last=messages[-1] if messages else None
        if not isinstance(last,dict) or last.get("role")!="assistant" or last.get("content")!=partial_text:
            message={"role":"assistant","content":partial_text,"_incomplete":True}
            if reasoning_text: message["reasoning"]=reasoning_text
            messages.append(message)
    raw.update(active_stream_id=None, pending_user_message=None, pending_attachments=[], pending_started_at=None)
    fd, temporary = tempfile.mkstemp(prefix=".native-chat-", suffix=".tmp", dir=context.sessions_dir)
    try:
        with os.fdopen(fd,"w",encoding="utf-8") as output:
            json.dump(raw,output,ensure_ascii=False,indent=2); output.flush(); os.fsync(output.fileno())
        current = path.stat()
        if path.is_symlink() or (before.st_ino,before.st_size,before.st_mtime_ns) != (current.st_ino,current.st_size,current.st_mtime_ns):
            raise ScopeError("Native chat changed during pending cleanup")
        os.replace(temporary,path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class _LocalShortChatHandle:
    def __init__(self,entry):self.entry=entry
    @property
    def is_alive(self):return not self.entry.execution_exited
    def send_control(self,command,**_):
        if command in {"cancel","pause"}:self.entry.cancelled.set()


def run_native_local_short_chat(context,args,kwargs,*,host,decision):
    """Run a proof-qualified local answer under the captured native writer lease."""
    from web.api import config
    from runtime.independent.native_chat_protocol import verify_native_context
    import uuid
    entry=register_native_chat(context)
    session_id=context.session_id
    with config.STREAMS_LOCK:
        channel=config.STREAMS.get(context.stream_id)
        if channel is None:raise RuntimeError("Accepted native local-chat stream channel is missing")
        channel._thread=threading.current_thread()
        config.CANCEL_FLAGS[context.stream_id]=entry.cancelled
        config.STREAM_PARTIAL_TEXT[context.stream_id]=""
        config.STREAM_REASONING_TEXT[context.stream_id]=""
        config.STREAM_LIVE_TOOL_CALLS[context.stream_id]=[]
    entry.handle=_LocalShortChatHandle(entry)
    config.register_active_run(context.stream_id,session_id=session_id,
        scope=context.scope.model_dump(mode="json",by_alias=True),profile=context.profile_name,
        workspace=context.workspace,started_at=time.time(),phase="running",
        model=decision["artifactId"],provider="local-ai")
    def put(event,data):
        payload={**data,"session_id":session_id,"nativeChat":True,
            "writerGeneration":context.writer_generation}
        channel.put_nowait((event,payload))
        if event=="token":
            with config.STREAMS_LOCK:
                config.STREAM_PARTIAL_TEXT[context.stream_id]=(config.STREAM_PARTIAL_TEXT.get(context.stream_id,"")+str(data.get("text") or ""))[-1_048_576:]
    try:
        verify_native_context(context)
        if entry.cancelled.is_set():raise RuntimeError("local_short_chat_cancelled")
        prompt=args[1] if len(args)>1 else ""
        result=host.execute_native_short_chat(context,prompt,cancel=entry.cancelled)
        verify_native_context(context)
        with _lock:
            if entry.cancelled.is_set():raise RuntimeError("local_short_chat_cancelled")
            entry.completion_committed=True
        metadata={"mode":"auto","route":"local_chat","taskClass":"simple",
            "reasonCode":"auto_simple_task_local_capability_verified",
            "decisionId":decision["decisionId"],"profileRevision":result["profileRevision"],
            "artifactId":result["artifactId"],"artifactRevision":result["artifactRevision"],
            "adapterRef":result["adapterRef"],"qualityEvidenceRef":result["qualityEvidenceRef"],
            "memoryEvidenceRef":result["memoryEvidenceRef"],"limits":result["limits"],
            "provider_evidence":{"provider_id":"local-ai","model_id":result["artifactId"],
                "successful_chat":True}}
        _cleanup_saved_pending(context,completed_text=result["text"],completed_metadata=metadata)
        put("token",{"text":result["text"]})
        put("metering",{"provider":"local-ai","model":result["artifactId"],
            "route":"local_chat","usage":None,"limits":result["limits"]})
        put("done",{"session_id":session_id,"stream_id":context.stream_id,
            "turn_id":context.stream_id,"route":"local_chat","model":result["artifactId"],
            "decisionId":decision["decisionId"],"provider_evidence":metadata["provider_evidence"]})
        return 0
    except Exception as exc:
        if not entry.cancelled.is_set():
            code=str(exc)
            if not code or len(code)>128 or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for c in code):
                code="local_short_chat_failed"
            put("error",{"error":"Local AI konnte diese kurze Antwort nicht erstellen.","error_code":code,"retryable":True})
        return 1
    finally:
        # Both failures and cancellation must clear the accepted pending turn.
        # A successful turn already atomically materialized its answer above.
        cleanup_confirmed=False
        try:
            _cleanup_saved_pending(context,materialize_pending=True)
            saved=json.loads((Path(context.sessions_dir)/(context.session_id+".json")).read_text("utf-8"))
            cleanup_confirmed=(saved.get("active_stream_id")!=context.stream_id
                and not saved.get("pending_user_message"))
        except Exception:
            logger.exception("Local native chat cleanup could not be confirmed")
        if entry.cancelled.is_set():
            put("cancel",{"message":"Local chat cancelled"})
        entry.execution_exited=True
        if cleanup_confirmed:
            entry.settled=True
            with _lock:
                if _active.get(context.stream_id) is entry:_active.pop(context.stream_id,None)
                _settled[context.stream_id]=context
                _terminal_pending[context.stream_id]=context
                while len(_settled)>1024:_settled.popitem(last=False)
                while len(_terminal_pending)>1024:_terminal_pending.popitem(last=False)
            _invalidate_owned_cache(context)
            with config.STREAMS_LOCK:
                for values in (config.STREAMS,config.CANCEL_FLAGS,config.STREAM_PARTIAL_TEXT,
                    config.STREAM_REASONING_TEXT,config.STREAM_LIVE_TOOL_CALLS,
                    config.STREAM_GOAL_RELATED,config.STREAM_GOAL_CLAIMS):
                    if values is not config.STREAMS:values.pop(context.stream_id,None)
            config.retain_completed_chat_stream(context.stream_id)
            config.unregister_active_run(context.stream_id)
        else:
            config.update_active_run(context.stream_id,phase="cleanup_required")
            put("error",{"error":"Native chat state cleanup could not be confirmed.",
                "error_code":"native_chat_cleanup_unconfirmed","retryable":True})


def fail_unstarted_native_chat(context, *, materialize_pending=True, goal_claim_turn=None, goal_claim_space_slug=None, error_code=None) -> bool:
    """Trusted prelaunch exception only, never a substitute for process exit."""
    public_code = (error_code if isinstance(error_code, str) and len(error_code) <= 128
        and re.fullmatch(r"(?:native|nova|auto)_[a-z][a-z0-9_]*", error_code, flags=re.ASCII)
        else "native_chat_start_failed")
    if not abandon_unstarted_native_chat(context):
        return False
    from web.api import config
    try:
        _cleanup_saved_pending(context,materialize_pending=materialize_pending)
        if goal_claim_turn is not None:
            from web.api.goals import finish_goal_continuation
            finish_goal_continuation(context.session_id,claim_turn=goal_claim_turn,
                profile_home=context.profile_home,space_slug=goal_claim_space_slug)
    finally:
        _invalidate_owned_cache(context)
        with config.STREAMS_LOCK:
            channel=config.STREAMS.get(context.stream_id)
        if channel is not None:
            channel.put_nowait(("error", {"error":public_code,"error_code":public_code,"session_id":context.session_id,"processExited":True}))
            channel.put_nowait(("stream_end", {"session_id":context.session_id,"stream_id":context.stream_id,
                "processExited":True,"writerGeneration":context.writer_generation}))
            config.retain_completed_chat_stream(context.stream_id)
        with config.STREAMS_LOCK:
            for values in (config.STREAMS,config.CANCEL_FLAGS,config.STREAM_PARTIAL_TEXT,
                config.STREAM_REASONING_TEXT,config.STREAM_LIVE_TOOL_CALLS,config.STREAM_GOAL_RELATED,config.STREAM_GOAL_CLAIMS):
                values.pop(context.stream_id,None)
        config.unregister_active_run(context.stream_id)
    return True


def publish_settled_goal_continuation(context) -> bool:
    """Root calls after actual exit, AUTO receipt cleanup and writer release.

    Reuse the existing durable GoalManager and its exact-prompt/owner check.
    This only publishes a confirmed handoff; it starts no other engine.
    """
    from web.api import config
    from runtime.independent.store import IndependentStore
    if not native_chat_exit_confirmed(context): return False
    store=IndependentStore(context.profile_home,context.scope.backend_profile_id,initialize=False)
    try:
        if any(lease["resourceKey"]=="session_writer:"+context.session_id for lease in store.list_leases()):
            return False  # Including a newer accepted turn's writer.
    finally: store.close()
    with _lock:
        handoff=_goal_handoffs.get(context.stream_id)
        if handoff is None or handoff[0]!=context: return False
        _goal_handoffs.pop(context.stream_id)
    data=handoff[1]
    prompt=data.get("continuation_prompt") or data.get("text")
    if not isinstance(prompt,str) or not prompt or len(prompt)>16384: return False
    from web.api.goals import queue_goal_continuation
    if not queue_goal_continuation(context.session_id,prompt,profile_home=context.profile_home,
        space_slug=data.get("_capturedGoalSpaceSlug")):
        return False
    channel=config.get_chat_stream_channel(context.stream_id)
    if channel is None: return False
    public={key:value for key,value in data.items() if key!="_capturedGoalSpaceSlug"}
    channel.put_nowait(("goal_continue", {**public,"processExited":True,
        "writerGeneration":context.writer_generation,"nativeChat":True}))
    return True


def finalize_native_chat(context) -> bool:
    """Trusted Root cleanup hook: receipts and writer settled before terminal.

    Publish the actual validated goal handoff before the definitive terminal so
    the existing SSE reader cannot disconnect before receiving continuation.
    """
    from web.api import config
    from runtime.independent.store import IndependentStore
    if not native_chat_exit_confirmed(context): return False
    store=IndependentStore(context.profile_home,context.scope.backend_profile_id,initialize=False)
    try:
        if any(lease["leaseId"]==context.writer_lease_id for lease in store.list_leases()): return False
    finally: store.close()
    with _lock:
        if _terminal_pending.get(context.stream_id)!=context: return False
        _terminal_pending.pop(context.stream_id)
    channel=config.get_chat_stream_channel(context.stream_id)
    if channel is None: return False
    try:
        publish_settled_goal_continuation(context)
    except Exception:
        channel.put_nowait(("goal", {"session_id":context.session_id,"state":"error",
            "error_code":"goal_continuation_unverified","processExited":True}))
    finally:
        channel.put_nowait(("stream_end", {"session_id":context.session_id,"stream_id":context.stream_id,
            "processExited":True,"writerGeneration":context.writer_generation,"nativeChat":True}))
    return True


def control_native_chat(session_id: str, stream_id: str, *, actor: str, scope,
                        command: str, request_id=None, choice=None, response=None) -> bool:
    context = get_context(session_id, stream_id, actor=actor, scope=scope)
    if context is None:
        return False
    if command not in {"cancel", "pause", "approval", "clarify"}:
        raise ValueError("Unknown native chat control")
    with _lock:
        entry = _active.get(stream_id)
        if entry is None or entry.settled or entry.context != context:
            return False
        handle = entry.handle
        if command in {"cancel", "pause"} and entry.completion_committed:
            return False
        if command in {"cancel", "pause"}:
            entry.stop_command = entry.stop_command or command
            entry.cancelled.set()
        else:
            pending=entry.pending.get(request_id) if isinstance(request_id,str) else None
            if pending is None or pending["type"] != command or handle is None:
                return False
            if command == "approval" and choice not in {"once", "session", "always", "deny"}:
                return False
            if command == "clarify" and (not isinstance(response, str) or len(response) > 16384):
                return False
            # One response can be forwarded once; ACK reports worker acceptance.
            entry.pending.pop(request_id)
    # No registry/profile/database lock survives the pipe write.
    if handle is not None and handle.is_alive:
        handle.send_control(command, request_id=request_id, choice=choice, response=response)
    return command in {"cancel", "pause"} or handle is not None


def _invalidate_owned_cache(context):
    from web.api import models, config
    with models.LOCK:
        cached = models.SESSIONS.get(context.session_id)
        if cached is not None and (cached.profile or "default") == context.profile_name and cached.space_scope == context.scope.model_dump(mode="json", by_alias=True):
            models.SESSIONS.pop(context.session_id, None)
    with config.SESSION_AGENT_CACHE_LOCK:
        agent = config.SESSION_AGENT_CACHE.get(context.session_id)
        binding = getattr(agent, "_child_parent_context", None)
        if binding is not None and binding.scope == context.scope and binding.profile_name == context.profile_name:
            config.SESSION_AGENT_CACHE.pop(context.session_id, None)


def load_settled_native_session(context):
    """Return actual captured-path state, never a mutable active-profile load."""
    if not native_chat_exit_confirmed(context):
        raise RuntimeError("Native chat process exit is not confirmed")
    from web.api.models import Session
    path = Path(context.sessions_dir) / (context.session_id + ".json")
    if not path.is_file() or path.is_symlink() or path.resolve().parent != Path(context.sessions_dir).resolve():
        raise ScopeError("Native chat storage changed")
    raw = json.loads(path.read_text("utf-8"))
    if (raw.get("session_id") != context.session_id or (raw.get("profile") or "default") != context.profile_name
        or raw.get("space_scope") != context.scope.model_dump(mode="json", by_alias=True)):
        raise ScopeError("Native chat saved owner changed")
    return Session(**raw)


def run_native_chat(context: NativeChatContext, args, kwargs, *, python_executable=None, rpc_handler=None, defer_terminal=False, before_stop=None, on_goal_result=None):
    from web.api import config
    entry = register_native_chat(context)
    with config.STREAMS_LOCK:
        channel = config.STREAMS.get(context.stream_id)
        if channel is None:
            abandon_unstarted_native_chat(context)
            raise RuntimeError("Accepted native chat stream channel is missing")
        channel._thread = threading.current_thread()
        config.CANCEL_FLAGS[context.stream_id] = entry.cancelled
        config.STREAM_PARTIAL_TEXT[context.stream_id] = ""
        config.STREAM_REASONING_TEXT[context.stream_id] = ""
        config.STREAM_LIVE_TOOL_CALLS[context.stream_id] = []
    config.register_active_run(context.stream_id, session_id=context.session_id,
        scope=context.scope.model_dump(mode="json", by_alias=True),
        profile=context.profile_name, workspace=context.workspace,
        started_at=time.time(), phase="starting", model=args[2], provider=kwargs.get("model_provider"))
    saw_terminal = [False]
    def put(event, data):
        if event=="goal_continue" and isinstance(data,dict):
            if data.get("session_id")!=context.session_id:
                raise ScopeError("Native goal handoff belongs to another session")
            with _lock:
                _goal_handoffs[context.stream_id]=(context,{**data,
                    "_capturedGoalSpaceSlug":kwargs.get("goal_claim_space_slug")})
                while len(_goal_handoffs)>256: _goal_handoffs.popitem(last=False)
            return
        if event in {"done","stream_end","cancel","error","apperror"} and isinstance(data,dict):
            data={**data,"processExited":entry.settled and not defer_terminal,"writerGeneration":context.writer_generation,"nativeChat":True}
        if event == "token" and isinstance(data, dict):
            text = str(data.get("text") or "")
            with config.STREAMS_LOCK:
                config.STREAM_PARTIAL_TEXT[context.stream_id] = (config.STREAM_PARTIAL_TEXT.get(context.stream_id, "") + text)[-1_048_576:]
        elif event == "reasoning" and isinstance(data, dict):
            with config.STREAMS_LOCK:
                config.STREAM_REASONING_TEXT[context.stream_id] = (config.STREAM_REASONING_TEXT.get(context.stream_id, "") + str(data.get("text") or ""))[-1_048_576:]
        elif event in {"tool_start", "tool_complete"} and isinstance(data, dict):
            with config.STREAMS_LOCK:
                tools = config.STREAM_LIVE_TOOL_CALLS.setdefault(context.stream_id, [])
                tools.append({"event": event, **data})
                del tools[:-128]
        elif event in {"approval", "clarify"} and isinstance(data, dict):
            request_id = data.get("requestId")
            if not isinstance(request_id, str):
                raise RuntimeError("Native pending event has no actual request ID")
            with _lock:
                if len(entry.pending) >= 32:
                    raise RuntimeError("Native pending controls exceed capacity")
                entry.pending[request_id] = _pending_control_view(context,event,data)
        elif event == "worker_ready":
            config.update_active_run(context.stream_id, phase="running", pid=data.get("pid"))
        elif event == "control_ack" and data.get("status") == "stopping":
            config.update_active_run(context.stream_id, phase="stopping")
        elif event == "worker_fault":
            channel.put_nowait(("error", {"error":"native_chat_worker_failed", "stage":data.get("stage"),
                "errorType":data.get("errorType"), "errorCode":data.get("errorCode"), "session_id":context.session_id,
                "processExited":entry.settled and not defer_terminal,"writerGeneration":context.writer_generation,"nativeChat":True}))
            saw_terminal[0] = True
        if event in {"stream_end", "cancel", "error", "apperror"}:
            saw_terminal[0] = True
        # The captured existing channel survives detach and stale registry removal.
        channel.put_nowait((event, data))
    def started(handle):
        with _lock:
            entry.handle = handle
            command = entry.stop_command
        if command:
            handle.send_control(command)
    def exited(handle):
        if handle.is_alive:
            raise RuntimeError("Native worker exit is not confirmed")
        with _lock:
            entry.settled = True
            entry.pending.clear()
        with config.STREAMS_LOCK:
            partial=config.STREAM_PARTIAL_TEXT.get(context.stream_id,"")
            reasoning=config.STREAM_REASONING_TEXT.get(context.stream_id,"")
        _cleanup_saved_pending(context,materialize_pending=kwargs.get("goal_claim_turn") is None and "native_goal_retry" not in kwargs,
            partial_text=partial,reasoning_text=reasoning)
        if kwargs.get("goal_claim_turn") is not None:
            from web.api.goals import finish_goal_continuation
            finish_goal_continuation(context.session_id,claim_turn=kwargs["goal_claim_turn"],
                profile_home=context.profile_home,space_slug=kwargs.get("goal_claim_space_slug"))
        from web.api.subagent_history import reconcile_stale
        reconcile_stale(Path(context.profile_home), generation=context.writer_generation,
                        confirmed_worker_turns=(context.stream_id,))
        _invalidate_owned_cache(context)
    def start_failed(diagnostic):
        if diagnostic.get("exitConfirmed") is True:
            with _lock:
                entry.settled = True
            _cleanup_saved_pending(context,materialize_pending=kwargs.get("goal_claim_turn") is None and "native_goal_retry" not in kwargs)
            put("error", {"error":"native_chat_start_failed", "session_id":context.session_id,
                "diagnostic":diagnostic})
    try:
        return relay_native_chat(context, args, kwargs, put, cancelled=entry.cancelled,
            on_started=started, on_exit=exited, on_start_failed=start_failed, rpc_handler=rpc_handler,
            python_executable=python_executable, before_stop=before_stop, on_goal_result=on_goal_result)
    except Exception as exc:
        # Actual worker/transport/policy failure, never provider exception text.
        data = {"error":"native_chat_worker_failed","session_id":context.session_id,
            "processExited":entry.settled}
        diagnostic = getattr(exc, "diagnostic", None)
        if isinstance(diagnostic, dict):
            data["diagnostic"] = diagnostic
        put("error", data)
        return 1
    finally:
        # Never claim completion, unblock writers, or discard ownership before
        # the actual OS process and its Job have exited.
        if entry.settled:
            if defer_terminal:
                with _lock:
                    _terminal_pending[context.stream_id]=context
                    while len(_terminal_pending)>1024: _terminal_pending.popitem(last=False)
            else:
                channel.put_nowait(("stream_end", {"session_id":context.session_id,
                    "stream_id":context.stream_id, "processExited":True,"writerGeneration":context.writer_generation,"nativeChat":True}))
            config.retain_completed_chat_stream(context.stream_id)
            with config.STREAMS_LOCK:
                config.STREAMS.pop(context.stream_id, None)
                config.CANCEL_FLAGS.pop(context.stream_id, None)
                config.STREAM_PARTIAL_TEXT.pop(context.stream_id, None)
                config.STREAM_REASONING_TEXT.pop(context.stream_id, None)
                config.STREAM_LIVE_TOOL_CALLS.pop(context.stream_id, None)
                config.STREAM_GOAL_RELATED.pop(context.stream_id, None)
                config.STREAM_GOAL_CLAIMS.pop(context.stream_id, None)
            config.unregister_active_run(context.stream_id)
            with _lock:
                _active.pop(context.stream_id, None)
                _settled[context.stream_id] = context
                while len(_settled) > 1024:
                    _settled.popitem(last=False)


def run_native_goal_judge_retry(context, args, kwargs, *, snapshot, on_result, sdk_broker,
                                python_executable=None, defer_terminal=True):
    """Private judge-only Host; Root performs Goal CAS before releasing its writer."""
    from runtime.independent.native_goal_retry import NativeGoalRetryRequest, read_retry_goal, validate_goal_retry_result
    from runtime.independent.native_chat_protocol import verify_native_context
    request = NativeGoalRetryRequest.model_validate(snapshot)
    if not callable(on_result) or sdk_broker.context != context or kwargs.get("goal_claim_turn") is not None:
        raise ScopeError("Native goal retry requires its actual captured Parent owner")
    verify_native_context(context)
    read_retry_goal(context, request)
    options = dict(kwargs)
    wire = request.model_dump(mode="json", by_alias=True)
    if "native_goal_retry" in options and NativeGoalRetryRequest.model_validate(options["native_goal_retry"]) != request:
        raise ScopeError("Native goal retry request changed")
    options["native_goal_retry"] = wire

    def accept_result(payload):
        # Host invokes this only after actual OS/Job exit; the writer is still held.
        verify_native_context(context)
        result = validate_goal_retry_result(context, wire, payload, sdk_broker=sdk_broker)
        decision = on_result(result)
        if isinstance(decision, dict):
            from web.api import config
            channel = config.get_chat_stream_channel(context.stream_id)
            if channel is not None:
                channel.put_nowait(("goal", decision))
            prompt = decision.get("continuation_prompt")
            if decision.get("should_continue") is True and isinstance(prompt, str) and prompt:
                if len(prompt) > 16384:
                    raise ScopeError("Native goal continuation exceeds its transport bound")
                with _lock:
                    _goal_handoffs[context.stream_id] = (context, {**decision,
                        "_capturedGoalSpaceSlug": Path(context.space_root).name})

    return run_native_chat(context, args, options, python_executable=python_executable,
        rpc_handler=sdk_broker, before_stop=sdk_broker.request_stop,
        defer_terminal=defer_terminal, on_goal_result=accept_result)
