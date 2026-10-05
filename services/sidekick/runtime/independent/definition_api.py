"""Native definition controls with real user intent and immutable source IDs."""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from .contracts import Contract, Id, ProviderSelection, Scope, new_id, utc_now
from .definitions import DefinitionDraft, DefinitionService
from .policy import PolicyDenied
from .scoped_models import probe_catalog
from .store import RevisionConflict


class DefinitionControl(Contract):
    action: Literal["list", "save", "start", "disable"]
    client_request_id: Id | None = None
    expected_revision: Annotated[int, Field(ge=1)] | None = None
    expected_permission_revision: Annotated[int, Field(ge=1)] | None = None
    definition_id: Id | None = None
    user_intent: Annotated[str, Field(min_length=1, max_length=64000)] | None = None
    draft: dict | None = None


def _source(store, scope, request: DefinitionControl):
    """Persist submitted human control text once, without a model turn."""
    if not request.user_intent or not request.user_intent.strip():
        raise PolicyDenied("definition_user_intent_required")
    payload = request.model_dump(mode="json", by_alias=True)
    with store.transaction():
        previous = store.get_request_result(scope, "definition_user_intent", request.client_request_id, payload)
        if previous is not None:
            return previous
        state = store.ensure_assistant(scope)
        message = {"id": new_id(), "role": "user", "content": request.user_intent,
                   "at": utc_now(), "controlAction": request.action,
                   "clientRequestId": request.client_request_id}
        store.update_assistant(scope, state.revision, lambda current: current.model_copy(
            update={"messages": (*current.messages, message)}), event_kind="assistant_control")
        result = {"assistantConversationId": state.conversation_id, "sourceMessageId": message["id"]}
        store.record_request_result(scope, "definition_user_intent", request.client_request_id, payload, result)
        return result


def _provider(manager, scope, raw):
    if not isinstance(raw, dict) or set(raw) - {"provider", "model"}:
        raise PolicyDenied("definition_provider_pair_required")
    provider, model = raw.get("provider"), raw.get("model")
    if not isinstance(provider, str) or not isinstance(model, str) or not model:
        raise PolicyDenied("definition_provider_pair_required")
    catalog = probe_catalog(manager, scope)
    choices = [item for group in catalog["groups"] if group.get("provider_id") == provider and group.get("configured")
               for item in (*group.get("models", []), *group.get("extra_models", [])) if item.get("id") == model]
    if len(choices) != 1 or not choices[0].get("supportsIndependent", True):
        raise PolicyDenied("definition_model_unavailable")
    return ProviderSelection(provider=provider, model=model, provider_config_ref=catalog["providerConfigurationDigest"], context_length=choices[0].get("contextLength"))


def handle_definitions(store, resolver, manager, scope: Scope, payload: dict):
    request = DefinitionControl.model_validate(payload)
    resolver.resolve(scope)
    service = DefinitionService(manager)
    envelope = {"schemaVersion": 1, "scope": scope.model_dump(mode="json", by_alias=True)}
    if request.action == "list":
        if set(payload) != {"action"}:
            raise ValueError("Definition list accepts only its action")
        from runtime.cron.jobs import read_scoped_jobs
        schedules = [{"definitionId": job["independent_ref"]["definitionId"],
                      "definitionRevision": job["independent_ref"]["definitionRevision"],
                      "nextRunAt": job.get("next_run_at"), "enabled": bool(job.get("enabled"))}
                     for job in read_scoped_jobs(store.profile_home)
                     if job.get("job_type") == "independent_agent" and
                     (job.get("independent_ref") or {}).get("scope") == envelope["scope"]]
        return {**envelope, "definitions": service.list(scope), "schedules": schedules, "observedAt": utc_now()}
    if request.client_request_id is None:
        raise ValueError("Definition controls require an idempotency ID")
    cached = store.get_request_result(scope, "definition_api", request.client_request_id, payload)
    if cached is not None:
        return cached
    if request.action == "save":
        if request.draft is None or request.definition_id is not None or request.expected_permission_revision is not None:
            raise ValueError("Definition save requires a draft")
        if set(request.draft) & {"assistantConversationId", "sourceMessageId"}:
            raise PolicyDenied("definition_source_is_server_owned")
        provider = _provider(manager, scope, request.draft.get("provider"))
        draft = DefinitionDraft.model_validate({**request.draft, "provider": provider})
        # A conflict must not append a phantom human message.
        with store.transaction():
            from .runner import provider_configuration_digest
            if provider_configuration_digest(resolver.resolve(scope).profile_home) != provider.provider_config_ref:
                raise PolicyDenied("provider_configuration_changed")
            old = store.get_definition(draft.definition_id) if draft.definition_id else None
            if old and (old.scope != scope or old.revision != request.expected_revision) or not old and (draft.definition_id or request.expected_revision is not None):
                raise RevisionConflict("Definition revision changed")
            source = _source(store, scope, request)
            draft = draft.model_copy(update={"assistant_conversation_id": source["assistantConversationId"], "source_message_id": source["sourceMessageId"]})
            value = service.save(scope, draft, client_request_id=request.client_request_id, expected_revision=request.expected_revision)
            result = {**envelope, "definition": value.model_dump(mode="json", by_alias=True)}
            store.record_request_result(scope, "definition_api", request.client_request_id, payload, result)
            return result
    if request.definition_id is None or request.expected_revision is None or request.draft is not None:
        raise ValueError("Definition control requires its exact revision")
    if request.action == "disable":
        value = service.disable(scope, request.definition_id, client_request_id=request.client_request_id, expected_revision=request.expected_revision)
        result = {**envelope, "definition": value.model_dump(mode="json", by_alias=True)}
    else:
        if request.expected_permission_revision is None:
            raise ValueError("Definition start requires the permission revision")
        definition = service._get(scope, request.definition_id, request.expected_revision)
        if not definition.enabled:
            raise PolicyDenied("definition_disabled")
        if store.get_permission_state(scope)["revision"] != request.expected_permission_revision:
            raise RevisionConflict("Permissions revision changed")
        source = _source(store, scope, request)
        value = service.start(scope, request.definition_id, client_request_id=request.client_request_id,
                              expected_revision=request.expected_revision,
                              expected_permission_revision=request.expected_permission_revision,
                              source_message_id=source["sourceMessageId"], assistant_conversation_id=source["assistantConversationId"])
        result = {**envelope, "dispatch": value.model_dump(mode="json", by_alias=True)}
    store.record_request_result(scope, "definition_api", request.client_request_id, payload, result)
    return result
