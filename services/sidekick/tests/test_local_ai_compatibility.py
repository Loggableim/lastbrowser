"""Behavior of the pure local-AI core; all hardware/runtime evidence is synthetic."""
from __future__ import annotations

import builtins
import socket
import pytest
from pydantic import ValidationError
from runtime.local_ai.contracts import (AdapterSnapshot, ArtifactFile, BackendObservation, BenchmarkEvidence,
    CatalogSnapshot, HardwareSnapshot, Measurement, MemoryProfile, ModelArtifact, RecommendationRequest,
    RuntimeOperation, RuntimeSnapshot)
from runtime.local_ai.contracts import RoleInputBudget
from runtime.local_ai.compatibility import GIB, assess_model, download_bytes
from runtime.local_ai.recommendations import recommend
from runtime.local_ai.registry import liquid_catalog

NOW = "2026-10-04T01:00:00Z"
REV = "a" * 40
SHA = "b" * 64


def measured(value):
    return Measurement(value=value, status="measured", source="controlled-probe", observed_at=NOW)


@pytest.fixture
def inputs():
    artifact = ModelArtifact(artifact_id="vendor/agent:q4", provider="neutral-vendor", model_id="agent",
        revision=REV, format="gguf", quantization="q4", architecture=None, roles=("agent",),
        files=(ArtifactFile(relative_path="agent.gguf", bytes=1000, sha256=SHA, source_url="https://example.org/" + REV + "/agent.gguf", kind="weights"),),
        manifest_complete=True, license_ref="https://example.org/license", license_digest=SHA, context_limit=8192)
    hardware = HardwareSnapshot(scan_id="scan", observed_at=NOW, os="windows", arch="x64", logical_cores=8,
        ram_total_bytes=measured(16 * GIB), ram_available_bytes=measured(8 * GIB), disk_free_bytes=measured(20 * GIB))
    runtime = RuntimeSnapshot(build_ref="controlled-build", binary_sha256=SHA, state="verified", managed="in_tree",
        os="windows", arch="x64", backend=BackendObservation(name="cpu", status="verified", runtime_build_ref="controlled-build", evidence_ref="cpu-probe"),
        operations=(RuntimeOperation(artifact_id=artifact.artifact_id, artifact_revision=REV, role="agent", context_limit=8192, evidence_ref="actual-operation-probe"),))
    profile = MemoryProfile(artifact_id=artifact.artifact_id, artifact_revision=REV, runtime_build_ref=runtime.build_ref,
        placement="cpu", fixed_ram_bytes=GIB, ram_bytes_per_context_token=100, scratch_ram_bytes_per_request=1000,
        fixed_gpu_bytes=0, gpu_bytes_per_context_token=0, scratch_gpu_bytes_per_request=0,
        max_context_tokens=8192, max_parallel_requests=2, hardware_scan_id="scan", evidence_ref="memory-probe", observed_at=NOW, status="measured")
    request = RecommendationRequest(preset="balanced", now=NOW, context_tokens=4096, available_compute_slots=2)
    return artifact, hardware, runtime, profile, request


def assess(inputs, **changes):
    artifact, hardware, runtime, profile, request = inputs
    return assess_model(changes.get("artifact", artifact), "agent", changes.get("hardware", hardware),
        changes.get("runtimes", (runtime,)), changes.get("profiles", (profile,)), changes.get("benchmarks", ()), changes.get("request", request))


def test_known_cpu_fit_does_not_claim_benchmark_or_download(inputs):
    result = assess(inputs)
    assert result.support == "supported" and result.suitability == "usable"
    assert result.selectable is True
    assert result.allocation_ready is False and result.download_ready is False
    assert "performance_unmeasured" in result.reason_codes
    assert "download_consent_required" in result.reason_codes
    assert result.peak_ram_bytes > GIB


def test_nominal_ram_and_parameters_cannot_replace_free_memory(inputs):
    _, hardware, _, _, _ = inputs
    unknown = Measurement(source="permission-denied", observed_at=NOW, status="unavailable")
    result = assess(inputs, hardware=hardware.model_copy(update={"ram_available_bytes": unknown}))
    assert result.selectable is False
    assert "ram_budget_unknown" in result.reason_codes


