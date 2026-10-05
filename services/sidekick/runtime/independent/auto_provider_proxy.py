"""Instance SDK adapter: one frozen decision, one claim per real request.

No SDK globals, implicit fallback, credential rotation or prompt logging.
The caller must build the client from the decision's immutable profile context.
The ordinary chat lifecycle owns cancellation and the transcript writer lease.
"""
from __future__ import annotations

import threading
import os
from typing import Any

from .contracts import new_id
from .policy import PolicyDenied
from .store import ResourceBusy


def _usage(value):
    usage = getattr(value, "usage", None)
    total = getattr(usage, "total_tokens", None)
    if type(total) is int and total >= 0:
        return total
    if usage is not None and hasattr(usage, "input_tokens") and hasattr(usage, "output_tokens"):
        fields = [getattr(usage, field, 0) for field in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens")]
        if all(type(item) is int and item >= 0 for item in fields):
            return sum(fields)
    return None


def _error_code(error):
    body = getattr(error, "body", None)
    nested = body.get("error", body) if isinstance(body, dict) else {}
    details = nested.get("details") if isinstance(nested, dict) else None
    code = nested.get("code") or (details.get("error_code") if isinstance(details, dict) else None) if isinstance(nested, dict) else None
    return code if code in {"insufficient_quota", "billing_hard_limit_reached", "enforced_spend_limit_reached"} else None


class AutoProviderProxy:
    _RESOURCES = frozenset({"chat", "completions", "responses", "messages", "beta"})

    def __init__(self, client, service, decision, *, call_authorizer=None,
                 client_binding_validator=None, compute_acquire=None, compute_release=None,
                 request_metadata=None, stream_complete=None, path=(), state=None):
        self._target, self._service, self._decision = client, service, decision
        self._path, self._authorize = tuple(path), call_authorizer
        self._state = state if state is not None else {"lock": threading.RLock(), "active": {}, "delta": False,
            "client": client, "binding_validator": client_binding_validator,
            "compute_acquire": compute_acquire, "compute_release": compute_release,
            "request_metadata": request_metadata, "stream_complete": stream_complete}
        if hasattr(client, "max_retries"):
            client.max_retries = 0

    def __getattr__(self, name):
        if name in self._RESOURCES:
            return AutoProviderProxy(getattr(self._target, name), self._service, self._decision,
                call_authorizer=self._authorize, path=(*self._path, name), state=self._state)
        if name in {"create", "stream"}:
            return lambda *args, **kwargs: self._request(name, args, kwargs)
        if name in {"list", "retrieve", "converse", "converse_stream"}:
            raise PolicyDenied("auto_provider_operation_not_supported")
        if name in {"copy", "with_options"}:
            def copy_client(*args, **kwargs):
                if args or set(kwargs) - {"max_retries", "timeout"}:
                    raise PolicyDenied("auto_provider_client_change_forbidden")
                kwargs["max_retries"] = 0
                return AutoProviderProxy(getattr(self._target, name)(**kwargs), self._service, self._decision,
                    call_authorizer=self._authorize, path=self._path, state=self._state)
            return copy_client
        return getattr(self._target, name)

    def mark_visible_delta(self):
        """Call only from the actual visible-output callback, after thought stripping."""
        with self._state["lock"]:
            self._state["delta"] = True
            claims = tuple(self._state["active"].values())
            if not claims and self._state.get("last_response") is not None:
                # AIAgent's thought/context scrubbers may flush genuine text
                # after the SDK iterator released its compute admission.
                # Mark this owned response without reopening its request.
                claims = (self._state["last_response"],)
        for claim in claims:
            self._service.admission.update(claim.scope, claim.claim_id, delivered_delta=True)

    def close(self):
        """Close the owned SDK transport before acknowledging pending claims."""
        try:
            self._target.close()
        finally:
            with self._state["lock"]:
                claims = tuple(self._state["active"].values())
                self._state["active"].clear()
            for claim in claims:
                try:
                    self._service.admission.update(claim.scope, claim.claim_id, state="cancelled", acknowledged=True)
                finally:
                    self._release_compute(claim)

    def _acquire_compute(self, claim):
        acquire, release = self._state["compute_acquire"], self._state["compute_release"]
        if acquire is not None or release is not None:
            if not callable(acquire) or not callable(release):
                raise PolicyDenied("auto_host_compute_adapter_required")
            return acquire(claim) is True
        if os.getenv("LASTBROWSER_INDEPENDENT_WORKER") == "1":
            raise PolicyDenied("auto_host_compute_adapter_required")
        from .manager import ComputeAdmission
        return ComputeAdmission.acquire_legacy("auto-provider:" + claim.claim_id, scope_key=claim.scope.key)

    def _release_compute(self, claim):
        if self._state["compute_release"] is not None:
            self._state["compute_release"](claim)
        else:
            from .manager import ComputeAdmission
            ComputeAdmission.release("auto-provider:" + claim.claim_id)

    def _request(self, method, args, original):
        decision = self._decision
        if args or original.get("model") != decision.selected_model.model:
            raise PolicyDenied("auto_actual_model_changed")
        service = self._service
        service.validate_decision(decision)
        validator = self._state["binding_validator"]
        if not callable(validator) or validator(self._state["client"], decision.context) is not True:
            raise PolicyDenied("auto_bound_sdk_client_required")
        policy = service.get_policy(decision.scope, decision.session_id)
        kwargs = dict(original)
        if sum(key in kwargs for key in ("max_tokens", "max_completion_tokens", "max_output_tokens")) > 1:
            raise PolicyDenied("auto_conflicting_output_limits")
        headers = kwargs.get("extra_headers") or {}
        if not isinstance(headers, dict) or any(str(key).lower() in {"authorization", "x-api-key", "api-key", "openai-project", "openai-organization", "anthropic-organization-id"} for key in headers):
            raise PolicyDenied("auto_provider_identity_override_forbidden")
        extra = kwargs.get("extra_body") or {}
        if not isinstance(extra, dict) or set(extra) - {"reasoning_effort", "thinking", "chat_template_kwargs"}:
            raise PolicyDenied("auto_provider_body_override_forbidden")
        template = extra.get("chat_template_kwargs")
        if template is not None and (not isinstance(template, dict) or set(template) - {"enable_thinking"}):
            raise PolicyDenied("auto_provider_body_override_forbidden")
        parameter = "max_output_tokens" if "responses" in self._path else (
            "max_completion_tokens" if "max_completion_tokens" in kwargs or decision.selected_model.provider == "openai" else "max_tokens")
        declared = kwargs.get(parameter, policy.budget.max_output_tokens)
        if type(declared) is not int or declared < 1:
            raise PolicyDenied("auto_output_token_bound_invalid")
        kwargs[parameter] = min(declared, policy.budget.max_output_tokens)
        # Multiple generated choices multiply token use; no hidden n-way request.
        if type(kwargs.get("n", 1)) is not int or kwargs.get("n", 1) != 1:
            raise PolicyDenied("auto_multiple_choices_not_supported")
        metadata = self._state.get("request_metadata")
        details = metadata(kwargs, self._path) if callable(metadata) else {}
        if not isinstance(details, dict) or set(details) - {"input_tokens_upper_bound", "input_bound_source", "request_purpose"}:
            raise PolicyDenied("auto_request_metadata_invalid")
        claim = service.claim_request(decision, output_tokens=kwargs[parameter], **details)
        owner = "auto-provider:" + claim.claim_id
        try:
            acquired = self._acquire_compute(claim)
        except BaseException:
            service.admission.update(claim.scope, claim.claim_id, state="cancelled")
            raise
        if not acquired:
            service.admission.update(claim.scope, claim.claim_id, state="cancelled")
            raise ResourceBusy("Shared model compute admission is busy")
        with self._state["lock"]:
            self._state["active"][claim.claim_id] = claim
        lifecycle = _RequestLifecycle(self, claim, owner)
        try:
            service.validate_decision(decision)
            managed = service.manager._governance(decision.context, prepare=True)
            if managed and (self._authorize is None or self._authorize(decision, claim) is not True):
                raise PolicyDenied("auto_nova_execution_adapter_required")
            if self._authorize is not None and not managed and self._authorize(decision, claim) is not True:
                raise PolicyDenied("auto_provider_dispatch_denied")
            if method == "stream":
                # Anthropic's builder performs IO only in __enter__().
                return _StreamContext(getattr(self._target, method)(**kwargs), lifecycle)
            lifecycle.start()
            raw_resource = getattr(self._target, "with_raw_response", None)
            if raw_resource is not None:
                raw = getattr(raw_resource, method)(**kwargs)
                lifecycle.observe(raw)
                result = raw.parse()
            else:
                result = getattr(self._target, method)(**kwargs)
                lifecycle.observe(getattr(result, "response", result))
            if kwargs.get("stream") is True:
                return _StreamResult(result, lifecycle)
            lifecycle.finish(result)
            return result
        except BaseException as error:
            lifecycle.fail(error)
            raise


class _RequestLifecycle:
    def __init__(self, proxy, claim, compute_owner):
        self.proxy, self.claim, self.owner = proxy, claim, compute_owner
        self.finished = False
        self.started = False
        self.measured = None

    def start(self):
        self.proxy._service.validate_decision(self.proxy._decision)
        self.proxy._service.admission.update(self.claim.scope, self.claim.claim_id, state="started")
        self.started = True

    def observe(self, response):
        headers = getattr(response, "headers", None)
        status = getattr(response, "status_code", None)
        if headers is not None:
            self.proxy._service.admission.observe(self.claim.scope, self.claim.claim_id, headers,
                status_code=status if type(status) is int else None)

    def record_usage(self, value):
        measured = _usage(value)
        if measured is not None:
            self.measured = measured

    def finish(self, value=None, *, error_code=None):
        if self.finished:
            return
        self.finished = True
        self.record_usage(value)
        try:
            self.proxy._service.admission.update(self.claim.scope, self.claim.claim_id,
                state="completed" if self.started else "cancelled", measured_tokens=self.measured,
                error_code=error_code)
        finally:
            self._release()
        if self.measured is not None and self.measured > self.claim.reserved_tokens:
            raise PolicyDenied("auto_measured_token_budget_exhausted")

    def complete_stream(self, value=None):
        """Flush an owned normal stream before its usage/compute settlement.

        An interrupted/closed stream never flushes possible hidden content.
        The optional callback is installed by the private native SDK builder,
        never by request arguments or a renderer-provided identity.
        """
        if self.finished:
            return
        complete = self.proxy._state.get("stream_complete")
        if complete is not None:
            if not callable(complete):
                raise PolicyDenied("auto_stream_completion_adapter_invalid")
            complete()
        self.finish(value)

    def fail(self, error):
        if self.finished:
            return
        response = getattr(error, "response", None)
        try:
            if response is not None:
                self.proxy._service.admission.observe(self.claim.scope, self.claim.claim_id,
                    getattr(response, "headers", {}), status_code=getattr(error, "status_code", None), error_code=_error_code(error))
        finally:
            self.finish(error_code="provider_stream_interrupted" if self.proxy._state["delta"] else "provider_request_failed")

    def _release(self):
        self.proxy._release_compute(self.claim)
        with self.proxy._state["lock"]:
            self.proxy._state["active"].pop(self.claim.claim_id, None)
            if self.started:
                self.proxy._state["last_response"] = self.claim


class _StreamResult:
    def __init__(self, stream, lifecycle):
        self._stream, self._lifecycle = stream, lifecycle

    def __iter__(self):
        try:
            for chunk in self._stream:
                self._lifecycle.record_usage(chunk)
                yield chunk
            self._lifecycle.complete_stream(getattr(self._stream, "current_message_snapshot", None))
        except BaseException as error:
            self._lifecycle.fail(error)
            raise
        finally:
            self.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def __getattr__(self, name):
        if name == "text_stream":
            return self._text_stream()
        if name in {"get_final_message", "get_final_response", "until_done"}:
            def final(*args, **kwargs):
                try:
                    value = getattr(self._stream, name)(*args, **kwargs)
                    self._lifecycle.complete_stream(value)
                    return value
                except BaseException as error:
                    self._lifecycle.fail(error)
                    raise
            return final
        return getattr(self._stream, name)

    def _text_stream(self):
        try:
            yield from self._stream.text_stream
            self._lifecycle.complete_stream(getattr(self._stream, "current_message_snapshot", None))
        except BaseException as error:
            self._lifecycle.fail(error)
            raise
        finally:
            self.close()

    def close(self):
        try:
            self._stream.close()
        finally:
            if not self._lifecycle.finished:
                self._lifecycle.finish(error_code="provider_stream_closed")


class _StreamContext:
    def __init__(self, manager, lifecycle):
        self.manager, self.lifecycle = manager, lifecycle
        self.stream = None

    def __enter__(self):
        try:
            self.lifecycle.start()
            actual = self.manager.__enter__()
            self.lifecycle.observe(getattr(actual, "response", actual))
            self.stream = _StreamResult(actual, self.lifecycle)
            return self.stream
        except BaseException as error:
            self.lifecycle.fail(error)
            raise

    def __exit__(self, exc_type, exc, tb):
        try:
            return self.manager.__exit__(exc_type, exc, tb)
        finally:
            if exc is not None:
                self.lifecycle.fail(exc)
            else:
                self.lifecycle.finish(getattr(self.stream._stream, "current_message_snapshot", None) if self.stream else None)
