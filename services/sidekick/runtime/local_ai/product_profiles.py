"""Confirmed scoped task bindings; preferences never imply runtime availability."""
from __future__ import annotations
from typing import Annotated, Literal
from pydantic import Field, model_validator
from runtime.independent.contracts import Contract, Scope, Ref, Id, Utc, digest_json, utc_now
from runtime.independent.store import RevisionConflict
from .contracts import Sha256
from .setup import LocalAiSetup
from .role_pipeline import Task, TASK_ROLES, ScopedRoleBinding
from .model_manager import ModelLoadRequest
from .model_adapters import model_adapter_plan
from .runtime_bundle import private_cpu_manifest


class TaskSelection(Contract):
    task: Task
    artifact_id: Ref
    context_tokens: Annotated[int, Field(ge=128, le=4096)] = 2048

    @model_validator(mode='after')
    def task_context_bound(self):
        if self.task == 'chat.answer' and self.context_tokens != 1024:
            raise ValueError('bounded_chat_context_must_be_1024')
        return self


class ConfirmRoleProfile(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    setup_revision: Annotated[int, Field(gt=0)]
    plan_digest: Sha256
    client_request_id: Id
    selections: tuple[TaskSelection, ...]

    @model_validator(mode='after')
    def unique_tasks(self):
        if not self.selections or len(self.selections) > len(TASK_ROLES):
            raise ValueError('local_role_selection_required')
        if len({s.task for s in self.selections}) != len(self.selections):
            raise ValueError('duplicate_local_role_task')
        return self


class RoleProfile(Contract):
    scope: Scope
    revision: Annotated[int, Field(ge=0)] = 0
    setup_revision: Annotated[int, Field(ge=0)] = 0
    plan_digest: Sha256 | None = None
    actor: Ref | None = None
    selections: tuple[TaskSelection, ...] = ()
    artifact_revisions: dict[str, Ref] = Field(default_factory=dict)
    confirmed_at: Utc | None = None
    available: Literal[False] = False

    @property
    def profile_revision(self):
        return 'local-role-profile-' + str(self.revision)


class LocalAiProductProfiles:
    def __init__(self, hub, scans, *, setup=None, manifest_provider=private_cpu_manifest):
        self.hub, self.scans = hub, scans
        self.setup = setup or LocalAiSetup(hub)
        self.manifest_provider = manifest_provider

    def _read(self, store, scope):
        value = self.setup._read_flow(store, scope, 'product-role-profile')
        profile = RoleProfile.model_validate(value) if value else RoleProfile(scope=scope)
        if profile.scope != scope: raise PermissionError('local_role_profile_scope_changed')
        return profile

    def read(self, scope, *, actor):
        store = self.setup._store(scope, actor)
        with store.transaction(write=False):
            return self._read(store, scope)

    def _selection_artifacts(self, plan, selections):
        manifest = self.manifest_provider()
        artifacts = {a.artifact_id: a for a in plan.artifacts}
        revisions = {}
        for selection in selections:
            artifact = artifacts.get(selection.artifact_id)
            if artifact is None: raise ValueError('local_role_artifact_not_in_approved_plan')
            adapter = model_adapter_plan(artifact, TASK_ROLES[selection.task], manifest)
            if adapter.state != 'prepared': raise ValueError(adapter.reason_codes[0])
            revisions[artifact.artifact_id] = artifact.revision
        return revisions

    def draft(self, scope, *, actor, plan_digest):
        """Read-only choices from the actual approved plan, with explicit blockers."""
        plan = self.setup.approved_plan(scope, plan_digest, actor=actor)
        manifest = self.manifest_provider()
        profile = self.read(scope, actor=actor)
        choices = []
        for task, role in TASK_ROLES.items():
            for artifact in plan.artifacts:
                if role not in artifact.roles: continue
                adapter = model_adapter_plan(artifact, role, manifest)
                choices.append({'task':task, 'artifactId':artifact.artifact_id,
                    'artifactRevision':artifact.revision, 'state':adapter.state,
                    'reasonCodes':list(adapter.reason_codes), 'available':False})
        return {'scope':scope.model_dump(mode='json', by_alias=True),
            'expectedRevision':profile.revision, 'profileRevision':profile.profile_revision,
            'setupRevision':plan.setup_revision, 'planDigest':plan.plan_digest,
            'choices':choices, 'available':False}

    def confirm(self, scope, choice: ConfirmRoleProfile, *, actor, private_human_action):
        choice = choice if isinstance(choice, ConfirmRoleProfile) else ConfirmRoleProfile.model_validate(choice)
        store = self.setup._store(scope, actor)
        with store.transaction():
            plan = self.setup.approved_plan(scope, choice.plan_digest, actor=actor)
            if plan.setup_revision != choice.setup_revision:
                raise RevisionConflict('local_ai_setup_revision_changed')
            request = {'actor':actor, 'choice':choice.model_dump(mode='json', by_alias=True)}
            replay = store._idempotent(scope, 'local_ai_role_profile_confirm', choice.client_request_id, request)
            if replay is not None: return RoleProfile.model_validate(replay)
            previous = self._read(store, scope)
            if previous.revision != choice.expected_revision:
                raise RevisionConflict('local_role_profile_revision_changed')
            revisions = self._selection_artifacts(plan, choice.selections)
            digest = digest_json(request)
            if not callable(private_human_action) or private_human_action(scope, digest) is not True:
                raise PermissionError('private_explicit_human_action_required')
            result = RoleProfile(scope=scope, revision=previous.revision+1,
                setup_revision=plan.setup_revision, plan_digest=plan.plan_digest, actor=actor,
                selections=choice.selections, artifact_revisions=revisions, confirmed_at=utc_now())
            self.setup._write_flow(store, scope, 'product-role-profile', result)
            store._remember(scope, 'local_ai_role_profile_confirm', choice.client_request_id, request, result)
            return result

    def resolve(self, scope, actor, task: Task, *, existing_owner, core_generation):
        """Owner/generation must come from the executing Core context, never IPC."""
        store = self.setup._store(scope, actor)
        with store.transaction(write=False):
            profile = self._read(store, scope)
            if profile.actor != actor or not profile.confirmed_at or not profile.plan_digest:
                raise PermissionError('local_role_profile_not_confirmed')
            plan = self.setup.approved_plan(scope, profile.plan_digest, actor=actor)
            if profile.setup_revision != plan.setup_revision:
                raise RevisionConflict('local_role_profile_setup_changed')
            selection = next((s for s in profile.selections if s.task == task), None)
            if selection is None: raise ValueError('local_task_not_selected')
            revisions = self._selection_artifacts(plan, (selection,))
            if any(profile.artifact_revisions.get(k) != v for k,v in revisions.items()):
                raise RevisionConflict('local_role_artifact_revision_changed')
            manifest = self.manifest_provider()
            binary = next(f for f in manifest.files if f.kind == 'binary')
            # Trusted store only. read() validates scope and <=30-second freshness.
            with self.scans._lock:
                candidates = sorted((s for s in self.scans._scans.values() if s.scope == scope),
                    key=lambda s:s.hardware.observed_at, reverse=True)
                if not candidates: raise ValueError('local_role_fresh_hardware_scan_required')
                scan = self.scans.read(scope, candidates[0].hardware.scan_id)
            load = ModelLoadRequest(scope=scope, plan_digest=plan.plan_digest,
                artifact_id=selection.artifact_id, artifact_revision=revisions[selection.artifact_id],
                runtime_build_ref=manifest.build_ref, runtime_sha256=binary.sha256,
                role=TASK_ROLES[task], context_tokens=selection.context_tokens, parallel_requests=1,
                existing_compute_owner_key=existing_owner, admission_generation=core_generation,
                scan_id=scan.hardware.scan_id)
            return ScopedRoleBinding(actor=actor, profile_revision=profile.profile_revision, task=task, load=load)
