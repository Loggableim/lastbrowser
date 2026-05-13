# File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

from __future__ import annotations

from typing_extensions import Annotated, TypedDict

from .._utils import PropertyInfo

__all__ = ["ConnectionDeleteByIDParams"]


class ConnectionDeleteByIDParams(TypedDict, total=False):
    delete_documents: Annotated[str, PropertyInfo(alias="deleteDocuments")]
    """Whether to also delete documents imported by this connection. Defaults to true."""
