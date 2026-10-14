"""Private scoped runtime observations; never rewrite Main scan provenance."""
from dataclasses import dataclass,replace
import os
import re
import shutil
import struct
import sys
import time

_SEAL=object()
RESERVE=4*1024**3


def _cpu_name():
    if os.name!='nt':raise ValueError('runtime_platform_unsupported')
    import winreg
    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,r'HARDWARE\DESCRIPTION\System\CentralProcessor\0') as key:
        return winreg.QueryValueEx(key,'ProcessorNameString')[0]


def _gpu_inventory():
    from .windows_gpu_probe import inventory
    value=inventory()
    return value['adapters']


def _name(value):
    if not isinstance(value,str) or not value.strip():raise ValueError('runtime_cpu_identity_unavailable')
    return ' '.join(re.sub(r'[\x00-\x1f\x7f]','',value).split())


def _gpu_ids(adapters):
    result=[]
    for adapter in adapters:
        if adapter.get('softwareAdapter') is True:continue
        luid=adapter.get('adapterLuid');uuid=adapter.get('vulkanDeviceUuid')
        if not luid:raise ValueError('runtime_gpu_identity_unavailable')
        result.append((luid,uuid,adapter.get('vulkanPhysicalDeviceIndex'),adapter.get('vulkanDeviceNodeMask'),
                       adapter.get('dedicatedBytes',{}).get('value'),adapter.get('sharedSystemMemory')))
    return tuple(sorted(result))


@dataclass(frozen=True)
class ScopedRuntimeObservation:
    scope_key:str
    device_fingerprint:str
    bundle_digest:str
    runtime_digest:str
    cpu_name:str
    total_ram:int
    gpu_identities:tuple
    observed_at:float
    available_ram:int
    disk_free:int
    _seal:object
    source:str='scoped-backend-runtime'

    def refresh(self,*,scope_key,device_fingerprint,bundle_digest,runtime_digest,cache_root,
                required_ram,required_disk,own_process_admitted=False):
        if (self._seal is not _SEAL or self.scope_key!=scope_key or self.device_fingerprint!=device_fingerprint
                or self.bundle_digest!=bundle_digest or self.runtime_digest!=runtime_digest):
            raise ValueError('scoped_runtime_observation_identity_mismatch')
        if sys.platform!='win32' or struct.calcsize('P')!=8 or _name(_cpu_name())!=self.cpu_name:
            raise ValueError('scoped_runtime_cpu_identity_changed')
        import psutil
        memory=psutil.virtual_memory()
        if memory.total!=self.total_ram:raise ValueError('scoped_runtime_machine_identity_changed')
        if _gpu_ids(_gpu_inventory())!=self.gpu_identities:raise ValueError('scoped_runtime_gpu_identity_changed')
        disk=shutil.disk_usage(cache_root).free
        if memory.available<(0 if own_process_admitted else required_ram)+RESERVE:
            raise ValueError('insufficient_available_ram')
        if disk<required_disk:raise ValueError('insufficient_disk_staging')
        return replace(self,observed_at=time.time(),available_ram=memory.available,disk_free=disk)

    def receipt(self):
        if self._seal is not _SEAL:raise ValueError('scoped_runtime_observation_invalid')
        return {'source':self.source,'observedAt':self.observed_at,'availableRamBytes':self.available_ram,
                'diskFreeBytes':self.disk_free,'deviceFingerprint':self.device_fingerprint,
                'bundleDigest':self.bundle_digest,'runtimeDigest':self.runtime_digest}


def capture_runtime_observation(*,hardware,scope_key,device_fingerprint,bundle_digest,runtime_digest,
                                cache_root,required_ram,required_disk):
    """Only the Store calls this after its normal fresh Main guard and full hash."""
    total=(hardware or {}).get('ramTotalBytes',{})
    if (hardware.get('os')!='win32' or hardware.get('arch')!='x64' or total.get('status')!='measured'
            or type(total.get('value')) is not int):raise ValueError('scoped_runtime_main_identity_unverified')
    observed=ScopedRuntimeObservation(scope_key,device_fingerprint,bundle_digest,runtime_digest,
        _name(hardware.get('cpuName')),total['value'],_gpu_ids(hardware.get('adapters',[])),
        0,0,0,_SEAL)
    return observed.refresh(scope_key=scope_key,device_fingerprint=device_fingerprint,bundle_digest=bundle_digest,
        runtime_digest=runtime_digest,cache_root=cache_root,required_ram=required_ram,required_disk=required_disk)
