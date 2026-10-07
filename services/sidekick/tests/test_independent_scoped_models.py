"""Live-catalog validation, Scope isolation, atomic CAS and retry identity."""
import copy
import json
from types import SimpleNamespace

import pytest
import yaml

from runtime.independent.contracts import Scope
from runtime.independent.policy import PolicyDenied
from runtime.independent.runner import provider_configuration_digest
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
