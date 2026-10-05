"""Durable provider reservations in existing profile databases.

The base-Home lock orders claims across profiles and processes. Inventory
reads use SQLite mode=ro, never ProfileHub.get() or a credential resolver.
Unknown account/project/family identity shares one actual endpoint origin;
unverified endpoints share one conservative group across provider aliases.
Only allowlisted response metadata is persisted; no prompts or credentials.
"""
from __future__ import annotations

import json
import hashlib
import math
import re
import sqlite3
import threading
import time
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Annotated, Callable, Literal, Mapping
from urllib.parse import urlsplit

from pydantic import Field

from .contracts import Contract, Id, Ref, Scope, Utc, canonical_json, digest_json, new_id, utc_now
from .policy import PolicyDenied
from .scope import ScopeError, canonical_path
from .store import ResourceBusy


class AdmissionBudget(Contract):
    requests_per_minute: Annotated[int, Field(ge=1, le=1000)] = 6
    tokens_per_minute: Annotated[int, Field(ge=1, le=10000000)] = 100000
    max_concurrent: Annotated[int, Field(ge=1, le=6)] = 1
    max_cost_microusd_per_minute: Annotated[int, Field(ge=0, le=1000000000)] | None = None
    max_output_tokens: Annotated[int, Field(ge=1, le=100000)] = 2048


class LimitBucket(Contract):
    resource: Literal["requests", "tokens", "input_tokens", "output_tokens", "project_tokens"]
    limit: Annotated[int, Field(ge=0)] | None = None
    remaining: Annotated[int, Field(ge=0)] | None = None
    reset_at: Utc | None = None


class ProviderLimitSnapshot(Contract):
    schema_version: Literal[1] = 1
    provider: Ref
    group_key: Ref
    observed_at: Utc
    observed_request_id: Id | None = None
    source: Literal["response_headers", "unknown"] = "unknown"
    buckets: tuple[LimitBucket, ...] = ()
    retry_at: Utc | None = None
    action_required: bool = False
    status_code: Annotated[int, Field(ge=100, le=599)] | None = None


class ProviderClaim(Contract):
    schema_version: Literal[1] = 1
    claim_id: Id
    decision_id: Id
    turn_id: Id
    scope: Scope
    session_id: Ref
    provider: Ref
    model: Ref
    group_key: Ref
    owner_generation: Id
    permission_revision: Annotated[int, Field(ge=1)]
    control_epoch: Annotated[int, Field(ge=0)]
    policy_revision: Annotated[int, Field(ge=0)]
    admission_budget: AdmissionBudget = Field(default_factory=AdmissionBudget)
    request_purpose: Literal[
        "conversation", "child", "goal_judge", "teamwork:planner", "teamwork:worker",
        "teamwork:critic", "teamwork:synthesizer", "teamwork:single_provider",
    ] = "conversation"
    input_bound_source: Literal["context_capacity", "serialized_text_bytes"] = "context_capacity"
    state: Literal["reserved", "started", "completed", "cancelled", "unknown"] = "reserved"
    created_at: Utc
    updated_at: Utc
    reserved_input_tokens: Annotated[int, Field(ge=0)]
    reserved_output_tokens: Annotated[int, Field(ge=1)]
    reserved_cost_microusd: Annotated[int, Field(ge=0)] | None = None
    measured_tokens: Annotated[int, Field(ge=0)] | None = None
    measured_cost_microusd: Annotated[int, Field(ge=0)] | None = None
    response_started: bool = False
    delivered_delta: bool = False
    stop_acknowledged: bool = False
    error_code: Ref | None = None

    @property
    def reserved_tokens(self):
        return self.reserved_input_tokens + self.reserved_output_tokens


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _integer(value):
    # Missing, negative, fractional, NaN and malformed values remain unknown.
    if isinstance(value, str) and re.fullmatch(r"[0-9]{1,12}", value.strip()):
        return int(value)
    return None


