"""One backend runtime DI per ProfileHub; private Root bridge owns authentication."""
from __future__ import annotations
import json
import logging
import os
import threading
import uuid
import weakref
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Scope, Id, Ref, Utc, digest_json, canonical_json
from runtime.independent.manager import ComputeAdmission
from runtime.independent.store import ResourceBusy, RevisionConflict
from runtime.local_ai.contracts import Role, Sha256
from runtime.local_ai.setup import LocalAiSetup, InstallPlan
from runtime.local_ai.resources import LocalAiResourceManager
from runtime.local_ai.model_manager import ModelRuntimeManager, ModelLoadRequest
from runtime.local_ai.model_adapters import bind_model_manifest
from runtime.local_ai.runtime_probe import RuntimeBuildManifest, RuntimeRoleAdapter
from runtime.local_ai.bootstrap import BootstrapPurpose, bootstrap_benchmark
from runtime.local_ai.model_recovery import recover_model_leases
from web.api.local_ai_setup import process_identity
from web.api.local_ai_runtime import project_runtime_view, project_bootstrap_result

logger = logging.getLogger(__name__)

class InspectRequest(Contract):
    operation: Literal['inspect']

class CapabilityRequest(Contract):
    operation: Literal['capability']

class ReviewRequest(Contract):
    operation: Literal['review']
    purpose: Literal['product','diagnostic'] = 'product'
    artifact_id: Ref
    role: Role
    scan_id: Ref
    context_tokens: Annotated[int,Field(gt=0,le=4096)] | None = None
    budget_seconds: Annotated[int,Field(ge=1,le=30)] = 20
    ram_limit_bytes: Annotated[int,Field(ge=16777216,le=17179869184)] | None = None

    @model_validator(mode='after')
    def diagnostic_bounds(self):
        if self.role == 'chat':
            if self.context_tokens not in (None,1024): raise ValueError('bounded_chat_context_must_be_1024')
            if self.budget_seconds > 25: raise ValueError('bounded_chat_time_budget_exceeded')
            if self.ram_limit_bytes is not None and self.ram_limit_bytes > 805306368:
                raise ValueError('bounded_chat_ram_budget_exceeded')
        if self.purpose == 'diagnostic' and self.role != 'chat':
            raise ValueError('diagnostic_bounded_chat_role_only')
        return self

class BootstrapRequest(Contract):
    operation: Literal['bootstrap']
    purpose_digest: Sha256
    client_request_id: Id

class UnloadRequest(Contract):
    operation: Literal['unload']
    handle_id: Id

class ReceiptRequest(Contract):
    operation: Literal['receipt']
    client_request_id: Id
    purpose_digest: Sha256

REQUESTS={'inspect':InspectRequest,'capability':CapabilityRequest,'review':ReviewRequest,'bootstrap':BootstrapRequest,'unload':UnloadRequest,'receipt':ReceiptRequest}

class RuntimePurposeRecord(Contract):
    purpose_ref: Id
    scope: Scope
    actor: Ref
    core_generation: Ref
    created_at: Utc
    expires_at: Utc
    purpose: BootstrapPurpose
    diagnostic_only: bool = False

def read_local_ai_runtime_receipt(hub,scope,actor,request:ReceiptRequest):
    """Read-only historical receipt: no host creation/consent/freshness/OS/IO/start."""
    store,_=hub.by_scope(scope,actor)
    original=BootstrapRequest(operation='bootstrap',purpose_digest=request.purpose_digest,client_request_id=request.client_request_id)
    response={'operation':'receipt','clientRequestId':request.client_request_id,'purposeDigest':request.purpose_digest,'state':'unknown','available':False}
    with store.transaction(write=False):
        saved=store._idempotent(scope,'local_ai_runtime_bootstrap',request.client_request_id,original)
        if saved is None:return response
        setup=LocalAiSetup(hub)
        raw=setup._read_flow(store,scope,'runtime-purpose:'+request.purpose_digest)
        if not raw:raise PermissionError('runtime_receipt_actor_binding_unverified')
        record=RuntimePurposeRecord.model_validate(raw)
        if record.scope!=scope or record.actor!=actor or digest_json(record)!=request.purpose_digest:
            raise PermissionError('runtime_receipt_scope_or_actor_changed')
        # Expiry/Core generation are launch gates, not renewed authority from a
        # historical read. Never consume consent or change pending journal state.
        state=saved.get('state')
        if state not in ('running','complete','failed','interrupted'):raise ValueError('runtime_receipt_journal_state_invalid')
        response['state']=state
        if state=='complete':
            metrics=saved.get('result') if isinstance(saved.get('result'),dict) else saved
            response.update(project_bootstrap_result(metrics))
        if isinstance(saved.get('reasonCode'),str):response['reasonCode']=saved['reasonCode']
        if state in ('running','failed','interrupted'):response['executionUnavailable']=True
        return response

def _canonical_directory(value):
    path=Path(value)
    if not path.is_absolute() or not path.is_dir() or path.resolve()!=path: raise ValueError('runtime_host_directory_not_canonical')
    for parent in (path,*path.parents):
        if parent.is_symlink() or getattr(parent.stat(),'st_file_attributes',0)&0x400: raise ValueError('runtime_host_directory_link_rejected')
    return path

