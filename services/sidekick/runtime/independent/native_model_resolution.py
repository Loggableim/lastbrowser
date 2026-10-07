"""Validated, turn-scoped model route receipts for native chat."""
from __future__ import annotations

from typing import Literal
from pydantic import Field, model_validator

from .contracts import Contract, Scope, Ref
from .model_selection import ModelPair

OLLAMA_SUBSCRIPTION_FALLBACK_MODELS = frozenset({
    "gemma4:31b", "gpt-oss:120b", "gpt-oss:20b", "nemotron-3-nano:30b",
    "nemotron-3-super", "nemotron-3-ultra",
})


class NativeModelResolution(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    stream_id: Ref
    requested: ModelPair
    effective: ModelPair
    fallback_applied: bool = False
    fallback_reason_code: Literal["ollama_subscription_required"] | None = None
    fallback_attempts: int = Field(default=0, ge=0, le=1)

    @model_validator(mode="after")
    def _coherent(self):
        if self.fallback_applied != (self.fallback_attempts == 1):
            raise ValueError("fallback attempt does not match its status")
        if self.fallback_applied != (self.fallback_reason_code is not None):
            raise ValueError("fallback reason does not match its status")
        if not self.fallback_applied:
            if self.requested != self.effective:
                raise ValueError("unmodified route must preserve the requested model")
            return self
        if (self.requested.provider != "ollama-cloud" or self.effective.provider != "ollama-cloud"
                or self.effective.model not in OLLAMA_SUBSCRIPTION_FALLBACK_MODELS):
            raise ValueError("fallback is outside the approved Ollama Cloud model set")
        return self


def publish_native_model_resolution(context, requested: ModelPair, effective: ModelPair, *,
                                    fallback_applied=False, fallback_reason_code=None,
                                    fallback_attempts=0):
    """Persist then publish a route receipt on the exact native turn stream."""
    from web.api import config
    from web.api.turn_journal import append_turn_journal_event_for_stream

    receipt = NativeModelResolution(scope=context.scope, stream_id=context.stream_id,
        requested=requested, effective=effective, fallback_applied=fallback_applied,
        fallback_reason_code=fallback_reason_code, fallback_attempts=fallback_attempts)
    data = receipt.model_dump(mode="json", by_alias=True)
    with config.STREAMS_LOCK:
        channel = config.STREAMS.get(context.stream_id)
    if channel is None:
        raise RuntimeError("native_model_resolution_stream_missing")
    append_turn_journal_event_for_stream(context.session_id, context.stream_id,
        {"event": "nativeModelResolution", "data": data},
        session_dir=context.sessions_dir)
    channel.put_nowait(("nativeModelResolution", data))
    return receipt
