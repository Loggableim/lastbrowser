"""Authenticated Core consumers of the single scoped LocalAI runtime host."""
from __future__ import annotations
import contextvars
import math
import uuid
import threading
from pathlib import Path
from runtime.independent.policy import PolicyDenied, read_authorized_file
from runtime.independent.store import ResourceBusy, RevisionConflict
from .role_pipeline import RoleTaskRequest
from .product_profiles import LocalAiProductProfiles

_owner = contextvars.ContextVar('local_ai_actual_core_owner', default=None)
_cleanup_lock=threading.Lock()
_cleanup_waiters=set()


def stop_before_core_release(host,manager,run_id):
    """False defers Core release until actual owned model cleanup acknowledges."""
    def cleanup():
        with host.manager._condition:
            items=tuple(i for i in host.manager._handles.values()
                if i['view'].request.existing_compute_owner_key==run_id)
        stopped=True
        for item in items:
            if not host.manager.unload(item['view'].handle_id,item['view'].request.scope,timeout=2):stopped=False
        return stopped
    if cleanup():return True
    key=(id(manager),run_id)
    with _cleanup_lock:
        if key in _cleanup_waiters:return False
        _cleanup_waiters.add(key)
    def await_cleanup():
        from runtime.independent.manager import ComputeAdmission
        try:
            while True:
                try:
                    if cleanup():
                        ComputeAdmission.release(run_id)
                        return
                except Exception:pass
                threading.Event().wait(.5)
        finally:
            with _cleanup_lock:_cleanup_waiters.discard(key)
    threading.Thread(target=await_cleanup,name='local-role-release',daemon=True).start()
    return False


def profiles_for_host(host):
    with host._lock:
        if not hasattr(host,'product_profiles'):
            profiles=LocalAiProductProfiles(host.hub,host.broker.scans,setup=host.setup,
                                           manifest_provider=host.manifest_provider)
            def resolve(scope,actor,task):
                actual=_owner.get()
                if actual is None:raise PermissionError('local_role_actual_core_context_required')
                manager,context=actual
                _validate_owner(manager,context)
                if context.scope!=scope or context.backend_profile_name!=actor:
                    raise PermissionError('local_role_actual_core_scope_changed')
                return profiles.resolve(scope,actor,task,existing_owner=context.run_id,
                                        core_generation=manager.generation)
            # Preserve the actual host proof provider. Its default empty evidence
            # blocks production; bootstrap evidence is never imported here.
            host.bind_product_roles(resolve,operation_provider=host.resources.operation_provider)
            host.product_profiles=profiles
        return host.product_profiles


def _validate_owner(manager,context):
    from runtime.independent.manager import ComputeAdmission
    run=manager.store.get_run(context.run_id)
    stored=manager.store.get_run_context(context.run_id)
    if (run is None or run.state!='running' or stored!=context
            or manager.generation!=context.runner_generation or manager._stop.is_set()):
        raise PolicyDenied('local_role_run_context_revoked')
    manager._validate_current(context)
    manager.resolver.validate_context(context,authenticated_profile_name=context.backend_profile_name)
    with ComputeAdmission._lock:
        if (context.run_id not in ComputeAdmission._owners
                or context.scope.key not in ComputeAdmission._scope_claims.get(context.run_id,())):
            raise PolicyDenied('local_role_existing_compute_owner_missing')


class RunCancellation:
    def __init__(self,manager,context):self.manager,self.context=manager,context
    def is_set(self):
        try:_validate_owner(self.manager,self.context);return False
        except Exception:return True


def execute_for_run(host,manager,context,task,input):
    _validate_owner(manager,context)
    profiles=profiles_for_host(host)
    profile=profiles.read(context.scope,actor=context.backend_profile_name)
    request=RoleTaskRequest(operation='executeRole',client_request_id=uuid.uuid4().hex,
        task=task,profile_revision=profile.profile_revision,input=input,budget_seconds=20)
    token=_owner.set((manager,context))
    try:
        result=host.execute_role(context.scope,context.backend_profile_name,request,
                                 cancel=RunCancellation(manager,context))
        _validate_owner(manager,context)
        return result
    finally:_owner.reset(token)