def test_missing_or_detected_runtime_cannot_enable_model(inputs):
    assert assess(inputs, runtimes=()).support == "unsupported"
    runtime = inputs[2].model_copy(update={"state": "detected"})
    result = assess(inputs, runtimes=(runtime,))
    assert result.support == "unknown" and result.selectable is False


def test_platform_and_verified_instruction_set_are_required(inputs):
    runtime = inputs[2].model_copy(update={"arch": "arm64"})
    assert "runtime_platform_mismatch" in assess(inputs, runtimes=(runtime,)).reason_codes
    runtime = inputs[2].model_copy(update={"required_cpu_features": ("avx2",)})
    assert assess(inputs, runtimes=(runtime,)).support == "unknown"
    hardware = inputs[1].model_copy(update={"cpu_features_verified": True})
    assert "cpu_instruction_unsupported" in assess(inputs, runtimes=(runtime,), hardware=hardware).reason_codes


def test_context_and_parallel_requests_affect_actual_peak(inputs):
    request = inputs[4].model_copy(update={"parallel_requests": 2})
    assert assess(inputs, request=request).peak_ram_bytes > assess(inputs).peak_ram_bytes
    assert "memory_profile_request_unverified" in assess(inputs, request=request.model_copy(update={"parallel_requests": 3})).reason_codes
    assert "context_limit_exceeded" in assess(inputs, request=request.model_copy(update={"context_tokens": 9000})).reason_codes


def test_new_artifact_revision_invalidates_old_runtime_and_memory_proof(inputs):
    artifact = inputs[0].model_copy(update={"revision": "c" * 40})
    result = assess(inputs, artifact=artifact)
    assert result.selectable is False
    assert "runtime_operation_missing" in result.reason_codes
    assert "model_memory_unknown" in result.reason_codes


def test_stale_memory_and_hardware_do_not_allocate(inputs):
    request = inputs[4].model_copy(update={"now": "2026-10-04T01:06:00Z"})
    result = assess(inputs, request=request)
    assert result.selectable is False
    assert "hardware_snapshot_stale" in result.reason_codes
    assert "memory_profile_stale" in result.reason_codes


def gpu_inputs(inputs, *, shared=False, verified=True):
    artifact, hardware, runtime, profile, request = inputs
    backend = BackendObservation(name="vulkan", status="verified" if verified else "detected", runtime_build_ref=runtime.build_ref, evidence_ref="vulkan-kernel-probe")
    adapter = AdapterSnapshot(adapter_id="arc", name="Intel Arc example", shared_system_memory=shared, memory_pool_id="ram" if shared else "dedicated",
        dedicated_bytes=measured(16 * GIB), process_budget_bytes=measured(8 * GIB), process_usage_bytes=measured(0), backends=(backend,), budget_owner_ref="model-server")
    runtime = runtime.model_copy(update={"backend": backend, "process_ref": "model-server", "operations": tuple(item.model_copy(update={"placement": "gpu", "adapter_id": "arc"}) for item in runtime.operations)})
    hardware = hardware.model_copy(update={"adapters": (adapter,)})
    profile = profile.model_copy(update={"placement": "gpu", "adapter_id": "arc", "fixed_gpu_bytes": 4 * GIB})
    return artifact, hardware, runtime, profile, request


def test_gpu_name_does_not_prove_backend_or_available_vram(inputs):
    data = gpu_inputs(inputs, verified=False)
    assert assess(data).support == "unknown"
    data = gpu_inputs(inputs)
    unknown = Measurement(source="unknown-dxgi-budget", observed_at=NOW)
    adapter = data[1].adapters[0].model_copy(update={"process_budget_bytes": unknown})
    assert "gpu_budget_unknown" in assess(data, hardware=data[1].model_copy(update={"adapters": (adapter,)})).reason_codes


def test_electron_main_budget_cannot_stand_in_for_model_process_budget(inputs):
    data = gpu_inputs(inputs)
    adapter = data[1].adapters[0].model_copy(update={"budget_owner_ref": "electron-main"})
    result = assess(data, hardware=data[1].model_copy(update={"adapters": (adapter,)}))
    assert not result.selectable
    assert "gpu_budget_scope_unknown" in result.reason_codes


