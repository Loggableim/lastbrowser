"""Real ProfileHub DB persistence, using only isolated synthetic homes/artifacts."""
import hashlib
import json
import uuid
import pytest
from pydantic import ValidationError
from runtime.independent.contracts import Scope
from runtime.independent.scope_binding import ProfileHub
from runtime.independent.store import RevisionConflict, IdempotencyConflict
from runtime.local_ai.contracts import ArtifactFile, ModelArtifact, CatalogSnapshot
from runtime.local_ai.setup import LocalAiSetup, SetupChoice, validate_plan

DATA = {'tiny.gguf': b'controlled small weights', 'LICENSE': b'controlled license text'}


def catalog():
    revision = 'a' * 40; repo = 'Controlled/Test-GGUF'
    files = tuple(ArtifactFile(relative_path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
        source_url=f'https://huggingface.co/{repo}/resolve/{revision}/{name}', kind='license' if name == 'LICENSE' else 'weights')
        for name, data in DATA.items())
    model = ModelArtifact(artifact_id=repo + ':q4', provider='controlled', model_id=repo, revision=revision,
        format='gguf', quantization='q4', architecture=None, roles=('extract',), files=files, manifest_complete=True,
        license_ref=files[1].source_url, license_digest=files[1].sha256)
    return CatalogSnapshot(revision='controlled-catalog-1', observed_at='2026-10-04T01:00:00Z', artifacts=(model,))


@pytest.fixture
def setup_env(tmp_path):
    home = tmp_path / 'home'; home.mkdir(); state = home / 'webui'; state.mkdir()
    work = tmp_path / 'work'; work.mkdir(); other = tmp_path / 'other'; other.mkdir()
    (state / 'workspaces.json').write_text(json.dumps([{'path': str(work), 'name': 'Work'}, {'path': str(other), 'name': 'Other'}]))
    hub = ProfileHub(home, default_state_dir=state)
    scope = Scope.model_validate(hub.bind('default', {'workspacePath': str(work), 'browserProfileId': 'browser', 'partitionKey': 'persist:test-work'})['scope'])
    scope2 = Scope.model_validate(hub.bind('default', {'workspacePath': str(other), 'browserProfileId': 'browser', 'partitionKey': 'persist:test-other'})['scope'])
    cache = tmp_path / 'cache'; cache.mkdir()
    service = LocalAiSetup(hub, catalog_provider=catalog)
    yield service, scope, scope2, cache, home
    hub.close()


def choose(service, scope):
    choice = SetupChoice(expected_revision=0, client_request_id=uuid.uuid4().hex, decision='local',
        preset='lightweight', artifact_ids=(catalog().artifacts[0].artifact_id,))
    return service.select(scope, choice, actor='default'), choice


def approved(service, scope):
    prefs, _ = choose(service, scope)
    plan = service.plan(scope, actor='default', expected_revision=prefs.revision, client_request_id=uuid.uuid4().hex)
    service.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest,
        license_digests=(catalog().artifacts[0].license_digest,), client_request_id=uuid.uuid4().hex,
        private_human_action=lambda actual_scope, digest: actual_scope == scope and digest == plan.plan_digest)
    return plan


def test_cas_durable_replay_scope_isolation_and_no_permission_grant(setup_env):
    service, scope, scope2, _, _ = setup_env
    store, _ = service.profile_hub.by_scope(scope, 'default')
    permission = store.get_permission_state(scope)
    first, choice = choose(service, scope)
    assert service.select(scope, choice, actor='default') == first
    assert service.read(scope2, actor='default').revision == 0
    assert store.get_permission_state(scope) == permission
    with pytest.raises(RevisionConflict):
        service.select(scope, choice.model_copy(update={'client_request_id': uuid.uuid4().hex}), actor='default')
    with pytest.raises(IdempotencyConflict):
        service.select(scope, choice.model_copy(update={'preset': 'balanced'}), actor='default')
    store._conn.execute('CREATE TABLE user_preservation(value TEXT)')
    store._conn.execute("INSERT INTO user_preservation VALUES('preserved')")
    assert store._conn.execute('SELECT value FROM user_preservation').fetchone()[0] == 'preserved'


