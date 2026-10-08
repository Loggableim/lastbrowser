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
from pathlib import Path
from .installer import LocalAiInstaller, HubTransport, _cache_directory, _open_file, _verified, InstallCancelled
from .contracts import ArtifactFile
from .model_manager import LlamaCppSession
from .runtime_bundle import private_cpu_manifest
from .runtime_probe import hash_contained_file
from .store_benchmark import CASES, SUITE_VERSION, SUITE_HASH, VALIDATOR_VERSION, evaluate
from .store_inference import stream_answer, MemorySampler

GIB = 1024 ** 3
CATALOG = json.loads((Path(__file__).parent/'store_catalog.json').read_text(encoding='utf-8'))
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

def _device_identity(device):
    if not isinstance(device,dict):return None
    return _digest({'os':device.get('os'),'arch':device.get('arch'),'cpuName':device.get('cpuName'),
        'ramTotalBytes':device.get('ramTotalBytes',{}).get('value'),
        'adapters':[(a.get('name'),a.get('vendor'),a.get('dedicatedBytes',{}).get('value')) for a in device.get('adapters',[])]})

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

def _release_after_exit(session,owner,admitted):
    from runtime.independent.manager import ComputeAdmission
    def release():
        if admitted:ComputeAdmission.release(owner)
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
        supported=model['model_id']=='LiquidAI/LFM2.5-2.6B' and chosen is not None
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
    return entries

