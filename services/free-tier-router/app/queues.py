"""Redis priority queues: high / standard / low. In-memory fallback for tests."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Protocol

from app.policy import QueueName


class QueueBackend(Protocol):
    async def enqueue(self, queue: QueueName, payload: dict[str, Any]) -> str: ...
    async def depth(self, queue: QueueName) -> int: ...
    async def close(self) -> None: ...


class InMemoryQueues:
    """Test double — no Redis required."""

    def __init__(self) -> None:
        self._q: dict[QueueName, list[dict[str, Any]]] = {
            "high": [],
            "standard": [],
            "low": [],
        }

    async def enqueue(self, queue: QueueName, payload: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())
        item = {"id": job_id, "ts": time.time(), **payload}
        self._q[queue].append(item)
        return job_id

    async def depth(self, queue: QueueName) -> int:
        return len(self._q[queue])

    async def close(self) -> None:
        return None


class RedisQueues:
    """Redis lists keyed free-tier:q:{high|standard|low}."""

    def __init__(self, redis_client: Any) -> None:
        self._r = redis_client

    def _key(self, queue: QueueName) -> str:
        return f"free-tier:q:{queue}"

    async def enqueue(self, queue: QueueName, payload: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())
        item = {"id": job_id, "ts": time.time(), **payload}
        await self._r.rpush(self._key(queue), json.dumps(item))
        return job_id

    async def depth(self, queue: QueueName) -> int:
        return int(await self._r.llen(self._key(queue)))

    async def close(self) -> None:
        await self._r.aclose()
