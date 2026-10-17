"""FastAPI gateway for Free-Tier Router M1 (#320)."""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, Header, Request, Response
from pydantic import BaseModel, Field

from app.config import get_settings
from app.litellm_client import LiteLLMClient
from app.policy import decide
from app.queues import InMemoryQueues, QueueBackend
from app.telemetry import Timer, metrics_payload, record, record_error, snapshot

queues: QueueBackend
llm: LiteLLMClient


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global queues, llm
    settings = get_settings()
    # Prefer in-memory unless REDIS_URL is reachable; M1 tests never need Redis.
    use_memory = True
    if settings.redis_url and not settings.redis_url.startswith("memory://"):
        try:
            import redis.asyncio as redis

            client = redis.from_url(settings.redis_url, decode_responses=True)
            await client.ping()
            from app.queues import RedisQueues

            queues = RedisQueues(client)
            use_memory = False
        except Exception:
            use_memory = True
    if use_memory:
        queues = InMemoryQueues()
    llm = LiteLLMClient(settings=settings, dry_run=True)
    yield
    await queues.close()


app = FastAPI(title="LastBrowser Free-Tier Router", version="0.1.0-m1", lifespan=lifespan)


class ChatRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=100_000)
    # Optional client hint; real auth/opt-in comes later (M4)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    job_id: str
    tier: str
    queue: str
    model: str
    reasoning: str
    think: bool | str
    confidence: float
    reason: str
    result: dict[str, Any]


@app.get("/health")
async def health() -> dict[str, Any]:
    settings = get_settings()
    depths = {
        "high": await queues.depth("high"),
        "standard": await queues.depth("standard"),
        "low": await queues.depth("low"),
    }
    return {
        "ok": True,
        "service": "free-tier-router",
        "milestone": "M1",
        "backend": "ollama_cloud",
        "models": settings.models_dict(),
        "daily_budget_eur": settings.daily_budget_eur,
        "api_key_configured": bool(settings.ollama_cloud_api_key),
        "queue_depths": depths,
        "stats": snapshot(),
    }


@app.get("/metrics")
async def metrics() -> Response:
    body, ctype = metrics_payload()
    return Response(content=body, media_type=ctype)


@app.post("/v1/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    x_opt_in: Optional[str] = Header(default="false", alias="X-Opt-In"),
) -> ChatResponse:
    timer = Timer()
    opt_in = str(x_opt_in).lower() in {"1", "true", "yes"}
    decision = decide(body.prompt, opt_in=opt_in)
    try:
        job_id = await queues.enqueue(
            decision.queue,
            {
                "tier": decision.tier,
                "model": decision.model,
                "reasoning": decision.reasoning,
                "think": decision.think,
                "opt_in": opt_in,
                "prompt_chars": len(body.prompt),
            },
        )
        result = await llm.complete(
            model=decision.model,
            prompt=body.prompt,
            tier=decision.tier,
            think=decision.think,
            reasoning=decision.reasoning,
        )
        status = "ok" if result.get("ok") else "error"
        if status != "ok":
            record_error(str(result.get("error", "unknown")))
        record(decision.tier, decision.queue, status, timer.seconds())
        return ChatResponse(
            job_id=job_id,
            tier=decision.tier,
            queue=decision.queue,
            model=decision.model,
            reasoning=decision.reasoning,
            think=decision.think,
            confidence=decision.confidence,
            reason=decision.reason,
            result=result,
        )
    except Exception as exc:  # noqa: BLE001
        record_error(type(exc).__name__)
        record(decision.tier, decision.queue, "error", timer.seconds())
        raise


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "free-tier-router", "docs": "/docs", "issue": "#320"}
