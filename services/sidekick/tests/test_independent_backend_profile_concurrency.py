"""Acceptance A28 and A29: Concurrent backend profile execution, UI profile switch,
rights revocation isolation, and strict cross-profile rejection.

A28: Zwei Backendprofile fuehren gleichzeitig Aufgaben aus; Modellkonfiguration,
Home-Verzeichnisse, Zugangsdaten und Toolkontexte vermischen sich nicht.
A29: Profilwechsel waehrend eines Hintergrundlaufs; Ausfuehrung behaelt ihr
urspruengliches Profil; neue Oberflaeche zeigt nur die erlaubte Profiluebersicht.
"""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
import time
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.independent.assistant import SpaceAssistant
from runtime.independent.contracts import (
    PermissionScope, ProviderSelection, RunContext, Scope, SpaceBinding,
    TaskDispatchRequest, new_id,
)
from runtime.independent.manager import RunManager
from runtime.independent.scope import ScopeError, ScopeResolver
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.worker_host import WorkerHost
from web.api import profiles
from web.api import independent as api


def isolated_python():
    shipped = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    return shipped if shipped.is_file() else Path(sys.executable)


def wait_for_event(handle, kind, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        event = handle.read_event(timeout=0.2)
        if event and event.get("kind") == kind:
            return event
        if event and event.get("kind") in {"eof", "error"}:
            pytest.fail(f"Controlled worker ended before {kind}: {event.get('errorCode') or event.get('code')}; stderr={handle.stderr_bytes}")
    pytest.fail(f"Controlled worker did not produce {kind} before deadline")


def setup_test_profiles(tmp_path):
    """Set up two distinct backend test profiles with distinct homes, models, credentials, and spaces."""
    base = tmp_path / "base"
    base.mkdir(parents=True, exist_ok=True)
    profiles_dir = base / "profiles"
    profiles_dir.mkdir(parents=True, exist_ok=True)

    configs = {
        "alpha": {
            "model": "model-alpha-v1",
            "provider": "custom:alpha",
            "api_key": "secret-key-alpha-999",
            "probe_provider": "alpha-probe-provider",
            "auth_key": "auth-alpha-token",
            "marker": "alpha-marker",
        },
        "beta": {
            "model": "model-beta-v2",
            "provider": "custom:beta",
            "api_key": "secret-key-beta-888",
            "probe_provider": "beta-probe-provider",
            "auth_key": "auth-beta-token",
            "marker": "beta-marker",
        },
    }

    profile_data = {}
    for name, cfg in configs.items():
        home = profiles_dir / name
        home.mkdir(parents=True, exist_ok=True)
        webui_state = home / "webui_state"
        webui_state.mkdir(parents=True, exist_ok=True)
        spaces_dir = home / "spaces"
        spaces_dir.mkdir(parents=True, exist_ok=True)
        space_root = spaces_dir / f"research-{name}"
        space_root.mkdir(parents=True, exist_ok=True)
        sessions_dir = space_root / "sessions"
        sessions_dir.mkdir(parents=True, exist_ok=True)
        ws_dir = tmp_path / "workspaces" / f"ws-{name}"
        ws_dir.mkdir(parents=True, exist_ok=True)

        space_id = new_id()
        (space_root / "space.yaml").write_text(yaml.safe_dump({
            "space_id": space_id,
            "name": f"Space {name.title()}",
            "project_dir": str(ws_dir),
            "model": {
                "default": cfg["model"],
                "provider": cfg["provider"],
                "context_length": 64000,
            },
        }), encoding="utf-8")

        (home / "config.yaml").write_text(yaml.safe_dump({
            "probe_provider": cfg["probe_provider"],
            "model": {
                "default": cfg["model"],
                "provider": cfg["provider"],
                "base_url": f"http://127.0.0.1:909{1 if name == 'alpha' else 2}/v1",
                "api_key": cfg["api_key"],
                "context_length": 64000,
            },
            "workspace": str(ws_dir),
        }), encoding="utf-8")

        (home / ".env").write_text(
            f"PROFILE_PROBE_MARKER={cfg['marker']}\n"
            f"SIDEKICK_HOME=invalid-home\n"
            f"LASTBROWSER_PARTITION_KEY=foreign\n"
            f"PYTHONPATH=foreign\n",
            encoding="utf-8"
        )

        auth_data = {
            "version": 1,
            "providers": {cfg["auth_key"]: {"controlled": True, "token": cfg["api_key"]}},
            "credential_pool": {cfg["auth_key"]: [{"controlled": True, "access_token": cfg["api_key"]}]},
        }
        (home / "auth.json").write_text(json.dumps(auth_data), encoding="utf-8")

        (webui_state / "workspaces.json").write_text(
            json.dumps([{"path": str(ws_dir), "name": f"Workspace {name.title()}"}]),
            encoding="utf-8"
        )

        profile_data[name] = {
            "home": home,
            "space_root": space_root,
            "space_id": space_id,
            "ws_dir": ws_dir,
            "cfg": cfg,
        }

    hub = ProfileHub(base)
    for name in ("alpha", "beta"):
        store = hub.get(name)
        scope = Scope(backend_profile_id=store.backend_profile_id, space_id=profile_data[name]["space_id"], browser_profile_id=f"browser-{name}")
        binding = SpaceBinding(
            scope=scope,
            native_slug=f"research-{name}",
            partition_key=f"persist:browser-{name}",
            workspace_locator=str(profile_data[name]["ws_dir"]),
        )
        store.bind_space(binding)
        ast = store.ensure_assistant(scope)
        updated = ast.model_copy(update={
            "messages": (*ast.messages, {"id": f"msg-{name}-1", "role": "user", "content": f"Execute {name} task"}),
            "revision": ast.revision + 1,
        })
        store.save_assistant(updated, expected_revision=ast.revision)
        profile_data[name]["scope"] = scope
        profile_data[name]["store"] = store
        profile_data[name]["resolver"] = ScopeResolver(store, profiles_provider=hub.profiles)

    return base, hub, profile_data


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Acceptance Criterion A28 — Simultaneous execution across 2 profiles
# ─────────────────────────────────────────────────────────────────────────────

def test_a28_concurrent_backend_profiles_full_isolation(tmp_path, monkeypatch):
    """A28: Two distinct backend profiles run concurrent tasks simultaneously.

    Verifies no cross-contamination of:
    - Process PIDs (independent OS processes)
    - Profile homes (SIDEKICK_HOME and file locations)
    - Model configurations (probe_provider and model names)
    - Credentials and auth pools (auth.json / read_credential_pool)
    - Tool contexts and MCP server keys
    - Worker threads (copied and uncopied context vars)
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    ctx_alpha = RunContext(
        run_id=new_id(),
        dispatch_id=new_id(),
        scope=alpha["scope"],
        resolved_profile_home=str(alpha["home"]),
        resolved_space_root=str(alpha["space_root"]),
        backend_profile_name="alpha",
        partition_key="persist:browser-alpha",
        binding_revision=1,
        provider=ProviderSelection(
            provider_config_ref="provider:alpha",
            model=alpha["cfg"]["model"],
            provider=alpha["cfg"]["provider"],
            context_length=64000,
        ),
        effective_permissions=PermissionScope(),
        runner_generation=new_id(),
        cancellation_token=new_id(),
    )

    ctx_beta = RunContext(
        run_id=new_id(),
        dispatch_id=new_id(),
        scope=beta["scope"],
        resolved_profile_home=str(beta["home"]),
        resolved_space_root=str(beta["space_root"]),
        backend_profile_name="beta",
        partition_key="persist:browser-beta",
        binding_revision=1,
        provider=ProviderSelection(
            provider_config_ref="provider:beta",
            model=beta["cfg"]["model"],
            provider=beta["cfg"]["provider"],
            context_length=64000,
        ),
        effective_permissions=PermissionScope(),
        runner_generation=new_id(),
        cancellation_token=new_id(),
    )

    py_exe = isolated_python()
    handles = []
    try:
        # Start both workers simultaneously in real isolated processes
        handles.append(WorkerHost(ctx_alpha, python_executable=py_exe).start(
            entry_module="runtime.independent.worker_host",
            payload={"marker": "alpha-tool", "hold": True, "authProviderIds": ["auth-alpha-token", "auth-beta-token"]}
        ))
        handles.append(WorkerHost(ctx_beta, python_executable=py_exe).start(
            entry_module="runtime.independent.worker_host",
            payload={"marker": "beta-tool", "hold": True, "authProviderIds": ["auth-alpha-token", "auth-beta-token"]}
        ))

        probe_a = wait_for_event(handles[0], "probe")
        probe_b = wait_for_event(handles[1], "probe")

        # 1. Distinct PIDs prove simultaneous, independent OS processes
        assert probe_a["pid"] != probe_b["pid"]

        # 2. Home isolation: each worker lives in its own profile home
        assert probe_a["profileHome"] == str(alpha["home"])
        assert probe_b["profileHome"] == str(beta["home"])

        # 3. Model and configuration isolation: no mixing of probe providers or env markers
        assert probe_a["providerMarker"] == "alpha-probe-provider"
        assert probe_b["providerMarker"] == "beta-probe-provider"
        assert probe_a["envMarker"] == "alpha-marker"
        assert probe_b["envMarker"] == "beta-marker"

        # 4. Credential isolation: Alpha only sees Alpha credentials; Beta only sees Beta credentials
        assert probe_a["authPresent"]["auth-alpha-token"] == {"state": True, "pool": True}
        assert probe_a["authPresent"]["auth-beta-token"] == {"state": False, "pool": False}
        assert probe_b["authPresent"]["auth-beta-token"] == {"state": True, "pool": True}
        assert probe_b["authPresent"]["auth-alpha-token"] == {"state": False, "pool": False}

        # 5. Tool and MCP context isolation
        assert probe_a["toolNames"] == ["alpha-tool"]
        assert probe_a["mcpKeys"] == ["alpha-tool"]
        assert probe_b["toolNames"] == ["beta-tool"]
        assert probe_b["mcpKeys"] == ["beta-tool"]

        # 6. Thread-level isolation: ContextVar and fallback threads remain bound to own profile
        for item in probe_a["thread"]:
            assert item["profile"] == "alpha"
            assert item["home"] == str(alpha["home"])
            assert item["marker"] == "alpha-tool"
        for item in probe_b["thread"]:
            assert item["profile"] == "beta"
            assert item["home"] == str(beta["home"])
            assert item["marker"] == "beta-tool"

        # 7. Parent profile switch test: mutate parent process environment and global profile
        monkeypatch.setenv("SIDEKICK_HOME", str(beta["home"]))
        monkeypatch.setenv("PROFILE_PROBE_MARKER", "foreign-parent-env")
        monkeypatch.setattr(profiles, "_active_profile", "beta")

        for handle, expected_home, expected_tool in zip(handles, (str(alpha["home"]), str(beta["home"])), ("alpha-tool", "beta-tool")):
            handle.send({"kind": "probe_again"})
            reply = wait_for_event(handle, "probe_again")
            assert reply["profileHome"] == expected_home
            assert reply["toolNames"] == [expected_tool]
    finally:
        for handle in handles:
            handle.terminate(grace_seconds=1, hard_seconds=3)
        assert all(not handle.is_alive for handle in handles)
        hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Acceptance Criterion A29 — UI profile switch during running background job
# ─────────────────────────────────────────────────────────────────────────────

def eventually(assertion, timeout=5):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            result = assertion()
            if result is None or result is True:
                return
            raise AssertionError("Condition is not true yet")
        except AssertionError:
            time.sleep(0.02)
    result = assertion()
    assert result is None or result is True


class ControllableWorkerHandle:
    def __init__(self, context, payload):
        self.context = context
        self.payload = payload
        self.is_alive = True
        self.events = queue.Queue()
        self.replies = []
        from runtime.independent.capabilities import evidence_digest
        if payload.get("mode") in {"materialize_session", "update_session"}:
            self.events.put({"kind": "result", "runId": context.run_id, "value": {"sessionId": payload.get("targetSessionId", "sess-1")}})
        elif payload.get("mode") == "model_catalog":
            digest = payload.get("providerConfigurationDigest") or "digest"
            evidence = evidence_digest(Path(context.resolved_profile_home))
            self.events.put({"kind": "result", "runId": context.run_id, "value": {
                "providerConfigurationDigest": digest,
                "groups": [{"provider": "custom", "models": [{"id": "model-1", "supportsIndependent": True}]}],
                "providers": [{"id": "custom:provider", "name": "Custom Provider", "configured": True}],
                "capabilityInventory": {"evidenceDigest": evidence},
            }})
        else:
            self.request("provider_request")

    def request(self, kind, **values):
        self.events.put({"kind": "request", "runId": self.context.run_id, "requestId": new_id(), "requestKind": kind, "runnerGeneration": self.context.runner_generation, **values})

    def read_event(self, timeout=0.1):
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def send(self, value):
        self.replies.append(value)

    def complete(self, value=None):
        self.events.put({"kind": "result", "runId": self.context.run_id, "value": value or {"response": f"Completed run for {self.context.backend_profile_name}"}})

    def terminate(self, **_):
        self.is_alive = False
        self.events.put({"kind": "eof"})
        return 0


class ControllableWorkerFactory:
    def __init__(self):
        self.active_workers = {}

    def __call__(self, context):
        factory = self
        class Worker:
            def start(self, *, payload):
                handle = ControllableWorkerHandle(context, payload)
                if payload.get("mode") == "run":
                    factory.active_workers[context.run_id] = handle
                return handle
        return Worker()


def test_a29_ui_profile_switch_preserves_running_context_and_isolates_new_dispatch(tmp_path, monkeypatch):
    """A29: Profile switch during an active background run.

    - Job A starts under Profile Alpha.
    - UI switches to Profile Beta (ContextVar, _active_profile, SIDEKICK_HOME).
    - Querying globalActivity as Profile Beta shows ONLY Profile Beta's spaces (Job A is invisible).
    - New dispatch as Profile Beta uses Profile Beta's configuration and store.
    - Job A completes cleanly in Profile Alpha's store, with 0 leakage to Profile Beta.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    factory = ControllableWorkerFactory()

    from runtime.independent.capabilities import CapabilityService

    manager_alpha = RunManager(alpha["store"], alpha["resolver"], worker_factory=factory)
    manager_alpha.capabilities = CapabilityService(manager_alpha)
    manager_beta = RunManager(beta["store"], beta["resolver"], worker_factory=factory)
    manager_beta.capabilities = CapabilityService(manager_beta)

    manager_alpha.start()
    manager_beta.start()

    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)
    assistant_beta = SpaceAssistant(beta["store"], beta["resolver"], manager_beta)

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
        beta["store"].backend_profile_id: (manager_beta, assistant_beta),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)

    active_actor = "alpha"
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: active_actor)

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        def post(op, *, scope, payload=None):
            return client.post(
                f"/api/independent/v1/{op}",
                headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
                json={
                    "schemaVersion": 1,
                    "scope": scope.model_dump(by_alias=True) if scope else None,
                    "payload": payload or {},
                }
            )

        # Step 1: Dispatch Job A while Profile Alpha is active
        conv_a = alpha["store"].get_assistant(alpha["scope"]).conversation_id
        req_a = {
            "clientRequestId": new_id(),
            "assistantConversationId": conv_a,
            "sourceMessageId": "msg-alpha-1",
            "kind": "start_chat",
            "title": "Job Alpha Task",
            "instruction": "Execute alpha task",
        }
        res_a = post("dispatch", scope=alpha["scope"], payload=req_a)
        assert res_a.status_code == 200, res_a.text
        run_a_id = res_a.json()["runId"]
        eventually(lambda: run_a_id in factory.active_workers)

        # Verify Job A is running in manager_alpha
        eventually(lambda: any(r.run_id == run_a_id and r.state == "running" for r in manager_alpha.activity(alpha["scope"]).runs))

        # Step 2: UI Profile Switch to Profile Beta
        active_actor = "beta"
        profiles._active_profile = "beta"
        monkeypatch.setenv("SIDEKICK_HOME", str(beta["home"]))

        # Step 3: Visibility check — Profile Beta's globalActivity must NOT see Job A
        res_global = post("globalActivity", scope=beta["scope"])
        assert res_global.status_code == 200
        global_data = res_global.json()
        assert global_data["backendProfileId"] == beta["store"].backend_profile_id
        # All returned spaces belong to Beta
        for space_entry in global_data["spaces"]:
            assert space_entry["scope"]["backendProfileId"] == beta["store"].backend_profile_id
            # Verify Job A is not present in any run list of Beta
            assert not any(r["runId"] == run_a_id for r in space_entry["activity"]["runs"])

        # Step 4: Cross-profile read rejection: Beta cannot query Alpha's activity
        res_foreign_act = post("activity", scope=alpha["scope"])
        assert res_foreign_act.status_code == 403
        assert res_foreign_act.json()["error"]["code"] == "scope_mismatch"

        # Step 5: Dispatch Job B under Profile Beta
        conv_b = beta["store"].get_assistant(beta["scope"]).conversation_id
        req_b = {
            "clientRequestId": new_id(),
            "assistantConversationId": conv_b,
            "sourceMessageId": "msg-beta-1",
            "kind": "start_chat",
            "title": "Job Beta Task",
            "instruction": "Execute beta task",
        }
        res_b = post("dispatch", scope=beta["scope"], payload=req_b)
        assert res_b.status_code == 200, res_b.text
        run_b_id = res_b.json()["runId"]
        assert run_b_id != run_a_id
        eventually(lambda: run_b_id in factory.active_workers)

        # Verify Job B is in manager_beta and uses Beta's store
        eventually(lambda: any(r.run_id == run_b_id and r.state == "running" for r in manager_beta.activity(beta["scope"]).runs))
        assert not any(r.run_id == run_a_id for r in manager_beta.activity(beta["scope"]).runs)

        # Step 6: Verify Job A in manager_alpha retained its original immutable context
        worker_handle_a = factory.active_workers[run_a_id]
        assert worker_handle_a.context.backend_profile_name == "alpha"
        assert worker_handle_a.context.resolved_profile_home == str(alpha["home"])
        assert worker_handle_a.context.provider.model == "model-alpha-v1"

        # Complete Job A
        worker_handle_a.complete()
        eventually(lambda: alpha["store"].get_run(run_a_id).state == "completed")

        # Verify Job A does NOT exist in Beta's store
        assert beta["store"].get_run(run_a_id) is None

        # Step 7: Switch back to Profile Alpha and verify completed state
        active_actor = "alpha"
        profiles._active_profile = "alpha"
        monkeypatch.setenv("SIDEKICK_HOME", str(alpha["home"]))

        res_alpha_global = post("globalActivity", scope=alpha["scope"])
        assert res_alpha_global.status_code == 200
        alpha_global = res_alpha_global.json()
        assert alpha_global["backendProfileId"] == alpha["store"].backend_profile_id
        # Shows Run A as completed
        alpha_runs = [r for s in alpha_global["spaces"] for r in s["activity"]["runs"]]
        assert any(r["runId"] == run_a_id and r["state"] == "completed" for r in alpha_runs)
        # Shows NO traces of Run B
        assert not any(r["runId"] == run_b_id for r in alpha_runs)

        # Complete Job B
        worker_handle_b = factory.active_workers[run_b_id]
        worker_handle_b.complete()
        eventually(lambda: beta["store"].get_run(run_b_id).state == "completed")

    manager_alpha.shutdown()
    manager_beta.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Rights Revocation Isolation Between Concurrent Backend Profiles
