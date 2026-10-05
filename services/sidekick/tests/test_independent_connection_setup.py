"""Scope-bound setup state, cancellation race and actual PKCE loopback cleanup."""
import json
import queue
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse, urlencode

import pytest
import yaml
from pydantic import ValidationError

from runtime.independent.connection_setup import ConnectionSetupService, SetupStart, SetupEvidence, handle_connection_configure, _human_request
from runtime.independent.capabilities import evidence_digest, _revision
from runtime.independent.contracts import Scope, new_id, utc_now
from runtime.independent.manager import RunManager
from runtime.independent.scope import ScopeError
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import ResourceBusy, IdempotencyConflict
from runtime.independent.worker_host import WorkerHost, WorkerError
from runtime.independent.policy import PolicyDenied


def catalog(scope):
    return {"scope": scope.model_dump(mode="json", by_alias=True), "entries": [{"capabilityId": "assistant.conversation", "connections": [
        {"connectionId": "provider:" + provider, "status": "not_configured", "revision": 1}
        for provider in ("openai-codex", "openai", "anthropic", "google-gemini-cli", "antigravity")
    ]}, {"capabilityId": "plugin:controlled", "connections": [{"connectionId": "plugin:controlled", "status": "not_configured"}]}]}


class FakeHandle:
    def __init__(self, context, payload):
        self.context, self.payload = context, payload
        self.events = queue.Queue()
        self.is_alive = True
        self.terminated = 0
        self.cancel_status = "cancelled"
        self.emit("awaiting_user", authorizationUrl="https://auth.openai.com/oauth/authorize?state=controlled-public-state")

    def emit(self, status, **extra):
        evidence = SetupEvidence(source="profile_auth_store" if status == "connected" else "setup_worker", observed_at=utc_now(),
            configuration_status="configured" if status == "connected" else "unknown",
            authentication_status="connected" if status == "connected" else "pending")
        self.events.put({"kind": "setup_state", "runId": self.context.run_id, "flowId": self.payload["flowId"],
            "scope": self.context.scope.model_dump(mode="json", by_alias=True),
            "state": {"setupStatus": status, "evidence": evidence.model_dump(mode="json", by_alias=True), **extra}})

    def read_event(self, timeout):
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def cancel(self):
        if self.is_alive:
            self.emit(self.cancel_status)

    def terminate(self, **_kwargs):
        self.terminated += 1
        self.is_alive = False


class FakeFactory:
    def __init__(self):
        self.handles = []
    def __call__(self, context):
        class Factory:
            def start(inner, *, payload):
                handle = FakeHandle(context, payload)
                self.handles.append(handle)
                return handle
        return Factory()


@pytest.fixture
def bound(tmp_path):
    home = tmp_path / "home"; (home / "workspace").mkdir(parents=True)
    hub = ProfileHub(home)
    scope = Scope.model_validate(hub.bind("default", {"workspacePath": None, "browserProfileId": "browser-a",
                                                    "partitionKey": "persist:space_home_browser-a"})["scope"])
    store, resolver = hub.by_scope(scope, "default")
    factory = FakeFactory()
    manager = RunManager(store, resolver, worker_factory=factory)
    service = ConnectionSetupService(manager, catalog_provider=catalog)
    yield hub, scope, store, resolver, factory, manager, service
    service.close(); hub.close()
    assert all(not handle.is_alive for handle in factory.handles)


def start(bound, provider="openai-codex", request_id=None):
    return bound[6].start(bound[1], SetupStart(connection_id="provider:" + provider, client_request_id=request_id or new_id()))


def wait_for(service, scope, flow_id, statuses):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        response = service.poll(scope, flow_id)
        if response["setupStatus"] in statuses:
            return response
        time.sleep(0.025)
    pytest.fail("Controlled setup did not reach expected state before deadline")


