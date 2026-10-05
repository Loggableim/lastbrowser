"""Leaf broker; host supplies trusted scope and private Main authentication.

No global config/profile mutation, downloads, process startup or router registration.
"""
from __future__ import annotations
from pathlib import Path
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, ValidationError
from runtime.independent.contracts import Contract, Scope, Ref
from runtime.local_ai.contracts import (Preset, Role, RoleInputBudget, RecommendationRequest,
    ChatQualificationCandidate)
from runtime.local_ai.registry import liquid_catalog
from runtime.local_ai.recommendations import recommend
from runtime.local_ai.snapshots import HardwareScanStore, ScanBindingError, runtime_inventory, available_compute_slots
from runtime.local_ai.compatibility import measured_bytes, download_bytes

CHAT_CANDIDATE_ID = 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'
CHAT_CANDIDATE_REVISION = '9969000761ce34de907bf20017cbfc3d52d6eaf9'
CHAT_CANDIDATE_MIN_RAM_BYTES = 1073741824 + 805306368


def chat_qualification_candidate(hardware, catalog, now, max_ram_bytes=None):
    """Offer only the pinned 350M short-chat artifact for an explicit local test.

    This is download guidance, never product readiness. The device still needs
    a fresh real three-answer quality/SLO/memory proof before any AUTO route.
    """
    artifact = next((item for item in catalog.artifacts if item.artifact_id == CHAT_CANDIDATE_ID
        and item.revision == CHAT_CANDIDATE_REVISION and item.manifest_complete), None)
    if artifact is None:
        return None
    size = download_bytes(artifact)
    if size is None:
        return None
    available_disk = measured_bytes(hardware.disk_free_bytes, now)
    available_ram = measured_bytes(hardware.ram_available_bytes, now)
    required_disk = size * 2  # installer keeps a verified final file and a staging copy
    reasons = []
    if hardware.os != 'win32' or hardware.arch != 'x64':
        state = 'unsupported_platform'; reasons.append('chat_candidate_runtime_platform_unsupported')
    elif available_disk is None:
        state = 'disk_measurement_required'; reasons.append('chat_candidate_disk_measurement_required')
    elif available_disk < required_disk:
        state = 'disk_space_insufficient'; reasons.append('chat_candidate_disk_space_insufficient')
    elif available_ram is None:
        state = 'ram_measurement_required'; reasons.append('chat_candidate_ram_measurement_required')
    elif available_ram < CHAT_CANDIDATE_MIN_RAM_BYTES or max_ram_bytes is not None and max_ram_bytes < 805306368:
        state = 'ram_reserve_insufficient'; reasons.append('chat_candidate_ram_reserve_insufficient')
    else:
        state = 'ready_to_download'
        reasons.append('device_qualification_required_after_download')
    return ChatQualificationCandidate(artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
        state=state, download_bytes=size, required_disk_bytes=required_disk,
        available_disk_bytes=available_disk, available_ram_bytes=available_ram, reason_codes=tuple(reasons))


class LocalAiSelection(Contract):
    scan_id: Ref
    preset: Preset
    context_tokens: Annotated[int, Field(gt=0, le=1048576)]
    parallel_requests: Annotated[int, Field(gt=0, le=32)] = 1
    max_parallel_models: Annotated[int, Field(gt=0, le=8)] = 1
    opt_in_roles: tuple[Role, ...] = ()
    role_budgets: tuple[RoleInputBudget, ...] = ()
    max_ram_bytes: Annotated[int, Field(ge=0)] | None = None
    max_gpu_bytes: Annotated[int, Field(ge=0)] | None = None
    custom_artifact_ids: tuple[Ref, ...] = ()


class LocalAiBroker:
    def __init__(self, repository_root: Path, *, scans=None):
        self.repository_root = repository_root.resolve()
        self.scans = scans or HardwareScanStore()

    def catalog(self):
        return liquid_catalog()

    def bind_scan(self, scope: Scope, payload: dict):
        return self.scans.bind(scope, payload)

    def read_hardware(self, scope: Scope, scan_id: str):
        scan = self.scans.read(scope, scan_id)
        return {'scan': scan.model_dump(mode='json', by_alias=True),
            'runtimes': [item.model_dump(mode='json', by_alias=True) for item in runtime_inventory(self.repository_root, scan.hardware)],
            'availableComputeSlots': available_compute_slots(scope), 'skipAvailable': True, 'existingProviderAvailable': True}

    def recommend(self, scope: Scope, selection: LocalAiSelection):
        scan = self.scans.read(scope, selection.scan_id)
        request = RecommendationRequest(**selection.model_dump(exclude={'scan_id'}),
            now=self.scans.clock().isoformat(), available_compute_slots=available_compute_slots(scope))
        result = recommend(scan.hardware, self.catalog(), runtime_inventory(self.repository_root, scan.hardware), (), (), request)
        candidate = chat_qualification_candidate(scan.hardware, self.catalog(), request.now, selection.max_ram_bytes)
        result = result.model_copy(update={'chat_qualification_candidate': candidate})
        return {'result': result.model_dump(mode='json', by_alias=True), 'skipAvailable': True, 'existingProviderAvailable': True}


def create_local_ai_router(broker: LocalAiBroker, resolve_scope, require_main) -> APIRouter:
    """Both injected dependencies MUST authenticate the existing private caller.

    require_main must reject untrusted/renderer callers; it protects proof binding.
    resolve_scope must derive scope from the authenticated context, never body IDs.
    Host mounts this leaf and binds scopes using its existing security boundary.
    """
    router = APIRouter(prefix='/local-ai', tags=['local-ai'])

    def invoke(call):
        try:
            return call()
        except ScanBindingError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail='invalid_local_ai_contract') from exc

    @router.get('/catalog')
    def catalog(scope: Scope = Depends(resolve_scope)):
        return broker.catalog().model_dump(mode='json', by_alias=True)

    @router.post('/hardware/bind', dependencies=[Depends(require_main)])
    def bind(payload: dict, scope: Scope = Depends(resolve_scope)):
        return invoke(lambda: broker.bind_scan(scope, payload).model_dump(mode='json', by_alias=True))

    @router.get('/hardware/{scan_id}')
    def hardware(scan_id: str, scope: Scope = Depends(resolve_scope)):
        return invoke(lambda: broker.read_hardware(scope, scan_id))

    @router.post('/recommend')
    def recommendation(selection: LocalAiSelection, scope: Scope = Depends(resolve_scope)):
        return invoke(lambda: broker.recommend(scope, selection))

    return router
