"""Parent SSE detach is separate from actual process and transcript ownership."""
import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
import pytest

from runtime.independent.contracts import Scope
from runtime.independent.store import ResourceBusy
from web.api import config, native_chats
from test_native_chat_process import ControlledServer, fixture_context, turn
from test_independent_profile_isolation import isolated_python
from test_native_chat_fixed_process import captured_fixed
from runtime.independent.native_sdk_broker import NativeSdkSessionBroker
from test_native_goal_ingress import _authorization
from runtime.chat_modes import ChatExecutionPolicy


def bound_parent(context, store, monkeypatch):
    context, session, service, _ = captured_fixed(context, store, monkeypatch)
    return context, NativeSdkSessionBroker(context, session, service=service, execution_policy=ChatExecutionPolicy('action', 1))


def test_parent_detach_does_not_cancel_worker_and_replays_actual_completion(tmp_path, monkeypatch):
    server = ControlledServer(parties=2)
    context, store = fixture_context(tmp_path, "a", server.port)
    context, broker = bound_parent(context, store, monkeypatch)
    channel = config.create_stream_channel()
    subscriber = channel.subscribe()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id] = channel
    try:
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(native_chats.run_native_chat, context, *turn(context), python_executable=isolated_python(), rpc_handler=broker)
            try:
                server.arrived.wait(timeout=30)
                actual = native_chats.get_context(context.session_id,context.stream_id,actor=context.profile_name,scope=context.scope)
                assert actual == context and not native_chats.native_chat_exit_confirmed(context)
                channel.unsubscribe(subscriber)
                assert not config.CANCEL_FLAGS[context.stream_id].is_set()
                with pytest.raises(ResourceBusy):
                    store.acquire_chat_writer(context.scope,context.session_id,"competitor","same-root")
            finally: server.release.set()
            assert future.result(timeout=30) == 0
        assert native_chats.native_chat_exit_confirmed(context)
        session = native_chats.load_settled_native_session(context)
        assert any("content-a" in str(row.get("content")) for row in session.messages if row["role"] == "assistant")
        assert context.stream_id not in config.ACTIVE_RUNS and context.stream_id not in config.STREAMS
        replay = config.get_chat_stream_channel(context.stream_id).subscribe()
        tail = []
        while not replay.empty(): tail.append(replay.get_nowait())
        assert any(event == "stream_end" for event,data in tail)
        assert [data for event,data in tail if event=="stream_end"][-1]["processExited"] is True
        assert not any(event == "worker_exit" and data.get("status") == "cancelled" for event,data in tail)
        assert store.list_leases()  # Root, not the adapter, releases this.
    finally:
        server.close()
        if native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_parent_control_exact_scope_and_worker_ack_until_real_exit(tmp_path, monkeypatch):
    server = ControlledServer(hold=True)
    context, store = fixture_context(tmp_path,"a",server.port)
    context, broker = bound_parent(context, store, monkeypatch)
    channel = config.create_stream_channel(); subscriber = channel.subscribe()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id] = channel
    try:
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),python_executable=isolated_python(),rpc_handler=broker)
            deadline=time.monotonic()+25
            while time.monotonic()<deadline:
                event,data=subscriber.get(timeout=25)
                if event == "token": break
            else: raise AssertionError("No actual SDK token")
            foreign=Scope(backend_profile_id=context.scope.backend_profile_id,space_id=context.scope.space_id,browser_profile_id="foreign")
            with pytest.raises(PermissionError):
                native_chats.control_native_chat(context.session_id,context.stream_id,actor=context.profile_name,scope=foreign,command="pause")
            assert not native_chats.control_native_chat(context.session_id,context.stream_id,actor=context.profile_name,scope=context.scope,command="approval",request_id="missing",choice="once")
            assert native_chats.control_native_chat(context.session_id,context.stream_id,actor=context.profile_name,scope=context.scope,command="pause")
            assert store.list_leases()
            future.result(timeout=8)
        assert native_chats.native_chat_exit_confirmed(context)
        rows=[]
        while not subscriber.empty(): rows.append(subscriber.get_nowait())
        assert any(event=="control_ack" and data.get("status")=="stopping" for event,data in rows)
        assert any(event=="worker_exit" and data.get("status")=="paused" for event,data in rows)
        assert [data for event,data in rows if event=="stream_end"][-1]["processExited"] is True
        assert store.list_leases()
    finally:
        server.close()
        if native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_failed_start_settles_only_without_process_and_retains_actual_error(tmp_path):
    context,store=fixture_context(tmp_path,"a")
    channel=config.create_stream_channel()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
    try:
        assert native_chats.run_native_chat(context,*turn(context),python_executable=tmp_path/"missing-python.exe") == 1
        assert native_chats.native_chat_exit_confirmed(context)
        raw=json.loads((Path(context.sessions_dir)/(context.session_id+".json")).read_text())
        assert raw["active_stream_id"] is None and raw["messages"][-1]["content"]=="READ OWN FILE"
        assert store.list_leases()
        replay=config.get_chat_stream_channel(context.stream_id).subscribe()
        rows=[]
        while not replay.empty(): rows.append(replay.get_nowait())
        assert any(event=="error" and data.get("error")=="native_chat_start_failed" for event,data in rows)
        assert [data for event,data in rows if event=="stream_end"][-1]["processExited"] is True
    finally:
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_thread_start_abandon_cannot_settle_a_running_worker(tmp_path):
    context,store=fixture_context(tmp_path,"a")
    try:
        entry=native_chats.register_native_chat(context)
        entry.handle=SimpleNamespace(is_alive=True)
        assert not native_chats.abandon_unstarted_native_chat(context)
        assert not native_chats.native_chat_exit_confirmed(context)
        entry.handle=None
        assert native_chats.abandon_unstarted_native_chat(context)
        assert native_chats.native_chat_exit_confirmed(context)
    finally: store.close()


