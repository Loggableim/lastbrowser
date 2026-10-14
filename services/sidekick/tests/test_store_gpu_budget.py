"""GPU identity/budget regressions, no model inference or large allocations."""
import copy
from datetime import datetime,timezone
import io
from pathlib import Path
import threading
import time
from types import SimpleNamespace
from unittest.mock import Mock,patch

import pytest

from runtime.local_ai.store_gpu import select_binding,preliminary_capacity_bytes,OwnedGpuBudget
from runtime.local_ai.model_store import _device_identity,ModelStore

GIB=1024**3


def adapter(index=0,luid='1'*16,uuid='2'*32):
    return {'adapterLuid':luid,'vulkanDeviceUuid':uuid,'vulkanPhysicalDeviceIndex':index,'vulkanDeviceNodeMask':1,
        'softwareAdapter':False,'sharedSystemMemory':False,'dedicatedBytes':{'status':'measured','value':16*GIB},
        'processBudgetBytes':{'status':'unknown','value':None},'processUsageBytes':{'status':'unknown','value':None},
        'backends':[{'name':'vulkan','status':'detected'}]}


def identity(binding):
    return {key:value for key,value in binding.public().items() if key in
        ('adapterLuid','vulkanDeviceUuid','vulkanPhysicalDeviceIndex','vulkanDeviceNodeMask')}


class Child:
    pid=4213
    _handle=123
    def __init__(self):self.returncode=None;self.killed=False
    def poll(self):return self.returncode
    def kill(self):self.killed=True;self.returncode=1


def facts(process,binding,budget=16*GIB,usage=0,creation='1234567'):
    return {'adapterLuid':binding.adapter_luid,'processId':process.pid,'processCreationTime':creation,
        'budgetOwnerRef':f'process:{process.pid}:{creation}','observedAt':datetime.now(timezone.utc).isoformat(),
        'source':'D3DKMTQueryVideoMemoryInfo','processBudgetBytes':{'status':'measured','value':budget},
        'processUsageBytes':{'status':'measured','value':usage}}


def test_arc_and_software_adapter_selects_only_physical_verified_gpu():
    binding=select_binding({'adapters':[adapter(),{'softwareAdapter':True}]})
    assert binding.adapter_luid=='1'*16 and preliminary_capacity_bytes(binding)==12*GIB
    assert OwnedGpuBudget(binding,4*GIB,'scope').phase=='CREATED'


def test_multiple_physical_gpus_have_no_ambiguous_default():
    with pytest.raises(ValueError,match='gpu_adapter_selection_required'):
        select_binding({'adapters':[adapter(),adapter(1,'3'*16,'4'*32)]})


@pytest.mark.parametrize('field,value',[
    ('adapterLuid',None),('vulkanDeviceUuid',None),('vulkanPhysicalDeviceIndex',None),
    ('vulkanDeviceNodeMask',3),('sharedSystemMemory',True),('softwareAdapter',True)])
def test_incomplete_or_shared_mapping_never_admits(field,value):
    data=adapter();data[field]=value
    with pytest.raises(ValueError):select_binding({'adapters':[data]})


def test_raw_physical_index_is_explicit_filter_not_assumed_ggml_index():
    binding=select_binding({'adapters':[adapter(3)]});gpu=OwnedGpuBudget(binding,4*GIB,'scope')
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)):
        assert gpu.environment()=={'GGML_VK_VISIBLE_DEVICES':'3'}
    assert gpu.binding.public()['engineDeviceAlias']=='Vulkan0'
    with pytest.raises(ValueError,match='gpu_process_admission_required'):gpu.receipt()


def test_mapping_change_before_spawn_is_denied():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope')
    wrong={**identity(binding),'vulkanPhysicalDeviceIndex':1}
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=wrong):
        with pytest.raises(ValueError,match='mapping_changed'):gpu.environment()


def test_capacity_fingerprint_binds_luid_and_uuid():
    first={'os':'win32','adapters':[adapter()]};second=copy.deepcopy(first)
    second['adapters'][0]['vulkanDeviceUuid']='3'*32
    assert _device_identity(first)!=_device_identity(second)


def test_real_owned_budget_is_required_even_with_ample_capacity():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',return_value=facts(child,binding,budget=4*GIB)):
        with pytest.raises(ValueError,match='insufficient_owned_process'):gpu.admit(child)
    assert gpu.ceiling_bytes is None


@pytest.mark.parametrize('change',[
    {'processId':99},{'processCreationTime':True},{'budgetOwnerRef':'helper-process'},
    {'source':'DXGI-helper-budget'},{'adapterLuid':'9'*16},
    {'processBudgetBytes':{'status':'unknown','value':None}},
    {'observedAt':'2000-01-01T00:00:00Z'}])
def test_foreign_unknown_or_stale_budget_never_admits(change):
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    value={**facts(child,binding),**change}
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',return_value=value):
        with pytest.raises(ValueError):gpu.admit(child)


def test_initializing_tolerates_only_documented_loader_gap():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    responses=[OSError('owned_process_video_budget_unavailable_c000000d'),facts(child,binding,usage=2*GIB)]
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',side_effect=responses):
        gpu.prepare_initializing(child)
        with pytest.raises(ValueError):gpu.receipt()
        gpu.admit_initialized(child,threading.Event(),lambda:True)
    assert gpu.phase=='ADMITTED' and gpu.baseline_usage==2*GIB and gpu.initialization_polls==2
    assert gpu.receipt()['initialObservationUsageFullyCounted']


