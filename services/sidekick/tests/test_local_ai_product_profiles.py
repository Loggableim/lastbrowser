"""Real scoped role persistence; pinned metadata, no weights or runtime processes."""
import uuid
import pytest
from runtime.independent.contracts import digest_json
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import RevisionConflict, IdempotencyConflict
from runtime.local_ai.registry import liquid_catalog
from runtime.local_ai.setup import LocalAiSetup, SetupChoice
from runtime.local_ai.product_profiles import LocalAiProductProfiles, ConfirmRoleProfile, TaskSelection
from test_local_ai_setup import setup_env
from test_local_ai_model_adapters import manifest


@pytest.fixture
def role_env(setup_env):
    setup, scope, other, _, home = setup_env
    setup.catalog_provider = liquid_catalog
    artifacts = liquid_catalog().artifacts
    extract = next(a for a in artifacts if 'extract' in a.roles)
    agent = next(a for a in artifacts if 'agent' in a.roles)
    setup.select(scope, SetupChoice(expected_revision=0, client_request_id=uuid.uuid4().hex,
        decision='local', preset='custom', artifact_ids=(extract.artifact_id, agent.artifact_id)), actor='default')
    plan = setup.plan(scope, actor='default', expected_revision=1, client_request_id=uuid.uuid4().hex)
    setup.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest,
        license_digests=tuple(sorted({a.license_digest for a in plan.artifacts})),
        client_request_id=uuid.uuid4().hex, private_human_action=lambda *_: True)
    profiles = LocalAiProductProfiles(setup.profile_hub, None, setup=setup, manifest_provider=manifest)
    choice = ConfirmRoleProfile(expected_revision=0, setup_revision=1, plan_digest=plan.plan_digest,
        client_request_id=uuid.uuid4().hex,
        selections=(TaskSelection(task='browser.extract', artifact_id=extract.artifact_id),))
    return profiles, choice, scope, other, home, agent


def confirm(profiles, scope, choice, callback=None):
    expected = digest_json({'actor': 'default', 'choice': choice.model_dump(mode='json', by_alias=True)})
    return profiles.confirm(scope, choice, actor='default',
        private_human_action=callback or (lambda actual, digest: actual == scope and digest == expected))


def test_chat_profile_context_is_capped_at_1024():
    with pytest.raises(Exception, match='bounded_chat_context_must_be_1024'):
        TaskSelection(task='chat.answer', artifact_id='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0', context_tokens=2048)
    with pytest.raises(Exception, match='bounded_chat_context_must_be_1024'):
        TaskSelection(task='chat.answer', artifact_id='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0', context_tokens=512)
    assert TaskSelection(task='chat.answer', artifact_id='LiquidAI/LFM2.5-350M-GGUF:LFM2.5-350M-QAD-Q4_0', context_tokens=1024)


def test_durable_reopen_replay_original_scope_and_no_permissions(role_env):
    profiles, choice, scope, other, home, _ = role_env
    store = profiles.setup._store(scope, 'default')
    permissions = store.get_permission_state(scope)
    first = confirm(profiles, scope, choice)
    assert first.revision == 1 and first.available is False
    assert confirm(profiles, scope, choice, lambda *_: pytest.fail('replay must not ask again')) == first
    assert profiles.read(other, actor='default').revision == 0
    assert store.get_permission_state(scope) == permissions
    profiles.hub.close()
    reopened = ProfileHub(home, default_state_dir=home / 'webui')
    try:
        again = LocalAiProductProfiles(reopened, None, setup=LocalAiSetup(reopened), manifest_provider=manifest)
        assert again.read(scope, actor='default') == first
        assert confirm(again, scope, choice) == first
    finally:
        reopened.close()


def test_actual_draft_blocks_agent_and_requires_private_human_action(role_env):
    profiles, choice, scope, _, _, agent = role_env
    draft = profiles.draft(scope, actor='default', plan_digest=choice.plan_digest)
    assert draft['available'] is False
    assert any(row['task'] == 'browser.extract' and row['state'] == 'prepared' for row in draft['choices'])
    assert any(row['task'] == 'agent' and row['state'] == 'blocked' for row in draft['choices'])
    with pytest.raises(PermissionError): confirm(profiles, scope, choice, lambda *_: False)
    assert profiles.read(scope, actor='default').revision == 0
    blocked = choice.model_copy(update={'selections': (TaskSelection(task='agent', artifact_id=agent.artifact_id),)})
    with pytest.raises(ValueError, match='agent_64k'): confirm(profiles, scope, blocked)


def test_revision_conflict_and_reused_request_cannot_change_tasks(role_env):
    profiles, choice, scope, _, _, _ = role_env
    confirm(profiles, scope, choice)
    with pytest.raises(RevisionConflict):
        confirm(profiles, scope, choice.model_copy(update={'client_request_id': uuid.uuid4().hex}))
    changed = choice.model_copy(update={'selections': (choice.selections[0].model_copy(update={'context_tokens': 1024}),)})
    with pytest.raises(IdempotencyConflict): confirm(profiles, scope, changed)


def test_setup_change_disables_old_binding_even_after_profile_reopen(role_env):
    profiles, choice, scope, _, _, _ = role_env
    saved = confirm(profiles, scope, choice)
    profiles.setup.select(scope, SetupChoice(expected_revision=1, client_request_id=uuid.uuid4().hex, decision='skip'), actor='default')
    assert profiles.read(scope, actor='default') == saved
    with pytest.raises(RevisionConflict):
        profiles.resolve(scope, 'default', 'browser.extract', existing_owner='controlled-core', core_generation=1)
    with pytest.raises(RevisionConflict): confirm(profiles, scope, choice)


def test_receipt_failure_rolls_back_actual_role_profile(role_env, monkeypatch):
    profiles, choice, scope, _, _, _ = role_env
    store = profiles.setup._store(scope, 'default')
    def crash(*_): raise RuntimeError('controlled receipt failure')
    monkeypatch.setattr(store, '_remember', crash)
    with pytest.raises(RuntimeError): confirm(profiles, scope, choice)
    assert profiles.read(scope, actor='default').revision == 0


def test_foreign_space_cannot_confirm_or_resolve_original_plan(role_env):
    profiles, choice, scope, other, _, _ = role_env
    confirm(profiles, scope, choice)
    with pytest.raises((PermissionError, ValueError, RevisionConflict)):
        confirm(profiles, other, choice)
    with pytest.raises(PermissionError):
        profiles.resolve(other, 'default', 'browser.extract', existing_owner='controlled-core', core_generation=1)
    assert profiles.read(other, actor='default').revision == 0
