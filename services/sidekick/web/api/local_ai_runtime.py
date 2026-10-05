"""Private runtime leaf; trusted host derives all scope/owner/load bindings."""
from fastapi import APIRouter, Depends, HTTPException
from runtime.independent.contracts import Contract, Id, digest_json
from runtime.local_ai.contracts import Sha256
from runtime.local_ai.bootstrap import bootstrap_benchmark

class RuntimeHandleBody(Contract):
    handle_id: Id

class RuntimeBootstrapBody(Contract):
    purpose_digest: Sha256

def project_runtime_view(view):
    return {'handleId':view.handle_id,'artifactId':view.request.artifact_id,'artifactRevision':view.request.artifact_revision,
        'role':view.request.role,'state':view.state,'revision':view.revision,'available':view.available,
        'synthetic':view.synthetic,'reasonCode':view.reason_code,'coldStartMs':view.cold_start_ms}

def project_bootstrap_result(result):
    return {key:result.get(key) for key in ('evidenceRef','observedAt','coldStartMs','p95Ms','samples',
        'peakObservedResidentBytes','operationShapeVerified','synthetic','suite','operationVerified','operationProof',
        'productEvidence','qualityPassed','sloPassed','recommendationEligible','contextCapacityVerified','memoryEnvelopeVerified')}

def create_local_ai_runtime_router(manager, resolve_scope, require_main, resolve_bootstrap, private_human_action):
    router = APIRouter(prefix='/local-ai/runtime', tags=['local-ai-runtime'])
    @router.get('/inspect')
    def inspect(scope=Depends(resolve_scope), auth=Depends(require_main)):
        return {'handles': [project_runtime_view(item) for item in manager.inspect(scope)]}
    @router.get('/review')
    def review(scope=Depends(resolve_scope), auth=Depends(require_main)):
        purpose, actor = resolve_bootstrap(scope,auth)
        if purpose.load.scope != scope: raise HTTPException(403,'runtime_scope_mismatch')
        load=purpose.load
        return {'purposeDigest':digest_json(purpose),'artifactId':load.artifact_id,'artifactRevision':load.artifact_revision,
            'role':load.role,'contextTokens':load.context_tokens,'parallelRequests':load.parallel_requests,
            'budgetSeconds':purpose.budget_seconds,'ramLimitBytes':purpose.ram_limit_bytes,'runtimeBuildRef':load.runtime_build_ref}
    @router.post('/bootstrap')
    def bootstrap(body:RuntimeBootstrapBody, scope=Depends(resolve_scope), auth=Depends(require_main)):
        purpose, actor = resolve_bootstrap(scope, auth)
        if purpose.load.scope != scope: raise HTTPException(403, 'runtime_scope_mismatch')
        if body.purpose_digest != digest_json(purpose): raise HTTPException(409,'runtime_bootstrap_review_changed')
        try: return bootstrap_benchmark(manager, purpose, actor=actor, private_human_action=private_human_action)
        except PermissionError: raise HTTPException(403, 'runtime_bootstrap_not_authorized') from None
        except (ValueError, RuntimeError): raise HTTPException(409, 'runtime_bootstrap_blocked') from None
    @router.post('/unload')
    def unload(body: RuntimeHandleBody, scope=Depends(resolve_scope), auth=Depends(require_main)):
        try: return {'stopped': manager.unload(body.handle_id, scope, timeout=5)}
        except PermissionError: raise HTTPException(403, 'runtime_scope_mismatch') from None
    return router