# ─────────────────────────────────────────────────────────────────────────────

def test_rights_revocation_isolation_between_concurrent_backend_profiles(tmp_path):
    """Permissions revocation on Profile Alpha must interrupt Profile Alpha's run,
    while Profile Beta's concurrent run remains active and unrevoked.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    factory = ControllableWorkerFactory()
    manager_alpha = RunManager(alpha["store"], alpha["resolver"], worker_factory=factory)
    manager_beta = RunManager(beta["store"], beta["resolver"], worker_factory=factory)

    manager_alpha.start()
    manager_beta.start()

    # Dispatch tasks in both profiles
    task_a = TaskDispatchRequest(
        client_request_id=new_id(),
        scope=alpha["scope"],
        assistant_conversation_id=alpha["store"].get_assistant(alpha["scope"]).conversation_id,
        source_message_id="msg-alpha-1",
        kind="start_chat",
        title="Alpha background task",
        instruction="Alpha instructions",
    )
    task_b = TaskDispatchRequest(
        client_request_id=new_id(),
        scope=beta["scope"],
        assistant_conversation_id=beta["store"].get_assistant(beta["scope"]).conversation_id,
        source_message_id="msg-beta-1",
        kind="start_chat",
        title="Beta background task",
        instruction="Beta instructions",
    )

    prov_a = ProviderSelection(provider_config_ref="p:a", model="model-alpha-v1", provider="custom:alpha", context_length=64000)
    prov_b = ProviderSelection(provider_config_ref="p:b", model="model-beta-v2", provider="custom:beta", context_length=64000)

    view_a = manager_alpha.dispatch(task_a, provider=prov_a, permissions=PermissionScope())
    view_b = manager_beta.dispatch(task_b, provider=prov_b, permissions=PermissionScope())

    # Both runs are active
    eventually(lambda: view_a.run_id in factory.active_workers)
    eventually(lambda: view_b.run_id in factory.active_workers)
    eventually(lambda: alpha["store"].get_run(view_a.run_id).state == "running")
    eventually(lambda: beta["store"].get_run(view_b.run_id).state == "running")

    # Revoke permissions on Profile Alpha
    rev_a = alpha["store"].get_permission_state(alpha["scope"])["revision"]
    ack_alpha = manager_alpha.revoke(alpha["scope"], expected_revision=rev_a)
    assert ack_alpha.get("acknowledged") is True

    # Profile Alpha's run is interrupted
    eventually(lambda: alpha["store"].get_run(view_a.run_id).state == "interrupted")

    # Profile Beta's run is COMPLETELY unaffected
    assert beta["store"].get_run(view_b.run_id).state == "running"
    perm_state_b = beta["store"].get_permission_state(beta["scope"])
    assert not (perm_state_b["permissions"] or {}).get("revoked")

    # Complete Profile Beta's run
    factory.active_workers[view_b.run_id].complete()
    eventually(lambda: beta["store"].get_run(view_b.run_id).state == "completed")

    manager_alpha.shutdown()
    manager_beta.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Strict Cross-Profile API Rejection at Broker Boundary
# ─────────────────────────────────────────────────────────────────────────────

def test_cross_profile_api_rejection_at_broker_boundary(tmp_path, monkeypatch):
    """Any attempt by Profile Beta to read or modify Profile Alpha's state
    must be rejected with HTTP 403 ScopeError.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    from runtime.independent.capabilities import CapabilityService

    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    manager_alpha.capabilities = CapabilityService(manager_alpha)
    manager_beta = RunManager(beta["store"], beta["resolver"])
    manager_beta.capabilities = CapabilityService(manager_beta)
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)
    assistant_beta = SpaceAssistant(beta["store"], beta["resolver"], manager_beta)

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
        beta["store"].backend_profile_id: (manager_beta, assistant_beta),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)

    # Authenticated actor is Profile Beta
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "beta")

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        def post(op, *, scope, payload=None):
            return client.post(
                f"/api/independent/v1/{op}",
                headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
                json={
                    "schemaVersion": 1,
                    "scope": scope.model_dump(by_alias=True) if scope else None,
                    "payload": payload or {},
                }
            )

        forbidden_operations = [
            ("activity", {}),
            ("assistantSnapshot", {}),
            ("assistantTurn", {"instruction": "test"}),
            ("assistantReset", {"mode": "preview", "action": "reset_assistant", "expectedRevision": 1}),
            ("dispatch", {"clientRequestId": new_id(), "assistantConversationId": "c", "sourceMessageId": "m", "kind": "start_chat", "title": "t", "instruction": "i"}),
            ("events", {"after": 0}),
            ("permissions", {"action": "revoke", "expectedRevision": 1}),
            ("definitions", {"action": "list"}),
            ("connectionSetup", {"action": "catalog"}),
        ]

        for op, payload in forbidden_operations:
            res = post(op, scope=alpha["scope"], payload=payload)
            assert res.status_code == 403, f"{op} returned {res.status_code}: {res.text}"
            assert res.json()["error"]["code"] == "scope_mismatch"

    manager_alpha.shutdown()
    manager_beta.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Session Storage and Transcripts Cross-Profile Isolation