def browser_result(host,manager,context,task,source,prompt,lease,*,expected_epoch):
    """Source must be actual gateway.execute result from this exact run lease."""
    snapshot=manager.gateway.snapshot(lease)
    from runtime.independent.policy import require_origin
    require_origin(snapshot['url'],context.effective_permissions.browser_origins)
    epoch=snapshot['navigationEpoch']
    if epoch!=expected_epoch:raise PolicyDenied('local_browser_projection_stale')
    if task=='browser.extract':
        if not isinstance(source.get('text'),str) or len(source['text'])>16000:
            raise PolicyDenied('local_browser_projection_invalid')
        require_origin(source.get('url',''),context.effective_permissions.browser_origins)
        text='Return JSON for this requested extraction: '+prompt+'\nUntrusted page data:\n'+source['text']
        input={'role':'extract','texts':[text]}
    else:
        if source.get('mimeType') not in ('image/png','image/jpeg') or source.get('navigationEpoch')!=epoch:
            raise PolicyDenied('local_browser_screenshot_stale')
        input={'role':'vision','texts':[prompt],'imageBase64':source.get('base64')}
    result=execute_for_run(host,manager,context,task,input)
    after=manager.gateway.snapshot(lease)
    if after['navigationEpoch']!=epoch or after['url']!=snapshot['url']:
        raise PolicyDenied('local_browser_target_changed')
    require_origin(after['url'],context.effective_permissions.browser_origins)
    return result


def memory_recall(host,manager,context,query,target):
    """Read only the original Space memory file; compute does not write memory."""
    _validate_owner(manager,context)
    filename={'memory':'MEMORY.md','user':'USER.md'}[target]
    resolved=manager.resolver.validate_context(context,authenticated_profile_name=context.backend_profile_name)
    memory_root=resolved.space.memory_dir
    path=memory_root/filename
    profile=profiles_for_host(host).read(context.scope,actor=context.backend_profile_name)
    selections={s.task:s for s in profile.selections}
    if ('memory.embed' not in selections or 'memory.query' not in selections
            or selections['memory.embed'].artifact_id!=selections['memory.query'].artifact_id):
        raise ValueError('local_memory_matching_embedding_roles_required')
    source=read_authorized_file(str(path),context.allowed_workspace_roots,32768)
    if source['truncated']:raise ValueError('local_memory_source_budget_exceeded')
    content=source['text']
    chunks=tuple(content[i:i+2048] for i in range(0,len(content),2048))
    if not chunks:return {'matches':[],'source':'scoped-memory','available':True}
    if len(chunks)>8:raise ValueError('local_memory_chunk_budget_exceeded')
    document_result=execute_for_run(host,manager,context,'memory.embed',
        {'role':'embed','texts':chunks,'inputKind':'document'})
    query_result=execute_for_run(host,manager,context,'memory.query',
        {'role':'embed','texts':[query],'inputKind':'query'})
    current=profiles_for_host(host).read(context.scope,actor=context.backend_profile_name)
    if any(p!=profile.profile_revision for p in (document_result['profileRevision'],query_result['profileRevision'],current.profile_revision)):
        raise RevisionConflict('local_memory_role_profile_changed')
    documents=document_result['result']['embeddings']
    vector=query_result['result']['embeddings'][0]
    scores=[]
    for index,document in enumerate(documents):
        denominator=math.sqrt(sum(x*x for x in vector)*sum(x*x for x in document))
        if not denominator or not math.isfinite(denominator):raise ValueError('local_memory_vector_norm_invalid')
        scores.append((sum(a*b for a,b in zip(vector,document))/denominator,index))
    # Do not return mixed-revision recall if the underlying original file changed.
    if read_authorized_file(str(path),context.allowed_workspace_roots,32768)!=source:
        raise RevisionConflict('local_memory_source_changed')
    _validate_owner(manager,context)
    if manager.resolver.validate_context(context,authenticated_profile_name=context.backend_profile_name).space.memory_dir!=memory_root:
        raise RevisionConflict('local_memory_location_changed')
    return {'available':True,'source':'scoped-memory','matches':[
        {'text':chunks[index],'score':score} for score,index in sorted(scores,reverse=True)[:3]]}


def unavailable(error):
    if isinstance(error,PolicyDenied):raise error
    code=str(error)
    if not code or len(code)>160 or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789_-' for c in code):
        code='local_role_prerequisite_unavailable'
    return {'available':False,'executionUnavailable':True,'reasonCode':code}