def test_initializing_other_api_error_fails_immediately():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',side_effect=OSError('owned_process_video_budget_unavailable_c0000022')) as query:
        gpu.prepare_initializing(child)
        with pytest.raises(OSError,match='c0000022'):gpu.admit_initialized(child,threading.Event(),lambda:True)
    assert query.call_count==1


def test_initializing_timeout_kills_only_owned_child():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child();cancel=threading.Event()
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',side_effect=OSError('owned_process_video_budget_unavailable_c000000d')):
        gpu.prepare_initializing(child)
        with pytest.raises(ValueError,match='timeout'):gpu.admit_initialized(child,cancel,lambda:True)
    assert child.killed and cancel.is_set() and gpu.ceiling_bytes is None


def test_first_observation_late_allocations_are_not_excluded():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',return_value=facts(child,binding,usage=13*GIB)):
        gpu.prepare_initializing(child)
        with pytest.raises(ValueError,match='insufficient_owned_process'):gpu.admit_initialized(child,threading.Event(),lambda:True)


def test_steady_state_does_not_double_count_loaded_model():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,12*GIB,'scope');child=Child()
    responses=[facts(child,binding,usage=8*GIB),facts(child,binding,usage=12*GIB),facts(child,binding,usage=12*GIB+1)]
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',side_effect=responses):
        gpu.admit(child);gpu.check()
        with pytest.raises(ValueError,match='limit_breached'):gpu.check()


def test_dynamic_budget_shrink_or_creation_change_is_denied():
    binding=select_binding({'adapters':[adapter()]});gpu=OwnedGpuBudget(binding,4*GIB,'scope');child=Child()
    with patch('runtime.local_ai.store_gpu._identity_query',return_value=identity(binding)),patch('runtime.local_ai.store_gpu._owned_query',side_effect=[facts(child,binding),facts(child,binding,budget=4*GIB,usage=2*GIB)]):
        gpu.admit(child)
        with pytest.raises(ValueError,match='limit_breached'):gpu.check()
    with patch('runtime.local_ai.store_gpu._owned_query',return_value=facts(child,binding,creation='999999')):
        with pytest.raises(ValueError,match='owner_changed'):gpu.check()


def test_media_identity_preflight_failure_does_not_resume(tmp_path):
    from runtime.local_ai.store_media import MediaProcess
    child=Mock();child.poll.return_value=None;child.stderr=io.BytesIO();child.wait.return_value=1
    job=Mock();gpu=Mock();gpu.prepare_initializing.side_effect=ValueError('gpu_adapter_mapping_changed')
    gpu.environment.return_value={'GGML_VK_VISIBLE_DEVICES':'0'}
    process=MediaProcess(Path('engine.exe'),[],tmp_path,5*GIB,gpu_budget=gpu)
    with patch('runtime.local_ai.store_media._WindowsProbeJob',return_value=job),patch('runtime.local_ai.store_media.subprocess.Popen',return_value=child),patch('runtime.local_ai.store_process.resume_owned_suspended') as resume:
        with pytest.raises(ValueError,match='mapping_changed'):process.run(threading.Event())
    resume.assert_not_called();child.kill.assert_called_once();job.close.assert_called_once()


def test_media_postresume_budget_failure_cleans_owned_process(tmp_path):
    from runtime.local_ai.store_media import MediaProcess
    child=Mock();child.poll.return_value=None;child.stderr=io.BytesIO();child.wait.return_value=1
    job=Mock();gpu=Mock();gpu.admit_initialized.side_effect=ValueError('insufficient_owned_process_gpu_budget')
    gpu.environment.return_value={'GGML_VK_VISIBLE_DEVICES':'0'}
    budget=SimpleNamespace(reserve_available=lambda:True)
    process=MediaProcess(Path('engine.exe'),[],tmp_path,5*GIB,budget,gpu)
    with patch('runtime.local_ai.store_media._WindowsProbeJob',return_value=job),patch('runtime.local_ai.store_media.subprocess.Popen',return_value=child),patch('runtime.local_ai.store_media.MemorySampler') as sampler,patch('runtime.local_ai.store_process.resume_owned_suspended') as resume:
        with pytest.raises(ValueError,match='insufficient_owned_process'):process.run(threading.Event())
    resume.assert_called_once();child.kill.assert_called_once();job.close.assert_called_once()


def test_legacy_or_helper_gpu_receipt_cannot_qualify_current_adapter():
    store=ModelStore.__new__(ModelStore);store.device={'adapters':[adapter()]}
    proof={'configuration':{'backend':'vulkan'}}
    assert not store._gpu_proof_matches(proof)


def test_fresh_runtime_ram_after_long_hash_does_not_rewrite_main_timestamp():
    from runtime.local_ai.store_budget import capture_runtime_memory_budget
    store=ModelStore.__new__(ModelStore);store.scope=SimpleNamespace(key='scope')
    store.device={'observedAt':'2000-01-01T00:00:00Z','ramAvailableBytes':{'status':'measured','value':16*GIB}}
    original=copy.deepcopy(store.device)
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=16*GIB)):
        budget=store._memory_budget({'recommendedRamBytes':5*GIB})
        budget.validate(5*GIB)
    assert budget.source=='backend-psutil-after-artifact-verification' and store.device==original
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(available=8*GIB)):
        with pytest.raises(ValueError,match='insufficient_available_ram'):capture_runtime_memory_budget(5*GIB,'scope')
