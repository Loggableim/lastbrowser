"""Capture confirmed Space preferences before a normal chat worker starts.

This is an additive prompt context, never a source of tool authorization.
Independent work sessions have one backend writer until their run is terminal.
"""
from __future__ import annotations

import hmac
import os
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from .contracts import Scope, TERMINAL_STATES
from .onboarding import profile_prompt
from .scope import ScopeError, same_path
from .store import ResourceBusy

_OWN_WRITERS: ContextVar[tuple[str, ...]] = ContextVar("native_chat_writer_leases", default=())


@dataclass(frozen=True)
class CapturedChatProfile:
    scope: Scope
    workspace: str
    snapshot_id: str | None
    snapshot_revision: int | None
    prompt: str


@dataclass(frozen=True)
class NativeChatWriter:
    store: Any
    lease_id: str
    generation: str

    def release(self) -> None:
        self.store.release_lease(self.lease_id, owner_generation=self.generation)


def reserve_chat_writer(session: Any, *, actor: str, owner_ref: str,
                        generation: str | None = None, profile_hub=None, deleting: bool = False) -> NativeChatWriter | None:
    """Reserve the transcript before an ordinary turn or history mutation.

    The unique persisted resource is shared with independent runners, closing
    the check-to-write race without keeping a SQL transaction during inference.
    """
    assert_session_writer_available(session, actor=actor, profile_hub=profile_hub, deleting=deleting)
    marker = getattr(session, "independent", None)
    saved = getattr(session, "space_scope", None) or (marker.get("scope") if isinstance(marker, dict) else None)
    if saved is None:
        return None
    if profile_hub is None:
        from web.api.independent import hub
        profile_hub = hub()
    if generation is None:
        from web.api.independent import _GENERATION
        generation = _GENERATION
    scope = Scope.model_validate(saved)
    store, resolver = profile_hub.by_scope(scope, actor)
    resolver.resolve(scope, authenticated_profile_name=actor)
    lease = store.acquire_chat_writer(scope, session.session_id, owner_ref, generation,
                                      owner_identity=_writer_owner_identity())
    return NativeChatWriter(store, lease["leaseId"], generation)


@contextmanager
def native_chat_writer(session: Any, *, actor: str, owner_ref: str,
                       generation: str | None = None, profile_hub=None, deleting: bool = False):
    writer = reserve_chat_writer(session, actor=actor, owner_ref=owner_ref,
                                 generation=generation, profile_hub=profile_hub, deleting=deleting)
    token = _OWN_WRITERS.set((*_OWN_WRITERS.get(), writer.lease_id)) if writer else None
    try:
        yield writer
    finally:
        if token is not None:
            _OWN_WRITERS.reset(token)
        if writer is not None:
            writer.release()


def require_native_scope_header(handler: Any, raw_scope: Any) -> None:
    if raw_scope is None:
        return
    from web.api.independent import _BRIDGE_TOKEN
    supplied = handler.headers.get("X-Lastbrowser-Bridge-Token", "")
    if not _BRIDGE_TOKEN or not hmac.compare_digest(_BRIDGE_TOKEN, supplied):
        raise ScopeError("Native chat scope must be selected by Lastbrowser Main")


def _current_writer_generation() -> str:
    from web.api.independent import _GENERATION
    return _GENERATION


def _writer_owner_identity() -> dict[str, Any]:
    """This backend's OS identity (PID plus creation time), recorded on every chat-writer lease."""
    from web.api.local_ai_setup import process_identity
    try:
        state, creation = process_identity(os.getpid())
    except OSError:
        return {}  # unprovable identity: the lease is then never presumed dead
    if state != "alive" or creation is None:
        return {}
    return {"hostPid": os.getpid(), "hostCreationIdentity": creation}


def _writer_owner_is_gone(lease: dict[str, Any], generation: str) -> bool:
    """True only when the process that wrote a chat-writer lease cannot write anymore.

    Same backend process: only a retained native worker that already exited
    counts. Other process: only a recorded PID that is dead or was reused.
    A lease with no recorded identity is never presumed dead.
    """
    if lease.get("ownerGeneration") == generation:
        from web.api.native_chats import native_writer_owner_gone
        return native_writer_owner_gone(lease)
    pid, creation = lease.get("hostPid"), lease.get("hostCreationIdentity")
    if type(pid) is not int or pid <= 0 or not isinstance(creation, str):
        return False
    from web.api.local_ai_setup import process_identity
    try:
        state, actual = process_identity(pid)
    except OSError:
        return False
    return state == "dead" or (state == "alive" and actual is not None and actual != creation)