def test_shared_memory_is_not_added_twice_as_capacity(inputs):
    data = gpu_inputs(inputs, shared=True)
    profile = data[3].model_copy(update={"fixed_ram_bytes": 3 * GIB})
    result = assess(data, profiles=(profile,))
    assert "shared_memory_budget_exceeded" in result.reason_codes
    assert result.suitability == "insufficient_resources" and not result.selectable


def test_matching_quality_and_slo_evidence_is_needed_for_recommended(inputs):
    artifact, hardware, runtime, _, request = inputs
    benchmark = BenchmarkEvidence(artifact_id=artifact.artifact_id, artifact_revision=REV, runtime_build_ref=runtime.build_ref,
        hardware_scan_id=hardware.scan_id, role="agent", context_tokens=4096, parallel_requests=1,
        quality_passed=True, slo_passed=True, evidence_ref="controlled-product-benchmark")
    assert assess(inputs, benchmarks=(benchmark,)).suitability == "recommended"
    assert assess(inputs, benchmarks=(benchmark.model_copy(update={"quality_passed": False}),)).support == "unsupported"
    assert assess(inputs, benchmarks=(benchmark.model_copy(update={"hardware_scan_id": "foreign-device"}),)).suitability == "usable"


def test_download_needs_exact_manifest_user_consent_and_staging_disk(inputs):
    request = inputs[4].model_copy(update={"download_consent_artifact_ids": (inputs[0].artifact_id,)})
    assert assess(inputs, request=request).download_ready is True
    hardware = inputs[1].model_copy(update={"disk_free_bytes": measured(1999)})
    assert assess(inputs, request=request, hardware=hardware).download_ready is False
    artifact = inputs[0].model_copy(update={"manifest_complete": False})
    assert download_bytes(artifact) is None
    assert assess(inputs, request=request, artifact=artifact).download_ready is False


def test_game_mode_preserves_existing_blocking_semantics(inputs):
    assert assess(inputs, request=inputs[4].model_copy(update={"game_mode": True})).selectable is False


def test_first_launch_selection_does_not_grant_cloud_or_bypass_unknown_admission(inputs):
    artifact, hardware, runtime, profile, request = inputs
    catalog = CatalogSnapshot(revision="fixture", observed_at=NOW, artifacts=(artifact,))
    for preset in ("lightweight", "balanced", "max_local", "hybrid", "custom"):
        value = recommend(hardware, catalog, (runtime,), (profile,), (), request.model_copy(update={"preset": preset}))
        assert value.cloud_allowed is False
    value = recommend(hardware, catalog, (runtime,), (profile,), (), request.model_copy(update={"available_compute_slots": None}))
    assert value.max_simultaneous_models == 0
    assert "compute_admission_unknown" in value.reason_codes
    hybrid = request.model_copy(update={"preset": "hybrid", "cloud_policy": "explicit_allow", "cloud_connection_verified": True})
    assert recommend(hardware, catalog, (runtime,), (profile,), (), hybrid).cloud_allowed is True


def test_core_has_no_network_filesystem_or_environment_side_effects(inputs, monkeypatch):
    artifact, hardware, runtime, profile, request = inputs
    catalog = CatalogSnapshot(revision="fixture", observed_at=NOW, artifacts=(artifact,))
    def forbidden(*args, **kwargs):
        raise AssertionError("pure recommendation attempted I/O")
    monkeypatch.setattr(builtins, "open", forbidden)
    monkeypatch.setattr(socket, "socket", forbidden)
    first = recommend(hardware, catalog, (runtime,), (profile,), (), request)
    second = recommend(hardware, catalog, (runtime,), (profile,), (), request)
    assert first.model_dump() == second.model_dump()


