"""Exact adapter binding and budget of our own suspended inference process.

Inventory capacity is preliminary. Only D3DKMT facts for a held own child
handle admit execution; Main/helper process budgets are never borrowed.
"""
from dataclasses import dataclass
from datetime import datetime
import re
import threading
import time


def _measured(fact):
    if (not isinstance(fact,dict) or fact.get('status')!='measured'
            or type(fact.get('value')) is not int or fact['value']<0):
        raise ValueError('gpu_measurement_unavailable')
    return fact['value']


@dataclass(frozen=True)
class GpuBinding:
    adapter_luid:str
    vulkan_uuid:str
    physical_index:int
    node_mask:int
    dedicated_bytes:int

    def public(self):
        return {'adapterLuid':self.adapter_luid,'vulkanDeviceUuid':self.vulkan_uuid,
                'vulkanPhysicalDeviceIndex':self.physical_index,'vulkanDeviceNodeMask':self.node_mask,
                'dedicatedCapacityBytes':self.dedicated_bytes,'visibleDeviceFilter':str(self.physical_index),
                'engineDeviceAlias':'Vulkan0','mapping':'pinned_ggml_single_visible_physical_device_v1'}


def binding_from_adapter(adapter):
    if adapter.get('softwareAdapter') is not False or adapter.get('sharedSystemMemory') is not False:
        raise ValueError('dedicated_physical_adapter_required')
    luid=adapter.get('adapterLuid');uuid=adapter.get('vulkanDeviceUuid');index=adapter.get('vulkanPhysicalDeviceIndex')
    mask=adapter.get('vulkanDeviceNodeMask')
    if (not isinstance(luid,str) or not re.fullmatch('[a-f0-9]{16}',luid)
            or not isinstance(uuid,str) or not re.fullmatch('[a-f0-9]{32}',uuid)
            or type(index) is not int or not 0<=index<=255 or type(mask) is not int or mask!=1):
        raise ValueError('vulkan_adapter_identity_unverified')
    if not any(item.get('name')=='vulkan' and item.get('status') in ('detected','verified') for item in adapter.get('backends',[])):
        raise ValueError('vulkan_backend_unavailable')
    capacity=_measured(adapter.get('dedicatedBytes'))
    if capacity<=0:raise ValueError('dedicated_gpu_capacity_unavailable')
    return GpuBinding(luid,uuid,index,mask,capacity)


def adapter_candidates(hardware):
    result=[]
    for adapter in (hardware or {}).get('adapters',[]):
        try:binding=binding_from_adapter(adapter)
        except ValueError:continue
        result.append(binding)
    return result


def select_binding(hardware):
    candidates=adapter_candidates(hardware)
    physical=[adapter for adapter in (hardware or {}).get('adapters',[])
              if adapter.get('softwareAdapter') is not True and adapter.get('sharedSystemMemory') is not True]
    if len(physical)!=len(candidates):raise ValueError('vulkan_adapter_identity_unverified')
    if len(candidates)!=1:raise ValueError('gpu_adapter_selection_required' if len(candidates)>1 else 'vulkan_adapter_identity_unverified')
    return candidates[0]


def preliminary_capacity_bytes(binding):
    # Capacity is NOT free VRAM, nor an inference process budget.
    return binding.dedicated_bytes*3//4


def _owned_query(process,binding):
    from .windows_gpu_probe import query_owned_process_budget
    return query_owned_process_budget(int(process._handle),binding.adapter_luid,expected_pid=process.pid,physical_adapter_index=0)


def _identity_query(binding):
    from .windows_gpu_probe import query_vulkan_identity
    return query_vulkan_identity(binding.adapter_luid)


