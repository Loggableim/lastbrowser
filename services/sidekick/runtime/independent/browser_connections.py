"""Explicit human account receipts for Main's dedicated execution Session.

A receipt proves an owned login target and a human confirmation, not successful
authentication at an arbitrary website. Setup origins never grant agent work
permissions. This service has no cookie, credential, provider or worker access.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit
from typing import Literal

from pydantic import Field, field_validator

from .connections import ConnectionRepository
from .contracts import Contract, Id, Ref, Scope, Utc, canonical_json, new_id, utc_now
from .policy import PolicyDenied
from .scope import ScopeError
from .store import ResourceBusy, RevisionConflict

CAPABILITY_ID = "browser.account"
CONNECTION_PREFIX = "browser_account:"
SETUP_SECONDS = 600


def browser_origin(value: str) -> str:
    if not isinstance(value, str) or len(value) > 2048 or any(ord(char) < 32 for char in value):
        raise ValueError("Invalid browser account origin")
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ValueError("Browser account setup requires an exact HTTP(S) origin")
    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    port = parsed.port
    suffix = f":{port}" if port and port != {"http": 80, "https": 443}[parsed.scheme] else ""
    return f"{parsed.scheme}://{host}{suffix}"


class MainLoginProof(Contract):
    lease_id: Id
    target_id: Ref
    partition_key: Ref
    main_generation: Ref
    runner_generation: Ref
    navigation_epoch: int = Field(ge=1)
    permission_epoch: int = Field(ge=0)
    url_origin: str
    observed_at: Utc

    _origin = field_validator("url_origin")(browser_origin)


class BrowserAccountFlow(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    flow_id: Id
    lease_id: Id
    connection_id: Ref
    origin: str
    revision: int = Field(ge=1)
    setup_status: Literal["starting", "awaiting_user", "user_confirmed", "cancelled", "expired", "interrupted", "revoking", "revoked"]
    permission_revision: int = Field(ge=0)
    permission_epoch: int = Field(ge=0)
    main_generation: Ref
    runner_generation: Ref
    created_at: Utc
    updated_at: Utc
    expires_at: Utc
    account_label: str | None = Field(default=None, max_length=80)
    main_proof: MainLoginProof | None = None
    reason_code: str | None = None

    _origin = field_validator("origin")(browser_origin)


def _public(flow):
    value = flow.model_dump(mode="json", by_alias=True, exclude={"main_proof", "main_generation", "runner_generation", "lease_id"}, exclude_none=True)
    value.update(partitionKind="dedicated_agent", accountSource="explicit_agent_login",
                 authenticationStatus="user_confirmed" if flow.setup_status == "user_confirmed" else "unknown",
                 healthStatus="unknown", evidenceKind="explicit_user_confirmation" if flow.setup_status == "user_confirmed" else "owned_login_target")
    return value


class BrowserConnectionService:
    """Private Main API only; HTTP wiring authenticates the bootstrap nonce."""

    def __init__(self, store, resolver):
        self.store, self.resolver = store, resolver

    def _load(self, scope, flow_id):
        self.resolver.resolve(scope)
        row = self.store._one("SELECT data_json FROM ia_connection_setup_flows WHERE flow_id=? AND scope_key=? AND capability_id=?", (flow_id, self.store._scope(scope), CAPABILITY_ID))
        if row is None:
            raise ScopeError("Browser account does not belong to this Space")
        value = BrowserAccountFlow.model_validate_json(row[0])
        if value.scope != scope:
            raise ScopeError("Browser account scope changed")
        return value

    def _write(self, flow):
        self.store._conn.execute("INSERT INTO ia_connection_setup_flows VALUES(?,?,?,?,?,?) ON CONFLICT(flow_id) DO UPDATE SET state=excluded.state,data_json=excluded.data_json,updated_at=excluded.updated_at", (flow.flow_id, self.store._scope(flow.scope), CAPABILITY_ID, flow.setup_status, canonical_json(flow), flow.updated_at))
        self.store._emit(flow.scope, "connection_setup_changed", {"flowId": flow.flow_id, "connectionId": flow.connection_id, "setupStatus": flow.setup_status, "revision": flow.revision})

    def _current(self, flow):
        if flow.setup_status not in {"starting", "awaiting_user"}:
            return flow
        permission = self.store.get_permission_state(flow.scope)
        reason = "setup_expired" if datetime.fromisoformat(flow.expires_at.replace("Z", "+00:00")) <= datetime.now(timezone.utc) else "setup_permission_changed" if permission["revision"] != flow.permission_revision or permission["controlEpoch"] != flow.permission_epoch else None
        if reason:
            flow = flow.model_copy(update={"setup_status": "expired" if reason == "setup_expired" else "interrupted", "reason_code": reason, "revision": flow.revision + 1, "updated_at": utc_now()})
            self._write(flow)
        return flow

    def start(self, scope: Scope, payload: dict):
        class Start(Contract):
            origin: str
            client_request_id: Id
            main_generation: Ref
            runner_generation: Ref
        request = Start.model_validate(payload)
        origin = browser_origin(request.origin)
        self.resolver.resolve(scope)
        human = {"origin": origin, "clientRequestId": request.client_request_id}
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "browser_account_start", request.client_request_id, human)
            if cached is not None:
                return self._current(self._load(scope, cached["flowId"])).model_dump(mode="json", by_alias=True)
            if self.store.list_runs(scope, include_terminal=False):
                raise ResourceBusy("Pause or finish the active Space task before account setup")
            rows = self.store._many("SELECT data_json FROM ia_connection_setup_flows WHERE scope_key=? AND capability_id=? AND state IN ('starting','awaiting_user')", (self.store._scope(scope), CAPABILITY_ID))
            for row in rows:
                previous = self._current(BrowserAccountFlow.model_validate_json(row[0]))
                if previous.setup_status in {"starting", "awaiting_user"}:
                    if previous.main_generation == request.main_generation and previous.runner_generation == request.runner_generation:
                        raise ResourceBusy("This Space already has an account setup target")
                    self._write(previous.model_copy(update={"setup_status": "interrupted", "reason_code": "setup_owner_restarted", "revision": previous.revision + 1, "updated_at": utc_now()}))
            permission = self.store.get_permission_state(scope)
            flow_id, now = new_id(), utc_now()
            flow = BrowserAccountFlow(scope=scope, flow_id=flow_id, lease_id=new_id(), connection_id=CONNECTION_PREFIX + flow_id,
                origin=origin, revision=1, setup_status="starting", permission_revision=permission["revision"], permission_epoch=permission["controlEpoch"],
                main_generation=request.main_generation, runner_generation=request.runner_generation, created_at=now, updated_at=now,
                expires_at=(datetime.now(timezone.utc) + timedelta(seconds=SETUP_SECONDS)).isoformat())
            self._write(flow)
            self.store._remember(scope, "browser_account_start", request.client_request_id, human, {"flowId": flow_id})
            # Private start supplies the lease identity to Main. Public poll never does.
            return flow.model_dump(mode="json", by_alias=True)

    def _proof(self, flow, payload):
        proof = MainLoginProof.model_validate(payload)
        if proof.lease_id != flow.lease_id or proof.main_generation != flow.main_generation or proof.runner_generation != flow.runner_generation or proof.url_origin != flow.origin or proof.permission_epoch != flow.permission_epoch:
            raise PolicyDenied("browser_login_proof_mismatch")
        import hashlib
        expected = "persist:independent_agent_v1_" + hashlib.sha256(canonical_json([flow.scope.backend_profile_id, flow.scope.space_id, flow.scope.browser_profile_id]).encode()).hexdigest()
        if proof.partition_key != expected:
            raise PolicyDenied("browser_login_partition_mismatch")
        observed = datetime.fromisoformat(proof.observed_at.replace("Z", "+00:00"))
        if abs((datetime.now(timezone.utc) - observed).total_seconds()) > 30:
            raise PolicyDenied("browser_login_proof_expired")
        return proof

    def opened(self, scope, payload):
        class Opened(Contract):
            flow_id: Id
            main_proof: MainLoginProof
        request = Opened.model_validate(payload)
        with self.store.transaction():
            flow = self._current(self._load(scope, request.flow_id))
            if flow.setup_status != "starting":
                raise PolicyDenied("browser_setup_not_starting")
            proof = self._proof(flow, request.main_proof.model_dump(by_alias=True))
            flow = flow.model_copy(update={"setup_status": "awaiting_user", "main_proof": proof, "revision": flow.revision + 1, "updated_at": utc_now()})
            self._write(flow)
            return _public(flow)

    def poll(self, scope, payload):
        class Poll(Contract):
            flow_id: Id
        request = Poll.model_validate(payload)
        with self.store.transaction():
            return _public(self._current(self._load(scope, request.flow_id)))

    def confirm(self, scope, payload):
        class Confirm(Contract):
            flow_id: Id
            expected_revision: int = Field(ge=1)
            client_request_id: Id
            account_label: str | None = Field(default=None, max_length=80)
            main_proof: MainLoginProof
        request = Confirm.model_validate(payload)
        human = request.model_dump(mode="json", by_alias=True, exclude={"main_proof"})
        with self.store.transaction():
            flow = self._current(self._load(scope, request.flow_id))
            cached = self.store.get_request_result(scope, "browser_account_confirm", request.client_request_id, human)
            if cached is not None:
                if flow.setup_status != "user_confirmed" or cached["revision"] != flow.revision:
                    raise PolicyDenied("browser_account_no_longer_confirmed")
                return cached
            if flow.revision != request.expected_revision:
                raise RevisionConflict("Browser account setup changed")
            if flow.setup_status != "awaiting_user" or flow.main_proof is None:
                raise PolicyDenied("browser_account_confirmation_not_available")
            proof = self._proof(flow, request.main_proof.model_dump(by_alias=True))
            if proof.target_id != flow.main_proof.target_id or proof.partition_key != flow.main_proof.partition_key:
                raise PolicyDenied("browser_login_target_changed")
            flow = flow.model_copy(update={"setup_status": "user_confirmed", "main_proof": proof, "account_label": request.account_label,
                                          "revision": flow.revision + 1, "updated_at": utc_now()})
            self._write(flow)
            result = _public(flow)
            self.store._remember(scope, "browser_account_confirm", request.client_request_id, human, result)
            return result

    def cancel(self, scope, payload):
        class Cancel(Contract):
            flow_id: Id
            reason_code: str = Field(default="user_cancelled", max_length=80)
        request = Cancel.model_validate(payload)
        with self.store.transaction():
            flow = self._load(scope, request.flow_id)
            if flow.setup_status in {"starting", "awaiting_user"}:
                flow = flow.model_copy(update={"setup_status": "cancelled" if request.reason_code == "user_cancelled" else "interrupted", "reason_code": request.reason_code, "revision": flow.revision + 1, "updated_at": utc_now()})
                self._write(flow)
            return _public(flow)

    def begin_logout(self, scope, payload):
        class Logout(Contract):
            connection_id: Ref
            expected_revision: int = Field(ge=1)
            client_request_id: Id
        request = Logout.model_validate(payload)
        if not request.connection_id.startswith(CONNECTION_PREFIX):
            raise PolicyDenied("browser_account_connection_required")
        human = request.model_dump(mode="json", by_alias=True)
        with self.store.transaction():
            flow = self._load(scope, request.connection_id.removeprefix(CONNECTION_PREFIX))
            cached = self.store.get_request_result(scope, "browser_account_logout", request.client_request_id, human)
            if cached is not None:
                return _public(flow)
            if flow.revision != request.expected_revision:
                raise RevisionConflict("Browser account changed")
            if flow.setup_status != "user_confirmed":
                raise PolicyDenied("browser_account_not_confirmed")
            flow = flow.model_copy(update={"setup_status": "revoking", "revision": flow.revision + 1, "updated_at": utc_now()})
            self._write(flow)
            permission = self.store.get_permission_state(scope)
            self.store.set_permission_state(scope, permission["permissions"], expected_revision=permission["revision"])
            self.store._remember(scope, "browser_account_logout", request.client_request_id, human, _public(flow))
            return _public(flow)

    def complete_logout(self, scope, payload):
        class Complete(Contract):
            connection_id: Ref
            expected_revision: int = Field(ge=1)
            cleanup_acknowledged: bool
        request = Complete.model_validate(payload)
        if not request.connection_id.startswith(CONNECTION_PREFIX):
            raise PolicyDenied("browser_account_connection_required")
        with self.store.transaction():
            flow = self._load(scope, request.connection_id.removeprefix(CONNECTION_PREFIX))
            if flow.revision != request.expected_revision or flow.setup_status != "revoking":
                raise RevisionConflict("Browser account logout changed")
            flow = flow.model_copy(update={"setup_status": "revoked", "revision": flow.revision + 1,
                "reason_code": "user_logged_out" if request.cleanup_acknowledged else "cleanup_unconfirmed", "updated_at": utc_now()})
            self._write(flow)
            return _public(flow)

    def invalidate(self, scope, payload):
        """Main observed session change. Authority closes without asserting logout."""
        class Invalid(Contract):
            connection_id: Ref
            expected_revision: int = Field(ge=1)
            reason_code: Literal["account_session_changed", "confirmation_interrupted"]
        request = Invalid.model_validate(payload)
        if not request.connection_id.startswith(CONNECTION_PREFIX):
            raise PolicyDenied("browser_account_connection_required")
        with self.store.transaction():
            flow = self._load(scope, request.connection_id.removeprefix(CONNECTION_PREFIX))
            if flow.setup_status == "revoked":
                return _public(flow)
            if flow.revision != request.expected_revision or flow.setup_status != "user_confirmed":
                raise RevisionConflict("Browser account receipt changed")
            flow = flow.model_copy(update={"setup_status": "revoked", "reason_code": request.reason_code, "revision": flow.revision + 1, "updated_at": utc_now()})
            self._write(flow)
            permission = self.store.get_permission_state(scope)
            self.store.set_permission_state(scope, permission["permissions"], expected_revision=permission["revision"])
            return _public(flow)

    def catalog_entries(self, scope):
        self.resolver.resolve(scope)
        rows = self.store._many("SELECT data_json FROM ia_connection_setup_flows WHERE scope_key=? AND capability_id=? AND state IN ('user_confirmed','revoking','revoked') ORDER BY updated_at", (self.store._scope(scope), CAPABILITY_ID))
        connections = []
        for row in rows:
            flow = BrowserAccountFlow.model_validate_json(row[0])
            connections.append({"connectionId": flow.connection_id, "revision": flow.revision,
                "status": "configured" if flow.setup_status == "user_confirmed" else "reauth_required", "origin": flow.origin,
                "accountLabel": flow.account_label, "configurationStatus": "configured" if flow.setup_status == "user_confirmed" else "not_configured",
                "authenticationStatus": "user_confirmed" if flow.setup_status == "user_confirmed" else "unknown", "healthStatus": "unknown",
                "evidenceKind": "explicit_user_confirmation", "partitionKind": "dedicated_agent", "accountSource": "explicit_agent_login",
                "installed": True, "adapterAvailable": flow.setup_status == "user_confirmed", "setupActions": []})
        return [{"capabilityId": CAPABILITY_ID, "connectionKind": "browser_account", "displayName": "Agent browser accounts",
                 "supportedTasks": ["browser.account.use"], "connections": connections}]

    def authorize(self, scope, payload):
        class Binding(Contract):
            binding_id: Id
            connection_id: Ref
            connection_revision: int = Field(ge=1)
            revision: int = Field(ge=1)
        class Request(Contract):
            account_bindings: tuple[Binding, ...] = Field(max_length=16)
        request = Request.model_validate(payload)
        self.resolver.resolve(scope)
        rows = {row.binding_id: row for row in ConnectionRepository(self.store).list(scope)}
        authorized = []
        for binding in request.account_bindings:
            row = rows.get(binding.binding_id)
            if row is None or row.status != "active" or row.connection_kind != "browser_account" or row.capability_id != CAPABILITY_ID or "browser.account.use" not in row.permitted_use or row.connection_id != binding.connection_id or row.connection_revision != binding.connection_revision or row.revision != binding.revision:
                raise PolicyDenied("browser_account_binding_changed")
            flow = self._load(scope, row.connection_id.removeprefix(CONNECTION_PREFIX))
            if flow.connection_id != row.connection_id or flow.setup_status != "user_confirmed" or flow.main_proof is None or flow.revision != row.connection_revision:
                raise PolicyDenied("browser_account_receipt_changed")
            authorized.append({"connectionId": flow.connection_id, "revision": flow.revision, "origin": flow.origin})
        return {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True), "accounts": authorized}

    def validate_binding(self, context):
        selected = [binding for binding in context.connection_bindings if binding.kind == "browser_account"]
        try:
            self.authorize(context.scope, {"accountBindings": [{"bindingId": row.binding_id, "connectionId": row.connection_id,
                "connectionRevision": row.connection_revision, "revision": row.revision} for row in selected]})
            return True
        except (ValueError, PermissionError):
            return False
