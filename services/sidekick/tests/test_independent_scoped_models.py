"""Live-catalog validation, Scope isolation, atomic CAS and retry identity."""
import copy
import json
from types import SimpleNamespace

import pytest
import yaml

from runtime.independent.contracts import Scope
from runtime.independent.policy import PolicyDenied
from runtime.independent.runner import _discover_model_catalog, provider_configuration_digest
from runtime.independent.scope_binding import ProfileHub, provider_selection
from runtime.independent.scoped_models import handle_model_selection, public_catalog
from runtime.independent.store import RevisionConflict


class CatalogManager:
    def __init__(self, resolver):
        self.resolver = resolver
        self.calls = []
        self.after_discovery = None

    def make_context(self, scope, provider, *, permissions, allow_virtual_for_catalog=False, interactive=False):
        resolved = self.resolver.resolve(scope)
        assert permissions.allowed_effects == ()
        assert allow_virtual_for_catalog
        return SimpleNamespace(scope=scope, provider=provider, home=resolved.profile_home)

    def run_interactive(self, context, payload):
        self.calls.append((context, payload))
        assert payload["mode"] == "model_catalog"
        result = {"providerConfigurationDigest": provider_configuration_digest(context.home), "providers": [], "groups": [
            {"provider_id": "local-a", "provider": "Local A", "configured": True,
             "models": [{"id": "model-a", "label": "A", "supportsIndependent": True, "contextLength": 131072},
                        {"id": "model-b", "label": "B", "supportsIndependent": True, "contextLength": 131072}]},
            {"provider_id": "disconnected", "configured": False, "models": [{"id": "known-but-disconnected"}]},
            {"provider_id": "", "configured": True, "models": [{"id": "teamwork", "supportsIndependent": False}]},
        ]}
        if self.after_discovery:
            self.after_discovery(context)
        return result


@pytest.fixture
def bound(tmp_path):
    home = tmp_path / "home"; home.mkdir()
    work = tmp_path / "work"; work.mkdir()
    state = home / "state"; state.mkdir()
    (state / "workspaces.json").write_text(json.dumps([{"name": "Controlled", "path": str(work)}]), "utf-8")
    (home / "config.yaml").write_text(yaml.safe_dump({"model": {"default": "model-a", "provider": "local-a"}}), "utf-8")
    hub = ProfileHub(home, default_state_dir=state)
    row = hub.bind("default", {"workspacePath": str(work), "browserProfileId": "browser-a", "partitionKey": "persist:controlled"})
    scope = Scope.model_validate(row["scope"])
    store, resolver = hub.by_scope(scope, "default")
    manager = CatalogManager(resolver)
    yield hub, store, resolver, manager, scope
    hub.close()


def get(bound):
    _, store, resolver, manager, scope = bound
    return handle_model_selection(store, resolver, manager, scope, {"action": "get"})


def test_recent_catalog_reuses_same_scope_and_invalidates_provider_configuration(bound):
    import time
    from runtime.independent.scoped_models import probe_catalog

    _, _, resolver, manager, scope = bound
    manager.after_discovery = lambda _context: time.sleep(.15)
    started = time.monotonic()
    first = get(bound)
    cold_seconds = time.monotonic() - started
    started = time.monotonic()
    cached = get(bound)
    warm_seconds = time.monotonic() - started
    assert first["groups"] and cached["groups"]
    assert len(manager.calls) == 1
    assert cold_seconds >= .15 and warm_seconds < cold_seconds
    print(f"controlled_catalog_cold_ms={cold_seconds * 1000:.1f} warm_ms={warm_seconds * 1000:.1f}")

    (resolver.resolve(scope).profile_home / ".env").write_text("PROVIDER_REVISION=changed\n", "utf-8")
    probe_catalog(manager, scope)
    assert len(manager.calls) == 2


