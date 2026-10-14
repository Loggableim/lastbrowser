"""New native Store contract regression tests; no downloads or model execution."""
import copy
import io
import json
import threading
import wave
import weakref
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest

from runtime.independent.manager import ComputeAdmission, ResourceBusy
from runtime.local_ai.model_store import ModelStore
from runtime.local_ai.store_inputs import copy_media_input
from runtime.local_ai.store_media import collect_media, build_media_args
from runtime.local_ai.store_registry import load_registry
from runtime.local_ai.store_tool_probe import probe_tool_api
from runtime.local_ai.store_notices import notice_url


@pytest.fixture
def owner():
    scope=SimpleNamespace(key='store-delivery-'+__import__('uuid').uuid4().hex)
    identity=__import__('uuid').uuid4().hex
    assert ComputeAdmission.acquire(identity,scope)
    yield identity,scope
    ComputeAdmission.release(identity)


def test_borrow_keeps_slot_until_owned_child_exits(owner):
    identity,scope=owner
    token=ComputeAdmission.borrow(identity,scope)
    ComputeAdmission.release(identity)
    assert not ComputeAdmission.borrow_valid(identity,token,scope)
    assert identity in ComputeAdmission._owners
    assert not ComputeAdmission.acquire(identity,scope)
    with pytest.raises(ResourceBusy):ComputeAdmission.borrow(identity,scope)
    assert ComputeAdmission.release_borrow(identity,token,scope)
    assert identity not in ComputeAdmission._owners


def test_borrow_rejects_foreign_scope_and_cannot_release_owner(owner):
    identity,scope=owner
    wrong=SimpleNamespace(key=scope.key+'-other')
    with pytest.raises(ResourceBusy):ComputeAdmission.borrow(identity,wrong)
    token=ComputeAdmission.borrow(identity,scope)
    assert not ComputeAdmission.release_borrow(identity,token,wrong)
    assert ComputeAdmission.borrow_valid(identity,token,scope)
    assert ComputeAdmission.release_borrow(identity,token,scope)
    assert identity in ComputeAdmission._owners


def registry_data():
    path=Path(__import__('runtime.local_ai.store_registry',fromlist=['x']).__file__).with_name('store-runtime-registry.json')
    return json.loads(path.read_text(encoding='utf-8'))


def test_real_registry_is_exactly_pinned():
    _,engines,models=load_registry()
    assert engines and models
    assert all(model['bundleDigest'] and model['fileObjects'] for model in models.values())


def test_full_curated_catalogue_keeps_four_honest_unavailable_models():
    from runtime.local_ai.model_store import catalog_entries
    from runtime.local_ai.store_registry import UNAVAILABLE_MODELS
    entries={item['id']:item for item in catalog_entries() if item.get('curated')}
    assert len(entries)==40
    assert sum(bool(item.get('artifactManifest')) for item in entries.values())==36
    for identity,(code,_) in UNAVAILABLE_MODELS.items():
        assert entries[identity]['runtimeReasonCode']==code
        assert not entries[identity]['installQualified']


@pytest.mark.parametrize('mutation,reason',[
    (lambda d:d['models'][0].update(license='non-commercial'),'license_or_category'),
    (lambda d:d['models'][0].update(licenseDigest='0'*64),'notice_digest'),
    (lambda d:d['models'][0].update(engineIds=['missing']),'engine_unknown'),
    (lambda d:d['models'][0]['files'].append(copy.deepcopy(d['models'][0]['files'][0])),'component_invalid'),
    (lambda d:d['models'][0]['files'][0]['file'].update(sourceUrl='https://huggingface.co/org/model/resolve/main/model.gguf'),'not_immutable'),
])
def test_registry_rejects_untrusted_changes(tmp_path,mutation,reason):
    data=registry_data();mutation(data)
    file=tmp_path/'registry.json';file.write_text(json.dumps(data),encoding='utf-8')
    with pytest.raises(ValueError,match=reason):load_registry(file)


def wav_bytes():
    output=io.BytesIO()
    with wave.open(output,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000)
        audio.writeframes(b'\0\0'*16000)
    return output.getvalue()


