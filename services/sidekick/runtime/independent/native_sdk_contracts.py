"""Immutable metadata for an accepted fixed native model, with no AUTO policy."""
from typing import Annotated, Literal
from pydantic import Field
from .contracts import Contract, Scope, Ref, Id, RunContext
from .native_provider_capture import NativeProviderCapture
from .model_selection import ModelPair


class NativeSdkDecision(Contract):
    schema_version: Literal[1] = 1
    decision_id: Id
    turn_id: Id
    scope: Scope
    session_id: Ref
    policy_revision: Annotated[int, Field(ge=0)]
    selected_model: ModelPair
    context: RunContext
    capture_digest: Ref
