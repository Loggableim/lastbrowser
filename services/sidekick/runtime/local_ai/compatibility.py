"""Pure hardware/runtime compatibility. No environment, filesystem or network reads."""
from __future__ import annotations

from datetime import datetime
import re
from .contracts import (BenchmarkEvidence, HardwareSnapshot, Measurement, MemoryProfile,
    ModelArtifact, ModelRecommendation, RecommendationRequest, Role, RuntimeSnapshot)

GIB = 1024 ** 3


def _age(observed: str, now: str) -> float:
    return (datetime.fromisoformat(now.replace("Z", "+00:00")) - datetime.fromisoformat(observed.replace("Z", "+00:00"))).total_seconds()


def measured_bytes(value: Measurement, now: str) -> int | None:
    if value.status != "measured" or not 0 <= _age(value.observed_at, now) <= 30:
        return None
    return value.value


def download_bytes(artifact: ModelArtifact) -> int | None:
    if not artifact.manifest_complete or not artifact.files or any(item.bytes is None for item in artifact.files):
        return None
    return sum(item.bytes for item in artifact.files)


def manifest_reasons(artifact: ModelArtifact) -> tuple[str, ...]:
    reasons = []
    if not artifact.revision or not re.fullmatch(r"[0-9a-f]{40,64}", artifact.revision):
        reasons.append("artifact_revision_unpinned")
    if not artifact.manifest_complete or not artifact.files or not any(item.kind == "weights" for item in artifact.files):
        reasons.append("artifact_manifest_incomplete")
    if any(item.bytes is None or item.sha256 is None for item in artifact.files):
        reasons.append("artifact_file_integrity_unknown")
    if artifact.license_ref is None or artifact.license_digest is None:
        reasons.append("artifact_license_unverified")
    if artifact.requires_projector and not any(item.kind == "projector" for item in artifact.files):
        reasons.append("vision_projector_missing")
    return tuple(reasons)


def _ram_budget(hardware: HardwareSnapshot, request: RecommendationRequest) -> int | None:
    available = measured_bytes(hardware.ram_available_bytes, request.now)
    if available is None:
        return None
    total = measured_bytes(hardware.ram_total_bytes, request.now)
    if total is not None:
        available = min(available, total)
    budget = max(0, available - max(GIB, request.browser_ram_reserve_bytes))
    return min(budget, request.max_ram_bytes) if request.max_ram_bytes is not None else budget


def _padded(value: int) -> int:
    return (value * 6 + 4) // 5


def assess_model(artifact: ModelArtifact, role: Role, hardware: HardwareSnapshot,
    runtimes: tuple[RuntimeSnapshot, ...], memory_profiles: tuple[MemoryProfile, ...],
    benchmarks: tuple[BenchmarkEvidence, ...], request: RecommendationRequest) -> ModelRecommendation:
    role_budget = next((item for item in request.role_budgets if item.role == role), None)
    if role_budget:
        request = request.model_copy(update={"context_tokens": role_budget.context_tokens, "parallel_requests": role_budget.parallel_requests})
    candidates = []
    for runtime in runtimes:
        matching = tuple(item for item in memory_profiles if item.artifact_id == artifact.artifact_id
            and item.artifact_revision == artifact.revision and item.runtime_build_ref == runtime.build_ref
            and (item.hardware_scan_id == hardware.scan_id or role == 'chat'))
        for profile in matching or (None,):
            candidates.append(_assess(artifact, role, hardware, runtime, profile, benchmarks, request))
    if not candidates:
        return _assess(artifact, role, hardware, None, None, benchmarks, request)
    def rank(value: ModelRecommendation):
        fit = 0 if value.selectable else 1 if value.support == "supported" else 2 if value.support == "unknown" else 3
        suitability = {"recommended": 0, "usable": 1, "slow": 2, "unmeasured": 3, "insufficient_resources": 4}[value.suitability]
        return fit, suitability, value.peak_gpu_bytes or 0, value.peak_ram_bytes or 0, value.runtime_build_ref or ""
    return min(candidates, key=rank)


