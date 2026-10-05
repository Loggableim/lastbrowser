"""Immutable inputs to a pure compatibility core, with explicit unknowns."""
from __future__ import annotations

from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Ref, Utc, Scope

Bytes = Annotated[int, Field(ge=0)]
Positive = Annotated[int, Field(gt=0)]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Role = Literal["encoder", "retrieve", "embed", "extract", "agent", "chat", "vision"]
Preset = Literal["lightweight", "balanced", "max_local", "hybrid", "custom"]
Support = Literal["supported", "unsupported", "unknown"]


class Measurement(Contract):
    value: Bytes | None = None
    status: Literal["measured", "estimated", "unknown", "unavailable"] = "unknown"
    source: Ref
    observed_at: Utc

    @model_validator(mode="after")
    def honest_unknown(self):
        if self.status in ("unknown", "unavailable") and self.value is not None:
            raise ValueError("unknown measurements cannot contain a claimed value")
        if self.status in ("measured", "estimated") and self.value is None:
            raise ValueError("observed measurements require a value")
        return self


class BackendObservation(Contract):
    name: Literal["cpu", "vulkan", "cuda", "directml", "webgpu", "onnx", "npu"]
    status: Literal["verified", "detected", "unsupported", "unknown"]
    runtime_build_ref: Ref | None = None
    evidence_ref: Ref | None = None


class AdapterSnapshot(Contract):
    adapter_id: Ref
    name: Ref
    vendor: Ref | None = None
    shared_system_memory: bool | None
    memory_pool_id: Ref
    dedicated_bytes: Measurement
    process_budget_bytes: Measurement
    process_usage_bytes: Measurement
    budget_owner_ref: Ref | None = None
    backends: tuple[BackendObservation, ...] = ()


class HardwareSnapshot(Contract):
    schema_version: Literal[1] = 1
    scan_id: Ref
    observed_at: Utc
    os: Ref
    arch: Ref
    cpu_name: Ref | None = None
    physical_cores: Positive | None = None
    logical_cores: Positive | None = None
    cpu_features: tuple[Ref, ...] = ()
    cpu_features_verified: bool = False
    ram_total_bytes: Measurement
    ram_available_bytes: Measurement
    disk_free_bytes: Measurement
    adapters: tuple[AdapterSnapshot, ...] = ()

    @model_validator(mode="after")
    def unique_adapters(self):
        if len({adapter.adapter_id for adapter in self.adapters}) != len(self.adapters):
            raise ValueError("duplicate hardware adapter identity")
        return self


class ArtifactFile(Contract):
    relative_path: Ref
    bytes: Bytes | None
    sha256: Sha256 | None
    source_url: Ref
    kind: Literal["weights", "projector", "tokenizer", "head", "license", "config"]

    @model_validator(mode="after")
    def contained_path(self):
        parts = self.relative_path.replace("\\", "/").split("/")
        if self.relative_path.startswith(("/", "\\")) or any(part in ("", ".", "..") for part in parts) or ":" in self.relative_path:
            raise ValueError("artifact paths must be relative and contained")
        if not self.source_url.startswith("https://"):
            raise ValueError("artifact source requires HTTPS")
        return self


class ModelArtifact(Contract):
    artifact_id: Ref
    provider: Ref
    model_id: Ref
    revision: Ref | None
    format: Literal["gguf", "onnx", "safetensors"]
    quantization: Ref | None
    architecture: Ref | None
    roles: tuple[Role, ...]
    files: tuple[ArtifactFile, ...]
    manifest_complete: bool = False
    license_ref: Ref | None = None
    license_digest: Sha256 | None = None
    context_limit: Positive | None = None
    requires_task_head: bool = False
    task_head_ref: Ref | None = None
    requires_projector: bool = False
    evidence_refs: tuple[Ref, ...] = ()

    @model_validator(mode="after")
    def unique_paths(self):
        if len({item.relative_path for item in self.files}) != len(self.files):
            raise ValueError("duplicate artifact file")
        if not self.roles or len(set(self.roles)) != len(self.roles):
            raise ValueError("artifact roles must be nonempty and unique")
        return self


class CatalogSnapshot(Contract):
    revision: Ref
    observed_at: Utc
    artifacts: tuple[ModelArtifact, ...]

    @model_validator(mode="after")
    def unique_artifacts(self):
        if len({item.artifact_id for item in self.artifacts}) != len(self.artifacts):
            raise ValueError("duplicate artifact identity")
        return self


class RuntimeOperation(Contract):
    artifact_id: Ref
    artifact_revision: Ref
    role: Role
    context_limit: Positive
    evidence_ref: Ref
    placement: Literal["cpu", "gpu"] = "cpu"
    adapter_id: Ref | None = None
    adapter_ref: Ref | None = None


class RuntimeSnapshot(Contract):
    build_ref: Ref
    binary_sha256: Sha256 | None
    state: Literal["verified", "detected", "unavailable", "unknown"]
    managed: Literal["in_tree", "external"]
    os: Ref
    arch: Ref
    backend: BackendObservation
    required_cpu_features: tuple[Ref, ...] = ()
    process_ref: Ref | None = None
    operations: tuple[RuntimeOperation, ...] = ()


