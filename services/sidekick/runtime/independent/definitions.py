"""Versioned definition editing and explicit user-authorized dispatch."""
from __future__ import annotations

from typing import Annotated

from pydantic import Field

from .contracts import (AgentDefinition, Budget, ConnectionBinding, Contract, Id,
                        PermissionScope, ProviderSelection, Ref, ScheduleSpec,
                        Scope, TaskDispatchRequest, TaskDispatchView,
                        canonical_json, new_id, utc_now)
from .policy import PolicyDenied
from .store import RevisionConflict


class DefinitionDraft(Contract):
    definition_id: Id | None = None
    title: Annotated[str, Field(min_length=1, max_length=500)]
    instruction: Annotated[str, Field(min_length=1, max_length=64000)]
    desired_result: str | None = None
    provider: ProviderSelection
    permission_scope: PermissionScope = Field(default_factory=PermissionScope)
    budget: Budget = Field(default_factory=Budget)
    connection_bindings: tuple[ConnectionBinding, ...] = ()
    enabled: bool = True
    schedule: ScheduleSpec | None = None
    assistant_conversation_id: Ref | None = None
    source_message_id: Ref | None = None


class DefinitionService:
    def __init__(self, manager):
        self.manager, self.store = manager, manager.store

    def list(self, scope: Scope) -> tuple[AgentDefinition, ...]:
        self.manager.resolver.resolve(scope)
        return self.store.list_definitions(scope)

    def _source(self, scope, conversation_id, message_id):
        assistant = self.store.get_assistant(scope)
        if assistant is None or assistant.conversation_id != conversation_id:
            raise PolicyDenied("definition_activation_assistant_mismatch")
        if not any((m.get("id") or m.get("messageId") or m.get("message_id")) == message_id and m.get("role") == "user" for m in assistant.messages):
            raise PolicyDenied("definition_activation_user_message_required")

    def _capture_connections(self, scope, requested):
        from .connections import ConnectionRepository
        actual = ConnectionRepository(self.store).list(scope) if requested else ()
        captured = []
        for ref in requested:
            matches = [row for row in actual if row.status == "active" and row.capability_id == ref.capability_id and row.connection_id == ref.connection_id and (ref.binding_id is None or row.binding_id == ref.binding_id)]
            if len(matches) != 1:
                raise PolicyDenied("definition_connection_unavailable")
            row = matches[0]
            if row.connection_kind is None:
                raise PolicyDenied("definition_connection_rebind_required")
            if row.connection_kind == "provider" and "agent_reasoning" not in row.permitted_use:
                raise PolicyDenied("definition_provider_use_not_permitted")
            if row.connection_kind == "browser_account" and (row.capability_id != "browser.account" or "browser.account.use" not in row.permitted_use):
                raise PolicyDenied("definition_browser_use_not_permitted")
            captured.append(ConnectionBinding(connection_id=row.connection_id, capability_id=row.capability_id, kind=row.connection_kind, revision=row.revision, binding_id=row.binding_id, connection_revision=row.connection_revision))
        if len({row.binding_id for row in captured}) != len(captured):
            raise PolicyDenied("definition_duplicate_connection")
        return tuple(captured)

    def save(self, scope: Scope, draft: DefinitionDraft, *, client_request_id: str, expected_revision: int | None) -> AgentDefinition:
        self.manager.resolver.resolve(scope)
        draft = DefinitionDraft.model_validate_json(canonical_json(draft))
        payload = {"draft": draft.model_dump(mode="json", by_alias=True), "expectedRevision": expected_revision}
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "definition_save", client_request_id, payload)
            if cached is not None:
                return AgentDefinition.model_validate(cached)
            old = self.store.get_definition(draft.definition_id) if draft.definition_id else None
            if old and old.scope != scope:
                raise PolicyDenied("definition_scope_mismatch")
            if old and old.revision != expected_revision or not old and (draft.definition_id is not None or expected_revision is not None):
                raise RevisionConflict("Definition revision changed")
            conversation = draft.assistant_conversation_id or (old.activation_conversation_id if old else None)
            source = draft.source_message_id or (old.activation_message_id if old else None)
            if conversation or source or draft.schedule and draft.enabled:
                self._source(scope, conversation, source)
            schedule = draft.schedule
            if schedule:
                from .scheduling import validate_schedule
                validate_schedule(schedule)
                changed = not old or old.schedule is None or schedule.model_dump(exclude={"revision"}) != old.schedule.model_dump(exclude={"revision"})
                schedule = schedule.model_copy(update={"revision": old.schedule.revision + int(changed) if old and old.schedule else 1})
            profile = self.store.get_confirmed_profile(scope)
            requested_connections = list(draft.connection_bindings)
            capabilities = getattr(self.manager, "capabilities", None)
            if capabilities is not None:
                for binding in (*capabilities.capture_provider(scope, draft.provider, purpose="agent_reasoning"), *capabilities.capture_browser(scope)):
                    if not any(ref.connection_id == binding.connection_id and ref.capability_id == binding.capability_id for ref in requested_connections):
                        requested_connections.append(binding)
            captured_connections = self._capture_connections(scope, requested_connections)
            definition = AgentDefinition(definition_id=old.definition_id if old else new_id(), scope=scope, revision=old.revision + 1 if old else 1, title=draft.title, instruction=draft.instruction, desired_result=draft.desired_result, provider=draft.provider, permission_scope=draft.permission_scope, budget=draft.budget, profile_snapshot_ref=profile.profile_id if profile else None, connection_bindings=captured_connections, activation_conversation_id=conversation, activation_message_id=source, enabled=draft.enabled, schedule=schedule, created_at=old.created_at if old else utc_now())
            self.store.put_definition(definition, expected_revision=expected_revision)
            self.store.put_outbox(f"schedule:{definition.definition_id}:{definition.revision}", scope, "schedule_projection", {"definitionId": definition.definition_id, "definitionRevision": definition.revision})
            self.store.record_request_result(scope, "definition_save", client_request_id, payload, definition.model_dump(mode="json", by_alias=True))
            return definition

    def _get(self, scope, definition_id, expected_revision):
        self.manager.resolver.resolve(scope)
        definition = self.store.get_definition(definition_id)
        if definition is None or definition.scope != scope:
            raise PolicyDenied("definition_scope_mismatch")
        if definition.revision != expected_revision:
            raise RevisionConflict("Definition revision changed")
        return definition

    def start(self, scope: Scope, definition_id: str, *, client_request_id: str, expected_revision: int, expected_permission_revision: int, source_message_id: str, assistant_conversation_id: str) -> TaskDispatchView:
        payload = {"definitionId": definition_id, "expectedRevision": expected_revision, "expectedPermissionRevision": expected_permission_revision, "sourceMessageId": source_message_id, "assistantConversationId": assistant_conversation_id}
        cached = self.store.get_request_result(scope, "definition_start", client_request_id, payload)
        if cached is not None:
            self.manager.resolver.resolve(scope)
            return TaskDispatchView.model_validate(cached)
        definition = self._get(scope, definition_id, expected_revision)
        if not definition.enabled:
            raise PolicyDenied("definition_disabled")
        self._source(scope, assistant_conversation_id, source_message_id)
        request = TaskDispatchRequest(client_request_id=client_request_id, scope=scope, assistant_conversation_id=assistant_conversation_id, source_message_id=source_message_id, kind="start_agent", title=definition.title, instruction=definition.instruction, desired_result=definition.desired_result, definition_id=definition.definition_id, definition_revision=definition.revision, expected_permission_revision=expected_permission_revision)
        result = self.manager.dispatch(request, provider=definition.provider, permissions=definition.permission_scope)
        self.store.record_request_result(scope, "definition_start", client_request_id, payload, result.model_dump(mode="json", by_alias=True))
        return result

    def disable(self, scope: Scope, definition_id: str, *, client_request_id: str, expected_revision: int) -> AgentDefinition:
        payload = {"definitionId": definition_id, "expectedRevision": expected_revision}
        with self.store.transaction():
            cached = self.store.get_request_result(scope, "definition_disable", client_request_id, payload)
            if cached is not None:
                return AgentDefinition.model_validate(cached)
            old = self._get(scope, definition_id, expected_revision)
            definition = old.model_copy(update={"revision": old.revision + 1, "enabled": False})
            self.store.put_definition(definition, expected_revision=expected_revision)
            self.store.put_outbox(f"schedule:{definition_id}:{definition.revision}", scope, "schedule_projection", {"definitionId": definition_id, "definitionRevision": definition.revision})
            self.store.record_request_result(scope, "definition_disable", client_request_id, payload, definition.model_dump(mode="json", by_alias=True))
            return definition