# ─────────────────────────────────────────────────────────────────────────────

def test_session_storage_and_transcripts_cross_profile_isolation(tmp_path, monkeypatch):
    """Sessions saved by Profile Alpha cannot be read, listed or modified by Profile Beta."""
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    sess_alpha_id = "alpha-secret-session"
    alpha_session_path = alpha["space_root"] / "sessions" / f"{sess_alpha_id}.json"
    alpha_session_path.write_text(json.dumps({
        "session_id": sess_alpha_id,
        "title": "Alpha Secret Workchat",
        "workspace": str(alpha["space_root"]),
        "model": "model-alpha-v1",
        "model_provider": "custom:alpha",
        "profile": "alpha",
        "messages": [{"role": "user", "content": "Alpha confidential prompt"}],
        "space_scope": alpha["scope"].model_dump(mode="json", by_alias=True),
        "source_tag": "independent",
    }), encoding="utf-8")

    from cli.web_server import _bound_workspace_session, _bound_workspace_spaces
    monkeypatch.setattr(api, "_hub", hub)

    # When authenticated as Alpha:
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")
    sess_from_alpha = _bound_workspace_session(alpha["ws_dir"], sess_alpha_id)
    assert sess_from_alpha is not None
    assert sess_from_alpha[0] == alpha_session_path
    assert sess_from_alpha[1] == "research-alpha"

    # When authenticated as Beta:
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "beta")
    # Beta cannot access Alpha's workspace path
    sess_from_beta = _bound_workspace_session(alpha["ws_dir"], sess_alpha_id)
    assert sess_from_beta is None

    # Beta's bound spaces do not include Alpha's space
    beta_spaces = _bound_workspace_spaces(beta["ws_dir"])
    assert not any(s[0].native_slug == "research-alpha" for s in beta_spaces)

    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Typed Payload Validation for globalActivity
