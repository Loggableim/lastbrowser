"""Bootstrap job lifecycle tests. These fixtures never fetch model weights."""
import uuid
from threading import Event
from urllib.error import URLError
import pytest

from runtime.local_ai.installer import InstallCancelled
from runtime.local_ai.router_bootstrap_download import (
    BOOTSTRAP_POLICY_ID, BOOTSTRAP_TOTAL_BYTES, LocalAiBootstrapManager,
)


class FixtureInstaller:
    def __init__(self, outcome='success', entered=None):
        self.outcome, self.entered = outcome, entered

    def install_bootstrap(self, artifact, cache_root, *, policy_id, cancel, progress):
        assert policy_id == BOOTSTRAP_POLICY_ID
        assert artifact.artifact_id == 'LiquidAI/LFM2.5-230M-GGUF:LFM2.5-230M-QAD-Q4_0'
        if self.entered: self.entered.set()
        if self.outcome == 'offline': raise URLError('offline fixture')
        if self.outcome == 'cancel':
            while not cancel.wait(.01): pass
            raise InstallCancelled('installation_cancelled')
        progress({'stage':'downloading','downloadedBytes':BOOTSTRAP_TOTAL_BYTES,'verifiedBytes':0})
        progress({'stage':'verifying','downloadedBytes':BOOTSTRAP_TOTAL_BYTES,'verifiedBytes':BOOTSTRAP_TOTAL_BYTES})
        return BOOTSTRAP_TOTAL_BYTES


def manager(tmp_path, installer):
    state = tmp_path / 'state'; state.mkdir()
    cache = tmp_path / 'cache'; cache.mkdir()
    return LocalAiBootstrapManager(state, cache,
        installer_factory=lambda _setup, _cache: installer)


def wait(manager):
    if manager._worker: manager._worker.join(2)
    assert manager._worker is None


def test_first_run_start_is_durable_idempotent_and_verifies_both_files(tmp_path):
    entered = Event(); installer = FixtureInstaller(entered=entered); job = manager(tmp_path, installer)
    first = job.handle({'action':'start','clientRequestId':str(uuid.uuid4())})
    assert first.state == 'pending' and entered.wait(1)
    same = job.handle({'action':'start','clientRequestId':str(uuid.uuid4())})
    assert same.job_id == first.job_id
    wait(job)
    complete = job.handle({'action':'status'})
    assert complete.state == 'complete' and complete.verified_bytes == BOOTSTRAP_TOTAL_BYTES
    assert complete.execution_unavailable is True
    restarted = LocalAiBootstrapManager(job.state_root, job.cache_root,
        installer_factory=lambda *_: (_ for _ in ()).throw(AssertionError('must not redownload')))
    assert restarted.handle({'action':'status'}).state == 'complete'


def test_cancelled_bootstrap_stays_cancelled_across_restart(tmp_path):
    entered = Event(); job = manager(tmp_path, FixtureInstaller('cancel', entered))
    started = job.handle({'action':'start','clientRequestId':str(uuid.uuid4())})
    assert entered.wait(1)
    cancelling = job.handle({'action':'cancel','jobId':started.job_id,'clientRequestId':str(uuid.uuid4())})
    assert cancelling.state == 'cancelling'
    wait(job)
    cancelled = job.handle({'action':'status'})
    assert cancelled.state == 'cancelled'
    assert job.auto_start().state == 'cancelled'


def test_offline_retries_are_bounded_and_request_replay_is_idempotent(tmp_path):
    calls = []
    class Offline:
        def install_bootstrap(self, *args, **kwargs):
            calls.append(True); raise URLError('offline fixture')
    job = manager(tmp_path, Offline())
    first_request = str(uuid.uuid4())
    started = job.handle({'action':'start','clientRequestId':first_request})
    wait(job)
    assert job.handle({'action':'start','clientRequestId':first_request}).state == 'offline'
    assert job.auto_start().attempt == 2
    wait(job)
    assert job.auto_start().attempt == 3
    wait(job)
    assert job.auto_start().attempt == 3
    assert len(calls) == 3


@pytest.mark.parametrize('operation', [
    'localAi.bootstrap', 'localAi.roleProfile', 'localAi.store', 'localAi.setup',
    'localAi.runtime', 'localAi.catalog', 'localAi.recommend',
])
def test_reduced_test_build_fails_closed_for_bundled_local_ai_operations(operation):
    from web.api import independent
    request = independent.OperationRequest(scope=None, payload={})
    with pytest.raises(ValueError, match='local_ai_unavailable_in_test_build'):
        independent.dispatch_operation(operation, request, 'default')