def test_start_is_durable_idempotent_profile_bound_and_never_grants_tools(bound, monkeypatch):
    request = new_id(); permissions = bound[2].get_permission_state(bound[1])
    response = start(bound, request_id=request)
    pending = wait_for(bound[6], bound[1], response["flowId"], {"awaiting_user"})
    assert pending["nextStep"]["requiresUserNavigation"] and not pending["evidence"]["authenticationStatus"] == "connected"
    monkeypatch.setenv("SIDEKICK_HOME", "unrelated-ui-profile")
    assert start(bound, request_id=request)["flowId"] == response["flowId"] and len(bound[4].handles) == 1
    assert bound[4].handles[0].context.resolved_profile_home == str(bound[0].base_home)
    durable = " ".join(row[0] for row in bound[2]._many("SELECT result_json FROM ia_request_results WHERE operation LIKE 'connection_setup%'"))
    assert "authorizationUrl" not in durable and "controlled-public-state" not in durable
    assert bound[2].get_permission_state(bound[1]) == permissions
    with pytest.raises(IdempotencyConflict):
        start(bound, provider="openai", request_id=request)


def test_credentials_unknown_connections_and_foreign_flow_access_are_denied(bound):
    with pytest.raises(ValidationError):
        SetupStart.model_validate({"action": "start", "connectionId": "provider:openai-codex", "clientRequestId": new_id(),
                                   "credential": "must-never-enter-assistant"})
    with pytest.raises(ScopeError, match="catalog"):
        start(bound, provider="fabricated")
    response = start(bound)
    foreign = bound[1].model_copy(update={"browser_profile_id": "foreign"})
    with pytest.raises(ScopeError):
        bound[6].poll(foreign, response["flowId"])
    with pytest.raises(ScopeError):
        bound[6].cancel(bound[1], new_id())


def test_api_key_plugin_and_unsafe_oauth_adapters_offer_correct_scoped_settings(bound):
    for provider in ("openai", "anthropic"):
        flow = start(bound, provider)
        assert flow["setupStatus"] == "settings_required" and flow["nextStep"]["backendProfileId"] == bound[1].backend_profile_id
        assert flow["nextStep"]["providerId"] == provider and flow["nextStep"]["kind"] == "human_form"
        assert flow["nextStep"]["fields"] == ["apiKey", "model"] and flow["nextStep"]["expectedConnectionRevision"] == 1
    plugin = bound[6].start(bound[1], SetupStart(connection_id="plugin:controlled", client_request_id=new_id()))
    assert plugin["setupStatus"] == "unavailable" and plugin["reasonCode"] == "scoped_adapter_unavailable"
    for provider in ("google-gemini-cli", "antigravity"):
        assert start(bound, provider)["setupStatus"] == "unavailable"
    assert not bound[4].handles


def test_cancel_waits_for_child_ack_and_late_cancel_preserves_committed_connection(bound):
    flow = start(bound)
    wait_for(bound[6], bound[1], flow["flowId"], {"awaiting_user"})
    cancelled = bound[6].cancel(bound[1], flow["flowId"])
    assert cancelled["setupStatus"] == "cancelled"
    assert bound[6].cancel(bound[1], flow["flowId"]) == cancelled
    flow2 = start(bound)
    handle = bound[4].handles[-1]
    (bound[0].base_home / "auth.json").write_text(json.dumps({"credential_pool": {"openai-codex": [{"access_token": "synthetic-profile-only"}]}}), "utf-8")
    handle.cancel_status = "connected"  # Token commit won the native OAuth lock.
    connected = bound[6].cancel(bound[1], flow2["flowId"])
    assert connected["setupStatus"] == "connected" and connected["evidence"]["healthStatus"] == "not_checked"
    assert "synthetic-profile-only" not in json.dumps(connected)


def test_browser_login_claim_without_bound_credential_evidence_never_becomes_connected(bound):
    flow = start(bound)
    bound[4].handles[-1].emit("connected")
    result = wait_for(bound[6], bound[1], flow["flowId"], {"interrupted"})
    assert result["evidence"]["authenticationStatus"] != "connected"