def test_prefs_and_consent_survive_real_hub_reopen(setup_env):
    service, scope, _, _, home = setup_env
    plan = approved(service, scope)
    service.profile_hub.close()
    reopened = ProfileHub(home, default_state_dir=home / 'webui')
    try:
        again = LocalAiSetup(reopened, catalog_provider=catalog)
        assert again.read(scope, actor='default').revision == 1
        assert again.approved_plan(scope, plan.plan_digest, actor='default') == plan
    finally: reopened.close()


def test_plan_does_not_grant_consent_and_is_exact_digest_bound(setup_env):
    service, scope, _, _, _ = setup_env
    choose(service, scope)
    request = uuid.uuid4().hex
    plan = service.plan(scope, actor='default', expected_revision=1, client_request_id=request)
    assert service.plan(scope, actor='default', expected_revision=1, client_request_id=request) == plan
    assert plan.execution_unavailable and plan.total_bytes == sum(map(len, DATA.values()))
    with pytest.raises(PermissionError): service.approved_plan(scope, plan.plan_digest, actor='default')
    with pytest.raises(PermissionError):
        service.confirm_plan(scope, actor='default', plan_digest=plan.plan_digest, license_digests=(catalog().artifacts[0].license_digest,),
            client_request_id=uuid.uuid4().hex, private_human_action=lambda *_: False)
    with pytest.raises(ValueError): validate_plan(plan.model_copy(update={'total_bytes': 999}), catalog())


def test_changed_setup_invalidates_prior_consent_and_skip_is_no_auth_claim(setup_env):
    service, scope, _, _, _ = setup_env
    plan = approved(service, scope)
    skipped = service.select(scope, SetupChoice(expected_revision=1, client_request_id=uuid.uuid4().hex, decision='skip'), actor='default')
    assert skipped.preset is None and skipped.artifact_ids == ()
    with pytest.raises(RevisionConflict): service.approved_plan(scope, plan.plan_digest, actor='default')


def test_receipt_failure_rolls_back_preferences_atomically(setup_env, monkeypatch):
    service, scope, _, _, _ = setup_env
    store, _ = service.profile_hub.by_scope(scope, 'default')
    def crash(*args): raise RuntimeError('controlled receipt failure')
    monkeypatch.setattr(store, '_remember', crash)
    with pytest.raises(RuntimeError): choose(service, scope)
    assert service.read(scope, actor='default').revision == 0


def test_concurrent_cas_has_one_winner(setup_env):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    service, scope, _, _, _ = setup_env; barrier = Barrier(2)
    def select():
        barrier.wait(timeout=5)
        try: return choose(service, scope)[0].revision
        except RevisionConflict: return 'stale'
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(select) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(map(str, results)) == ['1', 'stale']


def test_consent_replays_without_second_human_prompt_and_checks_license(setup_env):
    service, scope, _, _, _ = setup_env; plan = approved(service, scope)
    request = uuid.uuid4().hex; calls = []
    kwargs = {'actor': 'default', 'plan_digest': plan.plan_digest, 'license_digests': (plan.artifacts[0].license_digest,),
        'client_request_id': request, 'private_human_action': lambda *_: calls.append(True) or True}
    first = service.confirm_plan(scope, **kwargs)
    assert service.confirm_plan(scope, **kwargs) == first and calls == [True]
    with pytest.raises(ValueError):
        service.confirm_plan(scope, **{**kwargs, 'client_request_id': uuid.uuid4().hex, 'license_digests': ('0' * 64,)})


@pytest.mark.parametrize('field', ['permission', 'url', 'exePath', 'cloudConnectionVerified'])
def test_choice_rejects_renderer_authority(field):
    with pytest.raises(ValidationError): SetupChoice.model_validate({'expectedRevision': 0, 'clientRequestId': uuid.uuid4().hex, 'decision': 'skip', field: 'forged'})
