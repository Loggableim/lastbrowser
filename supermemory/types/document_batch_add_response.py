# File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

from typing import List, Optional

from .._models import BaseModel

__all__ = ["DocumentBatchAddResponse", "Result"]


class Result(BaseModel):
    id: str
    """Unique identifier of the document (empty string for failed items)"""

    status: str
    """Status of the document (e.g. 'done', 'queued', 'error')"""

    details: Optional[str] = None
    """Additional error details when status is 'error'"""

    error: Optional[str] = None
    """Error message when status is 'error'"""


class DocumentBatchAddResponse(BaseModel):
    failed: float
    """Count of documents that failed to add"""

    results: List[Result]
    """Array of results for each document in the batch"""

    success: float
    """Count of documents successfully added"""
