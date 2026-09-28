"""Antigravity Cloud Code client — OpenAI-compatible facade.

Reuses the request/response translation from
``runtime.gemini_cloudcode_adapter`` (same ``cloudcode-pa.googleapis.com``
backend, same ``v1internal:generateContent`` / ``v1internal:streamGenerateContent``
envelope) but sources OAuth tokens and the consumer project from the
``antigravity`` credential pool instead of the retired google-gemini-cli pool.

The Antigravity tier is what Google directs consumer subscribers to since
June 18, 2026; its IDE client authenticates against the same Code Assist
backend, so the wire format is identical.
"""

from __future__ import annotations

import logging
import time
import uuid
from types import SimpleNamespace
from typing import Any, Dict, Iterator, List, Optional

import httpx

from runtime import antigravity_oauth
from runtime.gemini_cloudcode_adapter import (
    _empty_response,
    _gemini_http_error,
    _iter_sse_events,
    _make_stream_chunk,
    _translate_gemini_response,
    _translate_stream_event,
    build_gemini_request,
    wrap_code_assist_request,
)
from runtime.google_code_assist import CODE_ASSIST_ENDPOINT

logger = logging.getLogger(__name__)

MARKER_BASE_URL = "cloudcode-pa://antigravity"


class _AntigravityChatCompletions:
    def __init__(self, client: "AntigravityCloudCodeClient") -> None:
        self._client = client

    def create(self, **kwargs: Any) -> Any:
        return self._client._create_chat_completion(**kwargs)


class _AntigravityChatNamespace:
    def __init__(self, client: "AntigravityCloudCodeClient") -> None:
        self.completions = _AntigravityChatCompletions(client)


class AntigravityCloudCodeClient:
    """OpenAI-SDK-compatible facade over Code Assist v1internal (Antigravity tier).

    ``api_key`` is accepted for interface parity and ignored — real auth is the
    per-account OAuth token fetched on every call from the antigravity pool
    (round-robin when no ``account_email`` is pinned).
    """

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_headers: Optional[Dict[str, str]] = None,
        project_id: str = "",
        account_email: Optional[str] = None,
        **_: Any,
    ) -> None:
        self.api_key = api_key or "antigravity-oauth"
        self.base_url = base_url or MARKER_BASE_URL
        self._default_headers = dict(default_headers or {})
        self._configured_project_id = project_id
        self.account_email = str(account_email or "").strip()
        self._project_id: Optional[str] = None
        self.chat = _AntigravityChatNamespace(self)
        self.is_closed = False
        self._http = httpx.Client(
            timeout=httpx.Timeout(connect=15.0, read=600.0, write=30.0, pool=30.0)
        )

    def close(self) -> None:
        self.is_closed = True
        try:
            self._http.close()
        except Exception:
            pass

    def __enter__(self) -> "AntigravityCloudCodeClient":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.close()

    def _ensure_project_id(self, access_token: str) -> str:
        """Resolve and cache the consumer project for the selected account."""
        if self._project_id:
            return self._project_id
        if self._configured_project_id:
            self._project_id = self._configured_project_id
            return self._project_id

        creds = (
            antigravity_oauth.load_account_credentials(self.account_email)
            if self.account_email
            else None
        )
        stored = creds.project_id if creds else ""
        if stored:
            self._project_id = stored
            return self._project_id

        # Discover via loadCodeAssist; fall back to the consumer default.
        try:
            discovered = antigravity_oauth.resolve_project_id(access_token)
        except Exception as exc:
            logger.warning("Antigravity project discovery failed (%s); using default", exc)
            discovered = antigravity_oauth.DEFAULT_ANTIGRAVITY_PROJECT
        self._project_id = discovered or antigravity_oauth.DEFAULT_ANTIGRAVITY_PROJECT
        return self._project_id

    def _create_chat_completion(
        self,
        *,
        model: str = "gemini-2.5-flash",
        messages: Optional[List[Dict[str, Any]]] = None,
        stream: bool = False,
        tools: Any = None,
        tool_choice: Any = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        stop: Any = None,
        extra_body: Optional[Dict[str, Any]] = None,
        timeout: Any = None,
        **_: Any,
    ) -> Any:
        access_token = antigravity_oauth.get_valid_access_token(
            account_email=self.account_email or None
        )
        project_id = self._ensure_project_id(access_token)

        thinking_config = None
        if isinstance(extra_body, dict):
            thinking_config = extra_body.get("thinking_config") or extra_body.get("thinkingConfig")

        inner = build_gemini_request(
            messages=messages or [],
            tools=tools,
            tool_choice=tool_choice,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stop=stop,
            thinking_config=thinking_config,
        )
        wrapped = wrap_code_assist_request(
            project_id=project_id,
            model=model,
            inner_request=inner,
        )

        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {access_token}",
            "User-Agent": "antigravity-ide/1.107.0 sidekick-agent",
            "X-Goog-Api-Client": "antigravity-ide/1.107.0",
            "x-activity-request-id": str(uuid.uuid4()),
        }
        headers.update(self._default_headers)

        if stream:
            return self._stream_completion(model=model, wrapped=wrapped, headers=headers)

        url = f"{CODE_ASSIST_ENDPOINT}/v1internal:generateContent"
        response = self._http.post(url, json=wrapped, headers=headers)
        if response.status_code != 200:
            raise _gemini_http_error(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Invalid JSON from Code Assist: {exc}") from exc
        return _translate_gemini_response(payload, model=model)

    def _stream_completion(
        self,
        *,
        model: str,
        wrapped: Dict[str, Any],
        headers: Dict[str, str],
    ) -> Iterator[Any]:
        url = f"{CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse"
        stream_headers = dict(headers)
        stream_headers["Accept"] = "text/event-stream"

        def _generator() -> Iterator[Any]:
            try:
                with self._http.stream("POST", url, json=wrapped, headers=stream_headers) as response:
                    if response.status_code != 200:
                        response.read()
                        raise _gemini_http_error(response)
                    tool_call_counter: List[int] = [0]
                    for event in _iter_sse_events(response):
                        for chunk in _translate_stream_event(event, model, tool_call_counter):
                            yield chunk
            except httpx.HTTPError as exc:
                raise RuntimeError(f"Antigravity streaming request failed: {exc}") from exc

        return _generator()