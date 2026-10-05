"""Parent-owned browser effects for actual native writers, without engine runs.

The existing Main host, private gateway, Scope permissions, connection proofs,
resource table and M4 journal remain authoritative. No credentials, target IDs,
CDP endpoint or approval capability enters the child tool arguments.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from contextlib import nullcontext
import threading
import time
import json

from runtime.chat_modes import ChatExecutionPolicy, tool_denial
from .browser_gateway import GatewayError, GatewayLease, action_digest
from .contracts import (NativeActionRecord, NativeApprovalView, NativeChatOwner,
    PermissionScope, canonical_json, digest_json, new_id, utc_now)
from .native_browser_contracts import NativeBrowserRequest, validate_browser_payload
from .native_chat_protocol import NativeChatContext, verify_native_context
from .policy import PolicyDenied, intersect_permissions, require_origin
from .store import ResourceBusy


def native_browser_owner(context: NativeChatContext):
    return {"runId": None, "ownerKind": "native_chat", "sessionId": context.session_id,
        "streamId": context.stream_id, "writerGeneration": context.writer_generation,
        "writerLeaseId": context.writer_lease_id}


def _action(request: NativeBrowserRequest):
    name, args = request.tool_name, request.arguments
    if name in {"browser_navigate", "independent_browser_navigate"}:
        return {"kind": "navigate", "url": args["url"], "effect": "read"}
    if name in {"browser_snapshot", "independent_browser_read"}:
        return {"kind": "read", "effect": "read", **args}
    if name == "independent_browser_screenshot":
        return {"kind": "screenshot", "effect": "read"}
    if name in {"browser_click", "independent_browser_click"}:
        return {"kind": "click", "selector": args.get("selector", args.get("ref")), "effect": "write"}
    return {"kind": "type", "selector": args.get("selector", args.get("ref")), "text": args["text"], "effect": "write"}


class _NativeGateway:
    """Typed native ownership on the already authenticated Main transport."""
    def __init__(self, gateway, context, generation):
        self.gateway, self.context, self.generation = gateway, context, generation
        self.owner = native_browser_owner(context)
        self.pending_capability = None
        self.action_dispatched = False
        self._snapshot_lock = threading.Lock()

    def _snapshot(self, value, identity, *, allow_uninitialized=False):
        if (not isinstance(value, dict) or value.get("leaseId") != identity
            or value.get("scope") != self.context.scope.model_dump(mode="json", by_alias=True)
            or value.get("runnerGeneration") != self.generation
            or any(value.get(key) != expected for key, expected in self.owner.items())
            or value.get("partitionKind") != "dedicated_agent"
            or value.get("accountSource") != "explicit_agent_login"):
            raise PolicyDenied("native_browser_target_owner_changed")
        if (not isinstance(value.get("targetId"), str) or not value["targetId"] and not allow_uninitialized
            or not isinstance(value.get("mainGeneration"), str) or not value["mainGeneration"]
            or type(value.get("navigationEpoch")) is not int or value["navigationEpoch"] < 0
            or type(value.get("permissionEpoch")) is not int or value["permissionEpoch"] < 0
            or value.get("state") not in {"ready", "pausing", "paused", "revoked", "lost", "closing", "closed"}):
            raise PolicyDenied("native_browser_target_snapshot_invalid")
        return value

    def create(self, identity, permission, accounts, *, sequence):
        expires = int((time.time() + 1800) * 1000)
        ticket = {"leaseId": identity, **self.owner,
            "scope": self.context.scope.model_dump(mode="json", by_alias=True),
            "partitionKey": self.context.partition_key, "runnerGeneration": self.generation,
            "permissionEpoch": permission["controlEpoch"], "allowedOrigins": list(permission["scope"].browser_origins),
            "expiresAt": expires, "title": "Lastbrowser chat browser"}
        if accounts:
            ticket["accountBindings"] = [{"bindingId": ref.binding_id, "connectionId": ref.connection_id,
                "connectionRevision": ref.connection_revision, "revision": ref.revision} for ref in accounts]
        capability = self.gateway._post("/v1/capabilities/create", {**self.owner, "scope": ticket["scope"],
            "runnerGeneration": self.generation, "expiresAt": expires}).get("capability")
        if not isinstance(capability, str): raise GatewayError("gateway_protocol_mismatch")
        self.pending_capability = capability
        snapshot = self.gateway._post("/v1/leases/create", {"controlSequence": sequence, "ticket": ticket})
        return GatewayLease(snapshot=self._snapshot(snapshot, identity), capability=capability)

    def snapshot(self, lease):
        value = self.gateway._post("/v1/snapshot", {"leaseId": lease.lease_id}, capability=lease.capability)
        value = self._snapshot(value, lease.lease_id)
        with self._snapshot_lock:
            previous = lease.snapshot
            if (any(value.get(key) != previous.get(key) for key in ("targetId", "mainGeneration"))
                or value["navigationEpoch"] < previous["navigationEpoch"]
                or value["permissionEpoch"] < previous["permissionEpoch"]
                or previous.get("state") in {"lost", "revoked", "closing", "closed"} and value.get("state") != previous.get("state")):
                raise PolicyDenied("native_browser_target_snapshot_stale")
            lease.snapshot = value
        return lease.snapshot

    def execute(self, lease, action, *, sequence, record, allow_mutation):
        self.action_dispatched = False
        owner = NativeChatOwner(session_id=self.context.session_id, stream_id=self.context.stream_id,
            writer_generation=self.context.writer_generation, writer_lease_id=self.context.writer_lease_id)
        if (not isinstance(record, NativeActionRecord) or record.state != "dispatched"
            or record.scope != self.context.scope or record.owner_ref != owner
            or record.authorization_ref != self.context.writer_lease_id
            or record.canonical_args_digest != action_digest(action)):
            raise PolicyDenied("native_browser_claimed_action_required")
        snapshot = self.snapshot(lease)
        # A fresh snapshot is evidence, never authority to renew a consumed
        # approval for another navigation, target or permission generation.
        expected = {"leaseId": record.lease_id, "targetId": record.target_id,
            "mainGeneration": record.main_generation, "runnerGeneration": record.runner_generation,
            "navigationEpoch": record.navigation_epoch, "permissionEpoch": record.control_epoch}
        if snapshot.get("state") != "ready" or any(snapshot.get(key) != value for key, value in expected.items()):
            raise PolicyDenied("native_browser_approved_target_changed")
        permit = {"permitId": new_id(), "leaseId": lease.lease_id, **self.owner,
            "scope": snapshot["scope"], "targetId": snapshot["targetId"],
            "mainGeneration": snapshot["mainGeneration"], "runnerGeneration": self.generation,
            "navigationEpoch": record.navigation_epoch, "permissionEpoch": record.control_epoch,
            "actionDigest": action_digest(action), "expiresAt": int((time.time() + 10) * 1000),
            "allowMutation": allow_mutation}
        proof = self.gateway._post("/v1/permits/create", {"permit": permit}).get("authorizationProof")
        if not isinstance(proof, str): raise GatewayError("gateway_protocol_mismatch")
        self.action_dispatched = True
        return self.gateway._post("/v1/action", {"controlSequence": sequence, "permit": permit,
            "authorizationProof": proof, "action": action}, capability=lease.capability)

    def stop(self, lease, *, sequence, epoch):
        snapshot = lease.snapshot
        payload = {"controlSequence": sequence, "leaseId": lease.lease_id,
            **self.owner, "scope": snapshot["scope"], "runnerGeneration": self.generation,
            "operation": "revoke" if epoch > snapshot["permissionEpoch"] else "stop"}
        if payload["operation"] == "revoke": payload["permissionEpoch"] = epoch
        return self.gateway._post("/v1/control", payload)


class NativeBrowserFence:
    """One accepted native turn; no new work queue or fake independent run."""
    def __init__(self, sdk_broker, execution_policy, *, approval_wait_seconds=10):
        self.broker, self.context = sdk_broker, sdk_broker.context
        if not isinstance(self.context, NativeChatContext) or not isinstance(execution_policy, ChatExecutionPolicy):
            raise PolicyDenied("native_browser_captured_context_required")
        if not 0 <= approval_wait_seconds <= 10: raise ValueError("native_browser_approval_wait_invalid")
        verify_native_context(self.context)
        self.policy, self.store, self.manager = execution_policy, sdk_broker.service.store, sdk_broker.service.manager
        self._lock = threading.RLock(); self._changed = threading.Condition(self._lock)
        self._stopping = threading.Event(); self._lease = None; self._gateway = None; self._adapter = None
        self._manual = threading.Event()
        self._creating_id = None; self._early_events = []; self._accounts = None; self._request = None
        self._account_lease = None; self._active = 0; self._wait = approval_wait_seconds
        self._retired_at = None; self._closed = False
        with self.manager._lock:
            registry = getattr(self.manager, "_native_browser_fences", None)
            if registry is None: self.manager._native_browser_fences = registry = {}
            _prune_native_browser_fences(registry)
            if sum(fence._retired_at is None for fence in registry.values()) >= 128:
                raise ResourceBusy("Native browser owner capacity occupied")
            if any(fence.matches_owner(native_browser_owner(self.context)) for fence in registry.values()):
                raise ResourceBusy("Native browser owner already registered")
            registry[id(self)] = self

    def matches_owner(self, owner):
        return isinstance(owner, dict) and set(owner) == set(native_browser_owner(self.context)) and owner == native_browser_owner(self.context)

    def _validate(self, request=None, *, allow_manual=False):
        # No fence/SQL write lock is held by the Main validation callback: Main
        # may call Parent while another thread waits for its HTTP response.
        if self._closed or self._stopping.is_set(): raise PolicyDenied("native_browser_turn_stopping")
        if self._manual.is_set() and not allow_manual: raise PolicyDenied("native_browser_manual_takeover")
        if self.policy.mode not in {"action", "boost"}: raise PolicyDenied("native_browser_frozen_mode_denied")
        verify_native_context(self.context); self.broker._validate()
        decision = self.broker._decision
        if decision is None: raise PolicyDenied("native_browser_bound_sdk_decision_required")
        self.broker.service.validate_decision(decision)
        state = self.store.get_permission_state(self.context.scope)
        if (state["revision"] != decision.context.permission_revision or state["controlEpoch"] != decision.context.control_epoch
            or (state["permissions"] or {}).get("revoked")):
            raise PolicyDenied("native_browser_authority_changed")
        raw = state["permissions"]
        if not isinstance(raw, dict) or "allowedEffects" not in raw: raise PolicyDenied("native_browser_scope_permission_required")
        permission = PermissionScope.model_validate_json(canonical_json(raw))
        if self.manager.permission_provider is not None:
            permission = intersect_permissions(permission, self.manager.permission_provider(self.context.scope))
        if not permission.browser_origins: raise PolicyDenied("browser_origin_not_authorized")
        if request is not None:
            if request.execution_mode != self.policy.mode or request.execution_policy_revision != self.policy.revision:
                raise PolicyDenied("native_browser_execution_policy_changed")
            denial = tool_denial(self.policy, request.tool_name, request.arguments)
            if denial: raise PolicyDenied(denial)
            effect = _action(request)["effect"]
            if effect not in permission.allowed_effects: raise PolicyDenied("effect_outside_scope")
        managed = self.manager._governance(decision.context, prepare=True)
        if managed and request is not None:
            authorizer = getattr(self.manager, "native_browser_authorizer", None)
            if not callable(authorizer): authorizer = getattr(getattr(self.broker, "native_governance", None), "browser_authorizer", None)
            if not callable(authorizer) or authorizer(self.context, request, self.policy) is not True:
                raise PolicyDenied("native_browser_nova_action_adapter_required")
        if self._accounts is not None:
            captured = decision.context.model_copy(update={"connection_bindings": self._accounts})
            if not self.manager.capabilities.validate(captured): raise PolicyDenied("native_browser_connection_changed")
        if self._gateway is not None and self.manager.gateway is not self._gateway:
            raise PolicyDenied("native_browser_gateway_changed")
        return {**state, "scope": permission}

    def validate_live(self):
        self._validate(self._request)
        return native_browser_owner(self.context)

    def validate_parent_owner(self, owner):
        if not self.matches_owner(owner): raise PolicyDenied("native_browser_parent_owner_changed")
        self._validate(self._request)
        verify_native_context(self.context)
        if not self.matches_owner(owner): raise PolicyDenied("native_browser_parent_owner_changed")
        self._validate(self._request)
        return {"validated": True, "owner": native_browser_owner(self.context)}

    def _lease_record(self, identity, state, snapshot=None):
        value = {"leaseId": identity, "resourceKey": "target:" + identity,
            "scope": self.context.scope.model_dump(mode="json", by_alias=True), "runId": None,
            "ownerKind": "native_chat", "ownerRef": self.context.stream_id, "sessionId": self.context.session_id,
            "streamId": self.context.stream_id, "writerLeaseId": self.context.writer_lease_id,
            "ownerGeneration": self.context.writer_generation, "state": "active", "revision": 1,
            "expiresAt": "2099-01-01T00:00:00Z", "permissionRevision": state["revision"],
            "permissionEpoch": state["controlEpoch"], "launchPending": snapshot is None}
        if snapshot:
            value.update({key: snapshot[key] for key in ("targetId", "mainGeneration", "runnerGeneration", "navigationEpoch")})
            value["expiresAt"] = datetime.fromtimestamp(snapshot["expiresAt"] / 1000, timezone.utc).isoformat()
        return value

    def _save_target(self, snapshot):
        with self.store.transaction():
            row = self.store._one("SELECT data_json FROM ia_resource_leases WHERE lease_id=? AND state='active'", (snapshot["leaseId"],))
            if row is None: raise PolicyDenied("native_browser_resource_lease_missing")
            old = json.loads(row[0])
            if (old.get("ownerKind") != "native_chat" or old.get("runId") is not None
                or old.get("scope") != self.context.scope.model_dump(mode="json", by_alias=True)
                or old.get("ownerRef") != self.context.stream_id or old.get("sessionId") != self.context.session_id
                or old.get("writerLeaseId") != self.context.writer_lease_id
                or old.get("ownerGeneration") != self.context.writer_generation
                or not old.get("launchPending") and (any(old.get(key) != snapshot.get(key)
                    for key in ("targetId", "mainGeneration", "runnerGeneration"))
                    or snapshot.get("navigationEpoch", -1) < old.get("navigationEpoch", -1))):
                raise PolicyDenied("native_browser_resource_target_changed")
            state = self.store.get_permission_state(self.context.scope)
            value = self._lease_record(snapshot["leaseId"], state, snapshot)
            value["revision"] = old.get("revision", 1)
            for key in ("manualTakeover", "manualTakeoverRequestId"):
                if key in old: value[key] = old[key]
            self.store._conn.execute("UPDATE ia_resource_leases SET data_json=?,expires_at=? WHERE lease_id=? AND run_id IS NULL", (canonical_json(value), value["expiresAt"], value["leaseId"]))

    def browser_view_ref(self):
        """Private existing-writer reference. No Main HTTP or new target."""
        state = self._validate(allow_manual=True)
        lease = self._lease
        if lease is None: raise PolicyDenied("native_browser_target_missing")
        snapshot = dict(lease.snapshot)
        if snapshot.get("state") not in {"ready", "pausing", "paused"}:
            raise PolicyDenied("native_browser_target_not_available")
        row = self.store._one("SELECT data_json,revision FROM ia_resource_leases WHERE lease_id=? AND run_id IS NULL AND state='active'", (lease.lease_id,))
        if row is None: raise PolicyDenied("native_browser_resource_lease_missing")
        data = json.loads(row[0])
        if (data.get("ownerKind") != "native_chat" or data.get("ownerRef") != self.context.stream_id
            or data.get("ownerGeneration") != self.context.writer_generation
            or data.get("sessionId") != self.context.session_id or data.get("writerLeaseId") != self.context.writer_lease_id
            or data.get("scope") != self.context.scope.model_dump(mode="json", by_alias=True)
            or any(data.get(key) != snapshot.get(key) for key in ("targetId", "mainGeneration", "runnerGeneration", "navigationEpoch"))
            or type(row[1]) is not int or row[1] < 1 or data.get("revision") != row[1]):
            raise PolicyDenied("native_browser_view_owner_changed")
        self._validate(allow_manual=True)
        return {"schemaVersion": 1, "scope": self.context.scope.model_dump(mode="json", by_alias=True),
            "owner": native_browser_owner(self.context), "leaseId": lease.lease_id,
            "targetId": snapshot["targetId"], "mainGeneration": snapshot["mainGeneration"],
            "runnerGeneration": snapshot["runnerGeneration"], "navigationEpoch": snapshot["navigationEpoch"],
            "permissionRevision": state["revision"], "controlEpoch": state["controlEpoch"],
            "controlRevision": row[1], "state": snapshot["state"], "automationPaused": self._manual.is_set(),
            "writerAvailable": True, "observedAt": utc_now()}

    def request_manual_takeover(self, *, session_id, stream_id, writer_generation, writer_lease_id,
            expected_control_revision, expected_permission_revision, expected_control_epoch,
            expected_navigation_epoch, client_request_id, actor_ref):
        """Human control CAS closes only this writer's browser automation."""
        from uuid import UUID
        UUID(client_request_id)
        if not isinstance(actor_ref, str) or not actor_ref.startswith("user:"):
            raise PolicyDenied("native_browser_human_control_required")
        if (session_id != self.context.session_id or stream_id != self.context.stream_id
            or writer_generation != self.context.writer_generation or writer_lease_id != self.context.writer_lease_id):
            raise PolicyDenied("native_browser_control_owner_changed")
        expected = {"controlRevision": expected_control_revision, "permissionRevision": expected_permission_revision,
            "controlEpoch": expected_control_epoch, "navigationEpoch": expected_navigation_epoch}
        if any(type(value) is not int or value < (1 if key in {"controlRevision", "permissionRevision"} else 0)
                for key, value in expected.items()):
            raise PolicyDenied("native_browser_control_revision_invalid")
        fingerprint = {"owner": native_browser_owner(self.context), "actorRef": actor_ref, **expected}
        with self.store.transaction():
            view = self.browser_view_ref()
            old = self.store.get_request_result(self.context.scope, "native_browser_takeover", client_request_id, fingerprint)
            if old is not None:
                if (not self._manual.is_set() or any(old.get(key) != view.get(key) for key in (
                    "leaseId", "targetId", "mainGeneration", "runnerGeneration", "navigationEpoch", "permissionRevision", "controlEpoch", "controlRevision"))):
                    raise PolicyDenied("native_browser_takeover_receipt_stale")
                return view
            if any(view[key] != value for key, value in expected.items()) or self._manual.is_set():
                raise PolicyDenied("native_browser_control_revision_stale")
            row = self.store._one("SELECT data_json FROM ia_resource_leases WHERE lease_id=? AND revision=? AND state='active'", (view["leaseId"], expected_control_revision))
            if row is None: raise PolicyDenied("native_browser_control_revision_stale")
            data = json.loads(row[0])
            data.update(revision=expected_control_revision + 1, manualTakeover=True, manualTakeoverRequestId=client_request_id)
            changed = self.store._conn.execute("UPDATE ia_resource_leases SET revision=?,data_json=? WHERE lease_id=? AND revision=? AND state='active'", (
                data["revision"], canonical_json(data), view["leaseId"], expected_control_revision)).rowcount
            if changed != 1: raise PolicyDenied("native_browser_control_revision_stale")
            self._manual.set()  # Before Main pause/show or any later worker dispatch.
            result = {**view, "controlRevision": data["revision"], "automationPaused": True}
            self.store.record_request_result(self.context.scope, "native_browser_takeover", client_request_id, fingerprint, result)
            self.store._emit(self.context.scope, "control", {"ownerKind": "native_chat", "sessionId": session_id,
                "streamId": stream_id, "controlRevision": data["revision"], "automationPaused": True})
            return result

    def _browser(self, request):
        state = self._validate(request)
        if self._lease is not None:
            snapshot = self._adapter.snapshot(self._lease); self._save_target(snapshot)
            if snapshot.get("state") != "ready": raise PolicyDenied("native_browser_target_not_ready")
            return self._lease
        if self._creating_id is not None: raise ResourceBusy("Native browser creation outcome unverified")
        gateway = self.manager.gateway
        if gateway is None: raise PolicyDenied("browser_gateway_unavailable")
        self._accounts = tuple(self.manager.capabilities.capture_browser(self.context.scope))
        self._validate(request)
        self._gateway, self._adapter = gateway, _NativeGateway(gateway, self.context, self.manager.generation)
        identity = self._creating_id = new_id()
        value = self._lease_record(identity, state)
        with self.store.transaction():
            self._validate(request)
            self.store._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (identity, value["resourceKey"],
                self.store._scope(self.context.scope), None, self.context.writer_generation, 1, value["expiresAt"], "active", canonical_json(value)))
        try:
            lease = self._adapter.create(identity, state, self._accounts, sequence=self.store.next_control_sequence(self.context.scope))
            self._lease = lease
            for event in self._early_events: self._handle_event(event)
            self._early_events.clear()
            self._validate(request)
            if lease.snapshot.get("state") != "ready": raise PolicyDenied("native_browser_target_lost")
            self._save_target(lease.snapshot)
            self._creating_id = None
            return lease
        except BaseException as error:
            self._stopping.set()
            if self._lease is None and self._early_events and self._adapter.pending_capability:
                self._lease = GatewayLease(snapshot=self._early_events[-1]["lease"], capability=self._adapter.pending_capability)
            if self._lease is not None: self.request_stop("browser_creation_cancelled")
            elif isinstance(error, GatewayError) and not error.in_flight:
                self.store.release_lease(identity, owner_generation=self.context.writer_generation)
                self._creating_id = None
            raise

    def _account_resource(self):
        if self._account_lease is not None: return
        resource = "account:browser:" + self.context.scope.key
        with self.store.transaction():
            if self.store._one("SELECT lease_id FROM ia_resource_leases WHERE resource_key=? AND state='active'", (resource,)):
                raise ResourceBusy("Browser account has another unresolved effect")
            identity = new_id()
            value = {"leaseId": identity, "resourceKey": resource, "scope": self.context.scope.model_dump(mode="json", by_alias=True),
                "runId": None, "ownerKind": "native_chat", "ownerRef": self.context.stream_id,
                "ownerGeneration": self.context.writer_generation, "revision": 1, "state": "active",
                "expiresAt": "2099-01-01T00:00:00Z"}
            self.store._conn.execute("INSERT INTO ia_resource_leases VALUES(?,?,?,?,?,?,?,?,?)", (identity, resource,
                self.store._scope(self.context.scope), None, self.context.writer_generation, 1, value["expiresAt"], "active", canonical_json(value)))
            self._account_lease = identity

    def _release_known_account(self):
        if self._account_lease is None: return
        owner = NativeChatOwner(session_id=self.context.session_id, stream_id=self.context.stream_id,
            writer_generation=self.context.writer_generation, writer_lease_id=self.context.writer_lease_id)
        actions = tuple(action for row in self.store._many("SELECT action_id FROM ia_action_journal WHERE scope_key=? AND run_id IS NULL",
            (self.context.scope.key,)) if (action := self.store.get_native_action(row[0])).owner_ref == owner)
        if any(row.intended_effect != "read" and row.state in {"claimed", "dispatched", "unknown"} for row in actions): return
        self.store.release_lease(self._account_lease, owner_generation=self.context.writer_generation)
        self._account_lease = None

    def dispatch(self, payload):
        request = validate_browser_payload(payload)
        action = _action(request)
        fingerprint = {**native_browser_owner(self.context), "toolName": request.tool_name,
            "actionDigest": action_digest(action), "executionMode": request.execution_mode,
            "executionPolicyRevision": request.execution_policy_revision}
        with self._lock:
            state = self._validate(request)
            old = self.store.get_request_result(self.context.scope, "native_browser_result", request.operation_id, fingerprint)
            if old is not None:
                if old.get("effectKnown") is not True: raise PolicyDenied("native_browser_unknown_effect_no_replay")
                return old
            if self.store.get_request_result(self.context.scope, "native_browser_started", request.operation_id, fingerprint) is not None:
                raise PolicyDenied("native_browser_unknown_effect_no_replay")
            if len(self.store.list_native_actions(self.context)) >= 128: raise ResourceBusy("Native browser tool budget exhausted")
            self._request = request; self._active += 1
            record = None
            try:
                if self._adapter is not None: self._adapter.action_dispatched = False
                if action["kind"] == "navigate": require_origin(action["url"], state["scope"].browser_origins)
                lease = self._browser(request)
                snapshot = lease.snapshot
                if action["kind"] != "navigate": require_origin(snapshot["url"], state["scope"].browser_origins)
                owner = NativeChatOwner(session_id=self.context.session_id, stream_id=self.context.stream_id,
                    writer_generation=self.context.writer_generation, writer_lease_id=self.context.writer_lease_id)
                fields = {"owner_ref": owner, "session_id": self.context.session_id, "stream_id": self.context.stream_id,
                    "writer_generation": self.context.writer_generation, "writer_lease_id": self.context.writer_lease_id,
                    "scope": self.context.scope, "permission_revision": state["revision"], "control_epoch": state["controlEpoch"],
                    "navigation_epoch": snapshot["navigationEpoch"], "lease_id": lease.lease_id,
                    "target_id": snapshot["targetId"], "main_generation": snapshot["mainGeneration"],
                    "runner_generation": snapshot["runnerGeneration"], "connection_revisions": {ref.binding_id: ref.revision for ref in self._accounts}}
                record = NativeActionRecord(action_id=new_id(), step_id=request.operation_id, tool_id=request.tool_name,
                    canonical_args_digest=action_digest(action), intended_effect=action["effect"], resource_refs=(lease.lease_id,),
                    authorization_ref=self.context.writer_lease_id, connection_bindings=self._accounts, **fields)
                self.store.prepare_native_action(self.context, record)
                approval = None
                if action["effect"] != "read":
                    self._account_resource()
                    approval = NativeApprovalView(approval_id=new_id(), action_id=record.action_id,
                        action_digest=record.canonical_args_digest, effect="write",
                        target_summary=(snapshot["url"] + " " + action["selector"])[:2000],
                        expires_at=(datetime.now(timezone.utc) + timedelta(seconds=max(1, self._wait))).isoformat(), **fields)
                    self.store.create_native_approval(self.context, approval)
                    deadline = time.monotonic() + self._wait
                    while True:
                        self._validate(request)
                        decided = self.store.get_native_approval(approval.approval_id)
                        if decided.state == "approved": break
                        if decided.state != "pending" or time.monotonic() >= deadline:
                            self.store.finish_native_action(self.context, record.action_id, "denied", error_code="native_browser_approval_not_granted")
                            self._release_known_account()
                            response = {"operationId": request.operation_id, "acknowledged": True, "effectKnown": True,
                                "state": "denied", "result": {"waitingForApproval": False,
                                    "approvalId": approval.approval_id, "actionId": record.action_id,
                                    "reasonCode": "native_browser_approval_not_granted"}}
                            self.store.record_request_result(self.context.scope, "native_browser_result", request.operation_id, fingerprint, response)
                            return response
                        self._changed.wait(timeout=min(.1, max(.001, deadline - time.monotonic())))
                    self._save_target(self._adapter.snapshot(lease))
                self._validate(request)
                with self.store.transaction():
                    self._validate(request)
                    self.store.claim_native_action(self.context, record.action_id,
                        expected_permission_revision=state["revision"], expected_control_epoch=state["controlEpoch"],
                        approval_id=approval.approval_id if approval else None)
                    self.store.record_request_result(self.context.scope, "native_browser_started", request.operation_id,
                        fingerprint, {"actionId": record.action_id, "leaseId": lease.lease_id, "state": "dispatched"})
                    self.store.finish_native_action(self.context, record.action_id, "dispatched")
                    sequence = self.store.next_control_sequence(self.context.scope)
                # Never hold a SQL transaction while Main calls private Parent
                # validation. Epoch/sequence gates order revocation at dispatch.
                self._validate(request)
                managed = self.manager._governance(self.broker._decision.context, prepare=True)
                governance = getattr(self.broker, "native_governance", None)
                boundary = getattr(governance, "action_boundary", None)
                if managed and not callable(boundary): raise PolicyDenied("native_browser_nova_action_adapter_required")
                with boundary(self.context, self.store.get_native_action(record.action_id), request.arguments,
                        approval.approval_id if approval else None) if managed else nullcontext():
                    self._validate(request)
                    result = self._adapter.execute(lease, action, sequence=sequence,
                        record=self.store.get_native_action(record.action_id), allow_mutation=action["effect"] != "read")
                self.store.finish_native_action(self.context, record.action_id, "succeeded")
                if len(canonical_json(result).encode("utf-8")) > 750000:
                    result = {"omittedLargePayload": True, "reasonCode": "native_browser_result_too_large"}
                response = {"operationId": request.operation_id, "acknowledged": True, "effectKnown": True,
                    "state": "completed", "result": result}
                self.store.record_request_result(self.context.scope, "native_browser_result", request.operation_id, fingerprint, response)
                self._release_known_account()
                return response
            except Exception as error:
                if record is not None:
                    current = self.store.get_native_action(record.action_id)
                    if current is not None and current.state in {"prepared", "claimed", "dispatched"}:
                        uncertain = (current.state == "dispatched" and action["effect"] != "read"
                            and self._adapter is not None and self._adapter.action_dispatched
                            and (not isinstance(error, GatewayError) or error.in_flight))
                        terminal = "unknown" if uncertain else "failed" if current.state == "dispatched" else "denied"
                        self.store.finish_native_action(self.context, record.action_id, terminal,
                            error_code=getattr(error, "code", "native_browser_dispatch_failed"))
                        response = {"operationId": request.operation_id, "acknowledged": False,
                            "effectKnown": not uncertain, "state": terminal, "result": {"error": getattr(error, "code", "native_browser_dispatch_failed")}}
                        self.store.record_request_result(self.context.scope, "native_browser_result", request.operation_id, fingerprint, response)
                    self._release_known_account()
                raise
            finally:
                self._active -= 1; self._request = None; self._changed.notify_all()

    def _handle_event(self, event):
        snapshot = event["lease"]
        if self._lease is not None:
            self._lease.snapshot = snapshot
            if event.get("kind") not in {"lost", "revoked", "closed"}: self._save_target(snapshot)
        if event.get("kind") in {"lost", "revoked", "closed", "navigation_denied"}:
            self._stopping.set()
        if event.get("kind") == "closed":
            self.store.release_lease(snapshot["leaseId"], owner_generation=self.context.writer_generation)
            self._creating_id = None
            self._closed = True

    def handle_event(self, event):
        snapshot = event.get("lease") if isinstance(event, dict) else None
        if (not isinstance(snapshot, dict) or snapshot.get("scope") != self.context.scope.model_dump(mode="json", by_alias=True)
            or any(snapshot.get(key) != value for key, value in native_browser_owner(self.context).items())
            or snapshot.get("runnerGeneration") != self.manager.generation):
            raise PolicyDenied("native_browser_event_owner_changed")
        if event.get("kind") not in {"created", "navigation", "paused", "resumed", "revoked", "lost", "closed",
            "navigation_denied", "popup_denied", "download_denied"}:
            raise PolicyDenied("native_browser_event_invalid")
        snapshot = self._adapter._snapshot(snapshot, snapshot.get("leaseId"),
            allow_uninitialized=event.get("kind") in {"closed", "lost", "revoked"} and (
                self._lease is None and snapshot.get("leaseId") == self._creating_id
                or self._closed and self._lease is not None and self._lease.snapshot.get("targetId") == ""
                    and snapshot.get("leaseId") == self._lease.lease_id)) if self._adapter is not None else snapshot
        identity = snapshot.get("leaseId")
        if self._lease is None:
            if identity != self._creating_id or len(self._early_events) >= 16:
                raise PolicyDenied("native_browser_event_unknown_target")
            self._early_events.append(event)
            if event.get("kind") in {"lost", "revoked", "closed"}: self._stopping.set()
            return
        with self._adapter._snapshot_lock:
            previous = self._lease.snapshot
            if identity != self._lease.lease_id or any(snapshot.get(key) != previous.get(key) for key in ("targetId", "mainGeneration")):
                raise PolicyDenied("native_browser_event_target_changed")
            if self._closed:
                if self._retired_at is not None and time.monotonic() - self._retired_at >= 120:
                    raise PolicyDenied("native_browser_terminal_owner_expired")
                if event.get("kind") not in {"closed", "revoked", "lost", "navigation_denied"}:
                    raise PolicyDenied("native_browser_terminal_event_invalid")
                return  # Bounded native owner tombstone; no new action authority.
            if event.get("kind") not in {"closed", "revoked", "lost", "navigation_denied"} and (
                snapshot["navigationEpoch"] < previous["navigationEpoch"]
                or snapshot["permissionEpoch"] < previous["permissionEpoch"]):
                return  # Out-of-order own observer data cannot roll back authority.
            self._handle_event(event)

    def decide_approval(self, approval_id, *, approved, actor_ref, action_digest, client_request_id,
        expected_permission_revision, expected_control_epoch):
        self._validate(self._request)
        if self._lease is None: raise PolicyDenied("native_browser_approval_target_missing")
        self._save_target(self._adapter.snapshot(self._lease))
        result = self.store.decide_native_approval(self.context, approval_id, approved=approved, actor_ref=actor_ref,
            action_digest=action_digest, expected_permission_revision=expected_permission_revision,
            expected_control_epoch=expected_control_epoch, client_request_id=client_request_id)
        with self._changed: self._changed.notify_all()
        return result

    def request_stop(self, reason="cancel"):
        self._stopping.set()  # Before Main control or waiting for any tool lock.
        if self._closed:
            if self._active == 0: self._release_known_account()
            return {"acknowledged": self._active == 0, "targetClosed": True, "reasonCode": reason}
        lease, adapter = self._lease, self._adapter
        if lease is None:
            return {"acknowledged": self._creating_id is None, "targetClosed": self._creating_id is None, "reasonCode": reason}
        state = self.store.get_permission_state(self.context.scope)
        try:
            ack = adapter.stop(lease, sequence=self.store.next_control_sequence(self.context.scope), epoch=state["controlEpoch"])
            confirmed = ack.get("revoked") is True or ack.get("stopped") is True
        except (GatewayError, PolicyDenied, OSError): confirmed = False
        if confirmed:
            self.store.release_lease(lease.lease_id, owner_generation=self.context.writer_generation)
            self._creating_id = None
            self._closed = True
            if self._active == 0: self._release_known_account()
        return {"acknowledged": confirmed and self._active == 0, "targetClosed": confirmed, "reasonCode": reason}

    def close_after_exit(self):
        return self.request_stop("process_exited")

    def retire_after_exit(self):
        """Only after actual process exit and a confirmed native target ACK."""
        with self.manager._lock:
            if self._active or self._creating_id is not None:
                return {"acknowledged": False, "reasonCode": "native_browser_retirement_pending"}
            if self._lease is None:
                self.manager._native_browser_fences.pop(id(self), None)
                return {"acknowledged": True, "retained": False}
            if not self._closed:
                return {"acknowledged": False, "reasonCode": "native_browser_target_exit_unverified"}
            if self._retired_at is None: self._retired_at = time.monotonic()
            _prune_native_browser_fences(self.manager._native_browser_fences)
            return {"acknowledged": True, "retained": id(self) in self.manager._native_browser_fences}


def _prune_native_browser_fences(registry):
    now = time.monotonic()
    for key, fence in tuple(registry.items()):
        if fence._retired_at is not None and now - fence._retired_at >= 120:
            registry.pop(key, None)
    retired = sorted((fence._retired_at, key) for key, fence in registry.items() if fence._retired_at is not None)
    for _, key in retired[:-256]: registry.pop(key, None)


def find_native_browser_fence(manager, scope, owner):
    with manager._lock:
        _prune_native_browser_fences(manager._native_browser_fences)
        matches = [fence for fence in getattr(manager, "_native_browser_fences", {}).values()
            if fence.context.scope == scope and fence.matches_owner(owner)]
    if len(matches) != 1: raise PolicyDenied("native_browser_owner_not_registered")
    return matches[0]