def test_prelaunch_failure_cleanup_uses_captured_path_and_preserves_full_history(tmp_path,monkeypatch):
    context,store=fixture_context(tmp_path,"a")
    path=Path(context.sessions_dir)/(context.session_id+".json")
    raw=json.loads(path.read_text())
    raw["messages"]=[{"role":"user","content":"older question"},{"role":"assistant","content":"older actual answer"}]
    path.write_text(json.dumps(raw))
    from web.api import profiles
    monkeypatch.setattr(profiles,"_active_profile","foreign")
    monkeypatch.setenv("SIDEKICK_HOME",str(tmp_path/"foreign"))
    channel=config.create_stream_channel()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
    try:
        native_chats.register_native_chat(context)
        assert native_chats.is_native_stream(context.stream_id)
        assert native_chats.fail_unstarted_native_chat(context)
        saved=json.loads(path.read_text())
        assert saved["messages"][:2]==raw["messages"]
        assert saved["messages"][-1]["content"]=="READ OWN FILE"
        assert saved["active_stream_id"] is None and native_chats.native_chat_exit_confirmed(context)
        assert store.list_leases()
        assert not (tmp_path/"foreign").exists()
    finally:
        store.close()
        with config.STREAMS_LOCK: config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_parent_rpc_discovery_wait_cannot_block_real_cancel_ack_and_exit(tmp_path):
    from runtime.independent.model_selection import SelectionPolicyRepository
    context,store=fixture_context(tmp_path,"a")
    repository=SelectionPolicyRepository(store,session_validator=lambda *args:None)
    repository.set(context.scope,context.session_id,{"mode":"auto","allowedModels":[{"provider":"custom","model":"controlled-model"}]},
        expected_revision=0,client_request_id="d"*32,validate=lambda policy:None)
    context=context.model_copy(update={"selection_mode":"auto","selection_policy_revision":1})
    channel=config.create_stream_channel(); subscriber=channel.subscribe()
    entered,release=threading.Event(),threading.Event()
    def slow_discovery(actual,method,payload):
        assert actual==context and method=="auto_policy"
        entered.set(); release.wait(timeout=15)
        raise RuntimeError("Controlled discovery cancelled")
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
    try:
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),
                python_executable=isolated_python(),rpc_handler=slow_discovery)
            try:
                if not entered.wait(timeout=8):
                    rows=[]
                    while not subscriber.empty(): rows.append(subscriber.get_nowait())
                    raise AssertionError(str(rows))
                start=time.monotonic()
                assert native_chats.control_native_chat(context.session_id,context.stream_id,
                    actor=context.profile_name,scope=context.scope,command="cancel")
                future.result(timeout=8)
                assert time.monotonic()-start<6
                assert not release.is_set()  # RPC handler is still waiting.
            finally: release.set()
        rows=[]
        while not subscriber.empty(): rows.append(subscriber.get_nowait())
        assert any(event=="control_ack" and data.get("status")=="stopping" for event,data in rows)
        assert native_chats.native_chat_exit_confirmed(context) and store.list_leases()
    finally:
        release.set(); store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_real_worker_deferred_terminal_requires_root_writer_cleanup(tmp_path, monkeypatch):
    server=ControlledServer(hold=True)
    context,store=fixture_context(tmp_path,"a",server.port)
    context, broker = bound_parent(context, store, monkeypatch)
    channel=config.create_stream_channel(); subscriber=channel.subscribe()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
    try:
        native_chats.register_native_chat(context)
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,*turn(context),
                python_executable=isolated_python(),defer_terminal=True,rpc_handler=broker)
            rows=[]
            deadline=time.monotonic()+25
            while time.monotonic()<deadline:
                event,data=subscriber.get(timeout=25)
                rows.append((event,data))
                if event=="token": break
            else: raise AssertionError("No actual SDK token")
            assert native_chats.control_native_chat(context.session_id,context.stream_id,actor="a",scope=context.scope,command="cancel")
            future.result(timeout=8)
        while not subscriber.empty(): rows.append(subscriber.get_nowait())
        assert native_chats.native_chat_exit_confirmed(context)
        assert not any(event in {"error","cancel","stream_end"} and data.get("processExited") for event,data in rows)
        assert not native_chats.finalize_native_chat(context)
        store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
        assert native_chats.finalize_native_chat(context)
        assert subscriber.get(timeout=1)==("stream_end",{"session_id":context.session_id,"stream_id":context.stream_id,
            "processExited":True,"writerGeneration":context.writer_generation,"nativeChat":True})
    finally:
        server.close()
        if native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)


