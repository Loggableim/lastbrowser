# File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

from __future__ import annotations

from typing import Dict, Union, Optional
from typing_extensions import Required, Annotated, TypedDict

from .._types import SequenceNotStr
from .._utils import PropertyInfo

__all__ = ["MemoryUpdateMemoryParams", "TemporalContext"]


class MemoryUpdateMemoryParams(TypedDict, total=False):
    container_tag: Required[Annotated[str, PropertyInfo(alias="containerTag")]]
    """Container tag / space identifier. Required to scope the operation."""

    new_content: Required[Annotated[str, PropertyInfo(alias="newContent")]]
    """The new content that will replace the existing memory"""

    id: str
    """ID of the memory entry to operate on"""

    content: str
    """Exact content match of the memory entry to operate on.

    Use this when you don't have the ID.
    """

    forget_after: Annotated[Optional[str], PropertyInfo(alias="forgetAfter")]
    """ISO 8601 datetime string.

    The memory will be auto-forgotten after this time. Pass null to clear an
    existing expiry. Omit to inherit from the previous version.
    """

    forget_reason: Annotated[Optional[str], PropertyInfo(alias="forgetReason")]
    """Optional reason for the scheduled forgetting.

    Cleared automatically when forgetAfter is set to null.
    """

    metadata: Dict[str, Union[str, float, bool, SequenceNotStr[str]]]
    """Optional metadata. If not provided, inherits from the previous version."""

    temporal_context: Annotated[TemporalContext, PropertyInfo(alias="temporalContext")]
    """Structured temporal metadata.

    Merged into the metadata JSON column. If omitted, existing temporalContext is
    preserved.
    """


class TemporalContext(TypedDict, total=False):
    """Structured temporal metadata.

    Merged into the metadata JSON column. If omitted, existing temporalContext is preserved.
    """

    document_date: Annotated[Optional[str], PropertyInfo(alias="documentDate")]
    """Date the document was authored"""

    event_date: Annotated[Optional[SequenceNotStr[str]], PropertyInfo(alias="eventDate")]
    """Dates of events referenced in the memory"""
