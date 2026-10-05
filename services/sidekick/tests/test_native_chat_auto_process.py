"""Real shipped worker/SDK builder with Parent-owned AUTO receipts and pool."""
import json
import threading
import time
import pytest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from runtime.independent.capabilities import CapabilityService, evidence_digest
from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import new_id
from runtime.independent.manager import RunManager, ComputeAdmission
from runtime.independent.model_selection import AutoSelectionService
from runtime.independent.model_policy_session import validate_native_session
from runtime.independent.native_chat_auto import NativeAutoSessionBroker
from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.provider_admission import ProviderAdmission
from runtime.independent.runner import provider_configuration_digest
from runtime.independent.scope import ScopeResolver
from web.api import config, native_chats
from test_native_chat_process import ControlledServer, fixture_context, turn
from test_independent_profile_isolation import isolated_python


@pytest.mark.parametrize("failure",[False,True])
def test_actual_native_auto_builder_file_tool_receipts_and_parent_compute(tmp_path,monkeypatch,failure):
    server=ControlledServer(parties=2,fail_second=failure)
    context,store=fixture_context(tmp_path,"a",server.port)
    home=Path(context.profile_home)
    with (home/"config.yaml").open("a") as configuration:
        configuration.write("fallback_model:\n  provider: custom\n  model: forbidden-fallback\n")
    resolver=ScopeResolver(store,profiles_provider=lambda:[{"name":"a","path":str(home)}])
    manager=RunManager(store,resolver,generation=context.writer_generation)
    manager.capabilities=CapabilityService(manager)
    manager.connection_validator=manager.capabilities.validate
    resolved=resolver.resolve(context.scope,authenticated_profile_name="a")
    def catalog(*args,**kwargs):
        # Controlled explicit loopback catalog metadata, not provider mocks.
        return {"providerConfigurationDigest":provider_configuration_digest(home),
            "groups":[{"provider_id":"custom","configured":True,"models":[{"id":"controlled-model","contextLength":128000,"supportsIndependent":True,"supportsTools":True}]}],
            "providers":[{"id":"custom","has_key":True}],
            "capabilityInventory":{"plugins":[],"mcp":[],"evidenceDigest":evidence_digest(home)}}
    monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog",catalog)
    admission=ProviderAdmission(store,base_home=home.parent.parent,
        existing_store_paths=lambda:((store.backend_profile_id,store.db_path),))
    service=AutoSelectionService(manager,admission,
        session_validator=lambda scope,sid:validate_native_session(resolved,sid,actor="a"))
    broker=None
    channel=config.create_stream_channel(); subscriber=channel.subscribe()
    try:
        store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
        capabilities=manager.capabilities.catalog(context.scope)
        ConnectionRepository(store).bind(context.scope,{"capabilityId":"assistant.conversation",
            "connectionId":"provider:custom","permittedUse":["conversation"],"expectedRevision":0,"clientRequestId":new_id()},capabilities)
        service.set_policy(context.scope,context.session_id,{"mode":"auto",
            "allowedModels":[{"provider":"custom","model":"controlled-model"}],"cloudPolicy":"deny",
            "budget":{"maxOutputTokens":16,"tokensPerMinute":1_000_000}},expected_revision=0,client_request_id=new_id())
        lease=store.acquire_chat_writer(context.scope,context.session_id,context.stream_id,context.writer_generation)
        context=context.model_copy(update={"writer_lease_id":lease["leaseId"],"selection_mode":"auto","selection_policy_revision":1})
        raw=json.loads((Path(context.sessions_dir)/(context.session_id+".json")).read_text())
        session=SimpleNamespace(**raw)
        broker=NativeAutoSessionBroker(context,session,service=service,
            execution_policy=ChatExecutionPolicy("action", 1))
        broker.file_fence.python_executable=str(isolated_python())
        before=(home/"auth.json").read_bytes()
        with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
        native_chats.register_native_chat(context)
        rpc_errors=[]
        def observed_rpc(actual,method,payload):
            try: return broker(actual,method,payload)
            except Exception as exc:
                from runtime.independent.policy import PolicyDenied
                rpc_errors.append((method,type(exc).__name__,
                    exc.code if isinstance(exc,PolicyDenied) else None))
                raise
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),
                python_executable=isolated_python(),rpc_handler=observed_rpc)
            try:
                deadline=time.monotonic()+20
                while not server.arrived.n_waiting and not future.done() and time.monotonic()<deadline:
                    time.sleep(.05)
                if not server.arrived.n_waiting:
                    rows=[]
                    while not subscriber.empty(): rows.append(subscriber.get_nowait())
                    raise AssertionError(str((rpc_errors,rows)))
                server.arrived.wait(timeout=5)
                claims=[json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
                assert len(claims)==1 and claims[0]["state"]=="started"
                assert "auto-provider:"+claims[0]["claimId"] in ComputeAdmission._owners
            finally: server.release.set()
            outcome=future.result(timeout=30)
        rows=[]
        while not subscriber.empty(): rows.append(subscriber.get_nowait())
        assert outcome==0, rows
        assert not any(event=="worker_fault" for event,data in rows), rows
        routes=[data for event,data in rows if event=="auto_route"]
        assert len(routes)==1 and routes[0]["selectedModel"]=={"provider":"custom","model":"controlled-model"}
        assert "context" not in routes[0] and routes[0]["reason"] in {
            "configured_orchestrator",
            "first_eligible_allowed_model", "observed_provider_headroom", "fewest_active_claims",
            "fewest_recent_local_claims", "fallback_after_admission_unavailable"}
        if failure:
            assert any(event=="token" and "first-visible-a" in data.get("text","") for event,data in rows)
        else:
            assert not any(event=="error" for event,data in rows), rows
        assert native_chats.native_chat_exit_confirmed(context)
        broker.close_after_exit()
        claims=[json.loads(row[0]) for row in store._many("SELECT result_json FROM ia_request_results WHERE operation='provider_claim'")]
        assert len(claims)==2
        if failure:
            assert any(claim["state"]=="completed" and claim["deliveredDelta"] for claim in claims)
            assert any(claim.get("errorCode") in {"provider_stream_interrupted","provider_request_failed"} for claim in claims), [
                (claim["state"],claim.get("errorCode"),claim["deliveredDelta"]) for claim in claims]
            assert any(snapshot["statusCode"]==429 for snapshot in admission.limits("custom"))
        else:
            assert all(claim["state"]=="completed" for claim in claims)
        assert all("auto-provider:"+claim["claimId"] not in ComputeAdmission._owners for claim in claims)
        assert all(body["model"]=="controlled-model" and body.get("max_tokens")==16 for token,body in server.requests)
        assert all(token=="Bearer fixture-a" for token,body in server.requests)
        assert len(server.all_requests)==2  # No auxiliary/probe SDK bypass.
        assert (home/"auth.json").read_bytes()==before
        transcript=native_chats.load_settled_native_session(context)
        if not failure:
            assert any("content-a" in str(row.get("content")) for row in transcript.messages if row["role"]=="assistant"), rpc_errors
        journal="".join(row[0] for row in store._many("SELECT result_json FROM ia_request_results"))
        assert "READ OWN FILE" not in journal and "fixture-a" not in journal
    finally:
        server.close()
        if broker is not None and native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        manager.shutdown(); store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)
