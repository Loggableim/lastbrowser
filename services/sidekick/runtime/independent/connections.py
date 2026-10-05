"""Explicit Space connection bindings; preferences cannot create these records.

Installation, authentication, capability and action permission remain separate.
The catalog is supplied by the profile-bound adapter, not by renderer/model text.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from .contracts import Contract, Id, Ref, Scope, Utc, canonical_json, new_id, utc_now
from .scope import ScopeError
from .store import RevisionConflict


class SpaceConnectionBinding(Contract):
    schema_version: Literal[1] = 1
    binding_id: Id
    scope: Scope
    capability_id: Ref
    connection_id: Ref
    # The authoritative catalog supplies this, never a renderer namespace guess.
    # Old records without kind need an explicit rebind before execution.
    connection_kind: Literal["provider", "connector", "browser_account"] | None = None
    connection_revision: Annotated[int, Field(ge=1)]
    revision: Annotated[int, Field(ge=1)] = 1
    status: Literal["active", "revoking", "revoked"] = "active"
    permitted_use: tuple[Ref, ...] = ()
    updated_at: Utc


class ConnectionRepository:
    def __init__(self, store):
        self.store = store

    def list(self, scope: Scope):
        return tuple(SpaceConnectionBinding.model_validate_json(row[0]) for row in self.store._many(
            "SELECT data_json FROM ia_connection_bindings WHERE scope_key=? ORDER BY binding_id", (self.store._scope(scope),)))

    def bind(self, scope: Scope, payload: dict, catalog: dict):
        if set(payload) - {"action", "capabilityId", "connectionId", "permittedUse", "expectedRevision", "clientRequestId"}:
            raise ValueError("Connection binding accepts no credentials or runtime authority")
        request_id = payload["clientRequestId"]
        IdValidator(request_id)
        if Scope.model_validate(catalog["scope"]) != scope:
            raise ScopeError("Capability catalog belongs to another Space")
        entries = [entry for entry in catalog["entries"] if entry["capabilityId"] == payload["capabilityId"]]
        if len(entries) != 1:
            raise ScopeError("Capability is not available in this Space profile")
        entry = entries[0]
        kind = entry.get("connectionKind")
        if kind not in {"provider", "connector", "browser_account"}:
            raise ScopeError("Capability has no verified connection kind")
        connections = entry.get("connections") or []
        candidates = [item for item in connections if item["connectionId"] == payload["connectionId"]]
        if len(candidates) != 1 or candidates[0]["status"] not in {"configured", "connected"}:
            raise ScopeError("Connection is not configured in this profile")
        connection = candidates[0]
        uses = payload.get("permittedUse") or []
        if not isinstance(uses, list) or set(uses) - set(entry.get("supportedTasks") or []):
            raise ScopeError("Requested use is not a supported capability")
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "connection_bind", request_id, payload)
            if cached is not None:
                return SpaceConnectionBinding.model_validate(cached)
            existing = self.store._one("SELECT data_json FROM ia_connection_bindings WHERE scope_key=? AND capability_id=? AND connection_id=?",
                                       (scope.key, payload["capabilityId"], payload["connectionId"]))
            current = SpaceConnectionBinding.model_validate_json(existing[0]) if existing else None
            if payload.get("expectedRevision") != (current.revision if current else 0):
                raise RevisionConflict("Connection binding changed")
            value = SpaceConnectionBinding(binding_id=current.binding_id if current else new_id(), scope=scope,
                                           capability_id=payload["capabilityId"], connection_id=payload["connectionId"],
                                           connection_kind=kind,
                                           connection_revision=connection["revision"], revision=current.revision + 1 if current else 1,
                                           permitted_use=tuple(uses), updated_at=utc_now())
            self._write(value)
            self.store._emit(scope, "connection_changed", {"bindingId": value.binding_id, "revision": value.revision, "status": value.status})
            self.store._remember(scope, "connection_bind", request_id, payload, value)
            return value

    def begin_revoke(self, scope: Scope, payload: dict):
        if set(payload) - {"action", "bindingId", "expectedRevision", "clientRequestId"}:
            raise ValueError("Invalid connection revocation request")
        request_id = payload["clientRequestId"]
        IdValidator(request_id)
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "connection_revoke", request_id, payload)
            if cached is not None:
                return SpaceConnectionBinding.model_validate(cached)
            row = self.store._one("SELECT data_json FROM ia_connection_bindings WHERE binding_id=? AND scope_key=?",
                                  (payload["bindingId"], self.store._scope(scope)))
            if row is None:
                raise ScopeError("Connection binding does not belong to this Space")
            current = SpaceConnectionBinding.model_validate_json(row[0])
            if current.revision != payload["expectedRevision"]:
                raise RevisionConflict("Connection binding changed")
            value = current.model_copy(update={"revision": current.revision + 1, "status": "revoking", "updated_at": utc_now()})
            self._write(value)
            # Revoke dispatch/approval epochs atomically with the binding state;
            # acknowledgement by Main happens after this short transaction.
            permissions = self.store.get_permission_state(scope)
            self.store.set_permission_state(scope, permissions["permissions"], expected_revision=permissions["revision"])
            self.store._emit(scope, "connection_changed", {"bindingId": value.binding_id, "revision": value.revision, "status": value.status})
            self.store._remember(scope, "connection_revoke", request_id, payload, value)
            return value

    def complete_revoke(self, binding: SpaceConnectionBinding, *, request_id: str):
        with self.store.transaction():
            row = self.store._one("SELECT data_json FROM ia_connection_bindings WHERE binding_id=? AND scope_key=?", (binding.binding_id, self.store._scope(binding.scope)))
            current = SpaceConnectionBinding.model_validate_json(row[0]) if row else None
            if current != binding or current.status != "revoking":
                raise RevisionConflict("Connection revocation changed")
            value = current.model_copy(update={"revision": current.revision + 1, "status": "revoked", "updated_at": utc_now()})
            self._write(value)
            self.store._conn.execute("UPDATE ia_request_results SET result_json=? WHERE scope_key=? AND operation='connection_revoke' AND request_id=?", (canonical_json(value), value.scope.key, request_id))
            self.store._emit(value.scope, "connection_changed", {"bindingId": value.binding_id, "revision": value.revision, "status": value.status})
            return value

    def _write(self, value):
        self.store._conn.execute("INSERT INTO ia_connection_bindings VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(binding_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,data_json=excluded.data_json,updated_at=excluded.updated_at",
                                 (value.binding_id, self.store._scope(value.scope), value.capability_id, value.connection_id, value.revision, value.status, canonical_json(value), value.updated_at))


def IdValidator(value):
    # Use the existing strict ID contract rather than a permissive string cast.
    class RequestId(Contract):
        request_id: Id
    return RequestId(request_id=value).request_id