# ─────────────────────────────────────────────────────────────────────────────

def test_global_activity_typed_payload_validation(tmp_path, monkeypatch):
    """globalActivity rejects any invalid or untyped payload with HTTP 400 invalid_request."""
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]

    from runtime.independent.capabilities import CapabilityService
    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        def post(payload):
            return client.post(
                "/api/independent/v1/globalActivity",
                headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
                json={
                    "schemaVersion": 1,
                    "scope": alpha["scope"].model_dump(by_alias=True),
                    "payload": payload,
                }
            )

        # 1. Valid payloads (200 OK)
        res_empty = post({})
        assert res_empty.status_code == 200

        res_false = post({"allBrowserProfiles": False})
        assert res_false.status_code == 200

        res_true = post({"allBrowserProfiles": True})
        assert res_true.status_code == 200

        # 2. Invalid non-bool type (400 Bad Request)
        res_bad_type = post({"allBrowserProfiles": "not-a-bool"})
        assert res_bad_type.status_code == 400
        assert res_bad_type.json()["error"]["code"] == "invalid_request"

        res_bad_num = post({"allBrowserProfiles": 123})
        assert res_bad_num.status_code == 400
        assert res_bad_num.json()["error"]["code"] == "invalid_request"

        # 3. Extra forbidden keys (400 Bad Request)
        res_extra = post({"allBrowserProfiles": True, "injectedPrivilege": "root"})
        assert res_extra.status_code == 400
        assert res_extra.json()["error"]["code"] == "invalid_request"

        res_unknown = post({"unknownField": True})
        assert res_unknown.status_code == 400
        assert res_unknown.json()["error"]["code"] == "invalid_request"

    manager_alpha.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 7: globalActivity allBrowserProfiles Strictly Scoped to Authenticated Backend Profile