def _assess(artifact: ModelArtifact, role: Role, hardware: HardwareSnapshot,
    runtime: RuntimeSnapshot | None, profile: MemoryProfile | None,
    benchmarks: tuple[BenchmarkEvidence, ...], request: RecommendationRequest) -> ModelRecommendation:
    reasons = list(manifest_reasons(artifact))
    evidence = list(artifact.evidence_refs)
    support = "supported"
    suitability = "unmeasured"
    ram_peak = gpu_peak = None
    quality_tier = None
    placement = profile.placement if profile else None
    adapter_id = profile.adapter_id if profile else None
    if role not in artifact.roles:
        support = "unsupported"; reasons.append("artifact_role_unsupported")
    if artifact.requires_task_head and (artifact.task_head_ref is None or not any(item.kind == "head" for item in artifact.files)):
        support = "unsupported"; reasons.append("encoder_task_head_missing")
    if "vision_projector_missing" in reasons:
        support = "unsupported"
    if runtime is None or runtime.state == "unavailable":
        support = "unsupported"; reasons.append("runtime_missing")
    elif runtime.os != hardware.os or runtime.arch != hardware.arch:
        support = "unsupported"; reasons.append("runtime_platform_mismatch")
    elif runtime.state != "verified" or runtime.binary_sha256 is None or runtime.backend.status != "verified" or runtime.backend.evidence_ref is None or runtime.backend.runtime_build_ref != runtime.build_ref:
        if support == "supported": support = "unknown"
        reasons.append("runtime_not_verified")
    else:
        evidence.append(runtime.backend.evidence_ref)
        operation = next((item for item in runtime.operations if item.artifact_id == artifact.artifact_id and item.artifact_revision == artifact.revision
            and item.role == role and (profile is None or (item.placement == profile.placement and item.adapter_id == profile.adapter_id))), None)
        if operation is None:
            support = "unsupported"; reasons.append("runtime_operation_missing")
        elif request.context_tokens > operation.context_limit or (artifact.context_limit is not None and request.context_tokens > artifact.context_limit):
            support = "unsupported"; reasons.append("context_limit_exceeded")
        else:
            evidence.append(operation.evidence_ref)
        if runtime.required_cpu_features:
            if not hardware.cpu_features_verified:
                if support == "supported": support = "unknown"
                reasons.append("cpu_features_unknown")
            elif not set(runtime.required_cpu_features).issubset(hardware.cpu_features):
                support = "unsupported"; reasons.append("cpu_instruction_unsupported")
    if request.game_mode:
        reasons.append("game_mode_blocks_inference")
    if not 0 <= _age(hardware.observed_at, request.now) <= 30:
        reasons.append("hardware_snapshot_stale")
    if profile is None:
        reasons.append("model_memory_unknown")
    elif (request.context_tokens > profile.max_context_tokens or request.parallel_requests > profile.max_parallel_requests):
        reasons.append("memory_profile_request_unverified")
    elif not 0 <= _age(profile.observed_at, request.now) <= 300:
        reasons.append("memory_profile_stale")
    else:
        evidence.append(profile.evidence_ref)
        ram_peak = _padded(profile.fixed_ram_bytes + request.parallel_requests * (
            request.context_tokens * profile.ram_bytes_per_context_token + profile.scratch_ram_bytes_per_request))
        gpu_peak = _padded(profile.fixed_gpu_bytes + request.parallel_requests * (
            request.context_tokens * profile.gpu_bytes_per_context_token + profile.scratch_gpu_bytes_per_request))
        ram_budget = _ram_budget(hardware, request)
        if ram_budget is None:
            reasons.append("ram_budget_unknown")
        elif ram_peak > ram_budget:
            suitability = "insufficient_resources"; reasons.append("ram_budget_exceeded")
        gpu_budget = None
        if profile.placement == "gpu":
            adapter = next((item for item in hardware.adapters if item.adapter_id == profile.adapter_id), None)
            if adapter is None:
                support = "unsupported"; reasons.append("gpu_adapter_missing")
            else:
                backend = next((item for item in adapter.backends if runtime and item.name == runtime.backend.name
                    and item.runtime_build_ref == runtime.build_ref and item.status == "verified"), None)
                if backend is None:
                    if support == "supported": support = "unknown"
                    reasons.append("gpu_backend_unverified")
                budget = measured_bytes(adapter.process_budget_bytes, request.now)
                usage = measured_bytes(adapter.process_usage_bytes, request.now)
                if not runtime or runtime.process_ref is None or adapter.budget_owner_ref != runtime.process_ref:
                    reasons.append("gpu_budget_scope_unknown")
                    budget = usage = None
                if budget is None or usage is None:
                    reasons.append("gpu_budget_unknown")
                else:
                    gpu_budget = max(0, budget - usage - max(536870912, request.gpu_reserve_bytes))
                    if request.max_gpu_bytes is not None:
                        gpu_budget = min(gpu_budget, request.max_gpu_bytes)
                    if gpu_peak > gpu_budget:
                        suitability = "insufficient_resources"; reasons.append("gpu_budget_exceeded")
                if adapter.shared_system_memory and ram_budget is not None and ram_peak + gpu_peak > ram_budget:
                    suitability = "insufficient_resources"; reasons.append("shared_memory_budget_exceeded")
        elif gpu_peak:
            support = "unsupported"; reasons.append("cpu_profile_has_gpu_allocation")
        if ram_budget is not None and suitability != "insufficient_resources" and (profile.placement == "cpu" or gpu_budget is not None):
            suitability = "usable" if profile.status == "measured" else "unmeasured"
        benchmark = next((item for item in benchmarks if runtime and item.artifact_id == artifact.artifact_id
            and item.artifact_revision == artifact.revision
            and item.runtime_build_ref == runtime.build_ref
            and (item.hardware_scan_id == hardware.scan_id or role == 'chat' and item.hardware_scan_id == profile.hardware_scan_id)
            and item.role == role and item.context_tokens >= request.context_tokens
            and item.parallel_requests >= request.parallel_requests and item.placement == profile.placement
            and item.adapter_id == profile.adapter_id), None)
        if benchmark:
            evidence.append(benchmark.evidence_ref)
            if not benchmark.quality_passed:
                support = "unsupported"; reasons.append("model_quality_failed")
            elif suitability == "usable" and profile.status == "measured":
                quality_tier = benchmark.quality_tier
                suitability = "recommended" if benchmark.slo_passed else "slow" if benchmark.slow else suitability
        else:
            reasons.append("performance_unmeasured")
    blocked = {"hardware_snapshot_stale", "ram_budget_unknown", "gpu_budget_unknown", "model_memory_unknown",
        "memory_profile_stale", "memory_profile_request_unverified", "game_mode_blocks_inference", "gpu_budget_scope_unknown"}
    selectable = support == "supported" and suitability != "insufficient_resources" and not blocked.intersection(reasons)
    size = download_bytes(artifact)
    disk = measured_bytes(hardware.disk_free_bytes, request.now)
    if artifact.artifact_id not in request.verified_installed_artifact_ids:
        reasons.append("artifact_not_installed")
        if artifact.artifact_id not in request.download_consent_artifact_ids:
            reasons.append("download_consent_required")
        if disk is None:
            reasons.append("disk_free_unknown")
        elif size is not None and size * 2 > disk:
            reasons.append("disk_budget_exceeded")
    integrity = not manifest_reasons(artifact)
    return ModelRecommendation(artifact_id=artifact.artifact_id, role=role, context_tokens=request.context_tokens,
        parallel_requests=request.parallel_requests, quality_tier=quality_tier,
        runtime_build_ref=runtime.build_ref if runtime else None, placement=placement, adapter_id=adapter_id,
        support=support, suitability=suitability, selectable=selectable,
        allocation_ready=selectable and integrity and profile is not None and profile.status == "measured" and artifact.artifact_id in request.verified_installed_artifact_ids,
        download_ready=selectable and integrity and size is not None and disk is not None and size * 2 <= disk
            and artifact.artifact_id in request.download_consent_artifact_ids,
        download_bytes=size, peak_ram_bytes=ram_peak, peak_gpu_bytes=gpu_peak,
        reason_codes=tuple(dict.fromkeys(reasons)), evidence_refs=tuple(dict.fromkeys(evidence)))
