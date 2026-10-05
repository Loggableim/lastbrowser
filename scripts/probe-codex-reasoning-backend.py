"""Controlled real native API/SDK fixture, never the user's Sidecar/profile.

Only loopback listeners, temporary Homes and synthetic provider replies are
used. The native independent router, manager, worker and AIAgent remain real.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "sidekick"))
TEMP = Path(sys.argv[1]).resolve(strict=True)
BOOT = json.loads((TEMP / "bootstrap.json").read_text("utf-8"))
HOME = TEMP / "backend-home"
HOME.mkdir()
os.environ.update(SIDEKICK_HOME=str(HOME), SIDEKICK_BASE_HOME=str(HOME), LASTBROWSER_HOME=str(HOME),
                  LASTBROWSER_BRIDGE_TOKEN=BOOT["privateBridgeNonce"], PYTHONDONTWRITEBYTECODE="1")
PHASES = TEMP / "backend-phases.jsonl"
LOCK = threading.Lock()
RELEASED: set[str] = set()
COUNTS = {"ticks": {}, "mutations": {}, "providerCalls": 0, "deniedExternalProxyRequests": 0}


def phase(name, **fields):
    with LOCK:
        with PHASES.open("a", encoding="utf-8") as output:
            output.write(json.dumps({"phase": name, **fields}) + "\n")


class Fixture(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, body, *, status=200, kind="application/json"):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def reject_proxy(self):
        # Only the destination hostname and method are diagnostic data. Never
        # copy request URLs, query strings, credentials, headers or bodies.
        parsed = urlparse("//" + self.path if self.command == "CONNECT" else self.path)
        host = parsed.hostname or self.headers.get("Host", "").split(":")[0]
        COUNTS["deniedExternalProxyRequests"] += 1
        phase("blocked_external_attempt", method=self.command, host=host[:253])
        self.reply({}, status=403)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.scheme or self.headers.get("Host", "").split(":")[0] not in {"127.0.0.1", "localhost"}:
            self.reject_proxy(); return
        account = re.search(r"pipeline_account=([AB])", self.headers.get("Cookie", ""))
        name = account.group(1) if account else "missing"
        if parsed.path == "/":
            self.reply(b'<!doctype html><h1>Controlled local account login</h1><form method="post" action="/fixture/login"><label>Test account A or B <input id="account" name="account" maxlength="1"></label><button id="login">Sign in controlled test account</button></form>', kind="text/html")
            return
        if parsed.path == "/fixture/status":
            self.reply(COUNTS); return
        if parsed.path == "/v1/models":
            self.reply({"data": [{"id": "pipeline-model", "context_length": 64000}]}); return
        if parsed.path.startswith("/tick") or parsed.path == "/mutate":
            field = "ticks" if parsed.path.startswith("/tick") else "mutations"
            COUNTS[field][name] = COUNTS[field].get(name, 0) + 1
            self.reply({"account": name}); return
        if parsed.path == "/page":
            self.reply((f'<!doctype html><h1>Controlled account {name}</h1><button id="mutate" onclick="fetch(\'/mutate\')">Mutate</button>'
                        '<script>setInterval(()=>fetch("/tick"),100)</script>').encode(), kind="text/html")
            return
        self.reply({}, status=404)

    def do_CONNECT(self):
        self.reject_proxy()

    def do_POST(self):
        if urlparse(self.path).scheme or self.headers.get("Host", "").split(":")[0] not in {"127.0.0.1", "localhost"}:
            self.reject_proxy(); return
        if self.path == "/fixture/login":
            from urllib.parse import parse_qs
            form = parse_qs(self.rfile.read(min(100, int(self.headers.get("Content-Length", "0")))).decode("utf-8"))
            account = form.get("account", [None])[0]
            if account not in {"A", "B"}:
                self.reply({}, status=400); return
            self.send_response(303)
            self.send_header("Set-Cookie", f"pipeline_account={account}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600")
            self.send_header("Location", "/page")
            self.send_header("Content-Length", "0")
            self.end_headers()
            phase("controlled_login_form_submitted")
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        if self.path == "/responses":
            phase("codex_responses_request_observed", model=body.get("model"),
                  reasoning=body.get("reasoning"), stream=body.get("stream"), store=body.get("store"))
            raw = (b'data: {"type":"response.output_text.delta","delta":"Controlled transport response; not Codex inference."}\n\n'
                   b'data: {"type":"response.completed","response":{"id":"controlled-response","status":"completed","output":[]}}\n\n'
                   b'data: [DONE]\n\n')
            self.reply(raw, kind="text/event-stream")
            return
        if self.path == "/fixture/release":
            with LOCK:
                RELEASED.add(body["case"])
            self.reply({"released": True}); return
        if self.path != "/v1/chat/completions":
            self.reply({}, status=404); return
        messages = body.get("messages", [])
        user_text = "\n".join(str(message.get("content", "")) for message in messages if message.get("role") == "user")
        cases = re.findall(r"PIPELINE:([a-z]+)", user_text)
        case = cases[-1] if cases else "conversation"
        tools = sum(message.get("role") == "tool" for message in messages)
        assistant = "HUMAN MESSAGE:" in user_text and "Reply ONLY with JSON conforming" in user_text
        COUNTS["providerCalls"] += 1
        phase("provider_request", case=case, assistant=assistant, priorTools=tools)
        if BOOT.get('interviewProbe') and case in {'profilechat', 'profilerun'} and not assistant:
            actual_context = '\n'.join(str(message.get('content', '')) for message in messages)
            phase('actual_confirmed_profile_sdk_context', case=case,
                  purposePresent='Controlled research workspace' in actual_context,
                  helpPresent='Prefer summaries and clear explanations' in actual_context)
        for manager, _assistant in tuple(independent._services.values()):
            baseline = getattr(manager, '_pipeline_files', None)
            if baseline is not None and COUNTS["providerCalls"] == 1:
                auth_path = manager.store.profile_home / 'auth.json'
                phase('auth_store_unchanged_before_first_sdk',
                      unchanged=(auth_path.read_bytes() if auth_path.is_file() else None) == baseline['auth.json'])
        if tools:
            phase('provider_tool_observed', case=case, value=str(next(
                message.get('content', '') for message in reversed(messages) if message.get('role') == 'tool'))[:1000])
        content, call = None, None
        if BOOT.get('interviewProbe') and 'voluntary adaptive interview' in user_text:
            state, _ = json.JSONDecoder().raw_decode(user_text.split('Current interview:\n')[-1])
            if len(state['answers']) == 1:
                content = json.dumps({'schemaVersion': 1, 'kind': 'question', 'basedOnRevision': state['revision'],
                    'topic': 'help', 'prompt': 'Which help is useful for this controlled Space?',
                    'options': [{'id': str(index), 'label': label} for index, label in enumerate(['Research', 'Summaries', 'Planning', 'Other work'])],
                    'allowFreeText': True, 'selection': 'single'})
            else:
                content = 'Controlled invalid interview response for manual fallback.'
        elif assistant:
            content = json.dumps({"message": "Controlled task delegated.", "task": {"kind": "start_chat" if case in {"chat", "profilechat"} else "start_agent",
                "title": "Controlled " + case, "instruction": "Execute PIPELINE:" + case, "desired_result": "Controlled local evidence"}})
        elif BOOT.get('nativeReasoningProbe') and case in {'nativereasoninga', 'nativereasoningb'}:
            phase('native_provider_waiting', case=case)
            content = 'Controlled transport response; not Codex inference.'
        elif BOOT.get('nativeStreamProbe') and case in {'nativestreama', 'nativestreamb'}:
            phase('native_provider_waiting', case=case)
            deadline = time.monotonic() + 90
            while case not in RELEASED and time.monotonic() < deadline:
                time.sleep(.02)
            content = 'Controlled native original-profile answer ' + ('A' if case.endswith('a') else 'B')
        elif BOOT.get('nativeGrillProbe') and case == 'nativegrill':
            content = json.dumps({'grillQuestion': {'topicId': 'audience', 'topicLabel': 'Audience',
                'prompt': 'Who will use the browser?', 'options': ['Individuals', 'Teams', 'Both']}})
        elif BOOT.get('nativeGrillProbe') and case == 'nativegrillfallback':
            content = 'Controlled manual clarification fallback.'
        elif case == "conversation":
            content = json.dumps({"message": "Controlled independent conversation continues."})
        elif case in {'profilechat', 'profilerun'}:
            content = 'Controlled confirmed-profile task completed.'
        elif case == "chat":
            content = "Controlled delegated work chat completed."
        elif tools == 0:
            call = ("independent_browser_navigate", {"url": ORIGIN + "/page"})
        elif tools == 1:
            if case in {"pause", "stop", "revoke", "lost", "remove", "nativebrowser"}:
                phase("provider_waiting", case=case)
                deadline = time.monotonic() + 60
                while case not in RELEASED and time.monotonic() < deadline:
                    time.sleep(0.05)
            call = ("independent_browser_read", {"selector": "h1"})
        elif tools == 2 and case in {"complete", "pause"}:
            call = ("independent_browser_click", {"selector": "#mutate"})
        else:
            if case == 'pause':
                phase('provider_after_click', case=case)
                deadline = time.monotonic() + 30
                while 'pause_complete' not in RELEASED and time.monotonic() < deadline:
                    time.sleep(0.05)
            content = "Controlled local browser task completed."
        if case == 'nativebrowser' and call:
            call = ('browser_navigate' if tools == 0 else 'browser_snapshot', call[1])
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        base = {"id": "controlled-pipeline-response", "object": "chat.completion.chunk", "created": 1, "model": "pipeline-model"}
        delta = {"role": "assistant", "content": content} if content is not None else {"role": "assistant", "tool_calls": [
            {"index": 0, "id": "controlled-tool-" + str(COUNTS["providerCalls"]), "type": "function", "function": {"name": call[0], "arguments": json.dumps(call[1])}}]}
        try:
            for chunk in ({**base, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]},
                          {**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop" if content is not None else "tool_calls"}],
                           "usage": {"prompt_tokens": 8, "completion_tokens": 4, "total_tokens": 12}}):
                self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
            self.wfile.write(b"data: [DONE]\n\n"); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            phase("cancelled_provider_socket", case=case)


SERVER = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
SERVER.daemon_threads = True
ORIGIN = "http://127.0.0.1:" + str(SERVER.server_port)
threading.Thread(target=SERVER.serve_forever, daemon=True).start()
SECOND_SERVER = ThreadingHTTPServer(("127.0.0.1", 0), Fixture) if BOOT.get('nativeStreamProbe') else None
if SECOND_SERVER is not None:
    SECOND_SERVER.daemon_threads = True
    threading.Thread(target=SECOND_SERVER.serve_forever, daemon=True).start()
import yaml
for name, profile_home in (("A", HOME), ("B", HOME / "profiles" / "other")):
    # Unknown accounts intentionally share one admission lane per origin.
    # Concurrent-profile transport requires actually distinct local origins.
    fixture_key = "synthetic-controlled-pipeline-" + name
    provider_origin = "http://127.0.0.1:" + str(SECOND_SERVER.server_port) if name == "B" and SECOND_SERVER is not None else ORIGIN
    workspace = profile_home / "workspace"
    workspace.mkdir(parents=True)
    (profile_home / ".env").write_text(f"HTTP_PROXY={ORIGIN}\nHTTPS_PROXY={ORIGIN}\nALL_PROXY={ORIGIN}\nNO_PROXY=127.0.0.1,localhost\nSIDEKICK_CODEX_BASE_URL={ORIGIN}\n", "utf-8")
    model_provider = "openai-codex" if BOOT.get("nativeReasoningProbe") else "custom:pipeline"
    model_id = "gpt-5.3-codex" if BOOT.get("nativeReasoningProbe") else "pipeline-model"
    (profile_home / "config.yaml").write_text(yaml.safe_dump({"workspace": str(workspace),
        **({"platform_toolsets": {"cli": ["browser", "file"]}} if BOOT.get('nativeBrowserProbe') else {}),
        "model": {"provider": model_provider, "default": model_id, "base_url": provider_origin + ("" if model_provider == "openai-codex" else "/v1"), "api_key": fixture_key, "context_length": 64000},
        **({} if model_provider == "openai-codex" else {"custom_providers": [{"name": "pipeline", "base_url": provider_origin + "/v1", "api_key": fixture_key, "models": {"pipeline-model": {"context_length": 64000}}}]})}), "utf-8")
    state = profile_home / ("state/webui" if name == "A" else "webui_state")
    state.mkdir(parents=True)
    (state / "workspaces.json").write_text(json.dumps([{"path": str(workspace), "name": "Controlled " + name}]), "utf-8")

if BOOT.get("nativeReasoningProbe"):
    (HOME / "auth.json").write_text(json.dumps({"version": 1, "providers": {"openai-codex": {
        "tokens": {"access_token": "controlled-loopback-only", "refresh_token": "controlled-no-refresh"},
        "auth_mode": "chatgpt"}}}), "utf-8")

# API-process outbound networking is explicitly limited. Model workers have
# their own immutable local endpoints and a deny proxy in their profile env.
def audit(event, args):
    if event == "socket.getaddrinfo" and args[0] not in {"127.0.0.1", "localhost", "::1", None}:
        raise PermissionError("controlled_pipeline_dns_not_local")
    if event == "socket.connect":
        address = args[1]
        if isinstance(address, tuple) and address[0] not in {"127.0.0.1", "localhost", "::1"}:
            raise PermissionError("controlled_pipeline_network_not_local")
sys.addaudithook(audit)

from fastapi import FastAPI
from web.api import independent, profiles
from web.api.helpers import get_profile_cookie
import uvicorn

from runtime.independent.worker_host import WorkerHost
class ObservedHandle:
    """Read-only protocol instrumentation; no fixture result or broker shortcut."""
    def __init__(self, handle):
        self.handle = handle
    def __getattr__(self, name):
        return getattr(self.handle, name)
    def read_event(self, *args, **kwargs):
        value = self.handle.read_event(*args, **kwargs)
        if value and value.get('kind') == 'error':
            phase('native_worker_error', **{key: value[key] for key in ('code', 'errorType', 'errorSite', 'causeType') if key in value})
        return value
class ObservedWorker(WorkerHost):
    def start(self, **kwargs):
        return ObservedHandle(super().start(**kwargs))

APP = FastAPI()
APP.include_router(independent.router)
from web.api.fastapi_bridge import dispatch_route
APP.add_api_route('/api/workspaces/remove', dispatch_route, methods=['POST'])
if BOOT.get('nativeStreamProbe'):
    # Use the actual legacy/FastAPI bridge for normal chat start, saved session,
    # native read-context, status and SSE. No stream registry fixture shortcut.
    APP.add_api_route('/api/{remaining_path:path}', dispatch_route, methods=['GET', 'POST'])
    # Observe the real isolated engine without replacing its entry or policy.
    # Only stack locations are retained; faulthandler never prints local values.
    import subprocess as diagnostic_subprocess
    original_popen = diagnostic_subprocess.Popen
    def native_diagnostic_popen(command, *args, **kwargs):
        if (isinstance(command, (list, tuple)) and len(command) == 8
                and list(command[1:5]) == ['-I', '-B', '-u', '-c']
                and command[7] == 'runtime.independent.native_chat_worker'):
            command = list(command)
            trace_file = TEMP / ('native-stack-' + uuid.uuid4().hex + '.txt')
            command[5] = ("import faulthandler;_controlled_trace_handle=open("
                          + repr(str(trace_file)) + ",'w',encoding='utf-8');"
                          "faulthandler.dump_traceback_later(12,file=_controlled_trace_handle);" + command[5])
        return original_popen(command, *args, **kwargs)
    if BOOT.get('nativeDiagnosticStacks'):
        diagnostic_subprocess.Popen = native_diagnostic_popen
    from web.api import native_chats as observed_native_chats
    native_relay = observed_native_chats.relay_native_chat
    def observed_native_relay(*args, **kwargs):
        actual_rpc = kwargs.get('rpc_handler')
        if actual_rpc is not None:
            def observed_rpc(context, method, payload):
                try:
                    return actual_rpc(context, method, payload)
                except Exception as error:
                    trace = error.__traceback__
                    while trace and trace.tb_next: trace = trace.tb_next
                    phase('native_rpc_denied', method=method, errorType=type(error).__name__,
                          code=getattr(error, 'code', None),
                          site=(Path(trace.tb_frame.f_code.co_filename).name + ':' + str(trace.tb_lineno)) if trace else None)
                    raise
            kwargs['rpc_handler'] = observed_rpc
        context, turn_args = args[0], args[1]
        phase('native_turn_argument_binding', argumentCount=len(turn_args),
              sessionMatches=bool(turn_args and turn_args[0] == context.session_id),
              workspaceExact=len(turn_args) > 3 and turn_args[3] == context.workspace,
              workspaceCanonical=len(turn_args) > 3 and Path(turn_args[3]).resolve() == Path(context.workspace).resolve(),
              workspaceSlashes=str(turn_args[3]).count('/') if len(turn_args) > 3 else None,
              contextSlashes=context.workspace.count('/'),
              keywordTypes={name: type(value).__name__ for name, value in args[2].items()},
              streamMatches=len(turn_args) > 4 and turn_args[4] == context.stream_id)
        native_put = args[3]
        def observed_put(event, data):
            if event in {'worker_ready', 'worker_fault', 'worker_finished', 'error', 'apperror', 'done', 'stream_end'}:
                values = data if isinstance(data, dict) else {}
                phase('native_chat_actual_event', event=event,
                      **{name: values[name] for name in ('stage', 'errorType', 'errorCode', 'processExited') if name in values},
                      **({'controlledErrorType': str(values.get('type', ''))[:128],
                          'controlledErrorMessage': str(values.get('message', ''))[:500]} if event == 'apperror' else {}))
            return native_put(event, data)
        args = (*args[:3], observed_put, *args[4:])
        try:
            return native_relay(*args, **kwargs)
        except Exception as error:
            trace = error.__traceback__
            while trace and trace.tb_next:
                trace = trace.tb_next
            cause_trace = error.__cause__.__traceback__ if error.__cause__ else None
            while cause_trace and cause_trace.tb_next:
                cause_trace = cause_trace.tb_next
            phase('native_chat_relay_fault', errorType=type(error).__name__,
                  errorSite=(Path(trace.tb_frame.f_code.co_filename).name + ':' + str(trace.tb_lineno)) if trace else 'unknown',
                  causeType=type(error.__cause__).__name__ if error.__cause__ else None,
                  causeSite=(Path(cause_trace.tb_frame.f_code.co_filename).name + ':' + str(cause_trace.tb_lineno)) if cause_trace else None)
            raise
    observed_native_chats.relay_native_chat = observed_native_relay
@APP.middleware("http")
async def profile_context(request, call_next):
    token = profiles.set_request_profile(get_profile_cookie(request))
    try:
        response = await call_next(request)
        if BOOT.get('nativeStreamProbe') and request.url.path == '/api/chat/start' and response.status_code >= 400:
            sessions = []
            for file in TEMP.rglob('*.json'):
                try:
                    row = json.loads(file.read_text('utf-8'))
                    if isinstance(row, dict) and row.get('session_id') and row.get('space_scope'):
                        sessions.append({'relativePath': str(file.relative_to(TEMP)), 'sessionId': row['session_id'],
                            'profile': row.get('profile'), 'workspace': row.get('workspace'), 'scope': row['space_scope']})
                except (OSError, ValueError):
                    pass
            expected = []
            from runtime.independent.scope import ScopeResolver
            for store in tuple(independent.hub()._stores.values()):
                resolver = ScopeResolver(store, profiles_provider=independent.hub().profiles)
                for binding in store.list_bindings():
                    resolved = resolver.resolve(binding.scope)
                    expected.append({'scope': binding.scope.model_dump(mode='json', by_alias=True),
                        'sessionsDirectory': str(Path(resolved.space.sessions_dir).relative_to(TEMP)),
                        'directoryExists': Path(resolved.space.sessions_dir).is_dir()})
            phase('native_start_storage_diagnostic', status=response.status_code, actualSessionRows=sessions, expected=expected)
        for manager, _assistant in tuple(independent._services.values()):
            if manager.worker_factory is WorkerHost:
                manager.worker_factory = ObservedWorker
                native_call = manager.run_interactive
                def observed_call(*args, _native=native_call, **kwargs):
                    try:
                        return _native(*args, **kwargs)
                    except Exception as error:
                        trace = error.__traceback__
                        while trace and trace.tb_next:
                            trace = trace.tb_next
                        phase('native_manager_error', errorType=type(error).__name__, code=getattr(error, 'code', None),
                              errorSite=(Path(trace.tb_frame.f_code.co_filename).name + ':' + str(trace.tb_lineno)) if trace else 'unknown')
                        raise
                manager.run_interactive = observed_call
                native_validate = manager.connection_validator
                def observed_validate(context, _native=native_validate, _manager=manager):
                    result = _native(context)
                    if not result:
                        from runtime.independent.capabilities import evidence_digest
                        cache = _manager._capability_evidence.get(context.scope.key)
                        rows = [] if cache is None else [row for entry in cache['catalog']['entries'] for row in entry['connections']]
                        selected = [row for row in rows if row['connectionId'] == 'provider:' + context.provider.provider]
                        auth_path = Path(context.resolved_profile_home) / 'auth.json'
                        auth = json.loads(auth_path.read_text('utf-8')) if auth_path.is_file() else {}
                        phase('native_connection_denied', evidencePresent=cache is not None,
                              evidenceCurrent=bool(cache and evidence_digest(Path(context.resolved_profile_home)) == cache['digest']),
                              rowStatus=[row['status'] for row in selected], rowAdapter=[row['adapterAvailable'] for row in selected],
                              rowRevision=[row['revision'] for row in selected], capturedRevision=[row.connection_revision for row in context.connection_bindings],
                              changedFiles=[name for name, value in getattr(_manager, '_pipeline_files', {}).items()
                                            if ((Path(context.resolved_profile_home) / name).read_bytes() if (Path(context.resolved_profile_home) / name).is_file() else None) != value],
                              authFields=sorted(auth), authPoolCounts={key: len(value) if isinstance(value, list) else None for key, value in (auth.get('credential_pool') or {}).items()})
                    return result
                manager.connection_validator = observed_validate
            if request.url.path.endswith('/bindings'):
                manager._pipeline_files = {name: (manager.store.profile_home / name).read_bytes() if (manager.store.profile_home / name).is_file() else None
                                           for name in ('config.yaml', '.env', 'auth.json', 'auth/google_oauth.json', '.claude/.credentials.json')}
        if request.url.path.startswith('/api/independent/'):
            phase('api_request', operation=request.url.path.rsplit('/', 1)[-1], status=response.status_code)
        if request.url.path == '/api/workspaces/remove':
            # Observe the real persistent store after the production legacy
            # bridge; this is diagnostic evidence, never a replacement broker.
            COUNTS['removalEvidence'] = [
                {'bindings': [{'scope': row.scope.model_dump(mode='json', by_alias=True),
                               'tombstoned': row.tombstoned_at is not None}
                              for row in manager.store.list_bindings(include_tombstoned=True)],
                 'runs': [{'runId': row.run_id, 'state': row.state}
                          for row in manager.store.list_runs()]}
                for manager, _assistant in tuple(independent._services.values())]
            phase('workspace_removal_response', status=response.status_code)
        return response
    finally:
        profiles.clear_request_profile(token)

@APP.get("/health")
def health():
    return {"ok": True}

@APP.on_event("startup")
def startup():
    independent.startup()

@APP.on_event("shutdown")
def shutdown():
    independent.shutdown()
    SERVER.shutdown(); SERVER.server_close()
    if SECOND_SERVER is not None:
        SECOND_SERVER.shutdown(); SECOND_SERVER.server_close()
    phase("backend_shutdown")

import socket
listener = socket.socket()
listener.bind(("127.0.0.1", 0)); listener.listen(128)
configuration = uvicorn.Config(APP, log_level="error", access_log=False)
server = uvicorn.Server(configuration)
def control():
    while sys.stdin.readline():
        server.should_exit = True
        return
threading.Thread(target=control, daemon=True).start()
(TEMP / "ready.json").write_text(json.dumps({"apiUrl": "http://127.0.0.1:" + str(listener.getsockname()[1]), "origin": ORIGIN,
    "workspaceA": str(HOME / "workspace"), "workspaceB": str(HOME / "profiles" / "other" / "workspace")}), "utf-8")
phase("backend_ready", python=sys.version.split()[0])
server.run(sockets=[listener])