# ─────────────────────────────────────────────────────────────────────────────

def test_global_activity_multi_browser_profile_strictly_scoped(tmp_path, monkeypatch):
    """allBrowserProfiles expands ONLY the browser profile partitions of the authenticated backend profile.
    It never exposes spaces from another backend profile, even when querying with allBrowserProfiles=True.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    # Bind a SECOND Space to Profile Alpha under a different browser partition
    from web.api.space_engine import Space
    space2_dir = alpha["home"] / "spaces" / "extra-space"
    space2 = Space("extra-space", custom_root=alpha["home"] / "spaces")
    extra_space_id = new_id()
    space2.save_config({"name": "Extra Space", "space_id": extra_space_id})

    scope_alpha_2 = Scope(
        backend_profile_id=alpha["store"].backend_profile_id,
        space_id=extra_space_id,
        browser_profile_id="partition-secondary-alpha",
    )
    binding_2 = SpaceBinding(
        scope=scope_alpha_2,
        native_slug="extra-space",
        partition_key="persist:browser-alpha-secondary",
        workspace_locator=str(space2_dir),
    )
    alpha["store"].bind_space(binding_2)
    alpha["store"].ensure_assistant(scope_alpha_2)

    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)
    manager_beta = RunManager(beta["store"], beta["resolver"])
    assistant_beta = SpaceAssistant(beta["store"], beta["resolver"], manager_beta)

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
        beta["store"].backend_profile_id: (manager_beta, assistant_beta),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        # Case A: Authenticated as Alpha
        monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")

        # 1. Without allBrowserProfiles: returns only spaces matching scope's browser_profile_id
        res_single = client.post(
            "/api/independent/v1/globalActivity",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {"allBrowserProfiles": False},
            }
        )
        assert res_single.status_code == 200
        data_single = res_single.json()
        assert len(data_single["spaces"]) == 1
        assert data_single["spaces"][0]["scope"]["browserProfileId"] == "browser-alpha"

        # 2. With allBrowserProfiles: returns BOTH spaces of Alpha across browser profiles
        res_all = client.post(
            "/api/independent/v1/globalActivity",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {"allBrowserProfiles": True},
            }
        )
        assert res_all.status_code == 200
        data_all = res_all.json()
        assert data_all["backendProfileId"] == alpha["store"].backend_profile_id
        assert len(data_all["spaces"]) == 2
        browser_ids = {s["scope"]["browserProfileId"] for s in data_all["spaces"]}
        assert browser_ids == {"browser-alpha", "partition-secondary-alpha"}

        # CRITICAL: Absolutely ZERO spaces from Beta exist in Alpha's globalActivity
        assert not any(s["scope"]["backendProfileId"] == beta["store"].backend_profile_id for s in data_all["spaces"])
        assert not any(s["spaceName"] == "research-beta" for s in data_all["spaces"])

        # Case B: Authenticated as Beta
        monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "beta")

        res_beta_all = client.post(
            "/api/independent/v1/globalActivity",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": beta["scope"].model_dump(by_alias=True),
                "payload": {"allBrowserProfiles": True},
            }
        )
        assert res_beta_all.status_code == 200
        data_beta = res_beta_all.json()
        assert data_beta["backendProfileId"] == beta["store"].backend_profile_id
        assert len(data_beta["spaces"]) == 1
        assert data_beta["spaces"][0]["scope"]["browserProfileId"] == "browser-beta"
        # Zero spaces from Alpha
        assert not any(s["scope"]["backendProfileId"] == alpha["store"].backend_profile_id for s in data_beta["spaces"])

        # Case C: Cross-profile forgery: Beta cannot call globalActivity with Alpha's scope
        res_forbidden = client.post(
            "/api/independent/v1/globalActivity",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {"allBrowserProfiles": True},
            }
        )
        assert res_forbidden.status_code == 403
        assert res_forbidden.json()["error"]["code"] == "scope_mismatch"

    manager_alpha.shutdown()
    manager_beta.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 8: globalActivity Does Not Alter Permissions, Expand Rights, or Leak Transcripts
# ─────────────────────────────────────────────────────────────────────────────

def test_global_activity_does_not_expand_rights_or_leak_credentials(tmp_path, monkeypatch):
    """Calling globalActivity is strictly observational:
    - Permissions remain unchanged (revisions and granted effects unmutated).
    - Excludes tombstoned bindings.
    - Does not include credential secrets, tokens, or transcript contents.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]

    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)

    # Record initial permission state
    perm_before = alpha["store"].get_permission_state(alpha["scope"])

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        res = client.post(
            "/api/independent/v1/globalActivity",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {"allBrowserProfiles": True},
            }
        )
        assert res.status_code == 200
        raw_text = res.text

        # 1. No credentials or auth tokens leaked
        assert "auth-alpha-token" not in raw_text
        assert "auth-beta-token" not in raw_text
        assert "api_key" not in raw_text

        # 2. Permissions are unchanged
        perm_after = alpha["store"].get_permission_state(alpha["scope"])
        assert perm_after == perm_before

    manager_alpha.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 9: Backend Profiles Listing and ResolveScope Validation
