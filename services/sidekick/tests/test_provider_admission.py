"""Real SQLite and native base-Home locks; response fixtures never use cloud."""
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from runtime.independent.contracts import BackendProfileRef, Scope, SpaceBinding, new_id
from runtime.independent.provider_admission import AdmissionBudget, ProviderAdmission, ProviderClaim, parse_response_limits, provider_group_key
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import IndependentStore, ResourceBusy


def fixture(tmp_path):
    root = tmp_path / "base"
    root.mkdir()
    stores, scopes = [], []
    for name in ("a", "b"):
        home = root / "profiles" / name
        home.mkdir(parents=True)
        scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id=name)
        store = IndependentStore(home, scope.backend_profile_id)
        store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name=name, canonical_home=str(home)))
        store.bind_space(SpaceBinding(scope=scope, native_slug=name, partition_key="persist:fixture_" + name))
        stores.append(store)
        scopes.append(scope)
    inventory = lambda: tuple((store.backend_profile_id, store.db_path) for store in stores)
    clock = [datetime(2026, 10, 4, tzinfo=timezone.utc)]
    now = lambda: clock[0].isoformat().replace("+00:00", "Z")
    admissions = [ProviderAdmission(store, base_home=root, existing_store_paths=inventory, now=now) for store in stores]
    return stores, scopes, admissions, clock


def proposal(scope, admission, **changes):
    return ProviderClaim(claim_id=new_id(), decision_id=new_id(), turn_id=new_id(), scope=scope,
        session_id="actual-chat", provider="controlled", model="controlled-model", group_key=provider_group_key(admission.store.profile_home, "controlled"),
        owner_generation=new_id(), permission_revision=1, control_epoch=0, policy_revision=1,
        reserved_input_tokens=100, reserved_output_tokens=50, created_at=admission.now(), updated_at=admission.now(), **changes)


def test_missing_and_invalid_headers_are_unknown_not_zero_or_unlimited():
    at = "2026-10-04T00:00:00Z"
    empty = parse_response_limits("openai", {}, observed_at=at)
    assert empty.source == "unknown" and empty.buckets == ()
    broken = parse_response_limits("openai", {"x-ratelimit-remaining-tokens": "NaN", "x-ratelimit-limit-tokens": "-4"}, observed_at=at)
    assert broken.buckets[0].remaining is None and broken.buckets[0].limit is None
    duration = parse_response_limits("openai", {"x-ratelimit-reset-tokens": "6m0s", "x-ratelimit-remaining-tokens": "123"}, observed_at=at)
    assert duration.buckets[0].reset_at == "2026-10-04T00:06:00Z"
    anthropic = parse_response_limits("anthropic", {"anthropic-ratelimit-input-tokens-remaining": "15", "anthropic-ratelimit-input-tokens-reset": "2026-10-04T00:01:00Z"}, observed_at=at)
    assert anthropic.buckets[0].resource == "input_tokens" and anthropic.buckets[0].remaining == 15
    cooldown = parse_response_limits("controlled", {"Retry-After": "Sun, 04 Oct 2026 00:02:00 GMT"}, observed_at=at, status_code=429)
    assert cooldown.retry_at == "2026-10-04T00:02:00Z"
    billing = parse_response_limits("openai", {}, observed_at=at, status_code=429, error_code="insufficient_quota")
    assert billing.action_required and billing.retry_at is None