def test_provider_lease_prevents_duplicate_setup_and_a_lost_worker_is_not_replayed(bound):
    flow = start(bound)
    wait_for(bound[6], bound[1], flow["flowId"], {"awaiting_user"})
    with pytest.raises(ResourceBusy):
        start(bound)
    bound[4].handles[-1].events.put({"kind": "eof"})
    interrupted = wait_for(bound[6], bound[1], flow["flowId"], {"interrupted"})
    recovered = ConnectionSetupService(bound[5], catalog_provider=catalog)
    try:
        assert recovered.poll(bound[1], flow["flowId"])["setupStatus"] == "interrupted"
        assert len(bound[4].handles) == 1 and interrupted["reasonCode"] == "connection_setup_worker_lost"
    finally:
        recovered.close()


def test_scope_deletion_interrupts_setup_and_releases_exact_owned_worker(bound):
    flow = start(bound)
    wait_for(bound[6], bound[1], flow["flowId"], {"awaiting_user"})
    space_config = bound[3].resolve(bound[1]).space.root / "space.yaml"
    space_config.unlink()
    deadline = time.monotonic() + 3
    while bound[4].handles[-1].is_alive and time.monotonic() < deadline:
        time.sleep(0.025)
    assert not bound[4].handles[-1].is_alive
    bound[6].close()


def test_actual_two_packaged_pkce_workers_cancel_and_deny_callback_without_external_oauth_requests(tmp_path, monkeypatch):
    import socket
    import urllib.error
    import urllib.request
    shipped = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    if not shipped.is_file():
        pytest.skip("Packaged Python runtime is not present")
    home = tmp_path / "base"; other = home / "profiles" / "other"
    for root in (home, other):
        (root / "workspace").mkdir(parents=True)
    hub = ProfileHub(home)
    services = []
    handles = []
    try:
        for profile, browser in (("default", "a"), ("other", "b")):
            scope = Scope.model_validate(hub.bind(profile, {"workspacePath": None, "browserProfileId": browser,
                "partitionKey": "persist:space_home_" + browser})["scope"])
            store, resolver = hub.by_scope(scope, profile)
            def factory(context):
                class Factory:
                    def start(self, *, payload):
                        handle = WorkerHost(context, python_executable=shipped).start(payload=payload)
                        handles.append(handle)
                        return handle
                return Factory()
            manager = RunManager(store, resolver, worker_factory=factory)
            service = ConnectionSetupService(manager, catalog_provider=catalog)
            flow = service.start(scope, SetupStart(connection_id="provider:openai-codex", client_request_id=new_id()))
            pending = wait_for(service, scope, flow["flowId"], {"awaiting_user"})
            services.append((service, scope, pending))
        monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "foreign-ui-profile"))
        assert handles[0].process.pid != handles[1].process.pid
        redirects = []
        for _, scope, flow in services:
            params = parse_qs(urlparse(flow["nextStep"]["authorizationUrl"]).query)
            redirect = params["redirect_uri"][0]
            assert urlparse(redirect).hostname == "127.0.0.1"
            redirects.append((redirect, params["state"][0]))
            assert flow["scope"] == scope.model_dump(mode="json", by_alias=True)
        first, first_scope, first_flow = services[0]
        callback = redirects[0][0] + "?" + urlencode({"state": redirects[0][1], "error": "access_denied"})
        with pytest.raises(urllib.error.HTTPError) as denied:
            urllib.request.urlopen(callback, timeout=2)
        assert denied.value.code == 400
        denied_result = wait_for(first, first_scope, first_flow["flowId"], {"failed"})
        assert denied_result["reasonCode"] == "provider_oauth_failed"
        second, second_scope, second_flow = services[1]
        assert second.cancel(second_scope, second_flow["flowId"])["setupStatus"] == "cancelled"
        for service, _, _ in services:
            service.close()
        deadline = time.monotonic() + 3
        while any(handle.is_alive for handle in handles) and time.monotonic() < deadline:
            time.sleep(0.025)
        assert all(not handle.is_alive for handle in handles)
        for redirect, _ in redirects:
            with pytest.raises(OSError):
                socket.create_connection(("127.0.0.1", urlparse(redirect).port), timeout=0.25)
        assert not (home / "auth.json").exists() and not (other / "auth.json").exists()
    finally:
        for service, _, _ in services:
            service.close()
        for handle in handles:
            if handle.is_alive:
                handle.terminate(grace_seconds=0.1, hard_seconds=2)
        hub.close()