def test_curated_catalog_separates_roles_and_keeps_unverified_values_null():
    catalog = liquid_catalog()
    assert len(catalog.artifacts) == 9
    assert {role for artifact in catalog.artifacts for role in artifact.roles} == {"encoder", "retrieve", "embed", "extract", "agent", "chat", "vision"}
    chat = next(item for item in catalog.artifacts if 'chat' in item.roles)
    assert chat.context_limit == 1024 and chat.manifest_complete
    assert chat.revision == '9969000761ce34de907bf20017cbfc3d52d6eaf9'
    encoder = next(item for item in catalog.artifacts if "encoder" in item.roles)
    assert encoder.task_head_ref is None and encoder.manifest_complete is False
    vision = next(item for item in catalog.artifacts if "vision" in item.roles)
    assert vision.context_limit is None
    assert any(file.kind == "projector" for file in vision.files)
    assert download_bytes(vision) == 229313536 + 189125920 + 10574
    assert all(item.revision != "main" for item in catalog.artifacts)
    assert catalog.artifacts[2].license_digest != catalog.artifacts[0].license_digest


def test_bounded_chat_quality_and_memory_evidence_survive_fresh_hardware_rescan():
    artifact = next(item for item in liquid_catalog().artifacts if 'chat' in item.roles)
    hardware = HardwareSnapshot(scan_id='fresh-scan', observed_at=NOW, os='windows', arch='x64', logical_cores=8,
        ram_total_bytes=measured(16 * GIB), ram_available_bytes=measured(8 * GIB), disk_free_bytes=measured(20 * GIB))
    runtime = RuntimeSnapshot(build_ref='controlled-build', binary_sha256=SHA, state='verified', managed='in_tree',
        os='windows', arch='x64', backend=BackendObservation(name='cpu', status='verified',
            runtime_build_ref='controlled-build', evidence_ref='cpu-chat-probe'),
        operations=(RuntimeOperation(artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
            role='chat', context_limit=1024, evidence_ref='real-chat-operation', adapter_ref='chat-adapter'),))
    profile = MemoryProfile(artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
        runtime_build_ref=runtime.build_ref, placement='cpu', fixed_ram_bytes=GIB,
        ram_bytes_per_context_token=0, scratch_ram_bytes_per_request=0, fixed_gpu_bytes=0,
        gpu_bytes_per_context_token=0, scratch_gpu_bytes_per_request=0, max_context_tokens=1024,
        max_parallel_requests=1, hardware_scan_id='benchmark-scan', evidence_ref='measured-chat-memory',
        observed_at=NOW, status='measured', adapter_ref='chat-adapter')
    benchmark = BenchmarkEvidence(artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
        runtime_build_ref=runtime.build_ref, hardware_scan_id=profile.hardware_scan_id, role='chat',
        context_tokens=1024, parallel_requests=1, quality_passed=True, slo_passed=True,
        quality_tier='lite', evidence_ref='measured-chat-quality')
    catalog = CatalogSnapshot(revision='chat-fixture', observed_at=NOW, artifacts=(artifact,))
    request = RecommendationRequest(preset='custom', now=NOW, context_tokens=1024, parallel_requests=1,
        available_compute_slots=1, custom_artifact_ids=(artifact.artifact_id,),
        verified_installed_artifact_ids=(artifact.artifact_id,))
    result = recommend(hardware, catalog, (runtime,), (profile,), (benchmark,), request)
    chat = next(item for item in result.recommendations if item.role == 'chat')
    assert chat.selectable and chat.allocation_ready and chat.suitability == 'recommended'


@pytest.mark.parametrize("value", [True, -1, "1024"])
def test_measurements_reject_fake_numeric_values(value):
    with pytest.raises(ValidationError):
        measured(value)


def test_unknown_measurement_cannot_carry_a_number():
    with pytest.raises(ValidationError):
        Measurement(value=123, status="unknown", source="not-measured", observed_at=NOW)


def test_estimated_footprint_never_becomes_allocation_ready(inputs):
    result = assess(inputs, profiles=(inputs[3].model_copy(update={"status": "estimated"}),),
        request=inputs[4].model_copy(update={"verified_installed_artifact_ids": (inputs[0].artifact_id,)}))
    assert result.suitability == "unmeasured" and not result.allocation_ready


def test_role_budget_does_not_silently_truncate_main_agent_context(inputs):
    artifact, hardware, runtime, profile, request = inputs
    artifact = artifact.model_copy(update={"roles": ("retrieve",), "context_limit": 512})
    runtime = runtime.model_copy(update={"operations": (runtime.operations[0].model_copy(update={"role": "retrieve", "context_limit": 512}),)})
    blocked = assess_model(artifact, "retrieve", hardware, (runtime,), (profile,), (), request)
    assert blocked.support == "unsupported"
    request = request.model_copy(update={"role_budgets": (RoleInputBudget(role="retrieve", context_tokens=512),)})
    allowed = assess_model(artifact, "retrieve", hardware, (runtime,), (profile,), (), request)
    assert allowed.selectable and allowed.context_tokens == 512
    assert request.context_tokens == 4096


