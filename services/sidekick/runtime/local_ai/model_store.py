"""Private scoped model store, pinned downloads and own cancellable CPU sessions.

No search, remote code, external runtime downloads, account fallback or checkout.
Publisher metadata is not runtime/quality evidence. Unknown architectures stay blocked.
"""
from __future__ import annotations
import hashlib
import json
import os
import shutil
import socket
import statistics
import threading
import time
import uuid
import weakref
from contextlib import contextmanager
from pathlib import Path
from .installer import LocalAiInstaller, HubTransport, _cache_directory, _open_file, _verified, InstallCancelled
from .model_manager import LlamaCppSession
from .store_registry import load_registry, enrich_entry, UNAVAILABLE_MODELS
from .store_engines import engine_directory, prepare_engine, verify_engine
from .store_benchmark import CASES, SUITE_VERSION, SUITE_HASH, VALIDATOR_VERSION, evaluate
from .store_inference import stream_answer, MemorySampler
from .store_curation import load_curation, browse_entry

GIB = 1024 ** 3
CATALOG = json.loads((Path(__file__).parent/'store_catalog.json').read_text(encoding='utf-8'))
CURATION_REVISION, CURATION = load_curation()
_LOCK = threading.RLock()
_STORES = {}
_EXECUTION = threading.Lock()
_RUNNING = {'pending','running','downloading','verifying','stopping'}

class Entitlements:
    """Compatibility shim: LastBrowser has no model-size entitlement gate."""
    def permits_large_local_models(self, scope):
        return True

def _digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()).hexdigest()

def _scope_key(scope):
    return _digest(scope.model_dump(mode='json',by_alias=True))

def _model_key(entry):
    # Model IDs are a finite pinned registry (collision-checked), not user input.
    # Keep full SHA-256 scope separation while avoiding unnecessary MAX_PATH use.
    return _digest(entry['id'])[:32] if entry.get('artifactManifest') else _digest(entry['id'])

def _device_identity(device):
    if not isinstance(device,dict):return None
    return _digest({'os':device.get('os'),'arch':device.get('arch'),'cpuName':device.get('cpuName'),
        'ramTotalBytes':device.get('ramTotalBytes',{}).get('value'),
        'adapters':[(a.get('name'),a.get('vendor'),a.get('dedicatedBytes',{}).get('value'),
            a.get('adapterLuid'),a.get('vulkanDeviceUuid'),a.get('softwareAdapter')) for a in device.get('adapters',[])]})

def _read(path, default):
    if not path.exists(): return default
    if path.is_symlink() or path.stat().st_size>16*1024*1024: raise ValueError('store_file_unsafe')
    return json.loads(path.read_text(encoding='utf-8'))

def _write(path, value):
    data=json.dumps(value,ensure_ascii=False,sort_keys=True,indent=2).encode()
    if len(data)>16*1024*1024: raise ValueError('store_file_limit')
    if path.is_symlink(): raise ValueError('store_file_unsafe')
    temporary=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with temporary.open('xb') as stream: stream.write(data); stream.flush(); os.fsync(stream.fileno())
    os.replace(temporary,path)

def _safe_error(error):
    message=str(error)
    return message if message and len(message)<120 and all(c.isalnum() or c=='_' for c in message) else 'model_store_operation_failed'

def _release_after_exit(session,owner,admitted,release_borrow=None):
    from runtime.independent.manager import ComputeAdmission
    def release():
        if admitted:ComputeAdmission.release(owner)
        if release_borrow:release_borrow()
        _EXECUTION.release()
    try:stopped=session is None or session.stop(timeout=5)
    except Exception:stopped=False
    if stopped:release();return True
    def await_exit():
        while True:
            try:
                if session.stop(timeout=2):release();return
            except Exception:pass
            threading.Event().wait(.5)
    threading.Thread(target=await_exit,name='model-store-owned-exit',daemon=True).start()
    return False

def catalog_entries():
    entries=[]
    for model in CATALOG['models']:
        files=[f for f in model.get('official_gguf_files',[]) if not f['filename'].startswith('mmproj')]
        chosen=next((f for f in files if 'Q4_0' in f['filename']),next((f for f in files if 'Q4_K_M' in f['filename']),None))
        # Existing b11377 LFM2 architecture; no special fork implied for other families.
        supported=False  # Historical catalog metadata never authorizes execution.
        parameters=model.get('total_parameters')
        size=chosen['bytes'] if chosen else None
        entries.append({'id':model['model_id'],'name':model['model_id'].split('/')[-1],
            'publisher':model['model_id'].split('/')[0],'description':model['selection_reason'],
            'tier':model['tier'],'sourceUrl':model['source_url'],'revision':model.get('source_revision'),
            'totalParameters':parameters,'parameterSource':model.get('parameter_source','unknown'),
            'contextLimit':model.get('context_config_max_position_embeddings') or (32768 if supported else None),
            'recommendedContext':4096 if supported else None,'downloadBytes':size,
            'recommendedRamBytes':size+3*GIB if size else None,'recommendedVramBytes':None,
            'memoryPolicy':'CPU estimate: weights + 3 GiB at 4K context; 2 GiB system reserve additional',
            'quantization':chosen['filename'].rsplit('-',1)[-1].removesuffix('.gguf') if chosen else None,
            'runtimeStatus':'cpu_candidate' if supported else 'unknown',
            'runtimeReason':'Local load/inference qualification required' if supported else 'Exact bundled runtime and artifact not qualified',
            'testStatus':'ungetestet','historicalEvidence':{'contentPassed':12,'strictPassed':5,'tasks':16,
                'device':'Ryzen 5950X / Arc A770','configuration':'Ollama QAD Q4_0 Thinking 8K',
                'transferAllowed':False,'smallCpuConfirmed':False} if supported else None,
            'licenseLabel':model.get('license_name') or model.get('license_tag') or 'See publisher license',
            'licenseText':model.get('license_text'),'licenseDigest':model.get('license_sha256'),
            'gated':bool(model.get('gated')),'artifact':chosen,
            'installQualified':bool(supported and parameters and model.get('license_sha256') and chosen.get('sha256')),
            'commercialRequired':False,
            'tasks':['chat','summary'] if supported else ['research']})
    by_identity = {entry['id']: entry for entry in entries}
    for identity, metadata in CURATION.items():
        if identity not in by_identity:
            by_identity[identity] = browse_entry(metadata)
        else:
            # Curated labels cannot promote a metadata record into an executable model.
            by_identity[identity].update(curated=True, curation=metadata,
                name=metadata['name'], publisher=metadata['publisher'])
    for identity, entry in by_identity.items():
        if identity not in CURATION:
            entry['curated'] = False
    _, engines, artifacts = load_registry()
    for identity, artifact in artifacts.items():
        if identity not in CURATION:
            raise ValueError('executable_model_not_curated')
        by_identity[identity] = enrich_entry(by_identity[identity], artifact, engines)
    for identity,(code,reason) in UNAVAILABLE_MODELS.items():
        if identity in by_identity and identity not in artifacts:
            by_identity[identity].update(runtimeReason=reason,runtimeReasonCode=code)
    return list(by_identity.values())

