"""Exact pending recovery and existing Goal continuation ownership, no engines."""
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from runtime.independent.contracts import new_id
from web.api import config, native_chats, goals
from test_native_chat_process import fixture_context


def close_goal_databases(home):
    for key,db in list(goals._DB_CACHE.items()):
        if str(home) in key:
            db.close(); goals._DB_CACHE.pop(key,None)


def test_actual_pending_snapshot_exact_scope_bounded_and_one_response(tmp_path):
    context,store=fixture_context(tmp_path,"a")
    entry=native_chats.register_native_chat(context)
    sent=[]
    entry.handle=SimpleNamespace(is_alive=True,send_control=lambda *args,**kwargs:sent.append((args,kwargs)))
    try:
        entry.pending["actual-request"]=native_chats._pending_control_view(context,"clarify",{
            "requestId":"actual-request","question":"actual question","choices_offered":["a","b"],"api_key":"forbidden"})
        snapshot=native_chats.pending_control_snapshot(context.session_id,context.stream_id,actor="a",scope=context.scope)
        assert snapshot["pendingControls"][0]["data"]=={"question":"actual question","choices_offered":["a","b"]}
        snapshot["pendingControls"][0]["data"]["question"]="mutated view"
        assert entry.pending["actual-request"]["data"]["question"]=="actual question"
        with pytest.raises(PermissionError):
            native_chats.pending_control_snapshot(context.session_id,context.stream_id,actor="foreign",scope=context.scope)
        assert not native_chats.control_native_chat(context.session_id,context.stream_id,actor="a",scope=context.scope,
            command="approval",request_id="actual-request",choice="once")
        assert native_chats.control_native_chat(context.session_id,context.stream_id,actor="a",scope=context.scope,
            command="clarify",request_id="actual-request",response="actual response")
        assert not native_chats.control_native_chat(context.session_id,context.stream_id,actor="a",scope=context.scope,
            command="clarify",request_id="actual-request",response="replay")
        assert len(sent)==1
    finally:
        entry.handle=None; native_chats.abandon_unstarted_native_chat(context); store.close()


@pytest.mark.parametrize("stale",[False,True])
def test_parent_goal_handoff_waits_for_writer_release_and_actual_current_owner(tmp_path,monkeypatch,stale):
    context,store=fixture_context(tmp_path,"a")
    home=Path(context.profile_home)
    from web.api import profiles
    monkeypatch.setattr(profiles,"_DEFAULT_SIDEKICK_HOME",home.parent.parent)
    try:
        result=goals.goal_command_payload(context.session_id,"Controlled goal",profile_home=home,
            space_slug="research",expected_revision=0,client_request_id="goal-create")
        assert result["ok"],result
        manager=goals._ProfileGoalManager(context.session_id,profile_home=home,space_slug="research")
        prompt=manager.next_continuation_prompt()
        channel=config.create_stream_channel()
        with config.STREAMS_LOCK: config.STREAMS[context.stream_id]=channel
        config.retain_completed_chat_stream(context.stream_id)
        native_chats.register_native_chat(context); native_chats.abandon_unstarted_native_chat(context)
        with native_chats._lock:
            native_chats._goal_handoffs[context.stream_id]=(context,{"session_id":context.session_id,
                "continuation_prompt":prompt,"text":prompt,"_capturedGoalSpaceSlug":"research"})
            native_chats._terminal_pending[context.stream_id]=context
        assert not native_chats.publish_settled_goal_continuation(context)
        assert not native_chats.finalize_native_chat(context)
        store.release_lease(context.writer_lease_id,owner_generation=context.writer_generation)
        if stale:
            goals.transfer_goal_continuation_owner(context.session_id,profile_home=home,space_slug="research",
                expected_revision=manager.state.revision,continuation_owner="independent_run",owner_run_id="actual-owning-run")
        assert native_chats.finalize_native_chat(context)
        events=channel.subscribe()
        rows=[]
        while not events.empty(): rows.append(events.get_nowait())
        assert any(event=="goal_continue" and data["processExited"] for event,data in rows) is (not stale)
        assert rows[-1][0]=="stream_end" and rows[-1][1]["processExited"] is True
        if not stale: assert rows[-2][0]=="goal_continue"
        assert not native_chats.finalize_native_chat(context)
    finally:
        close_goal_databases(home); store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id,None); config.RECENT_CHAT_STREAMS.pop(context.stream_id,None)
