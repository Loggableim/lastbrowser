"""Opt-in real Windows CPU inference through the existing private benchmark host.

This never contacts a user profile. Set LASTBROWSER_LOCAL_AI_REAL_INFERENCE=1
and LASTBROWSER_LOCAL_AI_MODEL_PATH to a pre-downloaded, pinned 230M GGUF to
run it. The pinned LICENSE is fetched by the existing allowlisted installer.
"""
import ctypes
import hashlib
import json
import os
import platform
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest


@pytest.mark.skipif(os.environ.get('LASTBROWSER_LOCAL_AI_REAL_INFERENCE') != '1',
    reason='explicit opt-in required for real model execution')
def test_real_230m_answer_through_existing_bounded_runtime():
    if os.name != 'nt' or platform.machine().lower() not in ('amd64', 'x86_64'):
        pytest.skip('pinned llama.cpp bundle is Windows x64 only')
    if os.environ.get('LASTBROWSER_LOCAL_AI_BOUNDED_TEST_AUTH') != 'I_AUTHORIZE_THIS_LOCAL_CPU_TEST':
        pytest.skip('separate explicit local model execution authorization required')

    from runtime.independent.contracts import Scope, digest_json
    from runtime.independent.manager import ComputeAdmission
    from runtime.independent.scope_binding import ProfileHub
    from runtime.local_ai.bootstrap import BootstrapPurpose, bootstrap_benchmark
    from runtime.local_ai.contracts import CatalogSnapshot, HardwareSnapshot, Measurement
    from runtime.local_ai.installer import LocalAiInstaller, _cache_directory
    from runtime.local_ai.model_manager import ModelLoadRequest, ModelRuntimeManager
    from runtime.local_ai.resources import LocalAiResourceManager
    from runtime.local_ai.router_bootstrap_download import bootstrap_artifact
    from runtime.local_ai.runtime_bundle import private_cpu_manifest
    from runtime.local_ai.runtime_probe import RuntimeRoleAdapter
    from runtime.local_ai.snapshots import BoundHardwareScan, HardwareScanStore
    from runtime.local_ai.setup import LocalAiSetup, SetupChoice

    source = Path(os.environ['LASTBROWSER_LOCAL_AI_MODEL_PATH'])
    candidate = os.environ.get('LASTBROWSER_LOCAL_AI_CANDIDATE', 'lfm2.5-230m-qad-q4_0-v1')
    if candidate == 'lfm2.5-230m-qad-q4_0-v1':
        artifact = bootstrap_artifact()
    elif candidate == 'lfm2.5-350m-qad-q4_0-v1':
        from runtime.local_ai.registry import liquid_catalog
        artifact_id = 'LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0'
        artifact = next((item for item in liquid_catalog().artifacts
            if item.artifact_id == artifact_id
            and item.revision == '9969000761ce34de907bf20017cbfc3d52d6eaf9'), None)
        if artifact is None:
            raise ValueError('real_local_candidate_not_in_pinned_catalog')
    else:
        raise ValueError('real_local_candidate_not_allowlisted')
    expected_bytes, expected_hash = artifact.files[0].bytes, artifact.files[0].sha256
    info = source.lstat()
    import stat
    if (not source.is_absolute() or not stat.S_ISREG(info.st_mode) or source.is_symlink()
            or getattr(info, 'st_file_attributes', 0) & 0x400 or info.st_size != expected_bytes):
        raise ValueError('real_model_source_not_pinned_regular_file')
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != expected_hash:
        raise ValueError('real_model_source_hash_mismatch')

    repo_root = Path(__file__).resolve().parents[3]
    temp_parent = repo_root / '.test-tmp'
    temp_parent.mkdir(exist_ok=True)
    temp_root = temp_parent / ('lai-' + uuid.uuid4().hex[:8])
    temp_root.mkdir()
    manager = None
    owner = 'local-ai-real-test-' + uuid.uuid4().hex
    hub = None
    try:
        home = temp_root / 'profile'; state = home / 'webui'; work = temp_root / 'workspace'
        other = temp_root / 'other-workspace'
        state.mkdir(parents=True); work.mkdir(); other.mkdir()
        (state / 'workspaces.json').write_text(json.dumps([
            {'path': str(work), 'name': 'Isolated Local Inference Test'},
            {'path': str(other), 'name': 'Other'}]), encoding='utf-8')
        hub = ProfileHub(home, default_state_dir=state)
        scope = Scope.model_validate(hub.bind('default', {'workspacePath': str(work),
            'browserProfileId': 'local-ai-test', 'partitionKey': 'persist:local-ai-test'})['scope'])
        cache = temp_root / 'local-ai' / 'cache'; cache.mkdir(parents=True)
        service = LocalAiSetup(hub, catalog_provider=lambda: CatalogSnapshot(
            revision='pinned-230m-test-catalog-v1', observed_at=datetime.now(timezone.utc).isoformat(),
            artifacts=(artifact,)))
        selected = service.select(scope, SetupChoice(expected_revision=0,
            client_request_id=uuid.uuid4().hex, decision='local', preset='balanced',
            artifact_ids=(artifact.artifact_id,)), actor='default')
        plan = service.plan(scope, actor='default', expected_revision=selected.revision,
            client_request_id=uuid.uuid4().hex)
        # The user's current request explicitly authorizes this exact pinned local
        # inference test; the callback is confined to this disposable profile.
        service.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest,
            license_digests=(artifact.license_digest,), client_request_id=uuid.uuid4().hex,
            private_human_action=lambda actual_scope, actual_digest:
                actual_scope == scope and actual_digest == plan.plan_digest)

        identity = hashlib.sha256(artifact.artifact_id.encode()).hexdigest()
        with _cache_directory(cache, (plan.plan_digest, identity)) as artifact_dir:
            shutil.copyfile(source, artifact_dir / artifact.files[0].relative_path)
        # Installer verifies the preseeded model and fetches only the pinned
        # license file; its allowlist, size/hash checks, and atomic publish apply.
        LocalAiInstaller(service, lambda _scope: cache).install(scope, actor='default', plan_digest=plan.plan_digest)

        now = datetime.now(timezone.utc)
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [('dwLength', ctypes.c_ulong), ('dwMemoryLoad', ctypes.c_ulong),
                ('ullTotalPhys', ctypes.c_ulonglong), ('ullAvailPhys', ctypes.c_ulonglong),
                ('ullTotalPageFile', ctypes.c_ulonglong), ('ullAvailPageFile', ctypes.c_ulonglong),
                ('ullTotalVirtual', ctypes.c_ulonglong), ('ullAvailVirtual', ctypes.c_ulonglong),
                ('ullAvailExtendedVirtual', ctypes.c_ulonglong)]
        memory = MEMORYSTATUSEX(); memory.dwLength = ctypes.sizeof(memory)
        if not ctypes.WinDLL('kernel32').GlobalMemoryStatusEx(ctypes.byref(memory)):
            raise OSError('GlobalMemoryStatusEx failed')
        free_disk = shutil.disk_usage(cache).free
        def measured(value, source_name):
            return Measurement(value=value, status='measured', source=source_name, observed_at=now.isoformat())
        hardware = HardwareSnapshot(scan_id='local-test-' + uuid.uuid4().hex,
            observed_at=now.isoformat(), os='win32', arch='x64', cpu_name=platform.processor() or None,
            logical_cores=os.cpu_count() or None,
            ram_total_bytes=measured(int(memory.ullTotalPhys), 'windows-global-memory-status-ex'),
            ram_available_bytes=measured(int(memory.ullAvailPhys), 'windows-global-memory-status-ex'),
            disk_free_bytes=measured(free_disk, 'isolated-model-cache-volume'), adapters=())
        scans = HardwareScanStore(clock=lambda: datetime.now(timezone.utc))
        scans.bind(scope, BoundHardwareScan(scope=scope, hardware=hardware,
            gpu_feature_status={}, probe_issues=()).model_dump(mode='json', by_alias=True))

        root = repo_root
        diagnostic_log = temp_root / 'llama-server.stderr.log'
        base = private_cpu_manifest()
        test_role = 'chat' if candidate == 'lfm2.5-350m-qad-q4_0-v1' else 'agent'
        if test_role == 'chat':
            from runtime.local_ai.model_adapters import bind_model_manifest
            manifest = bind_model_manifest(base, artifact, 'chat')
        else:
            adapter = RuntimeRoleAdapter(role=test_role, artifact_id=artifact.artifact_id,
                artifact_revision=artifact.revision, adapter_ref='bounded-real-230m-answer-test-v1',
                evidence_ref='temporary-local-test-adapter-no-product-proof', endpoint='/v1/chat/completions')
            manifest = base.model_copy(update={'role_adapters': (adapter,)})
        resources = LocalAiResourceManager(service, scans, lambda _scope: cache, root,
            generation_provider=lambda _scope: 'local-ai-real-test-generation',
            manifest_provider=lambda _scope: (manifest,))
        from runtime.local_ai.runtime_probe import inspect_runtime_build
        runtime_proof = inspect_runtime_build(root, manifest, scope, now.isoformat(), run_preflight=True, timeout=3)
        if runtime_proof.state != 'preflight_verified':
            raise RuntimeError('pinned_local_runtime_preflight_failed:' + ','.join(runtime_proof.reason_codes))

        binary = next(item for item in manifest.files if item.kind == 'binary')
        request = ModelLoadRequest(scope=scope, plan_digest=plan.plan_digest,
            artifact_id=artifact.artifact_id, artifact_revision=artifact.revision,
            runtime_build_ref=manifest.build_ref, runtime_sha256=binary.sha256, role=test_role,
            context_tokens=1024, parallel_requests=1, existing_compute_owner_key=owner,
            admission_generation='local-ai-real-test-generation', scan_id=hardware.scan_id)
        from runtime.local_ai.model_manager import LlamaCppSession
        def session_factory(*args):
            session = LlamaCppSession.create(*args)
            session.stderr_target = diagnostic_log.open('wb')
            return session
        manager = ModelRuntimeManager(resources, session_factory=session_factory, fixture_only=False, max_models=1)
        if not ComputeAdmission.acquire(owner, scope): raise RuntimeError('isolated_compute_admission_busy')
        ram_limit = 768 * 1024 * 1024
        if int(memory.ullAvailPhys) < ram_limit + 1024 * 1024 * 1024:
            raise RuntimeError('available_ram_below_test_limit_and_browser_reserve')
        purpose = BootstrapPurpose(purpose='controlled-local-role-benchmark', load=request,
            budget_seconds=25, ram_limit_bytes=ram_limit,
            suite='chat-quality-v1' if test_role=='chat' else 'router-quality-v1')
        started = time.perf_counter()
        try:
            result = bootstrap_benchmark(manager, purpose, actor='default',
                private_human_action=lambda actual_scope, actual_digest:
                    actual_scope == scope and actual_digest == digest_json(purpose))
        except Exception as exc:
            tail = diagnostic_log.read_text(encoding='utf-8', errors='replace')[-4000:] if diagnostic_log.exists() else ''
            raise RuntimeError(f'{type(exc).__name__}:{exc}; llama-server stderr: {tail}') from exc
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        expected_result_count = 3 if test_role == 'chat' else 17
        if result.get('synthetic') is not False or len(result.get('suiteResults', [])) != expected_result_count or not result.get('operationShapeVerified'):
            raise AssertionError('real_local_answer_missing')
        if test_role == 'chat' and (not result.get('operationVerified') or not result.get('productEvidence')
                or result['operationProof'].get('adapterRef') != manifest.role_adapters[0].adapter_ref):
            raise AssertionError('pinned_product_chat_adapter_evidence_missing')
        suite_results = result.get('suiteResults', [])
        labels = [item.get('text', '').strip().upper() for item in suite_results[:14]] if test_role=='agent' else []
        expected_labels = ['SIMPLE'] * 4 + ['COMPLEX'] * 6 + ['UNCLEAR'] * 4
        answer_outputs = ([item.get('text', '').strip() for item in suite_results[14:17]] if test_role=='agent'
            else [item.get('text', '').strip() for item in suite_results])
        import unicodedata
        normalized_answers = [unicodedata.normalize('NFKC',value).casefold() for value in answer_outputs]
        answer_quality = (len(answer_outputs) == 3 and 'wien' in normalized_answers[0]
            and '4' in normalized_answers[1] and 'h2o' in normalized_answers[2])
        answer = answer_outputs[0] if answer_outputs else ''
        if '\ufffd' in answer or not answer:
            raise AssertionError('real_local_answer_text_or_unicode_invalid')
        # JSON escapes keep the verified answer portable across Windows code pages.
        assert result['peakObservedResidentBytes'] <= ram_limit
        assert manager.inspect(scope)[0].state == 'stopped'
        print(json.dumps({'phase': 'real-local-cpu-answer', 'artifactId': artifact.artifact_id,
            'artifactRevision': artifact.revision, 'modelBytes': artifact.files[0].bytes,
            'modelSha256': digest.hexdigest(), 'runtimeBuildRef': manifest.build_ref,
            'runtimeSha256': binary.sha256, 'cpu': hardware.cpu_name,
            'logicalCores': hardware.logical_cores, 'ramTotalBytes': int(memory.ullTotalPhys),
            'ramAvailableAtStartBytes': int(memory.ullAvailPhys), 'ramLimitBytes': ram_limit,
            'peakObservedWorkingSetBytes': result['peakObservedResidentBytes'],
            'coldStartMs': result['coldStartMs'], 'answerMs': result['p95Ms'],
            'endToEndMs': elapsed_ms, 'contextTokens': 1024, 'parallelRequests': 1,
            'routerModelLabels': labels, 'routerModelQualityPassed': labels == expected_labels,
            'routerModelCorrectFixtures': sum(a == b for a, b in zip(labels, expected_labels)) if test_role=='agent' else None,
            'routerModelFixtureCount': len(expected_labels) if test_role=='agent' else 0, 'answerQualityPassed': answer_quality,
            'qualityPassed': result['qualityPassed'], 'sloPassed': result['sloPassed'],
            'memoryEnvelopeVerified': result['memoryEnvelopeVerified'],
            'answerFixtureResults': answer_outputs,
            'answer': answer, 'operationVerified': result['operationVerified'],
            'productEvidencePresent': isinstance(result.get('productEvidence'), dict),
            'recommendationEligible': result['recommendationEligible'],
            'productAvailable': False}, ensure_ascii=True))
    finally:
        cleanup_complete = manager is None or manager.close(5)
        if cleanup_complete:
            ComputeAdmission.release(owner)
        if hub is not None:
            hub.close()
        if cleanup_complete:
            resolved_repo = repo_root.resolve()
            resolved_temp = temp_root.resolve()
            if (resolved_temp.parent != temp_parent.resolve() or not resolved_temp.is_relative_to(resolved_repo)
                    or not temp_root.name.startswith('lai-')):
                raise RuntimeError('isolated_test_cleanup_target_changed')
            shutil.rmtree(temp_root, ignore_errors=False)
        else:
            print(json.dumps({'cleanupPending': True, 'ownedTempPath': str(temp_root)}))
