"""Real shipped judge-only Worker -> SDK receipt -> Parent Goal CAS."""
import json
import threading
import uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pytest
from runtime.independent.contracts import digest_json
from runtime.independent.native_goal_retry import NativeGoalRetryRequest
from runtime.independent.native_chat_protocol import verify_native_context
from test_native_chat_process import fixture_context, turn
from test_native_chat_parent import bound_parent
from test_native_goal_ingress import _authorization
from test_independent_profile_isolation import isolated_python


@pytest.mark.parametrize('clear_before_cas', [False, True])
def test_actual_judge_only_sdk_receipt_and_parent_cas(tmp_path, monkeypatch, clear_before_cas):
    from web.api import config, goals, native_chats
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            requests.append(body)
            response = {'id': 'controlled-judge', 'object': 'chat.completion', 'model': 'controlled-model',
                'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': json.dumps({'done': True, 'reason': 'Controlled completion'})},
                    'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15}}
            data = json.dumps(response).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True); server_thread.start()
    context, store = fixture_context(tmp_path, 'a', server.server_port)
    broker = None
    monkeypatch.setattr(goals, '_DB_CACHE', {})
    monkeypatch.setattr(goals, '_PENDING_CONTINUATIONS', {})
    monkeypatch.setattr(goals, '_CANCELLED_CONTINUATIONS', {})
    monkeypatch.setattr(goals, '_IN_FLIGHT_CONTINUATIONS', set())
    def own_path(slug, *, profile_home=None):
        if slug == Path(context.space_root).name and Path(profile_home).resolve() == Path(context.profile_home).resolve():
            return Path(context.space_root) / 'goals.db'
        return None
    monkeypatch.setattr(goals, '_space_goals_path', own_path)
    channel = config.create_stream_channel(); subscriber = channel.subscribe()
    with config.STREAMS_LOCK: config.STREAMS[context.stream_id] = channel
    try:
        context, broker = bound_parent(context, store, monkeypatch)
        common = {'profile_home': context.profile_home, 'space_slug': Path(context.space_root).name,
            'human_authorization': _authorization(context)}
        created = goals.goal_command_payload(context.session_id, 'Controlled goal', expected_revision=0,
            client_request_id=uuid.uuid4().hex, **common)
        assert created['ok'], created
        manager = goals._manager(context.session_id, profile_home=context.profile_home, space_slug=Path(context.space_root).name)
        paused = manager.evaluate_after_turn('Existing response to judge', judged_result=('unavailable', 'controlled outage', False))
        assert paused['status'] == 'paused'
        resumed = goals.goal_command_payload(context.session_id, 'resume', expected_revision=manager.state.revision,
            client_request_id=uuid.uuid4().hex, native_judge_retry=True, **common)
        assert resumed['ok'] and resumed.get('native_judge_retry'), resumed
        retry = resumed['native_judge_retry']
        request = NativeGoalRetryRequest(request_id=uuid.uuid4().hex, scope=context.scope,
            session_id=context.session_id, stream_id=context.stream_id, goal_run_id=retry['goalRunId'],
            goal_revision=retry['goalRevision'], goal_digest=retry['goalDigest'],
            human_command_ref=retry['humanCommandRef'], human_command_digest=retry['humanCommandDigest'])
        session_path = Path(context.sessions_dir) / (context.session_id + '.json')
        raw = json.loads(session_path.read_text()); raw['pending_user_message'] = None
        session_path.write_text(json.dumps(raw))
        original_messages = raw['messages']
        native_chats.register_native_chat(context)
        args, kwargs = turn(context); args = (args[0], '', *args[2:])
        accepted = []
        def apply(result):
            assert native_chats.native_chat_exit_confirmed(context)
            verify_native_context(context)  # Actual writer must still belong to this worker.
            assert store.list_leases()
            if clear_before_cas:
                cleared = goals.goal_command_payload(context.session_id, 'clear', expected_revision=request.goal_revision,
                    client_request_id=uuid.uuid4().hex, **common)
                assert cleared['ok'], cleared
            decision = goals.apply_native_goal_judge_result(context, request, result)
            accepted.append(decision)
            return decision
        code = native_chats.run_native_goal_judge_retry(context, args, kwargs, snapshot=request,
            on_result=apply, sdk_broker=broker, python_executable=isolated_python())
        assert native_chats.native_chat_exit_confirmed(context)
        events = [subscriber.get_nowait() for _ in range(subscriber.qsize())]
        assert len(requests) == 1 and not requests[0].get('tools'), [(event, data.get('stage'), data.get('errorCode'), data.get('errorType'), data.get('error')) for event, data in events]
        assert any('Existing response to judge' in str(m.get('content')) for m in requests[0]['messages'])
        claims = [broker.service.admission.get_claim(context.scope, identity) for identity in broker._claims]
        assert any(c.request_purpose == 'goal_judge' and c.state == 'completed' for c in claims)
        assert json.loads(session_path.read_text())['messages'] == original_messages
        assert (Path(context.workspace) / 'controlled.txt').read_text() == 'content-a'
        current = goals._manager(context.session_id, profile_home=context.profile_home, space_slug=Path(context.space_root).name)
        if clear_before_cas:
            assert code != 0 and not accepted and current.state.status == 'cleared'
            assert current.state.revision > request.goal_revision
        else:
            assert code == 0 and len(accepted) == 1 and current.state.status == 'done'
        assert not native_chats.finalize_native_chat(context)
        store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
        assert native_chats.finalize_native_chat(context)
    finally:
        server.shutdown(); server.server_close(); server_thread.join(timeout=2)
        if broker is not None and native_chats.native_chat_exit_confirmed(context): broker.close_after_exit()
        for db in goals._DB_CACHE.values(): db.close()
        store.close()
        with config.STREAMS_LOCK:
            config.STREAMS.pop(context.stream_id, None); config.RECENT_CHAT_STREAMS.pop(context.stream_id, None)
