import sqlite3

import pytest

from runtime.independent.connections import ConnectionRepository
from runtime.independent.contracts import BackendProfileRef, Scope, SpaceBinding, new_id
from runtime.independent.migrations import MIGRATION_1, MIGRATION_DIGEST, migrate, current_version, SCHEMA_VERSION
from runtime.independent.store import IndependentStore, IdempotencyConflict, RevisionConflict


@pytest.fixture
def setup(tmp_path):
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="browser")
    store = IndependentStore(tmp_path, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name="default", canonical_home=str(tmp_path)))
    store.bind_space(SpaceBinding(scope=scope, native_slug="space", partition_key="persist:connection-test"))
    catalog = {"scope": scope.model_dump(by_alias=True), "entries": [{"capabilityId": "provider.conversation", "connectionKind": "provider", "supportedTasks": ["conversation"], "connections": [{"connectionId": "controlled-provider", "revision": 2, "status": "configured"}]}]}
    payload = {"capabilityId": "provider.conversation", "connectionId": "controlled-provider", "permittedUse": ["conversation"], "expectedRevision": 0, "clientRequestId": new_id()}
    yield store, scope, ConnectionRepository(store), catalog, payload
    store.close()


def test_bind_is_explicit_idempotent_and_does_not_grant_permissions(setup):
    store, scope, repo, catalog, payload = setup
    permissions = store.get_permission_state(scope)
    first = repo.bind(scope, payload, catalog)
    assert repo.bind(scope, payload, catalog) == first
    assert first.scope == scope and first.connection_revision == 2 and first.status == "active"
    assert store.get_permission_state(scope) == permissions
    with pytest.raises(IdempotencyConflict):
        repo.bind(scope, {**payload, "permittedUse": []}, catalog)


def test_foreign_catalog_unsupported_use_and_credential_payload_are_denied(setup):
    _, scope, repo, catalog, payload = setup
    foreign = scope.model_copy(update={"space_id": new_id()})
    with pytest.raises(PermissionError):
        repo.bind(scope, payload, {**catalog, "scope": foreign.model_dump(by_alias=True)})
    with pytest.raises(PermissionError):
        repo.bind(scope, {**payload, "permittedUse": ["send"]}, catalog)
    with pytest.raises(ValueError):
        repo.bind(scope, {**payload, "credential": "must-not-persist"}, catalog)
    assert repo.list(scope) == ()


def test_revocation_waits_for_ack_then_replays_completed_result(setup):
    store, scope, repo, catalog, payload = setup
    bound = repo.bind(scope, payload, catalog)
    revoke = {"bindingId": bound.binding_id, "expectedRevision": bound.revision, "clientRequestId": new_id()}
    permission_before = store.get_permission_state(scope)
    pending = repo.begin_revoke(scope, revoke)
    permission_after = store.get_permission_state(scope)
    assert permission_after["revision"] == permission_before["revision"] + 1
    assert permission_after["permissions"] == permission_before["permissions"]
    assert repo.begin_revoke(scope, revoke) == pending
    assert store.get_permission_state(scope) == permission_after
    assert pending.status == "revoking" and repo.list(scope)[0] == pending
    final = repo.complete_revoke(pending, request_id=revoke["clientRequestId"])
    assert final.status == "revoked" and final.revision == pending.revision + 1
    assert repo.begin_revoke(scope, revoke) == final
    with pytest.raises(RevisionConflict):
        repo.begin_revoke(scope, {**revoke, "clientRequestId": new_id()})


def test_migration_two_preserves_v1_identity_and_user_database(tmp_path):
    database = sqlite3.connect(tmp_path / "controlled.db", isolation_level=None)
    try:
        database.execute("CREATE TABLE user_data(value TEXT)")
        database.execute("INSERT INTO user_data VALUES('preserve')")
        for statement in MIGRATION_1:
            database.execute(statement)
        database.execute("INSERT INTO ia_schema_migrations VALUES(1,'controlled',?)", (MIGRATION_DIGEST,))
        assert migrate(database) == SCHEMA_VERSION and current_version(database) == SCHEMA_VERSION
        assert database.execute("SELECT migration_digest FROM ia_schema_migrations WHERE version=1").fetchone()[0] == MIGRATION_DIGEST
        assert database.execute("SELECT value FROM user_data").fetchone()[0] == "preserve"
        assert database.execute("SELECT COUNT(*) FROM ia_connection_bindings").fetchone()[0] == 0
    finally:
        database.close()
