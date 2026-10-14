"""Private fresh runtime facts cannot replace public Main provenance."""
import copy
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from runtime.local_ai import store_observation as module

GIB=1024**3


def hardware():
    return {'os':'win32','arch':'x64','cpuName':'Test CPU',
            'observedAt':'2000-01-01T00:00:00Z',
            'ramTotalBytes':{'status':'measured','value':32*GIB},'adapters':[]}


def arguments():
    return dict(scope_key='profile:space',device_fingerprint='device',bundle_digest='bundle',
                runtime_digest='runtime',cache_root='.',required_ram=5*GIB,required_disk=2*GIB)


@pytest.fixture
def observations():
    with patch.object(module.sys,'platform','win32'),patch.object(module,'_cpu_name',return_value='Test CPU'),\
         patch.object(module,'_gpu_inventory',return_value=[]),\
         patch('psutil.virtual_memory',return_value=SimpleNamespace(total=32*GIB,available=16*GIB)),\
         patch.object(module.shutil,'disk_usage',return_value=SimpleNamespace(free=64*GIB)):
        yield


def test_long_hash_refresh_keeps_main_provenance(observations):
    main=hardware();original=copy.deepcopy(main)
    with patch.object(module.time,'time',return_value=100):
        sealed=module.capture_runtime_observation(hardware=main,**arguments())
    with patch.object(module.time,'time',return_value=145):
        fresh=sealed.refresh(**arguments())
    assert fresh.observed_at==145 and sealed.observed_at==100 and main==original
    assert fresh.receipt()['source']=='scoped-backend-runtime'


@pytest.mark.parametrize('field',['scope_key','device_fingerprint','bundle_digest','runtime_digest'])
def test_scope_or_artifact_change_denied(observations,field):
    sealed=module.capture_runtime_observation(hardware=hardware(),**arguments())
    changed=arguments();changed[field]='changed'
    with pytest.raises(ValueError,match='identity_mismatch'):sealed.refresh(**changed)


def test_unsealed_observation_denied(observations):
    sealed=module.capture_runtime_observation(hardware=hardware(),**arguments())
    with pytest.raises(ValueError,match='identity_mismatch'):
        replace(sealed,_seal=object()).refresh(**arguments())


def test_changed_cpu_gpu_and_total_ram_denied(observations):
    sealed=module.capture_runtime_observation(hardware=hardware(),**arguments())
    with patch.object(module,'_cpu_name',return_value='Other CPU'):
        with pytest.raises(ValueError,match='cpu_identity_changed'):sealed.refresh(**arguments())
    with patch.object(module,'_gpu_inventory',return_value=[{'adapterLuid':'1234'}]):
        with pytest.raises(ValueError,match='gpu_identity_changed'):sealed.refresh(**arguments())
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(total=64*GIB,available=16*GIB)):
        with pytest.raises(ValueError,match='machine_identity_changed'):sealed.refresh(**arguments())


def test_loaded_own_process_reserve_not_double_counted(observations):
    sealed=module.capture_runtime_observation(hardware=hardware(),**arguments())
    with patch('psutil.virtual_memory',return_value=SimpleNamespace(total=32*GIB,available=6*GIB)):
        with pytest.raises(ValueError,match='insufficient_available_ram'):sealed.refresh(**arguments())
        assert sealed.refresh(**arguments(),own_process_admitted=True).available_ram==6*GIB