def provider_endpoint(home: Path, provider: str) -> str | None:
    """Pure explicit own-Home endpoint read, with no provider/auth resolution."""
    import yaml
    path = home / "config.yaml"
    if path.is_file() and (not path.resolve().is_relative_to(home.resolve()) or path.stat().st_size > 8 * 1024 * 1024):
        raise ScopeError("Provider endpoint configuration cannot be verified")
    configuration = yaml.safe_load(path.read_text("utf-8")) if path.is_file() else {}
    if not isinstance(configuration, dict):
        raise ScopeError("Provider endpoint configuration is malformed")
    rows = []
    active, configured = configuration.get("model"), configuration.get("providers")
    if isinstance(active, dict) and active.get("provider") == provider:
        rows.append(active)
    if isinstance(configured, dict) and isinstance(configured.get(provider), dict):
        rows.append(configured[provider])
    for row in configuration.get("custom_providers", []) if isinstance(configuration.get("custom_providers"), list) else []:
        name = str(row.get("name") or "").strip().lower() if isinstance(row, dict) else ""
        slug = name if name.startswith("custom:") else "custom:" + re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9._-]+", "-", name).strip("-"))
        if isinstance(row, dict) and slug == provider:
            rows.append(row)
    urls = {row["base_url"] for row in rows if isinstance(row.get("base_url"), str) and row["base_url"]}
    return next(iter(urls)) if len(urls) == 1 else None


def provider_group_key(home: Path, provider: str) -> str:
    endpoint = provider_endpoint(home, provider)
    try:
        parsed = urlsplit(endpoint or "")
        if parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password:
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            # Paths, model families, provider aliases and key rotation cannot
            # split an unknown account limit at one actual endpoint origin.
            origin = parsed.scheme + "://" + parsed.hostname.lower() + ":" + str(port)
            return "endpoint:" + hashlib.sha256(origin.encode()).hexdigest()
    except ValueError:
        pass
    # Without verified transport/account metadata, no distinct-provider
    # assumption may be used to evade the shared conservative allowance.
    return "remote:unknown"


def _reset(value, now):
    if not isinstance(value, str) or len(value) > 128:
        return None
    try:
        parsed = _date(value)
        if parsed.tzinfo is not None:
            return _iso(parsed)
    except ValueError:
        pass
    # OpenAI duration (e.g. 6m0s) versus Anthropic RFC3339 timestamp.
    units = {"ms": .001, "s": 1, "m": 60, "h": 3600, "d": 86400}
    parts = re.findall(r"([0-9]+(?:\.[0-9]+)?)(ms|s|m|h|d)", value)
    if parts and "".join(number + unit for number, unit in parts) == value:
        seconds = sum(float(number) * units[unit] for number, unit in parts)
    else:
        try:
            seconds = float(value)
        except ValueError:
            return None
    if not math.isfinite(seconds) or not 0 <= seconds <= 31536000:
        return None
    return _iso(now + timedelta(seconds=seconds))