def test_truncated_wav_is_not_accepted_by_its_header(tmp_path):
    source=tmp_path/'bad.wav';source.write_bytes(wav_bytes()[:-100])
    with pytest.raises(ValueError,match='media_audio_truncated'):
        copy_media_input(tmp_path,'audio_wav',source,'a'*32)


def test_valid_wav_is_copied_as_scoped_asset(tmp_path):
    source=tmp_path/'good.wav';source.write_bytes(wav_bytes())
    descriptor,name,digest,size=copy_media_input(tmp_path,'audio_wav',source,'b'*32)
    assert descriptor['durationMs']==1000 and descriptor['assetId']=='b'*32
    assert name=='audio.wav' and size==len(wav_bytes()) and len(digest)==64


@pytest.mark.parametrize('names',[['frame_000.png','frame_002.png'],['frame_000.png','frame_001.png','frame_002.png'],['frame_0.png','frame_1.png']])
def test_video_frames_require_exact_contiguous_indices(tmp_path,names):
    for name in names:(tmp_path/name).write_bytes(b'not-image')
    with pytest.raises(ValueError,match='frame_indices_invalid'):
        collect_media(tmp_path,{'category':'video'},{'frames':2,'fps':16,'width':64,'height':64})


def test_dual_noise_cli_uses_actual_pinned_flags(tmp_path):
    config={'pipeline':'wan2.2_t2v','width':{'min':64,'max':64,'step':8},'height':{'min':64,'max':64,'step':8},
        'steps':{'min':1,'max':2,'default':1},'frames':{'min':1,'max':1,'step':1},'fps':{'min':16,'max':16,'default':16}}
    files=[(role,SimpleNamespace(relative_path=role+'.gguf')) for role in ('diffusion','diffusion_low','vae','text_encoder')]
    args=build_media_args({'category':'video','media':config,'fileObjects':files},tmp_path,tmp_path,
        {'prompt':'test','seed':1,'width':64,'height':64,'steps':1,'frames':1,'fps':16},'cpu',0)
    assert '--high-noise-diffusion-model' in args and '--diffusion-model' in args
    assert '--diffusion-model-high-noise' not in args and '--diffusion-model-low-noise' not in args


class ToolSession:
    def __init__(self,arguments='{"a":2,"b":3}',followup=None):self.arguments=arguments;self.payloads=[];self.followup=followup
    def call(self,endpoint,payload,timeout):
        self.payloads.append(copy.deepcopy(payload))
        message={'tool_calls':[{'id':'own-call','type':'function','function':{'name':'local_test_sum','arguments':self.arguments}}]} if len(self.payloads)==1 else {'content':'5',**(self.followup or {})}
        return {'choices':[{'message':message}]}


def test_tool_probe_uses_real_schema_and_tool_result():
    session=ToolSession();result=probe_tool_api(session,{'id':'test','artifactManifest':{}},threading.Event())
    assert result['passed'] and not result['externalEffectsExecuted']
    assert session.payloads[0]['tools'][0]['function']['parameters']['additionalProperties'] is False
    assert session.payloads[1]['messages'][-1]['role']=='tool'
    assert session.payloads[1]['messages'][-1]['tool_call_id']=='own-call'


@pytest.mark.parametrize('arguments',['{"a":true,"b":3}','{"a":2,"b":3,"extra":0}','{"a":3,"b":2}'])
def test_tool_probe_rejects_wrong_arguments(arguments):
    assert not probe_tool_api(ToolSession(arguments),{'id':'test','artifactManifest':{}},threading.Event())['passed']


def test_tool_probe_rejects_unrequested_followup_call():
    result=probe_tool_api(ToolSession(followup={'tool_calls':[{'id':'unexpected'}]}),{'id':'test','artifactManifest':{}},threading.Event())
    assert not result['passed'] and result['reasonCode']=='tool_api_unexpected_followup_call'