class ModelStore:
    def __init__(self, cache, scope, repository, *, entitlements=None):
        self.scope=scope; self.cache=Path(cache); self.repository=Path(repository)
        self.key=_scope_key(scope); self.entitlements=entitlements or Entitlements()
        with _cache_directory(self.cache,('model-store',self.key)) as root: self.root=root
        self.lock=threading.RLock(); self.jobs={}; self.sessions={}
        self.inputs={}
        self._prepared_sessions=weakref.WeakKeyDictionary()
        self._prepared_observations=weakref.WeakKeyDictionary()
        self.registry_revision,self.engines,self.artifacts=load_registry()
        self.entries={item['id']:item for item in catalog_entries()}
        self.state=_read(self.root/'state.json',{'installed':{},'active':None,'receipts':[]})
        self.history=_read(self.root/'history.json',[])
        # A saved deliberate selection survives; jobs/sessions do not. Every use
        # must revalidate hardware, device proof, license and actual file hashes.
        self.device=_read(self.root/'device.json',None)

    def _persist(self):
        _write(self.root/'state.json',self.state)
        _write(self.root/'history.json',self.history)

    def _entry(self, identity):
        if identity not in self.entries: raise ValueError('model_not_curated')
        if not self.entries[identity].get('curated') and identity not in self.state['installed']:
            raise ValueError('model_not_curated')
        entry=self.entries[identity]
        if os.name=='nt' and entry.get('artifactManifest'):
            directory=self.root/'models'/_model_key(entry)
            if any(len(str(directory/fact.relative_path))+8>=260 for _,fact in entry['artifactManifest']['fileObjects']):
                raise ValueError('local_model_path_too_long')
        return entry

    def _license(self, entry):
        total=entry.get('totalParameters')
        if total is not None and (type(total) is not int or total<=0):
            raise ValueError('model_parameter_count_invalid')
        if entry.get('artifactManifest'):
            artifact=entry['artifactManifest']
            if artifact['license'] not in ('mit','apache-2.0') or hashlib.sha256(artifact['licenseText'].encode()).hexdigest()!=entry['licenseDigest']:
                raise ValueError('publisher_license_identity_invalid')

    def _engine(self,entry,backend='cpu'):
        artifact=entry.get('artifactManifest')
        if not artifact:raise ValueError('artifact_qualification_incomplete')
        matches=[self.engines[identity] for identity in artifact['engineIds'] if self.engines[identity]['backend']==backend]
        if len(matches)!=1:raise ValueError('qualified_engine_backend_unavailable')
        return matches[0]

    def _gpu_binding(self):
        from .store_gpu import select_binding
        return select_binding(self.device)

    def _preliminary_gpu_capacity(self):
        from .store_gpu import preliminary_capacity_bytes
        return preliminary_capacity_bytes(self._gpu_binding())

    def _gpu_runtime_budget(self,entry):
        from .store_gpu import OwnedGpuBudget
        return OwnedGpuBudget(self._gpu_binding(),entry['recommendedVramBytes'],self.scope.key)

    def _gpu_proof_matches(self,proof):
        config=proof.get('configuration',{})
        if config.get('backend','cpu')!='vulkan':return True
        try:binding=self._gpu_binding().public()
        except ValueError:return False
        admission=config.get('gpuProcessAdmission',{})
        return (isinstance(admission,dict) and config.get('gpuBinding')==binding and admission.get('binding')==binding
                and admission.get('source')=='owned_process_budget'
                and type(admission.get('processId')) is int and admission['processId']>0
                and bool(admission.get('processCreationTime')) and bool(admission.get('budgetOwnerRef'))
                and admission.get('initialObservationUsageFullyCounted') is True
                and type(admission.get('initializationBeforeBudgetMs')) in (int,float)
                and 0<=admission['initializationBeforeBudgetMs']<=1000)

    def bind_hardware(self, hardware):
        # Authenticated Main supplied scan bound by existing scan broker.
        self.device=hardware.model_dump(mode='json',by_alias=True)
        _write(self.root/'device.json',self.device)

    def eligibility(self, entry,backend='cpu'):
        reasons=[]; state='unknown'; hardware=self.device
        if entry['runtimeStatus']=='unknown': reasons.append('runtime_compatibility_unknown')
        if entry.get('runtimeReasonCode'):reasons.append(entry['runtimeReasonCode'])
        if not entry['installQualified']: reasons.append('artifact_qualification_incomplete')
        engine=None
        try:engine=self._engine(entry,backend)
        except ValueError as exc:reasons.append(str(exc))
        if hardware:
            try: age=time.time()-__import__('datetime').datetime.fromisoformat(hardware['observedAt'].replace('Z','+00:00')).timestamp()
            except (ValueError,KeyError): age=999999
            ram=hardware.get('ramAvailableBytes',{}); disk=hardware.get('diskFreeBytes',{})
            if age<0 or age>30: reasons.append('hardware_scan_stale')
            elif hardware['os']!='win32' or hardware['arch']!='x64': reasons.append('runtime_platform_unsupported')
            elif engine and engine['manifestObject'].required_cpu_features and not hardware.get('cpuFeaturesVerified'): reasons.append('cpu_features_unknown')
            elif ram.get('status')!='measured' or disk.get('status')!='measured': reasons.append('hardware_measurement_unknown')
            elif entry['recommendedRamBytes'] is not None:
                if ram['value']<entry['recommendedRamBytes']+4*GIB: state='too_large';reasons.append('insufficient_available_ram')
                elif disk['value']<entry['downloadBytes']*2: state='too_large';reasons.append('insufficient_disk_staging')
                elif not reasons: state='likely_suitable'
            if backend=='vulkan':
                required=entry.get('recommendedVramBytes')
                try:capacity=self._preliminary_gpu_capacity()
                except ValueError as error:capacity=0;reasons.append(str(error))
                if not required or capacity<required:
                    state='too_large';reasons.append('insufficient_preliminary_dedicated_capacity')
                if entry.get('artifactManifest',{}).get('category')=='text' and not entry['artifactManifest'].get('gpuLayers'):
                    reasons.append('model_gpu_layer_configuration_unknown')
            if entry['downloadBytes'] is None and entry['totalParameters'] and ram.get('status')=='measured':
                if entry['totalParameters']/4>ram['value']:state='too_large';reasons.append('parameter_lower_bound_exceeds_ram')
        else: reasons.append('hardware_scan_required')
        try:self._license(entry)
        except ValueError as e: reasons.append(str(e))
        result={'state':state,'reasons':reasons,'allowed':state=='likely_suitable' and not reasons}
        if backend=='vulkan':
            from .store_gpu import adapter_candidates,preliminary_capacity_bytes
            result['requiresOwnedProcessAdmission']=True
            result['adapterCapacityCandidates']=[{**binding.public(),'preliminaryCapacityBytes':preliminary_capacity_bytes(binding),
                'processBudgetKnown':False} for binding in adapter_candidates(self.device)]
        return result

    def _download_allowed(self,entry):
        if not entry.get('artifactManifest') or not entry.get('installQualified'):return False
        device=self.device or {};disk=device.get('diskFreeBytes',{});ram=device.get('ramAvailableBytes',{})
        try:age=time.time()-__import__('datetime').datetime.fromisoformat(device['observedAt'].replace('Z','+00:00')).timestamp()
        except (ValueError,KeyError):return False
        return (0<=age<=30 and device.get('os')=='win32' and device.get('arch')=='x64'
            and disk.get('status')=='measured' and type(disk.get('value')) is int
            and disk['value']>=2*(entry['downloadBytes']+self._engine(entry)['archiveObject'].bytes)
            and ram.get('status')=='measured' and type(ram.get('value')) is int and ram['value']>=512*1024**2)

    def execution(self,entry):
        artifact=entry.get('artifactManifest');kind=artifact['category'] if artifact else entry.get('curation',{}).get('category','text')
        eligible=self.eligibility(entry)
        result={'state':'browse_only','kind':kind,'downloadAllowed':False,'benchmarkAllowed':False,
                'activateAllowed':False,'executeAllowed':False,'reasonCodes':eligible['reasons'],'availableBackends':[]}
        if not artifact:return result
        result.update(state='download_qualified',downloadAllowed=self._download_allowed(entry))
        if artifact.get('media'):result['media']=artifact['media']
        backends=[self.engines[identity]['backend'] for identity in artifact['engineIds']]
        result['availableBackends']=[backend for backend in backends if self.eligibility(entry,backend)['allowed']]
        result.update(engineId=self._engine(entry)['id'],backend='cpu')
        installed=self.state['installed'].get(entry['id'])
        if not installed or installed.get('bundleDigest')!=artifact['bundleDigest']:return result
        result.update(state='installed_verified',benchmarkAllowed=eligible['allowed'])
        proofs=[r for r in self.history if r.get('modelId')==entry['id'] and r.get('origin')=='local'
                and r.get('bundleDigest')==artifact['bundleDigest'] and r.get('technicalPass')
                and r.get('deviceFingerprint')==_device_identity(self.device) and self._gpu_proof_matches(r)]
        proofs=[proof for proof in proofs if proof.get('runtimeDigest')==_digest(self._engine(entry,proof.get('configuration',{}).get('backend','cpu'))['manifestObject'].model_dump(mode='json',by_alias=True))
                and proof.get('sha256')==_digest({key:value for key,value in proof.items() if key!='sha256'})]
        if not proofs:return result
        proof=proofs[-1];backend=proof.get('configuration',{}).get('backend','cpu')
        result.update(state='device_runtime_verified',engineId=self._engine(entry,backend)['id'],backend=backend)
        if proof.get('recommendation') in ('chat_candidate','media_candidate'):
            allowed=self.eligibility(entry,backend)['allowed']
            result.update(state='chat_or_media_qualified',activateAllowed=allowed and kind=='text',executeAllowed=allowed)
        return result

    def provider_capability(self,model_id,*,agentic=False,backend=None,compute_owner=None,_runtime_observation=None):
        """Public metadata only; model evidence never changes user permissions."""
        entry=self._entry(model_id);artifact=entry.get('artifactManifest')
        if not artifact or artifact['category']!='text':return {'state':'unavailable','reasonCode':'text_model_not_qualified'}
        installed=self.state['installed'].get(model_id)
        if not installed or installed.get('bundleDigest')!=artifact['bundleDigest']:
            return {'state':'unavailable','reasonCode':'model_not_installed_verified'}
        proofs=[]
        for proof in self.history:
            selected=proof.get('configuration',{}).get('backend','cpu')
            configuration=proof.get('configuration',{})
            if configuration.get('contextTokens')!=4096 or configuration.get('maxOutputTokens')!=768 or configuration.get('contextShift') is not False:continue
            if backend is not None and selected!=backend:continue
            if (proof.get('origin')!='local' or proof.get('modelId')!=model_id
                    or proof.get('bundleDigest')!=artifact['bundleDigest'] or not proof.get('technicalPass')
                    or proof.get('recommendation')!='chat_candidate' or proof.get('deviceFingerprint')!=_device_identity(self.device)):
                continue
            if selected not in ('cpu','vulkan'):continue
            if not self._gpu_proof_matches(proof):continue
            manifest=self._engine(entry,selected)['manifestObject']
            if (proof.get('runtimeDigest')!=_digest(manifest.model_dump(mode='json',by_alias=True))
                    or proof.get('sha256')!=_digest({key:value for key,value in proof.items() if key!='sha256'})):continue
            samples=proof.get('samples',[])
            checked={axis:[sample.get('evaluation',{}).get(axis) for sample in samples
                           if sample.get('evaluation',{}).get(axis) in ('pass','fail')] for axis in ('format','tool','security')}
            tools=(proof.get('mode')=='standard' and len(samples)==48 and not proof.get('unsafeToolOrSecurityFailure')
                   and proof.get('toolApiProbe',{}).get('version')=='llama-cpp-tool-api-roundtrip-v1'
                   and proof.get('toolApiProbe',{}).get('passed') is True
                   and all(checked[axis] and all(value=='pass' for value in checked[axis]) for axis in checked))
            if agentic and not tools:continue
            proofs.append((proof,selected,tools))
        if not proofs:return {'state':'unavailable','reasonCode':'local_standard_tool_quality_proof_required' if agentic else 'successful_device_benchmark_required'}
        proof,selected,tools=proofs[-1]
        admitted=False
        if compute_owner is not None:
            from runtime.independent.manager import ComputeAdmission
            # Only our running captured child may reuse its already reserved RAM.
            # A caller-provided owner alone never bypasses hardware admission.
            with self.lock:
                admitted=any(getattr(session,'_store_compute_owner',None)==compute_owner
                    and session.artifact_id==model_id and session.process is not None
                    and session.process.poll() is None for session,_ in self.sessions.values())
            if admitted:
                token=ComputeAdmission.borrow(compute_owner,self.scope)
                admitted=ComputeAdmission.borrow_valid(compute_owner,token,self.scope)
                ComputeAdmission.release_borrow(compute_owner,token,self.scope)
                if getattr(self,'authorize',None):self.authorize()
        if _runtime_observation is not None:
            self._refresh_runtime_observation(_runtime_observation,entry,selected,own_process_admitted=admitted)
        elif not admitted and not self.eligibility(entry,selected)['allowed']:return {'state':'unavailable','reasonCode':'fresh_hardware_admission_required'}
        return {'state':'ready','artifactId':model_id,'artifactRevision':entry['revision'],'bundleDigest':artifact['bundleDigest'],
            'backend':selected,'runtimeBuild':proof['runtimeBuild'],'runtimeDigest':proof['runtimeDigest'],
            'evidenceRef':proof['id'],'toolCallingQualified':tools,'contextTokens':4096,'maxOutputTokens':768,'parallelRequests':1}

    @staticmethod
    def _prepared_identity(session):
        gpu=getattr(session,'gpu_budget',None)
        return (str(session.binary),tuple(session.arguments),session.artifact_id,session.port,session.token,
                _digest(gpu.binding.public()) if gpu else None)

    def _memory_budget(self,entry):
        from .store_budget import capture_runtime_memory_budget
        return capture_runtime_memory_budget(entry['recommendedRamBytes'],self.scope.key)

    def _capture_runtime_observation(self,entry,backend):
        from .store_observation import capture_runtime_observation
        if getattr(self,'authorize',None):self.authorize()
        return capture_runtime_observation(hardware=self.device,scope_key=self.scope.key,
            device_fingerprint=_device_identity(self.device),bundle_digest=entry['artifactManifest']['bundleDigest'],
            runtime_digest=_digest(self._engine(entry,backend)['manifestObject'].model_dump(mode='json',by_alias=True)),
            cache_root=self.root,required_ram=entry['recommendedRamBytes'],required_disk=entry['downloadBytes']*2)

    def _refresh_runtime_observation(self,observation,entry,backend,own_process_admitted=False):
        from .store_observation import ScopedRuntimeObservation
        if type(observation) is not ScopedRuntimeObservation:raise ValueError('scoped_runtime_observation_required')
        if getattr(self,'authorize',None):self.authorize()
        return observation.refresh(scope_key=self.scope.key,device_fingerprint=_device_identity(self.device),
            bundle_digest=entry['artifactManifest']['bundleDigest'],
            runtime_digest=_digest(self._engine(entry,backend)['manifestObject'].model_dump(mode='json',by_alias=True)),
            cache_root=self.root,required_ram=entry['recommendedRamBytes'],required_disk=entry['downloadBytes']*2,
            own_process_admitted=own_process_admitted)

    def prepared_provider_capability(self,prepared,model_id,*,agentic=True,backend=None,compute_owner=None):
        with self.lock:
            binding=self._prepared_sessions.get(prepared)
            observation=self._prepared_observations.get(prepared)
        if (not binding or binding[0]!=model_id or binding[1]!=agentic or binding[3]!=self.scope.key
                or binding[5]!=self._prepared_identity(prepared) or binding[2].is_set() or observation is None):
            raise ValueError('prepared_provider_identity_mismatch')
        return self.provider_capability(model_id,agentic=agentic,backend=backend,compute_owner=compute_owner,
                                        _runtime_observation=observation)

    def prepare_provider_session(self,model_id,*,cancel,agentic=True,backend=None):
        """Verify and choose private endpoint/key, without spawning or reserving compute."""
        if cancel.is_set():raise InstallCancelled()
        capability=self.provider_capability(model_id,agentic=agentic,backend=backend)
        if capability['state']!='ready':raise ValueError(capability['reasonCode'])
        entry=self._entry(model_id)
        session,_=self._session(entry,cancel,capability['backend'])
        if getattr(self,'authorize',None):self.authorize()
        with self.lock:
            self._prepared_sessions[session]=(model_id,agentic,cancel,self.scope.key,
                _digest(capability),self._prepared_identity(session))
            if not hasattr(self,'_prepared_observations'):self._prepared_observations=weakref.WeakKeyDictionary()
            self._prepared_observations[session]=getattr(session,'_runtime_observation',None)
        return session,capability

    @contextmanager
    def provider_session(self,model_id,*,cancel,agentic=False,backend=None,compute_owner=None,prepared=None):
        """Internal scoped provider lease. Never expose the token to a renderer."""
        capability=(self.prepared_provider_capability(prepared,model_id,agentic=agentic,backend=backend)
            if prepared is not None else self.provider_capability(model_id,agentic=agentic,backend=backend))
        if capability['state']!='ready':raise ValueError(capability['reasonCode'])
        entry=self._entry(model_id);selected=capability['backend']
        observation=self._prepared_observations.get(prepared) if prepared is not None else None
        self._guard(entry,True,selected,execution=True,_runtime_observation=observation)
        if prepared is not None:
            with self.lock:binding=self._prepared_sessions.get(prepared)
            expected=(model_id,agentic,cancel,self.scope.key,_digest(capability),self._prepared_identity(prepared))
            if binding!=expected:raise ValueError('prepared_provider_identity_mismatch')
            if prepared.process is not None and prepared.process.poll() is None:raise ValueError('prepared_provider_already_running')
            # Rehash artifacts and engine on every restart, even when the SDK
            # retains this turn's endpoint/key through tool round trips.
            self._verify(entry,cancel)
            verify_engine(engine_directory(self.root,self.repository,self._engine(entry,selected)),self._engine(entry,selected))
            observation=self._refresh_runtime_observation(observation,entry,selected)
            with self.lock:self._prepared_observations[prepared]=observation
            prepared._runtime_observation=observation
        if not _EXECUTION.acquire(False):raise ValueError('local_compute_busy')
        from runtime.independent.manager import ComputeAdmission
        owner=uuid.uuid4().hex;session=None;admitted=False;borrow=None;stopped=threading.Event();watcher=None
        try:
            if compute_owner is not None:borrow=ComputeAdmission.borrow(compute_owner,self.scope)
            else:
                admitted=ComputeAdmission.acquire(owner,self.scope)
                if not admitted:raise ValueError('local_compute_busy')
            with self.lock:
                if self.sessions or any(job['state'] in _RUNNING for job in self.jobs.values()):raise ValueError('model_store_busy')
                if prepared is None:session,_=self._session(entry,cancel,selected)
                else:session=prepared
                session._store_compute_owner=compute_owner
                session.production_budget=self._memory_budget(entry)
                self.sessions[owner]=(session,cancel)
            def watch():
                while not stopped.wait(.1):
                    try:
                        if cancel.is_set():raise InstallCancelled()
                        if not session.production_budget.reserve_available():raise RuntimeError('system_ram_reserve_breached')
                        if borrow and not ComputeAdmission.borrow_valid(compute_owner,borrow,self.scope):raise InstallCancelled()
                        if getattr(self,'authorize',None):self.authorize()
                    except Exception:cancel.set();session.stop();return
            watcher=threading.Thread(target=watch,daemon=True);watcher.start()
            if borrow and not ComputeAdmission.borrow_valid(compute_owner,borrow,self.scope):raise InstallCancelled()
            if getattr(self,'authorize',None):self.authorize()
            session.start(cancel,timeout=45)
            if getattr(self,'authorize',None):self.authorize()
            if borrow and not ComputeAdmission.borrow_valid(compute_owner,borrow,self.scope):raise InstallCancelled()
            if cancel.is_set():raise InstallCancelled()
            yield session,capability
            if getattr(self,'authorize',None):self.authorize()
            if borrow and not ComputeAdmission.borrow_valid(compute_owner,borrow,self.scope):raise InstallCancelled()
            if cancel.is_set():raise InstallCancelled()
        finally:
            stopped.set()
            if watcher:watcher.join(1)
            with self.lock:self.sessions.pop(owner,None)
            release=lambda:ComputeAdmission.release_borrow(compute_owner,borrow,self.scope)
            if not _release_after_exit(session,owner,admitted,release if borrow else None):raise RuntimeError('own_session_shutdown_pending')

    def view(self):
        with self.lock:
            models=[]
            for item in self.entries.values():
                # Keep installed legacy models manageable, without presenting old
                # bootstrap/catalog entries as newly approved recommendations.
                if not item.get('curated') and item['id'] not in self.state['installed']:
                    continue
                eligibility=self.eligibility(item)
                installed=self.state['installed'].get(item['id'])
                public={key:value for key,value in item.items() if key!='artifactManifest'}
                execution=self.execution(item)
                models.append({**public,'eligibility':eligibility,'installed':installed,'execution':execution,
                    'active':self.state['active']==item['id'],
                    'deviceConfirmed':execution['state'] in ('device_runtime_verified','chat_or_media_qualified')})
            restored=[{'id':identity,'operation':'generate','modelId':saved['modelId'],'state':'complete','mode':'previous',
                'progress':1,'total':1,'downloadedBytes':0,'error':None,'result':saved['result']}
                for identity,saved in self.state.get('mediaResults',{}).items() if identity not in self.jobs]
            return {'catalogRevision':CURATION_REVISION,'models':models,'hardware':self.device,
                'jobs':[self._job_view(j) for j in self.jobs.values()]+restored,
                'history':[self._summary(r) for r in self.history],
                'entitlement':{'largeModelsAllowed':self.entitlements.permits_large_local_models(self.scope),
                    'status':'open_source_no_size_restriction','threshold':None},
                'suite':{'version':SUITE_VERSION,'sha256':SUITE_HASH,'cases':16,'quickCases':6,'standardRepeats':3}}

    @staticmethod
    def _summary(r):
        return {k:v for k,v in r.items() if k!='samples'}

    @staticmethod
    def _job_view(job):
        return {k:v for k,v in job.items() if k not in ('cancel','thread','session','sourcePath','sampler','mediaRequest','assetNames')}

    def _guard(self, entry, installed=False,backend='cpu',execution=False,_runtime_observation=None):
        authorize=getattr(self,'authorize',None)
        if authorize:authorize()
        self._license(entry)
        if installed:
            if _runtime_observation is not None:self._refresh_runtime_observation(_runtime_observation,entry,backend)
            elif not self.eligibility(entry,backend)['allowed']:raise ValueError('model_not_hardware_runtime_qualified')
        if not installed and not self._download_allowed(entry):raise ValueError('model_download_not_safely_admitted')
        if installed and entry['id'] not in self.state['installed']: raise ValueError('model_not_installed')
        if installed and self.state['installed'][entry['id']].get('bundleDigest')!=entry['artifactManifest']['bundleDigest']:
            raise ValueError('installed_model_bundle_identity_mismatch')
        if execution:engine_directory(self.root,self.repository,self._engine(entry,backend))

    def _path(self, entry):
        return self.root/'models'/_model_key(entry)/entry['artifact']['filename']

    def _verify(self, entry, cancel):
        directory=self.root/'models'/_model_key(entry)
        for _,fact in entry['artifactManifest']['fileObjects']:
            with _cache_directory(directory,tuple(Path(fact.relative_path).parts[:-1])) as parent:
                with _open_file(parent/Path(fact.relative_path).name) as stream:_verified(stream,fact,cancel)
        return self._path(entry)

    def start(self, request):
        op=request['operation']; entry=self._entry(request.get('modelId')); backend=request.get('backend','cpu')
        if backend not in ('cpu','vulkan'):raise ValueError('runtime_backend_invalid')
        media=entry.get('artifactManifest',{}).get('category') in ('image','video')
        if op=='generate':
            from .store_media import validate_media_request
            if not media:raise ValueError('media_model_required')
            validate_media_request(request,entry['artifactManifest'])
            capability=self.execution(entry)
            if not capability['executeAllowed']:raise ValueError('successful_device_benchmark_required')
            backend=capability['backend']
        if op=='importModel' and entry.get('artifactManifest',{}).get('category')!='text':raise ValueError('media_bundle_import_not_supported')
        self._guard(entry,op not in ('install','importModel'),backend)
        if op in ('install','importModel') and request.get('licenseDigest')!=entry['licenseDigest']: raise ValueError('publisher_license_acceptance_required')
        mode=request.get('mode','quick')
        if mode not in ('quick','standard'): raise ValueError('benchmark_mode_invalid')
        with self.lock:
            identity=request['requestId']
            previous=next((j for j in self.jobs.values() if j['requestId']==identity),None)
            if previous:
                if previous['operation']!=op or previous['modelId']!=entry['id'] or previous['mode']!=mode or previous.get('backend','cpu')!=backend: raise ValueError('request_identity_conflict')
                return self._job_view(previous)
            if any(j['state'] in _RUNNING for j in self.jobs.values()) or self.sessions: raise ValueError('model_store_busy')
            job={'id':uuid.uuid4().hex,'requestId':identity,'operation':op,'modelId':entry['id'],'mode':mode,'backend':backend,
                'state':'pending','progress':0,'total':1 if media else 6 if mode=='quick' else 48,'downloadedBytes':0,
                'createdAt':time.time(),'updatedAt':time.time(),'error':None,'cancel':threading.Event()}
            self.jobs[job['id']]=job
            if op=='importModel':job['sourcePath']=request['sourcePath']
            if media:job['mediaRequest']={key:request[key] for key in ('prompt','width','height','steps','seed','frames','fps','referenceImageAssetId','audioAssetId') if key in request}
            thread=threading.Thread(target=self._run,args=(job,entry),daemon=True);job['thread']=thread;thread.start()
            return self._job_view(job)

    def _update(self,job,**values):
        with self.lock:job.update(values,updatedAt=time.time())

    def _run(self,job,entry):
        if not _EXECUTION.acquire(blocking=False):self._update(job,state='failed',error='local_compute_busy');return
        from runtime.independent.manager import ComputeAdmission
        admitted=False;scope_stopped=threading.Event();watcher=None
        try:
            admitted=ComputeAdmission.acquire(job['id'],self.scope)
            if not admitted:raise ValueError('local_compute_busy')
            authorize=getattr(self,'authorize',None)
            def watch_scope():
                while not scope_stopped.wait(.25):
                    try:
                        if authorize:authorize()
                        session=job.get('session');budget=getattr(session,'production_budget',None)
                        if budget is not None and not budget.reserve_available():raise RuntimeError('system_ram_reserve_breached')
                    except Exception:
                        job['cancel'].set()
                        if job.get('session'):job['session'].stop()
                        return
            watcher=threading.Thread(target=watch_scope,daemon=True);watcher.start()
            self._guard(entry,job['operation'] not in ('install','importModel'),job['backend'])
            self._update(job,state='running')
            engine=self._engine(entry,job['backend'])
            prepare_engine(self.root,self.repository,engine,job['cancel'],
                lambda size:self._update(job,state='downloading',downloadedBytes=job['downloadedBytes']+size))
            if job['operation'] in ('install','importModel'):
                with _cache_directory(self.root,('models',_model_key(entry))) as directory:
                    if shutil.disk_usage(directory).free<entry['downloadBytes']*2: raise ValueError('cache_disk_insufficient_for_staging')
                    cancel=job['cancel']; installer=LocalAiInstaller(None,None,transport=HubTransport())
                    for role,fact in entry['artifactManifest']['fileObjects']:
                        with _cache_directory(directory,tuple(Path(fact.relative_path).parts[:-1])) as parent:
                            target=parent/Path(fact.relative_path).name;partial=target.with_name(target.name+'.partial')
                            if target.exists():
                                with _open_file(target) as stream:_verified(stream,fact,cancel)
                                continue
                            def transferred(size):self._update(job,state='downloading',downloadedBytes=job['downloadedBytes']+size)
                            if job['operation']=='importModel' and role=='model':
                                source=Path(job['sourcePath'])
                                if source.is_symlink() or not source.is_file() or source.stat().st_size!=fact.bytes:raise ValueError('imported_model_identity_mismatch')
                                with _open_file(source) as stream:_verified(stream,fact,cancel)
                                with _open_file(source) as stream,_open_file(partial,create=True) as destination:
                                    destination.seek(0);destination.truncate()
                                    while chunk:=stream.read(256*1024):
                                        if cancel.is_set():raise InstallCancelled()
                                        destination.write(chunk);transferred(len(chunk))
                                    destination.flush();os.fsync(destination.fileno())
                                with _open_file(partial) as stream:_verified(stream,fact,cancel)
                            elif fact.kind=='license':
                                from .store_notices import NoticeTransport,notice_url
                                notices=LocalAiInstaller(None,None,transport=NoticeTransport())
                                notices._download(fact,partial,cancel,transferred,lambda:self._update(job,state='verifying'),source_validator=notice_url)
                            else:installer._download(fact,partial,cancel,transferred,lambda:self._update(job,state='verifying'))
                            if cancel.is_set():raise InstallCancelled()
                            self._license(entry)
                            if target.exists() or target.is_symlink():raise ValueError('cache_destination_appeared')
                            os.replace(partial,target)
                    self._verify(entry,cancel)
                    with self.lock:
                        self.state['installed'][entry['id']]={'artifactSha256':entry['artifact']['sha256'],
                            'bundleDigest':entry['artifactManifest']['bundleDigest'],'bytes':entry['downloadBytes'],
                            'revision':entry['revision'],'verifiedAt':time.time()}
                        self._persist()
                self._update(job,state='complete')
            elif entry['artifactManifest']['category'] in ('image','video'):self._media(job,entry)
            else:self._benchmark(job,entry)
        except InstallCancelled:self._update(job,state='cancelled')
        except Exception as error:self._update(job,state='cancelled' if job['cancel'].is_set() else 'failed',error=None if job['cancel'].is_set() else _safe_error(error))
        finally:
            scope_stopped.set()
            if watcher:watcher.join(1)
            if job.get('sampler'):job['sampler'].close()
            session=job.get('session')
            if not _release_after_exit(session,job['id'],admitted):self._update(job,state='failed',error='own_session_shutdown_pending')
            else:
                for identity,value in list(self.inputs.items()):
                    if value.get('releaseWhenDone'):self.release_input(identity)

    def pick_input(self,model_id,kind,source,asset_id):
        from .store_inputs import copy_media_input
        entry=self._entry(model_id);artifact=entry.get('artifactManifest')
        if not artifact or not artifact.get('media') or kind not in artifact['media'].get('requiredInputs',[]):
            raise ValueError('media_input_not_required_for_model')
        with self.lock:
            if len(self.inputs)>=16:raise ValueError('media_input_limit')
            descriptor,name,digest,size=copy_media_input(self.root,kind,source,asset_id)
            self.inputs[asset_id]={'descriptor':descriptor,'name':name,'sha256':digest,'bytes':size,'kind':kind,'modelId':model_id}
            return descriptor

    def release_input(self,identity):
        with self.lock:
            value=self.inputs.get(identity)
            if not value:return
            used=any(identity in (job.get('mediaRequest',{}).get('referenceImageAssetId'),job.get('mediaRequest',{}).get('audioAssetId'))
                     and job['state'] in _RUNNING for job in self.jobs.values())
            if used:value['releaseWhenDone']=True;return
            with _cache_directory(self.root,('inputs',identity)) as directory:
                target=directory/value['name']
                if target.exists():
                    with _open_file(target):pass
                    target.unlink()
            self.inputs.pop(identity,None)

    def _media_inputs(self,entry,request):
        from .runtime_probe import hash_contained_file
        result={}
        for kind,field in (('reference_image','referenceImageAssetId'),('audio_wav','audioAssetId')):
            identity=request.get(field)
            if identity is None:continue
            value=self.inputs.get(identity)
            if not value or value.get('releaseWhenDone') or value['kind']!=kind or value['modelId']!=entry['id']:
                raise ValueError('media_input_scope_or_purpose_mismatch')
            relative=f"inputs/{identity}/{value['name']}"
            if hash_contained_file(self.root,relative,value['bytes'])!=(value['bytes'],value['sha256']):
                raise ValueError('media_input_integrity_failed')
            result[kind]=self.root/relative
        if set(result)!=set(entry['artifactManifest']['media'].get('requiredInputs',[])):
            raise ValueError('media_required_input_missing')
        return result

    def _media(self,job,entry):
        from .store_media import MediaProcess,build_media_args,collect_media
        artifact=entry['artifactManifest'];config=artifact['media'];cancel=job['cancel']
        self._guard(entry,True,job['backend'],execution=True);self._verify(entry,cancel)
        engine=self._engine(entry,job['backend']);manifest=engine['manifestObject']
        binary=verify_engine(engine_directory(self.root,self.repository,engine),engine)
        request={'prompt':'A simple blue ceramic cup on a plain white table, natural light.',
            'width':config['width']['min'],'height':config['height']['min'],'steps':config['steps']['min'],'seed':17,
            **({'frames':config['frames']['min'],'fps':config['fps']['default']} if artifact['category']=='video' else {}),**job.get('mediaRequest',{})}
        started=time.monotonic()
        with _cache_directory(self.root,('media',job['id'])) as directory:
            inputs=self._media_inputs(entry,request)
            gpu=self._gpu_runtime_budget(entry) if job['backend']=='vulkan' else None
            args=build_media_args(artifact,self.root/'models'/_model_key(entry),directory,request,job['backend'],entry['recommendedVramBytes'] if gpu else 0,inputs)
            budget=self._memory_budget(entry)
            session=MediaProcess(binary,args,directory,entry['recommendedRamBytes'],budget,gpu);job['session']=session
            session.run(cancel,timeout=900 if artifact['category']=='video' else 300)
            if getattr(self,'authorize',None):self.authorize()
            self._license(entry)
            result,paths=collect_media(directory,artifact,request)
            job['assetNames']=[path.name for path in paths]
            elapsed=(time.monotonic()-started)*1000
            receipt={'schemaVersion':1,'id':uuid.uuid4().hex,'modelId':entry['id'],'artifactSha256':entry['artifact']['sha256'],
                'bundleDigest':artifact['bundleDigest'],'runtimeBuild':manifest.build_ref,
                'runtimeDigest':_digest(manifest.model_dump(mode='json',by_alias=True)),
                'suite':'stable-diffusion-png-technical-v1','suiteSha256':_digest({'decoder':'Pillow','result':'png-frames-v1'}),
                'validator':'png-decoder-dimensions-v1','mode':job['mode'],'origin':'local','createdAt':time.time(),
                'deviceFingerprint':_device_identity(self.device),'configuration':{**{key:value for key,value in request.items() if key!='prompt'},
                    'pipeline':config['pipeline'],'backend':job['backend'],
                    **({'gpuBinding':gpu.binding.public(),'gpuProcessAdmission':gpu.receipt()} if gpu else {})},
                'coldStartMs':elapsed,'medianResponseMs':elapsed,'firstVisibleTokenMs':None,
                'peakObservedRamBytes':session.peak_ram,'peakObservedVramBytes':gpu.peak_usage if gpu else None,'technicalPass':True,
                'counts':{'content':0,'format':1,'tool':0,'security':0,'technical':1},'sampleCount':1,
                'samples':[{'caseId':'media_preview','response':None,'elapsedMs':elapsed,
                    'evaluation':{'content':'not_evaluated','format':'pass','tool':'not_applicable','security':'not_evaluated','technical':'pass'}}],
                'state':'complete','recommendation':'media_candidate','agentRecommendation':False,
                'unsafeToolOrSecurityFailure':False,'measurementLimitations':['Image/frame decoding and dimensions verified; prompt fidelity not evaluated',
                    'RSS/GPU usage are periodic observations; instantaneous allocation peaks may be missed','Video output is a PNG frame sequence; no MP4 encoder']}
            receipt['sha256']=_digest(receipt)
            with self.lock:
                self.history.append(receipt)
                self.state.setdefault('mediaResults',{})[job['id']]={'result':result,'assetNames':job['assetNames'],'modelId':entry['id']}
                self._persist()
            self._update(job,state='complete',progress=1,receiptId=receipt['id'],result=result)

    def read_media(self,job_id,asset_id):
        from .store_media import read_media_asset
        saved=self.state.get('mediaResults',{}).get(job_id)
        if not saved:raise ValueError('media_result_not_found')
        descriptors=saved['result']['assets']
        matches=[index for index,value in enumerate(descriptors) if value['id']==asset_id]
        if len(matches)!=1:raise ValueError('media_asset_not_found')
        index=matches[0];name=saved['assetNames'][index]
        if Path(name).name!=name or name in ('.','..'):raise ValueError('media_result_path_invalid')
        with _cache_directory(self.root,('media',job_id)) as directory:
            return read_media_asset(directory/name,descriptors[index])

    def _session(self,entry,cancel,backend='cpu'):
        if entry['artifactManifest']['category']!='text':raise ValueError('text_model_required')
        self._guard(entry,True,backend,execution=True)
        weights=self._verify(entry,cancel);engine=self._engine(entry,backend);manifest=engine['manifestObject']
        if os.name!='nt':raise ValueError('runtime_platform_unsupported')
        directory=engine_directory(self.root,self.repository,engine);binary=verify_engine(directory,engine)
        with socket.socket() as reservation:reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1]
        args=['--model',str(weights),'--alias',entry['id'],'--ctx-size','4096','--parallel','1','--host','127.0.0.1','--port',str(port),'--n-gpu-layers',str(entry['artifactManifest']['gpuLayers']) if backend=='vulkan' else '0','--threads',str(min(4,os.cpu_count() or 1))]
        args+=['--no-context-shift','--jinja']
        if backend=='vulkan':args+=['--device','Vulkan0','--split-mode','none','--fit','off','--no-warmup','--batch-size','128','--ubatch-size','64']
        session=LlamaCppSession(binary,args,entry['id'],port,uuid.uuid4().hex+uuid.uuid4().hex,timeout=45)
        session.suspended_admission=True
        session.memory_limit_bytes=entry['recommendedRamBytes']
        session.production_budget=self._memory_budget(entry)
        if backend=='vulkan':session.gpu_budget=self._gpu_runtime_budget(entry)
        session._runtime_observation=self._capture_runtime_observation(entry,backend)
        return session,manifest

    def _benchmark(self,job,entry):
        cancel=job['cancel'];session,manifest=self._session(entry,cancel,job['backend']);job['session']=session
        started=time.monotonic();session.start(cancel,timeout=45);load_ms=(time.monotonic()-started)*1000
        sampler=MemorySampler(session.process.pid);job['sampler']=sampler
        samples=[];cases=CASES[:4]+(CASES[7],CASES[10]) if job['mode']=='quick' else CASES
        timeout=45 if job['mode']=='quick' else 180
        if job['mode']=='standard':session.call('/v1/chat/completions',{'model':entry['id'],'messages':[{'role':'user','content':'Say ready.'}],'max_tokens':16,'temperature':0},timeout=timeout)
        for repeat in range(1 if job['mode']=='quick' else 3):
            for case in cases:
                if cancel.is_set():break
                t=time.monotonic()
                try:
                    payload={'model':entry['id'],'messages':[{'role':'user','content':case['prompt']}],'temperature':0,'seed':17,'max_tokens':768}
                    if entry['artifactManifest'].get('chatTemplateKwargs'):payload['chat_template_kwargs']=entry['artifactManifest']['chatTemplateKwargs']
                    answer=stream_answer(session,payload,cancel,timeout)
                    text=answer['text']
                    if not isinstance(text,str) or len(text)>65536:raise ValueError('benchmark_response_invalid')
                    tokens=answer.get('usage',{}).get('completion_tokens')
                    elapsed=(time.monotonic()-t)*1000
                    timings=answer.get('timings') or {};rate=timings.get('predicted_per_second')
                    samples.append({'caseId':case['id'],'repeat':repeat,'response':text,'elapsedMs':elapsed,'firstVisibleTokenMs':answer['firstVisibleTokenMs'],
                        'decodeTokensPerSecond':rate if type(rate) in (int,float) and 0<=rate<100000 else None,
                        'outputTokens':tokens if type(tokens) is int and tokens>=0 else None,'tokenMeasurement':'runtime_reported',
                        'evaluation':evaluate(case,text)})
                except Exception as error:
                    if cancel.is_set():break
                    samples.append({'caseId':case['id'],'repeat':repeat,'response':None,'elapsedMs':(time.monotonic()-t)*1000,
                        'evaluation':{'content':'not_evaluated','format':'not_evaluated','tool':'not_evaluated','security':'not_evaluated','technical':'fail'},'error':_safe_error(error)})
                self._update(job,progress=len(samples))
            if cancel.is_set():break
        tool_probe={'version':'llama-cpp-tool-api-roundtrip-v1','passed':False,'reasonCode':'standard_probe_required'}
        if job['mode']=='standard' and not cancel.is_set():
            from .store_tool_probe import probe_tool_api
            tool_probe=probe_tool_api(session,entry,cancel)
        sampler.close()
        counts={axis:sum(s['evaluation'][axis]=='pass' for s in samples) for axis in ('content','format','tool','security','technical')}
        technical=not cancel.is_set() and len(samples)==job['total'] and counts['technical']==len(samples)
        content_ratio=counts['content']/len(samples) if samples else 0
        unsafe=any(s['evaluation']['security']=='fail' or s['evaluation']['tool']=='fail' for s in samples)
        receipt={'schemaVersion':1,'id':uuid.uuid4().hex,'modelId':entry['id'],'artifactSha256':entry['artifact']['sha256'],
            'bundleDigest':entry['artifactManifest']['bundleDigest'],
            'toolApiProbe':tool_probe,
            'runtimeBuild':manifest.build_ref,'runtimeDigest':_digest(manifest.model_dump(mode='json',by_alias=True)),
            'suite':SUITE_VERSION,'suiteSha256':SUITE_HASH,'validator':VALIDATOR_VERSION,'mode':job['mode'],
            'origin':'local','createdAt':time.time(),'deviceFingerprint':_device_identity(self.device),
            'configuration':{'contextTokens':4096,'contextShift':False,'maxOutputTokens':768,'temperature':0,'requestedSeed':17,'seedSupport':'not_independently_verified','thinking':'disabled' if entry['artifactManifest'].get('chatTemplateKwargs') else 'runtime_default','backend':job['backend'],
                'runtimeObservation':session._runtime_observation.receipt(),
                **({'gpuBinding':session.gpu_budget.binding.public(),'gpuProcessAdmission':session.gpu_budget.receipt()} if getattr(session,'gpu_budget',None) else {})},
            'coldStartMs':load_ms,'medianResponseMs':statistics.median([s['elapsedMs'] for s in samples]) if samples else None,
            'firstVisibleTokenMs':statistics.median([s['firstVisibleTokenMs'] for s in samples if s.get('firstVisibleTokenMs') is not None]) if any(s.get('firstVisibleTokenMs') is not None for s in samples) else None,
            'peakObservedRamBytes':sampler.peak,'peakObservedVramBytes':session.gpu_budget.peak_usage if getattr(session,'gpu_budget',None) else None,
            'technicalPass':technical,'counts':counts,'sampleCount':len(samples),'samples':samples,
            'state':'cancelled' if cancel.is_set() else 'complete',
            'recommendation':'chat_candidate' if technical and content_ratio>=.75 else 'no_recommendation',
            'agentRecommendation':False,'unsafeToolOrSecurityFailure':unsafe,'measurementLimitations':['RSS sampled every 100ms; peaks may be missed',
                'Owned-process GPU usage sampled; between-sample peaks may be missed' if getattr(session,'gpu_budget',None) else 'GPU memory unavailable',
                'synthetic tools never executed']}
        receipt['sha256']=_digest(receipt)
        with self.lock:self.history.append(receipt);self._persist()
        self._update(job,state='cancelled' if cancel.is_set() else 'complete',receiptId=receipt['id'])

    def cancel(self,identity):
        with self.lock:
            job=self.jobs.get(identity)
            if not job:raise ValueError('job_not_found')
            if job['state'] not in _RUNNING:return self._job_view(job)
            self._update(job,state='stopping');job['cancel'].set();session=job.get('session')
        if session:session.stop()
        return self._job_view(job)

    def remove(self,identity):
        entry=self._entry(identity)
        with self.lock:
            if self.sessions or any(j['state'] in _RUNNING for j in self.jobs.values()):raise ValueError('model_store_busy')
            if entry['artifact'] is None:raise ValueError('artifact_qualification_incomplete')
            with _cache_directory(self.root,('models',_model_key(entry))) as directory:
                names=[fact.relative_path for _,fact in entry['artifactManifest']['fileObjects']] if entry.get('artifactManifest') else [entry['artifact']['filename']]
                for name in names:
                    with _cache_directory(directory,tuple(Path(name).parts[:-1])) as parent:
                        target=parent/Path(name).name
                        if target.is_symlink():raise ValueError('model_path_unsafe')
                        if target.exists():
                            with _open_file(target):pass
                            target.unlink()
            if self.state['active']==identity:self.state['active']=None
            self.state['installed'].pop(identity,None);self._persist()

    def export(self,identity):
        receipt=next((r for r in self.history if r['id']==identity),None)
        if receipt is None:raise ValueError('receipt_not_found')
        return receipt

    def import_receipt(self,receipt):
        if not isinstance(receipt,dict) or len(json.dumps(receipt))>4*1024*1024:raise ValueError('receipt_size_invalid')
        expected=set(['schemaVersion','id','modelId','artifactSha256','runtimeBuild','runtimeDigest','suite','suiteSha256','validator','mode','origin','createdAt','deviceFingerprint','configuration','coldStartMs','medianResponseMs','firstVisibleTokenMs','peakObservedRamBytes','peakObservedVramBytes','technicalPass','counts','sampleCount','samples','state','recommendation','agentRecommendation','unsafeToolOrSecurityFailure','measurementLimitations','sha256'])
        if set(receipt)-{'bundleDigest','toolApiProbe'}!=expected or receipt['schemaVersion']!=1 or receipt['suite']!=SUITE_VERSION or receipt['suiteSha256']!=SUITE_HASH:raise ValueError('receipt_schema_invalid')
        if _digest({k:v for k,v in receipt.items() if k!='sha256'})!=receipt['sha256']:raise ValueError('receipt_integrity_failed')
        if not isinstance(receipt['samples'],list) or len(receipt['samples'])>48 or receipt['sampleCount']!=len(receipt['samples']):raise ValueError('receipt_samples_invalid')
        if not isinstance(receipt['counts'],dict) or set(receipt['counts'])!={'content','format','tool','security','technical'}:raise ValueError('receipt_counts_invalid')
        for sample in receipt['samples']:
            if not isinstance(sample,dict) or sample.get('caseId') not in {c['id'] for c in CASES} or not isinstance(sample.get('evaluation'),dict):raise ValueError('receipt_sample_invalid')
            if sample.get('response') is not None and (not isinstance(sample['response'],str) or len(sample['response'])>65536):raise ValueError('receipt_response_invalid')
            if type(sample.get('elapsedMs')) not in (int,float) or not 0<=sample['elapsedMs']<=200000:raise ValueError('receipt_timing_invalid')
            for axis in ('content','format','tool','security','technical'):
                if sample['evaluation'].get(axis) not in ('pass','fail','not_evaluated','not_applicable'):raise ValueError('receipt_evaluation_invalid')
        if any(type(value) is not int or value!=sum(s['evaluation'][axis]=='pass' for s in receipt['samples']) for axis,value in receipt['counts'].items()):raise ValueError('receipt_counts_mismatch')
        # Imported envelopes have a fresh local id; compare their immutable
        # observations as well so importing the same source twice stays idempotent.
        observation_keys=('modelId','artifactSha256','runtimeDigest','createdAt','deviceFingerprint','samples')
        if any(r.get('sha256')==receipt['sha256'] or all(r.get(k)==receipt.get(k) for k in observation_keys) for r in self.history):raise ValueError('receipt_duplicate')
        # Imported results never qualify this device, even a matching fingerprint.
        imported={**receipt,'id':uuid.uuid4().hex,'origin':'imported','recommendation':'imported_evidence_only','agentRecommendation':False}
        imported['sha256']=_digest({k:v for k,v in imported.items() if k!='sha256'})
        with self.lock:
            if any(r['sha256']==imported['sha256'] for r in self.history):raise ValueError('receipt_duplicate')
            self.history.append(imported);self._persist()
        return self._summary(imported)

    def delete_receipt(self,identity):
        with self.lock:self.history=[r for r in self.history if r['id']!=identity];self._persist()

    def activate(self,identity):
        entry=self._entry(identity);self._guard(entry,True)
        with self.lock:
            if any(j['state'] in _RUNNING for j in self.jobs.values()) or self.sessions:raise ValueError('model_store_busy')
            proof=next((r for r in reversed(self.history) if r['modelId']==identity and r['origin']=='local'
                and r['artifactSha256']==entry['artifact']['sha256'] and r.get('bundleDigest')==entry['artifactManifest']['bundleDigest']
                and r['technicalPass'] and r['recommendation']=='chat_candidate'
                and r['deviceFingerprint']==_device_identity(self.device) and self._gpu_proof_matches(r)
                and r.get('sha256')==_digest({key:value for key,value in r.items() if key!='sha256'})),None)
            if not proof:raise ValueError('successful_device_benchmark_required')
            backend=proof.get('configuration',{}).get('backend','cpu')
            self._guard(entry,True,backend,execution=True)
            if proof['runtimeDigest']!=_digest(self._engine(entry,backend)['manifestObject'].model_dump(mode='json',by_alias=True)):
                raise ValueError('device_benchmark_runtime_changed')
            # Persist a deliberate scoped preference; loading is request bounded.
            self.state['active']=identity;self.state['activeBackend']=backend;self._persist()

    def chat(self,text,*,cancel=None):
        if not isinstance(text,str) or not 1<=len(text)<=8192:raise ValueError('local_chat_input_invalid')
        entry=self._entry(self.state['active']);backend=self.state.get('activeBackend','cpu')
        cancel=cancel or threading.Event()
        with self.provider_session(entry['id'],cancel=cancel,backend=backend) as (session,_):
            payload={'model':entry['id'],'messages':[{'role':'user','content':text}],'max_tokens':768,'temperature':0}
            if entry['artifactManifest'].get('chatTemplateKwargs'):payload['chat_template_kwargs']=entry['artifactManifest']['chatTemplateKwargs']
            response=stream_answer(session,payload,cancel,60)
            if getattr(self,'authorize',None):self.authorize()
            if cancel.is_set():raise RuntimeError('local_chat_cancelled')
            return {'text':response['text'], 'modelId':entry['id'],'toolExecution':False}

    def stop_chat(self):
        with self.lock:sessions=list(self.sessions.values())
        for session,cancel in sessions:cancel.set();session.stop()

    def close(self):
        self.stop_chat()
        for job in list(self.jobs.values()):
            if job['state'] in _RUNNING:self.cancel(job['id'])
        for job in list(self.jobs.values()):
            if job.get('thread'):job['thread'].join(5)

def get_store(cache,scope,repository):
    key=(str(cache),_scope_key(scope))
    with _LOCK:
        if key not in _STORES:_STORES[key]=ModelStore(cache,scope,repository)
        return _STORES[key]

def shutdown_stores():
    with _LOCK:stores=list(_STORES.values())
    for store in stores:store.close()
