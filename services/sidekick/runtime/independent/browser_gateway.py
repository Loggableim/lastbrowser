"""Private stdlib client for the Main-owned, authenticated browser gateway.

Controller secrets never enter the worker environment or model arguments.
Requests connect directly to one loopback port, without proxy or redirects.
"""
from __future__ import annotations

import hashlib
import http.client
import json
import os
import socket
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from .contracts import RunContext, canonical_json, new_id


class GatewayError(RuntimeError):
    def __init__(self, code: str, *, in_flight: bool = False, retryable: bool = False):
        self.code, self.in_flight, self.retryable = code, in_flight, retryable
        super().__init__(code)


def action_digest(action: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(action).encode("utf-8")).hexdigest()


@dataclass
class GatewayLease:
    snapshot: dict[str, Any]
    capability: str

    @property
    def lease_id(self) -> str:
        return self.snapshot["leaseId"]


class BrowserGatewayClient:
    def __init__(self, url: str, bootstrap_secret: str, *, timeout: float = 35.0):
        parsed = urlsplit(url)
        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise GatewayError("invalid_private_gateway")
        if not bootstrap_secret or "\r" in bootstrap_secret or "\n" in bootstrap_secret:
            raise GatewayError("invalid_gateway_credential")
        self.host, self.port = "127.0.0.1", parsed.port
        self._bootstrap_secret = bootstrap_secret
        self.timeout = min(max(float(timeout), 1), 45)

    @classmethod
    def from_environment(cls) -> BrowserGatewayClient | None:
        url, secret = os.getenv("LASTBROWSER_BROWSER_GATEWAY_URL"), os.getenv("LASTBROWSER_BROWSER_GATEWAY_KEY")
        if not url or not secret:
            return None
        return cls(url, secret)

    def _post(self, path: str, payload: dict[str, Any], *, capability: str | None = None) -> dict[str, Any]:
        body = canonical_json({"schemaVersion": 1, **payload}).encode("utf-8")
        if len(body) > 65536:
            raise GatewayError("gateway_request_too_large")
        connection = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
        # Once bytes are sent a transport failure may conceal an external
        # effect. The broker treats mutation outcomes as unknown, never retry.
        sent = False
        try:
            connection.request("POST", path, body=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + (capability or self._bootstrap_secret)})
            sent = True
            response = connection.getresponse()
            encoded = response.read(16 * 1024 * 1024 + 1)
            if len(encoded) > 16 * 1024 * 1024:
                raise GatewayError("gateway_response_too_large", in_flight=sent)
            data = json.loads(encoded)
            if not isinstance(data, dict) or data.get("schemaVersion") != 1:
                raise GatewayError("gateway_protocol_mismatch", in_flight=sent)
            if response.status != 200 or "error" in data:
                error = data.get("error") or {}
                code = str(error.get("code", "gateway_failed"))[:128]
                raise GatewayError(code, in_flight=bool(error.get("inFlight")), retryable=code in {"action_timeout", "browser_error"})
            result = data.get("result")
            if not isinstance(result, dict):
                # Fixed Main read operations may return strings or null.
                return {"value": result}
            return result
        except (OSError, socket.timeout, http.client.HTTPException) as exc:
            raise GatewayError("gateway_transport_lost", in_flight=sent, retryable=True) from exc
        except (ValueError, UnicodeError) as exc:
            raise GatewayError("gateway_protocol_mismatch", in_flight=sent) from exc
        finally:
            connection.close()

    def create_lease(self, context: RunContext, *, control_sequence: int, permission_epoch: int, title: str, expires_at_ms: int | None = None) -> GatewayLease:
        expires = expires_at_ms or int((time.time() + 1800) * 1000)
        ticket = {"leaseId": new_id(), "runId": context.run_id, "scope": context.scope.model_dump(mode="json", by_alias=True), "partitionKey": context.partition_key, "runnerGeneration": context.runner_generation, "permissionEpoch": permission_epoch, "allowedOrigins": list(context.effective_permissions.browser_origins), "expiresAt": expires, "title": title[:500]}
        accounts = []
        for binding in context.connection_bindings:
            if binding.kind != "browser_account":
                continue
            if binding.capability_id != "browser.account":
                raise GatewayError("unknown_browser_account_binding")
            if binding.binding_id is None or binding.connection_revision is None:
                raise GatewayError("browser_account_binding_incomplete")
            accounts.append({"bindingId": binding.binding_id, "connectionId": binding.connection_id,
                "connectionRevision": binding.connection_revision, "revision": binding.revision})
        if accounts:
            ticket["accountBindings"] = accounts
        # Obtain the capability before creating resources: a failed capability
        # handshake cannot leave an otherwise unaddressable browser host.
        capability = self._post("/v1/capabilities/create", {"runId": context.run_id, "scope": ticket["scope"], "runnerGeneration": context.runner_generation, "expiresAt": expires})["capability"]
        if not isinstance(capability, str):
            raise GatewayError("gateway_protocol_mismatch")
        snapshot = self._post("/v1/leases/create", {"controlSequence": control_sequence, "ticket": ticket})
        return GatewayLease(snapshot=snapshot, capability=capability)

    def snapshot(self, lease: GatewayLease) -> dict[str, Any]:
        result = self._post("/v1/snapshot", {"leaseId": lease.lease_id}, capability=lease.capability)
        lease.snapshot = result
        return result

    def execute(self, lease: GatewayLease, action: dict[str, Any], *, control_sequence: int, permission_epoch: int,
            allow_mutation: bool, expected_identity: dict[str, Any] | None = None) -> dict[str, Any]:
        snapshot = self.snapshot(lease)
        if expected_identity is not None and any(snapshot.get(alias) != expected_identity.get(field) for field, alias in (
                ("lease_id", "leaseId"), ("scope", "scope"), ("target_id", "targetId"),
                ("main_generation", "mainGeneration"), ("runner_generation", "runnerGeneration"),
                ("navigation_epoch", "navigationEpoch"))):
            raise GatewayError("browser_target_identity_changed")
        permit = {"permitId": new_id(), "leaseId": lease.lease_id, "runId": snapshot["runId"], "scope": snapshot["scope"], "targetId": snapshot["targetId"], "mainGeneration": snapshot["mainGeneration"], "runnerGeneration": snapshot["runnerGeneration"], "navigationEpoch": snapshot["navigationEpoch"], "permissionEpoch": permission_epoch, "actionDigest": action_digest(action), "expiresAt": int((time.time() + 10) * 1000), "allowMutation": allow_mutation}
        proof = self._post("/v1/permits/create", {"permit": permit})["authorizationProof"]
        return self._post("/v1/action", {"controlSequence": control_sequence, "permit": permit, "authorizationProof": proof, "action": action}, capability=lease.capability)

    def control(self, lease: GatewayLease, operation: str, *, control_sequence: int, permission_epoch: int | None = None) -> dict[str, Any]:
        current = lease.snapshot
        payload = {"controlSequence": control_sequence, "leaseId": lease.lease_id, "runId": current["runId"], "scope": current["scope"], "runnerGeneration": current["runnerGeneration"], "operation": operation}
        if operation == "resume":
            current = self.snapshot(lease)
            payload["navigationEpoch"] = current["navigationEpoch"]
            payload["permissionEpoch"] = current["permissionEpoch"] if permission_epoch is None else permission_epoch
        elif permission_epoch is not None:
            payload["permissionEpoch"] = permission_epoch
        result = self._post("/v1/control", payload)
        if "leaseId" in result:
            lease.snapshot = result
        return result
