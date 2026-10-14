"""Direct managed-Store Quickchat: private binding, bounded text, no agent."""
import json
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import pytest

from runtime.independent.native_provider_capture import NativeLocalRuntimeCapture
from runtime.independent.policy import PolicyDenied
from runtime.local_ai import store_provider_host
from runtime.quickchat_direct import _fit_local_quickchat, _local_quickchat_runtime, QuickAnswerBot, run_quickchat_direct


def capture():
    return NativeLocalRuntimeCapture(artifact_id='publisher/model',artifact_revision='revision',bundle_digest='a'*64,
        backend='cpu',runtime_build='build',runtime_digest='b'*64,evidence_ref='receipt',tool_calling_qualified=True,
        context_tokens=4096,max_output_tokens=768)


@contextmanager
def private_binding(monkeypatch, endpoint='http://127.0.0.1:1234/v1'):
    value=capture();scope=object()
    context=SimpleNamespace(scope=scope,stream_id='turn',session_id='qa-session',profile_home='unused',
        provider_capture=SimpleNamespace(local_runtime=value,provider=SimpleNamespace(provider='local-store',model=value.artifact_id,context_length=4096)))
    secret='private-'+'controlled-loopback-credential'
    monkeypatch.setattr(store_provider_host,'_private_bridge',lambda incoming: incoming is context or (_ for _ in ()).throw(PermissionError('scope_mismatch')))
    token=store_provider_host._live_runtime.set(store_provider_host._LiveRuntime(context,value,endpoint,secret))
    try:yield context,value,secret
    finally:store_provider_host._live_runtime.reset(token)


def test_exact_private_binding_supplies_only_the_owned_runtime(monkeypatch):
    with private_binding(monkeypatch) as (context,value,secret):
        runtime,actual=_local_quickchat_runtime(context,value.artifact_id,'local-store')
        assert actual==value and runtime['base_url']=='http://127.0.0.1:1234/v1'
        assert runtime['api_key']==secret and runtime['api_mode']=='chat_completions'


@pytest.mark.parametrize('change',['scope','model','provider','context'])
def test_changed_scope_or_capture_fails_without_exposing_secret(monkeypatch,change):
    with private_binding(monkeypatch) as (context,value,secret):
        selected=context
        model=value.artifact_id;provider='local-store'
        if change=='scope':selected=SimpleNamespace(**(vars(context)|{'scope':object()}))
        elif change=='model':model='other/model'
        elif change=='provider':provider='openai'
        else:context.provider_capture.provider.context_length=8192
        with pytest.raises(PermissionError) as error:
            _local_quickchat_runtime(selected,model,provider)
        assert secret not in str(error.value) and '127.0.0.1' not in str(error.value)


def test_unbound_local_runtime_fails_closed(monkeypatch):
    token=store_provider_host._live_runtime.set(None)
    try:
        with pytest.raises(PermissionError,match='local_runtime_binding_required'):
            _local_quickchat_runtime(SimpleNamespace(),'publisher/model','local-store')
    finally:store_provider_host._live_runtime.reset(token)


def test_optional_history_and_page_are_reduced_but_user_prompt_is_verbatim():
    value=capture();prompt='Bitte diese Frage unverändert beantworten?'
    history=[{'role':'user','content':'old'*2000},{'role':'assistant','content':'answer'*1000}]
    fitted=_fit_local_quickchat('Minimal persona',history,prompt,'page'*3000,value)
    assert fitted==[{'role':'user','content':prompt}]
    assert len(history)==2


def test_small_optional_context_is_retained():
    fitted=_fit_local_quickchat('Minimal persona',[{'role':'assistant','content':'prior'}],'Question','page',capture())
    assert fitted[0]['content']=='prior' and fitted[-1]['content'].startswith('Question\n\n<untrusted_page_context>')


def test_large_current_prompt_is_rejected_not_truncated():
    with pytest.raises(PolicyDenied,match='context_budget_exceeded'):
        _fit_local_quickchat('Minimal persona',[],'界'*1400,'',capture())


def test_local_entry_never_calls_external_resolver_or_constructs_an_agent(monkeypatch):
    import runtime.independent.native_chat_protocol as protocol
    import runtime.independent.companion as companion
    import web.api.oauth as oauth
    monkeypatch.setattr(protocol,'verify_native_context',lambda context:None)
    monkeypatch.setattr(companion,'read_quickchat_companion',lambda context:{'botName':'Nova','personality':'nova'})
    monkeypatch.setattr(oauth,'resolve_runtime_provider_with_anthropic_env_lock',lambda *a,**kw:pytest.fail('External resolver called'))
    with private_binding(monkeypatch) as (context,value,secret):
        # A valid local identity reaches the conservative request budget without
        # ever entering a generic cloud resolver or constructing an agent.
        with pytest.raises(PolicyDenied,match='context_budget_exceeded'):
            run_quickchat_direct(session=SimpleNamespace(active_stream_id='turn',messages=[]),context=context,bridge=SimpleNamespace(context=context),
                model=value.artifact_id,provider='local-store',text='界'*1400,grounding_context='',attachments=[],cancel_event=threading.Event(),put=lambda *args:None,register=lambda bot:None)


def test_actual_loopback_sdk_request_has_768_output_no_tools_and_rechecks_binding(monkeypatch):
    received=[]
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
            for content,finish in [('Local answer',None),(None,'stop')]:
                event={'id':'qa','object':'chat.completion.chunk','model':'publisher/model','choices':[{'index':0,'delta':{'content':content} if content else {},'finish_reason':finish}]}
                self.wfile.write(('data: '+json.dumps(event)+'\n\n').encode())
            self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush()
    server=ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with private_binding(monkeypatch,f'http://127.0.0.1:{server.server_port}/v1') as (context,value,secret):
            import runtime.provider_client_pool as pool
            monkeypatch.setattr(pool,'create_pooled_sdk',lambda factory,kwargs,**unused:factory(**kwargs))
            bridge=SimpleNamespace(context=context,validate_selection=lambda *args,**kw:None,wrap=lambda client,**kw:client,mark_visible_delta=lambda **kw:None)
            runtime,actual=_local_quickchat_runtime(context,value.artifact_id,'local-store')
            bot=QuickAnswerBot(bridge,'local-store',value.artifact_id,runtime,threading.Event(),lambda text:None);bot.local_capture=actual
            try:
                bot.connect({});answer,_=bot.answer('Minimal persona',[{'role':'user','content':'hello'}])
                assert answer=='Local answer' and received[0]['max_tokens']==768
                assert 'tools' not in received[0] and 'functions' not in received[0]
                assert secret not in json.dumps(received)
                context.provider_capture.local_runtime=value.model_copy(update={'evidence_ref':'changed'})
                with pytest.raises(PermissionError,match='local_runtime_binding_changed'):
                    bot.answer('Minimal persona',[{'role':'user','content':'hello'}])
                assert len(received)==1
            finally:bot.client.close()
    finally:server.shutdown();server.server_close();thread.join(2)
