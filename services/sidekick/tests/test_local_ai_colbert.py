import pytest
from runtime.local_ai.colbert import ColbertTokenPolicy, execute_colbert
from runtime.local_ai.runtime_probe import RuntimeRoleAdapter
from runtime.local_ai.role_adapters import RoleRequest

class Session:
    def __init__(self): self.calls=[]
    def call(self,endpoint,payload):
        self.calls.append((endpoint,payload))
        if endpoint=='/tokenize': return {'tokens':[1,2,3]}
        return [{'embedding':[[1.0]*128 for _ in payload['content']]}]

def values(kind='query'):
    adapter=RuntimeRoleAdapter(adapter_ref='controlled-colbert',role='retrieve',pooling='none',query_prefix='[Q] ',document_prefix='[D] ',
        evidence_ref='synthetic-fixture',artifact_id='controlled',artifact_revision='a'*40,endpoint='/embedding')
    policy=ColbertTokenPolicy(artifact_id='controlled',artifact_revision='a'*40,configuration_sha256='b'*64,pad_token_id=0,skip_token_ids=(2,))
    request=RoleRequest(role='retrieve',texts=('controlled input',),input_kind=kind)
    return adapter,policy,request

def test_colbert_query_padding_native_matrix_route_and_normalization():
    adapter,policy,request=values(); session=Session()
    result=execute_colbert(session,adapter,request,policy,configuration_verified=lambda _:True)
    assert len(session.calls[1][1]['content'])==32 and session.calls[1][0]=='/embedding'
    assert len(result['embeddings'][0])==32
    assert sum(x*x for x in result['embeddings'][0][0])==pytest.approx(1)

def test_colbert_document_skiplist_and_wrong_configuration_block():
    adapter,policy,request=values('document'); session=Session()
    assert len(execute_colbert(session,adapter,request,policy,configuration_verified=lambda _:True)['embeddings'][0])==2
    with pytest.raises(PermissionError): execute_colbert(session,adapter,request,policy,configuration_verified=lambda _:False)
    with pytest.raises(ValueError): execute_colbert(session,adapter,request,policy.model_copy(update={'artifact_revision':'c'*40}),configuration_verified=lambda _:True)

def test_colbert_wrong_matrix_alignment_is_rejected():
    adapter,policy,request=values()
    class Invalid(Session):
        def call(self,endpoint,payload):
            return super().call(endpoint,payload) if endpoint=='/tokenize' else [{'embedding':[[1.0]*128]}]
    with pytest.raises(ValueError,match='alignment'): execute_colbert(Invalid(),adapter,request,policy,configuration_verified=lambda _:True)