def test_actual_worker_exit_releases_parent_goal_claim_and_rearms_interrupted_turn(tmp_path,monkeypatch):
    from web.api import goals,profiles
    from test_native_chat_rehydration import close_goal_databases
    server=ControlledServer(hold=True)
    context,store=fixture_context(tmp_path,"a",server.port)
    context, broker = bound_parent(context, store, monkeypatch)
    home=Path(context.profile_home)
    monkeypatch.setattr(profiles,"_DEFAULT_SIDEKICK_HOME",home.parent.parent)
    channel=config.create_stream_channel(); subscriber=channel.subscribe()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
    try:
        result=goals.goal_command_payload(context.session_id,"Controlled goal",profile_home=home,space_slug="research",
            expected_revision=0,client_request_id=uuid.uuid4().hex,
            human_authorization=_authorization(context))
        assert result["ok"],result
        manager=goals._ProfileGoalManager(context.session_id,profile_home=home,space_slug="research")
        prompt=manager.next_continuation_prompt()
        assert goals.queue_goal_continuation(context.session_id,prompt,profile_home=home,space_slug="research")
        assert goals.consume_goal_continuation(context.session_id,prompt,profile_home=home,space_slug="research")=="active"
        assert goals.goal_continuation_claim_turn(context.session_id,profile_home=home,space_slug="research")==0
        path=Path(context.sessions_dir)/(context.session_id+".json")
        raw=json.loads(path.read_text()); raw["pending_user_message"]=prompt; path.write_text(json.dumps(raw))
        args,kwargs=turn(context)
        args=(args[0],prompt,*args[2:])
        kwargs.update(goal_claim_turn=0,goal_claim_profile_home=str(home),goal_claim_space_slug="research")
        with ThreadPoolExecutor(1) as pool:
            future=pool.submit(native_chats.run_native_chat,context,args,kwargs,python_executable=isolated_python(),rpc_handler=broker)
            deadline=time.monotonic()+25
            while time.monotonic()<deadline:
                event,data=subscriber.get(timeout=25)
                if event=="token": break
            else: raise AssertionError("No actual SDK token")
            assert native_chats.control_native_chat(context.session_id,context.stream_id,actor="a",scope=context.scope,command="cancel")
            future.result(timeout=8)
        assert goals.goal_continuation_claim_turn(context.session_id,profile_home=home,space_slug="research") is None
        current=goals._ProfileGoalManager(context.session_id,profile_home=home,space_slug="research")
        assert current.state.consumed_continuation_turn==-1 and current.state.turns_used==0
        assert store.list_leases()
    finally:
        server.close(); close_goal_databases(home)
        if native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)