def test_recent_catalog_isolated_by_scope_and_credentials(bound):
    from runtime.independent.scoped_models import probe_catalog

    hub, _, resolver, manager, scope = bound
    probe_catalog(manager, scope)
    second = Scope.model_validate(hub.bind("default", {"workspacePath": str(hub.base_home.parent / "work"),
        "browserProfileId": "browser-b", "partitionKey": "persist:controlled-b"})["scope"])
    probe_catalog(manager, second)
    assert len(manager.calls) == 2
    (resolver.resolve(scope).profile_home / "auth.json").write_text('{"provider_identity":"changed"}', "utf-8")
    probe_catalog(manager, scope)
    assert len(manager.calls) == 3
    (resolver.resolve(scope).profile_home / "auth.json").write_text('{"provider_identity":"changed", "token_refresh":"rotated"}', "utf-8")
    probe_catalog(manager, scope)
    assert len(manager.calls) == 4
    manager.generation = "next-runner-generation"
    probe_catalog(manager, scope)
    assert len(manager.calls) == 5


def test_recent_catalog_singleflight_and_failed_fetch_is_not_cached(bound):
    import time
    from concurrent.futures import ThreadPoolExecutor
    from runtime.independent.scoped_models import probe_catalog

    _, _, _, manager, scope = bound
    manager.after_discovery = lambda _context: time.sleep(.15)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: probe_catalog(manager, scope), range(8)))
    assert len(manager.calls) == 1
    assert all(result == results[0] for result in results)

    # A changed provider configuration makes this a fresh key. Failed reads
    # must release waiters and permit a later retry instead of caching failure.
    profile_home = manager.resolver.resolve(scope).profile_home
    (profile_home / ".env").write_text("PROVIDER_REVISION=failed-once\n", "utf-8")
    manager.after_discovery = lambda _context: (_ for _ in ()).throw(RuntimeError("controlled catalog failure"))
    with pytest.raises(RuntimeError, match="controlled catalog failure"):
        probe_catalog(manager, scope)
    manager.after_discovery = None
    probe_catalog(manager, scope)
    assert len(manager.calls) == 3


def test_recent_catalog_expiry_forces_fresh_discovery(bound, monkeypatch):
    from runtime.independent import scoped_models

    _, _, _, manager, scope = bound
    scoped_models.probe_catalog(manager, scope)
    monkeypatch.setattr(scoped_models, "_CATALOG_REUSE_SECONDS", 0)
    scoped_models.probe_catalog(manager, scope)
    assert len(manager.calls) == 2


def test_recent_catalog_rejects_stale_resolved_binding_and_space_policy(bound):
    from runtime.independent.scoped_models import probe_catalog

    _, store, resolver, manager, scope = bound
    resolved = resolver.resolve(scope)
    probe_catalog(manager, scope, resolved=resolved)
    binding = resolved.binding
    store.bind_space(binding.model_copy(update={"revision": binding.revision + 1}),
        expected_revision=binding.revision)
    with pytest.raises(PolicyDenied, match="provider_connection_changed"):
        probe_catalog(manager, scope, resolved=resolved)
    probe_catalog(manager, scope)
    assert len(manager.calls) == 2

    current = resolver.resolve(scope)
    config = current.space.load_config()
    config["model"] = {"provider": "local-a", "default": "model-b"}
    current.space.save_config(config)
    probe_catalog(manager, scope)
    assert len(manager.calls) == 3


def test_recent_catalog_invalidates_opencode_device_and_cli_credentials(bound):
    from runtime.independent.scoped_models import probe_catalog

    _, _, resolver, manager, scope = bound
    home = resolver.resolve(scope).profile_home
    probe_catalog(manager, scope)
    (home / "opencode-device.json").write_text('{"opencode-go":{"access_token":"rotated"}}', "utf-8")
    probe_catalog(manager, scope)
    cli_auth = home / "opencode-data" / "opencode" / "auth.json"
    cli_auth.parent.mkdir(parents=True)
    cli_auth.write_text('{"opencode-go":{"key":"changed"}}', "utf-8")
    probe_catalog(manager, scope)
    assert len(manager.calls) == 3


def test_recent_catalog_accepts_valid_yaml_dates(bound):
    from runtime.independent.scoped_models import probe_catalog

    _, _, resolver, manager, scope = bound
    path = resolver.resolve(scope).space.config_path
    path.write_text(path.read_text("utf-8") + "\ngmail:\n  last_sync: 2026-10-12\n", "utf-8")
    probe_catalog(manager, scope)
    probe_catalog(manager, scope)
    assert len(manager.calls) == 1


def select(bound, **changes):
    _, store, resolver, manager, scope = bound
    return handle_model_selection(store, resolver, manager, scope,
                                  {"action": "set", "model": "model-b", "provider": "local-a", "expectedRevision": 1,
                                   "clientRequestId": "controlled-request", **changes})