def _private_cpu_manifest():
    # Fixed package-owned metadata, never a caller/renderer manifest path.
    from runtime.local_ai.runtime_bundle import private_cpu_manifest
    return private_cpu_manifest()

class LocalAiRuntimeHost:
    def __init__(self, hub, cache_root, repository_root, hardware_broker, *, core_generation,
        setup=None, manifest_provider=_private_cpu_manifest, session_factory=None, fixture_only=False):
        self.hub=hub; self.cache_root=_canonical_directory(cache_root); self.repository_root=_canonical_directory(repository_root)
        self.broker=hardware_broker; self.core_generation=core_generation
        if not isinstance(core_generation,str) or not core_generation: raise ValueError('actual_core_generation_required')
        self.setup=setup or LocalAiSetup(hub, catalog_provider=hardware_broker.catalog)
        if self.setup.profile_hub is not hub: raise PermissionError('runtime_host_profile_hub_mismatch')
        self.manifest_provider=manifest_provider; self._manifests={}; self._lock=threading.RLock()
        self._closing=False; self._active=0; self._owners=set(); self._finished_owners=set(); self._scopes={}
        self._short_chat_lock=threading.Lock()
        self.resources=LocalAiResourceManager(self.setup,hardware_broker.scans,lambda scope:self.cache_root,
            self.repository_root,generation_provider=lambda scope:self.core_generation,
            manifest_provider=self._manifest_snapshot,operation_provider=self._product_operation_evidence,
            quality_provider=self._product_quality_evidence)
        self.manager=ModelRuntimeManager(self.resources,session_factory=session_factory,fixture_only=fixture_only)
        self.role_pipeline=None

    def bind_product_roles(self, resolver, *, operation_provider):
        """Root-only DI; resolver reads persisted scoped profile/approved bindings.

        No HTTP/renderer value may supply this callable or operation proof.
        operation_provider must return real RuntimeSnapshot/MemoryProfile proof;
        an empty provider safely leaves every product load blocked.
        """
        from runtime.local_ai.role_pipeline import BackendRolePipeline
        with self._lock:
            if self._closing or self._active: raise ResourceBusy('runtime_host_busy')
            if self.role_pipeline is not None: raise ResourceBusy('product_role_resolver_already_bound')
            if not callable(resolver) or not callable(operation_provider):raise ValueError('trusted_role_di_required')
            self.resources.operation_provider=operation_provider
            def checked(scope,actor,task):
                from runtime.local_ai.role_pipeline import ScopedRoleBinding
                self.hub.by_scope(scope,actor)
                with self._lock:self._scopes[scope.key]=(scope,actor)
                binding=resolver(scope,actor,task)
                if not isinstance(binding,ScopedRoleBinding): raise ValueError('typed_local_role_binding_required')
                plan=self.setup.approved_plan(scope,binding.load.plan_digest,actor=actor)
                artifact=next((a for a in plan.artifacts if a.artifact_id==binding.load.artifact_id),None)
                if artifact is None or artifact.revision!=binding.load.artifact_revision:
                    raise PermissionError('local_product_artifact_revision_changed')
                if binding.actor!=actor or binding.load.scope!=scope or binding.task!=task:
                    raise PermissionError('local_product_scope_binding_changed')
                manifest=bind_model_manifest(self.manifest_provider(),artifact,binding.load.role)
                if manifest.build_ref!=binding.load.runtime_build_ref: raise ValueError('local_product_build_changed')
                self._remember_manifest(scope,artifact.artifact_id,binding.load.role,manifest)
                return binding
            self.role_pipeline=BackendRolePipeline(self.manager,checked)

    def execute_role(self,scope,actor,request,*,cancel=None):
        """Authenticated Root/tool callable; never admits renderer load bindings."""
        from runtime.local_ai.role_pipeline import RoleTaskRequest
        request=request if isinstance(request,RoleTaskRequest) else RoleTaskRequest.model_validate(request)
        with self._lock:
            if self._closing or self.role_pipeline is None: raise ResourceBusy('local_product_roles_unbound')
            self._active+=1
        try:return self.role_pipeline.execute(scope,actor,request,cancel=cancel)
        finally:
            with self._lock:self._active-=1

    def cancel_role(self,scope,actor,client_request_id):
        self.hub.by_scope(scope,actor)
        return self.role_pipeline is None or self.role_pipeline.cancel(scope,actor,client_request_id)

    def _now(self): return self.broker.scans.clock()

    def _manifest_snapshot(self,scope):
        with self._lock:return tuple(self._manifests.get(scope.key,{}).values())

    def _remember_manifest(self,scope,artifact_id,role,manifest):
        with self._lock:
            self._manifests.setdefault(scope.key,{})[(artifact_id,role)]=manifest

    def _trusted_saved_product_evidence(self,scope):
        """Read only current, measured bounded-chat evidence; never bootstrap evidence."""
        from runtime.local_ai.contracts import RuntimeSnapshot,MemoryProfile,BenchmarkEvidence
        from runtime.local_ai.model_adapters import model_adapter_plan
        with self._lock:
            selected=self._scopes.get(scope.key)
        if selected is None or selected[0]!=scope or self.manager.fixture_only:return ()
        actor=selected[1]
        base=self.manifest_provider()
        # Redistribution review gates shipping/recommendation, not a locally
        # installed, user-approved runtime operation. File integrity is checked
        # below; the release state remains exposed separately to callers.
        from runtime.local_ai.runtime_probe import inspect_runtime_build
        proof=inspect_runtime_build(self.repository_root,base,scope,self._now().isoformat())
        if proof.state!='integrity_verified':return ()
        try:
            plan,artifact=self._approved_artifact(scope,actor,'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0')
            adapter_plan=model_adapter_plan(artifact,'chat',base)
            if adapter_plan.state!='prepared':return ()
            store=self.setup._store(scope,actor)
            with store.transaction(write=False):
                rows=store._many("SELECT data_json FROM ia_connection_setup_flows WHERE scope_key=? AND capability_id='local-ai' AND state='runtime-evidence' ORDER BY updated_at DESC LIMIT 32",
                    (store._scope(scope),))
            now=self._now()
            for row in rows:
                try:
                    raw=json.loads(row[0]); evidence=raw.get('productEvidence') or {}
                    runtime=RuntimeSnapshot.model_validate(evidence.get('runtimeSnapshot'))
                    memory=MemoryProfile.model_validate(evidence.get('memoryProfile'))
                    benchmark=BenchmarkEvidence.model_validate(evidence.get('benchmarkEvidence'))
                except Exception:continue
                operation=next((item for item in runtime.operations if item.role=='chat'
                    and item.artifact_id==artifact.artifact_id and item.artifact_revision==artifact.revision),None)
                plan_digest,approved_artifact=self._approved_artifact(scope,actor,artifact.artifact_id)
                binding=raw.get('binding') or {}
                record_raw=self.setup._read_flow(store,scope,'runtime-purpose:'+str(raw.get('purposeDigest') or ''))
                record=RuntimePurposeRecord.model_validate(record_raw) if record_raw else None
                if (record is None or digest_json(record)!=raw.get('purposeDigest')
                        or record.scope!=scope or record.actor!=actor or record.core_generation!=self.core_generation
                        or record.diagnostic_only is not raw.get('diagnosticOnly')
                        or approved_artifact.artifact_id!=artifact.artifact_id
                        or binding.get('scope')!=scope.model_dump(mode='json',by_alias=True)
                        or binding.get('artifactId')!=artifact.artifact_id
                        or binding.get('artifactRevision')!=artifact.revision or binding.get('role')!='chat'
                        or binding.get('planDigest')!=plan_digest.plan_digest or binding.get('contextTokens')!=1024
                        or binding.get('parallelRequests')!=1 or binding.get('admissionGeneration')!=self.core_generation
                        or raw.get('suite')!='chat-quality-v1' or raw.get('synthetic') is not False
                        or raw.get('operationVerified') is not True or raw.get('qualityPassed') is not True
                        or raw.get('sloPassed') is not True or raw.get('memoryEnvelopeVerified') is not True
                        or raw.get('recommendationEligible') is not False
                        or not operation or operation.adapter_ref!=adapter_plan.adapter.adapter_ref
                        or runtime.build_ref!=base.build_ref or runtime.binary_sha256!=next(f.sha256 for f in base.files if f.kind=='binary')
                        or runtime.state!='verified' or runtime.backend.status!='verified'
                        or memory.artifact_id!=artifact.artifact_id or memory.artifact_revision!=artifact.revision
                        or memory.adapter_ref!=adapter_plan.adapter.adapter_ref or memory.max_context_tokens!=1024
                        or memory.max_parallel_requests!=1 or benchmark.artifact_id!=artifact.artifact_id
                        or benchmark.artifact_revision!=artifact.revision or benchmark.role!='chat'
                        or not benchmark.quality_passed or not benchmark.slo_passed
                        or benchmark.context_tokens!=1024 or benchmark.parallel_requests!=1
                        or memory.hardware_scan_id!=benchmark.hardware_scan_id
                        or binding.get('scanId')!=memory.hardware_scan_id):continue
                age=(now-datetime.fromisoformat(memory.observed_at.replace('Z','+00:00'))).total_seconds()
                if not 0<=age<=300:continue
                return ((runtime,),(memory,),(benchmark,))
        except Exception:return ()
        return ()

    def _product_operation_evidence(self,scope):
        values=self._trusted_saved_product_evidence(scope)
        return values[:2] if values else ((),())

    def _product_quality_evidence(self,scope):
        values=self._trusted_saved_product_evidence(scope)
        return values[2] if values else ()

    def short_chat_capability(self,scope,actor):
        """Read-only AUTO gate from the explicit role profile and saved real proof."""
        from runtime.local_ai.product_profiles import LocalAiProductProfiles
        from runtime.local_ai.model_adapters import model_adapter_plan,bind_model_manifest
        from runtime.local_ai.contracts import BenchmarkEvidence,MemoryProfile
        self.hub.by_scope(scope,actor)
        with self._lock:
            if self._closing:return {'state':'unavailable','reasonCode':'local_runtime_host_shutting_down'}
            self._scopes[scope.key]=(scope,actor)
        profile=LocalAiProductProfiles(self.hub,self.broker.scans,setup=self.setup,
            manifest_provider=self.manifest_provider).read(scope,actor=actor)
        selection=next((item for item in profile.selections if item.task=='chat.answer'),None)
        if selection is None:return {'state':'unavailable','reasonCode':'local_chat_role_not_selected'}
        if selection.context_tokens!=1024:return {'state':'unavailable','reasonCode':'bounded_chat_context_must_be_1024'}
        try:
            plan,artifact=self._approved_artifact(scope,actor,'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0')
            if selection.artifact_id!=artifact.artifact_id:return {'state':'unavailable','reasonCode':'local_chat_artifact_not_selected'}
            adapter_plan=model_adapter_plan(artifact,'chat',self.manifest_provider())
            if adapter_plan.state!='prepared':return {'state':'unavailable','reasonCode':adapter_plan.reason_codes[0]}
            bound=bind_model_manifest(self.manifest_provider(),artifact,'chat')
            self._remember_manifest(scope,artifact.artifact_id,'chat',bound)
            scans=self.broker.scans
            with scans._lock:
                current=sorted((item for item in scans._scans.values() if item.scope==scope),
                    key=lambda item:item.hardware.observed_at,reverse=True)
            if not current:return {'state':'unavailable','reasonCode':'local_chat_fresh_hardware_scan_required'}
            scan=scans.read(scope,current[0].hardware.scan_id)
            report=self.resources.inspect(scope,actor=actor,scan_id=scan.hardware.scan_id,
                plan_digest=plan.plan_digest,artifact_id=artifact.artifact_id,role='chat',
                context_tokens=1024,parallel_requests=1,placement='cpu')
            accepted={'existing_compute_owner_unverified'}
            blockers=tuple(code for code in report.reason_codes if code not in accepted)
            ready=(report.artifact_integrity=='verified' and report.quality_verified
                and report.available_compute_slots>0 and report.ram_available_bytes is not None
                and report.ram_available_bytes>1073741824+16777216 and not blockers
                and adapter_plan.adapter.adapter_ref==next((value.adapter_ref for value in self._product_operation_evidence(scope)[1]
                    if isinstance(value,MemoryProfile) and value.artifact_id==artifact.artifact_id),None))
            if not ready:
                return {'state':'unavailable','reasonCode':blockers[0] if blockers else
                    'local_chat_quality_or_resources_unavailable','profileRevision':profile.profile_revision,
                    'hardwareScanId':scan.hardware.scan_id,'qualityVerified':report.quality_verified}
            evidence=self._trusted_saved_product_evidence(scope)
            benchmark=next((value for value in evidence[2] if isinstance(value,BenchmarkEvidence)),None) if evidence else None
            memory=next((value for value in evidence[1] if isinstance(value,MemoryProfile)),None) if evidence else None
            if benchmark is None or memory is None:return {'state':'unavailable','reasonCode':'local_chat_proof_missing'}
            redistribution=self.manifest_provider().redistribution_review_ref
            release_verified=not ('pending' in redistribution or 'inventory-only' in redistribution)
            return {'state':'ready','scope':scope.model_dump(mode='json',by_alias=True),
                'profileRevision':profile.profile_revision,'planDigest':plan.plan_digest,
                'artifactId':artifact.artifact_id,'artifactRevision':artifact.revision,
                'adapterRef':adapter_plan.adapter.adapter_ref,'runtimeBuildRef':bound.build_ref,
                'hardwareScanId':scan.hardware.scan_id,'qualityEvidenceRef':benchmark.evidence_ref,
                'memoryEvidenceRef':memory.evidence_ref,'qualityVerified':True,
                'contextTokens':1024,'maxOutputTokens':48,'parallelRequests':1,
                'maxRamBytes':805306368,'maxSeconds':25,
                'releaseRedistributionVerified':release_verified}
        except Exception as exc:
            code=str(exc)
            if not code or len(code)>128 or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789_-' for c in code):
                code='local_chat_capability_unavailable'
            return {'state':'unavailable','reasonCode':code}

    def execute_native_short_chat(self,context,prompt,*,cancel):
        """One native AUTO short-chat turn; model/session/profile cleanup is acknowledged."""
        from runtime.independent.native_chat_protocol import NativeChatContext,verify_native_context
        from runtime.independent.manager import ComputeAdmission
        from runtime.independent.contracts import new_id
        from runtime.local_ai.product_profiles import LocalAiProductProfiles
        from runtime.local_ai.role_pipeline import ScopedRoleBinding
        from runtime.local_ai.role_adapters import RoleRequest
        from runtime.local_ai.model_manager import ModelLoadRequest
        from runtime.local_ai.contracts import Role
        from runtime.local_ai.auto_router import classify_task
        if not isinstance(context,NativeChatContext) or context.selection_mode!='auto':
            raise PermissionError('native_auto_context_required')
        verify_native_context(context)
        if not isinstance(prompt,str) or len(prompt)>4096 or classify_task(prompt)!='simple':
            raise ValueError('local_short_chat_prompt_not_eligible')
        scope,actor=context.scope,context.profile_name
        if not self._short_chat_lock.acquire(blocking=False):raise ResourceBusy('local_short_chat_already_running')
        owner='local-ai-shortchat:'+context.stream_id
        handle=None; watcher=None; stop_watch=threading.Event(); cancelled=threading.Event()
        with self._lock:
            if self._closing:self._short_chat_lock.release();raise ResourceBusy('local_runtime_host_shutting_down')
            self._active+=1
        try:
            capability=self.short_chat_capability(scope,actor)
            if capability.get('state')!='ready':raise ResourceBusy(str(capability.get('reasonCode') or 'local_chat_not_ready'))
            if not ComputeAdmission.acquire_legacy(owner,scope_key=scope.key):
                raise ResourceBusy('local_short_chat_compute_busy')
            with self._lock:self._owners.add(owner)
            profiles=LocalAiProductProfiles(self.hub,self.broker.scans,setup=self.setup,
                manifest_provider=self.manifest_provider)
            selected=profiles.read(scope,actor=actor)
            binding=profiles.resolve(scope,actor,'chat.answer',existing_owner=owner,
                core_generation=self.core_generation)
            if binding.profile_revision!=selected.profile_revision or binding.load.artifact_id!=capability['artifactId']:
                raise PermissionError('local_short_chat_profile_changed')
            manifest=bind_model_manifest(self.manifest_provider(),
                self._approved_artifact(scope,actor,capability['artifactId'])[1],'chat')
            self._remember_manifest(scope,capability['artifactId'],'chat',manifest)
            load=binding.load.model_copy(update={'context_tokens':1024,'parallel_requests':1})
            checked=ScopedRoleBinding(actor=actor,profile_revision=selected.profile_revision,
                task='chat.answer',load=load)
            request=RoleRequest(role='chat',texts=(prompt,),max_output_tokens=48)
            handle_view=self.manager.acquire(checked.load,actor=actor);handle=handle_view.handle_id
            def watch():
                while not stop_watch.wait(.05):
                    try:
                        verify_native_context(context)
                        current=profiles.resolve(scope,actor,'chat.answer',existing_owner=owner,
                            core_generation=self.core_generation)
                        if cancel.is_set() or current!=checked:
                            cancelled.set();self.manager.unload(handle,scope,timeout=2);return
                    except Exception:
                        cancelled.set();self.manager.unload(handle,scope,timeout=2);return
            watcher=threading.Thread(target=watch,name='local-shortchat-cancel',daemon=True);watcher.start()
            loaded=self.manager.wait(handle,scope,timeout=20)
            if cancel.is_set() or cancelled.is_set():raise RuntimeError('local_short_chat_cancelled')
            if loaded.state!='ready' or not loaded.available or loaded.synthetic:
                raise ResourceBusy('local_short_chat_runtime_not_ready')
            current=profiles.resolve(scope,actor,'chat.answer',existing_owner=owner,
                core_generation=self.core_generation)
            if current!=checked:raise PermissionError('local_short_chat_profile_changed')
            self.manager.refresh(handle,scope)
            result=self.manager.execute(handle,scope,request)
            if cancel.is_set() or cancelled.is_set():raise RuntimeError('local_short_chat_cancelled')
            verify_native_context(context)
            if profiles.resolve(scope,actor,'chat.answer',existing_owner=owner,
                    core_generation=self.core_generation)!=checked:
                raise PermissionError('local_short_chat_profile_changed')
            self.manager.refresh(handle,scope)
            text=result.get('text')
            if not isinstance(text,str) or not text.strip() or len(text)>4096 or result.get('toolCalls'):
                raise ValueError('local_short_chat_result_invalid')
            return {'text':text,'route':'local_chat','artifactId':capability['artifactId'],
                'artifactRevision':capability['artifactRevision'],'profileRevision':selected.profile_revision,
                'adapterRef':capability['adapterRef'],'qualityEvidenceRef':capability['qualityEvidenceRef'],
                'memoryEvidenceRef':capability['memoryEvidenceRef'],'limits':{
                    'contextTokens':1024,'maxOutputTokens':48,'parallelRequests':1,
                    'maxRamBytes':805306368,'maxSeconds':25}}
        finally:
            stop_watch.set()
            if watcher is not None:watcher.join(timeout=3)
            try:
                if handle is not None:
                    try:self.manager.unload(handle,scope,timeout=5)
                    except Exception:logger.exception('Local short-chat runtime unload failed')
                if owner in self._owners:
                    with self._lock:self._finished_owners.add(owner)
                    # Admission is released only if the manager confirms every
                    # owned process/lease/thread is stopped.
                    self._release_stopped_owners()
            finally:
                with self._lock:self._active-=1
                self._short_chat_lock.release()

    def _approved_artifact(self,scope,actor,artifact_id):
        store=self.setup._store(scope,actor)
        rows=store._many("SELECT data_json FROM ia_connection_setup_flows WHERE scope_key=? AND capability_id='local-ai' AND state='plan' ORDER BY updated_at DESC LIMIT 32",(scope.key,))
        for row in rows:
            plan=InstallPlan.model_validate_json(row[0])
            try: plan=self.setup.approved_plan(scope,plan.plan_digest,actor=actor)
            except (PermissionError,ValueError,RevisionConflict): continue
            artifact=next((a for a in plan.artifacts if a.artifact_id==artifact_id),None)
            if artifact is not None: return plan,artifact
        raise ValueError('runtime_artifact_has_no_current_approved_plan')

    def review(self,scope,actor,request:ReviewRequest):
        plan,artifact=self._approved_artifact(scope,actor,request.artifact_id)
        scan=self.broker.scans.read(scope,request.scan_id); base=self.manifest_provider()
        release_closure_open=False
        if not self.manager.fixture_only:
            from runtime.local_ai.runtime_probe import inspect_runtime_build
            proof=inspect_runtime_build(self.repository_root,base,scope,self._now().isoformat())
            if proof.state!='integrity_verified': raise ValueError('runtime_native_assets_unavailable')
            release_closure_open=('pending' in base.redistribution_review_ref or 'inventory-only' in base.redistribution_review_ref)
            if release_closure_open and request.purpose!='diagnostic' and request.role!='chat':
                raise ValueError('runtime_release_license_closure_unverified')
        if request.purpose=='diagnostic':
            # Separate private benchmark path, limited to the exact short-chat
            # adapter. Results remain non-product evidence while the release
            # redistribution gate is open.
            bound=bind_model_manifest(base,artifact,'chat')
        else:
            bound=bind_model_manifest(base,artifact,request.role) if not self.manager.fixture_only else base
        binary=next(f for f in bound.files if f.kind=='binary')
        now=self._now(); scan_expiry=datetime.fromisoformat(scan.hardware.observed_at.replace('Z','+00:00'))+timedelta(seconds=30)
        expires=min(now+timedelta(seconds=30),scan_expiry)
        if expires<=now: raise ValueError('runtime_hardware_scan_expired')
        from runtime.local_ai.compatibility import measured_bytes
        available=measured_bytes(scan.hardware.ram_available_bytes,now.isoformat())
        if available is None or available<=1073741824+16777216: raise ValueError('runtime_bootstrap_ram_reserve_unavailable')
        default_ram_limit=min(805306368 if request.purpose=='diagnostic' else 3221225472,available-1073741824)
        ram_limit=request.ram_limit_bytes or default_ram_limit
        if request.purpose=='diagnostic' and ram_limit>805306368:raise ValueError('diagnostic_ram_budget_exceeded')
        if ram_limit>available-1073741824: raise ValueError('runtime_bootstrap_ram_reserve_exceeded')
        context=request.context_tokens or min(1024,artifact.context_limit or 1024)
        identity=uuid.uuid4().hex; owner='local-ai-bootstrap:'+identity
        purpose=BootstrapPurpose(purpose='controlled-local-role-benchmark',budget_seconds=request.budget_seconds,ram_limit_bytes=ram_limit,
            suite='chat-quality-v1' if request.purpose=='diagnostic' or request.role=='chat' else 'answer-smoke-v1',
            load=ModelLoadRequest(scope=scope,plan_digest=plan.plan_digest,artifact_id=artifact.artifact_id,artifact_revision=artifact.revision,
                runtime_build_ref=bound.build_ref,runtime_sha256=binary.sha256,role=request.role,context_tokens=context,
                existing_compute_owner_key=owner,admission_generation=self.core_generation,scan_id=request.scan_id))
        record=RuntimePurposeRecord(purpose_ref=identity,scope=scope,actor=actor,core_generation=self.core_generation,
            created_at=now.isoformat(),expires_at=expires.isoformat(),purpose=purpose,
            diagnostic_only=request.purpose=='diagnostic')
        digest=digest_json(record); store=self.setup._store(scope,actor)
        with store.transaction(): self.setup._write_flow(store,scope,'runtime-purpose:'+digest,record)
        self._remember_manifest(scope,artifact.artifact_id,request.role,bound)
        with self._lock:
            self._scopes[scope.key]=(scope,actor)
        return {'operation':'review','purposeRef':record.purpose_ref,'purposeDigest':digest,'expiresAt':record.expires_at,'artifactId':artifact.artifact_id,
            'artifactRevision':artifact.revision,'role':request.role,'contextTokens':context,'parallelRequests':1,
            'budgetSeconds':request.budget_seconds,'ramLimitBytes':ram_limit,'runtimeBuildRef':bound.build_ref,
            'available':False,'operationVerified':False,'productAvailable':False,
            'diagnosticOnly':record.diagnostic_only,
            'releaseRedistributionVerified':not release_closure_open,
            'reasonCodes':(['runtime_release_license_closure_unverified','diagnostic_results_are_not_product_proof']
                if record.diagnostic_only and release_closure_open else
                ['diagnostic_results_are_not_product_proof'] if record.diagnostic_only else
                ['release_redistribution_closure_unverified'] if release_closure_open and request.role=='chat' else [])}

    def _record(self,scope,actor,digest):
        store=self.setup._store(scope,actor); raw=self.setup._read_flow(store,scope,'runtime-purpose:'+digest)
        if not raw: raise PermissionError('runtime_purpose_not_bound_to_scope')
        record=RuntimePurposeRecord.model_validate(raw)
        if digest_json(record)!=digest or record.scope!=scope or record.actor!=actor or record.core_generation!=self.core_generation:
            raise PermissionError('runtime_purpose_binding_changed')
        return store,record

    def _release_stopped_owners(self):
        with self._lock: owners=tuple(self._owners & self._finished_owners)
        for owner in owners:
            with self.manager._condition:
                items=[i for i in self.manager._handles.values() if i['view'].request.existing_compute_owner_key==owner]
            stopped=all(i['view'].state in ('stopped','failed') and i['done'].is_set() and i['active']==0 and
                i['lease'] is None and i['stack'] is None and
                (i['session'] is None or i['session'].process is None or i['session'].process.poll() is not None) for i in items)
            if stopped:
                ComputeAdmission.release(owner)
                with self._lock:self._owners.discard(owner);self._finished_owners.discard(owner)

    def bootstrap(self,scope,actor,request:BootstrapRequest,private_human_action):
        store=self.setup._store(scope,actor); operation='local_ai_runtime_bootstrap'
        with store.transaction():
            replay=store._idempotent(scope,operation,request.client_request_id,request)
            if replay is not None:
                if replay.get('state')=='running':
                    state,current=process_identity(replay['hostPid'])
                    dead=state=='dead' or state=='alive' and current is not None and current!=replay['hostCreationIdentity']
                    safe={'operation':'bootstrap','state':'interrupted' if dead else 'running','clientRequestId':request.client_request_id,
                        'purposeDigest':request.purpose_digest,'available':False,'executionUnavailable':True,
                        'reasonCode':'runtime_previous_host_exited' if dead else 'runtime_bootstrap_already_started'}
                    if dead:store._conn.execute('UPDATE ia_request_results SET result_json=? WHERE scope_key=? AND operation=? AND request_id=?',
                        (canonical_json(safe),scope.key,operation,request.client_request_id))
                    return safe
                return replay
            store,record=self._record(scope,actor,request.purpose_digest)
            if self._now()>=datetime.fromisoformat(record.expires_at.replace('Z','+00:00')): raise ValueError('runtime_purpose_expired')
            self.broker.scans.read(scope,record.purpose.load.scan_id)
            self.setup.approved_plan(scope,record.purpose.load.plan_digest,actor=actor)
            if not callable(private_human_action) or private_human_action(scope,request.purpose_digest) is not True:
                raise PermissionError('runtime_bootstrap_requires_separate_main_human_consent')
            if self.setup._read_flow(store,scope,'runtime-consumed:'+request.purpose_digest):
                raise ValueError('runtime_review_already_consumed')
            self.setup._write_flow(store,scope,'runtime-consumed:'+request.purpose_digest,
                {'purposeDigest':request.purpose_digest,'clientRequestId':request.client_request_id})
            state,identity=process_identity(os.getpid())
            if state!='alive' or identity is None: raise ResourceBusy('runtime_host_process_identity_unknown')
            pending={'operation':'bootstrap','state':'running','clientRequestId':request.client_request_id,'purposeDigest':request.purpose_digest,
                'hostPid':os.getpid(),'hostCreationIdentity':identity,'available':False}
            store._remember(scope,operation,request.client_request_id,request,pending)
        owner=record.purpose.load.existing_compute_owner_key
        try:
            if not ComputeAdmission.acquire_legacy(owner,scope_key=scope.key): raise ResourceBusy('shared_compute_admission_busy')
            with self._lock:self._owners.add(owner)
            result=bootstrap_benchmark(self.manager,record.purpose,actor=actor,
                private_human_action=lambda selected,digest:selected==scope and digest==digest_json(record.purpose))
            result.update({'purposeDigest':request.purpose_digest,'diagnosticOnly':record.diagnostic_only,
                'releaseRedistributionVerified':'pending' not in self.manifest_provider().redistribution_review_ref
                    and 'inventory-only' not in self.manifest_provider().redistribution_review_ref})
            outcome={'operation':'bootstrap','state':'complete','clientRequestId':request.client_request_id,
                'purposeDigest':request.purpose_digest,**project_bootstrap_result(result),'available':False,
                'productAvailable':False,'diagnosticOnly':record.diagnostic_only}
            with store.transaction(): self.setup._write_flow(store,scope,'runtime-evidence:'+result['evidenceRef'],result)
        except Exception as exc:
            # Keep the API reason deliberately normalized, but retain the local
            # failure site for diagnostics. Bootstrap uses fixed internal probes;
            # this log does not include chat content or user supplied prompts.
            logger.exception('Local AI runtime bootstrap execution failed')
            reason=str(exc) if isinstance(exc,(ValueError,ResourceBusy,PermissionError)) and str(exc).replace('_','').isalnum() else 'runtime_bootstrap_failed'
            outcome={'operation':'bootstrap','state':'failed','clientRequestId':request.client_request_id,
                'purposeDigest':request.purpose_digest,'reasonCode':reason,'available':False,'executionUnavailable':True}
        finally:
            with self._lock:
                if owner in self._owners:self._finished_owners.add(owner)
            self._release_stopped_owners()
        with store.transaction():
            store._conn.execute('UPDATE ia_request_results SET result_json=? WHERE scope_key=? AND operation=? AND request_id=? AND request_digest=?',
                (canonical_json(outcome),scope.key,operation,request.client_request_id,digest_json(request)))
        return outcome

    def handle(self,scope,actor,request,private_human_action):
        with self._lock:
            if self._closing: raise ResourceBusy('runtime_host_shutting_down')
            self._active+=1
        try:
            self.hub.by_scope(scope,actor)
            if request.operation=='receipt':return read_local_ai_runtime_receipt(self.hub,scope,actor,request)
            if request.operation=='capability':
                value=self.short_chat_capability(scope,actor)
                return {'operation':'capability',**value}
            store=self.setup._store(scope,actor)
            blocked_previous=recover_model_leases(store,scope)['blockedLeaseIds']
            if blocked_previous:
                # Own active jobs may be inspected/unloaded; an unowned surviving
                # process must not be silently superseded by a new review.
                if request.operation=='review':return {'operation':'review','available':False,'executionUnavailable':True,'reasonCode':'runtime_previous_process_exit_unverified'}
            if request.operation=='review':
                try:return self.review(scope,actor,request)
                except (ValueError,PermissionError,RevisionConflict) as exc:
                    reason=str(exc) if str(exc).replace('_','').isalnum() else 'runtime_review_unavailable'
                    return {'operation':'review','available':False,'executionUnavailable':True,'reasonCode':reason}
            if request.operation=='bootstrap': return self.bootstrap(scope,actor,request,private_human_action)
            if request.operation=='unload':
                stopped=self.manager.unload(request.handle_id,scope,timeout=5); self._release_stopped_owners()
                return {'operation':'unload','handleId':request.handle_id,'stopped':stopped}
            self._release_stopped_owners()
            from runtime.local_ai.notices import prepared_runtime_setup_manifest
            return {'operation':'inspect','handles':[project_runtime_view(v) for v in self.manager.inspect(scope)],'available':False,
                'setupManifest':prepared_runtime_setup_manifest(self.repository_root).model_dump(mode='json',by_alias=True),
                **({'reasonCode':'runtime_process_exit_unverified','executionUnavailable':True} if blocked_previous else {})}
        finally:
            with self._lock:self._active-=1

    def close(self,timeout=20):
        with self._lock:self._closing=True
        if self.role_pipeline is not None and not self.role_pipeline.close():return False
        if not self.manager.close(min(20,max(0,timeout))): return False
        self._release_stopped_owners()
        with self._lock:
            if self._active or self._owners:return False
        import sqlite3
        from contextlib import closing
        try:
            for _,path in self.hub.existing_store_paths():
                with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=.1)) as connection:
                    if connection.execute("SELECT 1 FROM ia_resource_leases WHERE state='active' AND run_id IS NULL AND resource_key LIKE 'local_ai_model:%' LIMIT 1").fetchone():return False
        except Exception:return False
        return True

