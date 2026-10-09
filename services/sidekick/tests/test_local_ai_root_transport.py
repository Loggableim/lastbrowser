import pytest

from test_independent_api import broker


def test_local_ai_setup_rejects_unknown_leaf_fields_before_io():
    from web.api.local_ai_setup import GetRequest
    with pytest.raises(Exception):
        GetRequest.model_validate({"operation": "get", "unknown": True})


def test_root_local_ai_get_is_scoped_and_unknown_envelope_is_rejected(broker):
    api, _, post, scopes, store, *_ = broker
    from runtime.independent.contracts import new_id
    before = store._one("SELECT COUNT(*) FROM ia_request_results")[0]
    result = post("localAi.setup", payload={"request": {"operation": "get"}})
    assert result.status_code == 400
    assert result.json()["error"]["code"] == "invalid_request"
    assert store._one("SELECT COUNT(*) FROM ia_request_results")[0] == before
    assert post("localAi.setup", payload={"request": {"operation": "get"}, "cacheRoot": "C:/forbidden"}).status_code == 400
    foreign = scopes[0].model_copy(update={"backend_profile_id": new_id()})
    assert post("localAi.setup", scope=foreign, payload={"request": {"operation": "get"}}).status_code == 403


def test_root_local_ai_missing_bridge_fails_before_leaf(broker):
    _, _, post, scopes, store, *_ = broker
    before = store._one("SELECT COUNT(*) FROM ia_request_results")[0]
    assert post("localAi.setup", payload={"request": {"operation": "get"}}, authorized=False).status_code == 403
    assert store._one("SELECT COUNT(*) FROM ia_request_results")[0] == before


def test_root_local_ai_start_rejects_noncanonical_cache_before_consent(broker, tmp_path):
    _, _, post, scopes, store, *_ = broker
    before = store._one("SELECT COUNT(*) FROM ia_request_results")[0]
    request = {"operation": "start", "planDigest": "a" * 64, "clientRequestId": "11111111-1111-4111-8111-111111111111"}
    result = post("localAi.setup", payload={"request": request, "cacheRoot": str(tmp_path / "missing-cache")})
    assert result.status_code == 400
    assert store._one("SELECT COUNT(*) FROM ia_request_results")[0] == before
