"""Opted-in store model under the existing native writer/Stop protocol.

Only an exact standard device benchmark may qualify conservative simple AUTO
text turns. Goals, attachments, tools, governance and Teamwork retain existing
paths. No preference is changed and failed local turns are never re-sent.
"""
import threading
from .model_store import _device_identity

class StoreNativeChatHost:
    def __init__(self,store):self.store=store

    def short_chat_capability(self,scope,actor):
        store=self.store
        if scope!=store.scope:return {'state':'unavailable','reasonCode':'store_scope_mismatch'}
        identity=store.state.get('active')
        if identity not in store.entries:return {'state':'unavailable','reasonCode':'store_model_not_activated'}
        entry=store.entries[identity]
        if not store.eligibility(entry)['allowed']:return {'state':'unavailable','reasonCode':'store_hardware_scan_required'}
        proof=next((r for r in reversed(store.history) if r['modelId']==identity and r['origin']=='local'
            and r['artifactSha256']==entry['artifact']['sha256'] and r['deviceFingerprint']==_device_identity(store.device)
            and r['technicalPass'] and r['mode']=='standard' and r['sampleCount']==48
            and r['counts']['content']==48 and r['counts']['format']==48 and not r['unsafeToolOrSecurityFailure']
            and r.get('peakObservedRamBytes') is not None and r['peakObservedRamBytes']<=entry['recommendedRamBytes']
            and r['medianResponseMs']<=25000),None)
        if not proof:return {'state':'unavailable','reasonCode':'store_standard_quality_memory_slo_evidence_required'}
        return {'state':'ready','artifactId':identity,'artifactRevision':entry['revision'],
            'profileRevision':proof['sha256'],'qualityEvidenceRef':proof['id'],'memoryEvidenceRef':proof['id'],
            'adapterRef':'store-native-simple-text-v1','limits':{'contextTokens':4096,'maxOutputTokens':768,'maxSeconds':60,'parallelRequests':1}}

    def execute_native_short_chat(self,context,prompt,*,cancel):
        from runtime.independent.native_chat_protocol import verify_native_context
        from .auto_router import classify_task
        if context.scope!=self.store.scope or context.selection_mode!='auto' or classify_task(prompt)!='simple':raise PermissionError('store_native_context_invalid')
        verify_native_context(context)
        capability=self.short_chat_capability(context.scope,context.profile_name)
        if capability['state']!='ready':raise ValueError(capability['reasonCode'])
        stopped=threading.Event();revoked=threading.Event()
        def watch():
            while not stopped.wait(.05):
                try:
                    verify_native_context(context)
                    if cancel.is_set() or self.store.state.get('active')!=capability['artifactId']:raise ValueError('store_native_cancelled')
                except Exception:revoked.set();self.store.stop_chat();return
        watcher=threading.Thread(target=watch,daemon=True);watcher.start()
        try:
            if cancel.is_set() or revoked.is_set():raise RuntimeError('store_native_cancelled')
            answer=self.store.chat(prompt,cancel=revoked)
            verify_native_context(context)
            if cancel.is_set() or revoked.is_set():raise RuntimeError('store_native_cancelled')
            return {**capability,**answer}
        finally:stopped.set();watcher.join(2)

def native_store_host(scope,actor):
    from web.api import independent as api
    from .model_store import get_store
    api.hub().by_scope(scope,actor)
    if api._local_ai_cache_root is None:return None
    return StoreNativeChatHost(get_store(api._local_ai_cache_root,scope,api.Path(__file__).resolve().parents[4]))
