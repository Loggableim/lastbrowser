"""Actual fixed SDK builder, real Parent receipts/pool and scoped capture."""
import json
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
    try:
        context,session,service,_=captured_fixed(context,store,monkeypatch)
        broker=NativeSdkSessionBroker(context,session,service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        before=(Path(context.profile_home)/"auth.json").read_bytes()
        with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),
                python_executable=isolated_python(),rpc_handler=broker)
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
        assert any("content-a" in str(message.get("content")) for message in saved.messages)
    finally:
        server.release.set()
        if broker is not None and native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        channel.unsubscribe(subscriber)
        with config.STREAMS_LOCK: config.STREAMS.pop(context.stream_id,None)
        store.close(); server.close()