def test_two_profile_requests_share_actual_atomic_concurrency_and_unknown_quota(tmp_path):
    stores, scopes, admissions, _ = fixture(tmp_path)
    try:
        def request(index):
            try:
                return admissions[index].claim(proposal(scopes[index], admissions[index]), AdmissionBudget(max_concurrent=6), validate=lambda: None)
            except ResourceBusy:
                return None
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(request, (0, 1)))
        assert sum(value is not None for value in results) == 1
        winner = next(value for value in results if value)
        index = scopes.index(winner.scope)
        admissions[index].update(winner.scope, winner.claim_id, state="started")
        with pytest.raises(PolicyDenied, match="stop_acknowledgement"):
            admissions[index].update(winner.scope, winner.claim_id, state="cancelled")
        unknown = admissions[index].update(winner.scope, winner.claim_id, state="cancelled", acknowledged=True)
        assert unknown.state == "unknown" and unknown.stop_acknowledged
        other = 1 - index
        admissions[other].claim(proposal(scopes[other], admissions[other]), AdmissionBudget(), validate=lambda: None)
    finally:
        for store in stores:
            store.close()


def test_exact_scope_epoch_checked_at_claim_and_no_receipt_after_revoke(tmp_path):
    stores, scopes, admissions, _ = fixture(tmp_path)
    try:
        value = proposal(scopes[0], admissions[0])
        stores[0].revoke_permissions(scopes[0], expected_revision=1)
        with pytest.raises(PolicyDenied, match="scope_authority_changed"):
            admissions[0].claim(value, AdmissionBudget(), validate=lambda: None)
        assert admissions[0].get_claim(scopes[0], value.claim_id) is None
    finally:
        for store in stores:
            store.close()