@pytest.fixture
def native_configure(tmp_path):
    shipped = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    if not shipped.is_file():
        pytest.skip("Packaged Python runtime is not present")
    home = tmp_path / "configuration-base"
    roots = [home, home / "profiles" / "other"]
    for root in roots:
        (root / "workspace").mkdir(parents=True)
        (root / "config.yaml").write_text(yaml.safe_dump({"model": {"default": "previous-local-model", "provider": "ollama"}, "providers": {}}), "utf-8")
        (root / ".env").write_text("# preserve unrelated profile values\nCONTROLLED_SETTING=untouched\n", "utf-8")
    hub = ProfileHub(home)
    rows, handles = [], []
    def factory(context):
        class Factory:
            def start(self, *, payload):
                handle = WorkerHost(context, python_executable=shipped).start(payload=payload)
                handles.append(handle)
                return handle
        return Factory()
    try:
        for profile, browser in (("default", "a"), ("other", "b")):
            scope = Scope.model_validate(hub.bind(profile, {"workspacePath": None, "browserProfileId": browser,
                "partitionKey": "persist:space_home_" + browser})["scope"])
            store, resolver = hub.by_scope(scope, profile)
            rows.append((store, resolver, RunManager(store, resolver, worker_factory=factory), scope))
        yield hub, rows, handles
    finally:
        for handle in handles:
            if handle.is_alive:
                handle.terminate(grace_seconds=0.1, hard_seconds=2)
        hub.close()
        assert all(not handle.is_alive for handle in handles)


def configure_payload(row, provider="openai", **configuration):
    store, resolver, manager, scope = row
    connection = "provider:" + provider
    return {"connectionId": connection, "clientRequestId": new_id(),
            "expectedConnectionRevision": _revision(evidence_digest(resolver.resolve(scope).profile_home), connection),
            "configuration": configuration}


def configure(row, payload):
    return handle_connection_configure(*row, payload)


def test_actual_native_api_key_write_is_profile_bound_redacted_and_idempotent(native_configure, monkeypatch):
    import os
    hub, rows, handles = native_configure
    a, b = rows
    key = "synthetic-human-" + new_id()
    foreign = b[1].resolve(b[3]).profile_home
    before = {name: (foreign / name).read_bytes() for name in ("config.yaml", ".env")}
    monkeypatch.setenv("SIDEKICK_HOME", "unrelated-ui-home")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-parent-only")
    payload = configure_payload(a, apiKey=key, model="selected-openai-model")
    response = configure(a, payload)
    assert response["applied"] and response["authenticationStatus"] == "credential_present" and response["healthStatus"] == "not_checked"
    assert response["scope"] == a[3].model_dump(mode="json", by_alias=True)
    assert key in (hub.base_home / ".env").read_text("utf-8")
    configuration = yaml.safe_load((hub.base_home / "config.yaml").read_text("utf-8"))
    assert configuration["model"]["default"] == "previous-local-model"
    assert configuration["providers"]["openai"]["models"] == ["selected-openai-model"]
    assert "CONTROLLED_SETTING=untouched" in (hub.base_home / ".env").read_text("utf-8")
    assert before == {name: (foreign / name).read_bytes() for name in before}
    assert os.environ["OPENAI_API_KEY"] == "synthetic-parent-only" and os.environ["SIDEKICK_HOME"] == "unrelated-ui-home"
    durable = json.dumps(response) + (hub.base_home / "independent-connection-configure.json").read_text("utf-8")
    durable += " ".join(str(tuple(row)) for row in a[0]._many("SELECT * FROM ia_request_results"))
    assert key not in durable and "selected-openai-model" not in durable
    stamp = (hub.base_home / ".env").stat().st_mtime_ns
    assert configure(a, payload) == response and len(handles) == 1
    assert (hub.base_home / ".env").stat().st_mtime_ns == stamp
    # Lost parent ACK: the private child's own committed journal prevents replay
    # even though the supplied connection revision is now intentionally stale.
    with a[0].transaction():
        a[0]._conn.execute("DELETE FROM ia_request_results WHERE operation='connection_configure'")
    assert configure(a, payload) == response and len(handles) == 2
    assert (hub.base_home / ".env").stat().st_mtime_ns == stamp
    with pytest.raises(IdempotencyConflict):
        configure(a, {**payload, "configuration": {"apiKey": "changed-synthetic-human-value"}})
    with pytest.raises(WorkerError, match="connection_revision_changed"):
        configure(a, {**payload, "clientRequestId": new_id()})


