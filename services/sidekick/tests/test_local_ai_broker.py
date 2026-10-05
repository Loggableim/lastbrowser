from datetime import datetime, timedelta, timezone
import pytest
from pydantic import ValidationError
from runtime.independent.contracts import Scope
from runtime.local_ai.snapshots import HardwareScanStore, ScanBindingError, runtime_inventory, available_compute_slots
from runtime.local_ai.contracts import AdapterSnapshot, HardwareSnapshot, Measurement
from web.api.local_ai import LocalAiBroker, LocalAiSelection, create_local_ai_router

NOW = datetime(2026, 10, 4, 1, tzinfo=timezone.utc)
SCOPE = Scope(backend_profile_id='00000000-0000-4000-8000-000000000001', space_id='00000000-0000-4000-8000-000000000002', browser_profile_id='browser')


def payload():
    measure = Measurement(value=8 * 2**30, status='measured', source='controlled', observed_at=NOW.isoformat())
    hardware = HardwareSnapshot(scan_id='scan-1', observed_at=NOW.isoformat(), os='win32', arch='x64',
        ram_total_bytes=measure, ram_available_bytes=measure, disk_free_bytes=measure)
    return {'schemaVersion': 1, 'scope': SCOPE.model_dump(by_alias=True), 'hardware': hardware.model_dump(mode='json', by_alias=True),
        'gpuFeatureStatus': {'webgpu': 'enabled'}, 'probeIssues': []}


def broker(root):
    return LocalAiBroker(root, scans=HardwareScanStore(clock=lambda: NOW))


def test_bound_scan_scope_freshness_duplicate_and_copy():
    store = HardwareScanStore(clock=lambda: NOW)
    scan = store.bind(SCOPE, payload())
    scan.gpu_feature_status['webgpu'] = 'modified'
    assert store.read(SCOPE, 'scan-1').gpu_feature_status['webgpu'] == 'enabled'
    with pytest.raises(ScanBindingError): store.bind(SCOPE, payload())
    with pytest.raises(ScanBindingError): store.read(SCOPE.model_copy(update={'space_id': 'other'}), 'scan-1')
    store.clock = lambda: NOW + timedelta(seconds=31)
    with pytest.raises(ScanBindingError): store.read(SCOPE, 'scan-1')


def test_unknown_gpu_memory_topology_and_budget_remain_unknown_without_rejecting_scan():
    unknown = Measurement(value=None, status='unknown', source='electron-basic-no-budget-proof', observed_at=NOW.isoformat())
    adapter = AdapterSnapshot(adapter_id='arc', name='Intel Arc', vendor='pci:8086', shared_system_memory=None,
        memory_pool_id='unknown-memory-topology', dedicated_bytes=unknown, process_budget_bytes=unknown,
        process_usage_bytes=unknown, budget_owner_ref=None, backends=())
    hardware = HardwareSnapshot(scan_id='scan-gpu-unknown', observed_at=NOW.isoformat(), os='win32', arch='x64',
        ram_total_bytes=unknown, ram_available_bytes=unknown, disk_free_bytes=unknown, adapters=(adapter,))
    body = {'schemaVersion': 1, 'scope': SCOPE.model_dump(by_alias=True), 'hardware': hardware.model_dump(mode='json', by_alias=True),
        'gpuFeatureStatus': {}, 'probeIssues': []}
    stored = HardwareScanStore(clock=lambda: NOW).bind(SCOPE, body)
    assert stored.hardware.adapters[0].shared_system_memory is None
    assert stored.hardware.adapters[0].process_budget_bytes.status == 'unknown'


def test_no_runtime_blocks_without_hiding_skip_or_provider(tmp_path):
    service = broker(tmp_path); service.bind_scan(SCOPE, payload())
    result = service.recommend(SCOPE, LocalAiSelection(scan_id='scan-1', preset='balanced', context_tokens=512))
    assert result['skipAvailable'] and result['existingProviderAvailable']
    assert result['result']['selectedArtifactIds'] == []
    assert not result['result']['cloudAllowed']
    assert all(not row['allocationReady'] for row in result['result']['recommendations'])
    candidate = result['result']['chatQualificationCandidate']
    assert candidate['artifactId'] == 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'
    assert candidate['artifactRevision'] == '9969000761ce34de907bf20017cbfc3d52d6eaf9'
    assert candidate['state'] == 'ready_to_download' and candidate['contextTokens'] == 1024
    assert candidate['qualifiedForDevice'] is False and candidate['productAvailable'] is False


