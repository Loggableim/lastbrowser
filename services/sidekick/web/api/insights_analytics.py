"""Read-only profile analytics from observed provider calls and legacy totals.

No model-name guessing, network pricing lookups, invented zero costs, or
assignment of a whole conversation's lifetime tokens to a calendar day.
"""
from __future__ import annotations

from collections import defaultdict
from contextlib import closing
from datetime import date, timedelta
import json
import math
from pathlib import Path
import sqlite3
import time


def _number(value):
    if value is None or isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) and result >= 0 else None
    except (TypeError, ValueError, OverflowError):
        return None


def _tokens(value):
    number = _number(value)
    return int(number) if number is not None else None


def _cost(record):
    status = str(record.get("cost_status") or "unknown")
    if status == "included" or record.get("billing_mode") == "subscription_included":
        return None, "unknown", True
    if "cost_usd" in record:
        amount = _number(record.get("cost_usd"))
        return amount, status if amount is not None and status in {"actual", "estimated"} else "unknown", False
    actual = _number(record.get("actual_cost_usd", record.get("actual_cost")))
    estimated = _number(record.get("estimated_cost_usd", record.get("estimated_cost")))
    # Old migrated columns defaulted to zero without knowing the price.
    if actual is not None and (actual > 0 or status == "actual"):
        return actual, "actual", False
    if estimated is not None and (estimated > 0 or status == "estimated"):
        return estimated, "estimated", False
    return None, "unknown", False


def _normalize(record, *, observed=False):
    count_in = _tokens(record.get("input_tokens"))
    count_out = _tokens(record.get("output_tokens"))
    known = (record.get("token_usage_known", 1) == 1) if observed else (
        (_number(record.get("api_call_count")) or 0) > 0 or (count_in or 0) + (count_out or 0) > 0)
    if not known:
        count_in = count_out = None
    cache = (_tokens(record.get("cache_read_tokens")) or 0) + (_tokens(record.get("cache_write_tokens")) or 0)
    # Legacy index stores prompt totals including cache already; state/ledger
    # stores uncached input separately. Callers identify their actual source.
    if record.get("_source") == "index":
        cache = 0
    cost, cost_kind, included = _cost(record)
    provider = record.get("provider") or record.get("billing_provider") or record.get("model_provider") or "unknown"
    return {"session_id": str(record.get("session_id") or record.get("id") or ""),
        "provider": str(provider), "model": str(record.get("model") or "unknown"),
        "input_tokens": count_in + cache if count_in is not None else None,
        "output_tokens": count_out, "cost": cost, "cost_kind": cost_kind,
        "subscription_included": included, "token_usage_known": known,
        "timestamp": _number(record.get("timestamp") or record.get("updated_at") or record.get("started_at") or record.get("created_at")) or 0,
        "message_count": _tokens(record.get("message_count")), "observed": observed,
        "model_source": record.get("model_source") or ("request_route" if observed else "legacy_session")}


def _summary(records):
    known_records = [record for record in records if record["token_usage_known"]]
    priced = [record for record in records if record["cost"] is not None and record["cost_kind"] != "unknown"]
    kinds = {record["cost_kind"] for record in priced}
    cost_kind = next(iter(kinds)) if len(kinds) == 1 else "mixed" if kinds else "unknown"
    total_in = sum(record["input_tokens"] or 0 for record in known_records) if known_records else None
    total_out = sum(record["output_tokens"] or 0 for record in known_records) if known_records else None
    return {"sessions": len({record["session_id"] for record in records}),
        "input_tokens": total_in, "output_tokens": total_out,
        "total_tokens": total_in + total_out if total_in is not None and total_out is not None else None,
        "token_usage_known": bool(known_records), "token_usage_complete": bool(records) and len(known_records) == len(records),
        "cost": round(sum(record["cost"] for record in priced), 6) if priced else None,
        "cost_kind": cost_kind, "cost_complete": bool(records) and len(priced) == len(records),
        "currency": "USD", "subscription_included": any(record["subscription_included"] for record in records)}


