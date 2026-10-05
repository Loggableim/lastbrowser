"""Safe native provider DTO: no native protocol, SDK or profile imports."""
from typing import Annotated, Literal
from pydantic import Field
from .contracts import Contract, Scope, Ref, ProviderSelection, ConnectionBinding
from .provider_admission import AdmissionBudget


class NativeProviderCapture(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    session_id: Ref
    provider: ProviderSelection
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    permission_revision: Annotated[int, Field(ge=1)]
    control_epoch: Annotated[int, Field(ge=0)]
    policy_revision: Annotated[int, Field(ge=0)]
    budget: AdmissionBudget