class OwnedGpuBudget:
    def __init__(self,binding,required_bytes,scope_key):
        if type(binding) is not GpuBinding or type(required_bytes) is not int or required_bytes<=0 or not scope_key:
            raise ValueError('gpu_runtime_budget_invalid')
        if required_bytes>preliminary_capacity_bytes(binding):raise ValueError('insufficient_dedicated_gpu_capacity')
        self.binding=binding;self.required_bytes=required_bytes;self.scope_key=scope_key
        self.process=None;self.baseline_usage=None;self.ceiling_bytes=None;self.owner=None;self.creation=None
        self.peak_usage=0;self.last_fact=None;self.error_reason=None;self._last_identity=0
        self._closed=threading.Event();self._watcher=None
        self.phase='CREATED';self.initialization_started=None;self.initialization_ms=None;self.initialization_polls=0

    def _verify_identity(self):
        actual=_identity_query(self.binding)
        expected={'adapterLuid':self.binding.adapter_luid,'vulkanDeviceUuid':self.binding.vulkan_uuid,
            'vulkanPhysicalDeviceIndex':self.binding.physical_index,'vulkanDeviceNodeMask':self.binding.node_mask}
        if any(actual.get(key)!=value for key,value in expected.items()):raise ValueError('gpu_adapter_mapping_changed')
        self._last_identity=time.monotonic()

    def environment(self):
        if self._watcher is not None and self._watcher.is_alive():raise ValueError('gpu_watch_shutdown_pending')
        self._verify_identity()
        # Both pinned ggml versions interpret this as raw Vulkan physical index.
        # The engine's Vulkan0 name is therefore only the verified filtered alias.
        return {'GGML_VK_VISIBLE_DEVICES':str(self.binding.physical_index)}

    def _facts(self,process):
        if process.poll() is not None:raise ValueError('gpu_owned_process_exited')
        value=_owned_query(process,self.binding)
        creation=value.get('processCreationTime')
        if (value.get('adapterLuid')!=self.binding.adapter_luid or value.get('processId')!=process.pid
                or not isinstance(value.get('budgetOwnerRef'),str) or not value['budgetOwnerRef']
                or not ((type(creation) is int and creation>0) or (isinstance(creation,str) and re.fullmatch('[0-9]{1,20}',creation)))
                or value.get('source')!='D3DKMTQueryVideoMemoryInfo'
                or value.get('budgetOwnerRef')!=f'process:{process.pid}:{creation}'):
            raise ValueError('gpu_budget_owner_mismatch')
        try:age=time.time()-datetime.fromisoformat(value['observedAt'].replace('Z','+00:00')).timestamp()
        except (ValueError,KeyError,TypeError):raise ValueError('gpu_budget_observation_invalid') from None
        if not 0<=age<=2:raise ValueError('gpu_budget_observation_stale')
        budget=_measured(value.get('processBudgetBytes'));usage=_measured(value.get('processUsageBytes'))
        if usage>budget:raise ValueError('gpu_process_budget_exceeded')
        return value,budget,usage

    def prepare_initializing(self,process):
        """Before Resume: identity/capacity only, never an owned-budget PASS."""
        if self.process is not None and self.process.poll() is None:raise ValueError('gpu_budget_already_owned')
        self._verify_identity()
        if process.poll() is not None:raise ValueError('gpu_owned_process_exited')
        self.process=process;self.phase='INITIALIZING';self.owner=None;self.creation=None
        self.ceiling_bytes=None;self.last_fact=None;self.peak_usage=0;self.baseline_usage=None
        self.initialization_started=time.monotonic();self.initialization_ms=None;self.initialization_polls=0

    def admit_initialized(self,process,cancel,reserve_available):
        """Only the OS-loader initialization gap may lack process accounting."""
        if self.phase!='INITIALIZING' or self.process is not process:raise ValueError('gpu_initialization_identity_invalid')
        deadline=self.initialization_started+1.0
        def deadline_kill():
            if self.phase=='INITIALIZING' and process.poll() is None:
                self.error_reason='gpu_process_initialization_budget_timeout';cancel.set()
                # Held Popen handle only; cannot target a reused PID or another
                # session. This guard also runs if a driver query blocks.
                try:process.kill()
                except OSError:pass
        timer=threading.Timer(max(0,deadline-time.monotonic()),deadline_kill);timer.daemon=True;timer.start()
        try:
            while time.monotonic()<deadline:
                if cancel.is_set():raise ValueError(self.error_reason or 'gpu_initialization_cancelled')
                if not reserve_available():raise ValueError('system_ram_reserve_breached')
                self.initialization_polls+=1
                try:self.admit(process)
                except OSError as error:
                    if str(error)!='owned_process_video_budget_unavailable_c000000d':raise
                except Exception:
                    if self.error_reason:raise ValueError(self.error_reason) from None
                    raise
                else:
                    if time.monotonic()>deadline or cancel.is_set():
                        cancel.set()
                        if process.poll() is None:process.kill()
                        raise ValueError('gpu_process_initialization_budget_timeout')
                    self.initialization_ms=(time.monotonic()-self.initialization_started)*1000
                    return
                if cancel.wait(.005):raise ValueError(self.error_reason or 'gpu_initialization_cancelled')
            deadline_kill()
            raise ValueError('gpu_process_initialization_budget_timeout')
        finally:timer.cancel()

    def admit(self,process):
        if self.process is not None and self.process.poll() is None and not (self.phase=='INITIALIZING' and self.process is process):
            raise ValueError('gpu_budget_already_owned')
        self._verify_identity()
        value,budget,usage=self._facts(process)
        ceiling=min(self.binding.dedicated_bytes,budget)*3//4
        remaining=max(0,self.required_bytes-usage)
        if usage+remaining>ceiling:raise ValueError('insufficient_owned_process_gpu_budget')
        self.process=process;self.owner=value['budgetOwnerRef'];self.creation=value['processCreationTime']
        self.baseline_usage=usage;self.ceiling_bytes=ceiling;self.last_fact=value;self.peak_usage=usage
        self.phase='ADMITTED'

    def check(self):
        if self.process is None:raise ValueError('gpu_process_admission_required')
        if time.monotonic()-self._last_identity>=1:self._verify_identity()
        value,budget,usage=self._facts(self.process)
        if value['budgetOwnerRef']!=self.owner or value['processCreationTime']!=self.creation:
            raise ValueError('gpu_budget_owner_changed')
        current_ceiling=min(self.binding.dedicated_bytes,budget)*3//4
        remaining=max(0,self.required_bytes-usage)
        if usage+remaining>min(current_ceiling,self.ceiling_bytes):
            raise ValueError('gpu_owned_budget_limit_breached')
        self.last_fact=value;self.peak_usage=max(self.peak_usage,usage)

    def start_watch(self,process,cancel,stop):
        if self.process is not process:raise ValueError('gpu_budget_process_mismatch')
        self._closed.clear()
        def watch():
            while not self._closed.wait(.1):
                if process.poll() is not None:return
                try:self.check()
                except Exception as error:
                    message=str(error)
                    self.error_reason=message if re.fullmatch('[a-z_]{1,100}',message) else 'gpu_budget_monitor_failed'
                    cancel.set();stop();return
        self._watcher=threading.Thread(target=watch,daemon=True,name='owned-gpu-budget-watch');self._watcher.start()

    def close(self):
        self._closed.set()
        if self._watcher and self._watcher is not threading.current_thread():self._watcher.join(.5)

    def receipt(self):
        if self.process is None or self.last_fact is None:raise ValueError('gpu_process_admission_required')
        return {'binding':self.binding.public(),'source':'owned_process_budget','processId':self.process.pid,
                'processCreationTime':self.creation,'budgetOwnerRef':self.owner,
                'admittedCeilingBytes':self.ceiling_bytes,'plannedRequiredBytes':self.required_bytes,
                'baselineUsageBytes':self.baseline_usage,'peakObservedUsageBytes':self.peak_usage,
                'initialObservationUsageFullyCounted':True,'initializationBeforeBudgetMs':self.initialization_ms,
                'initializationQueryCount':self.initialization_polls,
                'initializationBeforeBudgetIsNotZeroAllocationGuarantee':True,
                'sampleIntervalMs':100,'identityRecheckIntervalMs':1000}
