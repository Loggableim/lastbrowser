"""Scoped definitions on the native Cron clock; callbacks only enqueue."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Callable, Iterable
from zoneinfo import ZoneInfo

from croniter import croniter

from .contracts import AgentDefinition, ScheduleSpec, Scope, TaskDispatchRequest
from .policy import PolicyDenied
from .store import ResourceBusy, StoreError

_LOG = logging.getLogger(__name__)


def validate_schedule(schedule: ScheduleSpec):
    # Five fields deliberately: one-minute native tick cannot promise seconds.
    if len(schedule.cron_expression.split()) != 5 or not croniter.is_valid(schedule.cron_expression):
        raise ValueError("Schedule requires a valid five-field cron expression")


def next_occurrence(schedule: ScheduleSpec, after: datetime) -> datetime:
    """Return the next valid UTC occurrence: skip gaps, first fold only."""
    validate_schedule(schedule)
    if after.tzinfo is None:
        raise ValueError("Schedule cursor must be timezone-aware")
    zone = ZoneInfo(schedule.timezone)
    cursor = croniter(schedule.cron_expression, after.astimezone(zone).replace(tzinfo=None))
    for _ in range(10000):
        wall = cursor.get_next(datetime)
        first = wall.replace(tzinfo=zone, fold=0)
        utc = first.astimezone(timezone.utc)
        if utc.astimezone(zone).replace(tzinfo=None) != wall:
            continue  # spring gap has no real occurrence
        if utc > after.astimezone(timezone.utc):
            return utc
    raise ValueError("No valid occurrence within the bounded schedule search")


def _stamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse(value: str) -> datetime:
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None or result.utcoffset().total_seconds() != 0:
        raise ValueError("Native independent occurrence must be UTC")
    return result


class IndependentScheduleAdapter:
    """No thread/clock: registered with runtime.cron.scheduler.tick.

    Host supplies managers for authoritative registered profile Homes, including
    inactive profiles. It must not derive these from the selected UI profile.
    """
    def __init__(self, managers: Callable[[], Iterable]):
        self.managers = managers

    def install(self):
        from runtime.cron.scheduler import register_independent_enqueue_hook
        register_independent_enqueue_hook(self.tick)

    def _project(self, manager, definition: AgentDefinition, now: datetime):
        from runtime.cron.jobs import read_scoped_jobs, update_scoped_independent_job
        binding = manager.store.get_binding(definition.scope)
        if binding is not None and binding.tombstoned_at is not None and not definition.enabled:
            # The native Space directory may already be gone on a removal
            # retry. Its fixed profile and archived definition still identify
            # the exact existing Cron projection to disable.
            profile_home = manager.store.profile_home
        else:
            profile_home = manager.resolver.resolve(definition.scope).profile_home
        existing = next((j for j in read_scoped_jobs(profile_home) if j.get("id") == "independent:" + definition.definition_id), None)
        same_schedule = existing and (existing.get("independent_ref") or {}).get("scheduleRevision") == (definition.schedule.revision if definition.schedule else None)
        next_at = existing.get("next_run_at") if same_schedule else None
        if definition.enabled and definition.schedule and not next_at:
            next_at = _stamp(next_occurrence(definition.schedule, now))
        record = {"id": "independent:" + definition.definition_id, "job_type": "independent_agent", "name": definition.title, "enabled": bool(definition.enabled and definition.schedule), "schedule": {"kind": "independent_agent", **(definition.schedule.model_dump(mode="json", by_alias=True) if definition.schedule else {})}, "independent_ref": {"schemaVersion": 1, "scope": definition.scope.model_dump(mode="json", by_alias=True), "definitionId": definition.definition_id, "definitionRevision": definition.revision, "scheduleRevision": definition.schedule.revision if definition.schedule else None}, "next_run_at": next_at if definition.enabled and definition.schedule else None}
        update_scoped_independent_job(profile_home, record)
        return record

    def retire_scope(self, manager, scope: Scope) -> tuple[str, ...]:
        """Disable actual native projections, retaining failed writes for retry."""
        from runtime.cron.jobs import read_scoped_jobs
        definitions = manager.store.list_definitions(scope)
        try:
            existing_ids = {job.get("id") for job in read_scoped_jobs(manager.store.profile_home)}
        except (OSError, ValueError):
            return tuple(definition.definition_id for definition in definitions if definition.schedule is not None)
        pending = []
        for definition in definitions:
            if definition.enabled:
                raise PolicyDenied("retired_definition_still_enabled")
            if definition.schedule is None and "independent:" + definition.definition_id not in existing_ids:
                continue
            try:
                self._project(manager, definition, datetime.now(timezone.utc))
                for item in manager.store.pending_outbox():
                    if item["kind"] == "schedule_projection" and item["payload"].get("definitionId") == definition.definition_id:
                        manager.store.finish_outbox(item["deliveryKey"], success=True)
            except (OSError, ValueError, StoreError, PermissionError):
                pending.append(definition.definition_id)
        return tuple(pending)

    def project_pending(self, manager, now: datetime):
        for item in manager.store.pending_outbox():
            if item["kind"] != "schedule_projection":
                continue
            try:
                # The newest revision wins even when old outbox entries replay.
                definition = manager.store.get_definition(item["payload"]["definitionId"])
                self._project(manager, definition, now)
                manager.store.finish_outbox(item["deliveryKey"], success=True)
            except (OSError, ValueError, StoreError, PermissionError) as exc:
                manager.store.finish_outbox(item["deliveryKey"], success=False, error_code="schedule_projection_failed")
                _LOG.warning("Schedule projection unavailable (%s)", type(exc).__name__)

    def tick(self, now: datetime) -> int:
        if now.tzinfo is None:
            raise ValueError("Cron clock must supply an aware time")
        enqueued = 0
        for manager in tuple(self.managers()):
            try:
                enqueued += self._tick_profile(manager, now)
            except (OSError, ValueError, StoreError, PermissionError) as exc:
                # One unavailable profile cannot suppress other scoped queues.
                _LOG.warning("Scoped Cron profile unavailable (%s)", type(exc).__name__)
        return enqueued

    def _tick_profile(self, manager, now):
        from runtime.cron.jobs import read_scoped_jobs, update_scoped_independent_job
        self.project_pending(manager, now)
        enqueued = 0
        for record in read_scoped_jobs(manager.store.profile_home):
            if record.get("job_type") != "independent_agent" or not record.get("enabled") or not record.get("next_run_at"):
                continue
            planned = _parse(record["next_run_at"])
            if planned > now:
                continue
            ref = record.get("independent_ref") or {}
            definition = manager.store.get_definition(ref.get("definitionId"))
            if not definition or not definition.enabled or not definition.schedule or definition.scope != Scope.model_validate(ref.get("scope")) or definition.revision != ref.get("definitionRevision") or definition.schedule.revision != ref.get("scheduleRevision"):
                continue
            manager.resolver.resolve(definition.scope)
            stamp = _stamp(planned)
            with manager.store.transaction():
                if manager.store.claim_schedule_occurrence(definition, stamp):
                    reason, run_id = "missed", None
                    if (now - planned).total_seconds() <= 60 or definition.schedule.missed_policy == "one_catch_up":
                        try:
                            permissions = manager.store.get_permission_state(definition.scope)
                            request = TaskDispatchRequest(client_request_id=uuid.uuid5(uuid.NAMESPACE_URL, f"lastbrowser:{definition.definition_id}:{definition.schedule.revision}:{stamp}").hex, scope=definition.scope, assistant_conversation_id=definition.activation_conversation_id, source_message_id=definition.activation_message_id, kind="start_agent", title=definition.title, instruction=definition.instruction, desired_result=definition.desired_result, definition_id=definition.definition_id, definition_revision=definition.revision, expected_permission_revision=permissions["revision"])
                            result = manager.enqueue(request, provider=definition.provider, permissions=definition.permission_scope, authorized_definition=definition)
                            reason, run_id = "enqueued", result.run_id
                            enqueued += 1
                        except ResourceBusy:
                            reason = "previous_run_active"
                        except (PolicyDenied, StoreError, PermissionError, ValueError):
                            reason = "authorization_unavailable"
                    manager.store.finish_schedule_occurrence(definition, stamp, reason, run_id=run_id)
                    manager.store.append_event(definition.scope, "schedule", {"definitionId": definition.definition_id, "scheduleRevision": definition.schedule.revision, "plannedUtc": stamp, "outcome": reason, "runId": run_id})
            # Retrying after the SQLite commit observes the unique occurrence.
            updated = dict(record)
            updated["next_run_at"] = _stamp(next_occurrence(definition.schedule, now))
            update_scoped_independent_job(manager.store.profile_home, updated, expected_revision=definition.revision, expected_next_run=record["next_run_at"])
        return enqueued
