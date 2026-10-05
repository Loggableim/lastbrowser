"""Preset goals over a neutral catalog, never fixed bundles of loaded models."""
from .contracts import (BenchmarkEvidence, CatalogSnapshot, HardwareSnapshot, MemoryProfile,
    ModelRecommendation, RecommendationRequest, RecommendationResult, RuntimeSnapshot)
from .compatibility import _ram_budget, assess_model, measured_bytes


def recommend(hardware: HardwareSnapshot, catalog: CatalogSnapshot, runtimes: tuple[RuntimeSnapshot, ...],
    memory_profiles: tuple[MemoryProfile, ...], benchmarks: tuple[BenchmarkEvidence, ...],
    request: RecommendationRequest) -> RecommendationResult:
    choices = tuple(assess_model(artifact, role, hardware, runtimes, memory_profiles, benchmarks, request)
        for artifact in catalog.artifacts for role in artifact.roles)
    allowed = tuple(item for item in choices if item.selectable)
    cloud = request.cloud_policy == "explicit_allow" and request.cloud_connection_verified and request.preset == "hybrid"
    reasons = []
    if request.preset == "hybrid" and not cloud:
        reasons.append("hybrid_requires_explicit_cloud_connection")
    if request.preset == "custom":
        roles = set(request.opt_in_roles) | {item.role for item in choices if item.artifact_id in request.custom_artifact_ids}
        allowed = tuple(item for item in allowed if item.artifact_id in request.custom_artifact_ids)
        if any(identity not in {item.artifact_id for item in choices} for identity in request.custom_artifact_ids):
            reasons.append("custom_artifact_unknown")
    else:
        roles = {"chat", "retrieve", "extract"} if request.preset in ("lightweight", "hybrid") else {"agent", "chat", "retrieve", "extract"}
        roles |= set(request.opt_in_roles)
    selected = []
    order = ("agent", "chat", "retrieve", "extract", "embed", "vision", "encoder")
    for role in order:
        if role not in roles:
            continue
        candidates = [item for item in allowed if item.role == role]
        if not candidates:
            reasons.append("role_unavailable:" + role)
            continue
        # Measured role quality/SLO wins; parameter count and marketing do not.
        rank = {"recommended": 0, "usable": 1, "slow": 2, "unmeasured": 3}
        candidates.sort(key=lambda item: (rank[item.suitability], (item.peak_ram_bytes or 0) + (item.peak_gpu_bytes or 0), item.artifact_id))
        if request.preset == "max_local":
            # A measured capable slower option can be an explicit Max Local
            # candidate, but never upgrade unknown quality by model size alone.
            quality_rank = {"max": 0, "balanced": 1, "lite": 2, None: 3}
            candidates.sort(key=lambda item: (quality_rank[item.quality_tier], rank[item.suitability], item.artifact_id))
        winner = candidates[0]
        if winner.artifact_id not in {item.artifact_id for item in selected}:
            selected.append(winner)
    simultaneous = _simultaneous_models(tuple(selected), hardware, request)
    if request.available_compute_slots is None:
        reasons.append("compute_admission_unknown")
    elif request.available_compute_slots == 0:
        reasons.append("compute_admission_busy")
    if simultaneous < min(len(selected), request.max_parallel_models):
        reasons.append("models_must_run_sequentially")
    agent_ready = any(item.role == "agent" and item.suitability == "recommended" for item in allowed)
    chat_ready = any(item.role == "chat" and item.suitability == "recommended" for item in allowed)
    helpers = any(item.role in ("retrieve", "extract") for item in allowed)
    automatic = "balanced" if agent_ready or chat_ready else "hybrid" if cloud else "lightweight" if helpers else None
    state = "proposed" if selected or cloud else "needs_diagnostics" if any(item.support == "unknown" for item in choices) else "unavailable"
    return RecommendationResult(hardware_scan_id=hardware.scan_id, catalog_revision=catalog.revision,
        requested_preset=request.preset, automatic_recommendation=automatic, state=state,
        recommendations=choices, selected_artifact_ids=tuple(item.artifact_id for item in selected),
        max_simultaneous_models=simultaneous, cloud_allowed=cloud, reason_codes=tuple(dict.fromkeys(reasons)))


def _simultaneous_models(selected: tuple[ModelRecommendation, ...], hardware: HardwareSnapshot, request: RecommendationRequest) -> int:
    ram_budget = _ram_budget(hardware, request)
    if ram_budget is None or request.available_compute_slots is None:
        return 0
    cap = min(request.max_parallel_models, request.available_compute_slots)
    ram = 0
    gpu_pools = {}
    gpu_limits = {}
    count = 0
    for item in selected[:cap]:
        if item.peak_ram_bytes is None or item.peak_gpu_bytes is None:
            break
        next_ram = ram + item.peak_ram_bytes
        if item.placement == "gpu":
            adapter = next((value for value in hardware.adapters if value.adapter_id == item.adapter_id), None)
            if adapter is None:
                break
            budget = measured_bytes(adapter.process_budget_bytes, request.now)
            usage = measured_bytes(adapter.process_usage_bytes, request.now)
            if budget is None or usage is None:
                break
            next_gpu = gpu_pools.get(adapter.memory_pool_id, 0) + item.peak_gpu_bytes
            free = max(0, budget - usage - max(536870912, request.gpu_reserve_bytes))
            if request.max_gpu_bytes is not None:
                free = min(free, request.max_gpu_bytes)
            free = min(free, gpu_limits.get(adapter.memory_pool_id, free))
            if next_gpu > free:
                break
            if adapter.shared_system_memory:
                next_ram += item.peak_gpu_bytes
            gpu_pools[adapter.memory_pool_id] = next_gpu
            gpu_limits[adapter.memory_pool_id] = free
        if next_ram > ram_budget:
            break
        ram = next_ram
        count += 1
    return count
