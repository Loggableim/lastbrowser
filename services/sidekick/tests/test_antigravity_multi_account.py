"""Antigravity multi-account OAuth — round-robin rotation and pool management.

Covers the successor to the retired consumer Gemini CLI sign-in: multiple
Google accounts connect into the ``antigravity`` credential-pool slice and chat
requests rotate across them.
"""

import json
import time
from pathlib import Path

import pytest

from runtime import antigravity_oauth as ag


@pytest.fixture()
def pool_env(tmp_path, monkeypatch):
    """Point the credential pool at a temp auth store so tests stay isolated."""
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    monkeypatch.setattr(ag, "_account_round_robin_index", 0)
    yield tmp_path
    # Pool state is per-test via tmp_path; nothing to clean globally.


def _add_account(email: str, project: str = "aicode-consumers") -> None:
    ag.save_account_credentials_to_pool(ag.AntigravityCredentials(
        access_token=f"at-{email}",
        refresh_token=f"rt-{email}",
        expires_ms=int((time.time() + 3600) * 1000),
        email=email,
        project_id=project,
    ))


def test_round_robin_cycles_all_accounts_in_pool_order(pool_env):
    _add_account("first@example.com")
    _add_account("second@example.com")
    _add_account("third@example.com")
    picks = [ag.select_next_account_email() for _ in range(6)]
    assert picks == [
        "first@example.com", "second@example.com", "third@example.com",
        "first@example.com", "second@example.com", "third@example.com",
    ]


def test_single_account_round_robin_stays_stable(pool_env):
    _add_account("only@example.com")
    assert [ag.select_next_account_email() for _ in range(3)] == [
        "only@example.com"] * 3


def test_invalid_grant_account_is_skipped_but_not_removed(pool_env):
    _add_account("healthy@example.com")
    _add_account("broken@example.com")
    entries = ag._read_pool_entries()
    for entry in entries:
        if ag._pool_entry_email(entry) == "broken@example.com":
            entry["last_error_reason"] = "invalid_grant"
    ag._write_pool_entries(entries)
    picks = {ag.select_next_account_email() for _ in range(4)}
    assert picks == {"healthy@example.com"}


def test_upsert_same_email_updates_tokens_without_duplicating(pool_env):
    _add_account("user@example.com")
    _add_account("user@example.com", project="updated-project")
    accounts = ag.list_connected_accounts()
    assert len(accounts) == 1
    assert accounts[0]["project_id"] == "updated-project"


def test_remove_account_deletes_only_the_target(pool_env):
    _add_account("keep@example.com")
    _add_account("drop@example.com")
    assert ag.remove_account("drop@example.com") is True
    remaining = {a["email"] for a in ag.list_connected_accounts()}
    assert remaining == {"keep@example.com"}
    assert ag.remove_account("missing@example.com") is False


def test_load_account_credentials_returns_matching_entry(pool_env):
    _add_account("user@example.com", project="proj-1")
    creds = ag.load_account_credentials("USER@example.com")
    assert creds is not None
    assert creds.email == "user@example.com"
    assert creds.project_id == "proj-1"
    assert creds.refresh_token == "rt-user@example.com"


def test_load_account_credentials_reconnect_required_on_invalid_grant(pool_env):
    _add_account("stale@example.com")
    entries = ag._read_pool_entries()
    for entry in entries:
        entry["last_error_reason"] = "invalid_grant"
    ag._write_pool_entries(entries)
    with pytest.raises(ag.AntigravityOAuthError) as excinfo:
        ag.load_account_credentials("stale@example.com")
    assert excinfo.value.code == "antigravity_account_reconnect_required"


def test_status_reports_accounts_without_secrets(pool_env):
    _add_account("one@example.com")
    _add_account("two@example.com")
    status = ag.get_antigravity_auth_status()
    assert status["provider_available"] is True
    assert status["connected_accounts"] == 2
    assert status["round_robin"] is True
    # No token material may leak through the status endpoint.
    blob = json.dumps(status)
    assert "rt-one@example.com" not in blob
    assert "at-one@example.com" not in blob


def test_client_id_composes_from_public_antigravity_constants():
    assert ag.ANTIGRAVITY_CLIENT_ID.startswith("1071006060591-")
    assert ag.ANTIGRAVITY_CLIENT_ID.endswith(".apps.googleusercontent.com")
    assert ag.ANTIGRAVITY_CLIENT_SECRET.startswith("GOCSPX-")


def test_scopes_match_antigravity_ide_contract():
    # The IDE's oauthClient requests these five scopes; aicode is granted
    # implicitly by the consent screen.
    for scope in (
        "cloud-platform", "userinfo.email", "userinfo.profile",
        "cclog", "experimentsandconfigs",
    ):
        assert scope in ag.OAUTH_SCOPES


def test_runtime_resolver_requires_connected_account(pool_env, monkeypatch):
    from cli.runtime_provider import resolve_runtime_provider
    with pytest.raises(Exception) as excinfo:
        resolve_runtime_provider(requested="antigravity")
    assert "antigravity" in str(excinfo.value).lower() or "No Antigravity account" in str(excinfo.value)


def test_runtime_resolver_returns_marker_base_url_with_account(pool_env):
    _add_account("ready@example.com")
    from cli.runtime_provider import resolve_runtime_provider
    resolved = resolve_runtime_provider(requested="antigravity")
    assert resolved["provider"] == "antigravity"
    assert resolved["api_mode"] == "chat_completions"
    assert resolved["base_url"] == "cloudcode-pa://antigravity"


def test_provider_alias_resolution():
    # resolve_requested_provider only lowercases; alias normalization happens
    # in auth.resolve_provider (the _PROVIDER_ALIASES map).
    from cli.runtime_provider import resolve_requested_provider
    from cli import auth as auth_mod
    assert resolve_requested_provider("antigravity") == "antigravity"
    assert auth_mod.resolve_provider("antigravity-cli") == "antigravity"
    assert auth_mod.resolve_provider("agy") == "antigravity"


def test_chat_start_route_rotates_antigravity_accounts(pool_env):
    """The /api/chat/start handler picks the next account when none is pinned."""
    _add_account("alpha@example.com")
    _add_account("beta@example.com")
    # Simulate what the route does for an unpinned request:
    first = ag.select_next_account_email()
    second = ag.select_next_account_email()
    assert first != second
    assert {first, second} == {"alpha@example.com", "beta@example.com"}


def test_client_uses_pool_tokens_and_project(pool_env):
    _add_account("client@example.com", project="aicode-consumers")
    from runtime.antigravity_cloudcode_adapter import AntigravityCloudCodeClient
    client = AntigravityCloudCodeClient(account_email="client@example.com")
    assert client.account_email == "client@example.com"
    assert client._ensure_project_id("dummy-token") == "aicode-consumers"
    client.close()


def test_client_project_falls_back_to_consumer_default(pool_env):
    from runtime.antigravity_cloudcode_adapter import AntigravityCloudCodeClient
    client = AntigravityCloudCodeClient()
    # No account connected → discovery fails → consumer default.
    assert client._ensure_project_id("dummy") == ag.DEFAULT_ANTIGRAVITY_PROJECT
    client.close()