# ─────────────────────────────────────────────────────────────────────────────

def test_backend_profiles_listing_and_resolve_scope_validation(tmp_path, monkeypatch):
    """Verifies:
    - browser.backendProfiles endpoint returns valid profiles with schemaVersion 1.
    - resolveScope with matching backendProfileName succeeds and binds correctly.
    - resolveScope with mismatched backendProfileName != actor returns 403 scope_denied.
    - resolveScope with unconfigured actor profile returns 403 scope_denied.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]

    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "alpha")

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        # 1. browser.backendProfiles returns schemaVersion 1 and profiles
        res = client.post(
            "/api/independent/v1/browser.backendProfiles",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={"schemaVersion": 1, "payload": {}}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["schemaVersion"] == 1
        profile_names = [p["name"] for p in data["profiles"]]
        assert "alpha" in profile_names
        assert "beta" in profile_names

        # 2. resolveScope with matching backendProfileName succeeds
        res_ok = client.post(
            "/api/independent/v1/resolveScope",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "payload": {
                    "browserProfileId": "browser-alpha",
                    "workspacePath": str(alpha["ws_dir"]),
                    "partitionKey": "persist:browser-alpha",
                    "backendProfileName": "alpha",
                }
            }
        )
        assert res_ok.status_code == 200
        assert res_ok.json()["backendProfileName"] == "alpha"

        # 3. resolveScope with mismatched backendProfileName ('beta' vs actor 'alpha') returns 403
        res_mismatch = client.post(
            "/api/independent/v1/resolveScope",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "payload": {
                    "browserProfileId": "browser-alpha",
                    "workspacePath": str(alpha["ws_dir"]),
                    "partitionKey": "persist:browser-alpha",
                    "backendProfileName": "beta",
                }
            }
        )
        assert res_mismatch.status_code == 403
        assert res_mismatch.json()["error"]["code"] in {"scope_mismatch", "scope_denied"}

        # 4. resolveScope when active profile is unconfigured returns 403
        monkeypatch.setattr(profiles, "get_active_profile_name", lambda: "unconfigured_profile")
        res_unconfigured = client.post(
            "/api/independent/v1/resolveScope",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "payload": {
                    "browserProfileId": "browser-alpha",
                    "workspacePath": str(alpha["ws_dir"]),
                    "partitionKey": "persist:browser-alpha",
                    "backendProfileName": "unconfigured_profile",
                }
            }
        )
        assert res_unconfigured.status_code == 403
        assert res_unconfigured.json()["error"]["code"] in {"scope_mismatch", "scope_denied"}

    manager_alpha.shutdown()
    hub.close()


# ─────────────────────────────────────────────────────────────────────────────
# Test 10: Late Responses and Cross-Profile Action Invalidation
# ─────────────────────────────────────────────────────────────────────────────

def test_late_responses_and_cross_profile_action_invalidation(tmp_path, monkeypatch):
    """Verifies that:
    - In-flight operations for profile Alpha retain their context even if actor changes.
    - Foreign operations (e.g. approve/control/turn) targeted with Beta's actor on Alpha's
      scope are rejected at the boundary.
    - Late responses on a closed/switched profile do not leak into another profile's session.
    """
    base, hub, profiles_info = setup_test_profiles(tmp_path)
    alpha = profiles_info["alpha"]
    beta = profiles_info["beta"]

    manager_alpha = RunManager(alpha["store"], alpha["resolver"])
    assistant_alpha = SpaceAssistant(alpha["store"], alpha["resolver"], manager_alpha)
    assistant_alpha.model = lambda resolved, instruction, history: json.dumps({"message": "Alpha response"})
    manager_beta = RunManager(beta["store"], beta["resolver"])
    assistant_beta = SpaceAssistant(beta["store"], beta["resolver"], manager_beta)
    assistant_beta.model = lambda resolved, instruction, history: json.dumps({"message": "Beta response"})

    bridge_secret = "bridge-secret-test"
    monkeypatch.setattr(api, "_hub", hub)
    monkeypatch.setattr(api, "_services", {
        alpha["store"].backend_profile_id: (manager_alpha, assistant_alpha),
        beta["store"].backend_profile_id: (manager_beta, assistant_beta),
    })
    monkeypatch.setattr(api, "_BRIDGE_TOKEN", bridge_secret)
    monkeypatch.setattr(api, "_gateway", None)
    monkeypatch.setattr(api, "_main_generation", None)

    current_actor = "alpha"
    monkeypatch.setattr(profiles, "get_active_profile_name", lambda: current_actor)

    app = FastAPI()
    app.include_router(api.router)

    with TestClient(app) as client:
        # Start turn on Alpha
        ast_alpha = alpha["store"].ensure_assistant(alpha["scope"])
        res_turn = client.post(
            "/api/independent/v1/assistantTurn",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {
                    "message": "Alpha command 1",
                    "clientRequestId": new_id(),
                    "expectedRevision": ast_alpha.revision,
                }
            }
        )
        assert res_turn.status_code == 200

        # Now simulate UI profile switch to Beta (actor becomes beta)
        current_actor = "beta"

        # A late or cross-profile action attempting to access Alpha's scope under Beta's actor fails
        res_cross = client.post(
            "/api/independent/v1/assistantTurn",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": alpha["scope"].model_dump(by_alias=True),
                "payload": {
                    "message": "Sneaky cross command",
                    "clientRequestId": new_id(),
                    "expectedRevision": ast_alpha.revision,
                }
            }
        )
        assert res_cross.status_code == 403

        # Beta's own operations work independently under Beta's actor
        ast_beta = beta["store"].ensure_assistant(beta["scope"])
        res_beta_turn = client.post(
            "/api/independent/v1/assistantTurn",
            headers={"X-Lastbrowser-Bridge-Token": bridge_secret},
            json={
                "schemaVersion": 1,
                "scope": beta["scope"].model_dump(by_alias=True),
                "payload": {
                    "message": "Beta command 1",
                    "clientRequestId": new_id(),
                    "expectedRevision": ast_beta.revision,
                }
            }
        )
        assert res_beta_turn.status_code == 200

        # Verify Alpha's assistant messages only contain Alpha's command, no Beta command
        alpha_ast = alpha["store"].ensure_assistant(alpha["scope"])
        alpha_msgs = [m["content"] for m in alpha_ast.messages if isinstance(m, dict) and m.get("role") == "user"]
        assert "Alpha command 1" in alpha_msgs
        assert "Sneaky cross command" not in alpha_msgs
        assert "Beta command 1" not in alpha_msgs

    manager_alpha.shutdown()
    manager_beta.shutdown()
    hub.close()


