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
    CodeAssistError,
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


def _normalize_code_assist_model(model: str) -> str:
    """Normalize model identifier for Code Assist endpoint.

    Code Assist (cloudcode-pa.googleapis.com) expects bare model names like
    'gemini-2.5-flash' or 'gemini-2.5-pro'. Strip vendor or namespace prefixes
    such as 'antigravity/', 'google/', or 'models/'.
    """
    clean = str(model or "").strip()
    for prefix in ("antigravity/", "google/", "models/"):
        if clean.lower().startswith(prefix):
            clean = clean[len(prefix):]
            break
    return clean or "gemini-2.5-flash"


def _safe_gemini_http_error(response: httpx.Response) -> Exception:
    """Keep only status and retry timing; never surface or retain the raw response."""
    parsed_error = _gemini_http_error(response)
    retry_after_header = response.headers.get("Retry-After") or response.headers.get("retry-after")
    retry_after = parsed_error.retry_after

    # The shared parser may include provider-controlled body text in its message,
    # details, and response reference. Keep only the retry header on a tiny shim
    # so downstream backoff can continue without retaining the original body.
    safe_response = SimpleNamespace(
        status_code=response.status_code,
        headers={"Retry-After": retry_after_header} if retry_after_header else {},
    )
    return CodeAssistError(
        f"Code Assist HTTP {response.status_code}",
        code=parsed_error.code,
        status_code=response.status_code,
        response=safe_response,
        retry_after=retry_after,
        details={},
    )


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
        profile_home: Optional[str] = None,
        native_account_id: Optional[str] = None,
        native_project_id: Optional[str] = None,
        native_account_digest: Optional[str] = None,
        timeout: Any = None,
        **_: Any,
    ) -> None:
        self.api_key = api_key or "antigravity-oauth"
        self.base_url = base_url or MARKER_BASE_URL
        self._default_headers = dict(default_headers or {})
        self._configured_project_id = project_id
        self.account_email = str(account_email or "").strip()
        self.profile_home = str(profile_home or "").strip()
        self._native_account_id = str(native_account_id or "").strip()
        self._native_project_id = str(native_project_id or "").strip()
        self._native_account_digest = str(native_account_digest or "").strip()
        if any((self._native_account_id, self._native_project_id, self._native_account_digest)) and not all(
            (self._native_account_id, self._native_project_id, self._native_account_digest)
        ):
            raise antigravity_oauth.AntigravityOAuthError(
                "The captured Antigravity account binding is incomplete.", code="antigravity_native_binding_invalid")
        self._project_id: Optional[str] = None
        self._projects_by_account: Dict[str, str] = {}
        self.chat = _AntigravityChatNamespace(self)
        self.is_closed = False
        self._timeout = timeout if timeout is not None else httpx.Timeout(connect=15.0, read=600.0, write=30.0, pool=30.0)
        self._http = httpx.Client(timeout=self._timeout)

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

    def _ensure_project_id(self, access_token: str, account_email: Optional[str] = None) -> str:
        """Resolve and cache the consumer project for the selected account."""
        if self._native_account_id:
            if not self._native_project_id or self._configured_project_id != self._native_project_id:
                raise antigravity_oauth.AntigravityOAuthError(
                    "The captured Antigravity project binding is missing.", code="antigravity_native_binding_changed")
            return self._native_project_id
        if self._configured_project_id:
            if self.account_email or self._configured_project_id == antigravity_oauth.DEFAULT_ANTIGRAVITY_PROJECT:
                self._project_id = self._configured_project_id
                return self._project_id
            target_email = str(account_email or self.account_email or "").strip().lower()
            if target_email:
                creds = antigravity_oauth.load_account_credentials(target_email)
                if creds and creds.project_id:
                    self._projects_by_account[target_email] = creds.project_id
                    return creds.project_id
            self._project_id = self._configured_project_id
            return self._project_id

        target_email = str(account_email or self.account_email or "").strip().lower()
        if target_email and target_email in self._projects_by_account:
            return self._projects_by_account[target_email]

        creds = (
            antigravity_oauth.load_account_credentials(target_email)
            if target_email
            else None
        )
        stored = creds.project_id if creds else ""
        if stored:
            if target_email:
                self._projects_by_account[target_email] = stored
            self._project_id = stored
            return stored

        # Discover via loadCodeAssist; fall back to the consumer default.
        try:
            discovered = antigravity_oauth.resolve_project_id(access_token)
        except Exception as exc:
            logger.warning("Antigravity project discovery failed (%s); using default", exc)
            discovered = antigravity_oauth.DEFAULT_ANTIGRAVITY_PROJECT
        project_id = discovered or antigravity_oauth.DEFAULT_ANTIGRAVITY_PROJECT
        if target_email:
            self._projects_by_account[target_email] = project_id
        self._project_id = project_id
        return project_id

    def _validate_native_account_binding(self) -> Dict[str, str] | None:
        if not self._native_account_id:
            return None
        from pathlib import Path
        import os
        home = (
            self.profile_home
            or os.getenv("SIDEKICK_HOME", "").strip()
            or os.getenv("LASTBROWSER_HOME", "").strip()
        )
        if not home:
            try:
                from shared.paths import sidekick_home
                home = str(sidekick_home())
            except Exception:
                home = ""
        binding = antigravity_oauth.resolve_native_account_binding(home, self._native_account_id) if home else None
        if (binding is None or binding.get("project_id") != self._native_project_id
                or binding.get("digest") != self._native_account_digest):
            raise antigravity_oauth.AntigravityOAuthError(
                "The captured Antigravity account binding changed.", code="antigravity_native_binding_changed")
        return binding

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
        if self.is_closed:
            raise RuntimeError("Antigravity client is closed")
        binding = self._validate_native_account_binding()
        pinned_email = binding["email"] if binding is not None else self.account_email
        if hasattr(antigravity_oauth, "get_valid_access_token_with_account"):
            access_token, resolved_email = antigravity_oauth.get_valid_access_token_with_account(
                account_email=pinned_email or None
            )
        else:
            access_token = antigravity_oauth.get_valid_access_token(account_email=pinned_email or None)
            resolved_email = getattr(antigravity_oauth, "get_last_selected_account_email", lambda: None)()
        effective_email = pinned_email or self.account_email or resolved_email or ""
        binding_after_refresh = self._validate_native_account_binding()
        if binding is not None and (binding_after_refresh is None
                or binding_after_refresh.get("digest") != binding.get("digest")):
            raise antigravity_oauth.AntigravityOAuthError(
                "The captured Antigravity account binding changed during token refresh.",
                code="antigravity_native_binding_changed")
        if binding is not None:
            self.account_email = pinned_email
        project_id = self._ensure_project_id(access_token, account_email=effective_email)

        thinking_config = None
        if isinstance(extra_body, dict):
            thinking_config = extra_body.get("thinking_config") or extra_body.get("thinkingConfig")

        if isinstance(stop, (tuple, set)):
            stop = list(stop)

        normalized_model = _normalize_code_assist_model(model)

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
            model=normalized_model,
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
            return self._stream_completion(
                model=model,
                wrapped=wrapped,
                headers=headers,
                timeout=timeout,
                pinned_email=pinned_email or effective_email,
            )

        url = f"{CODE_ASSIST_ENDPOINT}/v1internal:generateContent"
        request_kwargs: Dict[str, Any] = {}
        if timeout is not None:
            request_kwargs["timeout"] = timeout
        try:
            response = self._http.post(url, json=wrapped, headers=headers, **request_kwargs)
            if response.status_code == 401:
                if self.is_closed:
                    raise RuntimeError("Antigravity client was closed during request")
                logger.info("Antigravity Code Assist returned 401; attempting single force-refresh")
                binding = self._validate_native_account_binding()
                effective_pinned = binding["email"] if binding is not None else (pinned_email or effective_email)
                new_token = antigravity_oauth.get_valid_access_token(
                    force_refresh=True,
                    account_email=effective_pinned or None,
                )
                binding_after_refresh = self._validate_native_account_binding()
                if binding is not None and (binding_after_refresh is None
                        or binding_after_refresh.get("digest") != binding.get("digest")):
                    raise antigravity_oauth.AntigravityOAuthError(
                        "The captured Antigravity account binding changed during token refresh.",
                        code="antigravity_native_binding_changed")
                headers["Authorization"] = f"Bearer {new_token}"
                headers["x-activity-request-id"] = str(uuid.uuid4())
                response = self._http.post(url, json=wrapped, headers=headers, **request_kwargs)
        except httpx.HTTPError as exc:
            raise RuntimeError("Antigravity request failed: network connection error") from exc

        if response.status_code != 200:
            raise _safe_gemini_http_error(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise CodeAssistError(
                "Invalid JSON from Code Assist",
                code="code_assist_invalid_json",
            ) from exc
        return _translate_gemini_response(payload, model=model)

    def _stream_completion(
        self,
        *,
        model: str,
        wrapped: Dict[str, Any],
        headers: Dict[str, str],
        timeout: Any = None,
        pinned_email: Optional[str] = None,
    ) -> Iterator[Any]:
        if self.is_closed:
            raise RuntimeError("Antigravity client is closed")
        url = f"{CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse"
        stream_headers = dict(headers)
        stream_headers["Accept"] = "text/event-stream"
        stream_kwargs: Dict[str, Any] = {}
        if timeout is not None:
            stream_kwargs["timeout"] = timeout

        def _generator() -> Iterator[Any]:
            try:
                cm = self._http.stream("POST", url, json=wrapped, headers=stream_headers, **stream_kwargs)
                response = cm.__enter__()
                try:
                    if response.status_code == 401:
                        cm.__exit__(None, None, None)
                        if self.is_closed:
                            raise RuntimeError("Antigravity client was closed during request")
                        logger.info("Antigravity Code Assist streaming returned 401; attempting single force-refresh")
                        binding = self._validate_native_account_binding()
                        effective_pinned = binding["email"] if binding is not None else (pinned_email or self.account_email)
                        new_token = antigravity_oauth.get_valid_access_token(
                            force_refresh=True,
                            account_email=effective_pinned or None,
                        )
                        binding_after_refresh = self._validate_native_account_binding()
                        if binding is not None and (binding_after_refresh is None
                                or binding_after_refresh.get("digest") != binding.get("digest")):
                            raise antigravity_oauth.AntigravityOAuthError(
                                "The captured Antigravity account binding changed during token refresh.",
                                code="antigravity_native_binding_changed")
                        stream_headers["Authorization"] = f"Bearer {new_token}"
                        stream_headers["x-activity-request-id"] = str(uuid.uuid4())
                        cm = self._http.stream("POST", url, json=wrapped, headers=stream_headers, **stream_kwargs)
                        response = cm.__enter__()

                    with response:
                        if response.status_code != 200:
                            response.read()
                            raise _safe_gemini_http_error(response)
                        tool_call_counter: List[int] = [0]
                        for event in _iter_sse_events(response):
                            self._validate_native_account_binding()
                            for chunk in _translate_stream_event(event, model, tool_call_counter):
                                yield chunk
                finally:
                    cm.__exit__(None, None, None)
            except GeneratorExit:
                return
            except httpx.HTTPError as exc:
                raise RuntimeError("Antigravity streaming request failed: network connection error") from exc

        return _generator()
