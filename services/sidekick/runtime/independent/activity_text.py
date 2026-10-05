"""Pure, bounded status projection. Snapshot data is the only authority.

Unscoped dict rows are already scoped by the snapshot producer; explicit foreign
scope and references to known foreign runs are always rejected defensively.
No transcript, artifact, provider or filesystem lookup occurs here.
"""
from __future__ import annotations

import re

from .contracts import ActivitySnapshot

_UNKNOWN = "unbekannt/unknown"
_TERMINAL = {"completed", "failed", "cancelled", "interrupted"}


def _text(value, limit=160):
    if value is None or not isinstance(value, (str, int, float, bool)):
        return _UNKNOWN
    value = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value)).strip()
    return value[:limit] + ("…" if len(value) > limit else "") if value else _UNKNOWN


def summarize_activity(activity: ActivitySnapshot) -> str:
    """DE/EN factual summary, at most 4096 UTF-8 bytes and 20 rows/category."""
    lines = [f"Arbeitsstand / Activity: {activity.source_state}; Stand/as of {_text(activity.observed_at)}"]
    if activity.last_successful_at:
        lines.append("Letzter belegter Stand / Last successful: " + _text(activity.last_successful_at))
    native = activity.native_chat_observation
    lines.append("Normale Chats / Native chat source: " +
                 (f"{native.source_state}; {_text(native.observed_at)}" if native else _UNKNOWN))
    scope = activity.scope
    runs = [r for r in activity.runs if r.scope == scope]
    run_ids = {r.run_id for r in runs}
    foreign_ids = {r.run_id for r in activity.runs if r.scope != scope}
    foreign_sessions = {r.target_session_id for r in activity.runs if r.scope != scope and r.target_session_id}
    progress = {}
    for p in activity.run_progress:
        run = next((r for r in runs if r.run_id == p.run_id), None)
        if p.scope == scope and run is not None and p.target_session_id == run.target_session_id:
            old = progress.get(p.run_id)
            if old is None or p.progress_revision > old.progress_revision:
                progress[p.run_id] = p

    def section(label, rows, render):
        lines.append(f"{label}: {len(rows)}")
        if len(rows) > 20:
            lines.append(f"{len(rows) - 20} ältere Einträge ausgelassen / older rows omitted")
        for row in rows[-20:]:
            lines.extend(render(row))

    def counters(c, budget=None):
        values = [("Tools", c.tool_calls, getattr(budget, "max_tool_calls", None)),
                  ("Requests", c.provider_requests, getattr(budget, "max_provider_requests", None)),
                  ("Aktive Sekunden / Active seconds", c.active_seconds, getattr(budget, "max_active_seconds", None)),
                  ("Gemessene Tokens / Measured tokens", c.measured_tokens, getattr(budget, "max_measured_tokens", None))]
        return "; ".join(f"{label}: {_text(value)}" + (f"/{maximum}" if maximum is not None else "")
                         for label, value, maximum in values)

    def render_run(run):
        result = [f"Lauf / Run {run.run_id}: {run.state}; Revision {run.state_revision}; {_text(run.updated_at)}"]
        if run.reason_code:
            result.append("Grund / Reason: " + _text(run.reason_code))
        if run.waiting_for:
            wait = run.waiting_for
            labels = {"login": "Anmeldung / Login", "approval": "Freigabe / Approval",
                      "resource": "Ressource / Resource", "clarification": "Rückfrage / Clarification"}
            result.append(f"Wartet auf / Waiting for: {labels[wait.kind]}; ID {_text(wait.resource_id)}"
                          + (f"; Ablauf/expiry {_text(wait.expires_at)}" if wait.expires_at else ""))
            if wait.kind == "clarification":
                result.append("Fragetext im Snapshot nicht vorhanden / Question text not supplied")
        p = progress.get(run.run_id)
        result.append(counters(run.counters, p.budget if p else None))
        if p:
            result.append(f"Belegter Teilstand / Observed progress: {_text(p.observed_at)}; {p.run_state}; Revision {p.progress_revision}")
            if p.counters != run.counters:
                result.append("Zähler am Teilstand / Progress counters: " + counters(p.counters, p.budget))
            if p.text:
                result.append("Beobachteter Antworttext / Observed output: " + _text(p.text, 512))
            if p.text_truncated or len(p.text) > 512:
                result.append("Teiltext gekürzt / Partial text truncated")
        elif run.state in _TERMINAL:
            result.append("Kein Ergebnistext im Snapshot / No result text supplied")
        if run.result_ref:
            result.append("Ergebnisreferenz / Result reference: " + _text(run.result_ref, 256))
        return result

    def owned(row):
        if not isinstance(row, dict):
            return False
        explicit = row.get("scope")
        if explicit is not None and explicit != scope.model_dump(by_alias=True) and explicit != scope:
            return False
        return row.get("runId") not in foreign_ids and row.get("sessionId") not in foreign_sessions

    section("Läufe / Runs", runs, render_run)
    chats = [row for row in activity.active_chats if owned(row) and isinstance(row.get("sessionId"), str) and row["sessionId"]]
    states = {r.target_session_id: r.state for r in runs if r.target_session_id}
    section("Arbeitschats / Work chats", chats, lambda row: [
        f"Chat {_text(row['sessionId'], 200)}: {_text(row.get('title'))}; "
        f"{_text(row.get('state') or states.get(row['sessionId']))}; {_text(row.get('observedAt'))}"])
    schedules = [row for row in activity.schedules if owned(row)]
    section("Zeitpläne / Schedules", schedules, lambda row: [
        f"Definition {_text(row.get('definitionId'))}: enabled={_text(row.get('enabled'))}; "
        f"nächster Termin/next {_text(row.get('nextRunAt'))}; Zone {_text(row.get('timezone'))}; Quelle/source {_text(row.get('sourceStatus'))}"])
    approvals = [a for a in activity.approvals if a.scope == scope and a.run_id in run_ids]
    section("Freigaben / Approvals", approvals, lambda a: [
        f"{a.approval_id}: {a.state}; Run {a.run_id}; {_text(a.effect)}; Ablauf/expiry {_text(a.expires_at)}"])
    text = "\n".join(lines)
    if len(text.encode("utf-8")) <= 4096:
        return text
    suffix = "\nWeitere Details wegen Textlimit ausgelassen / Further details omitted (text limit)"
    prefix = text.encode("utf-8")[:4096 - len(suffix.encode("utf-8"))].decode("utf-8", errors="ignore")
    return prefix + suffix