def test_chat_qualification_candidate_reports_device_blockers_without_claiming_readiness(tmp_path):
    body = payload()
    body['hardware']['diskFreeBytes'] = Measurement(value=1, status='measured', source='controlled', observed_at=NOW.isoformat()).model_dump(mode='json', by_alias=True)
    body['hardware']['ramAvailableBytes'] = Measurement(value=1, status='measured', source='controlled', observed_at=NOW.isoformat()).model_dump(mode='json', by_alias=True)
    service = broker(tmp_path); service.bind_scan(SCOPE, body)
    result = service.recommend(SCOPE, LocalAiSelection(scan_id='scan-1', preset='balanced', context_tokens=512))['result']
    candidate = result['chatQualificationCandidate']
    assert candidate['state'] == 'disk_space_insufficient'
    assert candidate['qualifiedForDevice'] is False and candidate['productAvailable'] is False

    unsupported = HardwareSnapshot.model_validate({**payload()['hardware'], 'os': 'darwin'}).model_dump(mode='json', by_alias=True)
    service2 = broker(tmp_path / 'second'); service2.bind_scan(SCOPE, {'schemaVersion': 1, 'scope': SCOPE.model_dump(by_alias=True),
        'hardware': unsupported, 'gpuFeatureStatus': {}, 'probeIssues': []})
    platform_result = service2.recommend(SCOPE, LocalAiSelection(scan_id='scan-1', preset='balanced', context_tokens=512))['result']
    assert platform_result['chatQualificationCandidate']['state'] == 'unsupported_platform'


def test_present_binary_only_detected_no_fake_verification(tmp_path):
    binary = tmp_path / 'apps/desktop/runtime/local-ai/llama-server.exe'
    binary.parent.mkdir(parents=True); binary.write_bytes(b'not-an-executable')
    hardware = HardwareSnapshot.model_validate(payload()['hardware'])
    value = runtime_inventory(tmp_path, hardware)
    assert value[0].state == 'detected' and value[0].binary_sha256 is None
    assert value[0].operations == () and value[0].backend.status == 'unknown'


@pytest.mark.parametrize('field', ['now', 'hardware', 'runtime', 'availableComputeSlots', 'cloudConnectionVerified', 'verifiedInstalledArtifactIds', 'downloadConsentArtifactIds', 'exePath'])
def test_renderer_cannot_supply_authority(field):
    with pytest.raises(ValidationError):
        LocalAiSelection.model_validate({'scanId': 'scan-1', 'preset': 'balanced', 'contextTokens': 512, field: 'forged'})


def test_compute_uses_shared_admission_without_acquiring():
    from runtime.independent.manager import ComputeAdmission
    with ComputeAdmission._lock:
        owners = dict(ComputeAdmission._owners); claims = dict(ComputeAdmission._scope_claims)
        try:
            ComputeAdmission._owners.clear(); ComputeAdmission._scope_claims.clear()
            assert available_compute_slots(SCOPE) == 2
            assert ComputeAdmission.acquire('controlled-run', SCOPE)
            assert available_compute_slots(SCOPE) == 0
            other = SCOPE.model_copy(update={'space_id': 'other'})
            assert available_compute_slots(other) == 1
            assert list(ComputeAdmission._owners) == ['controlled-run']
        finally:
            ComputeAdmission._owners.clear(); ComputeAdmission._owners.update(owners)
            ComputeAdmission._scope_claims.clear(); ComputeAdmission._scope_claims.update(claims)


def test_router_rejects_non_main_binding_and_unbound_recommend(tmp_path):
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    def scope(): return SCOPE
    def denied(): raise HTTPException(403, 'private_main_only')
    app = FastAPI(); app.include_router(create_local_ai_router(broker(tmp_path), scope, denied))
    client = TestClient(app)
    assert client.post('/local-ai/hardware/bind', json=payload()).status_code == 403
    assert client.get('/local-ai/catalog').status_code == 200
    assert client.post('/local-ai/recommend', json={'scanId': 'scan-1', 'preset': 'balanced', 'contextTokens': 512}).status_code == 409