def test_get_uses_bound_worker_and_redacts_public_catalog(bound, monkeypatch):
    monkeypatch.setenv("SIDEKICK_HOME", "unrelated-ui-profile")
    response = get(bound)
    assert response["model"] == "model-a" and response["provider"] == "local-a"
    assert response["revision"] == 1 and response["configured"] and response["supportsIndependent"]
    availability = response["nativeAvailability"]
    assert availability == {"schemaVersion": 1, "supported": True, "available": True,
        "reasonCode": None, "provider": "local-a", "model": "model-a",
        "scope": response["scope"], "selectionRevision": 1}
    row_availability = response["groups"][0]["models"][0]["nativeAvailability"]
    assert row_availability == availability
    assert bound[3].calls[0][0].home == bound[2].resolve(bound[4]).profile_home
    raw = {"groups": [{"provider_id": "test", "provider": "Test", "api_key": "private-only",
                       "models": [{"id": "actual-model", "label": "Actual", "secret": "private-only",
                                   "reasoning_efforts": ["low", "xhigh", "low", "private-only", {"credential": "private-only"}],
                                   "reasoning_effort_source": "official_model_docs"}]}]}
    public = public_catalog(raw, {"providers": [{"id": "test", "has_key": True, "oauth_email": "private-only",
                                                 "api_key": "private-only", "base_url": "private-only"}]}, {})
    assert "private-only" not in json.dumps(public)
    assert public["groups"][0]["models"][0]["id"] == "actual-model"
    assert public["groups"][0]["models"][0]["reasoning_efforts"] == ["low", "xhigh"]
    assert public['groups'][0]['models'][0]['reasoning_effort_source'] == 'official_model_docs'


def test_public_catalog_unqualifies_only_the_exact_provider_picker_prefix():
    public = public_catalog({"groups": [{"provider_id": "custom:gemini-fixture", "models": [
        {"id": "@custom:gemini-fixture:root-gemini-fixture"},
        {"id": "qwen3:8b"},
    ]}]}, {}, {})
    assert [row["id"] for row in public["groups"][0]["models"]] == [
        "root-gemini-fixture", "qwen3:8b"]


def test_public_catalog_uses_exact_provider_context_and_leaves_unknown_unbounded(monkeypatch):
    from cli.codex_models import _MODEL_CONTEXT_WINDOWS

    _MODEL_CONTEXT_WINDOWS.clear()
    _MODEL_CONTEXT_WINDOWS["gpt-6-luna"] = 272000
    monkeypatch.setattr("runtime.models_dev.lookup_models_dev_context",
                        lambda provider, model: {("ollama-cloud", "deepseek-v4-flash"): 1048576,
                                                ("xiaomi", "mimo-v2.6-flash"): 1048576}.get((provider, model)))
    public = public_catalog({"groups": [
        {"provider_id": "ollama-cloud", "models": [{"id": "deepseek-v4-flash"}]},
        {"provider_id": "xiaomi", "models": [{"id": "mimo-v2.6-flash"}]},
        {"provider_id": "openai-codex", "models": [{"id": "gpt-6-luna"}, {"id": "unknown-codex"}]},
        {"provider_id": "new-provider", "models": [{"id": "new-model"}]},
    ]}, {}, {})
    models = {group["provider_id"]: {row["id"]: row for row in group["models"]}
              for group in public["groups"] if group.get("provider_id")}
    assert models["ollama-cloud"]["deepseek-v4-flash"]["contextLength"] == 1048576
    assert models["xiaomi"]["mimo-v2.6-flash"]["contextLength"] == 1048576
    assert models["openai-codex"]["gpt-6-luna"]["contextLength"] == 272000
    assert "contextLength" not in models["openai-codex"]["unknown-codex"]
    assert "contextLength" not in models["new-provider"]["new-model"]


