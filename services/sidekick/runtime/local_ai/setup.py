"""Scoped setup preferences and human-approved immutable plans in ProfileHub's DB.

Preferences are not permissions. Host authenticates actor and the explicit human
action; no renderer-supplied URL, binary path or permission object is accepted.
"""
from __future__ import annotations
import json
import re
import uuid
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Scope, Id, Ref, Utc, canonical_json, digest_json, utc_now
from runtime.independent.store import RevisionConflict
from .contracts import Preset, ModelArtifact, Sha256
from .registry import liquid_catalog


class SetupChoice(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    client_request_id: Id
    decision: Literal['local', 'skip']
    preset: Preset | None = None
    artifact_ids: tuple[Ref, ...] = ()

    @model_validator(mode='after')
    def consistent(self):
        if len(set(self.artifact_ids)) != len(self.artifact_ids):
            raise ValueError('duplicate_artifact')
        if self.decision == 'skip' and (self.preset is not None or self.artifact_ids):
            raise ValueError('skip_has_no_local_selection')
        if self.decision == 'local' and self.preset is None:
            raise ValueError('local_requires_preset')
        return self


class SetupPreferences(Contract):
    schema_version: Literal[1] = 1
    scope: Scope
    revision: Annotated[int, Field(ge=0)] = 0
    decision: Literal['undecided', 'local', 'skip'] = 'undecided'
    preset: Preset | None = None
    artifact_ids: tuple[Ref, ...] = ()
    updated_at: Utc | None = None


class InstallPlan(Contract):
    schema_version: Literal[1] = 1
    plan_id: Id
    scope: Scope
    setup_revision: Annotated[int, Field(gt=0)]
    catalog_revision: Ref
    artifacts: tuple[ModelArtifact, ...]
    total_bytes: Annotated[int, Field(ge=0)]
    created_at: Utc
    execution_unavailable: Literal[True] = True
    plan_digest: Sha256


class InstallConsent(Contract):
    scope: Scope
    plan_digest: Sha256
    license_digests: tuple[Sha256, ...]
    client_request_id: Id
    confirmed_at: Utc
    authority: Literal['private_human_action'] = 'private_human_action'


def validate_plan(plan: InstallPlan, catalog) -> None:
    if plan.plan_digest != digest_json(plan.model_dump(mode='json', by_alias=True, exclude={'plan_digest'})):
        raise ValueError('plan_digest_mismatch')
    if catalog.revision != plan.catalog_revision:
        raise ValueError('catalog_revision_changed')
    current = {item.artifact_id: item for item in catalog.artifacts}
    if not plan.artifacts or len({item.artifact_id for item in plan.artifacts}) != len(plan.artifacts):
        raise ValueError('plan_artifacts_invalid')
    total = 0
    for item in plan.artifacts:
        if current.get(item.artifact_id) != item or not item.manifest_complete or not item.revision or not item.license_digest:
            raise ValueError('artifact_manifest_changed_or_incomplete')
        if not re.fullmatch(r'[0-9a-f]{40}', item.revision) or not re.fullmatch(r'[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+', item.model_id):
            raise ValueError('artifact_repository_revision_not_pinned')
        licenses = [file for file in item.files if file.kind == 'license']
        if len(licenses) != 1 or licenses[0].sha256 != item.license_digest:
            raise ValueError('license_manifest_mismatch')
        for file in item.files:
            if file.bytes is None or file.sha256 is None:
                raise ValueError('artifact_integrity_unknown')
            # Exactly pinned known Hub artifact URL; no runtime or executable manifest.
            expected = f'https://huggingface.co/{item.model_id}/resolve/{item.revision}/{file.relative_path}'
            if file.kind == 'license':
                expected_raw = f'https://huggingface.co/{item.model_id}/raw/{item.revision}/{file.relative_path}'
                expected_page = f'https://huggingface.co/{item.model_id}/blob/{item.revision}/{file.relative_path}'
                if file.relative_path != 'LICENSE' or file.source_url not in (expected, expected_raw) \
                        or item.license_ref not in (expected, expected_raw, expected_page):
                    raise ValueError('license_manifest_mismatch')
            elif file.source_url != expected:
                raise ValueError('artifact_url_or_executable_rejected')
            if file.relative_path.lower().endswith(('.exe', '.dll', '.bat', '.cmd', '.ps1', '.py')):
                raise ValueError('artifact_url_or_executable_rejected')
            total += file.bytes
    if total != plan.total_bytes:
        raise ValueError('plan_size_mismatch')


class LocalAiSetup:
    def __init__(self, profile_hub, *, catalog_provider=liquid_catalog):
        self.profile_hub = profile_hub
        self.catalog_provider = catalog_provider

    def _store(self, scope, actor):
        store, _ = self.profile_hub.by_scope(scope, actor)
        return store

    @staticmethod
    def _flow_id(scope, suffix):
        return uuid.uuid5(uuid.NAMESPACE_URL, 'lastbrowser:local-ai:' + scope.key + ':' + suffix).hex

    def _read_flow(self, store, scope, suffix):
        row = store._one('SELECT data_json FROM ia_connection_setup_flows WHERE flow_id=? AND scope_key=? AND capability_id=?',
            (self._flow_id(scope, suffix), store._scope(scope), 'local-ai'))
        return json.loads(row[0]) if row else None

    def _write_flow(self, store, scope, suffix, value):
        store._conn.execute('INSERT INTO ia_connection_setup_flows VALUES(?,?,?,?,?,?) ON CONFLICT(flow_id) DO UPDATE SET state=excluded.state,data_json=excluded.data_json,updated_at=excluded.updated_at',
            (self._flow_id(scope, suffix), store._scope(scope), 'local-ai', suffix.split(':')[0], canonical_json(value), utc_now()))

    def read(self, scope: Scope, *, actor: str) -> SetupPreferences:
        store = self._store(scope, actor)
        return self._preferences(store, scope)

    def _preferences(self, store, scope):
        data = self._read_flow(store, scope, 'preferences')
        return SetupPreferences.model_validate(data) if data else SetupPreferences(scope=scope)

    def select(self, scope: Scope, choice: SetupChoice, *, actor: str) -> SetupPreferences:
        store = self._store(scope, actor)
        with store.transaction():
            replay = store._idempotent(scope, 'local_ai_select', choice.client_request_id, choice)
            if replay is not None:
                return SetupPreferences.model_validate(replay)
            previous = self._preferences(store, scope)
            if previous.revision != choice.expected_revision:
                raise RevisionConflict('local_ai_setup_revision_changed')
            catalog = self.catalog_provider()
            if any(identity not in {item.artifact_id for item in catalog.artifacts} for identity in choice.artifact_ids):
                raise ValueError('unknown_artifact')
            result = SetupPreferences(scope=scope, revision=previous.revision + 1, decision=choice.decision,
                preset=choice.preset, artifact_ids=choice.artifact_ids, updated_at=utc_now())
            self._write_flow(store, scope, 'preferences', result)
            store._remember(scope, 'local_ai_select', choice.client_request_id, choice, result)
            return result

    def plan(self, scope: Scope, *, actor: str, expected_revision: int, client_request_id: str) -> InstallPlan:
        request_id = SetupChoice(expected_revision=expected_revision, client_request_id=client_request_id, decision='skip').client_request_id
        request = {'expectedRevision': expected_revision, 'clientRequestId': request_id}
        store = self._store(scope, actor)
        with store.transaction():
            replay = store._idempotent(scope, 'local_ai_plan', request_id, request)
            if replay is not None:
                return InstallPlan.model_validate(replay)
            prefs = self._preferences(store, scope)
            if prefs.revision != expected_revision:
                raise RevisionConflict('local_ai_setup_revision_changed')
            if prefs.decision != 'local' or not prefs.artifact_ids:
                raise ValueError('explicit_artifact_selection_required')
            catalog = self.catalog_provider()
            by_id = {item.artifact_id: item for item in catalog.artifacts}
            artifacts = tuple(by_id[identity] for identity in prefs.artifact_ids)
            value = {'schemaVersion': 1, 'planId': uuid.uuid4().hex, 'scope': scope.model_dump(mode='json', by_alias=True),
                'setupRevision': prefs.revision, 'catalogRevision': catalog.revision,
                'artifacts': [item.model_dump(mode='json', by_alias=True) for item in artifacts],
                'totalBytes': sum(file.bytes or 0 for item in artifacts for file in item.files),
                'createdAt': utc_now(), 'executionUnavailable': True}
            result = InstallPlan.model_validate({**value, 'planDigest': digest_json(value)})
            validate_plan(result, catalog)
            self._write_flow(store, scope, 'plan:' + result.plan_digest, result)
            store._remember(scope, 'local_ai_plan', request_id, request, result)
            return result

    def get_plan(self, scope: Scope, plan_digest: str, *, actor: str) -> InstallPlan:
        store = self._store(scope, actor)
        with store.transaction(write=False):
            return self._plan(store, scope, plan_digest)

    def _plan(self, store, scope, plan_digest):
        data = self._read_flow(store, scope, 'plan:' + plan_digest)
        if not data:
            raise ValueError('plan_not_bound_to_scope')
        plan = InstallPlan.model_validate(data)
        if plan.scope != scope or plan.setup_revision != self._preferences(store, scope).revision:
            raise RevisionConflict('local_ai_setup_revision_changed')
        validate_plan(plan, self.catalog_provider())
        return plan

    def confirm_plan(self, scope: Scope, *, actor: str, plan_digest: str, license_digests: tuple[str, ...],
        client_request_id: str, private_human_action) -> InstallConsent:
        """Callback is injected by private host wiring, never serialized/request body.

        It must attest this exact scope/digest to a fresh explicit human action.
        This only confirms the displayed license, not legal redistribution rights.
        """
        store = self._store(scope, actor)
        consent = InstallConsent(scope=scope, plan_digest=plan_digest, license_digests=license_digests,
            client_request_id=client_request_id, confirmed_at=utc_now())
        request = consent.model_dump(mode='json', by_alias=True, exclude={'confirmed_at'})
        with store.transaction():
            plan = self._plan(store, scope, plan_digest)
            replay = store._idempotent(scope, 'local_ai_consent', consent.client_request_id, request)
            if replay is not None:
                return InstallConsent.model_validate(replay)
            required = tuple(sorted({item.license_digest for item in plan.artifacts}))
            if tuple(sorted(license_digests)) != required:
                raise ValueError('license_confirmation_mismatch')
            if not callable(private_human_action) or private_human_action(scope, plan_digest) is not True:
                raise PermissionError('private_explicit_human_action_required')
            self._write_flow(store, scope, 'consent:' + plan_digest, consent)
            store._remember(scope, 'local_ai_consent', consent.client_request_id, request, consent)
        return consent

    def approved_plan(self, scope: Scope, plan_digest: str, *, actor: str) -> InstallPlan:
        store = self._store(scope, actor)
        with store.transaction(write=False):
            plan = self._plan(store, scope, plan_digest)
            data = self._read_flow(store, scope, 'consent:' + plan_digest)
            if not data:
                raise PermissionError('plan_requires_explicit_consent')
            consent = InstallConsent.model_validate(data)
            if consent.scope != scope or consent.plan_digest != plan.plan_digest:
                raise PermissionError('consent_scope_or_digest_mismatch')
            return plan