def prepared_store():
    store=ModelStore.__new__(ModelStore)
    store.scope=SimpleNamespace(key='scope');store.lock=threading.RLock();store._prepared_sessions=weakref.WeakKeyDictionary()
    store._prepared_observations=weakref.WeakKeyDictionary()
    store.sessions={};store.jobs={};store.root=Path('.');store.repository=Path('.')
    store.provider_capability=Mock(return_value={'state':'ready','backend':'cpu','artifactId':'test','bundleDigest':'pinned'})
    store._entry=Mock(return_value={'id':'test'});store._guard=Mock();store._verify=Mock();store._engine=Mock(return_value={})
    store._memory_budget=Mock(return_value=SimpleNamespace(reserve_available=lambda:True))
    store._refresh_runtime_observation=Mock(side_effect=lambda observation,*args,**kwargs:observation)
    session=Mock(spec=['binary','arguments','artifact_id','port','token','process','start','stop','_runtime_observation'])
    session._runtime_observation=object()
    session.binary=Path('engine.exe');session.arguments=('--no-context-shift','--jinja');session.artifact_id='test'
    session.port=38080;session.token='private-generated-test-value';session.process=None;session.stop.return_value=True
    store._session=Mock(return_value=(session,{}))
    return store,session


def test_prepare_does_not_spawn_or_acquire_compute():
    store,session=prepared_store();cancel=threading.Event()
    with patch.object(ComputeAdmission,'acquire') as acquire:
        actual,cap=store.prepare_provider_session('test',cancel=cancel)
    assert actual is session and cap['state']=='ready'
    session.start.assert_not_called();acquire.assert_not_called()


def test_unregistered_prepared_session_fails_closed_without_attribute_error():
    store,session=prepared_store()
    with pytest.raises(ValueError,match='prepared_provider_identity_mismatch'):
        store.prepared_provider_capability(session,'test')
    store.provider_capability.assert_not_called()
    session.start.assert_not_called()


def test_prepared_identity_cannot_be_changed_before_start():
    store,session=prepared_store();cancel=threading.Event()
    store.prepare_provider_session('test',cancel=cancel)
    session.port+=1
    with pytest.raises(ValueError,match='prepared_provider_identity_mismatch'):
        with store.provider_session('test',cancel=cancel,agentic=True,prepared=session):pass
    session.start.assert_not_called()


def test_prepared_session_cannot_cross_cancel_event():
    store,session=prepared_store()
    store.prepare_provider_session('test',cancel=threading.Event())
    with pytest.raises(ValueError,match='prepared_provider_identity_mismatch'):
        with store.provider_session('test',cancel=threading.Event(),agentic=True,prepared=session):pass
    session.start.assert_not_called()


def test_prepared_session_restarts_same_endpoint_after_confirmed_stop(owner):
    store,session=prepared_store();identity,scope=owner;store.scope=scope
    cancel=threading.Event();store.prepare_provider_session('test',cancel=cancel)
    def start(*args,**kwargs):session.process=SimpleNamespace(poll=lambda:None)
    def stop(*args,**kwargs):session.process=None;return True
    session.start.side_effect=start;session.stop.side_effect=stop
    endpoint=(session.port,session.token)
    with patch('runtime.local_ai.model_store.engine_directory',return_value=Path('.')),patch('runtime.local_ai.model_store.verify_engine'):
        for _ in range(2):
            with store.provider_session('test',cancel=cancel,agentic=True,compute_owner=identity,prepared=session) as (active,cap):
                assert active is session and (active.port,active.token)==endpoint
                assert ComputeAdmission._borrows[identity]
            assert session.process is None and not ComputeAdmission._borrows.get(identity)
    assert session.start.call_count==2 and identity in ComputeAdmission._owners


