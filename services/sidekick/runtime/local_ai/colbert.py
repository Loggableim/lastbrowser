"""Bounded native token-matrix adapter, enabled only by host-pinned token policy."""
import math
from typing import Annotated
from pydantic import Field
from runtime.independent.contracts import Contract, Ref
from .contracts import Sha256

class ColbertTokenPolicy(Contract):
    artifact_id: Ref
    artifact_revision: Ref
    configuration_sha256: Sha256
    pad_token_id: Annotated[int,Field(ge=0,le=262143)]
    skip_token_ids: tuple[Annotated[int,Field(ge=0,le=262143)], ...]
    query_length: Annotated[int,Field(ge=1,le=32)] = 32
    document_length: Annotated[int,Field(ge=1,le=512)] = 512

def execute_colbert(session, adapter, request, policy:ColbertTokenPolicy, *, configuration_verified):
    if request.role!='retrieve' or request.input_kind not in ('query','document'):
        raise ValueError('colbert_input_kind_required')
    if adapter.artifact_id!=policy.artifact_id or adapter.artifact_revision!=policy.artifact_revision:
        raise ValueError('colbert_policy_artifact_binding_changed')
    if len(policy.skip_token_ids)>4096 or configuration_verified(policy) is not True:
        raise PermissionError('colbert_pinned_token_configuration_unverified')
    if adapter.endpoint!='/embedding' or adapter.pooling!='none': raise ValueError('colbert_native_route_required')
    result=[]; skip=set(policy.skip_token_ids)
    for text in request.texts:
        query=request.input_kind=='query'; prefix=adapter.query_prefix if query else adapter.document_prefix
        tokens=session.call('/tokenize',{'content':prefix+text,'add_special':True}).get('tokens')
        if not isinstance(tokens,list) or any(type(t) is not int or not 0<=t<=262143 for t in tokens): raise ValueError('colbert_tokenizer_shape_invalid')
        limit=policy.query_length if query else policy.document_length
        # Reject oversized queries; document truncation is part of the pinned adapter.
        if query and len(tokens)>limit: raise ValueError('colbert_query_token_budget_exceeded')
        tokens=tokens+[policy.pad_token_id]*(limit-len(tokens)) if query else tokens[:limit]
        values=session.call('/embedding',{'content':tokens,'embd_normalize':-1})
        if not isinstance(values,list) or len(values)!=1 or not isinstance(values[0],dict): raise ValueError('colbert_native_response_shape_invalid')
        matrix=values[0].get('embedding')
        if not isinstance(matrix,list) or len(matrix)!=len(tokens): raise ValueError('colbert_token_matrix_alignment_invalid')
        normalized=[]
        for token,vector in zip(tokens,matrix):
            if not isinstance(vector,list) or len(vector)!=128 or any(type(x) not in (int,float) or not math.isfinite(x) for x in vector): raise ValueError('colbert_vector_shape_invalid')
            if not query and token in skip: continue
            norm=math.sqrt(sum(x*x for x in vector))
            if not math.isfinite(norm) or norm==0: raise ValueError('colbert_zero_or_overflow_vector')
            normalized.append([x/norm for x in vector])
        if not normalized: raise ValueError('colbert_document_empty_after_filter')
        result.append(normalized)
    return {'role':'retrieve','embeddings':result}
