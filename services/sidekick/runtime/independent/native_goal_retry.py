"""Judge-only native retry: real private SDK admission, no repeated work.

Root owns human command ingress, transcript reservation, Host launch and the
final Goal CAS. This leaf reads the exact existing Goal snapshot and returns a
typed verdict only. No HTTP-thread SDK, auxiliary fallback or browser loop.
"""
from __future__ import annotations

from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
from typing import Literal
from pydantic import Field

from runtime.chat_modes import ChatExecutionPolicy
from .contracts import Id, Ref, Scope, Versioned, digest_json
from .native_chat_protocol import NativeChatContext, verify_native_context
from .policy import PolicyDenied


class NativeGoalRetryRequest(Versioned):
    request_id: Id
    scope: Scope
    session_id: Ref
    stream_id: Ref
    goal_run_id: Ref
    goal_revision: int = Field(ge=0)
    goal_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    human_command_ref: Ref
    human_command_digest: str = Field(pattern=r"^[a-f0-9]{64}$")


class NativeGoalRetryResult(Versioned):
    request_id: Id
    scope: Scope
    session_id: Ref
    stream_id: Ref
    goal_run_id: Ref
    goal_revision: int = Field(ge=0)
    goal_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    verdict: Literal["done", "continue", "unavailable"]
    reason: str = Field(max_length=4096)
    parse_failed: bool


def read_retry_goal(context: NativeChatContext, request: NativeGoalRetryRequest):
    verify_native_context(context)
    if (request.scope != context.scope or request.session_id != context.session_id
        or request.stream_id != context.stream_id):
        raise PolicyDenied("native_goal_retry_owner_changed")
    path = Path(context.space_root) / "goals.db"
    if path.is_symlink() or not path.is_file(): raise PolicyDenied("native_goal_retry_store_unavailable")
    with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
        # Goal and human receipt must belong to one SQLite read snapshot.
        # A concurrent pause/clear/command cannot splice their identities.
        connection.execute("BEGIN")
        row = connection.execute("SELECT value FROM state_meta WHERE key=?", ("goal:" + context.session_id,)).fetchone()
        command = connection.execute("SELECT value FROM state_meta WHERE key=?", (request.human_command_ref,)).fetchone()
    if row is None or command is None: raise PolicyDenied("native_goal_retry_human_receipt_required")
    if any(not isinstance(item[0], str) or len(item[0]) > 4 * 1024 * 1024 for item in (row, command)):
        raise PolicyDenied("native_goal_retry_snapshot_too_large")
    raw, receipt = json.loads(row[0]), json.loads(command[0])
    if not isinstance(raw, dict) or not isinstance(receipt, dict) or not isinstance(receipt.get("goal"), dict):
        raise PolicyDenied("native_goal_retry_snapshot_changed")
    authorization = receipt.get("humanAuthorization")
    if (raw.get("status") != "paused" or raw.get("continuation_owner", "legacy_chat") != "legacy_chat"
        or raw.get("owner_run_id") is not None or raw.get("_goal_run_id") != request.goal_run_id
        or raw.get("revision") != request.goal_revision or digest_json(raw) != request.goal_digest
        or not isinstance(raw.get("pending_judge_response"), str)
        or receipt.get("digest") != request.human_command_digest
        or receipt.get("state") not in {"committed", "complete"}
        or not isinstance(authorization, dict) or authorization.get("actorRef") != "user:desktop"
        or authorization.get("scope") != context.scope.model_dump(mode="json", by_alias=True)
        or authorization.get("sessionId") != context.session_id
        or authorization.get("backendProfileName") != context.profile_name
        or authorization.get("spaceSlug") != Path(context.space_root).name
        or receipt.get("goal", {}).get("_goal_run_id") != request.goal_run_id):
        raise PolicyDenied("native_goal_retry_snapshot_changed")
    return raw


def goal_retry_ingress_authorization(context, payload):
    """Readonly proof for Root's server-owned retry validator callback.

    This receipt authorizes only a Goal judge request. It never represents a
    new human work message or an active continuation claim.
    """
    request = NativeGoalRetryRequest.model_validate(payload)
    read_retry_goal(context, request)
    return {"authorizationRef": request.human_command_ref,
        "authorizationDigest": digest_json(request),
        "scope": context.scope.model_dump(mode="json", by_alias=True),
        "sessionId": context.session_id, "streamId": context.stream_id,
        "goalRunId": request.goal_run_id, "goalRevision": request.goal_revision,
        "goalDigest": request.goal_digest, "requestId": request.request_id,
        "requestPurpose": "goal_judge"}


