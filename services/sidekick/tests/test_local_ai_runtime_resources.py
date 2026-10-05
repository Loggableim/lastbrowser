"""No runtime installation: fixture manifests and existing Python helper processes."""
import hashlib
import pathlib
import sys
from datetime import datetime, timezone
import pytest
from pydantic import ValidationError
from test_local_ai_setup import setup_env, approved, DATA, catalog
from test_local_ai_broker import payload
from test_local_ai_installer import MemoryTransport, target
from runtime.local_ai.runtime_probe import RuntimeBuildManifest, RuntimeBuildFile, inspect_runtime_build, runtime_snapshot_from_preflight, _run_probe_process
from runtime.local_ai.resources import LocalAiResourceManager, AGENT_MIN_CONTEXT
from runtime.local_ai.snapshots import HardwareScanStore
from runtime.local_ai.installer import LocalAiInstaller


def manifest_fixture(root):
    directory = root / 'apps/desktop/runtime/local-ai/controlled'; directory.mkdir(parents=True)
    files = []
    for name, content, kind in [('llama-server.exe', b'controlled placeholder never executed', 'binary'), ('ggml.dll', b'controlled library', 'library'), ('LICENSE', b'controlled license', 'license')]:
        (directory / name).write_bytes(content)
        files.append(RuntimeBuildFile(relative_path=name, bytes=len(content), sha256=hashlib.sha256(content).hexdigest(), kind=kind))
    return RuntimeBuildManifest(build_ref='controlled-build', source_revision='a' * 40,
        package_relative_dir='apps/desktop/runtime/local-ai/controlled', os='win32', arch='x64', declared_backends=('cpu', 'vulkan'),
        files=tuple(files), version_output_marker='controlled', help_output_marker='controlled', license_source='https://example.org/license',
        redistribution_review_ref='controlled-test-not-commercial-approval')


def test_manifest_integrity_and_dll_drift_never_claim_operations(setup_env):
    _, scope, _, cache, _ = setup_env; manifest = manifest_fixture(cache)
    proof = inspect_runtime_build(cache, manifest, scope, '2026-10-04T01:00:00Z')
    assert proof.state == 'integrity_verified' and not proof.operation_verified
    snapshot = runtime_snapshot_from_preflight(manifest, proof)
    assert snapshot.state == 'detected' and snapshot.backend.status == 'unknown' and snapshot.operations == ()
    (cache / manifest.package_relative_dir / 'ggml.dll').write_bytes(b'changed')
    assert inspect_runtime_build(cache, manifest, scope, proof.observed_at).state == 'blocked'


def test_missing_files_no_execute_and_manifest_traversal_rejected(setup_env):
    _, scope, _, cache, _ = setup_env; manifest = manifest_fixture(cache)
    (cache / manifest.package_relative_dir / 'llama-server.exe').unlink()
    assert inspect_runtime_build(cache, manifest, scope, '2026-10-04T01:00:00Z', run_preflight=True).state == 'unavailable'
    with pytest.raises(ValidationError): RuntimeBuildFile(relative_path='../outside.dll', bytes=1, sha256='a' * 64, kind='library')


def test_actual_hidden_python_probe_and_bounded_output():
    binary = pathlib.Path(sys.executable).resolve()
    state, output, code = _run_probe_process(binary, ('--version',), timeout=2)
    assert state == 'exited' and code == 0 and b'Python' in output
    state, output, _ = _run_probe_process(binary, ('-I', '-c', 'print("x" * 100000)'), timeout=2, output_limit=1024)
    assert state == 'output_limit' and len(output) == 1024


def test_actual_hidden_probe_timeout_reaps_own_child_and_descendant(tmp_path):
    import subprocess
    import time
    from web.api.local_ai_setup import process_identity
    marker = tmp_path / 'controlled-probe-child.txt'
    code = 'import subprocess,sys,pathlib,time,os;child=subprocess.Popen([sys.executable,"-I","-c","import time;time.sleep(30)"],creationflags=subprocess.CREATE_NO_WINDOW if os.name=="nt" else 0);pathlib.Path(sys.argv[1]).write_text(str(child.pid));time.sleep(30)'
    state, _, return_code = _run_probe_process(pathlib.Path(sys.executable).resolve(), ('-I', '-c', code, str(marker)), timeout=.5)
    assert state == 'timeout' and return_code is not None
    pid = int(marker.read_text())
    deadline = time.monotonic() + 2
    while process_identity(pid)[0] != 'dead' and time.monotonic() < deadline: time.sleep(.01)
    assert process_identity(pid)[0] == 'dead'


