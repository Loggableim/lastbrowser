"""Actual fixed SDK builder, real Parent receipts/pool and scoped capture."""
import json
import re
from pathlib import Path
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor

import pytest
from pydantic import ValidationError
from runtime.chat_modes import ChatExecutionPolicy

from runtime.independent.capabilities import CapabilityService, evidence_digest
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import new_id
from runtime.independent.manager import RunManager, ComputeAdmission
from runtime.independent.model_selection import AutoSelectionService
from runtime.independent.model_policy_session import validate_native_session
from runtime.independent.native_chat_protocol import NativeChatContext, capture_native_chat_context
from runtime.independent.native_sdk_broker import capture_fixed_provider, NativeSdkSessionBroker
from runtime.independent.provider_admission import ProviderAdmission
from runtime.independent.runner import provider_configuration_digest
from runtime.independent.scope import ScopeResolver
from web.api import config, native_chats
from test_native_chat_process import ControlledServer, fixture_context, turn, drain
from test_independent_profile_isolation import isolated_python


def captured_fixed(context,store,monkeypatch):
    home=Path(context.profile_home)
    resolver=ScopeResolver(store,profiles_provider=lambda:[{"name":context.profile_name,"path":str(home)}])
    manager=RunManager(store,resolver,generation=context.writer_generation)
    manager.capabilities=CapabilityService(manager)
    manager.connection_validator=manager.capabilities.validate
    resolved=resolver.resolve(context.scope,authenticated_profile_name=context.profile_name)
    def catalog(actual_manager, actual_scope, **kwargs):
        # Explicit controlled catalog metadata; SDK/provider requests remain real.
        actual_home = actual_manager.resolver.resolve(actual_scope,
            authenticated_profile_name=actual_manager.store.get_profile_ref(actual_scope.backend_profile_id).name).profile_home
        return {"providerConfigurationDigest":provider_configuration_digest(actual_home),
            "groups":[{"provider_id":"custom","configured":True,"models":[{
                "id":"controlled-model","contextLength":128000,"supportsIndependent":True,"supportsTools":True}]}],
            "providers":[{"id":"custom","has_key":True}],
            "capabilityInventory":{"plugins":[],"mcp":[],"evidenceDigest":evidence_digest(actual_home)}}
    monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog",catalog)
    admission=ProviderAdmission(store,base_home=home.parent.parent,
        existing_store_paths=lambda:((store.backend_profile_id,store.db_path),))
    service=AutoSelectionService(manager,admission,session_validator=lambda scope,sid:
        validate_native_session(resolved,sid,actor=context.profile_name))
    store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
    ConnectionRepository(store).bind(context.scope,{"capabilityId":"assistant.conversation",
        "connectionId":"provider:custom","permittedUse":["conversation"],"expectedRevision":0,
        "clientRequestId":new_id()},manager.capabilities.catalog(context.scope))
    lease=store.acquire_chat_writer(context.scope,context.session_id,context.stream_id,context.writer_generation)
    context=context.model_copy(update={"writer_lease_id":lease["leaseId"]})
    session=SimpleNamespace(**json.loads((Path(context.sessions_dir)/(context.session_id+".json")).read_text("utf-8")))
    monkeypatch.setattr("web.api.model_policy.service_for_native_chat",lambda *_,**__: (service,resolved))
    capture=capture_fixed_provider(session)
    context=NativeChatContext.model_validate({**context.model_dump(mode="json"),
        "provider_capture":capture.model_dump(mode="json")})
    return context,session,service,resolver


def test_parent_capture_fixed_uses_actual_writer_and_scoped_provider(tmp_path,monkeypatch):
    from runtime.independent.chat_binding import NativeChatWriter
    context,store=fixture_context(tmp_path,"a")
    try:
        context,session,service,resolver=captured_fixed(context,store,monkeypatch)
        hub=SimpleNamespace(by_scope=lambda *_:(store,resolver))
        actual=capture_native_chat_context(session,context.stream_id,
            NativeChatWriter(store,context.writer_lease_id,context.writer_generation),profile_hub=hub)
        assert actual.provider_capture == context.provider_capture
        assert actual.provider_capture.provider.model == "controlled-model"
        assert actual.provider_capture.policy_revision == 0 and actual.selection_mode == "fixed"
        raw=actual.model_dump(mode="json")
        raw["provider_capture"]["sessionId"]="foreign-session"
        with pytest.raises(ValidationError): NativeChatContext.model_validate(raw)
    finally: store.close()