_HOSTS=weakref.WeakKeyDictionary(); _HOST_LOCK=threading.RLock(); _CLOSING=weakref.WeakSet()

def register_local_ai_runtime_host(hub,host):
    if not isinstance(host,LocalAiRuntimeHost) or host.hub is not hub:raise PermissionError('runtime_host_hub_mismatch')
    with _HOST_LOCK:
        if hub in _CLOSING:raise ResourceBusy('runtime_host_shutting_down')
        existing=_HOSTS.get(hub)
        if existing is not None and existing is not host:raise ResourceBusy('runtime_host_already_bound')
        _HOSTS[hub]=host

def handle_local_ai_runtime(hub,scope,actor,request,cache_root,repository_root,hardware_broker,private_human_action=None,*,core_generation=None):
    """Private authenticated Root only. core_generation is its actual existing epoch."""
    model=REQUESTS.get(request.get('operation')) if isinstance(request,dict) else None
    if model is None:raise ValueError('unknown_local_ai_runtime_operation')
    parsed=model.model_validate(request)
    if parsed.operation=='receipt':
        return read_local_ai_runtime_receipt(hub,scope,actor,parsed)
    if core_generation is None:
        # Reuse Root's already-existing manager. Never manufacture an epoch or
        # instantiate a second manager/admission pool in this leaf.
        from web.api import independent
        if independent.hub() is not hub:raise PermissionError('runtime_root_profile_hub_mismatch')
        core_generation=independent.service(scope,actor)[2].generation
    host=get_local_ai_runtime_host(hub,cache_root,repository_root,hardware_broker,core_generation=core_generation)
    return host.handle(scope,actor,parsed,private_human_action)