def run_native_goal_retry(context, payload, *, execution_policy, put):
    """Called by the sealed worker AFTER fixed/AUTO prepare and stdin reader."""
    if os.getenv("LASTBROWSER_NATIVE_CHAT_WORKER") != "1":
        raise PolicyDenied("native_goal_retry_private_worker_required")
    if not isinstance(execution_policy, ChatExecutionPolicy):
        raise PolicyDenied("native_goal_retry_execution_policy_required")
    request = NativeGoalRetryRequest.model_validate(payload)
    raw = read_retry_goal(context, request)
    from .native_chat_auto import get_bound_native_auto_bridge
    from .native_sdk_broker import get_bound_native_sdk_bridge
    auto, fixed = get_bound_native_auto_bridge(), get_bound_native_sdk_bridge()
    if (auto is None) == (fixed is None): raise PolicyDenied("native_goal_retry_sdk_builder_required")
    bridge = auto or fixed
    if bridge.context != context or bridge.decision is None:
        raise PolicyDenied("native_goal_retry_sdk_context_changed")
    bridge.validate_decision(bridge.decision)
    # The ordinary streaming path resolves explicit credentials before building
    # AIAgent. Judge-only work skips that path and must do the same inside its
    # sealed, original-profile worker; ambient/auxiliary fallback is forbidden.
    from cli.runtime_provider import resolve_runtime_provider
    from web.api.oauth import resolve_runtime_provider_with_anthropic_env_lock
    selected = bridge.decision.selected_model
    runtime = resolve_runtime_provider_with_anthropic_env_lock(resolve_runtime_provider,
        requested=selected.provider, target_model=selected.model)
    if runtime.get('provider') != selected.provider or not runtime.get('api_key'):
        raise PolicyDenied('native_goal_retry_explicit_provider_required')
    bridge.validate_decision(bridge.decision)
    from run_agent import AIAgent
    agent = AIAgent(model=selected.model, provider=selected.provider,
        api_key=runtime['api_key'], base_url=runtime.get('base_url'), api_mode=runtime.get('api_mode'),
        session_id=context.session_id, max_iterations=1, enabled_toolsets=[], quiet_mode=True,
        skip_memory=True, skip_context_files=True, load_soul_identity=False, save_trajectories=False,
        runtime_config=bridge.runtime_config(), chat_execution_policy=execution_policy,
        native_auto_bridge=auto, native_sdk_bridge=fixed)
    try:
        # Constructor supplies the actual fresh SDK builder proof; this call
        # uses purpose goal_judge and the existing per-call Parent claims.
        # AIAgent.run_conversation is deliberately never invoked.
        from cli.goals import judge_goal
        verdict, reason, failed = judge_goal(raw["goal"], raw["pending_judge_response"],
            prior_responses=raw.get("recent_assistant_responses", ()))
        read_retry_goal(context, request)  # Clear/pause/replacement wins the CAS.
        result = NativeGoalRetryResult(request_id=request.request_id, scope=context.scope,
            session_id=context.session_id, stream_id=context.stream_id, goal_run_id=request.goal_run_id,
            goal_revision=request.goal_revision, goal_digest=request.goal_digest,
            verdict=verdict, reason=str(reason)[:4096], parse_failed=failed)
        put("goal_judge_result", result.model_dump(mode="json", by_alias=True))
        put("stream_end", {"session_id": context.session_id, "stream_id": context.stream_id})
        return result
    finally:
        agent.close()


def validate_goal_retry_result(context, request, payload, *, sdk_broker):
    """Parent accepts only a bound Host event with actual completed SDK receipt."""
    request = NativeGoalRetryRequest.model_validate(request)
    result = NativeGoalRetryResult.model_validate(payload)
    read_retry_goal(context, request)
    if (sdk_broker.context != context or result.scope != context.scope
        or any(getattr(result, name) != getattr(request, name) for name in
            ("request_id", "session_id", "stream_id", "goal_run_id", "goal_revision", "goal_digest"))):
        raise PolicyDenied("native_goal_retry_result_owner_changed")
    if result.verdict != "unavailable":
        claims = [sdk_broker.service.admission.get_claim(context.scope, identity) for identity in sdk_broker._claims]
        if not any(claim is not None and claim.request_purpose == "goal_judge" and claim.state == "completed"
            and claim.session_id == context.session_id and claim.decision_id == sdk_broker._decision.decision_id
            for claim in claims):
            raise PolicyDenied("native_goal_retry_actual_sdk_receipt_required")
    return result