def test_fixed_worker_without_capture_fails_before_sdk_io(tmp_path):
    from runtime.independent.native_chat_host import NativeChatHost
    context,store=fixture_context(tmp_path,"a")
    handle=None
    try:
        handle=NativeChatHost(context,python_executable=isolated_python()).start(*turn(context))
        events=drain(handle)
        faults=[item for item in events if item.get("kind") == "worker_fault"]
        assert faults and faults[0]["stage"] == "fixed_capture"
        assert not any(item.get("kind") == "worker_ready" for item in events)
    finally:
        if handle is not None: handle.terminate(grace_seconds=0,hard_seconds=1)
        store.close()


def test_actual_fixed_sdk_filetool_has_individual_receipts_and_shared_compute(tmp_path,monkeypatch):
    server=ControlledServer(parties=2)
    context,store=fixture_context(tmp_path,"a",server.port)
    broker=None
    channel=config.create_stream_channel(); subscriber=channel.subscribe()
    parent_denials=[]
    try:
        context,session,service,_=captured_fixed(context,store,monkeypatch)
        broker=NativeSdkSessionBroker(context,session,service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        # This test runner may use a different interpreter than the shipped
        # backend runtime; exercise the executor with the same bundled test
        # interpreter used by the native worker.
        broker.file_fence.python_executable = str(isolated_python())
        def dispatch_with_safe_diagnostic(rpc_context, method, payload):
            try:
                return broker(rpc_context, method, payload)
            except Exception as exc:
                if method == "file_execute":
                    code = getattr(exc, "code", None)
                    safe_code = code if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_]{1,95}", code) else None
                    causes = []
                    cause = exc.__cause__
                    while cause is not None and len(causes) < 4:
                        cause_code = getattr(cause, "code", None)
                        safe_cause_code = (cause_code if isinstance(cause_code, str)
                            and re.fullmatch(r"[a-z][a-z0-9_]{1,95}", cause_code) else None)
                        causes.append((type(cause).__name__, safe_cause_code))
                        cause = cause.__cause__
                    parent_denials.append((type(exc).__name__, safe_code, tuple(causes)))
                raise
        before=(Path(context.profile_home)/"auth.json").read_bytes()
        with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),
                python_executable=isolated_python(),rpc_handler=dispatch_with_safe_diagnostic)
            server.arrived.wait(timeout=20)
            active=[json.loads(row[0]) for row in store._many(
                "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
            assert len(active) == 1 and active[0]["state"] == "started"
            assert "auto-provider:"+active[0]["claimId"] in ComputeAdmission._owners
            server.release.set()
            assert future.result(timeout=35) == 0
        assert native_chats.native_chat_exit_confirmed(context)
        assert len(server.all_requests) == 2
        assert {body["model"] for _,_,body in server.all_requests} == {"controlled-model"}
        assert all(auth == "Bearer fixture-a" for _,auth,_ in server.all_requests)
        claims=store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")
        assert len(claims) == 2
        receipts=[json.loads(row[0]) for row in claims]
        assert all(item["policyRevision"] == 0 for item in receipts)
        assert len({item["decisionId"] for item in receipts}) == 1
        assert not ComputeAdmission._owners
        assert (Path(context.profile_home)/"auth.json").read_bytes() == before
        saved=native_chats.load_settled_native_session(context)
        assert any("content-a" in str(message.get("content")) for message in saved.messages), (
            "expected fixture file content in settled transcript; "
            f"safe parent file-denial diagnostics={parent_denials!r}")
    finally:
        server.release.set()
        if broker is not None and native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        channel.unsubscribe(subscriber)
        with config.STREAMS_LOCK: config.STREAMS.pop(context.stream_id,None)
        store.close(); server.close()


def test_native_stop_interrupts_provider_request_before_releasing_writer(tmp_path, monkeypatch):
    """A stop closes the held provider stream before its worker lease is released."""
    import threading
    import time
    from runtime.independent.chat_binding import NativeChatWriter

    server = ControlledServer(hold=True, text_only=True)
    context, store = fixture_context(tmp_path, "stop", server.port)
    channel = config.create_stream_channel()
    subscriber = channel.subscribe()
    peer = broker = None
    worker = None
    try:
        context, session, service, _ = captured_fixed(context, store, monkeypatch)
        broker = NativeSdkSessionBroker(context, session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        native_chats.register_native_chat(context)
        with config.STREAMS_LOCK: config.STREAMS[context.stream_id] = channel
        worker = threading.Thread(target=native_chats.run_native_chat,
            args=(context, *turn(context)), kwargs={"python_executable":isolated_python(),
                "rpc_handler":broker}, daemon=True)
        worker.start()
        deadline = time.monotonic() + 20
        while not server.held_started.is_set() and worker.is_alive() and time.monotonic() < deadline:
            time.sleep(.025)
        if not server.held_started.is_set():
            events = []
            while not subscriber.empty(): events.append(subscriber.get_nowait())
            raise AssertionError(f"provider did not receive the held request: {events!r}")
        assert any(item["leaseId"] == context.writer_lease_id for item in store.list_leases()), "writer lease must be retained while request is held"
        claims = [json.loads(row[0]) for row in store._many(
            "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(claims) == 1 and claims[0]["state"] == "started"
        assert "auto-provider:" + claims[0]["claimId"] in ComputeAdmission._owners

        # This is the same exact-context native cancel operation used by the
        # Quickchat and desktop control paths.
        from web.api.native_chats import register_native_chat, control_native_chat, native_chat_exit_confirmed
        register_native_chat(context)
        assert control_native_chat(context.session_id, context.stream_id,
            actor=context.profile_name, scope=context.scope, command="cancel")
        worker.join(15)
        assert not worker.is_alive(), "native worker remained blocked after provider cancel"
        assert native_chat_exit_confirmed(context)
        assert server.held_aborted.wait(2), "provider connection remained open after native worker exit"
        # Match the owning route: after confirmed worker exit, close provider
        # claims, then release the exact captured writer lease.
        broker.close_after_exit()
        NativeChatWriter(store, context.writer_lease_id, context.writer_generation).release()
        assert not store.list_leases(), "writer lease releases only after confirmed worker exit"
        assert not ComputeAdmission._owners
        stopped_claims = [json.loads(row[0]) for row in store._many(
            "SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(stopped_claims) == 1
        assert stopped_claims[0]["state"] == "unknown" and stopped_claims[0]["stopAcknowledged"] is True

        # Reuse the same accepted Space/profile with a fresh stream and actual
        # writer lease. The previous provider claim must no longer block it.
        next_stream = "turn_stop_followup"
        lease = store.acquire_chat_writer(context.scope, context.session_id,
            next_stream, context.writer_generation)
        raw_path = Path(context.sessions_dir) / (context.session_id + ".json")
        raw = json.loads(raw_path.read_text("utf-8"))
        raw.update(active_stream_id=next_stream, pending_user_message="READ OWN FILE",
            pending_started_at=time.time())
        raw_path.write_text(json.dumps(raw), encoding="utf-8")
        next_context = context.model_copy(update={"stream_id":next_stream,
            "writer_lease_id":lease["leaseId"]})
        next_session = SimpleNamespace(**raw)
        next_channel = config.create_stream_channel()
        with config.STREAMS_LOCK: config.STREAMS[next_stream] = next_channel
        native_chats.register_native_chat(next_context)
        server.hold = False
        next_broker = NativeSdkSessionBroker(next_context, next_session, service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        followup = threading.Thread(target=native_chats.run_native_chat,
            args=(next_context, *turn(next_context)), kwargs={"python_executable":isolated_python(),
                "rpc_handler":next_broker}, daemon=True)
        followup.start(); followup.join(30)
        assert not followup.is_alive(), "follow-up provider request did not complete"
        assert native_chats.native_chat_exit_confirmed(next_context)
        next_broker.close_after_exit()
        NativeChatWriter(store, next_context.writer_lease_id,
            next_context.writer_generation).release()
        assert not store.list_leases(), "follow-up route must release its writer after exit"
        assert len(server.requests) >= 2, "cancelled request and follow-up were not both observed"
        assert not ComputeAdmission._owners
    finally:
        server.release.set()
        if worker.is_alive():
            worker.join(5)
        if broker is not None and native_chats.native_chat_exit_confirmed(context):
            try: broker.close_after_exit()
            except Exception: pass
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id, None)
            config.STREAMS.pop("turn_stop_followup", None)
        channel.unsubscribe(subscriber)
        with config.STREAMS_LOCK: config.STREAMS.pop(context.stream_id, None)
        store.close(); server.close()