def test_model_catalog_account_evidence_is_independent_of_capability_inventory():
    from types import SimpleNamespace

    calls = []
    scope = Scope(backend_profile_id="00000000-0000-0000-0000-000000000001",
                  space_id="00000000-0000-0000-0000-000000000002", browser_profile_id="browser-a")
    context = SimpleNamespace(scope=scope)
    raw = {"groups": [{"provider_id": "xiaomi", "models": [{"id": "mimo-v2.6-flash"}]}]}
    accounts = {"providers": [{"id": "xiaomi", "has_key": True}]}
    def providers():
        calls.append("accounts")
        return accounts
    def capabilities(_context, _configuration):
        calls.append("capabilities")
        return {"items": []}

    basic = _discover_model_catalog(context, False, available_models=lambda: raw,
                                    configuration=lambda: {}, providers=providers,
                                    capability_inventory=capabilities, provider_model_ids=lambda _provider: [])
    expanded = _discover_model_catalog(context, True, available_models=lambda: raw,
                                       configuration=lambda: {}, providers=providers,
                                       capability_inventory=capabilities, provider_model_ids=lambda _provider: [])
    assert basic["providers"] == expanded["providers"] == [{
        "id": "xiaomi", "display_name": "xiaomi", "has_key": True,
        "oauth_connected": False, "auth_state": "not_connected",
        "provider_available": True, "models": [],
    }]
    assert "capabilityInventory" not in basic
    assert expanded["capabilityInventory"] == {"items": []}
    assert basic["providerModelCatalog"]["scope"] == scope.model_dump(mode="json", by_alias=True)
    assert basic["providerModelCatalog"]["freshness"] == "unknown"
    assert basic["providerModelCatalog"]["providers"][0]["source"] == "unknown"
    assert calls == ["accounts", "accounts", "capabilities"]


def test_model_catalog_resolves_codex_models_before_the_shared_cache_builder(monkeypatch):
    from types import SimpleNamespace
    from cli.codex_models import _MODEL_CONTEXT_WINDOWS

    _MODEL_CONTEXT_WINDOWS.clear()
    _MODEL_CONTEXT_WINDOWS["gpt-6-luna"] = 272000
    order = []
    raw = {"groups": [{"provider_id": "openai-codex", "provider": "OpenAI Codex",
                       "models": [{"id": "stale-local-model"}]}]}
    def account_bound_ids(provider):
        order.append("profile-catalog")
        assert provider == "openai-codex"
        return ["gpt-6-luna"]
    def cached_models():
        order.append("shared-cache")
        return raw

    scope = Scope(backend_profile_id="00000000-0000-0000-0000-000000000001",
                  space_id="00000000-0000-0000-0000-000000000002", browser_profile_id="browser-a")
    result = _discover_model_catalog(SimpleNamespace(scope=scope), False, available_models=cached_models,
                                     configuration=lambda: {}, providers=lambda: {"providers": []},
                                     provider_model_ids=account_bound_ids)
    codex = next(group for group in result["groups"] if group["provider_id"] == "openai-codex")
    assert order == ["profile-catalog", "shared-cache"]
    assert [row["id"] for row in codex["models"]] == ["gpt-6-luna"]
    assert codex["models"][0]["contextLength"] == 272000
    assert raw["groups"][0]["models"] == [{"id": "stale-local-model"}]


def test_provider_model_catalog_marks_only_api_listed_ids_current():
    from runtime.independent.scoped_models import _provider_model_catalog

    scope = Scope(backend_profile_id="00000000-0000-0000-0000-000000000001",
                  space_id="00000000-0000-0000-0000-000000000002", browser_profile_id="browser-a")
    catalog = {"providerModelCatalog": {"checkedAt": "2026-10-12T00:00:00Z", "freshness": "unknown",
        "providers": [{"providerId": "api-provider", "source": "provider_api", "status": "listed",
                       "modelIds": ["model-live"]},
                      {"providerId": "fallback-provider", "source": "curated_fallback", "status": "stale",
                       "modelIds": ["model-old"]}]}}
    groups = [
        {"provider_id": "api-provider", "provider": "API", "configured": True, "models": [
            {"id": "model-live", "label": "Live", "nativeAvailability": {"available": True, "reasonCode": None}}]},
        {"provider_id": "fallback-provider", "provider": "Fallback", "configured": True, "models": [
            {"id": "model-old", "label": "Old", "nativeAvailability": {"available": True, "reasonCode": None}}]},
    ]
    result = _provider_model_catalog(scope, catalog, groups)
    live = result["providers"][0]["models"][0]
    stale = result["providers"][1]["models"][0]
    assert live["listed"] == {"status": "current", "source": "provider_api", "freshness": "unknown"}
    assert live["qualification"]["independent"] == {"status": "available", "available": True, "reasonCode": None}
    assert stale["listed"]["status"] == "stale"
    assert stale["qualification"]["independent"]["status"] == "unknown"
    assert live["features"]["tools"] == {"status": "unknown", "value": None, "source": "unknown"}
    assert live["liveTest"] == {"status": "not_run"}