def test_actual_native_local_and_named_custom_endpoint_configuration(native_configure):
    hub, rows, handles = native_configure
    row = rows[0]
    answer = configure(row, configure_payload(row, "ollama", baseUrl="http://127.0.0.1:11711/v1", model="literal-local:model"))
    assert answer["configurationStatus"] == "configured" and answer["authenticationStatus"] == "unknown"
    config = yaml.safe_load((hub.base_home / "config.yaml").read_text("utf-8"))
    assert config["model"] == {"default": "literal-local:model", "provider": "ollama", "base_url": "http://127.0.0.1:11711/v1"}
    config["custom_providers"] = [{"name": "isolated-custom", "base_url": "http://localhost:11811/v1", "model": "before"}]
    (hub.base_home / "config.yaml").write_text(yaml.safe_dump(config), "utf-8")
    answer = configure(row, configure_payload(row, "custom:isolated-custom", baseUrl="https://controlled.invalid/v1", model="literal:custom-model"))
    assert answer["configurationStatus"] == "configured"
    config = yaml.safe_load((hub.base_home / "config.yaml").read_text("utf-8"))
    assert config["custom_providers"][0]["model"] == "literal:custom-model"
    assert len(handles) == 2  # No endpoint discovery or inference network call.


def test_invalid_human_inputs_are_generic_and_never_reach_a_worker(native_configure):
    row = native_configure[1][0]
    secret = "synthetic-invalid-human-value"
    for configuration in ({"apiKey": secret + "\n"}, {"apiKey": secret, "unexpected": secret}, {"baseUrl": "http://remote.invalid/v1"},
                          {"baseUrl": "https://human:secret@controlled.invalid/v1"}, {"baseUrl": "https://controlled.invalid/v1?key=" + secret}):
        with pytest.raises(PolicyDenied) as denied:
            configure(row, configure_payload(row, **configuration))
        assert secret not in str(denied.value)
    assert not native_configure[2]
    assert not (native_configure[0].base_home / "independent-connection-configure.json").exists()


def test_unknown_oauth_provider_and_endpoint_overrides_fail_before_credential_write(native_configure):
    hub, rows, handles = native_configure
    row = rows[0]
    before = (hub.base_home / ".env").read_bytes()
    for provider in ("fabricated", "openai-codex", "custom:not-installed"):
        with pytest.raises(WorkerError, match="scoped_provider_configuration_unavailable"):
            configure(row, configure_payload(row, provider, apiKey="synthetic-human-secret"))
    with pytest.raises(WorkerError, match="provider_endpoint_override_not_supported"):
        configure(row, configure_payload(row, "openai", baseUrl="https://controlled.invalid/v1"))
    assert (hub.base_home / ".env").read_bytes() == before
    assert not (hub.base_home / "independent-connection-configure.json").exists()