def test_parallel_models_share_one_real_memory_budget(inputs):
    artifact, hardware, runtime, profile, request = inputs
    helper = artifact.model_copy(update={"artifact_id": "vendor/helper:q4", "roles": ("retrieve",)})
    helper_operation = runtime.operations[0].model_copy(update={"artifact_id": helper.artifact_id, "role": "retrieve"})
    runtime = runtime.model_copy(update={"operations": runtime.operations + (helper_operation,)})
    large = profile.model_copy(update={"fixed_ram_bytes": 4 * GIB})
    helper_profile = large.model_copy(update={"artifact_id": helper.artifact_id})
    catalog = CatalogSnapshot(revision="fixture", observed_at=NOW, artifacts=(artifact, helper))
    result = recommend(hardware, catalog, (runtime,), (large, helper_profile), (), request.model_copy(update={"max_parallel_models": 2}))
    assert len(result.selected_artifact_ids) == 2
    assert result.max_simultaneous_models == 1
    assert "models_must_run_sequentially" in result.reason_codes


def test_max_local_selects_measured_quality_tier_without_assuming_larger_is_better(inputs):
    artifact, hardware, runtime, profile, request = inputs
    better = artifact.model_copy(update={"artifact_id": "vendor/verified-max:q4"})
    runtime = runtime.model_copy(update={"operations": runtime.operations + (runtime.operations[0].model_copy(update={"artifact_id": better.artifact_id}),)})
    better_profile = profile.model_copy(update={"artifact_id": better.artifact_id, "fixed_ram_bytes": 2 * GIB})
    baseline = BenchmarkEvidence(artifact_id=artifact.artifact_id, artifact_revision=REV, runtime_build_ref=runtime.build_ref,
        hardware_scan_id=hardware.scan_id, role="agent", context_tokens=4096, parallel_requests=1,
        quality_passed=True, slo_passed=True, quality_tier="balanced", evidence_ref="baseline-quality")
    higher = baseline.model_copy(update={"artifact_id": better.artifact_id, "quality_tier": "max", "evidence_ref": "max-quality"})
    catalog = CatalogSnapshot(revision="fixture", observed_at=NOW, artifacts=(artifact, better))
    balanced = recommend(hardware, catalog, (runtime,), (profile, better_profile), (baseline, higher), request)
    maximum = recommend(hardware, catalog, (runtime,), (profile, better_profile), (baseline, higher), request.model_copy(update={"preset": "max_local"}))
    assert balanced.selected_artifact_ids == (artifact.artifact_id,)
    assert maximum.selected_artifact_ids == (better.artifact_id,)
    assert maximum.automatic_recommendation == "balanced"


def test_all_user_copy_locales_have_all_emitted_static_reasons():
    from runtime.local_ai.onboarding_copy import LOCALES, REASON_CATEGORY, local_ai_copy
    for locale in LOCALES:
        copy = local_ai_copy(locale)
        assert copy["locale"] == locale
        assert len(copy["labels"]) == 14
        assert len(copy["roles"]) == 6 and all(copy["roles"].values())
        assert len(copy["suitability"]) == 5 and all(copy["suitability"].values())
        assert set(copy["reasons"]) == set(REASON_CATEGORY)
        assert all(copy["reasons"].values())
    fresh = local_ai_copy("de")
    fresh["labels"]["title"] = "mutated"
    assert local_ai_copy("de")["labels"]["title"] == "Lokale KI"


def test_wire_dto_round_trip_keeps_immutable_arrays_and_unknowns(inputs):
    hardware = inputs[1]
    wire = hardware.model_dump_json(by_alias=True)
    restored = HardwareSnapshot.model_validate_json(wire)
    assert restored == hardware
    assert isinstance(restored.adapters, tuple)
    with pytest.raises(ValidationError):
        restored.arch = "changed"