def test_ai_gateway_cached_api_catalog_keeps_its_source_and_observation(monkeypatch):
    from datetime import datetime, timezone
    from cli import models

    checked_at = datetime(2026, 10, 12, tzinfo=timezone.utc).isoformat()
    monkeypatch.setattr(models, "_ai_gateway_catalog_cache", [("controlled-model", "recommended")])
    monkeypatch.setattr(models, "_ai_gateway_catalog_source", "provider_api")
    monkeypatch.setattr(models, "_ai_gateway_catalog_checked_at", checked_at)
    source = {}
    assert models.provider_model_ids("ai-gateway", source_out=source) == ["controlled-model"]
    assert source == {"source": "provider_api", "checkedAt": checked_at}


def test_explicit_provider_model_allowlist_is_selectable_but_not_claimed_as_api_listed():
    from runtime.independent.scoped_models import _provider_model_catalog, public_catalog

    scope = Scope(backend_profile_id="00000000-0000-0000-0000-000000000001",
                  space_id="00000000-0000-0000-0000-000000000002", browser_profile_id="browser-a")
    normalized = public_catalog({"groups": [{"provider_id": "custom-provider", "provider": "Custom", "models": [
        {"id": "configured-model", "label": "Configured"}]}]}, {"providers": []},
        {"providers": {"custom-provider": {"models": ["configured-model"]}}})
    assert normalized["groups"][0]["models"][0]["modelSource"] == "explicit_config"
    catalog = {"providerModelCatalog": {"providers": [{"providerId": "custom-provider", "source": "curated_fallback",
        "status": "stale", "modelIds": ["curated-model"]}]}}
    groups = [{"provider_id": "custom-provider", "provider": "Custom", "configured": True, "models": [
        {"id": "configured-model", "label": "Configured", "modelSource": "explicit_config",
         "nativeAvailability": {"available": True, "reasonCode": None}}]}]
    model = _provider_model_catalog(scope, catalog, groups)["providers"][0]["models"][0]
    assert model["listed"] == {"status": "configured", "source": "explicit_config", "freshness": "unknown"}
    assert model["qualification"]["independent"]["available"] is True
    assert model["liveTest"]["status"] == "not_run"


def test_capability_catalog_reuses_capture_and_rejects_stale_evidence(monkeypatch):
    import threading
    from pathlib import Path
    from runtime.independent.capabilities import CapabilityService
    from runtime.independent.contracts import new_id
    from runtime.independent.policy import PolicyDenied

    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="default")
    profile_home = Path("profile-fixture")
    manager = SimpleNamespace(store=None, _lock=threading.RLock(),
        resolver=SimpleNamespace(resolve=lambda _scope: SimpleNamespace(profile_home=profile_home)))
    service = CapabilityService(manager)
    catalog = {"groups": [], "providers": [], "capabilityInventory":
        {"plugins": [], "mcp": [], "evidenceDigest": "same-profile-digest"}}
    probe = []
    monkeypatch.setattr("runtime.independent.capabilities.evidence_digest", lambda _home: "same-profile-digest")
    monkeypatch.setattr("runtime.independent.scoped_models.probe_catalog", lambda *args, **kwargs: probe.append(True))

    assert "entries" in service.catalog(scope, refresh=True, discovered_catalog=catalog)
    assert not probe
    monkeypatch.setattr("runtime.independent.capabilities.evidence_digest", lambda _home: "changed-profile-digest")
    with pytest.raises(PolicyDenied, match="capability_configuration_changed"):
        service.catalog(scope, refresh=True, discovered_catalog=catalog)
    assert not probe