def resource_manager(service, scope, cache, *, generation='generation-1'):
    scans = HardwareScanStore(clock=lambda: datetime(2026, 10, 4, 1, tzinfo=timezone.utc))
    data = payload(); data['scope'] = scope.model_dump(mode='json', by_alias=True); scans.bind(scope, data)
    return LocalAiResourceManager(service, scans, lambda _: cache, cache, generation_provider=lambda _: generation)


def test_resource_report_actual_installed_hash_missing_runtime_and_scope(setup_env):
    service, scope, other, cache, _ = setup_env; plan = approved(service, scope)
    manager = resource_manager(service, scope, cache)
    kwargs = {'actor': 'default', 'scan_id': 'scan-1', 'plan_digest': plan.plan_digest, 'artifact_id': plan.artifacts[0].artifact_id, 'role': 'extract'}
    assert manager.inspect(scope, **kwargs).artifact_integrity == 'missing'
    LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport()).install(scope, actor='default', plan_digest=plan.plan_digest)
    proof = manager.inspect(scope, **kwargs)
    assert proof.artifact_integrity == 'verified' and not proof.execution_ready and not proof.cloud_allowed
    assert 'runtime_manifest_missing' in proof.reason_codes
    target(cache, plan).write_bytes(b'modified')
    assert manager.inspect(scope, **kwargs).artifact_integrity == 'changed'
    with pytest.raises(ValueError): manager.inspect(other, **kwargs)


def test_resource_compute_owner_actual_shared_scope_generation(setup_env):
    from runtime.independent.manager import ComputeAdmission
    service, scope, other, cache, _ = setup_env; plan = approved(service, scope)
    manager = resource_manager(service, scope, cache)
    kwargs = {'actor': 'default', 'scan_id': 'scan-1', 'plan_digest': plan.plan_digest, 'artifact_id': plan.artifacts[0].artifact_id, 'role': 'extract',
        'existing_compute_owner_key': 'controlled-resource-run', 'admission_generation': 'generation-1'}
    assert not manager.inspect(scope, **kwargs).compute_owner_valid
    assert ComputeAdmission.acquire('controlled-resource-run', scope)
    try:
        proof = manager.inspect(scope, **kwargs)
        assert proof.compute_owner_valid and proof.compute_owner_count >= 1
        assert not manager.inspect(scope, **{**kwargs, 'admission_generation': 'stale'}).compute_owner_valid
    finally: ComputeAdmission.release('controlled-resource-run')


def test_agent_32k_context_artifact_is_truthfully_blocked(setup_env):
    import uuid
    from runtime.local_ai.setup import SetupChoice
    service, scope, _, cache, _ = setup_env
    item = catalog().artifacts[0].model_copy(update={'roles': ('agent',), 'context_limit': 32768})
    service.catalog_provider = lambda: catalog().model_copy(update={'artifacts': (item,)})
    service.select(scope, SetupChoice(expected_revision=0, client_request_id=uuid.uuid4().hex, decision='local', preset='balanced', artifact_ids=(item.artifact_id,)), actor='default')
    plan = service.plan(scope, actor='default', expected_revision=1, client_request_id=uuid.uuid4().hex)
    service.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest, license_digests=(item.license_digest,), client_request_id=uuid.uuid4().hex, private_human_action=lambda *_: True)
    report = resource_manager(service, scope, cache).inspect(scope, actor='default', scan_id='scan-1', plan_digest=plan.plan_digest, artifact_id=item.artifact_id, role='agent')
    assert report.minimum_context_tokens == AGENT_MIN_CONTEXT == 65536
    assert 'agent_requires_64k_context' in report.reason_codes and not report.execution_ready
