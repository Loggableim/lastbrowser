"""Read-only resource governor over existing scoped proof/admission, no loader/queue."""
from __future__ import annotations
import hashlib
from pathlib import Path
from typing import Annotated, Literal
from pydantic import Field
from runtime.independent.contracts import Contract, Scope, Ref, Utc
from .contracts import Role, RuntimeSnapshot, MemoryProfile, RecommendationRequest
from .compatibility import assess_model, measured_bytes
from .runtime_probe import hash_contained_file, inspect_runtime_build, runtime_snapshot_from_preflight

AGENT_MIN_CONTEXT = 65536


class ResourceReport(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    observed_at: Utc
    hardware_scan_id: Ref
    plan_digest: Ref
    artifact_id: Ref
    role: Role
    minimum_context_tokens: Annotated[int, Field(gt=0)]
    artifact_context_limit: Annotated[int, Field(gt=0)] | None
    artifact_integrity: Literal['verified', 'changed', 'missing', 'unsafe', 'unknown']
    runtime_states: tuple[Ref, ...]
    compute_owner_valid: bool
    compute_owner_count: Annotated[int, Field(ge=0)]
    available_compute_slots: Annotated[int, Field(ge=0)]
    ram_available_bytes: Annotated[int, Field(ge=0)] | None
    pressure: Literal['unknown', 'clear', 'pressure', 'blocked']
    execution_ready: bool
    quality_verified: bool = False
    reason_codes: tuple[Ref, ...]
    cloud_allowed: Literal[False] = False


class LocalAiResourceManager:
    """A proof report, not a new scheduler or a self-authorizing inference lease.

    Host injects its actual manager-generation and existing runtime/profile proof
    providers. Renderer never supplies these functions or Compute-owner keys.
    Report freshness is bounded by the HardwareScanStore's 30-second binding.
    """
    def __init__(self, setup, hardware_scans, cache_resolver, repository_root: Path,
        *, generation_provider, manifest_provider=lambda scope: (), operation_provider=lambda scope: ((), ()),
        quality_provider=lambda scope: ()):
        self.setup, self.scans, self.cache_resolver = setup, hardware_scans, cache_resolver
        self.repository_root = repository_root
        self.generation_provider, self.manifest_provider, self.operation_provider = generation_provider, manifest_provider, operation_provider
        self.quality_provider=quality_provider

    def inspect(self, scope: Scope, *, actor: str, scan_id: str, plan_digest: str, artifact_id: str, role: Role,
        existing_compute_owner_key: str | None = None, admission_generation: str | None = None,
        context_tokens: int | None = None, parallel_requests: int = 1, placement: Literal['cpu', 'gpu'] | None = None) -> ResourceReport:
        plan = self.setup.approved_plan(scope, plan_digest, actor=actor)
        hardware = self.scans.read(scope, scan_id).hardware
        artifact = next((item for item in plan.artifacts if item.artifact_id == artifact_id), None)
        if artifact is None or role not in artifact.roles:
            raise ValueError('resource_artifact_not_selected')
        now = self.scans.clock().isoformat()
        minimum = AGENT_MIN_CONTEXT if role == 'agent' else 1024 if role == 'chat' else 1
        reasons = []
        if artifact.context_limit is None: reasons.append('artifact_context_unknown')
        elif artifact.context_limit < minimum: reasons.append('agent_requires_64k_context' if role == 'agent' else 'bounded_chat_context_unavailable')
        root = Path(self.cache_resolver(scope))
        identity = hashlib.sha256(artifact.artifact_id.encode()).hexdigest()
        integrity = 'verified'
        for file in artifact.files:
            try:
                size, sha = hash_contained_file(root, plan.plan_digest + '/' + identity + '/' + file.relative_path, file.bytes)
                if size != file.bytes or sha != file.sha256: integrity = 'changed'; break
            except FileNotFoundError: integrity = 'missing'; break
            except ValueError: integrity = 'unsafe'; break
            except OSError: integrity = 'unknown'; break
        if integrity != 'verified': reasons.append('installed_artifact_' + integrity)
        # Scope/setup may have changed while hashing; no stale installed proof escapes.
        self.setup.approved_plan(scope, plan_digest, actor=actor)
        from runtime.independent.manager import ComputeAdmission
        generation = self.generation_provider(scope)
        with ComputeAdmission._lock:
            owners = len(ComputeAdmission._owners)
            owner_valid = existing_compute_owner_key is not None and existing_compute_owner_key in ComputeAdmission._owners and scope.key in ComputeAdmission._scope_claims.get(existing_compute_owner_key, ()) and admission_generation is not None and admission_generation == generation
            free = max(0, 2 - owners)
        if not owner_valid: reasons.append('existing_compute_owner_unverified')
        manifests = tuple(self.manifest_provider(scope))
        preflights = tuple(inspect_runtime_build(self.repository_root, manifest, scope, now) for manifest in manifests)
        states = tuple(item.state for item in preflights)
        if not states: reasons.append('runtime_manifest_missing')
        runtimes, profiles = self.operation_provider(scope)
        benchmarks=tuple(self.quality_provider(scope))
        # Only this host proof provider may supply real operation/backend/memory evidence.
        # A CLI --help/preflight is deliberately never upgraded into that proof.
        if not all(isinstance(item, RuntimeSnapshot) for item in runtimes) or not all(isinstance(item, MemoryProfile) for item in profiles):
            raise ValueError('resource_operation_proof_type_invalid')
        from .contracts import BenchmarkEvidence
        if not all(isinstance(item,BenchmarkEvidence) for item in benchmarks):
            raise ValueError('resource_quality_proof_type_invalid')
        pinned_builds = {manifest.build_ref: next(file.sha256 for file in manifest.files if file.kind == 'binary')
            for manifest, proof in zip(manifests, preflights) if proof.state in ('integrity_verified', 'preflight_verified')}
        runtimes = tuple(item for item in runtimes if item.build_ref in pinned_builds and item.binary_sha256 == pinned_builds[item.build_ref])
        required_features = {item.build_ref: set(item.required_cpu_features) for item in manifests}
        runtimes = tuple(item for item in runtimes if required_features[item.build_ref].issubset(item.required_cpu_features))
        if placement is not None:
            profiles = tuple(item for item in profiles if item.placement == placement)
            runtimes = tuple(item.model_copy(update={'operations': tuple(operation for operation in item.operations if operation.placement == placement)}) for item in runtimes)
        request = RecommendationRequest(preset='custom', now=now, context_tokens=max(minimum, context_tokens or minimum), parallel_requests=parallel_requests,
            available_compute_slots=free, verified_installed_artifact_ids=(artifact_id,) if integrity == 'verified' else ())
        recommendation = assess_model(artifact, role, hardware, runtimes, profiles, benchmarks, request)
        reasons.extend(recommendation.reason_codes)
        quality_verified=any(item.artifact_id==artifact_id and item.artifact_revision==artifact.revision
            and item.role==role and item.context_tokens>=request.context_tokens
            and item.parallel_requests>=parallel_requests and item.quality_passed and item.slo_passed
            and any(profile.artifact_id==item.artifact_id and profile.artifact_revision==item.artifact_revision
                and profile.hardware_scan_id==item.hardware_scan_id and profile.runtime_build_ref==item.runtime_build_ref
                and profile.adapter_ref is not None and profile.max_context_tokens>=request.context_tokens
                and profile.max_parallel_requests>=parallel_requests
                for profile in profiles)
            for item in benchmarks)
        if role=='chat' and not quality_verified: reasons.append('chat_quality_or_slo_proof_missing')
        ready = recommendation.allocation_ready and owner_valid and integrity == 'verified' and artifact.context_limit is not None and artifact.context_limit >= minimum and (role!='chat' or quality_verified)
        ram = measured_bytes(hardware.ram_available_bytes, now)
        pressure = 'clear' if ready else 'pressure' if recommendation.suitability == 'insufficient_resources' else 'unknown' if ram is None else 'blocked'
        return ResourceReport(scope=scope, observed_at=now, hardware_scan_id=scan_id, plan_digest=plan_digest,
            artifact_id=artifact_id, role=role, minimum_context_tokens=minimum, artifact_context_limit=artifact.context_limit,
            artifact_integrity=integrity, runtime_states=states, compute_owner_valid=owner_valid,
            compute_owner_count=owners, available_compute_slots=free, ram_available_bytes=ram,
            pressure=pressure, execution_ready=ready, quality_verified=quality_verified,
            reason_codes=tuple(dict.fromkeys(reasons)))
