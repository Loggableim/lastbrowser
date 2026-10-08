"""Own loopback SSE measurement; no providers, proxies or inherited credentials."""
import json
import time
from urllib.request import Request, ProxyHandler, HTTPRedirectHandler, build_opener

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args):raise ValueError('local_runtime_redirect_rejected')

def stream_answer(session,payload,cancel,timeout):
    start=time.monotonic();first=None;text=[];characters=0;usage={};timings={};ended=False
    request=Request(f'http://127.0.0.1:{session.port}/v1/chat/completions',
        data=json.dumps({**payload,'stream':True,'stream_options':{'include_usage':True}}).encode(),
        headers={'Authorization':'Bearer '+session.token,'Content-Type':'application/json'},method='POST')
    with build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=min(timeout,20)) as response:
        if response.status!=200:raise ValueError('local_runtime_response_rejected')
        while True:
            if cancel.is_set():raise RuntimeError('local_inference_cancelled')
            if time.monotonic()-start>timeout:raise TimeoutError('local_request_timeout')
            line=response.readline(65537)
            if len(line)>65536:raise ValueError('local_stream_event_limit')
            if not line:break
            if not line.startswith(b'data:'):continue
            data=line[5:].strip()
            if data==b'[DONE]':ended=True;break
            event=json.loads(data)
            if not isinstance(event,dict):raise ValueError('local_stream_event_invalid')
            usage=event.get('usage') or usage;timings=event.get('timings') or timings
            for choice in event.get('choices',[]):
                content=(choice.get('delta') or {}).get('content')
                if content:
                    if not isinstance(content,str):raise ValueError('local_stream_content_invalid')
                    if first is None:first=(time.monotonic()-start)*1000
                    characters+=len(content)
                    if characters>65536:raise ValueError('local_stream_output_limit')
                    text.append(content)
    if not ended:raise ValueError('local_stream_completion_missing')
    return {'text':''.join(text),'elapsedMs':(time.monotonic()-start)*1000,'firstVisibleTokenMs':first,
        'usage':usage,'timings':timings}

class MemorySampler:
    """Observed RSS only; sampling can miss peaks. Never claims GPU measurement."""
    def __init__(self,pid):
        import threading
        self.stop=threading.Event();self.peak=None;self.pid=pid
        self.thread=threading.Thread(target=self._run,daemon=True);self.thread.start()
    def _run(self):
        try:
            import psutil
            process=psutil.Process(self.pid)
            while not self.stop.is_set():
                value=process.memory_info().rss
                self.peak=max(self.peak or 0,value)
                self.stop.wait(.1)
        except (ImportError,OSError):return
        except Exception:return
    def close(self):
        self.stop.set();self.thread.join(1)
