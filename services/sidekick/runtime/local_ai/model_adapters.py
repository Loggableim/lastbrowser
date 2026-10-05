"""Exact catalog-bound CPU role plans. Prepared is never operation-verified."""
from typing import Literal
from runtime.independent.contracts import Contract, Ref, digest_json
from .runtime_probe import RuntimeRoleAdapter
from .registry import liquid_catalog
from .runtime_bundle import SOURCE_REVISION

class ModelAdapterPlan(Contract):
    artifact_id: Ref
    artifact_revision: Ref
    role: Ref
    state: Literal['prepared', 'blocked']
    adapter: RuntimeRoleAdapter | None = None
    reason_codes: tuple[Ref, ...] = ()
    operation_verified: Literal[False] = False
    available: Literal[False] = False

def model_adapter_plan(artifact, role, manifest):
    pinned = next((a for a in liquid_catalog().artifacts if a.artifact_id == artifact.artifact_id), None)
    common = dict(artifact_id=artifact.artifact_id, artifact_revision=artifact.revision, role=role)
    def blocked(reason): return ModelAdapterPlan(**common, state='blocked', reason_codes=(reason,))
    if pinned is None or digest_json(pinned) != digest_json(artifact): return blocked('model_adapter_catalog_binding_changed')
    if role not in artifact.roles: return blocked('model_adapter_role_not_declared')
    if manifest.source_revision != SOURCE_REVISION or manifest.build_ref != 'llama-cpp-b11377-win-cpu-x64':
        return blocked('model_adapter_runtime_build_unverified')
    if role == 'agent': return blocked('agent_64k_tool_adapter_unverified')
    if role == 'chat':
        if (artifact.artifact_id != 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'
                or artifact.revision != '9969000761ce34de907bf20017cbfc3d52d6eaf9'):
            return blocked('short_chat_model_operation_unverified')
        return ModelAdapterPlan(**common, state='prepared', adapter=RuntimeRoleAdapter(
            role='chat', artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
            adapter_ref='lfm-b11377-chat-' + digest_json(artifact)[:24],
            evidence_ref='controlled-short-chat-benchmark-required',endpoint='/v1/chat/completions',max_input_tokens=512))
    if role == 'encoder': return blocked('encoder_task_head_missing')
    if role == 'retrieve':
        adapter=RuntimeRoleAdapter(role=role,artifact_id=artifact.artifact_id,artifact_revision=artifact.revision,
            adapter_ref='lfm-b11377-colbert-' + digest_json(artifact)[:24],evidence_ref='colbert-model-card-not-operation-proof',
            endpoint='/embedding',pooling='none',query_prefix='[Q] ',document_prefix='[D] ',max_input_tokens=512)
        return ModelAdapterPlan(**common,state='blocked',adapter=adapter,reason_codes=('colbert_pinned_tokenizer_padding_skiplist_missing',))
    if role == 'vision' and (not artifact.requires_projector or not any(f.kind == 'projector' for f in artifact.files)):
        return blocked('vision_projector_missing')
    args = dict(role=role, artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
        adapter_ref='lfm-b11377-' + role + '-' + digest_json(artifact)[:24], evidence_ref='model-card-observation-2026-10-04-not-operation-proof',
        endpoint='/v1/embeddings' if role == 'embed' else '/v1/chat/completions', max_input_tokens=512 if role == 'embed' else None)
    if role == 'embed': args.update(pooling='cls', query_prefix='query: ', document_prefix='document: ')
    return ModelAdapterPlan(**common,state='prepared',adapter=RuntimeRoleAdapter(**args))

def bind_model_manifest(manifest, artifact, role):
    plan = model_adapter_plan(artifact, role, manifest)
    if plan.state != 'prepared': raise ValueError(plan.reason_codes[0])
    return manifest.model_copy(update={'role_adapters': (plan.adapter,)})

def adapter_binding_valid(adapter, artifact):
    return (adapter.artifact_id is None or adapter.artifact_id == artifact.artifact_id) and (
        adapter.artifact_revision is None or adapter.artifact_revision == artifact.revision)

def select_bound_manifest(manifests, request, *, fixture_only=False):
    matches=[]
    for manifest in manifests:
        if manifest.build_ref!=request.runtime_build_ref: continue
        if any(a.role==request.role and a.artifact_id==request.artifact_id and a.artifact_revision==request.artifact_revision
            for a in manifest.role_adapters): matches.append(manifest)
        elif fixture_only and not manifest.role_adapters: matches.append(manifest)
    if len(matches)!=1: raise ValueError('model_runtime_adapter_manifest_ambiguous_or_missing')
    return matches[0]