def test_prepared_transaction_is_never_replayed_and_cross_space_request_ids_are_bound(native_configure):
    hub, rows, handles = native_configure
    row = rows[0]
    payload = configure_payload(row, apiKey="synthetic-human-value")
    _, _, redacted = _human_request(payload, row[3])
    journal = {"schemaVersion": 1, "requests": {payload["clientRequestId"]: {"requestDigest": redacted["requestDigest"], "phase": "prepared"}}}
    (hub.base_home / "independent-connection-configure.json").write_text(json.dumps(journal), "utf-8")
    with pytest.raises(WorkerError, match="connection_configuration_commit_uncertain"):
        configure(row, payload)
    another = Scope.model_validate(hub.bind("default", {"workspacePath": None, "browserProfileId": "c", "partitionKey": "persist:space_home_c"})["scope"])
    other_row = (row[0], row[1], row[2], another)
    with pytest.raises(WorkerError, match="connection_configuration_request_id_reused"):
        configure(other_row, payload)
    assert "OPENAI_API_KEY" not in (hub.base_home / ".env").read_text("utf-8")


def test_two_actual_workers_serialize_profile_cas_across_spaces(native_configure):
    from concurrent.futures import ThreadPoolExecutor
    hub, rows, handles = native_configure
    first = rows[0]
    other_scope = Scope.model_validate(hub.bind("default", {"workspacePath": None, "browserProfileId": "other-browser",
        "partitionKey": "persist:space_home_other-browser"})["scope"])
    second = (first[0], first[1], first[2], other_scope)
    inputs = [configure_payload(row, apiKey="synthetic-concurrent-" + new_id()) for row in (first, second)]
    def apply(pair):
        row, payload = pair
        try:
            return configure(row, payload)
        except WorkerError as error:
            return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(apply, zip((first, second), inputs)))
    assert sum(isinstance(value, dict) for value in outcomes) == 1
    assert sum(value == "connection_revision_changed" for value in outcomes) == 1
    assert len(handles) == 2
    value = (hub.base_home / ".env").read_text("utf-8")
    assert sum(payload["configuration"]["apiKey"] in value for payload in inputs) == 1


def test_connection_repair_remains_available_after_browser_tool_rights_revocation(native_configure):
    hub, rows, handles = native_configure
    row = rows[0]
    current = row[0].get_permission_state(row[3])
    revoked = row[0].revoke_permissions(row[3], expected_revision=current["revision"])
    response = configure(row, configure_payload(row, apiKey="synthetic-after-tool-revocation"))
    assert response["applied"]
    assert row[0].get_permission_state(row[3]) == revoked
    assert len(handles) == 1 and handles[0].context.effective_permissions.allowed_effects == ()


def test_worker_ack_cannot_persist_credentials_or_a_foreign_scope(bound):
    row = (bound[2], bound[3], bound[5], bound[1])
    response = {"schemaVersion": 1, "scope": bound[1].model_dump(mode="json", by_alias=True), "connectionId": "provider:openai",
                "providerId": "openai", "applied": True, "connectionRevision": 1, "configurationStatus": "configured",
                "authenticationStatus": "credential_present", "healthStatus": "not_checked", "apiKey": "synthetic-secret-in-ack"}
    bound[5].run_interactive = lambda *_args: response
    with pytest.raises(PolicyDenied, match="invalid_connection_configuration_response"):
        configure(row, configure_payload(row, apiKey="synthetic-human-value"))
    del response["apiKey"]
    response["scope"] = {**response["scope"], "browserProfileId": "foreign"}
    with pytest.raises(PolicyDenied, match="invalid_connection_configuration_response"):
        configure(row, configure_payload(row, apiKey="synthetic-human-value"))
    assert not bound[2]._many("SELECT * FROM ia_request_results WHERE operation='connection_configure'")