def parse_response_limits(provider: str, headers: Mapping[str, str], *, observed_at: str,
                          request_id: str | None = None, status_code: int | None = None,
                          error_code: str | None = None) -> ProviderLimitSnapshot:
    """SDK-response headers only. No quota probing or authentication occurs."""
    now = _date(observed_at)
    lowered = {str(key).lower(): value for key, value in headers.items()}
    buckets = []
    for resource, tag in (("requests", "requests"), ("tokens", "tokens"),
                          ("input_tokens", "input-tokens"), ("output_tokens", "output-tokens"),
                          ("project_tokens", "project-tokens")):
        for prefix in ("x-ratelimit-", "anthropic-ratelimit-"):
            keys = [prefix + tag + "-" + suffix for suffix in ("limit", "remaining", "reset")] if prefix.startswith("anthropic") else [prefix + suffix + "-" + tag for suffix in ("limit", "remaining", "reset")]
            if any(key in lowered for key in keys):
                buckets.append(LimitBucket(resource=resource, limit=_integer(lowered.get(keys[0])),
                    remaining=_integer(lowered.get(keys[1])), reset_at=_reset(lowered.get(keys[2]), now)))
    retry = lowered.get("retry-after")
    retry_at = _reset(retry, now)
    if retry and retry_at is None:
        try:
            retry_at = _iso(parsedate_to_datetime(retry))
        except (ValueError, TypeError, OverflowError):
            pass
    requires_action = status_code == 402 or error_code in {"insufficient_quota", "billing_hard_limit_reached", "enforced_spend_limit_reached"}
    if status_code in {429, 503} and retry_at is None and not requires_action:
        retry_at = _iso(now + timedelta(seconds=60))
    return ProviderLimitSnapshot(provider=provider, group_key="provider:" + provider,
        observed_at=observed_at, observed_request_id=request_id, source="response_headers" if buckets else "unknown",
        buckets=tuple(buckets), retry_at=retry_at, action_required=requires_action, status_code=status_code)


_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()


@contextmanager
def admission_boundary(base_home: Path):
    """Bounded native lock; no DB transaction or provider call held here."""
    root = canonical_path(base_home)
    with _LOCKS_GUARD:
        lock = _LOCKS.setdefault(str(root).casefold(), threading.RLock())
    with lock:
        directory = root / "state"
        directory.mkdir(exist_ok=True)
        path = directory / "provider-admission.lock"
        if not path.resolve().is_relative_to(root):
            raise ScopeError("Provider admission lock escapes the base Home")
        with path.open("a+b") as file:
            if file.tell() == 0:
                file.write(b"\0")
                file.flush()
            deadline = time.monotonic() + 2
            while True:
                try:
                    file.seek(0)
                    if __import__("os").name == "nt":
                        import msvcrt
                        msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
                    else:
                        import fcntl
                        fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except (OSError, BlockingIOError):
                    if time.monotonic() >= deadline:
                        raise ResourceBusy("Shared provider admission is busy")
                    time.sleep(.02)
            try:
                yield
            finally:
                file.seek(0)
                if __import__("os").name == "nt":
                    import msvcrt
                    msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(file.fileno(), fcntl.LOCK_UN)


