"""Bounded local latency observations; never contains conversation data."""
from __future__ import annotations

import json
import logging
import math
import os
import statistics
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger(__name__)
_LOCK = threading.Lock()
_MAX_AGE = 7 * 86400
_TIMINGS = ("ttft_ms", "provider_ttft_ms", "preflight_ms", "total_ms")
_OPTIONAL_METRICS = ("output_chars", "output_tokens", "tokens_per_sec")


def _path(profile_home):
    home = Path(profile_home).resolve(strict=True)
    target = home / "state" / "quickchat-latency.json"
    if not target.resolve().is_relative_to(home):
        raise ValueError("Quickchat metrics path escaped profile")
    return target


def _identifier(value):
    return isinstance(value, str) and 0 < len(value) <= 256 and not any(ord(c) < 32 for c in value)


def _read(path):
    try:
        with path.open("rb") as source:
            raw = source.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            return []
        data = json.loads(raw)
        cutoff = time.time() - _MAX_AGE
        records = data.get("models", []) if isinstance(data, dict) else []
        result = []
        for row in records[:100] if isinstance(records, list) else []:
            if not isinstance(row, dict) or not all(_identifier(row.get(k)) for k in ("provider", "model")):
                continue
            samples = []
            for sample in row.get("samples", [])[-20:] if isinstance(row.get("samples"), list) else []:
                if not isinstance(sample, dict) or type(sample.get("at")) not in {int, float}:
                    continue
                if not cutoff <= sample["at"] <= time.time() + 60:
                    continue
                if not all(type(sample.get(k)) in {int, float} and math.isfinite(sample[k])
                           and 0 <= sample[k] <= 3600000 for k in _TIMINGS):
                    continue
                row = {k: sample[k] for k in ("at", *_TIMINGS)}
                for key in _OPTIONAL_METRICS:
                    value = sample.get(key)
                    if type(value) in {int, float} and math.isfinite(value) and value >= 0:
                        row[key] = value
                if sample.get("usage_estimated") is True:
                    row["usage_estimated"] = True
                samples.append(row)
            if samples:
                result.append({"provider": row["provider"], "model": row["model"], "samples": samples})
        return result
    except (OSError, ValueError, TypeError):
        return []


@contextmanager
def _writer_lock(path):
    """OS-owned lock releases on worker death, unlike stale sentinel files."""
    lock_path = path.with_suffix(".lock")
    if not lock_path.resolve().is_relative_to(path.parent.resolve()):
        raise ValueError("Quickchat metrics lock escaped profile")
    with _LOCK, lock_path.open("a+b") as lock:
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            if lock.read(1) == b"":
                lock.write(b"0")
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            try:
                yield
            finally:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)


def _estimate_output_tokens(output_chars):
    chars = int(output_chars) if type(output_chars) in {int, float} else 0
    if chars <= 0:
        return 0
    return max(1, (chars + 3) // 4)


def record_latency(profile_home, *, provider, model, ttft_ms, provider_ttft_ms,
                   preflight_ms, total_ms, output_chars=None, output_tokens=None,
                   usage_estimated=False):
    """Best effort after the answer; lock contention must never delay chat."""
    if not _identifier(provider) or not _identifier(model):
        return
    values = dict(ttft_ms=ttft_ms, provider_ttft_ms=provider_ttft_ms,
                  preflight_ms=preflight_ms, total_ms=total_ms)
    if not all(type(v) in {int, float} and math.isfinite(v) and 0 <= v <= 3600000 for v in values.values()):
        return
    sample = {"at": time.time(), **{k: round(v, 2) for k, v in values.items()}}
    chars = None
    if type(output_chars) in {int, float} and math.isfinite(output_chars) and output_chars >= 0:
        chars = int(output_chars)
        sample["output_chars"] = chars
    tokens = None
    if type(output_tokens) in {int, float} and math.isfinite(output_tokens) and output_tokens >= 0:
        tokens = int(output_tokens)
    elif chars is not None:
        tokens = _estimate_output_tokens(chars)
        usage_estimated = True
    if tokens is not None and tokens > 0:
        sample["output_tokens"] = tokens
        gen_ms = max(total_ms - ttft_ms, 1.0)
        sample["tokens_per_sec"] = round(tokens / (gen_ms / 1000.0), 2)
    if usage_estimated:
        sample["usage_estimated"] = True
    logger.info("quickchat_latency %s", json.dumps({"provider": provider, "model": model, **sample}))
    try:
        path = _path(profile_home)
        path.parent.mkdir(parents=True, exist_ok=True)
        with _writer_lock(path):
            rows = _read(path)
            previous = next((r for r in rows if r["provider"] == provider and r["model"] == model), None)
            rows = [r for r in rows if r is not previous]
            rows.append({"provider": provider, "model": model,
                         "samples": [*(previous["samples"] if previous else []), sample][-20:]})
            rows.sort(key=lambda r: r["samples"][-1]["at"], reverse=True)
            temporary = path.with_name(".quickchat-latency-" + uuid.uuid4().hex + ".tmp")
            try:
                with temporary.open("x", encoding="utf-8") as target:
                    json.dump({"schemaVersion": 1, "models": rows[:100]}, target)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
    except (OSError, ValueError):
        logger.debug("Quickchat latency observation could not be persisted")


def read_latency_summaries(profile_home):
    """Caller supplies resolved profile home; freshness is seven days."""
    try:
        rows = _read(_path(profile_home))
    except (OSError, ValueError):
        rows = []
    models = []
    for row in rows:
        samples = row["samples"]
        medians = {"median_" + key: round(statistics.median(s[key] for s in samples), 2) for key in _TIMINGS}
        models.append({"provider": row["provider"], "model": row["model"], "samples": len(samples),
            **medians, "median_first_visible_ttft_ms": medians["median_ttft_ms"],
            "last_measured_at": samples[-1]["at"]})
    return {"schemaVersion": 1, "models": models}
