"""No external downloads: tiny in-memory responses and private temp cache only."""
import hashlib
import io
import os
from contextlib import contextmanager
from threading import Event
from types import SimpleNamespace
import pytest
from test_local_ai_setup import setup_env, approved, DATA
from runtime.local_ai.installer import LocalAiInstaller, InstallCancelled, allowed_url, StrictRedirects, _install_lock, _safe_component


class MemoryTransport:
    def __init__(self, *, corrupt=False, cancel=None, extra=False, wrong_range=False):
        self.calls = []; self.corrupt = corrupt; self.cancel = cancel; self.extra = extra; self.wrong_range = wrong_range

    @contextmanager
    def open(self, url, offset):
        name = url.rsplit('/', 1)[1]; value = DATA[name]
        self.calls.append((name, offset))
        if self.corrupt: value = b'x' * len(value)
        if self.extra: value += b'x'
        response = io.BytesIO(value[offset:]); response.status = 206 if offset else 200
        response.headers = {'Content-Range': f'bytes {offset + int(self.wrong_range)}-{len(DATA[name])-1}/{len(DATA[name])}'} if offset else {}
        if self.cancel:
            original = response.read
            def read(n):
                data = original(min(n, 5)); self.cancel.set(); return data
            response.read = read
        yield response


def target(cache, plan, name='tiny.gguf'):
    identity = hashlib.sha256(plan.artifacts[0].artifact_id.encode()).hexdigest()
    return cache / plan.plan_digest / identity / name


def test_small_install_atomic_verified_idempotent_no_runtime_claim(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); transport = MemoryTransport()
    installer = LocalAiInstaller(service, lambda _: cache, transport=transport)
    result = installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    assert result.execution_unavailable and result.verified_bytes == sum(map(len, DATA.values()))
    assert target(cache, plan).read_bytes() == DATA['tiny.gguf']
    assert not target(cache, plan).with_name('tiny.gguf.partial').exists()
    installer.disk_usage = lambda _: SimpleNamespace(free=0)
    assert installer.install(scope, actor='default', plan_digest=plan.plan_digest) == result
    assert len(transport.calls) == 2


def test_own_cancel_resumes_exact_partial_without_new_consent(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); cancel = Event()
    transport = MemoryTransport(cancel=cancel)
    with pytest.raises(InstallCancelled):
        LocalAiInstaller(service, lambda _: cache, transport=transport).install(scope, actor='default', plan_digest=plan.plan_digest, cancel=cancel)
    assert not target(cache, plan).exists()
    assert target(cache, plan).with_name('tiny.gguf.partial').stat().st_size == 5
    again = MemoryTransport()
    LocalAiInstaller(service, lambda _: cache, transport=again).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert again.calls[0] == ('tiny.gguf', 5)


@pytest.mark.parametrize('option', ['corrupt', 'extra'])
def test_hash_and_size_fail_closed_before_atomic_publish(setup_env, option):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    with pytest.raises(ValueError):
        LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport(**{option: True})).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert not target(cache, plan).exists()


def test_existing_corrupt_file_never_overwritten(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); transport = MemoryTransport()
    installer = LocalAiInstaller(service, lambda _: cache, transport=transport)
    installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    target(cache, plan).write_bytes(b'corrupt')
    with pytest.raises(ValueError): installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    assert target(cache, plan).read_bytes() == b'corrupt' and len(transport.calls) == 2


def test_disk_and_foreign_scope_fail_before_network(setup_env):
    service, scope, other, cache, _ = setup_env; plan = approved(service, scope); transport = MemoryTransport()
    installer = LocalAiInstaller(service, lambda _: cache, transport=transport, disk_usage=lambda _: SimpleNamespace(free=0))
    with pytest.raises(ValueError): installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    with pytest.raises(ValueError): installer.install(other, actor='default', plan_digest=plan.plan_digest)
    assert not transport.calls


def test_hardlinked_cache_file_is_rejected(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    installer = LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport())
    installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    os.link(target(cache, plan), cache / 'second-link')
    with pytest.raises(ValueError, match='hardlink'): installer.install(scope, actor='default', plan_digest=plan.plan_digest)


def test_resume_range_mismatch_keeps_partial_unpublished(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); cancel = Event()
    with pytest.raises(InstallCancelled):
        LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport(cancel=cancel)).install(scope, actor='default', plan_digest=plan.plan_digest, cancel=cancel)
    with pytest.raises(ValueError, match='range'):
        LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport(wrong_range=True)).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert not target(cache, plan).exists()


def test_native_lock_blocks_duplicate_installer_and_releases(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope)
    directory = cache / plan.plan_digest; directory.mkdir()
    installer = LocalAiInstaller(service, lambda _: cache, transport=MemoryTransport())
    with _install_lock(directory / '.install.lock'):
        with pytest.raises(OSError): installer.install(scope, actor='default', plan_digest=plan.plan_digest)
    assert installer.install(scope, actor='default', plan_digest=plan.plan_digest).execution_unavailable


@pytest.mark.parametrize('part', ['CON', 'NUL.gguf', 'COM1', 'LPT9.txt', 'trailing.', '..', 'x:y'])
def test_windows_special_components_rejected(part):
    assert not _safe_component(part)


def test_cancelled_event_never_starts_transport(setup_env):
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); cancel = Event(); cancel.set()
    transport = MemoryTransport()
    with pytest.raises(InstallCancelled):
        LocalAiInstaller(service, lambda _: cache, transport=transport).install(scope, actor='default', plan_digest=plan.plan_digest, cancel=cancel)
    assert not transport.calls


def test_cache_reparse_detection_blocks_before_transport(setup_env, monkeypatch):
    import pathlib
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); transport = MemoryTransport()
    original = pathlib.Path.lstat
    def reparse_info(path, *args, **kwargs):
        info = original(path, *args, **kwargs)
        if path == cache:
            return SimpleNamespace(st_mode=info.st_mode, st_file_attributes=0x400)
        return info
    monkeypatch.setattr(pathlib.Path, 'lstat', reparse_info)
    with pytest.raises(ValueError, match='reparse'):
        LocalAiInstaller(service, lambda _: cache, transport=transport).install(scope, actor='default', plan_digest=plan.plan_digest)
    assert not transport.calls


def test_native_junction_cache_is_rejected(setup_env):
    import subprocess
    service, scope, _, cache, _ = setup_env; plan = approved(service, scope); transport = MemoryTransport()
    if os.name != 'nt': pytest.skip('Windows junction check')
    junction = cache.parent / 'controlled-junction'
    try:
        result = subprocess.run(['cmd.exe', '/d', '/c', 'mklink', '/J', str(junction), str(cache)],
            capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=5)
        if result.returncode: pytest.skip('junction creation unavailable in this test environment')
        with pytest.raises(ValueError, match='reparse'):
            LocalAiInstaller(service, lambda _: junction, transport=transport).install(scope, actor='default', plan_digest=plan.plan_digest)
        assert not transport.calls
    finally:
        if junction.exists(): junction.rmdir()  # remove only the test junction, never its target


@pytest.mark.parametrize('url', ['http://huggingface.co/file', 'https://huggingface.co.evil.test/file', 'https://user:pass@huggingface.co/file', 'https://huggingface.co:444/file', 'https://evil.test/file'])
def test_origin_and_redirect_allowlist(url):
    with pytest.raises(ValueError): allowed_url(url)
    with pytest.raises(ValueError): StrictRedirects().redirect_request(None, None, 302, '', {}, url)