class MemoryProfile(Contract):
    artifact_id: Ref
    artifact_revision: Ref
    runtime_build_ref: Ref
    placement: Literal["cpu", "gpu"]
    adapter_id: Ref | None = None
    fixed_ram_bytes: Bytes
    ram_bytes_per_context_token: Bytes
    scratch_ram_bytes_per_request: Bytes
    fixed_gpu_bytes: Bytes
    gpu_bytes_per_context_token: Bytes
    scratch_gpu_bytes_per_request: Bytes
    max_context_tokens: Positive
    max_parallel_requests: Positive
    evidence_ref: Ref
    hardware_scan_id: Ref
    observed_at: Utc
    status: Literal["measured", "estimated"]
    adapter_ref: Ref | None = None


class BenchmarkEvidence(Contract):
    artifact_id: Ref
    artifact_revision: Ref
    runtime_build_ref: Ref
    hardware_scan_id: Ref
    role: Role
    context_tokens: Positive
    parallel_requests: Positive
    quality_passed: bool
    slo_passed: bool
    slow: bool = False
    quality_tier: Literal["lite", "balanced", "max"] | None = None
    evidence_ref: Ref
    placement: Literal["cpu", "gpu"] = "cpu"
    adapter_id: Ref | None = None


class RoleInputBudget(Contract):
    role: Role
    context_tokens: Positive
    parallel_requests: Positive = 1


class RecommendationRequest(Contract):
    preset: Preset
    now: Utc
    context_tokens: Positive
    parallel_requests: Positive = 1
    max_parallel_models: Positive = 1
    available_compute_slots: Bytes | None = None
    opt_in_roles: tuple[Role, ...] = ()
    role_budgets: tuple[RoleInputBudget, ...] = ()
    max_ram_bytes: Bytes | None = None
    max_gpu_bytes: Bytes | None = None
    browser_ram_reserve_bytes: Bytes = 1073741824
    gpu_reserve_bytes: Bytes = 536870912
    cloud_policy: Literal["deny", "explicit_allow"] = "deny"
    cloud_connection_verified: bool = False
    custom_artifact_ids: tuple[Ref, ...] = ()
    download_consent_artifact_ids: tuple[Ref, ...] = ()
    verified_installed_artifact_ids: tuple[Ref, ...] = ()
    game_mode: bool = False

    @model_validator(mode="after")
    def unique_role_budgets(self):
        if len({item.role for item in self.role_budgets}) != len(self.role_budgets):
            raise ValueError("duplicate role input budget")
        return self


class ModelRecommendation(Contract):
    artifact_id: Ref
    role: Role
    context_tokens: Positive
    parallel_requests: Positive
    quality_tier: Literal["lite", "balanced", "max"] | None = None
    runtime_build_ref: Ref | None
    placement: Literal["cpu", "gpu"] | None
    adapter_id: Ref | None = None
    support: Support
    suitability: Literal["recommended", "usable", "slow", "insufficient_resources", "unmeasured"]
    selectable: bool
    allocation_ready: bool
    download_ready: bool
    download_bytes: Bytes | None
    peak_ram_bytes: Bytes | None
    peak_gpu_bytes: Bytes | None
    reason_codes: tuple[Ref, ...]
    evidence_refs: tuple[Ref, ...]


class ChatQualificationCandidate(Contract):
    """A downloadable short-chat candidate that still needs this device's proof."""
    artifact_id: Ref
    artifact_revision: Ref
    state: Literal['ready_to_download', 'unsupported_platform', 'disk_measurement_required',
        'disk_space_insufficient', 'ram_measurement_required', 'ram_reserve_insufficient']
    context_tokens: Literal[1024] = 1024
    max_output_tokens: Literal[48] = 48
    parallel_requests: Literal[1] = 1
    max_ram_bytes: Literal[805306368] = 805306368
    max_seconds: Literal[25] = 25
    download_bytes: Bytes
    required_disk_bytes: Bytes
    available_disk_bytes: Bytes | None = None
    available_ram_bytes: Bytes | None = None
    reason_codes: tuple[Ref, ...] = ()
    qualified_for_device: Literal[False] = False
    product_available: Literal[False] = False
    execution_unavailable: Literal[True] = True


class RecommendationResult(Contract):
    schema_version: Literal[1] = 1
    hardware_scan_id: Ref
    catalog_revision: Ref
    requested_preset: Preset
    automatic_recommendation: Preset | None
    state: Literal["proposed", "needs_diagnostics", "unavailable"]
    recommendations: tuple[ModelRecommendation, ...]
    selected_artifact_ids: tuple[Ref, ...]
    max_simultaneous_models: Bytes
    cloud_allowed: bool
    reason_codes: tuple[Ref, ...]
    chat_qualification_candidate: ChatQualificationCandidate | None = None


class ModelResidencyLeaseRequest(Contract):
    """Broker contract only; does not acquire a second compute scheduler slot."""
    scope: Scope
    run_or_turn_id: Ref
    plan_ref: Ref
    plan_revision: Positive
    artifact_id: Ref
    artifact_revision: Ref
    runtime_build_ref: Ref
    runtime_sha256: Sha256
    placement: Literal["cpu", "gpu"]
    context_tokens: Positive
    parallel_requests: Positive
    expires_at: Utc
    existing_compute_owner_key: Ref
    admission_generation: Ref


class ModelResidencyLeaseSnapshot(Contract):
    lease_id: Ref
    request: ModelResidencyLeaseRequest
    revision: Positive
    state: Literal["held", "pressure", "released", "stale"]
    reserved_ram_bytes: Bytes
    reserved_gpu_bytes: Bytes
    adapter_id: Ref | None = None