class ProviderAdmission:
    def __init__(self, store, *, base_home: Path, existing_store_paths: Callable,
                 now: Callable[[], str] = utc_now):
        self.store, self.base_home, self.inventory, self.now = store, canonical_path(base_home), existing_store_paths, now
        if not store.profile_home.is_relative_to(self.base_home):
            raise ScopeError("Provider store is outside the captured base Home")

    def _all(self, operation, *, include_stale=False):
        rows = []
        seen = set()
        for profile_id, database in self.inventory():
            path = Path(database).resolve(strict=True)
            if not path.is_relative_to(self.base_home) or path.name != "state.db" or path in seen:
                raise ScopeError("Provider admission inventory is invalid")
            seen.add(path)
            with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
                refs = connection.execute("SELECT backend_profile_id,canonical_home,status FROM ia_profile_refs").fetchall()
                if len(refs) != 1 or refs[0][0] != profile_id or canonical_path(refs[0][1]) != path.parent or refs[0][2] != "active":
                    raise ScopeError("Provider admission profile identity changed")
                cutoff = _iso(_date(self.now()) - timedelta(seconds=60))
                live = "julianday(created_at)>=julianday(?) OR json_extract(result_json,'$.state') IN ('reserved','started') OR (json_extract(result_json,'$.state')='unknown' AND COALESCE(json_extract(result_json,'$.stopAcknowledged'),0)=0)" if operation == "provider_claim" else "julianday(created_at)>=julianday(?) OR json_extract(result_json,'$.actionRequired')=1 OR julianday(json_extract(result_json,'$.retryAt'))>julianday(?)"
                params = (operation, cutoff) if operation == "provider_claim" else (operation, cutoff, self.now())
                if include_stale:
                    live, params = "1=1", (operation,)
                records = connection.execute("SELECT scope_key,result_json FROM ia_request_results WHERE operation=? AND (" + live + ") ORDER BY created_at DESC LIMIT " + ("64" if include_stale else "4097"), params).fetchall()
                if len(records) > 4096:
                    raise ResourceBusy("Provider admission requires bounded journal maintenance")
                for key, encoded in records:
                    value = json.loads(encoded)
                    if operation == "provider_claim":
                        value = ProviderClaim.model_validate(value)
                        if value.scope.backend_profile_id != profile_id or value.scope.key != key:
                            raise ScopeError("Provider claim has a foreign profile")
                    else:
                        value = ProviderLimitSnapshot.model_validate(value)
                    rows.append(value)
        if self.store.db_path.resolve() not in seen:
            raise ScopeError("Current provider store is missing from the authoritative inventory")
        return rows

    def _put(self, scope, operation, request_id, value):
        self.store._conn.execute("INSERT INTO ia_request_results VALUES(?,?,?,?,?,?) ON CONFLICT(scope_key,operation,request_id) DO UPDATE SET result_json=excluded.result_json",
            (self.store._scope(scope), request_id, operation, digest_json({"id": request_id}), canonical_json(value), self.now()))

    def get_claim(self, scope, claim_id):
        row = self.store._one("SELECT result_json FROM ia_request_results WHERE scope_key=? AND operation='provider_claim' AND request_id=?", (self.store._scope(scope), claim_id))
        return ProviderClaim.model_validate_json(row[0]) if row else None

    def claim(self, proposed: ProviderClaim, budget: AdmissionBudget, *, validate: Callable[[], None], _probe_only=False) -> ProviderClaim:
        """Fresh policy/connection validation is inside the owning scope CAS."""
        if proposed.state != "reserved" or proposed.response_started or proposed.delivered_delta:
            raise PolicyDenied("invalid_provider_claim")
        if proposed.group_key != provider_group_key(self.store.profile_home, proposed.provider):
            # A caller cannot invent distinct accounts/families to evade limits.
            raise PolicyDenied("provider_limit_identity_unverified")
        with admission_boundary(self.base_home):
            if self.get_claim(proposed.scope, proposed.claim_id) is not None:
                raise PolicyDenied("provider_request_already_claimed")
            claims = [row for row in self._all("provider_claim") if row.group_key == proposed.group_key]
            snapshots = [row for row in self._all("provider_limit") if row.group_key == proposed.group_key]
            now = _date(self.now())
            recent = [row for row in claims if now - _date(row.created_at) < timedelta(seconds=60) and row.state != "cancelled"]
            active = [row for row in claims if row.state in {"reserved", "started"} or row.state == "unknown" and not row.stop_acknowledged]
            if any(row.claim_id == proposed.claim_id for row in claims):
                raise PolicyDenied("provider_request_already_claimed")
            known = any(now - _date(row.observed_at) <= timedelta(seconds=60) and any(bucket.remaining is not None for bucket in row.buckets) for row in snapshots)
            captured_budgets = [budget, *(row.admission_budget for row in recent), *(row.admission_budget for row in active if row not in recent)]
            request_cap = min(value.requests_per_minute for value in captured_budgets)
            token_cap = min(value.tokens_per_minute for value in captured_budgets)
            concurrency_cap = min(value.max_concurrent for value in captured_budgets)
            costs = [value.max_cost_microusd_per_minute for value in captured_budgets if value.max_cost_microusd_per_minute is not None]
            cost_cap = min(costs) if costs else None
            if len(active) >= min(concurrency_cap, 1 if not known else concurrency_cap):
                raise ResourceBusy("Shared provider concurrency is occupied")
            if len(recent) >= request_cap:
                raise ResourceBusy("Local shared request budget is exhausted")
            if proposed.reserved_tokens + sum(row.measured_tokens if row.measured_tokens is not None else row.reserved_tokens for row in recent) > token_cap:
                raise ResourceBusy("Local shared token budget is exhausted")
            if proposed.reserved_output_tokens > budget.max_output_tokens:
                raise PolicyDenied("provider_output_budget_exceeded")
            if cost_cap is not None:
                if proposed.reserved_cost_microusd is None or any(row.measured_cost_microusd is None and row.reserved_cost_microusd is None for row in recent):
                    raise PolicyDenied("provider_cost_metadata_required")
                cost = sum(row.measured_cost_microusd if row.measured_cost_microusd is not None else row.reserved_cost_microusd for row in recent)
                if cost + proposed.reserved_cost_microusd > cost_cap:
                    raise ResourceBusy("Local shared cost budget is exhausted")
            for snapshot in snapshots:
                if snapshot.action_required:
                    raise PolicyDenied("provider_billing_action_required")
                if snapshot.retry_at and _date(snapshot.retry_at) > now:
                    raise ResourceBusy("Provider Retry-After cooldown is active")
                if now - _date(snapshot.observed_at) > timedelta(seconds=60):
                    continue  # Stale means unknown; never refill the limit.
                pending = [row for row in active if row.claim_id != snapshot.observed_request_id]
                pending += [row for row in recent if row.state == "completed" and _date(row.created_at) > _date(snapshot.observed_at)]
                for bucket in snapshot.buckets:
                    if bucket.remaining is None or bucket.reset_at and _date(bucket.reset_at) <= now:
                        continue
                    need = 1 + len(pending) if bucket.resource == "requests" else (
                        proposed.reserved_output_tokens + sum(row.reserved_output_tokens for row in pending) if bucket.resource == "output_tokens" else
                        proposed.reserved_input_tokens + sum(row.reserved_input_tokens for row in pending) if bucket.resource == "input_tokens" else
                        proposed.reserved_tokens + sum(row.reserved_tokens for row in pending))
                    if need > bucket.remaining:
                        raise ResourceBusy("Known provider " + bucket.resource + " limit is exhausted")
            with self.store.transaction(write=not _probe_only):
                validate()
                binding = self.store.get_binding(proposed.scope)
                current = self.store.get_permission_state(proposed.scope)
                if binding is None or binding.tombstoned_at or current["revision"] != proposed.permission_revision or current["controlEpoch"] != proposed.control_epoch:
                    raise PolicyDenied("provider_scope_authority_changed")
                if not _probe_only:
                    self._put(proposed.scope, "provider_claim", proposed.claim_id, proposed.model_copy(update={"admission_budget": budget}))
            return proposed.model_copy(update={"admission_budget": budget})

    def check_available(self, proposed, budget, *, validate):
        self.claim(proposed, budget, validate=validate, _probe_only=True)

    def update(self, scope: Scope, claim_id: str, *, state=None, delivered_delta=False,
               measured_tokens=None, measured_cost_microusd=None, error_code=None, acknowledged=False, validate=None):
        with admission_boundary(self.base_home), self.store.transaction():
            if validate is not None:
                validate()
            value = self.get_claim(scope, claim_id)
            if value is None:
                raise PolicyDenied("unknown_provider_claim")
            if state == "cancelled" and (value.response_started or value.state != "reserved"):
                if not acknowledged:
                    raise PolicyDenied("provider_stop_acknowledgement_required")
                state = "unknown"  # Request/usage uncertainty stays charged.
            if value.state in {"completed", "cancelled"}:
                # Visible scrubber output can arrive after a successfully
                # exhausted SDK iterator. This monotone receipt fact changes
                # neither terminal state, usage, reservation nor authority.
                if (value.state == "completed" and state is None and delivered_delta is True
                    and measured_tokens is None and measured_cost_microusd is None
                    and error_code is None and acknowledged is False):
                    if value.delivered_delta:
                        return value
                    updated = value.model_copy(update={"delivered_delta": True, "updated_at": self.now()})
                    self._put(scope, "provider_claim", claim_id, updated)
                    return updated
                raise PolicyDenied("provider_claim_terminal")
            update = {"updated_at": self.now(), "delivered_delta": value.delivered_delta or delivered_delta}
            if acknowledged:
                update["stop_acknowledged"] = True
            if state is not None:
                if state not in {"started", "completed", "cancelled", "unknown"}:
                    raise PolicyDenied("invalid_provider_claim_state")
                update.update(state=state, response_started=value.response_started or state == "started")
            if measured_tokens is not None:
                update["measured_tokens"] = measured_tokens
            if measured_cost_microusd is not None:
                update["measured_cost_microusd"] = measured_cost_microusd
            if error_code is not None:
                update["error_code"] = error_code
            updated = ProviderClaim.model_validate_json(canonical_json(value.model_copy(update=update)))
            self._put(scope, "provider_claim", claim_id, updated)
            return updated

    def observe(self, scope: Scope, claim_id: str, headers: Mapping[str, str], *, status_code=None, error_code=None):
        with admission_boundary(self.base_home), self.store.transaction():
            claim = self.get_claim(scope, claim_id)
            if claim is None:
                raise PolicyDenied("unknown_provider_claim")
            snapshot = parse_response_limits(claim.provider, headers, observed_at=self.now(), request_id=claim_id, status_code=status_code, error_code=error_code)
            snapshot = snapshot.model_copy(update={"group_key": claim.group_key})
            # A receipt per actual response prevents another model response
            # with a higher family quota from erasing a conservative bound.
            self._put(scope, "provider_limit", claim_id, snapshot)
            return snapshot

    def limits(self, provider: str):
        with admission_boundary(self.base_home):
            group = provider_group_key(self.store.profile_home, provider)
            values = [row for row in self._all("provider_limit", include_stale=True) if row.group_key == group]
        now = _date(self.now())
        return [{**value.model_dump(mode="json", by_alias=True),
                 "stale": now - _date(value.observed_at) > timedelta(seconds=60)} for value in values[-64:]]

    def selection_loads(self, providers):
        """Return only persisted local-claim counts and fresh reported headroom.

        Missing or stale provider headers stay unknown. Local claims are
        explicitly separate from account/project quota observations.
        """
        provider_groups = {provider: provider_group_key(self.store.profile_home, provider)
            for provider in dict.fromkeys(providers) if isinstance(provider, str) and provider}
        if not provider_groups:
            return {}
        with admission_boundary(self.base_home):
            claims = self._all("provider_claim", include_stale=True)
            snapshots = self._all("provider_limit", include_stale=True)
        now = _date(self.now())
        results = {}
        for provider, group in provider_groups.items():
            grouped_claims = [row for row in claims if row.group_key == group]
            recent = [row for row in grouped_claims
                if row.state != "cancelled" and now - _date(row.created_at) < timedelta(seconds=60)]
            active = [row for row in grouped_claims if row.state in {"reserved", "started"}
                or row.state == "unknown" and not row.stop_acknowledged]
            fresh = [row for row in snapshots if row.group_key == group
                and now - _date(row.observed_at) <= timedelta(seconds=60)]
            fresh.sort(key=lambda row: _date(row.observed_at), reverse=True)
            ratios = []
            for snapshot in fresh:
                for bucket in snapshot.buckets:
                    if bucket.limit is not None and bucket.limit > 0 and bucket.remaining is not None:
                        ratios.append((bucket.remaining * 10000) // bucket.limit)
            observed = fresh[0] if fresh else None
            results[provider] = {
                "activeClaims": len(active),
                "recentLocalClaims": len(recent),
                "observedSource": "response_headers" if ratios else "unknown",
                "observedAt": observed.observed_at if observed and ratios else None,
                "remainingHeadroomBasisPoints": min(ratios) if ratios else None,
            }
        return results