class ModelStore:
    def __init__(self, cache, scope, repository, *, entitlements=None):
        self.scope=scope; self.cache=Path(cache); self.repository=Path(repository)
        self.key=_scope_key(scope); self.entitlements=entitlements or Entitlements()
        with _cache_directory(self.cache,('model-store',self.key)) as root: self.root=root
        self.lock=threading.RLock(); self.jobs={}; self.sessions={}
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
        return self.entries[identity]

    def _license(self, entry):
        total=entry.get('totalParameters')
        if total is not None and (type(total) is not int or total<=0):
            raise ValueError('model_parameter_count_invalid')

    def bind_hardware(self, hardware):
        # Authenticated Main supplied scan bound by existing scan broker.
        self.device=hardware.model_dump(mode='json',by_alias=True)
        _write(self.root/'device.json',self.device)

    def eligibility(self, entry):
        reasons=[]; state='unknown'; hardware=self.device
        if entry['runtimeStatus']=='unknown': reasons.append('runtime_compatibility_unknown')
        if not entry['installQualified']: reasons.append('artifact_qualification_incomplete')
        manifest=private_cpu_manifest()
        for file in manifest.files:
            path=self.repository/manifest.package_relative_dir/file.relative_path
            try:
                if path.is_symlink() or not path.is_file() or path.stat().st_size!=file.bytes:raise OSError()
            except OSError:reasons.append('pinned_runtime_unavailable');break
        if hardware:
            try: age=time.time()-__import__('datetime').datetime.fromisoformat(hardware['observedAt'].replace('Z','+00:00')).timestamp()
            except (ValueError,KeyError): age=999999
            ram=hardware.get('ramAvailableBytes',{}); disk=hardware.get('diskFreeBytes',{})
            if age<0 or age>30: reasons.append('hardware_scan_stale')
            elif hardware['os']!='win32' or hardware['arch']!='x64': reasons.append('runtime_platform_unsupported')
            elif private_cpu_manifest().required_cpu_features and not hardware.get('cpuFeaturesVerified'): reasons.append('cpu_features_unknown')
            elif ram.get('status')!='measured' or disk.get('status')!='measured': reasons.append('hardware_measurement_unknown')
            elif entry['recommendedRamBytes'] is not None:
                if ram['value']<entry['recommendedRamBytes']+2*GIB: state='too_large';reasons.append('insufficient_available_ram')
                elif disk['value']<entry['downloadBytes']*2: state='too_large';reasons.append('insufficient_disk_staging')
                elif not reasons: state='likely_suitable'
            if entry['downloadBytes'] is None and entry['totalParameters'] and ram.get('status')=='measured':
                if entry['totalParameters']/4>ram['value']:state='too_large';reasons.append('parameter_lower_bound_exceeds_ram')
        else: reasons.append('hardware_scan_required')
        try:self._license(entry)
        except ValueError as e: reasons.append(str(e))
        return {'state':state,'reasons':reasons,'allowed':state=='likely_suitable' and not reasons}

    def view(self):
        with self.lock:
            models=[]
            for item in self.entries.values():
                eligibility=self.eligibility(item)
                installed=self.state['installed'].get(item['id'])
                models.append({**item,'eligibility':eligibility,'installed':installed,
                    'active':self.state['active']==item['id'],
                    'deviceConfirmed':any(r.get('modelId')==item['id'] and r.get('artifactSha256')==(item.get('artifact')or{}).get('sha256') and r.get('technicalPass') and r.get('origin')=='local' and r.get('deviceFingerprint')==_device_identity(self.device) for r in self.history)})
            return {'catalogRevision':CATALOG['revision'],'models':models,'hardware':self.device,
                'jobs':[self._job_view(j) for j in self.jobs.values()],
                'history':[self._summary(r) for r in self.history],
                'entitlement':{'largeModelsAllowed':self.entitlements.permits_large_local_models(self.scope),
                    'status':'open_source_no_size_restriction','threshold':None},
                'suite':{'version':SUITE_VERSION,'sha256':SUITE_HASH,'cases':16,'quickCases':6,'standardRepeats':3}}

    @staticmethod
    def _summary(r):
        return {k:v for k,v in r.items() if k!='samples'}

    @staticmethod
    def _job_view(job):
        return {k:v for k,v in job.items() if k not in ('cancel','thread','session','sourcePath','sampler')}

    def _guard(self, entry, installed=False):
        self._license(entry)
        if not self.eligibility(entry)['allowed']: raise ValueError('model_not_hardware_runtime_qualified')
        if installed and entry['id'] not in self.state['installed']: raise ValueError('model_not_installed')
        manifest=private_cpu_manifest()
        for file in manifest.files:
            if hash_contained_file(self.repository,manifest.package_relative_dir+'/'+file.relative_path,file.bytes)!=(file.bytes,file.sha256):raise ValueError('runtime_integrity_failed')

    def _path(self, entry):
        return self.root/'models'/_digest(entry['id'])/entry['artifact']['filename']

    def _verify(self, entry, cancel):
        file=entry['artifact']; path=self._path(entry)
        with _open_file(path) as stream:
            _verified(stream,ArtifactFile(relative_path=file['filename'],bytes=file['bytes'],sha256=file['sha256'],source_url=file['source_url'],kind='weights'),cancel)
        return path

    def start(self, request):
        op=request['operation']; entry=self._entry(request.get('modelId')); self._guard(entry,op not in ('install','importModel'))
        if op in ('install','importModel') and request.get('licenseDigest')!=entry['licenseDigest']: raise ValueError('publisher_license_acceptance_required')
        mode=request.get('mode','quick')
        if mode not in ('quick','standard'): raise ValueError('benchmark_mode_invalid')
        with self.lock:
            identity=request['requestId']
            previous=next((j for j in self.jobs.values() if j['requestId']==identity),None)
            if previous:
                if previous['operation']!=op or previous['modelId']!=entry['id'] or previous['mode']!=mode: raise ValueError('request_identity_conflict')
                return self._job_view(previous)
            if any(j['state'] in _RUNNING for j in self.jobs.values()) or self.sessions: raise ValueError('model_store_busy')
            job={'id':uuid.uuid4().hex,'requestId':identity,'operation':op,'modelId':entry['id'],'mode':mode,
                'state':'pending','progress':0,'total':6 if mode=='quick' else 48,'downloadedBytes':0,
                'createdAt':time.time(),'updatedAt':time.time(),'error':None,'cancel':threading.Event()}
            self.jobs[job['id']]=job
            if op=='importModel':job['sourcePath']=request['sourcePath']
            thread=threading.Thread(target=self._run,args=(job,entry),daemon=True);job['thread']=thread;thread.start()
            return self._job_view(job)

    def _update(self,job,**values):
        with self.lock:job.update(values,updatedAt=time.time())

    def _run(self,job,entry):
        if not _EXECUTION.acquire(blocking=False):self._update(job,state='failed',error='local_compute_busy');return
        from runtime.independent.manager import ComputeAdmission
        admitted=False
        try:
            admitted=ComputeAdmission.acquire(job['id'],self.scope)
            if not admitted:raise ValueError('local_compute_busy')
            self._guard(entry,job['operation'] not in ('install','importModel'))
            self._update(job,state='running')
            if job['operation'] in ('install','importModel'):
                file=entry['artifact']; target=self._path(entry)
                with _cache_directory(self.root,('models',_digest(entry['id']))) as directory:
                    if shutil.disk_usage(directory).free<file['bytes']*2: raise ValueError('cache_disk_insufficient_for_staging')
                    cancel=job['cancel']; installer=LocalAiInstaller(None,None,transport=HubTransport())
                    fact=ArtifactFile(relative_path=file['filename'],bytes=file['bytes'],sha256=file['sha256'],source_url=file['source_url'],kind='weights')
                    partial=directory/(file['filename']+'.partial')
                    if target.exists(): self._verify(entry,cancel)
                    else:
                        def transferred(size):self._update(job,state='downloading',downloadedBytes=job['downloadedBytes']+size)
                        if job['operation']=='importModel':
                            source=Path(job['sourcePath'])
                            if source.is_symlink() or not source.is_file() or source.stat().st_size!=file['bytes']:raise ValueError('imported_model_identity_mismatch')
                            with _open_file(source) as stream:_verified(stream,fact,cancel)
                            with _open_file(source) as stream,_open_file(partial,create=True) as destination:
                                destination.seek(0);destination.truncate()
                                while chunk:=stream.read(256*1024):
                                    if cancel.is_set():raise InstallCancelled()
                                    destination.write(chunk);transferred(len(chunk))
                            with _open_file(partial) as stream:_verified(stream,fact,cancel)
                        else:installer._download(fact,partial,cancel,transferred,lambda:self._update(job,state='verifying'))
                        if cancel.is_set():raise InstallCancelled()
                        self._license(entry)
                        if target.exists() or target.is_symlink():raise ValueError('cache_destination_appeared')
                        os.replace(partial,target);self._verify(entry,cancel)
                    with self.lock:
                        self.state['installed'][entry['id']]={'artifactSha256':file['sha256'],'bytes':file['bytes'],'revision':entry['revision'],'verifiedAt':time.time()}
                        self._persist()
                self._update(job,state='complete')
            else:self._benchmark(job,entry)
        except InstallCancelled:self._update(job,state='cancelled')
        except Exception as error:self._update(job,state='cancelled' if job['cancel'].is_set() else 'failed',error=None if job['cancel'].is_set() else _safe_error(error))
        finally:
            if job.get('sampler'):job['sampler'].close()
            session=job.get('session')
            if not _release_after_exit(session,job['id'],admitted):self._update(job,state='failed',error='own_session_shutdown_pending')

    def _session(self,entry,cancel):
        weights=self._verify(entry,cancel); manifest=private_cpu_manifest()
        if os.name!='nt':raise ValueError('runtime_platform_unsupported')
        for file in manifest.files:
            if hash_contained_file(self.repository,manifest.package_relative_dir+'/'+file.relative_path,file.bytes)!=(file.bytes,file.sha256): raise ValueError('runtime_integrity_failed')
        binary=self.repository/manifest.package_relative_dir/next(f.relative_path for f in manifest.files if f.kind=='binary')
        with socket.socket() as reservation:reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1]
        args=['--model',str(weights),'--alias',entry['id'],'--ctx-size','4096','--parallel','1','--host','127.0.0.1','--port',str(port),'--n-gpu-layers','0','--threads',str(min(4,os.cpu_count() or 1))]
        session=LlamaCppSession(binary,args,entry['id'],port,uuid.uuid4().hex+uuid.uuid4().hex,timeout=45)
        session.memory_limit_bytes=entry['recommendedRamBytes']
        return session,manifest

    def _benchmark(self,job,entry):
        cancel=job['cancel'];session,manifest=self._session(entry,cancel);job['session']=session
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
                    answer=stream_answer(session,{'model':entry['id'],'messages':[{'role':'user','content':case['prompt']}],'temperature':0,'seed':17,'max_tokens':768},cancel,timeout)
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
        sampler.close()
        counts={axis:sum(s['evaluation'][axis]=='pass' for s in samples) for axis in ('content','format','tool','security','technical')}
        technical=not cancel.is_set() and len(samples)==job['total'] and counts['technical']==len(samples)
        content_ratio=counts['content']/len(samples) if samples else 0
        unsafe=any(s['evaluation']['security']=='fail' or s['evaluation']['tool']=='fail' for s in samples)
        receipt={'schemaVersion':1,'id':uuid.uuid4().hex,'modelId':entry['id'],'artifactSha256':entry['artifact']['sha256'],
            'runtimeBuild':manifest.build_ref,'runtimeDigest':_digest(manifest.model_dump(mode='json',by_alias=True)),
            'suite':SUITE_VERSION,'suiteSha256':SUITE_HASH,'validator':VALIDATOR_VERSION,'mode':job['mode'],
            'origin':'local','createdAt':time.time(),'deviceFingerprint':_device_identity(self.device),
            'configuration':{'contextTokens':4096,'maxOutputTokens':768,'temperature':0,'requestedSeed':17,'seedSupport':'not_independently_verified','thinking':'runtime_default','backend':'cpu'},
            'coldStartMs':load_ms,'medianResponseMs':statistics.median([s['elapsedMs'] for s in samples]) if samples else None,
            'firstVisibleTokenMs':statistics.median([s['firstVisibleTokenMs'] for s in samples if s.get('firstVisibleTokenMs') is not None]) if any(s.get('firstVisibleTokenMs') is not None for s in samples) else None,
            'peakObservedRamBytes':sampler.peak,'peakObservedVramBytes':None,
            'technicalPass':technical,'counts':counts,'sampleCount':len(samples),'samples':samples,
            'state':'cancelled' if cancel.is_set() else 'complete',
            'recommendation':'chat_candidate' if technical and content_ratio>=.75 else 'no_recommendation',
            'agentRecommendation':False,'unsafeToolOrSecurityFailure':unsafe,'measurementLimitations':['RSS sampled every 100ms; peaks may be missed','GPU memory unavailable','synthetic tools never executed']}
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
            with _cache_directory(self.root,('models',_digest(entry['id']))) as directory:
                target=directory/entry['artifact']['filename']
                if target.is_symlink():raise ValueError('model_path_unsafe')
                if target.exists():target.unlink()
            if self.state['active']==identity:self.state['active']=None
            self.state['installed'].pop(identity,None);self._persist()

    def export(self,identity):
        receipt=next((r for r in self.history if r['id']==identity),None)
        if receipt is None:raise ValueError('receipt_not_found')
        return receipt

    def import_receipt(self,receipt):
        if not isinstance(receipt,dict) or len(json.dumps(receipt))>4*1024*1024:raise ValueError('receipt_size_invalid')
        expected=set(['schemaVersion','id','modelId','artifactSha256','runtimeBuild','runtimeDigest','suite','suiteSha256','validator','mode','origin','createdAt','deviceFingerprint','configuration','coldStartMs','medianResponseMs','firstVisibleTokenMs','peakObservedRamBytes','peakObservedVramBytes','technicalPass','counts','sampleCount','samples','state','recommendation','agentRecommendation','unsafeToolOrSecurityFailure','measurementLimitations','sha256'])
        if set(receipt)!=expected or receipt['schemaVersion']!=1 or receipt['suite']!=SUITE_VERSION or receipt['suiteSha256']!=SUITE_HASH:raise ValueError('receipt_schema_invalid')
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
                and r['artifactSha256']==entry['artifact']['sha256'] and r['technicalPass'] and r['recommendation']=='chat_candidate'
                and r['deviceFingerprint']==_device_identity(self.device)),None)
            if not proof:raise ValueError('successful_device_benchmark_required')
            # Persist a deliberate scoped preference; loading is request bounded.
            self.state['active']=identity;self._persist()

    def chat(self,text,*,cancel=None):
        if not isinstance(text,str) or not 1<=len(text)<=8192:raise ValueError('local_chat_input_invalid')
        entry=self._entry(self.state['active']);self._guard(entry,True)
        if not _EXECUTION.acquire(False):raise ValueError('local_compute_busy')
        from runtime.independent.manager import ComputeAdmission
        owner=uuid.uuid4().hex;session=None;admitted=False
        try:
            admitted=ComputeAdmission.acquire(owner,self.scope)
            if not admitted:raise ValueError('local_compute_busy')
            with self.lock:
                if any(j['state'] in _RUNNING for j in self.jobs.values()) or self.sessions:raise ValueError('model_store_busy')
                cancel=cancel or threading.Event();session,manifest=self._session(entry,cancel)
                self.sessions[owner]=(session,cancel)
            session.start(cancel,timeout=45)
            if cancel.is_set():raise RuntimeError('local_chat_cancelled')
            self._license(entry)
            response=stream_answer(session,{'model':entry['id'],'messages':[{'role':'user','content':text}],
                'max_tokens':768,'temperature':0},cancel,60)
            if cancel.is_set():raise RuntimeError('local_chat_cancelled')
            return {'text':response['text'], 'modelId':entry['id'],'toolExecution':False}
        finally:
            with self.lock:self.sessions.pop(owner,None)
            if not _release_after_exit(session,owner,admitted):raise RuntimeError('own_session_shutdown_pending')

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
