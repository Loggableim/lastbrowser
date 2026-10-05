"""Actual AIAgent + OpenAI SDK streams against a controlled local SSE server."""
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from runtime.chat_modes import ChatExecutionPolicy
from runtime.independent.child_contracts import ChildParentContext
from runtime.independent.contracts import Scope
from runtime._compat.shim_state import SessionDB
from web.api.subagent_history import scoped_child_history


def test_two_actual_sdk_children_keep_answers_out_of_parent(tmp_path, monkeypatch):
    from web.api import config as web_config
    monkeypatch.setattr(web_config, 'SETTINGS_FILE', tmp_path/'settings.json')
    web_config.save_settings({'game_mode_enabled': False})
    monkeypatch.setenv('SIDEKICK_HOME', str(tmp_path))
    (tmp_path/'config.yaml').write_text('runtime_hooks_enabled: false\nprovider_metadata_prewarm: false\nmodel:\n  context_length: 128000\ndelegation:\n  max_iterations: 3\n  child_timeout_seconds: 30\n')
    requests = []
    arrivals_lock = threading.Lock()
    arrivals = 0
    arrived = threading.Event()
    release = threading.Event()
    class Server(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if not body.get('stream') or 'messages' not in body:
                # Capability detection may probe Responses. This fixture
                # supports only the actual streamed Chat Completions path.
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error":{"message":"Unsupported probe endpoint","type":"invalid_request_error"}}')
                return
            requests.append(body)
            prompt = str(body['messages'][-1]['content'])
            text = 'actual-SDK-A' if 'TASK-A' in prompt else 'actual-SDK-B'
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Connection', 'close')
            self.end_headers()
            def chunk(delta, finish=None):
                row = {'id':'controlled-response', 'object':'chat.completion.chunk',
                       'created':int(time.time()), 'model':body['model'],
                       'choices':[{'index':0,'delta':delta,'finish_reason':finish}]}
                self.wfile.write(('data: '+json.dumps(row)+'\n\n').encode())
                self.wfile.flush()
            chunk({'role':'assistant','content':text+'-one'})
            nonlocal arrivals
            with arrivals_lock:
                arrivals += 1
                if arrivals == 2:
                    arrived.set()
            if not release.wait(timeout=30):
                raise TimeoutError('test did not release both child streams')
            chunk({'content':'-two'})
            chunk({}, 'stop')
            self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
            self.close_connection = True
    server = ThreadingHTTPServer(('127.0.0.1', 0), Server)
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    from run_agent import AIAgent
    from tools import delegate_tool as d
    db = SessionDB(tmp_path/'state.db')
    events, parent_text = [], []
    parent = AIAgent(model='controlled-model', provider='custom',
        api_mode='chat_completions',
        base_url=f'http://127.0.0.1:{server.server_port}/v1', api_key='fixture',
        max_iterations=8, enabled_toolsets=[], skip_context_files=True, skip_memory=True,
        runtime_config={'runtime_hooks_enabled': False, 'provider_metadata_prewarm': False, 'model': {'context_length': 128000}},
        quiet_mode=True, session_db=db, platform='webui',
        tool_progress_callback=lambda kind,*args,**kw: events.append((kind,kw)),
        stream_delta_callback=parent_text.append)
    parent._child_parent_context = ChildParentContext(
        Scope(backend_profile_id='a'*32,space_id='b'*32,browser_profile_id='default'),
        tmp_path, 'A', tmp_path/'sessions', parent.session_id, 'sdk-turn')
    parent._chat_execution_policy = ChatExecutionPolicy('action', 2)
    # Real delegate calls occur after the parent's run creates its own DB row.
    parent._ensure_db_session()
    try:
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(d.delegate_task, tasks=[{'goal':'TASK-A'},{'goal':'TASK-B'}], parent_agent=parent)
            try:
                assert arrived.wait(timeout=30), f'only {arrivals} child stream(s) reached the held-response gate'
                assert arrivals == 2
                assert len(requests) == 2
                assert len(d.list_active_subagents(parent_context=parent._child_parent_context)) == 2
            finally:
                release.set()
            result = json.loads(future.result(timeout=30))
        history = scoped_child_history(parent._child_parent_context)
        assert len(history['runs']) == 2 and len(requests) == 2
        assert all(body['stream'] for body in requests)
        assert {r['status'] for r in history['runs']} == {'completed'}
        assert {r['messages'][-1]['content'] for r in history['runs']} == {'actual-SDK-A-one-two','actual-SDK-B-one-two'}
        assert all(r['sourceActuality']=='persisted' for r in history['runs'])
        assert len([kw for kind,kw in events if kind == 'subagent.answer_delta']) >= 4
        assert parent_text == []
    finally:
        release.set(); server.shutdown(); server.server_close(); parent.close()