def get_local_ai_runtime_host(hub,cache_root,repository_root,hardware_broker,*,core_generation):
    """Same private host for setup, benchmarks and actual scoped consumers."""
    with _HOST_LOCK:
        if hub in _CLOSING:raise ResourceBusy('runtime_host_shutting_down')
        host=_HOSTS.get(hub)
        if host is None:
            host=LocalAiRuntimeHost(hub,cache_root,repository_root,hardware_broker,core_generation=core_generation)
            _HOSTS[hub]=host
        if host.cache_root!=Path(cache_root) or host.repository_root!=Path(repository_root) or host.broker is not hardware_broker or host.core_generation!=core_generation:
            raise PermissionError('runtime_host_private_binding_changed')
    return host

def shutdown_local_ai_runtime(hub,timeout=20):
    with _HOST_LOCK:
        _CLOSING.add(hub);host=_HOSTS.get(hub)
    if host is not None and not host.close(timeout):return False
    if host is None:
        import sqlite3
        from contextlib import closing
        try:
            for _,path in hub.existing_store_paths():
                with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=.1)) as connection:
                    if connection.execute("SELECT 1 FROM ia_resource_leases WHERE state='active' AND run_id IS NULL AND resource_key LIKE 'local_ai_model:%' LIMIT 1").fetchone():return False
        except Exception:return False
    with _HOST_LOCK:_HOSTS.pop(hub,None)
    return True
