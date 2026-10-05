"""Isolated entry point reusing AIAgent, the provider resolver and Sessions.

Only bounded JSONL is emitted. Tool requests go back to the durable parent
broker; neither a renderer lifetime nor active-profile globals own this child.
"""
from __future__ import annotations

import contextlib
import copy
import hashlib
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

from .contracts import RunContext, canonical_json, new_id
from .onboarding import profile_prompt
from .policy import ExecutionGuard, PolicyDenied, execution_guard
from .worker_host import bind_worker_context


class WorkerCancelled(RuntimeError):
    pass


class ProviderRequestProxy:
    """Meter actual SDK entry calls, including internal engine retries.

    The client and its resource objects remain instance owned. There is no
    module monkeypatch or shared-client mutation across profile workers.
    """
    _RESOURCES = frozenset({"chat", "completions", "responses", "messages", "models", "beta"})
    _REQUESTS = frozenset({"create", "stream", "list", "retrieve", "converse", "converse_stream"})

    def __init__(self, target: Any, before_request):
        object.__setattr__(self, "_target", target)
        object.__setattr__(self, "_before_request", before_request)
        if hasattr(target, "max_retries"):
            target.max_retries = 0

    def __getattr__(self, name):
        target = getattr(self._target, name)
        if name in self._RESOURCES:
            return ProviderRequestProxy(target, self._before_request)
        if name in self._REQUESTS and callable(target):
            def request(*args, **kwargs):
                self._before_request()
                return target(*args, **kwargs)
            return request
        if name in {"with_options", "copy"} and callable(target):
            def copy_client(*args, **kwargs):
                kwargs["max_retries"] = 0
                return ProviderRequestProxy(target(*args, **kwargs), self._before_request)
            return copy_client
        return target

    def __setattr__(self, name, value):
        setattr(self._target, name, value)


def provider_configuration_digest(home: Path) -> str:
    checksum = hashlib.sha256()
    for name in ("config.yaml", ".env"):
        checksum.update(name.encode("ascii"))
        path = home / name
        checksum.update(path.read_bytes() if path.is_file() else b"<missing>")
    return checksum.hexdigest()


def independent_runtime_config(context: RunContext, resolved: dict[str, Any]) -> dict[str, Any]:
    """Use explicit or existing profile metadata without live endpoint probes.

    Context size is a provider-plan input, not an optimistic model-family
    guess. Unsupported small main models retain the engine's existing floor.
    """
    import yaml
    from runtime.model_metadata import MINIMUM_CONTEXT_LENGTH, get_cached_context_length
    path = Path(context.resolved_profile_home) / "config.yaml"
    config = yaml.safe_load(path.read_text("utf-8")) if path.is_file() else {}
    if config is None:
        config = {}
    if not isinstance(config, dict):
        raise PolicyDenied("invalid_provider_configuration")
    config = copy.deepcopy(config)
    model_config = config.get("model") or {}
    if not isinstance(model_config, dict):
        model_config = {}
    length = context.provider.context_length
    if length is None and type(model_config.get("context_length")) is int:
        length = model_config["context_length"]
    if length is None and resolved.get("base_url"):
        cached = get_cached_context_length(context.provider.model, resolved["base_url"])
        if type(cached) is int and cached > 0:
            length = cached
    if length is None:
        raise PolicyDenied("context_metadata_required")
    if length < MINIMUM_CONTEXT_LENGTH:
        raise PolicyDenied("main_model_context_unsupported")
    config["model"] = {**model_config, "context_length": length}
    config["runtime_hooks_enabled"] = False
    config["provider_metadata_prewarm"] = False
    config["compression"] = {"enabled": False}
    config["context"] = {"engine": "compressor"}
    config["memory"] = {"memory_enabled": False, "user_profile_enabled": False}
    config["skills"] = {"creation_nudge_interval": 0}
    agent_config = config.get("agent") or {}
    config["agent"] = {**(agent_config if isinstance(agent_config, dict) else {}), "api_max_retries": 1}
    return config


