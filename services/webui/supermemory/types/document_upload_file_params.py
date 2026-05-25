# File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

from __future__ import annotations

from typing_extensions import Literal, Required, Annotated, TypedDict

from .._types import FileTypes
from .._utils import PropertyInfo

__all__ = ["DocumentUploadFileParams"]


class DocumentUploadFileParams(TypedDict, total=False):
    file: Required[FileTypes]
    """File to upload and process"""

    container_tag: Annotated[str, PropertyInfo(alias="containerTag")]
    """Optional container tag (e.g., 'user_123'). Use this for a single tag."""

    container_tags: Annotated[str, PropertyInfo(alias="containerTags")]
    """Optional container tags.

    Can be either a JSON string of an array (e.g., '["user_123", "project_123"]') or
    a single string (e.g., 'user_123'). Single strings will be automatically
    converted to an array.
    """

    custom_id: Annotated[str, PropertyInfo(alias="customId")]
    """Optional custom ID of the document.

    Max 100 characters, alphanumeric with hyphens, underscores, and colons only.
    """

    entity_context: Annotated[str, PropertyInfo(alias="entityContext")]
    """Optional entity context for this container tag.

    Max 1500 characters. Used during document processing to guide memory extraction.
    """

    filepath: str
    """Optional file path for the uploaded file (e.g., '/documents/reports/file.pdf').

    Used by supermemoryfs to map documents to filesystem paths.
    """

    file_type: Annotated[str, PropertyInfo(alias="fileType")]
    """Optional file type override to force specific processing behavior.

    Valid values: text, pdf, tweet, google_doc, google_slide, google_sheet, image,
    video, notion_doc, webpage, onedrive
    """

    metadata: str
    """Optional metadata for the document as a JSON string.

    This is used to store additional information about the document. Keys must be
    strings and values can be strings, numbers, or booleans.
    """

    mime_type: Annotated[str, PropertyInfo(alias="mimeType")]
    """Required when fileType is 'image' or 'video'.

    Specifies the exact MIME type to use (e.g., 'image/png', 'image/jpeg',
    'video/mp4', 'video/webm')
    """

    task_type: Annotated[Literal["memory", "superrag"], PropertyInfo(alias="taskType")]
    """
    Task type: "memory" (default) for full context layer with SuperRAG built in,
    "superrag" for managed RAG as a service.
    """

    use_advanced_processing: Annotated[str, PropertyInfo(alias="useAdvancedProcessing")]
    """DEPRECATED: This field is no longer used.

    Advanced PDF processing is now automatic with our hybrid Mistral OCR + Gemini
    pipeline. This parameter will be accepted but ignored for backwards
    compatibility.
    """
