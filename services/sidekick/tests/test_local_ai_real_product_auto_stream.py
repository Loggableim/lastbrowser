"""One opt-in real 350M Product Host -> native AUTO -> saved chat stream.

No model file is downloaded by this test. The exact pinned model and LICENSE
must already exist in LASTBROWSER_LOCAL_AI_MODEL_PATH and its sibling LICENSE.
"""
import ctypes
import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest


@pytest.mark.skipif(os.environ.get("LASTBROWSER_LOCAL_AI_REAL_INFERENCE") != "1",
    reason="explicit opt-in required for real model execution")
def test_real_350m_product_host_native_auto_stream(monkeypatch, tmp_path):
    if os.name != "nt" or platform.machine().lower() not in ("amd64", "x86_64"):
        pytest.skip("pinned llama.cpp bundle is Windows x64 only")
    if os.environ.get("LASTBROWSER_LOCAL_AI_BOUNDED_TEST_AUTH") != "I_AUTHORIZE_THIS_LOCAL_CPU_TEST":
        pytest.skip("separate explicit local model execution authorization required")

    from test_native_chat_auto import setup_auto
    from test_native_chat_process import ControlledServer
    from runtime.chat_modes import ChatExecutionPolicy
    from runtime.independent.chat_binding import reserve_chat_writer
    from runtime.independent.contracts import Scope
    from runtime.independent.manager import ComputeAdmission
    from runtime.independent.native_chat_protocol import capture_native_chat_context
    from runtime.independent.scope_binding import ProfileHub
    from runtime.local_ai.contracts import CatalogSnapshot, HardwareSnapshot, Measurement
    from runtime.local_ai.installer import LocalAiInstaller, _cache_directory
    from runtime.local_ai.product_profiles import ConfirmRoleProfile, LocalAiProductProfiles, TaskSelection
    from runtime.local_ai.runtime_bundle import private_cpu_manifest
    from runtime.local_ai.registry import liquid_catalog
    from runtime.local_ai.setup import LocalAiSetup, SetupChoice
    from runtime.local_ai.snapshots import BoundHardwareScan, HardwareScanStore
    from web.api.config import StreamChannel
    from web.api.local_ai import LocalAiBroker
    from web.api.local_ai_runtime_host import BootstrapRequest, LocalAiRuntimeHost, ReviewRequest
    from web.api.native_chats import get_context, native_chat_exit_confirmed, register_native_chat
    from runtime.local_ai.model_manager import LlamaCppSession

    repo = "LiquidAI/LFM2.5-350M-GGUF"
    revision = "9969000761ce34de907bf20017cbfc3d52d6eaf9"
    artifact = next(item for item in liquid_catalog().artifacts
        if item.artifact_id == repo + ":LFM2.5-350M-QAD-Q4_0")
    if artifact.revision != revision or artifact.files[0].sha256 != "3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d":
        raise ValueError("canonical_real_model_pin_changed")
    source = Path(os.environ["LASTBROWSER_LOCAL_AI_MODEL_PATH"])
    if not source.is_absolute() or source.is_symlink() or not stat.S_ISREG(source.lstat().st_mode):
        raise ValueError("real_model_source_not_regular_file")
    for path, expected_size, expected_hash in (
        (source, 219312832, artifact.files[0].sha256),
        (source.with_name("LICENSE"), 10596, artifact.files[1].sha256)):
        info = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(info.st_mode) or info.st_size != expected_size:
            raise ValueError("real_model_or_license_not_pinned")
        check = hashlib.sha256()
        with path.open("rb") as source_file:
            for chunk in iter(lambda: source_file.read(1024 * 1024), b""):
                check.update(chunk)
        digest = check.hexdigest()
        if digest != expected_hash:
            raise ValueError("real_model_or_license_hash_mismatch")

    server = ControlledServer(parties=1)
    server.release.set()
    context = store = auto_manager = auto_broker = hub = host = writer = channel = None
    repo_root = Path(__file__).resolve().parents[3]
    temp_parent = repo_root / ".test-tmp"
    temp_parent.mkdir(exist_ok=True)
    temp_root = temp_parent / ("lpa-" + uuid.uuid4().hex[:8])
    temp_root.mkdir()
    report_path = repo_root / "output" / "local-ai-real-product-auto-report.json"
    report = {"phase": "fixture-setup", "artifactId": artifact.artifact_id,
        "artifactRevision": artifact.revision, "modelSha256": artifact.files[0].sha256,
        "processStarted": False, "cleanupConfirmed": False}
    owner_names = set(ComputeAdmission._owners)
    try:
        # This existing native AUTO fixture supplies the ordinary provider policy
        # and captured, scope-bound chat context; the local route must win before
        # its controlled provider receives any request.
        context, store, auto_manager, auto_broker = setup_auto(temp_root, server, name="localauto")
        assert not server.requests
        actor = context.profile_name
        profile_home = Path(context.profile_home)
        base_home = profile_home.parent.parent
        default_state = base_home / "webui"
        default_state.mkdir(exist_ok=True)
        hub = ProfileHub(base_home, default_state_dir=default_state)
        scope = Scope.model_validate(context.scope)
        local_cache = temp_root / "model-cache"
        local_cache.mkdir()
        model_setup = LocalAiSetup(hub, catalog_provider=lambda: CatalogSnapshot(
            revision="pinned-350m-product-auto-v1", observed_at=datetime.now(timezone.utc).isoformat(),
            artifacts=(artifact,)))
        selected = model_setup.select(scope, SetupChoice(expected_revision=0, client_request_id=uuid.uuid4().hex,
            decision="local", preset="balanced", artifact_ids=(artifact.artifact_id,)), actor=actor)
        plan = model_setup.plan(scope, actor=actor, expected_revision=selected.revision,
            client_request_id=uuid.uuid4().hex)
        model_setup.confirm_plan(scope, actor=actor, plan_digest=plan.plan_digest,
            license_digests=(artifact.license_digest,), client_request_id=uuid.uuid4().hex,
            private_human_action=lambda actual_scope, actual_digest:
                actual_scope == scope and actual_digest == plan.plan_digest)
        identity = hashlib.sha256(artifact.artifact_id.encode()).hexdigest()
        with _cache_directory(local_cache, (plan.plan_digest, identity)) as artifact_dir:
            shutil.copyfile(source, artifact_dir / artifact.files[0].relative_path)
            shutil.copyfile(source.with_name("LICENSE"), artifact_dir / "LICENSE")
        LocalAiInstaller(model_setup, lambda _scope: local_cache).install(
            scope, actor=actor, plan_digest=plan.plan_digest)

        memory = type("MEMORYSTATUSEX", (ctypes.Structure,), {"_fields_": [
            ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]})()
        memory.dwLength = ctypes.sizeof(memory)
        if not ctypes.WinDLL("kernel32").GlobalMemoryStatusEx(ctypes.byref(memory)):
            raise OSError("GlobalMemoryStatusEx failed")
        cache_free = shutil.disk_usage(local_cache).free
        observed = datetime.now(timezone.utc)
        measured = lambda value, source_name: Measurement(value=value, status="measured",
            source=source_name, observed_at=observed.isoformat())
        hardware = HardwareSnapshot(scan_id="product-auto-" + uuid.uuid4().hex,
            observed_at=observed.isoformat(), os="win32", arch="x64", cpu_name=platform.processor() or None,
            logical_cores=os.cpu_count() or None,
            ram_total_bytes=measured(int(memory.ullTotalPhys), "windows-global-memory-status-ex"),
            ram_available_bytes=measured(int(memory.ullAvailPhys), "windows-global-memory-status-ex"),
            disk_free_bytes=measured(cache_free, "isolated-model-cache-volume"), adapters=())
        scans = HardwareScanStore()
        scans.bind(scope, BoundHardwareScan(scope=scope, hardware=hardware,
            gpu_feature_status={}, probe_issues=()).model_dump(mode="json", by_alias=True))

        manifest = private_cpu_manifest()
        host_broker = LocalAiBroker(local_cache, scans=scans)

        def diagnostic_session_factory(*session_args):
            session = LlamaCppSession.create(*session_args)
            session.stderr_target = subprocess.PIPE
            return session

        host = LocalAiRuntimeHost(hub, local_cache, repo_root, host_broker,
            core_generation="real-product-auto-" + uuid.uuid4().hex,
            setup=model_setup, manifest_provider=lambda: manifest, fixture_only=False,
            session_factory=diagnostic_session_factory)
        report.update(phase="host-review", runtimeBuildRef=manifest.build_ref)
        review = host.review(scope, actor, ReviewRequest(operation="review", purpose="product", artifact_id=artifact.artifact_id,
            role="chat", scan_id=hardware.scan_id, context_tokens=1024, budget_seconds=25,
            ram_limit_bytes=805306368))
        report["review"] = {key: review.get(key) for key in ("available", "executionUnavailable", "reasonCode", "purposeDigest")}
        if review.get("executionUnavailable"):
            raise RuntimeError("product_chat_review_blocked:" + ",".join(review.get("reasonCodes", [])))
        report["phase"] = "product-bootstrap"
        bootstrap = host.bootstrap(scope, actor, BootstrapRequest(operation="bootstrap",
            purpose_digest=review["purposeDigest"], client_request_id=uuid.uuid4().hex),
            lambda actual_scope, digest: actual_scope == scope and digest == review["purposeDigest"])
        report["bootstrap"] = {key: bootstrap.get(key) for key in ("state", "reasonCode", "operationVerified",
            "qualityPassed", "sloPassed", "memoryEnvelopeVerified", "releaseRedistributionVerified")}
        if (bootstrap.get("state") != "complete" or bootstrap.get("synthetic") is not False
                or bootstrap.get("operationVerified") is not True or bootstrap.get("qualityPassed") is not True
                or bootstrap.get("sloPassed") is not True or bootstrap.get("memoryEnvelopeVerified") is not True):
            raise RuntimeError("product_chat_quality_proof_failed:" + str(bootstrap.get("reasonCode") or bootstrap.get("state")))
        profiles = LocalAiProductProfiles(hub, scans, setup=model_setup, manifest_provider=lambda: manifest)
        current_profile = profiles.read(scope, actor=actor)
        role_profile = profiles.confirm(scope, ConfirmRoleProfile(expected_revision=current_profile.revision,
            setup_revision=plan.setup_revision, plan_digest=plan.plan_digest, client_request_id=uuid.uuid4().hex,
            selections=(TaskSelection(task="chat.answer", artifact_id=artifact.artifact_id, context_tokens=1024),)),
            actor=actor, private_human_action=lambda actual_scope, _digest: actual_scope == scope)
        capability = host.short_chat_capability(scope, actor)
        if capability.get("state") != "ready":
            raise RuntimeError("product_local_chat_not_ready:" + str(capability.get("reasonCode")))

        # Rebind the already accepted ordinary AUTO session to its new exact
        # stream under a fresh real writer lease.
        report["phase"] = "native-auto-dispatch"
        sessions_dir = Path(context.sessions_dir)
        session_path = sessions_dir / (context.session_id + ".json")
        saved = json.loads(session_path.read_text("utf-8"))
        prompt = "What is 2 + 2?"
        stream_id = "product_local_" + uuid.uuid4().hex[:20]
        store.release_lease(context.writer_lease_id, owner_generation=context.writer_generation)
        saved.update(active_stream_id=stream_id, pending_user_message=prompt, pending_attachments=[],
            pending_started_at=time.time())
        session_path.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
        session = SimpleNamespace(session_id=context.session_id, profile=actor, workspace=context.workspace,
            space_scope=scope.model_dump(mode="json", by_alias=True), model="controlled-model",
            model_provider="custom", selection_mode="auto", active_stream_id=stream_id)
        writer = reserve_chat_writer(session, actor=actor, owner_ref=stream_id,
            generation=context.writer_generation, profile_hub=hub)
        native_context = capture_native_chat_context(session, stream_id, writer, profile_hub=hub)
        assert native_context.selection_mode == "auto"
        register_native_chat(native_context)

        from runtime.independent.native_chat_auto import NativeAutoSessionBroker
        from web.api import config, independent
        from web.api.routes import _run_agent_streaming_with_native_writer
        monkeypatch.setattr(independent, "_local_ai_product_host", lambda _scope, _actor, _manager: host)
        monkeypatch.setattr("runtime.independent.native_chat_auto.NativeAutoSessionBroker",
            lambda captured, saved_session, execution_policy=None:
                NativeAutoSessionBroker(captured, saved_session, service=auto_broker.service,
                    execution_policy=execution_policy))
        channel = StreamChannel()
        events = channel.subscribe()
        with config.STREAMS_LOCK:
            config.STREAMS[stream_id] = channel
        args = (context.session_id, prompt, "controlled-model", context.workspace, stream_id, [])
        result = _run_agent_streaming_with_native_writer(*args, native_chat_writer=writer,
            native_chat_context=native_context, native_chat_session=session,
            model_provider="custom", execution_policy=ChatExecutionPolicy("action", 1))
        recorded = []
        while not events.empty():
            recorded.append(events.get_nowait())
        report["routeResult"] = result
        report["routeEvents"] = recorded
        assert result == 0, {"events": recorded, "capability": capability}
        assert len(server.requests) == 0, "local simple AUTO turn unexpectedly reached remote provider"
        token = next(data for event, data in recorded if event == "token")
        done = next(data for event, data in recorded if event == "done")
        expected_evidence = {"provider_id": "local-ai", "model_id": artifact.artifact_id, "successful_chat": True}
        assert "4" in token["text"], token
        assert done["provider_evidence"] == expected_evidence
        assert done["stream_id"] == done["turn_id"] == stream_id
        persisted = json.loads(session_path.read_text("utf-8"))
        assistant = next(message for message in persisted["messages"] if message.get("role") == "assistant")
        assert assistant["provider_evidence"] == assistant["execution_evidence"] == expected_evidence
        assert assistant["turn_id"] == assistant["stream_id"] == stream_id
        assert persisted["active_stream_id"] is None and persisted["pending_user_message"] is None
        assert native_chat_exit_confirmed(native_context)
        assert get_context(context.session_id, stream_id, actor=actor, scope=scope) is None
        assert host.manager.inspect(scope)[0].state == "stopped"
        assert not host._owners and not (set(ComputeAdmission._owners) - owner_names)
        report.update(phase="complete", processStarted=True, answerReceived=True,
            providerEvidence=done["provider_evidence"], streamId=stream_id, remoteRequests=len(server.requests))
        print(json.dumps({"phase": "real-product-native-auto-shortchat", "artifactId": artifact.artifact_id,
            "artifactRevision": artifact.revision, "modelSha256": artifact.files[0].sha256,
            "hardwareScanId": hardware.scan_id, "profileRevision": role_profile.profile_revision,
            "qualityEvidenceRef": capability["qualityEvidenceRef"], "memoryEvidenceRef": capability["memoryEvidenceRef"],
            "productBootstrapP95Ms": bootstrap.get("p95Ms"), "productBootstrapPeakBytes": bootstrap.get("peakObservedWorkingSetBytes"),
            "answer": assistant["content"], "providerEvidence": done["provider_evidence"],
            "streamId": stream_id, "remoteRequests": len(server.requests), "cleanupConfirmed": True,
            "releaseRedistributionVerified": capability["releaseRedistributionVerified"]}, ensure_ascii=True))
    except BaseException as exc:
        report["failure"] = {"type": type(exc).__name__, "reason": str(exc)}
        raise
    finally:
        from web.api import config
        host_close_confirmed = True
        if host is not None:
            host_close_confirmed = host.close(10)
            views = host.manager.inspect(scope) if 'scope' in locals() else ()
            report["modelHandles"] = [{"state": view.state, "reasonCode": view.reason_code,
                "processStarted": bool((item := host.manager._handles.get(view.handle_id))
                    and item.get("session") and item["session"].process),
                "processExitCode": (item["session"].process.poll() if item and item.get("session")
                    and item["session"].process else None),
                "stderrTail": (item["session"].stderr_tail().decode("utf-8", "replace")[-4096:]
                    .replace(str(temp_root), "<local-path>").replace(str(source), "<model-file>")
                    if item and item.get("session") and hasattr(item["session"], "stderr_tail") else "")}
                for view in views]
            report["processStarted"] = any(item["processStarted"] for item in report["modelHandles"])
        if writer is not None:
            try: writer.release()
            except Exception: pass
        if channel is not None:
            with config.STREAMS_LOCK:
                config.STREAMS.pop(stream_id, None)
                config.CANCEL_FLAGS.pop(stream_id, None)
                config.STREAM_PARTIAL_TEXT.pop(stream_id, None)
                config.STREAM_REASONING_TEXT.pop(stream_id, None)
                config.STREAM_LIVE_TOOL_CALLS.pop(stream_id, None)
                config.STREAM_GOAL_RELATED.pop(stream_id, None)
                config.STREAM_GOAL_CLAIMS.pop(stream_id, None)
        if hub is not None:
            hub.close()
        if auto_broker is not None:
            auto_broker.close_after_exit()
        if auto_manager is not None:
            auto_manager.shutdown()
        if store is not None:
            store.close()
        server.close()
        report["cleanupConfirmed"] = bool(host_close_confirmed)
        report["hostCloseConfirmed"] = host_close_confirmed
        resolved_temp = temp_root.resolve()
        if (resolved_temp.parent != temp_parent.resolve() or not resolved_temp.is_relative_to(repo_root)
                or not temp_root.name.startswith("lpa-")):
            raise RuntimeError("isolated_test_cleanup_target_changed")
        report_path.parent.mkdir(exist_ok=True)
        report_tmp = report_path.with_suffix(".tmp")
        report["updatedAt"] = datetime.now(timezone.utc).isoformat()
        report_tmp.write_text(json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8")
        report_tmp.replace(report_path)
        shutil.rmtree(temp_root, ignore_errors=False)
        if not host_close_confirmed:
            raise AssertionError("real product host did not acknowledge process cleanup")