class ParentChannel:
    def __init__(self, input_stream, output_stream):
        self.input = input_stream
        self.output = output_stream
        self.lock = threading.RLock()
        self.fatal_error: str | None = None

    def emit(self, payload: dict[str, Any]) -> None:
        encoded = canonical_json(payload)
        if len(encoded.encode("utf-8")) > 1048576:
            raise ValueError("worker event exceeds limit")
        with self.lock:
            self.output.write(encoded + "\n")
            self.output.flush()

    def call(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            request_id = new_id()
            self.emit({**payload, "kind": "request", "requestKind": payload["kind"], "requestId": request_id})
            while True:
                line = self.input.readline(1048577)
                if not line or len(line.encode("utf-8")) > 1048576:
                    raise WorkerCancelled("parent_channel_lost")
                reply = json.loads(line)
                if reply.get("kind") in {"cancel", "shutdown"} or (reply.get("kind") == "control" and reply.get("command") == "cancel"):
                    raise WorkerCancelled("cancelled")
                if reply.get("kind") != "reply" or reply.get("requestId") != request_id:
                    raise WorkerCancelled("parent_protocol_mismatch")
                if reply.get("error"):
                    self.fatal_error = str(reply["error"])[:128]
                    raise PolicyDenied(self.fatal_error)
                value = reply.get("value")
                if not isinstance(value, dict):
                    raise WorkerCancelled("parent_protocol_mismatch")
                return value


def materialize_session(context: RunContext, payload: dict[str, Any]):
    """Existing session serializer executes only in this bound child process."""
    from web.api.models import Session
    from web.api.config import set_session_dir
    from web.api.space_engine import set_active_space
    from web.api.profiles import set_request_profile

    set_request_profile(context.backend_profile_name)
    set_active_space(payload["nativeSlug"])
    set_session_dir(str(Path(context.resolved_space_root) / "sessions"))
    sid = payload["targetSessionId"]
    if not isinstance(sid, str) or Path(sid).name != sid or not sid or "/" in sid or "\\" in sid:
        raise PolicyDenied("invalid_session_identity")
    path = Path(context.resolved_space_root) / "sessions" / f"{sid}.json"
    definition_id = payload.get("definitionId")
    marker = {"dispatchId": context.dispatch_id, "runId": context.run_id,
              "scope": context.scope.model_dump(mode="json", by_alias=True),
              "state": "queued", "stateRevision": 1,
              "assistantConversationId": payload["assistantConversationId"]}
    if definition_id:
        marker["definitionId"] = definition_id
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        meta = raw.get("independent") or {}
        if meta.get("scope") != marker["scope"] or (raw.get("profile") or "default") != context.backend_profile_name:
            raise PolicyDenied("session_identity_conflict")
        if meta.get("dispatchId") == context.dispatch_id:
            return {"sessionId": sid, "created": False}
        if not definition_id or meta.get("definitionId") != definition_id:
            raise PolicyDenied("session_identity_conflict")
        if raw.get("active_stream_id") or raw.get("pending_user_message"):
            raise PolicyDenied("workchat_legacy_writer_active")
        if any(row.get("dispatchId") == context.dispatch_id for row in meta.get("dispatches", [])):
            return {"sessionId": sid, "created": False}
        session = Session(**raw)
        session.messages.append({"role": "user", "content": payload["instruction"],
                                 "independentDispatchId": context.dispatch_id, "independentRunId": context.run_id})
        prior = meta.get("dispatches") or [{"dispatchId": meta.get("dispatchId"), "runId": meta.get("runId")}]
        session.independent = {**meta, **marker, "writerOwner": "independent_run",
                               "dispatches": [*prior, {"dispatchId": context.dispatch_id, "runId": context.run_id}]}
        session.model = context.provider.model
        session.model_provider = context.provider.provider or None
        session.save()
        return {"sessionId": sid, "created": False, "appended": True}
    if definition_id:
        marker["dispatches"] = [{"dispatchId": context.dispatch_id, "runId": context.run_id}]
    first_message = {"role": "user", "content": payload["instruction"]}
    if definition_id:
        first_message.update(independentDispatchId=context.dispatch_id, independentRunId=context.run_id)
    session = Session(session_id=sid, title=payload["title"], workspace=context.resolved_space_root,
                      model=context.provider.model, model_provider=context.provider.provider or None,
                      profile=context.backend_profile_name, workspace_slug=payload["nativeSlug"],
                      source_tag="independent", messages=[first_message], independent=marker,
                      space_scope=context.scope.model_dump(mode="json", by_alias=True))
    session.save()
    return {"sessionId": sid, "created": True}


def update_session(context: RunContext, payload: dict[str, Any]):
    """Append one durable terminal report to its original existing workchat.

    The parent owns the session-writer lease. A lost response can repeat this
    projection using deliveryKey, without duplicating or replacing messages.
    """
    from web.api.models import Session
    from web.api.config import set_session_dir
    from web.api.space_engine import set_active_space
    from web.api.profiles import set_request_profile
    set_request_profile(context.backend_profile_name)
    set_active_space(payload["nativeSlug"])
    directory = Path(context.resolved_space_root) / "sessions"
    set_session_dir(str(directory))
    sid = payload["targetSessionId"]
    if not isinstance(sid, str) or Path(sid).name != sid or not sid or "/" in sid or "\\" in sid:
        raise PolicyDenied("invalid_session_identity")
    path = directory / (sid + ".json")
    raw = json.loads(path.read_text(encoding="utf-8"))
    meta = raw.get("independent") or {}
    current = meta.get("dispatchId") == context.dispatch_id and meta.get("runId") == context.run_id
    known = any(row.get("dispatchId") == context.dispatch_id and row.get("runId") == context.run_id for row in meta.get("dispatches", []))
    if not (current or known) or meta.get("scope") != context.scope.model_dump(mode="json", by_alias=True):
        raise PolicyDenied("session_identity_conflict")
    key = payload["deliveryKey"]
    if payload.get("progress") is not None:
        from .contracts import RunProgress
        progress = RunProgress.model_validate(payload["progress"])
        if progress.run_id != context.run_id or progress.scope != context.scope or progress.target_session_id != sid:
            raise PolicyDenied("session_progress_scope_mismatch")
        if not current:
            return {"sessionId": sid, "delivered": False, "superseded": True}
        previous = meta.get("progress") or {}
        if previous.get("runId") == context.run_id and previous.get("progressRevision", 0) >= progress.progress_revision:
            return {"sessionId": sid, "delivered": False}
        session = Session(**raw)
        marker = "progress:" + context.run_id
        message = {"id": marker, "role": "assistant", "content": progress.text, "independentProgressId": marker,
            "independentRunId": context.run_id, "progressRevision": progress.progress_revision,
            "streaming": progress.run_state not in {"completed", "failed", "cancelled", "interrupted"}, "isPartial": True}
        found = next((index for index, value in enumerate(session.messages) if value.get("independentProgressId") == marker), None)
        if found is None:
            session.messages.append(message)
        else:
            session.messages[found] = message
        session.independent = {**meta, "progress": progress.model_dump(mode="json", by_alias=True)}
        session.save()
        return {"sessionId": sid, "delivered": True, "progressRevision": progress.progress_revision}
    if key in (meta.get("deliveredResults") or []):
        return {"sessionId": sid, "delivered": False}
    session = Session(**raw)
    if payload["status"] == "completed":
        session.messages = [message for message in session.messages if message.get("independentProgressId") != "progress:" + context.run_id]
    elif payload.get("partialProgress"):
        from .contracts import RunProgress
        progress = RunProgress.model_validate(payload["partialProgress"])
        if progress.run_id != context.run_id or progress.scope != context.scope or progress.target_session_id != sid:
            raise PolicyDenied("session_progress_scope_mismatch")
        marker = "progress:" + context.run_id
        message = {"id": marker, "role": "assistant", "content": progress.text, "independentProgressId": marker,
            "independentRunId": context.run_id, "progressRevision": progress.progress_revision, "streaming": False, "isPartial": True}
        found = next((index for index, value in enumerate(session.messages) if value.get("independentProgressId") == marker), None)
        if found is None:
            session.messages.append(message)
        else:
            session.messages[found] = message
    content = str(payload.get("response") or payload.get("reasonCode") or payload["status"])
    assistant_msg = {"role": "assistant", "content": content, "independentRunId": context.run_id, "deliveryKey": key}
    if payload.get("status") == "completed" and context.provider:
        prov = str(context.provider.provider or "").strip().lower()
        mod = str(context.provider.model or "").strip()
        if prov and mod and mod.lower() != "auto":
            evidence = {
                "provider_id": prov,
                "model_id": mod,
                "successful_chat": True,
            }
            assistant_msg["provider_evidence"] = evidence
            assistant_msg["execution_evidence"] = evidence
            assistant_msg["turn_id"] = context.run_id
            assistant_msg["stream_id"] = context.run_id
    session.messages.append(assistant_msg)
    session.independent = {**meta, "deliveredResults": [*(meta.get("deliveredResults") or []), key]}
    if current:
        session.independent.update(state=payload["status"], stateRevision=payload["stateRevision"], resultRef=payload.get("resultRef"))
        if payload.get("partialProgress"):
            session.independent["progress"] = payload["partialProgress"]
    session.save()
    return {"sessionId": sid, "delivered": True}


def emit_visible_delta(channel: ParentChannel, run_id: str, text) -> None:
    """Bound only the real text callback; never stringify tool/reasoning JSON."""
    if isinstance(text, str) and text:
        channel.emit({"kind": "delta", "runId": run_id, "delta": text[:64000], "truncated": len(text) > 64000})


def run_agent(context: RunContext, payload: dict[str, Any], channel: ParentChannel) -> dict[str, Any]:
    expected = payload.get("providerConfigurationDigest")
    if expected and provider_configuration_digest(Path(context.resolved_profile_home)) != expected:
        raise PolicyDenied("provider_configuration_changed")
    from cli.runtime_provider import resolve_runtime_provider
    from run_agent import AIAgent
    import yaml
    config_path = Path(context.resolved_profile_home) / "config.yaml"
    profile_config = yaml.safe_load(config_path.read_text("utf-8")) if config_path.is_file() else {}
    selected_config = (profile_config or {}).get("model") or {} if isinstance(profile_config, dict) else {}
    selected_config = selected_config if isinstance(selected_config, dict) else {}
    same_provider = selected_config.get("provider") == context.provider.provider
    # The existing resolver needs an explicit endpoint for bare custom local
    # servers. Inputs come only from this bound Home and captured provider.
    resolved = resolve_runtime_provider(requested=context.provider.provider or None,
        explicit_base_url=selected_config.get("base_url") if same_provider else None,
        explicit_api_key=selected_config.get("api_key") if same_provider else None,
        target_model=context.provider.model)
    # The selected provider and model are fixed, not re-read from UI settings.
    if context.provider.provider and resolved.get("provider") != context.provider.provider and not (context.provider.provider.startswith("custom:") and resolved.get("provider") == "custom" and resolved.get("requested_provider") == context.provider.provider):
        raise PolicyDenied("provider_selection_changed")
    mode = payload.get("mode", "run")
    def rpc(kind: str, **fields):
        return channel.call({"kind": kind, "runId": context.run_id,
                             "runnerGeneration": context.runner_generation, **fields})

    class BrokerAgent(AIAgent):
        def _create_openai_client(self, client_kwargs, *, reason, shared):
            client = super()._create_openai_client({**client_kwargs, "max_retries": 0}, reason=reason, shared=shared)
            return ProviderRequestProxy(client, lambda: rpc("provider_request"))

        def _rebuild_anthropic_client(self):
            super()._rebuild_anthropic_client()
            self._anthropic_client = ProviderRequestProxy(self._anthropic_client, lambda: rpc("provider_request"))

        def _get_bedrock_runtime_client(self, region):
            if region != getattr(self, "_bedrock_region", None):
                raise PolicyDenied("provider_region_changed")
            from runtime.bedrock_adapter import _require_boto3
            from botocore.config import Config
            client = _require_boto3().client("bedrock-runtime", region_name=region,
                config=Config(retries={"total_max_attempts": 1}, connect_timeout=min(10, context.budget.provider_timeout_seconds), read_timeout=context.budget.provider_timeout_seconds))
            return ProviderRequestProxy(client, lambda: rpc("provider_request"))

        def _spawn_background_review(self, *args, **kwargs):
            raise PolicyDenied("auxiliary_review_requires_broker")

        def _describe_image_for_anthropic_fallback(self, *args, **kwargs):
            raise PolicyDenied("auxiliary_vision_requires_broker")

        def _compress_context(self, *args, **kwargs):
            raise PolicyDenied("auxiliary_compression_requires_broker")

        def _check_compression_model_feasibility(self):
            # Auxiliary inference has no bound provider plan yet. An independent
            # run cannot silently choose another model to summarize its data.
            self.compression_enabled = False

        def _estimate_runtime_usage_cost(self, usage):
            # Pricing discovery is a separate capability. Tokens remain real,
            # while an unqueried price is represented honestly as unknown.
            from runtime.usage_pricing import CostResult
            return CostResult(amount_usd=None, status="unknown", source="none", label="n/a")

        def _interruptible_api_call(self, api_kwargs):
            result = super()._interruptible_api_call(api_kwargs)
            report_usage(result)
            return result

        def _interruptible_streaming_api_call(self, *args, **kwargs):
            result = super()._interruptible_streaming_api_call(*args, **kwargs)
            # Codex delegates to the non-streaming wrapper internally.
            if self.api_mode != "codex_responses":
                report_usage(result)
            return result

        def _ensure_db_session(self):
            if mode in {"assistant", "interview"}:
                return
            return super()._ensure_db_session()

        def _execute_tool_calls_concurrent(self, assistant_message, messages, effective_task_id, api_call_count=0):
            # Parent dispatch is serial per concrete target. Keeping the engine
            # on its serial path also preserves the immutable worker ContextVar.
            return self._execute_tool_calls_sequential(assistant_message, messages, effective_task_id, api_call_count)

    def report_usage(response):
        usage = getattr(response, "usage", None)
        total = getattr(usage, "total_tokens", None) if usage is not None else None
        if type(total) is int and total >= 0:
            rpc("usage", measuredTokens=total)

    allowed_kwargs = {key: resolved[key] for key in (
        "base_url", "api_key", "provider", "api_mode", "acp_command", "acp_args", "command", "args", "credential_pool",
    ) if key in resolved and key != "credential_pool"}
    agent = BrokerAgent(**allowed_kwargs, model=context.provider.model,
                        max_iterations=context.budget.max_provider_requests, tool_delay=0,
                        enabled_toolsets=["independent_browser", "independent_files"] if mode == "run" else [],
                        quiet_mode=True, save_trajectories=False, skip_memory=True, skip_context_files=True,
                        fallback_model=[], runtime_config=independent_runtime_config(context, resolved),
                        session_id=payload.get("targetSessionId") or "assistant_" + context.run_id,
                        ephemeral_system_prompt=payload.get("systemPrompt", "") + profile_prompt(context.assistant_profile_snapshot),
                        stream_delta_callback=lambda delta: emit_visible_delta(channel, context.run_id, delta),
                        clarify_callback=lambda question, choices: rpc("clarification", question=str(question)[:8000], choices=choices).get("answer", ""))
    agent._api_max_retries = 1
    agent._fallback_chain = []
    agent._fallback_model = None
    agent._credential_pool = None
    agent.compression_enabled = False
    if agent._anthropic_client is not None:
        agent._anthropic_client = ProviderRequestProxy(agent._anthropic_client, lambda: rpc("provider_request"))
    if mode in {"assistant", "interview"}:
        agent.tools = []
        agent.valid_tool_names = set()
    with execution_guard(ExecutionGuard(context, channel.call)):
        result = agent.run_conversation(payload["instruction"], conversation_history=payload.get("history") or [])
    # Existing engine error recovery can turn an exception into an error
    # response. A broker denial or failed provider call is never completion.
    if channel.fatal_error:
        raise PolicyDenied(channel.fatal_error)
    if result.get("failed") or result.get("error"):
        raise PolicyDenied("provider_request_failed")
    if result.get("completed") is False and not result.get("interrupted"):
        raise PolicyDenied("agent_did_not_complete")
    channel.emit({"kind": "checkpoint", "runId": context.run_id, "safeBoundary": True,
                  "state": {"conversationHistory": result.get("messages", []), "final": True}})
    return {"response": str(result.get("final_response") or result.get("response") or ""),
            "messages": result.get("messages", []), "interrupted": bool(result.get("interrupted"))}


def main() -> int:
    # -I ignores PYTHONIOENCODING/PYTHONUTF8. Windows redirected pipes
    # otherwise use the local code page while the parent protocol is UTF-8.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="strict")
    protocol_output = sys.stdout
    channel = ParentChannel(sys.stdin, protocol_output)
    try:
        bootstrap = json.loads(sys.stdin.readline(1048577))
        if bootstrap.get("kind") != "bootstrap" or bootstrap.get("schemaVersion") != 1:
            raise ValueError("invalid bootstrap")
        context = RunContext.model_validate(bootstrap["context"])
        payload = bootstrap["payload"]
        if os.environ.get("SIDEKICK_HOME") != context.resolved_profile_home:
            raise PolicyDenied("worker_home_mismatch")
        # Imported engine/provider libraries can print. They must not corrupt
        # or leak credentials into the JSONL parent protocol.
        with open(os.devnull, "w", encoding="utf-8") as sink, contextlib.redirect_stdout(sink):
            bind_worker_context(context)
            if payload.get("mode") == "materialize_session":
                result = materialize_session(context, payload)
            elif payload.get("mode") == "update_session":
                result = update_session(context, payload)
            elif payload.get("mode") == "model_catalog":
                # Child-only discovery retains the engine's actual configured
                # catalogs without touching parent environment/module caches.
                if provider_configuration_digest(Path(context.resolved_profile_home)) != payload.get("providerConfigurationDigest"):
                    raise PolicyDenied("provider_connection_changed")
                from web.api.config import get_available_models, get_config
                from .scoped_models import public_catalog
                accounts = {}
                if payload.get("includeCapabilities") is True:
                    from web.api.providers import get_providers
                    accounts = get_providers()
                result = public_catalog(get_available_models(), accounts, get_config())
                if payload.get("includeCapabilities") is True:
                    from .capabilities import public_inventory
                    result["capabilityInventory"] = public_inventory(context, get_config())
                result["providerConfigurationDigest"] = payload["providerConfigurationDigest"]
                if provider_configuration_digest(Path(context.resolved_profile_home)) != result["providerConfigurationDigest"]:
                    raise PolicyDenied("provider_connection_changed")
            elif payload.get("mode") == "connection_setup":
                from .connection_setup import run_connection_setup
                result = run_connection_setup(context, payload, channel)
            elif payload.get("mode") == "connection_configure":
                from .connection_setup import run_connection_configure
                result = run_connection_configure(context, payload)
            else:
                result = run_agent(context, payload, channel)
        channel.emit({"kind": "result", "runId": context.run_id, "value": result})
        return 0
    except (WorkerCancelled, PolicyDenied) as exc:
        channel.emit({"kind": "error", "code": str(exc), "runId": locals().get("context").run_id if "context" in locals() else None})
        return 2
    except Exception as exc:
        trace = exc.__traceback__
        while trace and trace.tb_next:
            trace = trace.tb_next
        site = (Path(trace.tb_frame.f_code.co_filename).name + ":" + str(trace.tb_lineno)) if trace else "unknown"
        # Source location/type is useful diagnostics without exception messages,
        # URLs, request bodies, environment values or credentials.
        channel.emit({"kind": "error", "code": "worker_failed", "errorType": type(exc).__name__, "errorSite": site,
                      "causeType": type(exc.__cause__ or exc.__context__).__name__ if exc.__cause__ or exc.__context__ else None})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