def assert_session_writer_available(session: Any, *, actor: str, profile_hub=None, deleting: bool = False) -> None:
    """Also used by clear/delete/compress; a visible chat is not the runner.

    Only owners that can still write block here. A writer lease whose backend
    process or native worker is gone is retired. A run marker whose run record
    is missing is ignored only for ``deleting``; turns still fail closed.
    """
    marker = getattr(session, "independent", None)
    if marker is not None and (not isinstance(marker, dict) or not marker.get("scope")):
        raise ScopeError("Independent chat writer metadata cannot be verified")
    saved = getattr(session, "space_scope", None) or (marker.get("scope") if isinstance(marker, dict) else None)
    if saved is None:
        return
    if profile_hub is None:
        from web.api.independent import hub
        profile_hub = hub()
    scope = Scope.model_validate(saved)
    if isinstance(marker, dict) and scope != Scope.model_validate(marker["scope"]):
        raise ScopeError("Independent chat writer belongs to another native scope")
    store, resolver = profile_hub.by_scope(scope, actor)
    resolver.resolve(scope, authenticated_profile_name=actor)
    if (getattr(session, "profile", None) or "default") != actor:
        raise ScopeError("Chat profile does not match its authenticated profile")
    generation = _current_writer_generation()
    session_id = getattr(session, "session_id", None)
    if session_id:
        for lease in store.list_leases(active_only=True):
            if lease["resourceKey"] != "session_writer:" + session_id or lease["leaseId"] in _OWN_WRITERS.get():
                continue
            if _writer_owner_is_gone(lease, generation) and store.expire_stale_session_writer(
                    lease["leaseId"], owner_generation=lease["ownerGeneration"]):
                continue
            raise ResourceBusy("This chat is still being written by an active turn. Stop that turn before changing or deleting the chat.")
    if isinstance(marker, dict):
        run_id = marker.get("runId")
        if not run_id:
            raise ScopeError("Independent chat writer cannot be verified")
        run = store.get_run(run_id)
        if run is None:
            if deleting:
                return  # the marker outlived its run record; no runner can still write
            raise ScopeError("Independent chat writer cannot be verified")
        if run.scope != scope:
            raise ScopeError("Independent chat writer cannot be verified")
        if run.state not in TERMINAL_STATES:
            context = store.get_run_context(run.run_id)
            if context is None or context.runner_generation != generation:
                return  # its runner belonged to an earlier backend process
            raise ResourceBusy("This work chat is owned by its independent run; pause or stop that run first")


def capture_chat_profile(*, session: Any = None, raw_scope: Any = None,
                         actor: str, workspace: str, profile_hub=None) -> CapturedChatProfile | None:
    saved = getattr(session, "space_scope", None) if session is not None else None
    independent = getattr(session, "independent", None) if session is not None else None
    if independent is not None and (not isinstance(independent, dict) or not independent.get("scope")):
        raise ScopeError("Independent chat writer metadata cannot be verified")
    if saved is None and isinstance(independent, dict):
        saved = independent.get("scope")
    if raw_scope is None and saved is None:
        return None
    if profile_hub is None:
        from web.api.independent import hub
        profile_hub = hub()
    scope = Scope.model_validate(raw_scope if raw_scope is not None else saved)
    if saved is not None and scope != Scope.model_validate(saved):
        raise ScopeError("An existing chat cannot switch its native Space scope")
    store, resolver = profile_hub.by_scope(scope, actor)
    resolved = resolver.resolve(scope, authenticated_profile_name=actor)
    permitted_workspace = (resolved.binding.workspace_locator, str(resolved.space_root))
    if not workspace:
        workspace = resolved.binding.workspace_locator or str(resolved.space_root)
    if not any(path and same_path(path, workspace) for path in permitted_workspace):
        raise ScopeError("Chat workspace does not match its saved Space binding")
    if session is not None and (getattr(session, "profile", None) or "default") != actor:
        raise ScopeError("Chat profile does not match its authenticated profile")
    if session is not None:
        assert_session_writer_available(session, actor=actor, profile_hub=profile_hub)
    profile = store.get_confirmed_profile(scope)
    captured = CapturedChatProfile(scope, workspace, profile.profile_id if profile else None,
                                   profile.revision if profile else None, profile_prompt(profile))
    if session is not None:
        session.space_scope = scope.model_dump(mode="json", by_alias=True)
        session.space_profile_snapshot = {"profileId": captured.snapshot_id, "revision": captured.snapshot_revision}
    return captured


def mark_legacy_writer(session: Any) -> None:
    """Call only after capture_chat_profile allowed a concrete new chat turn."""
    marker = getattr(session, "independent", None)
    if isinstance(marker, dict):
        session.independent = {**marker, "writerOwner": "legacy_chat"}