def test_set_is_atomic_preserves_other_settings_and_retry_survives_reopen(bound):
    hub, _, resolver, manager, scope = bound
    resolved = resolver.resolve(scope)
    config = resolved.space.load_config(); config["model"]["other_preference"] = {"keep": True}
    resolved.space.save_config(config)
    old_provider, _ = provider_selection(resolved)
    response = select(bound)
    assert response["revision"] == 2 and response["model"] == "model-b"
    assert response["nativeAvailability"]["available"] and response["nativeAvailability"]["selectionRevision"] == 2
    assert provider_selection(resolved)[0].model == "model-b" and old_provider.model == "model-a"
    assert resolved.space.load_config()["model"]["other_preference"] == {"keep": True}
    assert select(bound)["revision"] == 2 and len(manager.calls) == 1
    home, state = hub.base_home, hub.default_state_dir
    hub.close()
    reopened = ProfileHub(home, default_state_dir=state)
    try:
        store2, resolver2 = reopened.by_scope(scope, "default")
        manager2 = CatalogManager(resolver2)
        again = handle_model_selection(store2, resolver2, manager2, scope,
            {"action": "set", "model": "model-b", "provider": "local-a", "expectedRevision": 1, "clientRequestId": "controlled-request"})
        assert again["revision"] == 2 and not manager2.calls
    finally:
        reopened.close()


def test_default_smart_track_space_mode_is_persistable_but_not_an_independent_provider(bound):
    _, store, resolver, manager, scope = bound
    request = {"action": "set", "model": "smart-track", "provider": "", "expectedRevision": 1,
               "clientRequestId": "space-create-smart-track"}

    response = handle_model_selection(store, resolver, manager, scope, request)

    assert response["model"] == "smart-track" and response["provider"] == ""
    assert response["reasonCode"] == "independent_orchestration_not_supported"
    assert response["nativeAvailability"]["reasonCode"] == "independent_unsupported"
    assert not response["nativeAvailability"]["available"]
    config = resolver.resolve(scope).space.load_config()
    assert config["model"]["model"] == "smart-track" and config["model"]["provider"] == ""


@pytest.mark.parametrize("change,code", [({"model": "fabricated"}, "model_not_in_bound_catalog"),
    ({"provider": "foreign"}, "model_not_in_bound_catalog"),
    ({"model": "known-but-disconnected", "provider": "disconnected"}, "provider_not_configured"),
    ({"model": "model-b ", "provider": "local-a"}, "model_not_in_bound_catalog"),
    ({"partitionKey": "foreign"}, "invalid_model_selection_request")])
def test_set_denies_unknown_literal_pair_disconnected_connection_and_authority_fields(bound, change, code):
    before = copy.deepcopy(bound[2].resolve(bound[4]).space.load_config())
    with pytest.raises(PolicyDenied, match=code):
        select(bound, **change)
    assert bound[2].resolve(bound[4]).space.load_config() == before


def test_set_checks_configuration_digest_again_after_discovery(bound):
    def change(context):
        (context.home / ".env").write_text("CONNECTION_REVISION=changed\n", "utf-8")
    bound[3].after_discovery = change
    with pytest.raises(PolicyDenied, match="provider_connection_changed"):
        select(bound)
    assert provider_selection(bound[2].resolve(bound[4]))[0].model == "model-a"


def test_cas_and_client_id_binding_prevent_overwrites(bound):
    select(bound)
    with pytest.raises(RevisionConflict):
        select(bound, clientRequestId="next-request")
    with pytest.raises(PolicyDenied, match="request_id_reused"):
        select(bound, model="model-a")


def test_configuration_only_read_has_no_worker_no_config_write_and_does_not_claim_connection_health(bound):
    _, store, resolver, manager, scope = bound
    space = resolver.resolve(scope).space
    before = {str(file): file.read_bytes() for file in space.root.rglob("*") if file.is_file()}
    response = handle_model_selection(store, resolver, manager, scope, {"action": "get", "includeCatalog": False})
    assert response["model"] == "model-a" and response["configurationOnly"] and response["configured"]
    assert not response["supportsIndependent"] and response["reasonCode"] == "catalog_not_checked"
    assert "groups" not in response and not manager.calls
    assert before == {str(file): file.read_bytes() for file in space.root.rglob("*") if file.is_file()}
    with pytest.raises(PolicyDenied, match="invalid_model_selection_request"):
        select(bound, includeCatalog=False)


def test_legacy_edits_have_distinct_cas_revisions(bound):
    select(bound)
    space = bound[2].resolve(bound[4]).space
    config = space.load_config(); config["model"].update(default="model-a", model="model-a")
    space.save_config(config)
    observed = get(bound)["revision"]
    config["model"].update(default="third-model", model="third-model"); space.save_config(config)
    with pytest.raises(RevisionConflict):
        select(bound, expectedRevision=observed, clientRequestId="legacy-race")