def test_live_scope_revocation_stops_only_captured_session(owner):
    store,session=prepared_store();identity,scope=owner;store.scope=scope
    cancel=threading.Event();revoked=threading.Event();child_stopped=threading.Event()
    def authorize():
        if revoked.is_set():raise PermissionError('revoked')
    store.authorize=authorize
    store.prepare_provider_session('test',cancel=cancel)
    session.start.side_effect=lambda *a,**k:setattr(session,'process',SimpleNamespace(poll=lambda:None))
    def stop(*a,**k):session.process=None;child_stopped.set();return True
    session.stop.side_effect=stop
    with patch('runtime.local_ai.model_store.engine_directory',return_value=Path('.')),patch('runtime.local_ai.model_store.verify_engine'):
        with pytest.raises((PermissionError,RuntimeError)):
            with store.provider_session('test',cancel=cancel,agentic=True,compute_owner=identity,prepared=session):
                revoked.set();assert child_stopped.wait(2);assert cancel.is_set()
    assert identity in ComputeAdmission._owners and not ComputeAdmission._borrows.get(identity)


@pytest.mark.parametrize('url',[
    'https://www.apache.org/other.txt','https://www.apache.org/licenses/LICENSE-2.0.txt?extra=1',
    'https://raw.githubusercontent.com/org/repo/main/LICENSE','http://www.apache.org/licenses/LICENSE-2.0.txt',
    'https://user:pass@www.apache.org/licenses/LICENSE-2.0.txt'])
def test_license_transport_remains_narrow(url):
    with pytest.raises(ValueError):notice_url(url)


def test_media_assign_failure_never_resumes_and_reaps_own_child(tmp_path):
    from runtime.local_ai.store_media import MediaProcess
    child=Mock();child.poll.return_value=None;child.stderr=io.BytesIO();child.wait.return_value=1
    job=Mock();job.assign.side_effect=OSError('assignment_failed')
    process=MediaProcess(Path('engine.exe'),[],tmp_path,5*1024**3)
    with patch('runtime.local_ai.store_media._WindowsProbeJob',return_value=job),patch('runtime.local_ai.store_media.subprocess.Popen',return_value=child) as spawn,patch('runtime.local_ai.store_process.resume_owned_suspended') as resume:
        with pytest.raises(OSError,match='assignment_failed'):process.run(threading.Event())
    assert spawn.call_args.kwargs['creationflags'] & 4
    resume.assert_not_called();child.kill.assert_called_once();child.wait.assert_called_once();job.close.assert_called_once()


def test_large_hardware_budget_is_dynamic_without_allocating_ram():
    from runtime.local_ai.store_budget import capture_memory_budget
    from datetime import datetime,timezone
    required=64*1024**3;available=80*1024**3
    hardware={'observedAt':datetime.now(timezone.utc).isoformat(),'ramAvailableBytes':{'status':'measured','value':available}}
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=available)):
        budget=capture_memory_budget(hardware,required,'large-host')
        assert budget.limit_bytes==required
        budget.validate(required)


@pytest.mark.parametrize('mutation',[
    lambda h:h.update(observedAt='2000-01-01T00:00:00Z'),
    lambda h:h['ramAvailableBytes'].update(status='estimated'),
    lambda h:h['ramAvailableBytes'].update(value=8*1024**3),
])
def test_production_budget_rejects_stale_unknown_or_insufficient_host(mutation):
    from runtime.local_ai.store_budget import capture_memory_budget
    from datetime import datetime,timezone
    hardware={'observedAt':datetime.now(timezone.utc).isoformat(),'ramAvailableBytes':{'status':'measured','value':80*1024**3}}
    mutation(hardware)
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=80*1024**3)):
        with pytest.raises(ValueError):capture_memory_budget(hardware,64*1024**3,'scope')


def test_budget_rechecks_current_ram_and_cannot_be_forged():
    from runtime.local_ai.store_budget import capture_memory_budget,StoreMemoryBudget
    from datetime import datetime,timezone
    hardware={'observedAt':datetime.now(timezone.utc).isoformat(),'ramAvailableBytes':{'status':'measured','value':16*1024**3}}
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=16*1024**3)):
        budget=capture_memory_budget(hardware,5*1024**3,'scope')
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=8*1024**3)):
        with pytest.raises(ValueError,match='insufficient_available_ram'):budget.validate(5*1024**3)
    forged=StoreMemoryBudget(64*1024**3,'scope',__import__('time').time(),80*1024**3,object())
    with pytest.raises(ValueError,match='store_memory_budget_invalid'):forged.validate(64*1024**3)
