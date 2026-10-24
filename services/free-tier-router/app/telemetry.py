"""Simple counters + Prometheus text exposition."""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import DefaultDict

from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest

_lock = threading.Lock()
_registry = CollectorRegistry()

REQUESTS = Counter(
    "ftr_requests_total",
    "Total chat requests",
    ["tier", "queue", "status"],
    registry=_registry,
)
LATENCY = Histogram(
    "ftr_request_latency_seconds",
    "Request handling latency",
    ["tier"],
    registry=_registry,
)
ERRORS = Counter(
    "ftr_errors_total",
    "Errors",
    ["kind"],
    registry=_registry,
)

# lightweight in-process stats for /health
_stats: DefaultDict[str, float] = defaultdict(float)


def record(tier: str, queue: str, status: str, latency_s: float) -> None:
    REQUESTS.labels(tier=tier, queue=queue, status=status).inc()
    LATENCY.labels(tier=tier).observe(latency_s)
    with _lock:
        _stats["requests"] += 1
        if status != "ok":
            _stats["errors"] += 1
        _stats["last_latency_ms"] = latency_s * 1000


def record_error(kind: str) -> None:
    ERRORS.labels(kind=kind).inc()
    with _lock:
        _stats["errors"] += 1


def metrics_payload() -> tuple[bytes, str]:
    return generate_latest(_registry), CONTENT_TYPE_LATEST


def snapshot() -> dict[str, float]:
    with _lock:
        return dict(_stats)


class Timer:
    def __init__(self) -> None:
        self._t0 = time.perf_counter()

    def seconds(self) -> float:
        return time.perf_counter() - self._t0