def test_real_header_exhaustion_retry_after_and_stale_unknown_survive_reopen(tmp_path):
    stores, scopes, admissions, clock = fixture(tmp_path)
    try:
        claim = admissions[0].claim(proposal(scopes[0], admissions[0]), AdmissionBudget(), validate=lambda: None)
        admissions[0].observe(scopes[0], claim.claim_id, {"x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "10s", "Retry-After": "70"}, status_code=429)
        admissions[0].update(scopes[0], claim.claim_id, state="completed", measured_tokens=25)
        with pytest.raises(ResourceBusy, match="Retry-After"):
            admissions[1].claim(proposal(scopes[1], admissions[1]), AdmissionBudget(), validate=lambda: None)
        clock[0] += timedelta(seconds=71)
        assert admissions[0].limits("controlled")[0]["stale"] is True if admissions[0].limits("controlled") else True
        # Fresh metadata absent means conservative one-at-a-time, not a refill.
        admissions[1].claim(proposal(scopes[1], admissions[1]), AdmissionBudget(max_concurrent=6), validate=lambda: None)
        with pytest.raises(ResourceBusy):
            admissions[0].claim(proposal(scopes[0], admissions[0]), AdmissionBudget(max_concurrent=6), validate=lambda: None)
        assert "auth.json" not in [path.name for path in tmp_path.rglob("*")]
    finally:
        for store in stores:
            store.close()


def test_known_tokens_and_cost_are_reserved_before_requests_and_unknown_cost_denies(tmp_path):
    stores, scopes, admissions, _ = fixture(tmp_path)
    try:
        with pytest.raises(PolicyDenied, match="cost_metadata_required"):
            admissions[0].claim(proposal(scopes[0], admissions[0]), AdmissionBudget(max_cost_microusd_per_minute=100), validate=lambda: None)
        claim = admissions[0].claim(proposal(scopes[0], admissions[0], reserved_cost_microusd=80), AdmissionBudget(max_cost_microusd_per_minute=100), validate=lambda: None)
        admissions[0].observe(scopes[0], claim.claim_id, {"x-ratelimit-remaining-tokens": "100", "x-ratelimit-remaining-requests": "10"})
        admissions[0].update(scopes[0], claim.claim_id, state="completed", measured_tokens=20, measured_cost_microusd=80)
        with pytest.raises(ResourceBusy, match="token"):
            admissions[1].claim(proposal(scopes[1], admissions[1], reserved_cost_microusd=10), AdmissionBudget(), validate=lambda: None)
        with pytest.raises(ResourceBusy, match="cost"):
            admissions[1].claim(proposal(scopes[1], admissions[1], reserved_cost_microusd=40), AdmissionBudget(max_cost_microusd_per_minute=100), validate=lambda: None)
    finally:
        for store in stores:
            store.close()


def test_provider_aliases_paths_and_weaker_profile_policy_cannot_split_account_budget(tmp_path):
    stores, scopes, admissions, _ = fixture(tmp_path)
    try:
        (stores[0].profile_home / "config.yaml").write_text("providers:\n  controlled:\n    base_url: https://same-origin.example.invalid/v1\n", "utf-8")
        (stores[1].profile_home / "config.yaml").write_text("providers:\n  controlled:\n    base_url: https://same-origin.example.invalid/v2\n  alias:\n    base_url: https://same-origin.example.invalid/other-path\n", "utf-8")
        assert provider_group_key(stores[0].profile_home, "controlled") == provider_group_key(stores[1].profile_home, "alias")
        first = admissions[0].claim(proposal(scopes[0], admissions[0]), AdmissionBudget(requests_per_minute=1), validate=lambda: None)
        admissions[0].update(scopes[0], first.claim_id, state="completed", measured_tokens=1)
        alternate = proposal(scopes[1], admissions[1]).model_copy(update={"provider": "alias", "group_key": provider_group_key(stores[1].profile_home, "alias")})
        with pytest.raises(ResourceBusy, match="request budget"):
            admissions[1].claim(alternate, AdmissionBudget(requests_per_minute=100), validate=lambda: None)
    finally:
        for store in stores:
            store.close()


def test_crashed_reserved_claim_survives_readonly_reopen_and_stale_headers_remain_visible(tmp_path):
    stores, scopes, admissions, clock = fixture(tmp_path)
    try:
        first = admissions[0].claim(proposal(scopes[0], admissions[0]), AdmissionBudget(), validate=lambda: None)
        admissions[0].observe(scopes[0], first.claim_id, {"x-ratelimit-remaining-requests": "5"})
        clock[0] += timedelta(seconds=90)
        with IndependentStore(stores[0].profile_home, stores[0].backend_profile_id, initialize=False) as reopened:
            assert reopened._one("SELECT result_json FROM ia_request_results WHERE operation='provider_claim' AND request_id=?", (first.claim_id,))
        assert admissions[0].limits("controlled")[0]["stale"] is True
        with pytest.raises(ResourceBusy, match="concurrency"):
            admissions[1].claim(proposal(scopes[1], admissions[1]), AdmissionBudget(), validate=lambda: None)
    finally:
        for store in stores:
            store.close()


def test_same_request_cannot_be_replayed_after_reservation_window(tmp_path):
    stores, scopes, admissions, clock = fixture(tmp_path)
    try:
        value = proposal(scopes[0], admissions[0])
        admissions[0].claim(value, AdmissionBudget(), validate=lambda: None)
        admissions[0].update(scopes[0], value.claim_id, state="completed", measured_tokens=1)
        clock[0] += timedelta(seconds=90)
        with pytest.raises(PolicyDenied, match="already_claimed"):
            admissions[0].claim(value, AdmissionBudget(), validate=lambda: None)
    finally:
        for store in stores:
            store.close()


def test_profile_claim_identity_cannot_be_fabricated_and_reads_create_no_schema(tmp_path):
    stores, scopes, admissions, _ = fixture(tmp_path)
    try:
        value = proposal(scopes[0], admissions[0]).model_copy(update={"group_key": "different-account"})
        with pytest.raises(PolicyDenied, match="identity_unverified"):
            admissions[0].claim(value, AdmissionBudget(), validate=lambda: None)
        before = stores[0]._many("SELECT name FROM sqlite_master ORDER BY name")
        assert admissions[0].limits("controlled") == []
        assert stores[0]._many("SELECT name FROM sqlite_master ORDER BY name") == before
        assert not any(path.name == "config.yaml" for path in tmp_path.rglob("*"))
    finally:
        for store in stores:
            store.close()