def test_virtual_orchestration_preference_is_honest_and_never_uses_home_provider_fallback(bound):
    response = select(bound, model="teamwork", provider="")
    assert response["configured"] and not response["supportsIndependent"]
    assert response["reasonCode"] == "independent_orchestration_not_supported"
    assert get(bound)["provider"] == "" and provider_selection(bound[2].resolve(bound[4]))[0].provider == ""


def test_actual_packaged_catalog_workers_keep_two_bound_profiles_and_release_handles(tmp_path, monkeypatch):
    """Real imports/protocol; controlled localhost metadata, no inference call."""
    import sys
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    from pathlib import Path
    from runtime.independent.manager import RunManager
    from runtime.independent.worker_host import WorkerHost
    shipped = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "runtime" / "python" / "python.exe"
    python = shipped if shipped.is_file() else Path(sys.executable)
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass
        def do_GET(self):
            requests.append(self.path)
            name = "a" if self.path.startswith("/a/") else "b"
            body = json.dumps({"data": [{"id": "actual-model-" + name}, {"id": "second-model-" + name}]}).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        def do_POST(self):
            requests.append("unexpected-inference")
            self.send_response(405); self.end_headers()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    home = tmp_path / "profiles-base"; home.mkdir()
    for name, profile_home in (("a", home), ("b", home / "profiles" / "other")):
        (profile_home / "workspace").mkdir(parents=True)
        endpoint = f"http://127.0.0.1:{server.server_port}/{name}/v1"
        (profile_home / "config.yaml").write_text(yaml.safe_dump({
                "model": {"default": "actual-model-" + name, "provider": "custom:controlled-" + name,
                          "base_url": endpoint, "api_key": "synthetic-catalog-" + name, "context_length": 131072},
            "custom_providers": [{"name": "controlled-" + name, "base_url": endpoint, "api_key": "synthetic-catalog-" + name,
                                      "models": {"actual-model-" + name: {"context_length": 131072},
                                                 "second-model-" + name: {"context_length": 131072}}}],
        }), "utf-8")
    hub = ProfileHub(home)
    captured = []
    try:
        for profile, browser in (("default", "a"), ("other", "b")):
            scope = Scope.model_validate(hub.bind(profile, {"workspacePath": None, "browserProfileId": browser,
                                                            "partitionKey": "persist:space_home_" + browser})["scope"])
            store, resolver = hub.by_scope(scope, profile)
            manager = RunManager(store, resolver, worker_factory=lambda context: WorkerHost(context, python_executable=python))
            captured.append((hub, store, resolver, manager, scope))
        monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "unrelated-ui-profile"))
        monkeypatch.setenv("OPENAI_API_KEY", "synthetic-parent-only")
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(get, captured))
        for name, response, item in zip(("a", "b"), responses, captured):
            assert response["scope"] == item[4].model_dump(mode="json", by_alias=True)
            assert response["model"] == "actual-model-" + name and response["configured"] and response["supportsIndependent"]
            assert "synthetic-" not in json.dumps(response)
            other = "b" if name == "a" else "a"
            assert not any(model["id"].endswith("model-" + other) for group in response["groups"] for model in group["models"])
        assert "unexpected-inference" not in requests
        assert any(path.endswith("/models") for path in requests)
        selected = select(captured[0], model="second-model-a", provider="custom:controlled-a")
        assert selected["model"] == "second-model-a" and selected["revision"] == 2
        assert get(captured[1])["model"] == "actual-model-b"
        with pytest.raises(PolicyDenied, match="model_not_in_bound_catalog"):
            select(captured[0], model="actual-model-b", provider="custom:controlled-a", expectedRevision=2,
                   clientRequestId="foreign-profile-model")
        # The same public get uses one slot alongside Assistant turns; no new
        # queue or parent config/environment mutation exists for discovery.
        acquired = 0
        try:
            for _ in range(2):
                assert RunManager._interactive_slots.acquire(False)
                acquired += 1
            assert not RunManager._interactive_slots.acquire(False)
        finally:
            for _ in range(acquired):
                RunManager._interactive_slots.release()
    finally:
        hub.close(); server.shutdown(); server.server_close(); thread.join(timeout=2)