def build_profile_insights(home: Path, days: int, *, session_dirs=()) -> dict:
    home = home.resolve()
    now = time.time()
    first_day = date.fromtimestamp(now) - timedelta(days=days - 1)
    cutoff = time.mktime((first_day.year, first_day.month, first_day.day, 0, 0, 0, 0, 0, -1))
    warnings = []
    events, sessions = [], {}
    ledger_exists = False
    database = home / "state.db"
    if database.is_file():
        try:
            with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=1)) as connection:
                connection.row_factory = sqlite3.Row
                tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if "usage_events" in tables:
                    ledger_exists = True
                    events = [_normalize(dict(row), observed=True) for row in connection.execute(
                        "SELECT * FROM usage_events WHERE timestamp >= ? AND timestamp <= ?", (cutoff, now))]
                if "sessions" in tables:
                    for row in connection.execute("SELECT * FROM sessions"):
                        record = dict(row)
                        normalized = _normalize(record)
                        if normalized["session_id"] and cutoff <= normalized["timestamp"] <= now:
                            sessions[normalized["session_id"]] = normalized
        except sqlite3.Error:
            warnings.append("Die lokale Nutzungsdatenbank konnte nicht vollständig gelesen werden.")
    sources = set()
    if events or sessions:
        sources.add("state_db")
    directories = {home / "state" / "webui" / "sessions", home / "state" / "sessions", home / "sessions", *map(Path, session_dirs)}
    for parent in (home / "spaces", home / "workspaces"):
        if parent.is_dir():
            directories.update(path / "sessions" for path in parent.iterdir() if path.is_dir() and not path.is_symlink())
    for directory in directories:
        index = directory / "_index.json"
        if not index.is_file() or index.is_symlink() or index.stat().st_size > 16 * 1024 * 1024:
            continue
        try:
            entries = json.loads(index.read_text(encoding="utf-8"))
            if not isinstance(entries, list):
                continue
            sources.add("session_index")
            for record in entries:
                if not isinstance(record, dict):
                    continue
                normalized = _normalize({**record, "_source": "index"})
                sid = normalized["session_id"]
                if not sid or not cutoff <= normalized["timestamp"] <= now:
                    continue
                previous = sessions.get(sid)
                if previous is None or not previous["token_usage_known"] and normalized["token_usage_known"]:
                    sessions[sid] = normalized
        except (OSError, ValueError):
            warnings.append("Ein Sitzungsindex konnte nicht gelesen werden.")
    event_sessions = {record["session_id"] for record in events}
    legacy = [record for sid, record in sessions.items() if sid not in event_sessions]
    records = events + legacy
    observed_totals = defaultdict(int)
    for record in events:
        observed_totals[record["session_id"]] += (record["input_tokens"] or 0) + (record["output_tokens"] or 0)
    partial_legacy = {sid for sid in event_sessions if sid in sessions and
        (sessions[sid]["input_tokens"] or 0) + (sessions[sid]["output_tokens"] or 0) > observed_totals[sid]}
    if partial_legacy:
        warnings.append("Bei Sitzungen mit Einzelmessungen werden ausschließlich diese Aufrufe gezählt; ältere Teile derselben Sitzung sind nicht zeitlich rekonstruierbar.")
    if legacy:
        warnings.append("Ältere Werte sind Sitzungssummen; Anbieter/Modell entsprechen dem zuletzt gespeicherten Stand. Historische Modellwechsel und Tagesverbrauch sind dafür nicht rekonstruierbar.")
    if not ledger_exists:
        warnings.append("Einzelaufrufe werden erst ab dieser Version gespeichert; ältere Daten bleiben als Sitzungssummen sichtbar.")
    summary = _summary(records)
    groups = defaultdict(list)
    for record in records:
        groups[(record["provider"], record["model"])].append(record)
    models = [{"provider": provider, "model": model, **_summary(group),
        "model_attribution": next(iter({record["model_source"] for record in group}))
            if len({record["model_source"] for record in group}) == 1 else "mixed"}
        for (provider, model), group in sorted(groups.items())]
    daily = defaultdict(list)
    for event in events:
        daily[time.strftime("%Y-%m-%d", time.localtime(event["timestamp"]))].append(event)
    daily_tokens = [{"date": date, **_summary(group)} for date, group in sorted(daily.items())]
    if legacy and not daily_tokens:
        warnings.append("Tagesdiagramm nicht verfügbar: ältere Sitzungssummen werden keinem erfundenen Verbrauchstag zugeordnet.")
    if not summary["token_usage_complete"] and records:
        warnings.append("Tokenwerte sind unvollständig; fehlende Messungen werden nicht als null Verbrauch dargestellt.")
    if not summary["cost_complete"] and records:
        warnings.append("Kosten sind unvollständig. Abo-Nutzung hat keinen belegten Einzelpreis; fehlende Preise sind unbekannt.")
    return {"period_days": days, "data_source": "+".join(sorted(sources)) or "no_data",
        "window_type": "provider_calls_and_legacy_session_activity", "cutoff_ts": cutoff,
        "total_sessions": summary["sessions"],
        "total_messages": sum(record["message_count"] or 0 for record in sessions.values())
            if any((record["message_count"] or 0) > 0 for record in sessions.values()) else None,
        "total_input_tokens": summary["input_tokens"], "total_output_tokens": summary["output_tokens"],
        "total_tokens": summary["total_tokens"], "total_cost": summary["cost"],
        "token_usage_known": summary["token_usage_known"], "token_usage_complete": summary["token_usage_complete"],
        "cost_kind": summary["cost_kind"], "cost_complete": summary["cost_complete"],
        "currency": "USD", "subscription_included": summary["subscription_included"],
        "historical_data_complete": not bool(legacy or partial_legacy),
        "models": models, "daily_tokens": daily_tokens, "activity_by_day": [], "activity_by_hour": [],
        "warnings": list(dict.fromkeys(warnings))}
