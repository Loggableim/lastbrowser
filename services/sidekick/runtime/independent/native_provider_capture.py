"""Safe native provider DTO: no native protocol, SDK or profile imports."""
from typing import Annotated, Literal
from pydantic import Field, model_validator
from .contracts import Contract, Scope, Ref, ProviderSelection, ConnectionBinding
from .provider_admission import AdmissionBudget


class NativeAntigravityBinding(Contract):
    """Secret-free identity pin for one profile-local Antigravity account."""
    account_id: Ref
    project_id: Ref
    digest: Ref


class NativeLocalRuntimeCapture(Contract):
    """Secret-free, exact installed runtime evidence for one native turn.

    This is not a permission grant or a public request DTO. Only the Parent
    may attach it after checking the scoped store and current device proof.
    Endpoint and bearer credentials never belong in this persisted capture.
    """
    purpose: Literal['native_conversation'] = 'native_conversation'
    artifact_id: Ref
    artifact_revision: Ref
    bundle_digest: Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]
    backend: Literal['cpu', 'vulkan']
    runtime_build: Ref
    runtime_digest: Annotated[str, Field(pattern=r'^[a-f0-9]{64}$')]
    evidence_ref: Ref
    tool_calling_qualified: bool
    context_tokens: Annotated[int, Field(strict=True, ge=1024, le=131072)]
    max_output_tokens: Annotated[int, Field(strict=True, ge=1, le=32768)]
    parallel_requests: Literal[1] = 1

    @model_validator(mode='after')
    def bounded_output(self):
        if self.max_output_tokens >= self.context_tokens:
            raise ValueError('Local output reserve must fit its actual context')
        return self


class NativeProviderCapture(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    session_id: Ref
    provider: ProviderSelection
    antigravity_binding: NativeAntigravityBinding | None = None
    local_runtime: NativeLocalRuntimeCapture | None = None
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    permission_revision: Annotated[int, Field(ge=1)]
    control_epoch: Annotated[int, Field(ge=0)]
    policy_revision: Annotated[int, Field(ge=0)]
    budget: AdmissionBudget

    @model_validator(mode='after')
    def local_identity(self):
        if self.local_runtime is not None:
            if (self.provider.provider != 'local-store'
                    or self.provider.model != self.local_runtime.artifact_id
                    or self.provider.context_length != self.local_runtime.context_tokens
                    or self.antigravity_binding is not None):
                raise ValueError('Local runtime capture must match its selected provider')
        elif self.provider.provider == 'local-store':
            raise ValueError('Managed local provider requires exact runtime evidence')
        return self
